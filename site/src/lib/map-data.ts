// 指標のマップ（/map/。pages/map.astro）の材料。主要指標・成果指標・活動指標を、1マス＝1指標で将来像ごとに並べ、選んだ年度の県の区分で色分けする。
// 区分は指標ごと（MAP_KINDS）で、マスは指標ごとの箱に分ける（見せ方は pages/map.astro）。
// - マス（ページの HTML に書く。mapRows）: 年度ごとの区分の番号と、絞り込みに使う部局・くらしのテーマ。最新の年度の色と、最新の報告に無いマスを隠すのは書き出すときに決める
// - 中身（JSON。マスを押したときにブラウザが読む。mapDataJson）: 名前・ページ・親（基本施策・施策）・年度ごとの値。
//   約2,000マスの名前と値を HTML に書くと重いので、指標ごとのファイルにして、押したときに読む（ファイルの名前に中身のハッシュを入れ、ずっとキャッシュさせる。public/_headers）
// 並びは報告書の順（将来像 → 基本施策・施策の番号 → 施策の中の並び）で、良い・悪いで並べ替えない。
// 活動指標は主な取組ごとに1マス（延べ件数。いくつかの施策に載る取組は施策ごとに1マス）で、色は活動指標の実績から県が決める取組の進捗状況。
// ビルドの中でだけ使う（Node の機能を使う。ブラウザのスクリプトは型だけを読む）
import {
  YEARS, LATEST, STATUSES, RATE_BINS, SHUYOU_BINS, load, yearLabel, planIndex, withUnit, refText, eraRef, halfWidth, sameScale,
  getShuyouStatus, getKihonList, shuyouBin, shuyouRateText, sameShuyouCard, shuyouCardHref, getSeikaGroups, seikaName, seikaDept, rateBin, rateText,
  getTorikumiGroups, statusOf, budgetOf, shuyouBinOf, type TorikumiGroup, type ShuyouStatus, type CellItem,
} from './data.ts';
import { activityAchievement, activityAchievements } from './katsudou.ts';
import { sha8 } from './hashed.ts';
import { esc } from './html.ts';
import { once, onceBy } from './memo.ts';
import { themeIdsOf } from './themes.ts';
import type { Tone } from './icons.ts';
import type { TERMS, TermWord } from './terms.ts';
import type { ShuyouGaiyouRow, SeikaRow, TorikumiRow } from './types.ts';

export type MapKind = 'shuyou' | 'seika' | 'katsudou';
// 色にする区分。key は報告書の言い方（絞り込みの値）、label は凡例と中身の札の言葉
export interface MapCat { key: string; label: string; tone: Tone }
export interface MapKindInfo {
  kind: MapKind;
  term: TermWord; // 指標の名前（用語の説明 Term の言葉）
  outcome: keyof typeof TERMS; // 県の報告書での呼び名（components/Ladder.astro と同じ）
  unit: string;
  measure: TermWord; // 色にする区分の名前（Term の言葉）
  param: string; // 区分の絞り込みの URL のクエリの名前
  shapes: boolean; // 凡例と中身の札に状態の形を付けるか（主要指標は付けない。docs/design.md の2章）
  cats: MapCat[];
}
export const MAP_KINDS: MapKindInfo[] = [
  { kind: 'shuyou', term: '主要指標', outcome: '最終アウトカム', unit: '指標', measure: '主要指標の達成率', param: 'shuyou', shapes: false, cats: SHUYOU_BINS.map((b) => ({ key: b.key, label: b.label, tone: b.tone })) },
  { kind: 'seika', term: '成果指標', outcome: '初期アウトカム', unit: '指標', measure: '達成率', param: 'rate', shapes: true, cats: RATE_BINS.map((b) => ({ key: b.key, label: b.key, tone: b.tone })) },
  { kind: 'katsudou', term: '活動指標', outcome: 'アウトプット', unit: '件', measure: '進捗状況', param: 'status', shapes: true, cats: STATUSES.map((s) => ({ key: s.key, label: s.key, tone: s.tone })) },
];
const infoOf = (kind: MapKind) => MAP_KINDS.find((k) => k.kind === kind)!;

// マス1つ。c は年度（YEARS の順）ごとの区分の番号（cats の何番目か。報告に無い年度は '-'）
export interface MapCell { s: number; c: string; dept: string; themes: string[] }
// 中身（JSON の形。ブラウザのスクリプト scripts/indicator-map.ts もこの型で読む）。parents は基本施策・施策、items はマスと同じ並び。
// check はマスの並びと区分の目印（mapCheck。ページのマス目にも書き、違えば中身を出さない）
export interface MapData { check: string; parents: [code: string, name: string, href: string][]; items: MapItem[] }
export interface MapItem {
  n: string; // 名前（最新の報告の名前。活動指標は主な取組の名前）
  h: string; // ページ（主要指標は、基本施策のページのその指標のカード）
  p: number; // parents の何番目か
  y: (MapYear | null)[]; // YEARS の順。報告の無い年度は null
}
// 1年度分。n はその年度の印字の名前が最新の名前と違うときだけ。sub は活動指標の名前。v は値の名前と値（画面に出す文字）
export interface MapYear { n?: string; sub?: string; v: [label: string, value: string][] }

const catCode = (kind: MapKind, key: string) => {
  const i = infoOf(kind).cats.findIndex((c) => c.key === key);
  if (i < 0 || i > 9) throw new Error(`指標のマップの区分が無い: ${kind} ${key}`);
  return String(i);
};
const codes = <T>(kind: MapKind, ys: (T | null)[], keyOf: (x: T) => string) => ys.map((x) => (x ? catCode(kind, keyOf(x)) : '-')).join('');

// 親（基本施策・施策）の表。同じ親は1回だけ書く
function parentTable() {
  const list: MapData['parents'] = [];
  const index = new Map<string, number>();
  const of = (code: string, name: string, href: string) => {
    if (!index.has(href)) index.set(href, list.push([code, name, href]) - 1);
    return index.get(href)!;
  };
  return { list, of };
}

interface Built { cells: MapCell[]; data: Omit<MapData, 'check'> }

// 主要指標。マスは最新の報告の概要版の表の行で、ほかの年度は表の順（no）で結ぶ（どの年度も基本施策ごとの行の数は同じ）。R5 は概要版の表が画像で読めない（docs/data.md）。
// R7で入れ替わった指標は、R6までのマスを別に作る（buildShuyou）
const half = (raw: string) => halfWidth(raw).replace(/％/g, '%');
const withRef = (v: string, ref: string | null) => (v && eraRef(ref) ? `${v}（${eraRef(ref)}）` : v || '—');
function shuyouValues(x: ShuyouGaiyouRow): MapYear['v'] {
  const [b, a, t] = sameScale([half(x.base_raw), half(x.actual_raw), half(x.target_raw)]);
  return [['基準値', withRef(b, x.base_ref)], ['実績値', withRef(a, x.actual_ref)], ['目標値', withRef(t, x.target_ref)], ['達成率', shuyouRateText(x)]];
}
// 主要指標を1指標1つの四角にしたときの中身（将来像のページの頭。components/Ladder.astro）。値はマップの吹き出しと同じ最新の報告の値で、名前の下に基本施策を書く
export const shuyouCells = (rows: ShuyouStatus[]): CellItem[] => rows.map((r) => ({
  key: shuyouBinOf(r.bin).label, name: r.name, href: r.href,
  sub: { label: '基本施策', name: r.kihon.name, href: `/kihon/${r.kihon.id}/`, code: r.kihon.code },
  vals: shuyouValues(r),
}));
function buildShuyou(): Built {
  const rows = load('shuyou_gaiyou');
  const kihon = new Map(getKihonList().map((k) => [k.id, k]));
  const parents = parentTable();
  // 年度は概要版の行の番号でつなぐ。R7で別の指標に入れ替わった番号（4-(1) の No.38、5-(2) の No.44・45）の前の年度は、別の指標なので
  // 基本施策ページのカードと同じく別のマスにし、基本施策の中で最新の報告の指標の後ろに置く（成果指標のマスと同じく、最新の年度では隠れる）
  const used = new Set<ShuyouGaiyouRow>();
  const take = (head: ShuyouGaiyouRow) => {
    const ys = YEARS.map((y) => rows.find((x) => !used.has(x) && x.year === y && x.no === head.no && x.kihon_id === head.kihon_id && sameShuyouCard(x, head)) ?? null);
    for (const x of ys) if (x) used.add(x);
    return ys;
  };
  const entries = getShuyouStatus().map(take);
  for (const r of [...rows].sort((a, b) => b.year - a.year || a.no - b.no)) {
    if (used.has(r)) continue;
    const ys = take(r);
    const at = entries.findLastIndex((e) => e.some((x) => x?.kihon_id === r.kihon_id));
    entries.splice(at + 1, 0, ys);
  }
  const cells: MapCell[] = [];
  const items: MapItem[] = [];
  for (const ys of entries) {
    const head = ys.findLast((x) => x != null)!;
    const k = kihon.get(head.kihon_id)!;
    cells.push({ s: k.shouraizou, c: codes('shuyou', ys, shuyouBin), dept: '', themes: [] });
    items.push({
      n: head.name, h: shuyouCardHref(head), p: parents.of(k.code, k.name, `/kihon/${k.id}/`),
      y: ys.map((x) => x && { ...(x.name !== head.name && { n: x.name }), v: shuyouValues(x) }),
    });
  }
  return { cells, data: { parents: parents.list, items } };
}

// 成果指標。マスは年度をまたいだ指標のまとまり（成果指標をさがすの行と同じ）。部局とくらしのテーマも成果指標をさがすと同じ決め方
function seikaValues(x: SeikaRow): MapYear['v'] {
  const ref = refText(x.actual_ref_year);
  return [
    ['基準値', withUnit(x.base_raw, x.unit)],
    ['実績値', `${withUnit(x.actual_raw, x.unit)}${ref ? `（${ref}）` : ''}`],
    [`計画値（${yearLabel(x.year)}）`, withUnit(x.plan_raw[planIndex(x.year)], x.unit)],
    [`目標値（${x.target_year}）`, withUnit(x.target_raw, x.unit)],
    ['達成率', rateText(x)],
    ['見通し', x.judgement || '—'],
  ];
}
function buildSeika(): Built {
  const parents = parentTable();
  const cells: MapCell[] = [];
  const items: MapItem[] = [];
  for (const g of getSeikaGroups()) {
    const ys = YEARS.map((y) => g.years[y] ?? null);
    cells.push({ s: g.shisaku.shouraizou, c: codes('seika', ys, rateBin), dept: seikaDept(g.latest), themes: themeIdsOf(g.shisaku.id) });
    items.push({
      n: g.name, h: g.href, p: parents.of(g.shisaku.code, g.shisaku.name, `/shisaku/${g.shisaku.id}/`),
      y: ys.map((x) => x && { ...(seikaName(x) !== g.name && { n: seikaName(x) }), v: seikaValues(x) }),
    });
  }
  return { cells, data: { parents: parents.list, items } };
}

// 活動指標。マスは年度をまたいだ主な取組のまとまり（取組をさがすの行と同じ。部局は最新の報告の所管部局）。
// 活動指標の名前は総括報告書の欄（無ければ部局の検証票）、計画と実績は総括報告書の「目標」「実績」（行が2つ以上なら「／」でつなぐ）、達成割合は部局の検証票（lib/data.ts の activityRuns と同じ）
function katsudouYear(g: TorikumiGroup, y: number, r: TorikumiRow): MapYear {
  const cell = (k: 'target' | 'actual') => (r.lines ? r.lines.map((l) => l[k] || '—').join(' ／ ') : r[k] || '—');
  const achs = activityAchievements(g, y);
  const ach = achs.length ? achs.map((x) => `${x.name}: ${x.text || '—'}`).join(' ／ ') : activityAchievement(g, y)?.text ?? '';
  const v: MapYear['v'] = [['計画', cell('target')], ['実績', cell('actual')]];
  if (ach) v.push(['達成割合', ach]);
  return { ...(r.name !== g.latest.name && { n: r.name }), sub: r.indicator || budgetOf(y, g.shisaku.id, g.key)?.indicator_name || '', v };
}
function buildKatsudou(): Built {
  const parents = parentTable();
  const cells: MapCell[] = [];
  const items: MapItem[] = [];
  for (const g of getTorikumiGroups()) {
    const ys = YEARS.map((y) => g.years[y] ?? null);
    cells.push({ s: g.shisaku.shouraizou, c: codes('katsudou', ys, statusOf), dept: g.dept, themes: themeIdsOf(g.shisaku.id) });
    items.push({ n: g.latest.name, h: g.href, p: parents.of(g.shisaku.code, g.shisaku.name, `/shisaku/${g.shisaku.id}/`), y: ys.map((r, i) => r && katsudouYear(g, YEARS[i], r)) });
  }
  return { cells, data: { parents: parents.list, items } };
}

const all = once((): Record<MapKind, Built> => ({ shuyou: buildShuyou(), seika: buildSeika(), katsudou: buildKatsudou() }));
export const mapCells = (kind: MapKind) => all()[kind].cells;

// マスの HTML。約2,000個あるので、Astro が範囲をしぼるための属性を付けず、短く書くため文字列にする（見た目は pages/map.astro の全体の CSS）。
// 最新の年度の色を付け、最新の報告に無いマスは隠す（スクリプトが動かないときは、最新の年度のまま見える）
const LATEST_AT = YEARS.indexOf(LATEST);
export function cellHtml(kind: MapKind, c: MapCell) {
  const k = c.c[LATEST_AT];
  const tone = k === '-' ? 'blank' : infoOf(kind).cats[Number(k)].tone;
  return `<i class="mc tone-${tone}" data-c="${c.c}"${c.dept ? ` data-d="${esc(c.dept)}"` : ''}${c.themes.length ? ` data-t="${c.themes.join(' ')}"` : ''}${k === '-' ? ' hidden' : ''}></i>`;
}
// 将来像ごとの行。行の中に主要指標・成果指標・活動指標のマスを並べる（どの指標も報告書の順のまま将来像で区切るので、行をまたいでも報告書の順）。
// n は年度をまたいだマスの数、latest は最新の報告にあるマスの数
export function mapRows() {
  const ids = [...new Set(MAP_KINDS.flatMap(({ kind }) => mapCells(kind).map((c) => c.s)))].sort((a, b) => a - b);
  return ids.map((s) => ({
    s,
    tiers: MAP_KINDS.map(({ kind }) => {
      const cs = mapCells(kind).filter((c) => c.s === s);
      return { kind, n: cs.length, latest: cs.filter((c) => c.c[LATEST_AT] !== '-').length, html: cs.map((c) => cellHtml(kind, c)).join('') };
    }),
  }));
}
// 年度ごとのマスの数（YEARS の順）
export const mapCounts = (kind: MapKind) => YEARS.map((_, i) => mapCells(kind).filter((c) => c.c[i] !== '-').length);

// マスの並びと区分の目印。公開し直した直後に、キャッシュした前のページ（5分）が新しい控えの JSON を読んだとき、マスの並びが違えば別の指標の中身を出してしまうので、
// JSON とページのマス目（data-check）の両方に書き、同じときだけ中身を出す
export const mapCheck = (kind: MapKind) => sha8(JSON.stringify(mapCells(kind)));

// 書き出す JSON（1回のビルドで1度だけ作る）と場所。名前は中身の SHA-256 の先頭8桁（計画の目次のデータ lib/tree-data.ts と同じ）
export const mapDataJson = onceBy((kind: MapKind) => JSON.stringify({ check: mapCheck(kind), ...all()[kind].data } satisfies MapData));
export const mapDataHash = (kind: MapKind) => sha8(mapDataJson(kind));
export const mapDataPath = (kind: MapKind) => `/map/${kind}-${mapDataHash(kind)}.json`;
// 名前の変わらない控え。公開し直した直後に、キャッシュした前のページ（5分）から開くと、前のハッシュのファイルはもう無いので、こちらを読む
export const mapDataFallback = (kind: MapKind) => `/map/${kind}.json`;

// キーワードで探す文字（JSON の形。scripts/indicator-map.ts もこの型で読む）。指標ごとに、マスと同じ並びで、名前（年度で変わった名前も）・活動指標の名前・
// 親（基本施策・施策）の番号と名前を空白でつないだもの。中身の JSON を3つとも読むと重い（gzip で約220KB）ので、探す文字だけを1つのファイルにし、キーワードの欄に入ったときに読む
export type MapSearch = Record<MapKind, { check: string; texts: string[] }>;
function buildSearch(): MapSearch {
  const of = (kind: MapKind) => {
    const { parents, items } = all()[kind].data;
    const texts = items.map((x) => {
      const ys = x.y.filter((y): y is MapYear => y != null);
      const [code, name] = parents[x.p];
      return [...new Set([x.n, ...ys.map((y) => y.n), ...ys.map((y) => y.sub)].filter(Boolean))].concat(code, name).join(' ');
    });
    return { check: mapCheck(kind), texts };
  };
  return { shuyou: of('shuyou'), seika: of('seika'), katsudou: of('katsudou') };
}
export const mapSearchJson = once(() => JSON.stringify(buildSearch()));
export const mapSearchPath = () => `/map/search-${sha8(mapSearchJson())}.json`;
export const MAP_SEARCH_FALLBACK = '/map/search.json';
