// 予算事業をさがす（/yosan/jigyo/）が読み込む検索用データ。ビルド時に JSON として書き出す（pages/yosan/jigyo/ の data-[hash].json.ts と、控えの data.json.ts）。
// 行は2種類: 部局票の予算事業（kind 0。予算事業のページがあるもの）と、一括交付金（ソフト）の事後評価の事業（kind 1。予算の一覧として同じ一覧に並べ、札と種類の絞り込みで見分ける。
// 予算事業とは結び付けない。docs/design.md の5章）。行は配列で持ってファイルを小さくする（並びは fields のとおり）。
// ファイルの名前に中身のハッシュを入れ（/yosan/jigyo/data-<ハッシュ>.json）、ブラウザにずっとキャッシュさせる（public/_headers）。
// 予算事業の数は予算事業のページの頭と同じ（最後に載った報告の、重複を除いた決算見込額と、その報告で書かれている取組の数）。一括交付金の事業の数は施策のページの事業のカードと同じ（最後の年度の事後評価の予算額・達成率・評価）。
// ビルドの中でだけ使う（Node の機能を使う。ブラウザのスクリプトは型だけを読む）
import { LATEST, FUNDS, DEPTS, amountTotal, getShisaku, getShisakuList, getTorikumiGroups, getBudgetProjects, budgetProjectEntries, budgetProjectRows, budgetProjectShared } from './data.ts';
import { IKKATSU_LATEST, IKKATSU_YEARS, GRADES, ikkatsuGroups, ikkatsuShisakuIds, ikkatsuHref, ikkatsuDept, ikkatsuTrends } from './plans.ts';
import { getThemes, themeIdsOf } from './themes.ts';
import type { Shape, Tone } from './icons.ts';
import { sha8 } from './hashed.ts';
import { once } from './memo.ts';

// JSON の形（ブラウザのスクリプト scripts/jigyo-search.ts もこの型で読む）。latest は種類ごとの最新の年度、funds・depts・themes・grades は上の一覧の番号。
// grades は一括交付金の事業の IKKATSU_YEARS の年度ごとの評価（GRADES の番号。-1 は事後評価に無い年度、-2 は評価なし）
export interface JigyoData {
  latest: [number, number];
  funds: [key: string, series: number][];
  depts: string[];
  themes: [id: string, label: string][];
  ikkatsuYears: number[];
  grades: [key: string, mark: string, tone: Tone, shape: Shape][];
  fields: string[];
  rows: [
    kind: 0 | 1, name: string, href: string, year: number, amount: number | null, funds: number[], section: string, depts: number[], shouraizou: number[], themes: number[],
    torikumi: number, shared: [amount: number, count: number] | null, grades: number[], rate: string, exec: number | null, trends: string[], order: number, text: string,
  ][];
}
type Row = JigyoData['rows'][number];

function build(): JigyoData {
  const themes = getThemes();
  const themeIndex = new Map(themes.map((t, i) => [t.id, i]));
  const themesOf = (sids: string[]) => [...new Set(sids.flatMap(themeIdsOf).map((id) => themeIndex.get(id)!))].sort((a, b) => a - b);
  const shisakuOrder = new Map(getShisakuList().map((s, i) => [s.id, i]));
  const torikumiOrder = new Map(getTorikumiGroups().map((g, i) => [g, i]));
  const fundIndex = (key: string) => FUNDS.findIndex((f) => f.key === key);
  const deptIndex = (name: string) => DEPTS.findIndex((d) => d.name === name);
  // 施策の順: 施策の報告書の順、同じ施策では予算事業（書かれている取組の順）→ 一括交付金の事業（事業の番号の順）
  const orderOf = (sid: string | undefined, kind: 0 | 1, n: number) => (shisakuOrder.get(sid ?? '') ?? shisakuOrder.size) * 1e5 + kind * 5e4 + n;

  const budgets = getBudgetProjects().map((p): Row => {
    const y = p.names.at(-1)!.y;
    const es = budgetProjectEntries(p).filter((e) => e.report === y);
    const est = es.filter((e) => e.kind === 'estimate');
    const rows = budgetProjectRows(p);
    const gs = rows.filter((r) => r.years.includes(y)).map((r) => r.group);
    const first = [...rows].sort((a, b) => torikumiOrder.get(a.group)! - torikumiOrder.get(b.group)!)[0]?.group;
    const shared = budgetProjectShared(p, y);
    return [
      0,
      p.name,
      p.href,
      y,
      est.length ? amountTotal(est) : null,
      FUNDS.flatMap((f, i) => (es.some((e) => e.fund === f.key) ? [i] : [])),
      [...new Set(gs.map((g) => g.latest.section).filter(Boolean))].join('、'),
      DEPTS.flatMap((d, i) => (gs.some((g) => g.dept === d.name) ? [i] : [])),
      [...new Set(gs.map((g) => g.shisaku.shouraizou))].sort((a, b) => a - b),
      themesOf(gs.map((g) => g.shisaku.id)),
      gs.length,
      shared && [shared.amount, shared.count],
      [],
      '',
      null,
      [],
      orderOf(first?.shisaku.id, 0, first ? torikumiOrder.get(first)! : 0),
      // キーワードで当たる、行に見えない文字: 前の名前と、書かれている取組の名前（「MICE」で戦略的MICE誘致促進事業が出るように）
      [...new Set([...p.names.map((n) => n.name), ...rows.map((r) => r.group.latest.name)])].filter((n) => n !== p.name).join('\n'),
    ];
  });

  const ikkatsu = ikkatsuGroups().map((g): Row => {
    const j = g.latest;
    const sids = ikkatsuShisakuIds(g);
    const ss = sids.flatMap((id) => getShisaku(id) ?? []);
    const dept = deptIndex(ikkatsuDept(j.dept));
    return [
      1,
      j.name,
      ikkatsuHref(g) ?? '',
      j.year,
      j.budget?.total ?? null,
      [fundIndex('一括交付金（ソフト）')],
      [j.dept, ss[0] && `施策 ${ss[0].name}${ss.length > 1 ? ` ほか${ss.length - 1}施策` : ''}`].filter(Boolean).join('・'),
      dept >= 0 ? [dept] : [],
      [...new Set(ss.map((s) => s.shouraizou))].sort((a, b) => a - b),
      themesOf(sids),
      0,
      null,
      IKKATSU_YEARS.map((y) => (g.years[y] ? GRADES.findIndex((x) => x.key === g.years[y].grade_label) : -1)).map((i, k) => (i < 0 && g.years[IKKATSU_YEARS[k]] ? -2 : i)),
      j.rate_raw || '',
      j.budget?.rate ?? null,
      ikkatsuTrends(g),
      orderOf(ss[0]?.id, 1, j.no),
      // キーワードで当たる、行に見えない文字: 事業の内容と施策の番号・名前（一括交付金の事業をさがすと同じ）
      [j.overview, ...ss.map((s) => `${s.code} ${s.name}`)].filter(Boolean).join('\n'),
    ];
  });

  return {
    latest: [LATEST, IKKATSU_LATEST],
    funds: FUNDS.map((f) => [f.key, f.series]),
    depts: DEPTS.map((d) => d.name),
    themes: themes.map((t) => [t.id, t.label]),
    ikkatsuYears: IKKATSU_YEARS,
    grades: GRADES.map((x) => [x.key, x.mark, x.tone, x.shape]),
    fields: ['kind', 'name', 'href', 'year', 'amount', 'funds', 'section', 'depts', 'shouraizou', 'themes', 'torikumi', 'shared', 'grades', 'rate', 'exec', 'trends', 'order', 'text'],
    rows: [...budgets, ...ikkatsu],
  };
}

// 書き出す JSON（1回のビルドで1度だけ作る）と場所。名前は中身の SHA-256 の先頭8桁
export const jigyoDataJson = once(() => JSON.stringify(build()));
export const jigyoDataHash = () => sha8(jigyoDataJson());
export const jigyoDataPath = () => `/yosan/jigyo/data-${jigyoDataHash()}.json`;
// 名前の変わらない控え。公開し直した直後に、キャッシュした前のページから開くと、前のハッシュのファイルはもう無いので、こちらを読む
export const JIGYO_DATA_FALLBACK = '/yosan/jigyo/data.json';
