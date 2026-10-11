import { defineConfig } from 'astro/config';
import type { AstroIntegration } from 'astro';
import { writeFile } from 'node:fs/promises';
import { SITE } from './src/lib/links.ts';
import { sitemapPaths, sitemapXml } from './src/lib/seo.ts';

// 書き出した全ページの URL を sitemap.xml にする（依存を足さないため、@astrojs/sitemap を使わずここで書く。中身は lib/seo.ts）
const sitemap: AstroIntegration = {
  name: 'sitemap',
  hooks: {
    'astro:build:done': async ({ pages, dir, logger }) => {
      const paths = sitemapPaths(pages.map((p) => p.pathname));
      await writeFile(new URL('sitemap.xml', dir), sitemapXml(paths));
      logger.info(`sitemap.xml に ${paths.length} ページを書いた`);
    },
  },
};

// Cloudflare に静的ファイルとして置く。ページは /shisaku/1-1-a-1/ のようなディレクトリ形式。site は本番のドメイン（lib/links.ts の SITE.url）
export default defineConfig({
  site: SITE.url,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap],
});
