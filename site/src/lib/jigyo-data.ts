// 予算事業をさがす（/yosan/jigyo/）が読み込む検索用データ。ビルド時に JSON として書き出す（pages/yosan/jigyo/ の data-[hash].json.ts と、控えの data.json.ts）。
// 行は配列で持ってファイルを小さくする（並びは fields のとおり）。ファイルの名前に中身のハッシュを入れ（/yosan/jigyo/data-<ハッシュ>.json）、
// ブラウザにずっとキャッシュさせる（public/_headers）。数は予算事業のページの頭と同じ（最後に載った報告の、重複を除いた決算見込額と、その報告で書かれている取組の数）。
// ビルドの中でだけ使う（Node の機能を使う。ブラウザのスクリプトは型だけを読む）
import { LATEST, FUNDS, DEPTS, amountTotal, getTorikumiGroups, getBudgetProjects, budgetProjectEntries, budgetProjectRows, budgetProjectShared } from './data.ts';
import { sha8 } from './hashed.ts';
import { once } from './memo.ts';

// JSON の形（ブラウザのスクリプト scripts/jigyo-search.ts もこの型で読む）。funds・depts は上の一覧の番号
export interface JigyoData {
  latest: number;
  funds: [key: string, series: number][];
  depts: string[];
  fields: string[];
  rows: [
    slug: string, name: string, year: number, estimate: number | null, funds: number[], section: string, depts: number[], shouraizou: number[],
    torikumi: number, shared: [amount: number, count: number] | null, order: number, text: string,
  ][];
}

function build(): JigyoData {
  const order = new Map(getTorikumiGroups().map((g, i) => [g, i]));
  return {
    latest: LATEST,
    funds: FUNDS.map((f) => [f.key, f.series]),
    depts: DEPTS.map((d) => d.name),
    fields: ['slug', 'name', 'year', 'estimate', 'funds', 'section', 'depts', 'shouraizou', 'torikumi', 'shared', 'order', 'text'],
    rows: getBudgetProjects().map((p) => {
      const y = p.names.at(-1)!.y;
      const es = budgetProjectEntries(p).filter((e) => e.report === y);
      const est = es.filter((e) => e.kind === 'estimate');
      const rows = budgetProjectRows(p);
      const gs = rows.filter((r) => r.years.includes(y)).map((r) => r.group);
      const shared = budgetProjectShared(p, y);
      return [
        p.slug,
        p.name,
        y,
        est.length ? amountTotal(est) : null,
        FUNDS.flatMap((f, i) => (es.some((e) => e.fund === f.key) ? [i] : [])),
        [...new Set(gs.map((g) => g.latest.section).filter(Boolean))].join('、'),
        DEPTS.flatMap((d, i) => (gs.some((g) => g.dept === d.name) ? [i] : [])),
        [...new Set(gs.map((g) => g.shisaku.shouraizou))].sort((a, b) => a - b),
        gs.length,
        shared && [shared.amount, shared.count],
        // 施策の順: 書かれている取組のうち、報告書の順で最初のもの（取組の無い予算事業は最後）
        rows.length ? Math.min(...rows.map((r) => order.get(r.group)!)) : order.size,
        // キーワードで当たる、行に見えない文字: 前の名前と、書かれている取組の名前（「MICE」で戦略的MICE誘致促進事業が出るように）
        [...new Set([...p.names.map((n) => n.name), ...rows.map((r) => r.group.latest.name)])].filter((n) => n !== p.name).join('\n'),
      ];
    }),
  };
}

// 書き出す JSON（1回のビルドで1度だけ作る）と場所。名前は中身の SHA-256 の先頭8桁
export const jigyoDataJson = once(() => JSON.stringify(build()));
export const jigyoDataHash = () => sha8(jigyoDataJson());
export const jigyoDataPath = () => `/yosan/jigyo/data-${jigyoDataHash()}.json`;
// 名前の変わらない控え。公開し直した直後に、キャッシュした前のページから開くと、前のハッシュのファイルはもう無いので、こちらを読む
export const JIGYO_DATA_FALLBACK = '/yosan/jigyo/data.json';

// 絞り込んだ予算事業をさがすの URL（予算と財源の部局別・将来像別の棒、部局・将来像のページの予算の節から）。値はページの選択肢と同じ
// （部局は部局名、財源は財源の区分、将来像は番号）。latest は最新の報告にある予算事業だけ（最新の年度の金額から入るとき）
export function jigyoSearchHref(q: { dept?: string; s?: number; fund?: string; latest?: boolean }) {
  const p = new URLSearchParams();
  if (q.dept) p.set('dept', q.dept);
  if (q.s) p.set('s', String(q.s));
  if (q.fund) p.set('fund', q.fund);
  if (q.latest) p.set('yr', 'latest');
  return `/yosan/jigyo/?${p}`;
}
