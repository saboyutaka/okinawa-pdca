// 県へ意見を伝える方法（/iken/）と、X で話すためのハッシュタグ。県のページの記載は 2026-10-10 に確認した

// 募集の期間（日付は YYYY-MM-DD）
interface Period {
  start: string;
  end: string;
}

// 県民意見募集（沖縄県PDCA実施結果に対する意見の募集。いわゆるパブリックコメント）のうち、いちばん新しいもの。
// 県は結果を公表したあとに募集している。新しい募集が出たらここを書き換える。受付中・終了は**ビルドした日**で決まる
export const BOSHU = {
  year: 2025, // 対象年度（令和7年度の結果）
  start: '2026-09-04',
  end: '2026-10-04',
  page: 'https://www.pref.okinawa.jp/kensei/shisaku/1014252/1014253/1041342.html', // 沖縄県PDCA実施結果（対象年度：令和7年度）
  form: 'https://apply.e-tumo.jp/pref-okinawa-u/offer/offerList_detail?tempSeq=7202', // 電子申請（受付中だけ出す）
};

// これまでの募集の期間（各年度の結果のページの記載）。時期は年によって違う
export const BOSHU_PAST = [
  { year: 2022, start: '2024-04-01', end: '2024-04-30' },
  { year: 2023, start: '2025-04-01', end: '2025-04-30' },
  { year: 2024, start: '2025-09-01', end: '2025-09-30' },
  { year: 2025, start: '2026-09-04', end: '2026-10-04' },
];

// 県が公表した「県民意見の概要と県の考え方」のうち、結果のページからたどれるいちばん新しいもの（平成30年度対象。意見は2件）
export const KANGAEKATA = { label: '平成30年度', count: 2, href: 'https://www.pref.okinawa.jp/kensei/shisaku/1014252/1014253/1019166.html' };

// 県政全般への意見をいつでも受け付ける窓口（知事公室広報課。ご意見箱への投函・郵送・FAX・メール）
export const GOIKENBAKO = 'https://www.pref.okinawa.jp/kensei/kochokoho/1014932/1015136/1015137.html';

// 募集の状態。日付は沖縄（日本時間）の1日の始めと終わりで比べる
export function boshuState(b: Period = BOSHU, now = new Date()) {
  if (now < new Date(`${b.start}T00:00:00+09:00`)) return 'before';
  if (now <= new Date(`${b.end}T23:59:59+09:00`)) return 'open';
  return 'closed';
}

// 2026-09-04 → 2026年（令和8年）9月4日（金）。withYear が false なら 9月4日（金）
const WEEK = '日月火水木金土';
export function dayText(iso: string, withYear = true) {
  const [y, m, d] = iso.split('-').map(Number);
  const w = WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${withYear ? `${y}年（令和${y - 2018}年）` : ''}${m}月${d}日（${w}）`;
}
export const periodText = (b: Period) => `${dayText(b.start)}〜${dayText(b.end, b.end.slice(0, 4) !== b.start.slice(0, 4))}`;

// SNS で話すときのハッシュタグ（# なし）と、そのタグの投稿を見るページ。投稿画面を開くリンクは lib/share.ts
export const HASHTAG = 'okinawa_miraima';
export const TAG_PAGES = [
  { label: 'X', href: `https://x.com/search?q=${encodeURIComponent(`#${HASHTAG}`)}&f=live` },
  { label: 'Bluesky', href: `https://bsky.app/hashtag/${HASHTAG}` },
];

// 投稿の本文に入れる名前。X は日本語を1字で2字分に数えて140字までなので、長い名前は途中で切る
export const shortName = (s: string, max = 40) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

// シェアの投稿の本文（施策「〇〇」について）。シェアの枠（components/ShareBox.astro）が使う
export const shareText = (kind: string, name: string) => `${kind}「${shortName(name)}」について`;
