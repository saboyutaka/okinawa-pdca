// 沖縄県PDCA 以外の評価（data/extracted/kanko・ikkatsu・hyoka）をページで使う形にまとめる。
// 観光ロードマップは「個別計画」のページ（/keikaku/）に、一括交付金の事後評価は施策のページに、評価検証報告書は基本施策のページに出す
import fs from 'node:fs';
import path from 'node:path';
import { load, getShisaku, getTorikumiGroups, torikumiPage, seikaHrefByName } from './data.js';

// 県が公表しているほかの評価の一覧（data/reference/evaluations.json。人が調べて書いたもの）
export const getEvaluations = () => JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '../data/reference/evaluations.json'), 'utf-8'));

// ---------------------------------------------------------------- 出典

// 県のPDFへのリンク。kind は抽出結果のフォルダ（kanko・ikkatsu・hyoka）
const sourceMaps = new Map();
export function planSourceLink(kind, id, page) {
  if (!sourceMaps.has(kind)) sourceMaps.set(kind, new Map(load(`${kind}/sources`).map((s) => [s.id, s])));
  const s = sourceMaps.get(kind).get(id);
  if (!s) return null;
  const text = s.link_text.replace(/\s*（\s*(PDF|zip|Excel)[^）]*）\s*$/i, '').trim();
  return page ? { href: `${s.file_url}#page=${page}`, label: `${text} ${page}ページ` } : { href: s.file_url, label: text };
}
export const planSources = (kind) => load(`${kind}/sources`);

// ---------------------------------------------------------------- 観光ロードマップ

export const KANKO = {
  name: '沖縄観光推進ロードマップ',
  short: '観光ロードマップ',
  basis: '第6次沖縄県観光振興基本計画',
  period: '前期（R4〜R6）',
  dept: '文化観光スポーツ部 観光政策課',
  href: '/keikaku/kanko/',
};
// 報告のある年度。R4 は本編が読めないので、概要版の件数（years.json）だけ
export const RM_YEARS = [2022, 2023, 2024];
export const RM_LATEST = 2024;
// 成果指標の「達成状況」（基準値と比べた向き）
export const RM_JUDGEMENTS = [
  { key: '前進', tone: 'good', shape: 'circle', note: '基準値より良くなっている' },
  { key: '横ばい', tone: 'warning', shape: 'diamond', note: '基準値と変わらない' },
  { key: '後退', tone: 'critical', shape: 'square', note: '基準値より悪くなっている' },
  { key: 'その他', tone: 'blank', note: '目標値の設定が難しいなどで比べられない' },
];
export const rmJudgementOf = (key) => RM_JUDGEMENTS.find((j) => j.key === key) || RM_JUDGEMENTS[3];

export const kankoYears = () => load('kanko/years');
export const kankoKihon = () => load('kanko/kihon');

// 施策展開のページの URL と、その中の施策の見出し
export const kankoTenkaiHref = (tenkaiId) => `/keikaku/kanko/${tenkaiId}/`;
export const kankoShisakuHref = (s) => `${kankoTenkaiHref(s.tenkai_id)}#rm-${s.id}`;

// 年度をまたいで同じ名前（key）を1行にまとめる（沖縄県PDCA の torikumiRows と同じ考え方）
function groupByKey(rows) {
  const m = new Map();
  for (const r of [...rows].sort((a, b) => b.year - a.year || (a.no ?? 0) - (b.no ?? 0))) {
    if (!m.has(r.key)) m.set(r.key, { key: r.key, latest: r, years: {} });
    m.get(r.key).years[r.year] ??= r;
  }
  return [...m.values()].sort((a, b) => b.latest.year - a.latest.year || (a.latest.no ?? 0) - (b.latest.no ?? 0));
}

// 沖縄県PDCA の主な取組（同じ年度に同じ名前のもの）。取組のページがあるものだけ。name は沖縄県PDCA での取組名（よく似た名前で結び付けたものは違う）
let groupNames;
function pdcaLinksOf(t) {
  groupNames ??= new Map(getTorikumiGroups().map((g) => [g.href, g.latest.name]));
  return (t.pdca || [])
    .map((p) => ({ ...p, href: torikumiPage(p.shisaku_id, p.key), shisaku: getShisaku(p.shisaku_id) }))
    .filter((p) => p.href && p.shisaku)
    .map((p) => ({ ...p, name: groupNames.get(p.href) }));
}

let rmShisaku;
export function kankoShisakuList() {
  if (rmShisaku) return rmShisaku;
  const tori = new Map();
  for (const t of load('kanko/torikumi')) {
    if (!tori.has(t.shisaku_id)) tori.set(t.shisaku_id, []);
    tori.get(t.shisaku_id).push(t);
  }
  const seika = new Map();
  for (const s of load('kanko/seika')) {
    if (!seika.has(s.shisaku_id)) seika.set(s.shisaku_id, []);
    seika.get(s.shisaku_id).push(s);
  }
  const byId = new Map();
  for (const s of load('kanko/shisaku')) {
    if (!byId.has(s.id)) byId.set(s.id, { id: s.id, years: {} });
    byId.get(s.id).years[s.year] = s;
  }
  rmShisaku = [...byId.values()].map((v) => {
    const latest = v.years[RM_LATEST] || Object.values(v.years).sort((a, b) => b.year - a.year)[0];
    const torikumi = groupByKey(tori.get(v.id) || []).map((g) => ({ ...g, pdca: pdcaLinksOf(g.latest) }));
    const seikaRows = groupByKey(seika.get(v.id) || []).map((g) => ({
      ...g,
      pdca: (g.latest.pdca || []).map((p) => ({ ...p, href: seikaHrefByName(p.shisaku_id, p.name), shisaku: getShisaku(p.shisaku_id) })).filter((p) => p.href),
    }));
    return { ...latest, years: v.years, torikumi, seika: seikaRows };
  });
  const order = (id) => id.split('-').map((x) => (/^\d+$/.test(x) ? x.padStart(3, '0') : x)).join('-');
  rmShisaku.sort((a, b) => order(a.id).localeCompare(order(b.id)));
  return rmShisaku;
}

export function kankoTenkaiList() {
  const m = new Map();
  for (const s of kankoShisakuList()) {
    if (!m.has(s.tenkai_id)) m.set(s.tenkai_id, { id: s.tenkai_id, code: s.tenkai_code, name: s.tenkai_name, kihon_id: s.kihon_id, shisaku: [] });
    m.get(s.tenkai_id).shisaku.push(s);
  }
  return [...m.values()];
}
export const kankoTenkai = (id) => kankoTenkaiList().find((t) => t.id === id);

// その年度の観光ロードマップの主な取組（延べ）
export const kankoTorikumi = (year) => load('kanko/torikumi').filter((t) => t.year === year);
export const kankoSeika = (year) => load('kanko/seika').filter((s) => s.year === year);

// 沖縄県PDCA の主な取組（施策ID・key）が、観光ロードマップのどの施策に載っているか。取組のページで使う
let reverse;
export function kankoOfPdca(shisakuId, key) {
  if (!reverse) {
    reverse = new Map();
    for (const s of kankoShisakuList()) {
      for (const g of s.torikumi) {
        for (const y of Object.keys(g.years)) {
          for (const p of g.years[y].pdca || []) {
            const k = `${p.shisaku_id}|${p.key}`;
            if (!reverse.has(k)) reverse.set(k, []);
            const list = reverse.get(k);
            if (!list.some((x) => x.rm.id === s.id && x.row.key === g.key)) list.push({ rm: s, row: g });
          }
        }
      }
    }
  }
  return reverse.get(`${shisakuId}|${key}`) || [];
}

// 沖縄県PDCA の施策に入っている取組のうち、観光ロードマップでも評価されているもの（施策のページで使う）
export function kankoOfPdcaShisaku(shisaku) {
  const out = new Map();
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
export const GRADES = [
  { key: '達成', mark: '◎', tone: 'good', shape: 'circle', note: '達成率100%' },
  { key: '概ね達成', mark: '○', tone: 'warning', shape: 'diamond', note: '達成率70%以上100%未満' },
  { key: '一部達成', mark: '△', tone: 'serious', shape: 'up', note: '達成率70%未満で、一部の目標値は達成' },
  { key: '未達成', mark: '未', tone: 'critical', shape: 'square', note: '達成率70%未満で、どの目標値も未達成' },
];
export const gradeOf = (label) => GRADES.find((g) => g.key === label);

let ikkatsuIndex;
// 施策ごとの事業（年度をまたいで同じ名前の事業を1行に）。1つの事業が複数の施策コードを持つときは、それぞれの施策に出す
export function ikkatsuOf(shisakuId) {
  if (!ikkatsuIndex) {
    const m = new Map();
    for (const j of load('ikkatsu/jigyo')) {
      for (const sid of j.shisaku_ids) {
        if (!m.has(sid)) m.set(sid, []);
        m.get(sid).push(j);
      }
    }
    ikkatsuIndex = new Map([...m].map(([sid, rows]) => [sid, groupByKey(rows)]));
  }
  return ikkatsuIndex.get(shisakuId) || [];
}
export const ikkatsuRows = (year) => load('ikkatsu/jigyo').filter((j) => j.year === year);

// ---------------------------------------------------------------- 評価検証報告書

export const HYOKA = { name: '新・沖縄21世紀ビジョン基本計画 評価検証報告書', period: 'R4〜R6', published: '令和8年5月' };
let hyokaIndex;
export function hyokaOf(kihonId) {
  hyokaIndex ??= new Map(load('hyoka/kihon').map((k) => [k.id, k]));
  return hyokaIndex.get(kihonId);
}
