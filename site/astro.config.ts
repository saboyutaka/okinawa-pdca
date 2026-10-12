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

export default defineConfig({
  site: SITE.url,
  output: 'static',
  trailingSlash: 'always',
  // concurrency: ページを並べて書き出す数。SNS のカードの画像（pages/og/[...card].png.ts。約2,600枚）は1枚50ms ほどかかるが、
  // 描くのはメインのスレッドの外（lib/card-render.ts の renderAsync。Node のスレッドは4つ）なので、並べると速くなる
  build: { format: 'directory', concurrency: 4 },
  integrations: [sitemap, rootFavicon, cardCache],
  // CSP（ページが読み込んで動かしてよいもの）を各ページの <meta> で出す。このサイトのファイルと、Astro が書き出したスクリプト・<style> のハッシュだけを許す。
  // <script is:inline> のハッシュは Astro が足さないので layouts/Base.astro で足す。図や札の色に style 属性を使うので、style 属性だけはインラインを許す。
  // frame-ancestors は <meta> では効かないので public/_headers で出す。
  // 外から読み込むのは、Cloudflare が配信のときに差し込むアクセス解析（Web Analytics）のスクリプトだけ。
  // 差し込まれる URL は /beacon.min.js/v… と版で変わるので、ホストで許す。送り先は同じドメインの /cdn-cgi/rum なので 'self' で足りる。
  // Cloudflare が同じく差し込むボット検出のインラインのスクリプトは、中身がリクエストごとに変わってハッシュで許せないので、止まる（docs/deploy.md の 3章）
  security: {
    csp: {
      directives: ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"],
      scriptDirective: { resources: ["'self'", 'https://static.cloudflareinsights.com'] },
      styleDirective: { resources: [{ resource: "'self'", kind: 'element' }, { resource: "'unsafe-inline'", kind: 'attribute' }] },
    },
  },
  // コードの色付け（Shiki）は使わない。style 属性で色を付けるので CSP と合わない（使っていなくても CSP の警告が出る）
  markdown: { syntaxHighlight: false },
  // 数字のフォント（約4KB）は小さいので、そのままだと Vite が CSS に data: で埋め込み、CSP の default-src 'self' に止められる。
  // フォントだけは埋め込まず、/_astro/ にハッシュ付きの名前で書き出す（ずっとキャッシュされる。layouts/Base.astro で preload）
  vite: { build: { assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined) } },
});
