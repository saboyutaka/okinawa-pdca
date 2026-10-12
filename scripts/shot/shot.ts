// 書き出したサイト（site/dist）のスクリーンショットを、PC 幅とスマホ幅で撮る。
//
// 使い方（コンテナ shot の中で動かす。先に make build）:
//   make shot                                    # トップを PC 幅（1280px）とスマホ幅（390px）で
//   make shot PAGES="/ /shisaku/1-1-a-1/"        # ページを並べる
//   make shot PAGES="/torikumi/ --dark --top"    # ダーク・最初の画面だけ
//   make shot PAGES="/shisaku/1-1-a-1/ --selector .scard"       # 最初に当たる要素だけ
//   make shot PAGES="/shisaku/1-1-a-1/ --at '#torikumi'"        # その要素まで # で跳んだときの画面（上に貼り付く目次を見る）
//
// PAGES はシェルにそのまま渡るので、# や & を含むもの（セレクタ・クエリ）は ' で囲む。
//
// - site/dist をこの中で配信して撮る（開発サーバーは要らない）。Cloudflare と同じく、無いページは 404.html を
//   404 で返し、ディレクトリは末尾に / を付けた URL へ転送する。--base で動いているサーバー（Cloudflare の
//   プレビューなど）も撮れる。開発サーバー（make dev）は Vite がホスト名 site からの読み込みを断る
//   （server.allowedHosts）ので撮れない
// - 書き出し先は tmp/shots/<ページ>[@<セレクタ>][~<--at のセレクタ>]-<幅>[-dark].png（git に入れない）。初めはページ全体を撮る
// - ページ全体の画像は縦に長い。画像を読ませて確かめるときは --top や --selector で範囲をしぼる
// - スマホ幅（768px 未満）はタッチの端末として開く（:hover の見た目にならない）
// - ページの読み込みに失敗したとき・ブラウザでスクリプトのエラーが出たときは表示して、終了コード1。ただし、Cloudflare が
//   配信のときに差し込むボット検出のスクリプトがページの CSP に止められたエラーは数えない（--base で本番を撮るときに出る。
//   docs/deploy.md の 3章）
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Page } from 'playwright';

const HELP = `使い方: node scripts/shot/shot.ts [ページのパス ...] [オプション]
  --width <px>       画面の幅（何度でも。初めは 1280 と 390）
  --dark             ダークで撮る
  --top              ページ全体ではなく最初の画面だけ撮る
  --selector <css>   この CSS セレクタに最初に当たる要素だけ撮る
  --at <css>         この CSS セレクタに最初に当たる要素まで、# のリンクと同じようにスクロールしてから、その画面を撮る
  --scale <倍率>     画素の倍率（2 で高精細の端末と同じ細かさ。初めは 1）
  --base <url>       撮るサーバーの URL（初めは --dist をこの中で配信する）
  --dist <dir>       配信するフォルダ（初めは site/dist）
  --out <dir>        書き出し先（初めは tmp/shots）`;

// スマホ幅は iPhone の画面の高さ。ほかは 800
const HEIGHTS: Record<number, number> = { 390: 844 };

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

async function isFile(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null))?.isFile() ?? false;
}

// dist を配信して、その URL を返す
async function serve(dist: string): Promise<{ base: string; close: () => void }> {
  const root = resolve(dist);
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    const file = join(root, decodeURIComponent(pathname));
    let status = 200;
    let target = file;
    if (file !== root && !file.startsWith(root + sep)) {
      status = 404;
      target = join(root, '404.html');
    } else if (pathname.endsWith('/')) {
      target = join(file, 'index.html');
    } else if (await isFile(join(file, 'index.html'))) {
      res.writeHead(301, { location: pathname + '/' }).end();
      return;
    }
    if (!(await isFile(target))) {
      status = 404;
      target = join(root, '404.html');
    }
    res.writeHead(status, { 'content-type': TYPES[extname(target)] ?? 'application/octet-stream' });
    createReadStream(target).pipe(res);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}

// Cloudflare のボット検出（JavaScript detections）が差し込むインラインのスクリプトの CSP のハッシュ（'sha256-…'）。
// 中身にリクエストごとの値が入るのでページの CSP では許せず、止められる。そのスクリプトを名指ししたエラーだけを見分けるのに使う
async function cloudflareScriptHashes(page: Page): Promise<string[]> {
  const texts = await page.evaluate(() =>
    [...document.scripts].filter((s) => !s.src && s.text.includes('/cdn-cgi/challenge-platform/')).map((s) => s.text),
  );
  return texts.map((t) => `'sha256-${createHash('sha256').update(t).digest('base64')}'`);
}

// ページのパスをファイル名にする（/ → top、/shisaku/1-1-a-1/ → shisaku_1-1-a-1）
function slug(s: string): string {
  return s.replace(/^\/+|\/+$/g, '').replace(/[^0-9A-Za-z._-]+/g, '_').replace(/^_+|_+$/g, '') || 'top';
}

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    width: { type: 'string', multiple: true },
    dark: { type: 'boolean', default: false },
    top: { type: 'boolean', default: false },
    selector: { type: 'string' },
    at: { type: 'string' },
    scale: { type: 'string', default: '1' },
    base: { type: 'string' },
    dist: { type: 'string', default: 'site/dist' },
    out: { type: 'string', default: 'tmp/shots' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});
if (opts.help) {
  console.log(HELP);
  process.exit(0);
}
const pages = positionals.length ? positionals : ['/'];
const widths = (opts.width ?? ['1280', '390']).map(Number);
const scale = Number(opts.scale);
if (widths.some((w) => !Number.isInteger(w) || w <= 0) || !(scale > 0)) {
  console.error('--width は正の整数、--scale は正の数で指定する');
  process.exit(1);
}

let base: string;
let close = () => {};
if (opts.base) {
  base = opts.base.replace(/\/+$/, '');
} else {
  if (!(await isFile(join(opts.dist, 'index.html')))) {
    console.error(`${opts.dist}/index.html がありません。先に make build`);
    process.exit(1);
  }
  ({ base, close } = await serve(opts.dist));
}

await mkdir(opts.out, { recursive: true });
let failed = false;
const browser = await chromium.launch();
try {
  for (const width of widths) {
    const mobile = width < 768;
    const context = await browser.newContext({
      viewport: { width, height: HEIGHTS[width] ?? 800 },
      deviceScaleFactor: scale,
      isMobile: mobile,
      hasTouch: mobile,
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
    });
    if (opts.dark) {
      // Base.astro の <head> のスクリプトが読む配色の記憶（site/src/scripts/theme.ts と同じ）
      await context.addInitScript(() => localStorage.setItem('theme', 'dark'));
    }
    for (const pagePath of pages) {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      const url = `${base}/${pagePath.replace(/^\/+/, '')}`;
      const res = await page.goto(url, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready.then(() => true));
      // 一覧の行は画面の外を描かない（styles/global.css の content-visibility）。画面の外まで撮ると行が空に写るので、外して撮る。
      // <style> を足すとページの CSP に止められるので、当たっている要素の style をスクリプトから直接変える
      await page.evaluate(() => {
        for (const el of document.querySelectorAll<HTMLElement>('*')) {
          if (getComputedStyle(el).getPropertyValue('content-visibility') === 'auto') el.style.setProperty('content-visibility', 'visible');
        }
      });
      const name =
        slug(pagePath) + (opts.selector ? `@${slug(opts.selector)}` : '') + (opts.at ? `~${slug(opts.at)}` : '') + `-${width}${opts.dark ? '-dark' : ''}.png`;
      const path = join(opts.out, name);
      const status = res?.status() ?? 0;
      if (status >= 400) {
        errors.unshift(`HTTP ${status}`);
      } else if (opts.at) {
        // # のリンクと同じく scroll-margin-top を守って跳ぶ（なめらかなスクロールは待たない）。上に貼り付く目次の切り替え（scripts/toc.ts）を待ってから撮る
        const found = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          el?.scrollIntoView({ behavior: 'instant', block: 'start' });
          return Boolean(el);
        }, opts.at);
        if (found) {
          await page.waitForTimeout(400);
          await page.screenshot({ path });
        } else {
          errors.unshift(`${opts.at} が見つかりません`);
        }
      } else if (opts.selector) {
        const target = page.locator(opts.selector).first();
        if (await target.count()) await target.screenshot({ path });
        else errors.unshift(`${opts.selector} が見つかりません`);
      } else {
        await page.screenshot({ path, fullPage: !opts.top });
      }
      const cf = await cloudflareScriptHashes(page);
      const real = errors.filter((e) => !(e.includes('Content Security Policy') && cf.some((h) => e.includes(h))));
      if (real.length) {
        failed = true;
        console.error(`NG ${url}（幅 ${width}）`);
        for (const e of real) console.error(`   ${e}`);
      } else {
        console.log(path);
      }
      if (real.length < errors.length) console.log('   （Cloudflare が差し込んだボット検出のスクリプトが CSP に止められた。NG に数えない）');
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
  close();
}
process.exitCode = failed ? 1 : 0;
