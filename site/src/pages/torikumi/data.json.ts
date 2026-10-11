// 取組をさがす（/torikumi/）が読み込む検索用データ。ビルド時に1つの JSON として書き出す。
// 行は配列で持ってファイルを小さくする（並びは fields のとおり）
import { YEARS, STATUSES, DEPTS, getShisakuList, getTorikumiGroups } from '../../lib/data.ts';
import { getThemes, themeIdsOfItem } from '../../lib/themes.ts';
import { kankoOfPdca } from '../../lib/plans.ts';
import type { Tone } from '../../lib/icons.ts';

// JSON の形（ブラウザのスクリプト pages/torikumi/index.astro もこの型で読む）
export interface SearchData {
  years: number[];
  statuses: [key: string, tone: Tone][];
  depts: Record<string, string>;
  shisaku: Record<string, [code: string, name: string, shouraizou: number]>;
  themes: [id: string, label: string][];
  fields: string[];
  rows: [
    shisaku_id: string, name: string, section: string, dept: string, statuses: (number | null)[], indicator: string, target: string, actual: string,
    latest_year: number, href: string, themes: number[], patterns: string[], plans: string[],
  ][];
}

export function GET() {
  const code = Object.fromEntries(STATUSES.map((s, i) => [s.key, i]));
  const themes = getThemes();
  const themeIndex = new Map(themes.map((t, i) => [t.id, i]));
  const body: SearchData = {
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
      // 目標・実績が2行以上の取組は、行を「／」でつないで1行にする（一覧の行は1行で描くため）
      g.latest.lines ? g.latest.lines.map((l) => l.target || '—').join(' ／ ') : g.latest.target,
      g.latest.lines ? g.latest.lines.map((l) => l.actual || '—').join(' ／ ') : g.latest.actual,
      g.latest.year,
      g.href,
      themeIdsOfItem(g.shisaku.id, g.latest.name).map((id) => themeIndex.get(id)!),
      g.patterns, // 4年間の様子（lib/data.ts の PATTERNS のうち当てはまるもの）
      kankoOfPdca(g.shisaku.id, g.key).length ? ['kanko'] : [], // 個別計画でも評価されているか（いまは観光ロードマップだけ）
    ]),
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
