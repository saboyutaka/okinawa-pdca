// /api/ を受ける Worker。いまは、いいね（components/Like.astro）の POST /api/like?page=<ページのパス> に 204 を返すだけで、何も記録しない。
// 件数は Cloudflare が残す Worker のログ（Workers Logs。ダッシュボードの Observability）で /api/like の URL を数えて見る。
// wrangler.jsonc の assets.run_worker_first で /api/* だけが先にここへ来て、ほかは静的なファイル（dist）がそのまま返る。
// ただし、無いファイルへのページの移動でないリクエスト（fetch・画像など）もここへ来るので、静的なファイルの側に戻して 404 のページを返す
import { LIKE_PATH } from '../src/lib/like.ts';

interface Env { ASSETS: { fetch(request: Request): Promise<Response> } }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname !== LIKE_PATH) return env.ASSETS.fetch(request);
    // クローラーがたどったり先読みしたりしても数に入らないように、ボタンが送る POST だけを受ける
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    return new Response(null, { status: 204 });
  },
};
