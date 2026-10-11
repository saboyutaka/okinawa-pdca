// SNS のシェアボタン（components/Share.astro）が開く投稿画面・共有画面の URL。並びは Facebook・LINE・X・Threads・Bluesky。
// 公開の場の SNS（X・Threads・Bluesky）には #okinawa_pdca を付ける。渡せる引数は各社の資料で 2026-10-11 に確かめた
import { HASHTAG } from './iken.js';

const enc = encodeURIComponent;
const query = (pairs) => pairs.filter(([, v]) => v).map(([k, v]) => `${k}=${enc(v)}`).join('&');

export const SNS = [
  // アプリ ID なしで使える sharer.php は URL しか確実に渡せない（本文・ハッシュタグは見る人が書き足す）
  { id: 'facebook', label: 'Facebook', href: ({ url }) => `https://www.facebook.com/sharer/sharer.php?${query([['u', url]])}` },
  // LINE は知り合いに送るもので公開の場ではないので、ハッシュタグは付けない
  { id: 'line', label: 'LINE', href: ({ text, url }) => `https://social-plugins.line.me/lineit/share?${query([['url', url], ['text', text]])}` },
  // X の Web Intent。hashtags は # なし
  { id: 'x', label: 'X', href: ({ text, url }) => `https://x.com/intent/tweet?${query([['text', text], ['url', url], ['hashtags', HASHTAG]])}` },
  // Threads の Web Intent。tag はトピックタグ（# なし。1つ）
  { id: 'threads', label: 'Threads', href: ({ text, url }) => `https://www.threads.com/intent/post?${query([['text', text], ['url', url], ['tag', HASHTAG]])}` },
  // Bluesky は本文（text）しか渡せないので、URL とハッシュタグを本文に入れる。日本語に続けた # はタグにならないので改行で区切る
  { id: 'bluesky', label: 'Bluesky', href: ({ text, url }) => `https://bsky.app/intent/compose?${query([['text', [text, url, `#${HASHTAG}`].filter(Boolean).join('\n')]])}` },
];

export const shareHref = (id, opts) => SNS.find((s) => s.id === id).href({ text: '', url: '', ...opts });
