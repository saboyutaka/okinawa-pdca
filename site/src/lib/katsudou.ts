// 主な取組の活動指標（取組のページの図と表、活動指標のシェア用のページ）。総括報告書の目標・実績の欄と、部局票の達成割合・年度別計画を、
// 年度をまたいだ同じ活動指標ごとの run にする（分け方の規則は docs/data.md の 4.1・8章）。ビルドの中でだけ使う（ブラウザの図は ActivityYear の型だけを読む）
import {
  LATEST, YEARS, assertUnique, budgetOf, formersOf, getTorikumiGroups, indicatorOf, katsudouNameKey, keySlug, nameKey, sameKey, statusOf, yearLong, type TorikumiGroup,
} from './data.ts';
import { once, onceBy } from './memo.ts';
import { KATSUDOU_RENAMES } from './renames.ts';
import { isBlankCell } from './text.ts';

// 活動指標の計画・実績の「10件」「10件（20件）」の先頭の数と単位（かっこの中は累計や内訳）。「△0.0015t-CO₂/千㎥」の △ は減らす量。数で始まらなければ null
// 単位は NFKC で比べる（「t-CO₂」の ₂ も 2 になるので、単位の中の数字も単位に入れる）
export function activityQty(raw: string | null | undefined) {
  const m = (raw || '').normalize('NFKC').match(/^([-−△▲]?)\s*([\d,.]+)\s*([^\s（(→]*)/);
  const v = m ? Number(m[2].replace(/,/g, '')) * (m[1] ? -1 : 1) : NaN;
  return m && Number.isFinite(v) ? { v, u: m[3] } : null;
}
// 画面に出す単位は報告書の文字のまま（₂ や ㎥ を崩さない）
const activityUnitText = (raw: string) => raw.match(/^[-−△▲－]?\s*[\d０-９,，.．]+\s*([^\s（(→]*)/)?.[1] ?? '';
// 活動指標の達成割合。部局票の「達成割合」を使い、無ければ「計画 10件 → 実績 54件」のように同じ単位の数から計算する
// 活動指標の表が2つ以上ある取組（部局票の indicators）と、目標・実績が2行以上の取組（総括報告書の lines）は、1つの割合にまとめられないので null
// （表ごとの達成割合は activityAchievements）
export function activityAchievement(g: TorikumiGroup, y: number) {
  const rec = budgetOf(y, g.shisaku.id, g.key);
  if ((rec?.indicators?.length ?? 0) > 1) return null;
  const raw = rec?.achievement ?? '';
  const m = raw.normalize('NFKC').match(/(-?[\d,.]+)\s*%/);
  if (m) return { pct: Number(m[1].replace(/,/g, '')), text: raw };
  const r = g.years[y];
  if (r?.lines) return null;
  const a = activityQty(r?.actual);
  const b = activityQty(r?.target);
  return a && b && b.v > 0 && a.u === b.u ? { pct: (a.v / b.v) * 100, text: `${Math.round((a.v / b.v) * 100)}%（計算）` } : null;
}

// 活動指標の表が2つ以上ある取組の、表ごとの名前と達成割合（印字の順。1つだけなら []）
export function activityAchievements(g: TorikumiGroup, y: number) {
  const list = budgetOf(y, g.shisaku.id, g.key)?.indicators ?? [];
  return list.length > 1 ? list.map((x) => ({ name: x.name, text: x.achievement })) : [];
}

// 活動指標の1年分。future は部局票の年度別計画にだけある、この先の年度（実績はまだ無い）
export interface ActivityYear {
  y: number;
  plan_raw: string; // 計画（総括報告書の「目標」。future は年度別計画）
  actual_raw: string;
  plan: number | null; // 図に置く、かっこの前のその年度の数（単位がそろわない値は null）
  actual: number | null;
  status: string; // 進捗状況（future は ''）
  ach: string; // 達成割合（無ければ ''）
  future: boolean;
}
export interface ActivityRun {
  indicator: string; // いちばん新しい年度の名前
  formers: { name: string; years: number[] }[]; // 名前の変わった活動指標をつないだときの、前の年度の名前とその名前で載っていた年度（katsudouKey でつなぎ、lib/data.ts の formersOf で選ぶ）
  part: string; // 目標・実績が2行以上の活動指標を行ごとに分けたときの、その行の札（「開催数」「北部」「人」など。分けていなければ ''）
  group: number; // 同じ活動指標のまとまりの番号（0 がいちばん新しい活動指標。行ごとに分けた run は同じ番号）
  unit: string;
  years: ActivityYear[];
  chart: boolean; // 図に置ける実績があるか
  skipped: boolean; // 書いてあるのに数で読めず、図に入れなかった値があるか
  cumulative: boolean; // かっこの中に累計や内訳が書いてある値があるか
  planFrom: string; // future の出どころ（無ければ ''）
}
const nfkc = (s: string) => s.normalize('NFKC');
// 目標・実績のセルの頭の札。「北部15項目」→「北部」、「相談専門員２人」→「相談専門員」、「調査設計100％」→「調査設計」。
// 丸数字（①３回）は札にしない。数と単位で終わらないセル（「情報収集」）は ''
function cellLabel(raw: string): string {
  const m = nfkc(raw.replace(/^\s*[①-⑳]\s*/, '')).match(/^(.*?)\s*[:：]?\s*\d[\d,.]*\s*[^\d\s（(]*(\s*[（(].*)?$/);
  return m ? m[1].trim() : '';
}
// セルから丸数字と札（と札の後ろの「：」）を取り除く。札は、かっこの中を除いて行の札と同じもの（「就職希望者研修（２年）300人」と「就職希望者研修300人」は同じ行）。
// 文字は印字のまま残す（NFKC で比べて元の字で切る）
function stripLabel(raw: string, label: string): string {
  const s = raw.replace(/^\s*[①-⑳]\s*/, '');
  const bare = (x: string) => nfkc(x).replace(/[（(][^（()）]*[）)]/g, '').replace(/\s/g, '');
  const own = cellLabel(s);
  if (!own || !label || bare(own) !== bare(label)) return s;
  const key = nfkc(own);
  let i = 0;
  let acc = '';
  while (i < s.length && acc.length < key.length) acc += nfkc(s[i++]);
  return acc === key ? s.slice(i).replace(/^\s*[:：]?\s*/, '') : s;
}
// 1つのセルに並んだ2つ以上の値を分ける。「５回100名」「300件・12回」「19地点 １海域」「北部15項目、西表11項目」「５回（10回）200名（400名）」。
// 「300件・12回（600件・24回）」のように、かっこの中にも同じ数だけ値が並ぶものは「300件（600件）」「12回（24回）」に組む
function splitCell(raw: string): string[] {
  const s = raw.trim();
  if (isBlankCell(s)) return [];
  // 行で分けて書かれたもの（部局票の年度別計画の「①…300人\n②…240人」）は行がそのまま値
  if (s.includes('\n')) return s.split('\n').map((x) => x.trim()).filter(Boolean);
  // 読点で分け、「・」は両側に数があるときだけ区切り（「300件・12回」は分け、「６ヵ国・地域」は分けない）。残りは「数＋単位（かっこ）」の並びで分ける
  const hasNum = (x: string) => /[\d０-９]/.test(x);
  const chunk = (t: string) => t.split(/[、，]/).flatMap((a) => { const b = a.split('・'); return b.length > 1 && b.every(hasNum) ? b : [a]; })
    .flatMap((a) => [...a.matchAll(/[^\d０-９\s（(、，／/]*?[\d０-９][\d０-９,，.．]*\s*[^\d０-９\s（(、，／/]*(?:\s*[（(][^（()）]*[）)])?/g)].map((m) => m[0].trim()));
  const m = s.match(/^(.*?)\s*[（(]([^（()）]*)[）)]$/);
  if (m) {
    const [a, b] = [chunk(m[1]), chunk(m[2])];
    if (a.length > 1 && a.length === b.length) return a.map((x, i) => `${x}（${b[i].replace(/^[^\d０-９]*/, '')}）`);
  }
  return chunk(s);
}
// 活動指標の名前を行の数に分ける。「①…②…」「開催数、参加者数（累計）」「配置市町村数及び配置人数」「参加者数と参加国・地域数」「窓口相談件数・セミナーの開催回数」。行の数と合わなければ []
function splitName(name: string, n: number): string[] {
  const tries: string[][] = [
    name.split(/[①-⑳]/).map((s) => s.trim()).filter(Boolean),
    name.split(/[、，,]/).map((s) => s.trim()),
    name.split(/(?<=[（(]累計[）)])/).map((s) => s.trim()),
    name.split(/及び/).map((s) => s.trim()),
    name.split(/(?<=[）)数])と(?!\S*と)/).map((s) => s.trim()),
    name.split(/・/).map((s) => s.trim()),
  ];
  return tries.find((p) => p.length === n && p.every(Boolean)) ?? [];
}
// 札（北部・西表）が同じなら同じ行、そうでなければ印字の順で何行目か
const mostCommon = (xs: string[]) => [...xs.reduce((m, x) => (x ? m.set(x, (m.get(x) ?? 0) + 1) : m), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

type LineCell = { plan: string; actual: string };
interface RunYear { y: number; rows: LineCell[]; single: boolean; status: string; achs: string[]; ach: string; future: boolean }
// 1つの活動指標の年度ごとの印字の行を、行ごとの ActivityYear の列に分ける（分けないときは1列）
function splitRows(indicator: string, years0: RunYear[]): { label: string; years: Omit<ActivityYear, 'plan' | 'actual'>[] }[] {
  let years = years0;
  // 達成割合は、部局票に行ごとの表（indicators）があって行の数が合えばその行の値。合わなければ1行目に全部付ける（どの行のものか報告書に書かれていない）
  const achOf = (r: RunYear, i: number) => (r.future ? '' : r.achs.length === r.rows.length ? r.achs[i] : i === 0 ? r.achs.join('\n') || r.ach : '');
  const base = (r: RunYear, i: number, plan: string, actual: string) => ({ y: r.y, plan_raw: plan, actual_raw: r.future ? '' : actual, status: r.status, ach: achOf(r, i), future: r.future });
  let n = Math.max(...years.map((r) => r.rows.length));
  if (n < 2) return [{ label: '', years: years.map((r) => base(r, 0, r.rows[0]?.plan ?? '', r.rows[0]?.actual ?? '')) }];
  // 合算の行（「300件・12回」「19地点１海域」のように、他の行の計画をつないだもの）は落とす
  const norm = (s: string) => nfkc(s).replace(/[（(].*$/, '').replace(/[\s・、，,]/g, '');
  for (const r of years) {
    if (r.rows.length < 2) continue;
    const i = r.rows.findIndex((c, k) => norm(c.plan) === r.rows.filter((_, j) => j !== k).map((x) => norm(x.plan)).join(''));
    if (i >= 0) r.rows.splice(i, 1);
  }
  n = Math.max(...years.map((r) => r.rows.length));
  if (n < 2) return [{ label: '', years: years.map((r) => base(r, 0, r.rows[0]?.plan ?? '', r.rows[0]?.actual ?? '')) }];
  const bare = (x: string) => nfkc(x).replace(/[（(][^（()）]*[）)]/g, '').replace(/\s/g, '');
  const sameLabel = (a: string, b: string) => !!a && !!b && bare(a) === bare(b);
  // 行の札は、計画の欄の数の前の文字（北部・航空路・男性）。全部の行に無ければ、活動指標の名前を行の数に分けたもの。それも無ければ単位（下で付ける）
  const prefix = Array.from({ length: n }, (_, i) => mostCommon(years.filter((r) => !r.future && r.rows.length === n).map((r) => cellLabel(r.rows[i]?.plan ?? ''))));
  // 札のある行は札で行を決める（R6 に「整備工事」の行しか無い取組など）。札の無い行は印字の順で空いている所に置く
  for (const r of years) {
    if (r.single || r.rows.length === n) continue;
    const placed: (LineCell | undefined)[] = Array(n).fill(undefined);
    const rest: LineCell[] = [];
    for (const c of r.rows) { const j = prefix.findIndex((l) => sameLabel(cellLabel(c.plan), l)); if (j >= 0 && !placed[j]) placed[j] = c; else rest.push(c); }
    r.rows = placed.map((c) => c ?? rest.shift() ?? { plan: '', actual: '' });
  }
  // 1行だけの年度（R7 で1つの欄に「300件・12回」とまとめた取組、部局票の年度別計画、空の年度）は、値ごとに分けて行にする。
  // 札が全部あれば札の位置で切り（「小学校87％中学校89％」）、無ければ数の並びで分ける。分けられない実績（「1海域」だけ）は後で単位で行を決める（loose）。
  // 分けられない年度別計画（部局票の欄の読み取りが崩れたもの）は落とす
  const cut = (raw: string): string[] => {
    if (!prefix.every(Boolean) || raw.includes('\n')) return splitCell(raw);
    // 「小学校18、中学校18（小学校36、中学校36）」は、かっこの前と中を札で切ってから「18（36）」に組む
    const z = raw.match(/^(.*?)\s*[（(]([^（()）]*)[）)]$/);
    if (z) {
      const [a, b] = [cut(z[1]), cut(z[2])];
      if (a.length === n && b.length === n) return a.map((x, i) => `${x}（${stripLabel(b[i], prefix[i])}）`);
    }
    const t = nfkc(raw);
    const pos = prefix.map((l) => t.indexOf(nfkc(l)));
    if (pos.some((x, i) => x < 0 || (i > 0 && x <= pos[i - 1]))) return splitCell(raw);
    // 位置は NFKC で測るので、元の字も同じ長さになるときだけ切る（全角の数字・記号は1字が1字になる）
    return t.length === raw.length ? pos.map((x, i) => raw.slice(x, pos[i + 1] ?? raw.length).replace(/[、，\s]+$/, '')) : splitCell(raw);
  };
  const loose = new Map<RunYear, string[]>();
  const drop = new Set<RunYear>();
  for (const r of years) {
    if (!r.single) continue;
    const [p, a] = [cut(r.rows[0]?.plan ?? ''), cut(r.rows[0]?.actual ?? '')];
    // 年度別計画は、どの値も「数＋単位（かっこ）」で、ほかの行の札を含まないときだけ使う（部局票の欄の読み取りが崩れたものを除く）
    const clean = (v: string, i: number) => { const x = stripLabel(v, prefix[i]); return /^[\d０-９][\d０-９,，.．]*\s*[^\d０-９\s（(）)]*(\s*[（(][^（()）]*[）)])?$/.test(x) && !prefix.some((l, j) => j !== i && l && nfkc(x).includes(nfkc(l))); };
    if (r.future && (p.length !== n || !p.every(clean))) drop.add(r);
    else if (p.length === n || p.length === 0) {
      r.rows = Array.from({ length: n }, (_, i) => ({ plan: p[i] ?? '', actual: a.length === n ? a[i] : '' }));
      if (a.length !== n) loose.set(r, a);
    }
    else r.rows = [r.rows[0], ...Array.from({ length: n - 1 }, () => ({ plan: '', actual: '' }))];
  }
  years = years.filter((r) => !drop.has(r));
  const named = prefix.every(Boolean) ? prefix : splitName(indicator, n);
  const labels = named.length ? named : prefix;
  const strip = (r: RunYear, i: number, k: keyof LineCell) => stripLabel(r.rows[i]?.[k] ?? '', prefix[i]);
  const unitOf = (s: string) => activityQty(s)?.u ?? '';
  const units = Array.from({ length: n }, (_, i) => mostCommon(years.map((r) => unitOf(strip(r, i, 'plan'))).concat(years.map((r) => unitOf(strip(r, i, 'actual'))))));
  const parts = Array.from({ length: n }, (_, i) => ({ label: labels[i] || units[i] || `${i + 1}行目`, years: years.map((r) => base(r, i, strip(r, i, 'plan'), strip(r, i, 'actual'))) }));
  // 札か単位が別の行のものなら、その行の値とみなす（R7 2-(9)-ア-③ の「19地点／１海域」の実績「11地点」が2行目に印字されているなど）
  const move = (k: number, key: 'plan_raw' | 'actual_raw', v: string, from: number) => {
    const own = cellLabel(v);
    const byLabel = prefix.findIndex((l, j) => j !== from && sameLabel(own, l));
    const u = unitOf(stripLabel(v, own));
    const byUnit = units.map((x, j) => (x === u && u && j !== from ? j : -1)).filter((j) => j >= 0);
    const j = byLabel >= 0 ? byLabel : byUnit.length === 1 ? byUnit[0] : -1;
    return j >= 0 && isBlankCell(parts[j].years[k][key]) ? j : -1;
  };
  years.forEach((r, k) => {
    for (const a of loose.get(r) ?? []) { const j = move(k, 'actual_raw', a, -1); if (j >= 0) parts[j].years[k].actual_raw = stripLabel(a, prefix[j]); }
    parts.forEach((p, i) => {
      for (const key of ['plan_raw', 'actual_raw'] as const) {
        const v = p.years[k][key];
        const u = unitOf(v);
        if (!v || (!cellLabel(v) && (!u || u === units[i]))) continue;
        const j = move(k, key, v, i);
        if (j >= 0) { parts[j].years[k][key] = stripLabel(v, prefix[j]); p.years[k][key] = ''; }
      }
    });
    // 計画の無い行に実績だけがあり、実績の無い行に計画だけがあるのが1つずつなら、実績はその行のもの（R7 の「整備工事100％」の実績「100％」が1行目に印字されているなど）
    if (r.future) return;
    const onlyA = parts.filter((p) => isBlankCell(p.years[k].plan_raw) && !isBlankCell(p.years[k].actual_raw) && !cellLabel(p.years[k].actual_raw));
    const onlyP = parts.filter((p) => !isBlankCell(p.years[k].plan_raw) && isBlankCell(p.years[k].actual_raw));
    if (onlyA.length === 1 && onlyP.length === 1) {
      const [u, w] = [unitOf(onlyA[0].years[k].actual_raw), unitOf(onlyP[0].years[k].plan_raw)];
      if (!u || !w || u === w) { onlyP[0].years[k].actual_raw = onlyA[0].years[k].actual_raw; onlyA[0].years[k].actual_raw = ''; }
    }
  });
  return parts;
}

// 年度をまたいで同じ活動指標かを比べる key。katsudouNameKey に、県が名前を変えた活動指標の読み替え（lib/renames.ts の KATSUDOU_RENAMES）を足したもの。
// 読み替えは書いた施策の取組（R7の報告の名前）でだけ行う
const katsudouRenames = once(() => new Map(KATSUDOU_RENAMES.flatMap((r) => r.shisaku.map((s) => [`${s}|${sameKey(nameKey(r.torikumi))}|${katsudouNameKey(r.from)}`, katsudouNameKey(r.to)]))));
export function katsudouKey(g: TorikumiGroup, name: string) {
  const k = katsudouNameKey(name);
  return katsudouRenames().get(`${g.shisaku.id}|${sameKey(g.key)}|${k}`) ?? k;
}

// 取組の活動指標を、同じ活動指標（katsudouKey）が続く年度ごとにまとめる（新しい活動指標が先。R7の中期実施計画で入れ替わったものが多い）。
// 名前の変わった活動指標をつないだ run の見出しは、いちばん新しい年度の名前にし、前の名前は formers に入れる。
// 目標・実績が2行以上に分かれた活動指標（「５回／200名」「北部15項目／西表11項目」）は、行ごとに1つの run にする（part に行の札、group が同じ）。
// 最新の報告にある取組には、部局票の年度別計画から、この先の年度（R8・R9）の計画も足す
export function activityRuns(g: TorikumiGroup): ActivityRun[] {
  const runs: { indicator: string; key: string; names: { name: string; y: number }[]; years: RunYear[] }[] = [];
  for (const y of YEARS) {
    const r = g.years[y];
    if (!r) continue;
    const indicator = indicatorOf(g, y);
    const key = katsudouKey(g, indicator);
    const achs = activityAchievements(g, y);
    const rows: LineCell[] = r.lines ? r.lines.map((l) => ({ plan: l.target, actual: l.actual })) : [{ plan: r.target, actual: r.actual }];
    // 達成割合は、部局票に行ごとの表（indicators）があればその行の値。1つだけなら1行目に付ける（2行以上の取組の割合は、どの行のものか報告書に書かれていない）
    const one = activityAchievement(g, y)?.text ?? '';
    const row: RunYear = { y, rows, single: !r.lines, status: statusOf(r), achs: achs.map((x) => x.text || '—'), ach: one, future: false };
    const last = runs.at(-1);
    if (last && last.key === key) {
      last.years.push(row);
      last.names.push({ name: indicator, y });
      last.indicator = indicator;
    } else runs.push({ indicator, key, names: [{ name: indicator, y }], years: [row] });
  }
  // 年度別計画の行は、活動指標の名前が同じもの。名前が違っても、行が1つで最新の年度の値が総括報告書の計画と同じなら使う
  let planFrom = '';
  const cur = runs.at(-1);
  const rec = g.latest.year === LATEST ? budgetOf(LATEST, g.shisaku.id, g.key) : undefined;
  if (cur && rec?.plan.length) {
    const ys = rec.plan_years.map((l) => Number(l.normalize('NFKC').replace(/\D/g, '')) + 2018);
    const i = ys.indexOf(LATEST);
    const p = rec.plan.find((x) => katsudouKey(g, x.indicator) === cur.key)
      ?? (rec.plan.length === 1 && i >= 0 && nameKey(rec.plan[0].values[i] ?? '') === nameKey(g.latest.target) ? rec.plan[0] : undefined);
    ys.forEach((y, k) => {
      const v = p?.values[k] ?? '';
      if (y > LATEST && !isBlankCell(v)) cur.years.push({ y, rows: [{ plan: v, actual: '' }], single: true, status: '', achs: [], ach: '', future: true });
    });
    if (cur.years.some((r) => r.future)) planFrom = `${yearLong(LATEST)}の部局の検証票の「年度別計画」`;
  }
  return runs.reverse().flatMap((run, k) => {
    const formers = formersOf(run.names, run.indicator);
    return splitRows(run.indicator, run.years).map(({ label, years: rows }) => {
      // 単位は、数で読めた値でいちばん多いもの。単位の無い数（「18」「234」）は、そのまとまりの単位とみなす
      const count = new Map<string, number>();
      for (const r of rows) for (const q of [r.plan_raw, r.actual_raw].map(activityQty)) if (q?.u) count.set(q.u, (count.get(q.u) ?? 0) + 1);
      const unit = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      const val = (raw: string) => { const q = activityQty(raw); return q && (q.u === unit || q.u === '') ? q.v : null; };
      const years = rows.map((r) => ({ ...r, plan: val(r.plan_raw), actual: val(r.actual_raw) }));
      const chart = years.some((r) => r.actual != null);
      const unitRaw = years.flatMap((r) => [r.actual_raw, r.plan_raw]).find((raw) => val(raw) != null && activityQty(raw)?.u);
      return {
        indicator: run.indicator,
        formers,
        part: label,
        group: k,
        unit: unitRaw ? activityUnitText(unitRaw) : unit,
        years,
        chart,
        skipped: chart && years.some((r) => (!isBlankCell(r.plan_raw) && r.plan == null) || (!isBlankCell(r.actual_raw) && r.actual == null)),
        cumulative: chart && years.some((r) => /[（(]/.test(r.plan_raw + r.actual_raw)),
        planFrom: k === 0 && years.some((r) => r.future) ? planFrom : '',
      };
    });
  });
}

// 活動指標の見せる場所（取組のページの図のカード。anchor はその id）とシェア用のページ（/katsudou/<施策ID>/<key のハッシュ8桁>/）。取組のページの図1つ（activityRuns の run）に1つ。
// key は取組の key と活動指標の名前の key（katsudouKey。書き方の違いと KATSUDOU_RENAMES の読み替えをそろえたもの）と、行ごとに分けた run は行の札で、
// 同じ取組に同じものが2つあれば #2。年度をまたいで同じ（取組か活動指標の名前が変わると別の URL）
export interface ActivityShare {
  torikumi: TorikumiGroup;
  run: ActivityRun;
  name: string; // 活動指標の名前（行ごとに分けた run は「名前（行の札）」。活動指標の記載が無ければ ''）
  key: string;
  anchor: string;
  href: string;
  share: string;
}
// activityRuns と同じ並び
export const activityShares = onceBy((g: TorikumiGroup): ActivityShare[] => {
  const seen = new Map<string, number>();
  return activityRuns(g).map((run) => {
    const base = `${g.key}|${katsudouKey(g, run.indicator)}|${nameKey(run.part)}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const key = `${base}#${n}`;
    const slug = keySlug(key);
    const anchor = `katsudou-${slug}`;
    const name = run.indicator && run.part ? `${run.indicator}（${run.part}）` : run.indicator;
    return { torikumi: g, run, name, key, anchor, href: `${g.href}#${anchor}`, share: `/katsudou/${g.shisaku.id}/${slug}/` };
  });
});
// すべての取組の活動指標のうち、シェア用のページを作るもの（活動指標の記載が無いものは作らない）
export const getActivityShares = once(() => {
  const list = getTorikumiGroups().flatMap((g) => activityShares(g).filter((a) => a.name));
  assertUnique(list, (a) => a.share, '活動指標のシェア用のページ');
  return list;
});
