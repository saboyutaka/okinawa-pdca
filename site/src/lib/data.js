// 抽出済みデータ（data/extracted/soukatsu）をビルド時に読み込み、ページで使う形にまとめる。
// ブラウザには JSON を配らず、各ページの HTML として書き出す（県民のスマホで重くしないため）。
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.cwd(), '../data/extracted/soukatsu');
const cache = new Map();
function load(name) {
  if (!cache.has(name)) {
    cache.set(name, JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf-8')));
  }
  return cache.get(name);
}

export const YEARS = [2022, 2023, 2024, 2025];
export const LATEST = YEARS[YEARS.length - 1];
export const yearLabel = (y) => `R${y - 2018}`;
export const yearLong = (y) => `令和${y - 2018}年度`;
// R4〜R6 は前期実施計画（目標年度R6）、R7からは中期実施計画（目標年度R9）。基準値・目標値が切り替わる
export const planLabel = (y) => (y <= 2024 ? '前期実施計画（R4〜R6）' : '中期実施計画（R7〜R9）');

// 主な取組の進捗状況。「記載なし」は PDF の欄が空欄・「-」のもの
export const STATUSES = [
  { key: '順調', tone: 'good', note: '計画の90%以上' },
  { key: '概ね順調', tone: 'warning', note: '75%以上90%未満' },
  { key: 'やや遅れ', tone: 'serious', note: '60%以上75%未満' },
  { key: '大幅遅れ', tone: 'critical', note: '60%未満' },
  { key: '未着手', tone: 'none', note: '活動に未着手' },
  { key: '記載なし', tone: 'blank', note: '報告書の欄が空欄など' },
];
export const statusOf = (t) => t.status || '記載なし';
export const toneOfStatus = (s) => (STATUSES.find((x) => x.key === s) || STATUSES[5]).tone;

// 施策の推進状況（県の判定区分）。R5から施策ごとに公表されている
export const JUDGES = [
  { key: 'A', label: '順調', tone: 'good' },
  { key: 'B', label: '概ね順調', tone: 'warning' },
  { key: 'C', label: '取組は順調だが、成果は遅れている', tone: 'serious' },
  { key: 'D', label: '取組は概ね順調だが、成果は遅れている', tone: 'serious' },
  { key: 'E', label: '成果は順調だが、取組は遅れている', tone: 'serious' },
  { key: 'F', label: '成果は概ね順調だが、取組は遅れている', tone: 'serious' },
  { key: 'G', label: '大幅遅れ', tone: 'critical' },
];
export const judgeOf = (key) => JUDGES.find((j) => j.key === key);

// 成果指標の計画値に対する達成率の区分（概要版と同じ区切り）
export const RATE_BINS = [
  { key: '100%以上', tone: 'good' },
  { key: '60%以上100%未満', tone: 'warning' },
  { key: '0%超60%未満', tone: 'serious' },
  { key: '0%以下', tone: 'critical' },
  { key: '達成率なし', tone: 'blank', note: '報告書の達成率が「-」など' },
];
export function rateBin(s) {
  if (s.rate_raw === '達成') return '100%以上';
  if (s.rate_raw === '未達成') return '0%以下';
  if (s.rate == null) return '達成率なし';
  if (s.rate >= 100) return '100%以上';
  if (s.rate >= 60) return '60%以上100%未満';
  if (s.rate > 0) return '0%超60%未満';
  return '0%以下';
}

// 成果指標の「達成状況」欄（目標の見通し）
export const JUDGEMENTS = [
  { key: '目標達成', tone: 'good' },
  { key: '目標達成の見込み', tone: 'good' },
  { key: '達成に努める', tone: 'warning' },
  { key: '達成は困難', tone: 'critical' },
];
export const toneOfJudgement = (j) => JUDGEMENTS.find((x) => x.key === j)?.tone;

const DEPT_RE = /(知事公室|県警本部|警察本部|教育庁|企業局|病院事業局|.+?部)/g;
export const splitDepts = (s) => (s || '').match(DEPT_RE) || [];

export function countBy(rows, keyFn, keys) {
  const out = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of rows) {
    const k = keyFn(r);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

// ---------------------------------------------------------------- 将来像・基本施策

export function getShouraizou() {
  return load('shouraizou').filter((s) => s.year === LATEST);
}

export function getKihonList() {
  const all = load('kihon');
  return all
    .filter((k) => k.year === LATEST)
    .map((k) => ({
      ...k,
      // 目指す姿が読み取れなかった年度は、他の年度の記載で補う（基本計画で固定の文章）
      mezasu: k.mezasu || all.find((x) => x.id === k.id && x.mezasu)?.mezasu || '',
    }));
}

export function getShuyou(kihonId) {
  return load('shuyou').filter((s) => s.kihon_id === kihonId);
}

export function getShuyouByYear(year) {
  return load('shuyou').filter((s) => s.year === year);
}

// ---------------------------------------------------------------- 施策

let shisakuIndex;
function buildShisakuIndex() {
  const byId = new Map();
  for (const s of load('shisaku')) {
    if (!byId.has(s.id)) byId.set(s.id, { id: s.id, years: {} });
    byId.get(s.id).years[s.year] = s;
  }
  const tori = new Map();
  for (const t of load('torikumi')) {
    if (!tori.has(t.shisaku_id)) tori.set(t.shisaku_id, []);
    tori.get(t.shisaku_id).push(t);
  }
  const seika = new Map();
  for (const s of load('seika')) {
    if (!seika.has(s.shisaku_id)) seika.set(s.shisaku_id, []);
    seika.get(s.shisaku_id).push(s);
  }
  const list = [];
  for (const [id, v] of byId) {
    const latest = v.years[LATEST];
    list.push({
      ...latest,
      years: v.years,
      judges: Object.fromEntries(YEARS.map((y) => [y, v.years[y]?.judge ?? null])),
      depts: splitDepts(latest.kankei),
      torikumi: tori.get(id) || [],
      seika: seika.get(id) || [],
    });
  }
  const order = (sid) => sid.split('-').map((x) => (/^\d+$/.test(x) ? x.padStart(3, '0') : x)).join('-');
  list.sort((a, b) => order(a.id).localeCompare(order(b.id)));
  return list;
}

export function getShisakuList() {
  shisakuIndex ??= buildShisakuIndex();
  return shisakuIndex;
}

export function getShisaku(id) {
  return getShisakuList().find((s) => s.id === id);
}

// 年度をまたいで同じ取組を1行にまとめる。名前（key）が同じものを同じ取組とみなす
export function torikumiRows(shisaku) {
  const rows = new Map();
  const sorted = [...shisaku.torikumi].sort((a, b) => b.year - a.year || a.no - b.no);
  for (const t of sorted) {
    if (!rows.has(t.key)) rows.set(t.key, { key: t.key, latest: t, years: {} });
    rows.get(t.key).years[t.year] = t;
  }
  return [...rows.values()].sort((a, b) => b.latest.year - a.latest.year || a.latest.no - b.latest.no);
}

// 成果指標も名前で年度をまたいでまとめる（R7で指標が入れ替わった施策は別の行になる）。
// 名前の正規化は抽出側の取組の key と同じ規則。同じ施策に同じ名前の指標が複数ある（男女別など）ときは出てくる順で区別する
const nameKey = (s) => s.normalize('NFKC').replace(/[\s・･、，,。.（）()「」『』〔〕]/g, '');
export function seikaRows(shisaku) {
  const rows = new Map();
  const seen = new Map();
  const sorted = [...shisaku.seika].sort((a, b) => b.year - a.year);
  for (const s of sorted) {
    const base = nameKey(s.name);
    const n = (seen.get(`${s.year}|${base}`) || 0) + 1;
    seen.set(`${s.year}|${base}`, n);
    const k = `${base}#${n}`;
    if (!rows.has(k)) rows.set(k, { key: k, latest: s, years: {} });
    rows.get(k).years[s.year] = s;
  }
  return [...rows.values()].sort((a, b) => b.latest.year - a.latest.year);
}

// ---------------------------------------------------------------- 年度をまたいだ取組・成果指標

export const DELAYS = new Set(['やや遅れ', '大幅遅れ', '未着手']);

// 全施策の取組を、年度をまたいで1行にまとめたもの。部局は最新年度の所管部局（docs/data.md 7.2）
let torikumiGroups;
export function getTorikumiGroups() {
  torikumiGroups ??= getShisakuList().flatMap((s) =>
    torikumiRows(s).map((row) => {
      const statuses = YEARS.map((y) => (row.years[y] ? statusOf(row.years[y]) : null));
      return {
        ...row,
        shisaku: s,
        dept: row.latest.dept,
        section: row.latest.section,
        statuses,
        inAllYears: statuses.every(Boolean),
        delayYears: statuses.filter((x) => DELAYS.has(x)).length,
      };
    }),
  );
  return torikumiGroups;
}

// 全施策の成果指標を、年度をまたいで1行にまとめたもの
let seikaGroups;
export function getSeikaGroups() {
  seikaGroups ??= getShisakuList().flatMap((s) => seikaRows(s).map((row) => ({ ...row, shisaku: s })));
  return seikaGroups;
}

// ---------------------------------------------------------------- 部局

// 並びは県の「各部局等の検証票」一覧の順。R5の組織再編後の名前
export const DEPTS = [
  { slug: 'chiji-koshitsu', name: '知事公室' },
  { slug: 'somu', name: '総務部' },
  { slug: 'kikaku', name: '企画部' },
  { slug: 'kankyo', name: '環境部' },
  { slug: 'kodomo-mirai', name: 'こども未来部' },
  { slug: 'seikatsu-fukushi', name: '生活福祉部' },
  { slug: 'hoken-iryo-kaigo', name: '保健医療介護部' },
  { slug: 'norin', name: '農林水産部' },
  { slug: 'shoko', name: '商工労働部' },
  { slug: 'bunka-kanko', name: '文化観光スポーツ部' },
  { slug: 'doboku', name: '土木建築部' },
  { slug: 'kyoiku', name: '教育庁' },
  { slug: 'kigyo', name: '企業局' },
  { slug: 'keisatsu', name: '県警本部' },
  { slug: 'byoin', name: '病院事業局' },
];
// R5の組織再編で無くなった部。R4の報告書にだけ出てくる
export const FORMER_DEPTS = ['子ども生活福祉部', '保健医療部'];
export const REORGANIZED = new Set(['知事公室', 'こども未来部', '生活福祉部', '保健医療介護部']);
export const deptOf = (section) => (section || '').match(DEPT_RE)?.[0] || '';

// R4の旧部局の課 → R5でその課の取組が最も多く移った先の課（成果指標の担当部課の読み替えに使う）
let sectionMap;
function formerSectionMap() {
  if (sectionMap) return sectionMap;
  const r5 = new Map(load('torikumi').filter((t) => t.year === 2023).map((t) => [`${t.shisaku_id}|${t.key}`, t.section]));
  const votes = new Map();
  for (const t of load('torikumi')) {
    if (t.year !== 2022 || !FORMER_DEPTS.includes(t.dept)) continue;
    const to = r5.get(`${t.shisaku_id}|${t.key}`);
    if (!to) continue;
    const v = votes.get(t.section) || new Map();
    v.set(to, (v.get(to) || 0) + 1);
    votes.set(t.section, v);
  }
  sectionMap = new Map([...votes].map(([from, v]) => [from, [...v].sort((a, b) => b[1] - a[1])[0][0]]));
  return sectionMap;
}
// 成果指標の担当部局（R4の旧部局名は読み替える）
export function seikaDept(s) {
  const section = s.year === 2022 ? formerSectionMap().get(s.dept) || s.dept : s.dept;
  return deptOf(section);
}

// ---------------------------------------------------------------- 全体集計

export function getTorikumi(year) {
  return load('torikumi').filter((t) => t.year === year);
}
export function getSeika(year) {
  return load('seika').filter((s) => s.year === year);
}

// ---------------------------------------------------------------- 出典

let sources;
export function sourceOf(id) {
  sources ??= new Map(load('sources').map((s) => [s.id, s]));
  return sources.get(id);
}

// 県のPDFへのリンク。zip の中のPDFはページ指定できないので zip へのリンクにする
export function sourceLink(id, page) {
  const s = sourceOf(id);
  if (!s) return null;
  // リンク文言の末尾の「（PDF 609.1KB）」などは除く
  const text = s.link_text.replace(/\s*（\s*(PDF|zip|Excel)[^）]*）\s*$/i, '');
  if (s.zip_member) {
    return { href: s.file_url, label: `${text}（zip内 ${s.zip_member} の${page}ページ）` };
  }
  return { href: `${s.file_url}#page=${page}`, label: `${text} ${page}ページ` };
}
