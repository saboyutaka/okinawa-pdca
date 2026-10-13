import { defineConfig } from 'astro/config';
import type { AstroIntegration } from 'astro';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { SITE } from './src/lib/links.ts';
import { duplicateHeads, sitemapPaths, sitemapXml } from './src/lib/seo.ts';
import { pagePaths } from './src/lib/routes.ts';
import { pruneCardCache } from './src/lib/card-cache.ts';

// 書き出した全ページの URL を sitemap.xml にする（依存を足さないため、@astrojs/sitemap を使わずここで書く。中身は lib/seo.ts）。
// 公開した URL の一覧のテストは、書き出さずに lib/routes.ts の pagePaths で全ページの URL を作るので、書き出したものと同じかもここで確かめる。
// 題名・説明文がほかのページと同じページがあれば警告する（取組・成果指標は test/describe.test.ts で落とす。docs/site.md の6章）
const sitemap: AstroIntegration = {
  name: 'sitemap',
  hooks: {
    'astro:build:done': async ({ pages, dir, logger }) => {
      const paths = sitemapPaths(pages.map((p) => p.pathname));
      const built = new Set(paths);
      const expected = new Set(pagePaths());
      const diff = [...paths.filter((p) => !expected.has(p)), ...[...expected].filter((p) => !built.has(p))];
      if (diff.length) throw new Error(`書き出したページと lib/routes.ts の pagePaths が違う（${diff.length} 件）: ${diff.slice(0, 5).join(' ')}`);
      await writeFile(new URL('sitemap.xml', dir), sitemapXml(paths));
      logger.info(`sitemap.xml に ${paths.length} ページを書いた`);
      const dups = duplicateHeads(await Promise.all(paths.map(async (path) => ({ path, html: await readFile(new URL(`.${path}index.html`, dir), 'utf-8') }))));
      for (const d of dups) logger.warn(`${d.kind}が同じページが ${d.paths.length} ある: ${d.text.slice(0, 60)} ${d.paths.slice(0, 3).join(' ')}`);
    },
  },
};

// SNS のカードの画像のキャッシュ（lib/card-cache.ts）。ビルドの終わりに、前のビルドの画像を使った数と描いた数をログに出し、
// このビルドで使わなかった画像をキャッシュから消す
let buildStart = 0;
const cardCache: AstroIntegration = {
  name: 'card-cache',
  hooks: {
    'astro:build:start': () => {
      buildStart = Date.now();
    },
    'astro:build:done': ({ logger }) => {
      const { reused, drawn, removed } = pruneCardCache(buildStart);
      logger.info(`SNS のカードの画像: 前のビルドの画像を ${reused} 枚使い、${drawn} 枚を描いた（使わなくなった ${removed} 枚をキャッシュから消した）`);
    },
  },
};

// Cloudflare に静的ファイルとして置く。ページは /shisaku/1-1-a-1/ のようなディレクトリ形式。site は本番のドメイン（lib/links.ts の SITE.url）
// ページの favicon は src/assets から /_astro/ にハッシュ付きの名前で書き出す（layouts/Base.astro）。
// HTML を読まずに /favicon.ico を取りに来るところ（一部の RSS リーダーやボット）向けに、同じ ICO を根元にも置く
const rootFavicon: AstroIntegration = {
  name: 'root-favicon',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      await copyFile(new URL('./src/assets/favicon.ico', import.meta.url), new URL('favicon.ico', dir));
    },
  },
};

// ページ（HTML）を配るときに、CSS と数字のフォントを Link ヘッダーでも知らせる（public/_headers に書き足す）。
// Cloudflare の Early Hints（ダッシュボードの Speed で有効にする）は、このヘッダーを覚えておき、次からは HTML を用意しているあいだに
// 103 で先に送るので、ブラウザは HTML を待たずに CSS とフォントを取りに行ける（docs/deploy.md の 5章）。
// ファイル名には中身のハッシュが付いてビルドごとに変わるので、書き出したページから読む。CSS もフォントも全ページで同じものなので、
// 全ページが同じかを確かめてから、ページのルール（/ と /*/）に1つずつ書く
const earlyHints: AstroIntegration = {
  name: 'early-hints',
  hooks: {
    'astro:build:done': async ({ pages, dir, logger }) => {
      const linksOf = (html: string) => {
        const head = html.slice(0, html.indexOf('</head>'));
        const css = [...head.matchAll(/<link rel="stylesheet" href="(\/_astro\/[^"]+\.css)"/g)].map((m) => `<${m[1]}>; rel=preload; as=style`);
        const font = [...head.matchAll(/<link rel="preload" href="(\/_astro\/[^"]+\.woff2)" as="font"/g)].map((m) => `<${m[1]}>; rel=preload; as=font; type="font/woff2"; crossorigin`);
        return [...css, ...font].join(', ');
      };
      const paths = sitemapPaths(pages.map((p) => p.pathname));
      const all = new Set(await Promise.all(paths.map(async (path) => linksOf(await readFile(new URL(`.${path}index.html`, dir), 'utf-8')))));
      const [link] = all;
      if (all.size !== 1 || !link) throw new Error(`ページによって CSS・フォントが違うか無いので、Link ヘッダーを1つにできない: ${[...all].join(' / ')}`);
      // 同じパスのルールを後ろに足すと、前のルール（Cache-Control）が効かなくなる（wrangler 4.149.0 の wrangler dev で確かめた）ので、もとのルールの中に書き足す
      const headers = new URL('_headers', dir);
      let n = 0;
      const text = (await readFile(headers, 'utf-8')).replace(/^(\/|\/\*\/)\n( {2}Cache-Control: [^\n]+\n)/gm, (_, path: string, cc: string) => {
        n++;
        return `${path}\n${cc}  Link: ${link}\n`;
      });
      if (n !== 2) throw new Error(`_headers のページのルール（/ と /*/）が ${n} 個しか見つからない`);
      await writeFile(headers, text);
      logger.info(`_headers にページの Link を書いた: ${link}`);
    },
  },
};

export default defineConfig({
  site: SITE.url,
  output: 'static',
  trailingSlash: 'always',
  // concurrency: ページを並べて書き出す数。SNS のカードの画像（pages/og/[...card].png.ts。約2,600枚）は1枚50ms ほどかかるが、
  // 描くのはメインのスレッドの外（lib/card-render.ts の renderAsync。Node のスレッドは4つ）なので、並べると速くなる。
  // inlineStylesheets: CSS をページの <style> に埋め込まず、/_astro/ のファイルにする（ずっとキャッシュされ、ページを移るたびに送り直さない）。
  // 埋め込むと、Astro はビルド全体の <style> のハッシュ（約40個）をどのページの CSP にも入れる（下の vite.build.cssCodeSplit と docs/site.md の 7章）
  build: { format: 'directory', concurrency: 4, inlineStylesheets: 'never' },
  integrations: [sitemap, rootFavicon, cardCache, earlyHints],
  // CSP（ページが読み込んで動かしてよいもの）を各ページの <meta> で出す。このサイトのファイルと、Astro が書き出したスクリプトのハッシュだけを許す（<style> は書き出さない）。
  // <script is:inline> のハッシュは Astro が足さないので layouts/Base.astro で足す。図や札の色に style 属性を使うので、style 属性だけはインラインを許す。
  // frame-ancestors は <meta> では効かないので public/_headers で出す。
  // 外から読み込むのは、Cloudflare が配信のときに差し込むアクセス解析（Web Analytics）のスクリプトだけ。
  // 差し込まれる URL は /beacon.min.js/v… と版で変わるので、ホストで許す。送り先は同じドメインの /cdn-cgi/rum なので 'self' で足りる。
  // Cloudflare が同じく差し込むボット検出のインラインのスクリプトは、中身がリクエストごとに変わってハッシュで許せないので、ゾーンの設定で切ってある（docs/deploy.md の 3章）
  security: {
    csp: {
      directives: ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"],
      scriptDirective: { resources: ["'self'", 'https://static.cloudflareinsights.com'] },
      styleDirective: { resources: [{ resource: "'self'", kind: 'element' }, { resource: "'unsafe-inline'", kind: 'attribute' }] },
    },
  },
  // コードの色付け（Shiki）は使わない。style 属性で色を付けるので CSP と合わない（使っていなくても CSP の警告が出る）
  markdown: { syntaxHighlight: false },
  // cssCodeSplit: CSS をページや部品ごとに分けず、全ページで1つのファイルにする（gzip で約18KB）。分けると、ページの種類ごとに初めて開くときに
  // 読む CSS が増え（部局のページで15個）、HTML のあとに CSS をもう1往復待つ。1つにすると、2ページ目からは CSS を読まない（docs/site.md の 7章）。
  // 部品の <style> もどのページにも届くので、:global() は .x :global(.y) のように、範囲をしぼった要素の中に書く。
  // assetsInlineLimit: 数字のフォント（約4KB）は小さいので、そのままだと Vite が CSS に data: で埋め込み、CSP の default-src 'self' に止められる。
  // フォントだけは埋め込まず、/_astro/ にハッシュ付きの名前で書き出す（ずっとキャッシュされる。layouts/Base.astro で preload）
  vite: { build: { cssCodeSplit: false, assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined) } },
});
