// いいねのボタン（components/Like.astro）の送り先と、押したときに出す運営からのお礼の言葉。
// 送り先は /api/like で、どのページかはクエリの page に入れる（/shisaku/1-1-a-1/ なら /api/like?page=/shisaku/1-1-a-1/）。
// 受けるのは worker/api.ts で、204 を返すだけで何も残さない。件数は Cloudflare が残す Worker のログで、この URL を数えて見る
import { PROJECT } from './links.ts';

export const LIKE_PATH = '/api/like';

// ページのパス（location.pathname）は英数字と - と / だけなので、ログで読めるようにそのまま付ける
export const likeUrl = (pathname: string): string => `${LIKE_PATH}?page=${pathname}`;

// お礼の言葉（1文ずつ行を分けて出す）と、だれからのお礼か（お礼の下に署名のように出す。団体名の途中で折り返さないように2つに分ける）
export const LIKE_THANKS = ['ありがとうございます！', '励みになります！'] as const;
export const LIKE_FROM = ['このサイトの運営', `（${PROJECT.org}）`] as const;
