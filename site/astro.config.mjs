// @ts-check
import { defineConfig } from 'astro/config';

// Cloudflare に静的ファイルとして置く。ページは /shisaku/1-1-a-1/ のようなディレクトリ形式
export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // 基本施策の一覧（/kihon/）は将来像の一覧（/future/）にした。前の URL からは移動先へ案内する
  redirects: { '/kihon': '/future/' },
});
