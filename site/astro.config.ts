import { defineConfig } from 'astro/config';

// Cloudflare に静的ファイルとして置く。ページは /shisaku/1-1-a-1/ のようなディレクトリ形式
export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // CSP（ページが読み込んで動かしてよいもの）を各ページの <meta> で出す。このサイトのファイルと、Astro が書き出したスクリプト・<style> のハッシュだけを許す。
  // <script is:inline> のハッシュは Astro が足さないので layouts/Base.astro で足す。図や札の色に style 属性を使うので、style 属性だけはインラインを許す。
  // frame-ancestors は <meta> では効かないので public/_headers で出す
  security: {
    csp: {
      directives: ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"],
      scriptDirective: { resources: ["'self'"] },
      styleDirective: { resources: [{ resource: "'self'", kind: 'element' }, { resource: "'unsafe-inline'", kind: 'attribute' }] },
    },
  },
  // コードの色付け（Shiki）は使わない。style 属性で色を付けるので CSP と合わない（使っていなくても CSP の警告が出る）
  markdown: { syntaxHighlight: false },
});
