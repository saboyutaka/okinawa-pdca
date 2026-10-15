// 沖縄県PDCA 以外の評価（data/extracted/kanko・ikkatsu・hyoka）をページで使う形にまとめる。
// 観光ロードマップは「個別計画」のページ（/keikaku/）に、一括交付金の事後評価は施策のページと予算のページ（/yosan/ikkatsu/）に、評価検証報告書は基本施策のページに出す
import { load, getShisaku, getTorikumiGroups, torikumiPage, keySlug, seikaHrefByName, deptOf, sameKey, torikumiKey, type Shisaku, type YearGroup } from './data.ts';
import type { Shape, Tone } from './icons.ts';
import type { HyokaKihonRow, IkkatsuJigyoRow, KankoSeikaRow, KankoShisakuRow, KankoTorikumiRow, PlanSourceRow } from './types.ts';

// ---------------------------------------------------------------- 出典

// 抽出結果のフォルダ
type PlanKind = 'kanko' | 'ikkatsu' | 'hyoka';

// 県のPDFへのリンク。kind は抽出結果のフォルダ（kanko・ikkatsu・hyoka）
const sourceMaps = new Map<PlanKind, Map<string, PlanSourceRow>>();
export function planSourceLink(kind: PlanKind, id: string, page?: number | null) {
  if (!sourceMaps.has(kind)) sourceMaps.set(kind, new Map(load(`${kind}/sources`).map((s) => [s.id, s])));
  const s = sourceMaps.get(kind)!.get(id);
  if (!s) return null;
  const text = s.link_text.replace(/\s*（\s*(PDF|zip|Excel)[^）]*）\s*$/i, '').trim();
  return page ? { href: `${s.file_url}#page=${page}`, label: `${text} ${page}ページ` } : { href: s.file_url, label: text };
}
export const planSources = (kind: PlanKind) => load(`${kind}/sources`);

// ---------------------------------------------------------------- 観光ロードマップ

export const KANKO = {
  name: '沖縄観光推進ロードマップ',
  short: '観光ロードマップ',
  basis: '第6次沖縄県観光振興基本計画',
  period: '前期（R4〜R6）',
  dept: '文化観光スポーツ部 観光政策課',
  href: '/keikaku/kanko/',
  theme: 'kanko', // くらしのテーマ「観光」のページに要約の枠を出す
};
// 報告のある年度。R4 は本編が読めないので、概要版の件数（years.json）だけ
export const RM_YEARS = [2022, 2023, 2024];
export const RM_LATEST = 2024;
// 成果指標の「達成状況」（基準値と比べた向き）
export const RM_JUDGEMENTS: { key: string; tone: Tone; shape?: Shape; note: string }[] = [
  { key: '前進', tone: 'good', shape: 'circle', note: '基準値より良くなっている' },
  { key: '横ばい', tone: 'warning', shape: 'diamond', note: '基準値と変わらない' },
  { key: '後退', tone: 'critical', shape: 'square', note: '基準値より悪くなっている' },
  { key: 'その他', tone: 'blank', note: '目標値の設定が難しいなどで比べられない' },
];
export const rmJudgementOf = (key: string) => RM_JUDGEMENTS.find((j) => j.key === key) || RM_JUDGEMENTS[3];

export const kankoYears = () => load('kanko/years');
export const kankoKihon = () => load('kanko/kihon');

// 施策展開のページの URL と、その中の施策の見出し
export const kankoTenkaiHref = (tenkaiId: string) => `/keikaku/kanko/${tenkaiId}/`;
export const kankoShisakuHref = (s: KankoShisakuRow) => `${kankoTenkaiHref(s.tenkai_id)}#rm-${s.id}`;

// 年度をまたいで同じ名前（sameKey）を1行にまとめる（沖縄県PDCA の torikumiRows と同じ考え方）
function groupByKey<T extends { key: string; year: number; no?: number }>(rows: T[]) {
  const m = new Map<string, YearGroup<T>>();
  for (const r of [...rows].sort((a, b) => b.year - a.year || (a.no ?? 0) - (b.no ?? 0))) {
    const k = sameKey(r.key);
    if (!m.has(k)) m.set(k, { key: r.key, latest: r, years: {} });
    m.get(k)!.years[r.year] ??= r;
  }
  return [...m.values()].sort((a, b) => b.latest.year - a.latest.year || (a.latest.no ?? 0) - (b.latest.no ?? 0));
}

// 沖縄県PDCA の主な取組（同じ年度に同じ名前のもの）。取組のページがあるものだけ。name は沖縄県PDCA での取組名（よく似た名前で結び付けたものは違う）
type PdcaLink = KankoTorikumiRow['pdca'][number] & { href: string; shisaku: Shisaku; name: string | undefined };
let groupNames: Map<string, string> | undefined;
function pdcaLinksOf(t: KankoTorikumiRow): PdcaLink[] {
  const names = (groupNames ??= new Map(getTorikumiGroups().map((g) => [g.href, g.latest.name])));
  return (t.pdca || []).flatMap((p) => {
    const href = torikumiPage(p.shisaku_id, p.key);
    const shisaku = getShisaku(p.shisaku_id);
    return href && shisaku ? [{ ...p, href, shisaku, name: names.get(href) }] : [];
  });
}

// 観光ロードマップの施策（最新の報告の行に、年度ごとの行と、年度をまたいでまとめた取組・成果指標を付けたもの）
export interface KankoTorikumiGroup extends YearGroup<KankoTorikumiRow> {
  pdca: PdcaLink[];
}
// 成果指標の pdca は、沖縄県PDCA の施策ページの成果指標の見出しへのリンクがあるものだけ
export interface KankoSeikaGroup extends YearGroup<KankoSeikaRow> {
  pdca: (KankoSeikaRow['pdca'][number] & { href: string; shisaku: Shisaku })[];
}
export interface KankoShisaku extends KankoShisakuRow {
  years: Record<number, KankoShisakuRow>;
  torikumi: KankoTorikumiGroup[];
  seika: KankoSeikaGroup[];
}

let rmShisaku: KankoShisaku[] | undefined;
export function kankoShisakuList() {
  if (rmShisaku) return rmShisaku;
  const tori = new Map<string, KankoTorikumiRow[]>();
  for (const t of load('kanko/torikumi')) {
    if (!tori.has(t.shisaku_id)) tori.set(t.shisaku_id, []);
    tori.get(t.shisaku_id)!.push(t);
  }
  const seika = new Map<string, KankoSeikaRow[]>();
  for (const s of load('kanko/seika')) {
    if (!seika.has(s.shisaku_id)) seika.set(s.shisaku_id, []);
    seika.get(s.shisaku_id)!.push(s);
  }
  const byId = new Map<string, { id: string; years: Record<number, KankoShisakuRow> }>();
  for (const s of load('kanko/shisaku')) {
    if (!byId.has(s.id)) byId.set(s.id, { id: s.id, years: {} });
    byId.get(s.id)!.years[s.year] = s;
  }
  rmShisaku = [...byId.values()].map((v) => {
    const latest = v.years[RM_LATEST] || Object.values(v.years).sort((a, b) => b.year - a.year)[0];
    const torikumi = groupByKey(tori.get(v.id) || []).map((g) => ({ ...g, pdca: pdcaLinksOf(g.latest) }));
    const seikaRows = groupByKey(seika.get(v.id) || []).map((g) => ({
      ...g,
      pdca: (g.latest.pdca || []).flatMap((p) => {
        // 成果指標の見出しへのリンクがあれば、施策もある
        const href = seikaHrefByName(p.shisaku_id, p.name);
        const shisaku = getShisaku(p.shisaku_id);
        return href && shisaku ? [{ ...p, href, shisaku }] : [];
      }),
    }));
    return { ...latest, years: v.years, torikumi, seika: seikaRows };
  });
  const order = (id: string) => id.split('-').map((x) => (/^\d+$/.test(x) ? x.padStart(3, '0') : x)).join('-');
  rmShisaku.sort((a, b) => order(a.id).localeCompare(order(b.id)));
  return rmShisaku;
}

export interface KankoTenkai {
  id: string;
  code: string;
  name: string;
  kihon_id: string;
  shisaku: KankoShisaku[];
}
export function kankoTenkaiList() {
  const m = new Map<string, KankoTenkai>();
  for (const s of kankoShisakuList()) {
    if (!m.has(s.tenkai_id)) m.set(s.tenkai_id, { id: s.tenkai_id, code: s.tenkai_code, name: s.tenkai_name, kihon_id: s.kihon_id, shisaku: [] });
    m.get(s.tenkai_id)!.shisaku.push(s);
  }
  return [...m.values()];
}
export const kankoTenkai = (id: string) => kankoTenkaiList().find((t) => t.id === id);

// 観光ロードマップの成果指標の行き先（施策展開のページの指標の札）
export const kankoSeikaAnchor = (shisakuId: string, key: string) => `rms-${shisakuId}-${keySlug(key)}`;
const NO_VALUE = new Set(['', '―', '-', '－', 'ー']);
// 最新の報告（R6）の成果指標を1行ずつにする。最新の実績値（実績値の欄の最後の値と、その参照年）を付ける。
// 並びは報告書の順（施策の順）。良い・悪いで並べ替えない（前進・横ばい・後退はそれぞれの行の印と、ページの頭の棒で見る）
export function kankoSeikaList() {
  return kankoShisakuList().flatMap((s) =>
    s.seika.filter((g) => g.years[RM_LATEST]).map((g) => {
      const x = g.years[RM_LATEST];
      const i = x.actual_raw.map((v, j) => (NO_VALUE.has(v) ? -1 : j)).filter((j) => j >= 0).pop();
      return {
        ...g, x, rm: s, judgement: x.judgement || 'その他',
        latestRaw: i != null ? x.actual_raw[i] : '', latestRef: i != null ? x.ref_years[i] || x.years[i] : '',
        href: `${kankoTenkaiHref(s.tenkai_id)}#${kankoSeikaAnchor(s.id, g.key)}`,
      };
    }),
  );
}
export type KankoSeikaListRow = ReturnType<typeof kankoSeikaList>[number];
// 沖縄県PDCA の成果指標（ページの URL）が、観光ロードマップのどの成果指標と同じか（観光ロードマップの報告書の「沖縄県PDCAの成果指標」の欄で結ぶ）。成果指標のページで使う
export const kankoOfSeika = (seikaHref: string) => kankoSeikaList().filter((g) => g.pdca.some((p) => p.href === seikaHref));

// 観光ロードマップの取組には自分のページが無いので、施策展開のページの取組のカードを行き先にする
export const kankoTorikumiAnchor = (shisakuId: string, key: string) => `rmt-${shisakuId}-${keySlug(key)}`;
export const KANKO_TORIKUMI_HREF = '/keikaku/kanko/torikumi/';
// 観光ロードマップの取組（年度をまたいで同じ名前を1行にしたもの）を、施策の順に平らにする（取組をさがすで使う）
export function kankoTorikumiRows() {
  return kankoShisakuList().flatMap((s) =>
    s.torikumi.map((g) => ({ ...g, rm: s, href: `${kankoTenkaiHref(s.tenkai_id)}#${kankoTorikumiAnchor(s.id, g.key)}` })),
  );
}

// その年度の観光ロードマップの主な取組（延べ）
export const kankoTorikumi = (year: number) => load('kanko/torikumi').filter((t) => t.year === year);
export const kankoSeika = (year: number) => load('kanko/seika').filter((s) => s.year === year);

// 沖縄県PDCA の主な取組（施策ID・key）が、観光ロードマップのどの施策に載っているか。取組のページで使う
let reverse: Map<string, { rm: KankoShisaku; row: KankoTorikumiGroup }[]> | undefined;
export function kankoOfPdca(shisakuId: string, key: string) {
  if (!reverse) {
    reverse = new Map();
    for (const s of kankoShisakuList()) {
      for (const g of s.torikumi) {
        for (const t of Object.values(g.years)) {
          for (const p of t.pdca || []) {
            const k = `${p.shisaku_id}|${torikumiKey(p.shisaku_id, p.key)}`;
            if (!reverse.has(k)) reverse.set(k, []);
            const list = reverse.get(k)!;
            if (!list.some((x) => x.rm.id === s.id && x.row.key === g.key)) list.push({ rm: s, row: g });
          }
        }
      }
    }
  }
  return reverse.get(`${shisakuId}|${torikumiKey(shisakuId, key)}`) || [];
}

// 沖縄県PDCA の施策に入っている取組のうち、観光ロードマップでも評価されているもの（施策のページで使う）
export function kankoOfPdcaShisaku(shisaku: Shisaku) {
  const out = new Map<string, KankoShisaku>();
  for (const t of shisaku.torikumi) {
    for (const x of kankoOfPdca(shisaku.id, t.key)) out.set(x.rm.id, x.rm);
  }
  return [...out.values()];
}

// ---------------------------------------------------------------- 一括交付金（ソフト）の事後評価

export const IKKATSU = {
  name: '沖縄振興特別推進交付金（ソフトの一括交付金）の事後評価',
  short: '一括交付金の事後評価',
  dept: '総務部 財政課',
};
export const IKKATSU_YEARS = [2022, 2023, 2024];
// 総括表の評価（成果目標の達成率。1事業で複数の目標があれば平均）
export const GRADES: { key: string; mark: string; tone: Tone; shape: Shape; note: string }[] = [
  { key: '達成', mark: '◎', tone: 'good', shape: 'circle', note: '達成率100%' },
  { key: '概ね達成', mark: '○', tone: 'warning', shape: 'diamond', note: '達成率70%以上100%未満' },
  { key: '一部達成', mark: '△', tone: 'serious', shape: 'up', note: '達成率70%未満で、一部の目標値は達成' },
  { key: '未達成', mark: '未', tone: 'critical', shape: 'square', note: '達成率70%未満で、どの目標値も未達成' },
];
export const gradeOf = (label: string) => GRADES.find((g) => g.key === label);
// 目標に届かなかった評価（△一部達成・未達成）
export const isShort = (label: string) => label === '一部達成' || label === '未達成';
// 年度ごとの評価のスタンプ（components/Stamps.astro に渡す形）
export const ikkatsuStamps = (g: YearGroup<IkkatsuJigyoRow>) =>
  IKKATSU_YEARS.map((y) => {
    const r = g.years[y];
    const x = r && gradeOf(r.grade_label);
    return x ? { year: y, tone: x.tone, shape: x.shape, text: `${x.mark} ${x.key}` } : { year: y, tone: null, text: r ? '評価なし' : '—' };
  });

let ikkatsuIndex: Map<string, YearGroup<IkkatsuJigyoRow>[]> | undefined;
// 施策ごとの事業（年度をまたいで同じ名前の事業を1行に）。1つの事業が複数の施策コードを持つときは、それぞれの施策に出す
export function ikkatsuOf(shisakuId: string) {
  if (!ikkatsuIndex) {
    const m = new Map<string, IkkatsuJigyoRow[]>();
    for (const j of load('ikkatsu/jigyo')) {
      for (const sid of j.shisaku_ids) {
        if (!m.has(sid)) m.set(sid, []);
        m.get(sid)!.push(j);
      }
    }
    ikkatsuIndex = new Map([...m].map(([sid, rows]) => [sid, groupByKey(rows)]));
  }
  return ikkatsuIndex.get(shisakuId) || [];
}
export const ikkatsuRows = (year: number) => load('ikkatsu/jigyo').filter((j) => j.year === year);

// 一括交付金の事業をさがす（/yosan/ikkatsu/）。事業には自分のページが無いので、施策のページの事業のカードを行き先にする
export const IKKATSU_HREF = '/yosan/ikkatsu/';
export const IKKATSU_LATEST = IKKATSU_YEARS[IKKATSU_YEARS.length - 1];
let ikkatsuAll: YearGroup<IkkatsuJigyoRow>[] | undefined;
// すべての事業（年度をまたいで同じ名前の事業を1行に）
export const ikkatsuGroups = () => (ikkatsuAll ??= groupByKey(load('ikkatsu/jigyo')));
// 事業の施策（新しい年度の検証シートの施策コードを先に。R5 には施策コードの無い事業が1つある）
export const ikkatsuShisakuIds = (g: YearGroup<IkkatsuJigyoRow>) =>
  [...new Set(Object.values(g.years).sort((a, b) => b.year - a.year).flatMap((r) => r.shisaku_ids))];
// 施策のページの事業のカード（IkkatsuCard）の id と、そこへの URL（最初の施策のページ）
export const ikkatsuAnchor = (key: string) => `ik-${keySlug(key)}`;
export function ikkatsuHref(g: YearGroup<IkkatsuJigyoRow>) {
  const sid = ikkatsuShisakuIds(g)[0];
  return sid ? `/shisaku/${sid}/#${ikkatsuAnchor(g.key)}` : null;
}
// 担当部課の部局。教育委員会の課は、沖縄県PDCA の部局（教育庁）にそろえる
export const ikkatsuDept = (dept: string | null | undefined) => (/^教育委員会/.test(dept || '') ? '教育庁' : deptOf(dept));

// ---------------------------------------------------------------- 評価検証報告書

export const HYOKA = { name: '新・沖縄21世紀ビジョン基本計画 評価検証報告書', period: 'R4〜R6', published: '令和8年5月' };
let hyokaIndex: Map<string, HyokaKihonRow> | undefined;
export function hyokaOf(kihonId: string) {
  hyokaIndex ??= new Map(load('hyoka/kihon').map((k) => [k.id, k]));
  return hyokaIndex.get(kihonId);
}
