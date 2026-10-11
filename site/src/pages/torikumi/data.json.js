// 取組をさがす（/torikumi/）が読み込む検索用データ。ビルド時に1つの JSON として書き出す。
// 行は配列で持ってファイルを小さくする（並びは fields のとおり）
import { YEARS, STATUSES, DEPTS, getShisakuList, getTorikumiGroups } from '../../lib/data.js';
import { getThemes, themeIdsOfItem } from '../../lib/themes.js';
import { kankoOfPdca } from '../../lib/plans.js';

export function GET() {
  const code = Object.fromEntries(STATUSES.map((s, i) => [s.key, i]));
  const themes = getThemes();
  const themeIndex = new Map(themes.map((t, i) => [t.id, i]));
  const body = {
    years: YEARS,
    statuses: STATUSES.map((s) => [s.key, s.tone]),
    depts: Object.fromEntries(DEPTS.map((d) => [d.name, d.slug])), // 部局名 → 部局ページの slug
    shisaku: Object.fromEntries(getShisakuList().map((s) => [s.id, [s.code, s.name, s.shouraizou]])),
    themes: themes.map((t) => [t.id, t.label]), // くらしのテーマ（このサイト独自の分類）
    fields: ['shisaku_id', 'name', 'section', 'dept', 'statuses', 'indicator', 'target', 'actual', 'latest_year', 'href', 'themes', 'patterns', 'plans'],
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
      themeIdsOfItem(g.shisaku.id, g.latest.name).map((id) => themeIndex.get(id)),
      g.patterns, // 4年間の様子（lib/data.js の PATTERNS のうち当てはまるもの）
      kankoOfPdca(g.shisaku.id, g.key).length ? ['kanko'] : [], // 個別計画でも評価されているか（いまは観光ロードマップだけ）
    ]),
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
