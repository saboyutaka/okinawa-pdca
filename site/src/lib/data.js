// 抽出済みデータ（data/extracted/soukatsu）をビルド時に読み込み、ページで使う形にまとめる。
// ブラウザには JSON を配らず、各ページの HTML として書き出す（県民のスマホで重くしないため）。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), '../data/extracted');
const cache = new Map();
// name は soukatsu/ の下のファイル名。部局票の抽出結果は 'bukyoku/torikumi' のように指定する
function load(name) {
  const rel = name.includes('/') ? name : `soukatsu/${name}`;
  if (!cache.has(rel)) {
    cache.set(rel, JSON.parse(fs.readFileSync(path.join(ROOT, `${rel}.json`), 'utf-8')));
  }
  return cache.get(rel);
}

export const YEARS = [2022, 2023, 2024, 2025];
export const LATEST = YEARS[YEARS.length - 1];
export const yearLabel = (y) => `R${y - 2018}`;
export const yearLong = (y) => `令和${y - 2018}年度`;
// R4〜R6 は前期実施計画（目標年度R6）、R7からは中期実施計画（目標年度R9）。基準値・目標値が切り替わる
export const planLabel = (y) => (y <= 2024 ? '前期実施計画（R4〜R6）' : '中期実施計画（R7〜R9）');
// 成果指標の計画値の欄は計画期間の3年分が並ぶ。その年度の計画値が何番目か（scripts/check_extracted.py の plan_index と同じ）
export const planIndex = (y) => (y <= 2024 ? y - 2022 : y - 2025);
// 報告書の表記に単位を付ける。数字だけの欄にだけ付ける（「35件（R２年）」のように単位があるものはそのまま）
export const withUnit = (raw, unit) => (raw && /^[-△]?[\d,.]+$/.test(raw) && unit ? `${raw}${unit}` : raw || '—');

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

// 施策の判定の移り変わり（施策をさがすの「判定の移り変わり」）。数え方はここだけで決め、施策の trends に入れる。判定は R5 から（R4 は公表されていない）。
// 上がった・下がったは、判定を A 順調 → B 概ね順調 → C〜F（取組か成果が遅れている）→ G 大幅遅れ の順に並べて前の年度と比べる（C〜F の中での入れ替わりは数えない）
const JUDGE_RANK = { good: 0, warning: 1, serious: 2, critical: 3 };
const judgeRank = (key) => JUDGE_RANK[judgeOf(key)?.tone] ?? null;
const bothYears = (r) => r.at(-2) != null && r.at(-1) != null;
export const JUDGE_TRENDS = {
  down: (r) => bothYears(r) && r.at(-1) > r.at(-2), // 前の年度より下がった
  up: (r) => bothYears(r) && r.at(-1) < r.at(-2), // 前の年度より上がった
  streak: (r) => r.slice(-3).every((x) => x != null && x >= JUDGE_RANK.serious), // 最新の年度まで3年続けて C〜G
};

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
    const judges = Object.fromEntries(YEARS.map((y) => [y, v.years[y]?.judge ?? null]));
    const ranks = YEARS.map((y) => judgeRank(judges[y]));
    list.push({
      ...latest,
      years: v.years,
      judges,
      trends: Object.keys(JUDGE_TRENDS).filter((k) => JUDGE_TRENDS[k](ranks)),
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

// 成果指標の行き先: 施策ページの中の成果指標の見出し（#seika-1, #seika-2 …。施策ページの並び順）
const seikaIndex = new Map();
export function seikaAnchor(shisakuId, key) {
  if (!seikaIndex.has(shisakuId)) {
    const s = getShisaku(shisakuId);
    seikaIndex.set(shisakuId, new Map((s ? seikaRows(s) : []).map((r, i) => [r.key, `seika-${i + 1}`])));
  }
  return seikaIndex.get(shisakuId).get(key) || 'seika';
}
export const seikaHref = (shisakuId, key) => `/shisaku/${shisakuId}/#${seikaAnchor(shisakuId, key)}`;
// 成果指標1件（seika.json の行）から、年度をまたいだまとまりの key を求める
export function seikaKeyOf(row) {
  const s = getShisaku(row.shisaku_id);
  return s ? seikaRows(s).find((r) => r.years[row.year] === row)?.key : undefined;
}

// ---------------------------------------------------------------- 年度をまたいだ取組・成果指標

export const DELAYS = new Set(['やや遅れ', '大幅遅れ', '未着手']);

// 取組の4年間の様子。statuses は年度の順の進捗状況（報告の無い年度は null）。
// 取組をさがすの「4年間の様子」（/torikumi/data.json の patterns）・将来像の「今年のできごと」・トップの文章・テーマと部局の件数で、
// 同じ数え方を使う（ページごとに書くと、数とリンク先の件数がずれるため）
const isDelay = (x) => DELAYS.has(x);
export const PATTERNS = {
  delay4: (st) => st.every(Boolean) && st.filter(isDelay).length === 4, // 4年とも遅れ
  delay3: (st) => st.every(Boolean) && st.filter(isDelay).length >= 3, // 4年のうち3年以上遅れた（4年とも報告にあるもの。間に順調の年度をはさむものも入る）
  streak: (st) => st.slice(-3).every(isDelay), // 最新の年度まで3年続けて遅れ（今も遅れている）
  recover: (st) => isDelay(st.at(-2)) && st.at(-1) === '順調', // 前の年度の遅れから順調に
  newdelay: (st) => ['順調', '概ね順調'].includes(st.at(-2)) && isDelay(st.at(-1)), // 前の年度の順調・概ね順調から遅れ
  new: (st) => Boolean(st.at(-1)) && !st.at(-2), // 最新の年度で新しく出た
  ended: (st) => !st.at(-1), // 最新の年度の報告に無い（終了・名称変更）
};

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
        patterns: Object.keys(PATTERNS).filter((k) => PATTERNS[k](statuses)),
        href: torikumiHref(s.id, row.key),
      };
    }),
  );
  const hrefs = new Set();
  for (const g of torikumiGroups) {
    if (hrefs.has(g.href)) throw new Error(`取組のページの URL が重複している: ${g.href}`);
    hrefs.add(g.href);
  }
  return torikumiGroups;
}

// 取組のページの URL: /torikumi/<施策ID>/<取組名の key のハッシュ8桁>/。年度をまたいで同じ（名前が変わると別のページ）
export const torikumiSlug = (key) => crypto.createHash('sha1').update(key).digest('hex').slice(0, 8);
export const torikumiHref = (shisakuId, key) => `/torikumi/${shisakuId}/${torikumiSlug(key)}/`;

// 取組のページがあれば、その URL（部局票にしか無い施策・取組名の組み合わせには、ページが無い）
let groupHrefs;
export function torikumiPage(shisakuId, key) {
  groupHrefs ??= new Set(getTorikumiGroups().map((g) => g.href));
  const h = torikumiHref(shisakuId, key);
  return groupHrefs.has(h) ? h : null;
}

// 同じ名前の取組が別の施策にも載っているもの（総括報告書の「再掲」）
let groupsByKey;
export function repostsOf(g) {
  if (!groupsByKey) {
    groupsByKey = new Map();
    for (const x of getTorikumiGroups()) {
      if (!groupsByKey.has(x.key)) groupsByKey.set(x.key, []);
      groupsByKey.get(x.key).push(x);
    }
  }
  return groupsByKey.get(g.key).filter((x) => x.shisaku.id !== g.shisaku.id);
}

// 名前が変わった（または分割・統合された）可能性のある取組。同じ施策で、この取組が最後に載った年度の翌年度から載り始めた取組（またはその逆）のうち、
// 部局票に同じ予算事業名があるもの、または名前が似ているもの（文字の2つ組の一致率 0.5 以上）。年度をまたぐ照合は名前だけなので、その補い
const NO_BUDGET = /^([ー―\-－]|なし|県事業なし|)$/;
const budgetNameCache = new Map();
function budgetNamesOf(g) {
  const k = `${g.shisaku.id}|${g.key}`;
  if (!budgetNameCache.has(k)) {
    const m = new Map();
    for (const y of YEARS) {
      if (!g.years[y]) continue;
      for (const b of budgetOf(y, g.shisaku.id, g.key)?.budgets || []) {
        for (const n of [b.name, b.name_next]) if (!NO_BUDGET.test(budgetKey(n))) m.set(budgetKey(n), n);
      }
    }
    budgetNameCache.set(k, m);
  }
  return budgetNameCache.get(k);
}
const bigrams = (s) => {
  const k = nameKey(s);
  return new Set([...k].slice(0, -1).map((c, i) => c + k[i + 1]));
};
const similarity = (a, b) => {
  const [x, y] = [bigrams(a), bigrams(b)];
  if (!x.size || !y.size) return 0;
  return (2 * [...x].filter((v) => y.has(v)).length) / (x.size + y.size);
};
export const firstYearOf = (g) => YEARS.find((y) => g.years[y]);
export function renameCandidates(g) {
  const last = g.latest.year;
  const first = firstYearOf(g);
  const mine = budgetNamesOf(g);
  const out = [];
  for (const o of getTorikumiGroups()) {
    if (o.shisaku.id !== g.shisaku.id || o.key === g.key) continue;
    const after = last < LATEST && firstYearOf(o) === last + 1;
    const before = first > YEARS[0] && o.latest.year === first - 1;
    if (!after && !before) continue;
    const shared = [...budgetNamesOf(o)].filter(([k]) => mine.has(k)).map(([, n]) => n);
    const sim = similarity(g.latest.name, o.latest.name);
    if (shared.length || sim >= 0.5) out.push({ group: o, after, shared, sim });
  }
  return out.sort((a, b) => b.shared.length - a.shared.length || b.sim - a.sim).slice(0, 3);
}

// 部局票の「対応する成果指標」（名前）から、施策ページの成果指標の見出しへのリンクを探す（名前の空白・記号の違いは無視）
export function seikaHrefByName(shisakuId, name) {
  const s = getShisaku(shisakuId);
  const n = nameKey(name || '');
  if (!s || !n) return null;
  const row = seikaRows(s).find((r) => {
    const m = nameKey(r.latest.name);
    return m === n || n.includes(m) || m.includes(n);
  });
  return row ? seikaHref(shisakuId, row.key) : null;
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
// 部局ページの URL。部局名（「商工労働部」）でも所管部課名（「商工労働部産業政策課」）でもよい。旧部局名など該当が無ければ null
export function deptHref(nameOrSection) {
  const name = DEPTS.some((d) => d.name === nameOrSection) ? nameOrSection : deptOf(nameOrSection);
  const d = DEPTS.find((x) => x.name === name);
  return d ? `/bukyoku/${d.slug}/` : null;
}

// その年度の取組を、最新の報告での所管部局で数えるための部局（docs/data.md 7.2）
let currentDept;
export function currentDeptOf(year, shisakuId, key) {
  currentDept ??= new Map(getTorikumiGroups().flatMap((g) => Object.keys(g.years).map((y) => [`${y}|${g.shisaku.id}|${g.key}`, g.dept])));
  return currentDept.get(`${year}|${shisakuId}|${key}`) || '';
}

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
// 成果指標の担当部局（R4の旧部局名は読み替える）。担当部課に複数の課が書かれているときは最初の課で決める
export function seikaDept(s) {
  const first = (s.dept || '').split(/[、,，]/)[0];
  const section = s.year === 2022 ? formerSectionMap().get(first) || first : first;
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

// 読み込んだ県の PDF の数（取得台帳 data/raw/manifest.jsonl のうち、取得できた対象年度 R4〜R7 の PDF。zip の中の PDF は数えない）
let pdfCount;
export function getPdfCount() {
  if (pdfCount != null) return pdfCount;
  const file = path.resolve(process.cwd(), '../data/raw/manifest.jsonl');
  pdfCount = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    .filter((r) => r.sha256 && /\.pdf$/i.test(r.local_path || '') && YEARS.includes(Number(r.fiscal_year))).length;
  return pdfCount;
}

let sources;
export function sourceOf(id) {
  sources ??= new Map(load('sources').map((s) => [s.id, s]));
  return sources.get(id);
}

let bukyokuFiles;
// 県のPDFへのリンク。zip の中のPDFはページ指定できないので zip へのリンクにする
export function sourceLink(id, page) {
  // 部局票（data/raw/<部局>/...）は bukyoku/files.json に URL がある
  if (!id.startsWith('soukatsu/')) {
    bukyokuFiles ??= new Map(load('bukyoku/files').map((x) => [x.id, x]));
    const f = bukyokuFiles.get(id);
    if (!f?.file_url) return null;
    const text = (f.link_text || '').replace(/\s*（\s*(PDF|zip|Excel)[^）]*）\s*$/i, '');
    return { href: `${f.file_url}#page=${page}`, label: `${text} ${page}ページ` };
  }
  const s = sourceOf(id);
  if (!s) return null;
  // リンク文言の末尾の「（PDF 609.1KB）」などは除く
  const text = s.link_text.replace(/\s*（\s*(PDF|zip|Excel)[^）]*）\s*$/i, '');
  if (s.zip_member) {
    return { href: s.file_url, label: `${text}（zip内 ${s.zip_member} の${page}ページ）` };
  }
  return { href: `${s.file_url}#page=${page}`, label: `${text} ${page}ページ` };
}

// ---------------------------------------------------------------- 予算・財源（部局別の主な取組検証票）
// 金額は千円単位。決算額は報告年度の前年度、決算見込額は報告年度、当初予算額は翌年度のもの（docs/data.md 11）

// 財源の区分と説明（/yosan/zaigen/ で使う）。who は事業費を誰が負担するか
export const FUNDS = [
  {
    key: '県単等', series: 1,
    short: '県が自分の裁量で使えるお金で行う事業',
    who: '県（元になるお金は県税・地方交付税・県債・基金など）',
    desc: '国の補助金のように使い道が決められたお金を使わず、県が自分で使い道を決められるお金で行う事業です。元になるお金には、県民や県内の会社が納める県税のほか、国から配られる地方交付税（使い道は自由）や、借金（県債）、貯金（基金）も含まれます。「県単独」でも、県民の税金だけでまかなっているわけではありません。',
  },
  {
    key: '一括交付金（ソフト）', series: 2,
    short: '沖縄振興特別推進交付金。県が選んだソフト事業に使える国の交付金',
    who: '国が8割、県が2割',
    desc: '沖縄振興のために国が交付する、使い道の自由度が高いお金です。人材育成・観光・離島の振興など、県が自主的に選んだソフト事業に使えます。事業費の8割を国が出し、2割は県の負担です（金額は県の負担分を含む事業費）。',
  },
  {
    key: '一括交付金（ハード）', series: 3,
    short: '沖縄振興公共投資交付金。道路や学校の整備などに使える国の交付金',
    who: '国と県（国の負担の割合は事業の種類による）',
    desc: '沖縄振興のための一括交付金のうち、道路整備や学校の建築・改築などのハード事業を対象とするものです。',
  },
  {
    key: '内閣府計上', series: 4,
    short: '国の沖縄振興予算（内閣府に計上）から補助を受ける事業',
    who: '国の補助と県の負担',
    desc: '沖縄の公共事業などの国の予算は、内閣府にまとめて計上されています（沖縄振興予算）。その補助を受けて県が行う、農業の基盤整備・下水道・港湾などの事業です。',
  },
  {
    key: '各省計上', series: 5,
    short: '内閣府以外の省庁の予算から補助を受ける事業',
    who: '国の補助と県の負担',
    desc: '厚生労働省・こども家庭庁・農林水産省など、内閣府以外の省庁の予算に計上された補助金を受けて行う事業です。子育て支援や水道、地すべり対策など、全国共通の制度によるものが多くあります。',
  },
  {
    key: 'その他', series: 6, note: '国直轄・市町村・記載なし',
    short: '国が直接行う事業、市町村の事業、財源の記載が無いもの',
    who: '—',
    desc: '国が直接行う事業（国直轄）や市町村の事業、財源の欄が「―」のものです。金額はわずかです。',
  },
];
export function fundOf(raw) {
  const t = (raw || '').normalize('NFKC').replace(/\s/g, '');
  if (t === '県単等') return '県単等';
  if (t.startsWith('一括交付金')) return t.includes('ハード') ? '一括交付金（ハード）' : '一括交付金（ソフト）';
  if (t === '内閣府計上' || t === '各省計上') return t;
  return 'その他';
}

export const AMOUNT_KINDS = {
  settled: { label: '決算額', offset: -1 },
  estimate: { label: '決算見込額', offset: 0 },
  initial: { label: '当初予算額', offset: 1 },
};
export const budgetKey = (s) => (s || '').normalize('NFKC').replace(/\s/g, '');

// 桁の誤記の疑い（r.suspect）は抽出時に判定している（scripts/extract_bukyoku.py の suspect_kinds）。
// 同じ行の3つの金額のうち1つだけが他の50倍以上・10億円以上のもの。合計から除く

let budgetRecords;
// 年度×取組の予算の記載。同じ取組が複数の部局のファイルに載っている（R5の組織再編の年）ときは最初の1件
export function getBudgetRecords() {
  if (budgetRecords) return budgetRecords;
  const seen = new Set();
  budgetRecords = [];
  for (const b of load('bukyoku/torikumi')) {
    const k = `${b.year}|${b.shisaku_id}|${b.key}`;
    if (seen.has(k)) continue;
    seen.add(k);
    budgetRecords.push(b);
  }
  return budgetRecords;
}
// 総括報告書の取組に対応する部局票の記載。施策コードと取組名で結び付ける。
// 総括報告書で別の施策に再掲された取組は、部局票では元の施策にしか載っていないことがあるので、
// 同じ年度に同じ名前の取組が部局票に1件だけなら名前で結び付ける（matchedByName）
let budgetIndex;
export function budgetOf(year, shisakuId, key) {
  if (!budgetIndex) {
    const exact = new Map();
    const byName = new Map();
    for (const b of getBudgetRecords()) {
      exact.set(`${b.year}|${b.shisaku_id}|${b.key}`, b);
      const k = `${b.year}|${b.key}`;
      byName.set(k, byName.has(k) ? null : b); // 2件以上あれば null（名前だけでは決められない）
    }
    budgetIndex = { exact, byName };
  }
  const hit = budgetIndex.exact.get(`${year}|${shisakuId}|${key}`);
  if (hit) return hit;
  const named = budgetIndex.byName.get(`${year}|${key}`);
  return named ? { ...named, matchedByName: true } : undefined;
}

// 予算事業の金額を1行ずつに平らにしたもの
let budgetLines;
export function getBudgetLines() {
  budgetLines ??= getBudgetRecords().flatMap((b) =>
    b.budgets.flatMap((blk) =>
      blk.rows.map((r) => ({
        report: b.year,
        shisaku_id: b.shisaku_id,
        key: b.key,
        torikumi: b.name,
        name: blk.name,
        name_next: blk.name_next || blk.name,
        source: r.source,
        source_next: r.source_next || r.source,
        settled: r.settled,
        estimate: r.estimate,
        initial: r.initial,
        suspect: r.suspect || [],
        file: b.source,
        page: blk.page || b.page, // 予算の表があるページ
      })),
    ),
  );
  return budgetLines;
}

// 報告年度・金額の種類ごとに、同じ予算事業（名前・財源・金額が同じもの）を1回だけ数えた金額の一覧。
// 1つの予算事業が複数の取組に載っているときは、最初に出てくる取組（施策コード順）に寄せる
export function amountEntries(report, kind) {
  const seen = new Set();
  const out = [];
  for (const l of getBudgetLines()) {
    if (l.report !== report) continue;
    const v = l[kind];
    if (v == null || v === 0 || l.suspect.includes(kind)) continue;
    const name = kind === 'initial' ? l.name_next : l.name;
    const source = kind === 'initial' ? l.source_next : l.source;
    const k = `${budgetKey(name)}|${budgetKey(source)}|${v}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...l, budgetName: name, fund: fundOf(source), amount: v, year: report + AMOUNT_KINDS[kind].offset });
  }
  return out;
}

export function getSuspects() {
  return getBudgetLines().flatMap((l) => l.suspect.map((kind) => ({ ...l, kind, amount: l[kind] })));
}

// 財源の説明ページで使う、国・県の公式資料の数字（data/reference/finance.json。出典つきで人が転記したもの）
export function getFinanceReference() {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), '../data/reference/finance.json'), 'utf-8'));
}
