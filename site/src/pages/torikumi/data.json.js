// 取組をさがす（/torikumi/）が読み込む検索用データ。ビルド時に1つの JSON として書き出す。
// 行は配列で持ってファイルを小さくする（並びは fields のとおり）
import { YEARS, STATUSES, DEPTS, getShisakuList, getTorikumiGroups } from '../../lib/data.js';

export function GET() {
  const code = Object.fromEntries(STATUSES.map((s, i) => [s.key, i]));
  const body = {
    years: YEARS,
    statuses: STATUSES.map((s) => [s.key, s.tone]),
    depts: Object.fromEntries(DEPTS.map((d) => [d.name, d.slug])), // 部局名 → 部局ページの slug
    shisaku: Object.fromEntries(getShisakuList().map((s) => [s.id, [s.code, s.name, s.shouraizou]])),
    fields: ['shisaku_id', 'name', 'section', 'dept', 'statuses', 'indicator', 'target', 'actual', 'latest_year', 'href'],
    rows: getTorikumiGroups().map((g) => [
      g.shisaku.id,
      g.latest.name,
      g.section,
      g.dept,
      g.statuses.map((x) => (x == null ? null : code[x])),
      g.latest.indicator,
      g.latest.target,
      g.latest.actual,
      g.latest.year,
      g.href,
    ]),
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
