// [data-chart] の中の JSON から、表示幅に合わせて SVG の図を描く（幅を固定した SVG を縮めると、スマホで文字が小さくなりすぎるため）。
// 図全体でタブは1回だけ止まり、左右の矢印キーで年度を移る。値は各図の近くの表（「表で見る」）にも必ず出している
import { showRows, hide, onEsc, type TipRow } from './tip.ts';
import { moving } from './motion.ts';

// 図の JSON の形。書き出すのは components/TrendChart.astro（trend）と SeikaChart.astro・RmSeika.astro（seika）、KatsudouChart.astro（katsudou）
export interface TrendPoint {
  y: number; // 報告年度
  a: number; // 主な取組のうち順調の割合（%）
  b: number; // 成果指標のうち計画値に届いた割合（%）
  aOk: number;
  aN: number;
  bOk: number;
  bN: number;
}
export interface TrendData {
  points: TrendPoint[];
}
export interface SeikaChartYear {
  y: number; // 報告年度
  actual: number | null;
  actual_raw: string;
  ref: string; // 実績値が何年度の値か
  plan: (number | null)[];
  plan_raw: string[];
  target: number | null;
  target_raw: string;
  target_year: string;
  base: number | null;
  base_raw: string;
}
export interface SeikaData {
  unit: string;
  years: SeikaChartYear[];
  latest: boolean; // 最新の報告にある指標か（無ければ「いまここ」を「最後の報告」にする）
}
export interface KatsudouChartYear {
  y: number; // 報告年度
  plan: number | null; // 図に置く、かっこの前のその年度の数
  plan_raw: string;
  actual: number | null;
  actual_raw: string;
  status: string; // 進捗状況
  ach: string; // 達成割合
  future: boolean; // 年度別計画にだけある、この先の年度
}
export interface KatsudouData {
  unit: string;
  years: KatsudouChartYear[];
  here: string; // 最後の実績に添える札（「いまここ」「最後の報告」。前の活動指標の図は ''）
}

type Pt = [x: number, y: number];
type Box = [x1: number, y1: number, x2: number, y2: number];

const NS = 'http://www.w3.org/2000/svg';
// 文字は、西暦で表示するときは西暦にしてから入れる（幅を測って置き場所を決めるので、入れたあとで書き換わると重なる。lib/era.ts）
function sv<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number | null | undefined> = {}, text?: string) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v));
  if (text != null) e.textContent = window.era?.text(text) ?? text;
  return e;
}
const nf = new Intl.NumberFormat('ja-JP');
const yl = (y: number) => `R${y - 2018}`;
const planIndex = (y: number) => (y <= 2024 ? y - 2022 : y - 2025);
const withUnit = (raw: string | null | undefined, unit: string) => (raw && /^[-△]?[\d,.]+$/.test(raw.normalize('NFKC')) && unit ? `${raw}${unit}` : raw || '—');
function niceTicks(lo: number, hi: number, n = 4) {
  const raw = (hi - lo || 1) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

// 動き（styles/global.css の「動き」）。実績の線は始まりから DRAW_MS かけて伸ばし、点は線がそこへ届いたときに、札は描き終わってから出す。
// ここでは印にクラスと時間を付けるだけで、動かすかどうかは図の m-anim で決まる（付いていなければ、はじめから描き終わった形）
const DRAW_MS = 550;
// 折れ線に伸ばす動きを付け（線の長さを --len に）、それぞれの点に線が届くまでの時間（ms）を返す
function drawIn(path: SVGPathElement, pts: Pt[]) {
  const at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = at[at.length - 1];
  path.classList.add('m-line');
  path.style.setProperty('--len', String(Math.ceil(len) + 1));
  return at.map((d) => (len ? Math.round((DRAW_MS * d) / len) : 0));
}
// 点（m-dot）と札（m-tag）を、ms たってからポンと出す
function popAt<E extends SVGElement>(el: E, cls: 'm-dot' | 'm-tag', ms: number) {
  el.classList.add(cls);
  el.style.setProperty('--d', `${ms}ms`);
  return el;
}

// 横に並ぶ点（年度）を、ポインターと矢印キーで選ぶ
function crosshair(wrap: HTMLElement, svg: SVGSVGElement, xs: number[], top: number, bottom: number, onShow: (i: number, x: number, y: number) => void, start: number) {
  let idx = -1;
  let quiet = false; // マウスを乗せて出したものを Esc で消したら、マウスが図から出るまで出し直さない
  const line = sv('line', { class: 'cross', y1: top, y2: bottom, visibility: 'hidden' });
  svg.append(line);
  const show = (i: number, pt?: Pt) => {
    idx = i;
    line.setAttribute('x1', String(xs[i]));
    line.setAttribute('x2', String(xs[i]));
    line.setAttribute('visibility', 'visible');
    const r = svg.getBoundingClientRect();
    onShow(i, pt ? pt[0] : r.left + xs[i], pt ? pt[1] : r.top + top);
    // 図の外にフォーカスがあるとき（マウスを乗せて出したとき）に Esc で消したら、十字線も一緒に消す
    onEsc(() => {
      off();
      quiet = true;
    });
  };
  const off = () => {
    idx = -1;
    line.setAttribute('visibility', 'hidden');
    hide();
  };
  const nearest = (cx: number) => {
    const x = cx - svg.getBoundingClientRect().left;
    let b = 0;
    xs.forEach((v, i) => { if (Math.abs(v - x) < Math.abs(xs[b] - x)) b = i; });
    return b;
  };
  svg.addEventListener('pointermove', (e) => { if (!quiet) show(nearest(e.clientX), [e.clientX, e.clientY]); });
  svg.addEventListener('pointerdown', (e) => {
    quiet = false;
    show(nearest(e.clientX), [e.clientX, e.clientY]);
  });
  svg.addEventListener('pointerleave', (e) => {
    quiet = false;
    if (e.pointerType === 'mouse') off();
  });
  wrap.onkeydown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const d = e.key === 'ArrowRight' ? 1 : -1;
      show(idx < 0 ? (d > 0 ? 0 : xs.length - 1) : Math.max(0, Math.min(xs.length - 1, idx + d)));
    } else if (e.key === 'Escape') off();
  };
  wrap.onfocus = () => show(idx < 0 ? start : idx);
  wrap.onblur = off;
}

// 成果指標・活動指標の図の枠。横は報告年度で、計画期間（前期 R4〜R6・中期 R7〜R9）ごとに区切り、最新の報告の計画期間でない方は地の色の帯にする。
// 縦の目盛りの文字の幅で左の余白を決めるので、svg を先に置いてから測る（minLeft はその最小）。帯・目盛り・年度の文字はここで描く（印より下に重ねるため）
type Period = { ys: number[]; cur: boolean };
type TextW = (text: string, cls: string) => number;
function yearFrame(wrap: HTMLElement, W: number, H: number, top: number, periods: Period[], ticks: number[], lo: number, hi: number, unit: string, minLeft = 0) {
  const svg = sv('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  wrap.replaceChildren(svg);
  const textW: TextW = (text, cls) => {
    const t = sv('text', { class: cls }, text);
    svg.append(t);
    const w = t.getComputedTextLength();
    t.remove();
    return w;
  };
  // 目盛りの単位は1文字（%・人・件など）のときだけ付ける。長い単位はカードの見出しにある
  const u = (unit || '').normalize('NFKC');
  const tickText = (t: number) => `${nf.format(t)}${u.length === 1 ? u : ''}`;
  const m = { l: Math.max(minLeft, Math.ceil(Math.max(...ticks.map((t) => textW(tickText(t), 'tick')))) + 14), r: 8, t: top, b: 30 };
  const slots = periods.flatMap((p) => p.ys);
  const ih = H - m.t - m.b;
  const sw = (W - m.l - m.r) / slots.length;
  const x = (s: number) => m.l + (slots.indexOf(s) + 0.5) * sw;
  const y = (v: number) => m.t + (1 - (v - lo) / (hi - lo)) * ih;
  const left = (p: Period) => x(p.ys[0]) - sw / 2;
  for (const p of periods) {
    if (!p.cur) svg.append(sv('rect', { x: left(p), y: 0, width: sw * 3, height: m.t + ih + 4, rx: 10, fill: 'var(--bg)' }));
    svg.append(sv('text', { class: p.cur ? 'lbl' : 'lbl2', x: left(p) + 8, y: 17 }, p.ys[0] <= 2024 ? '前期（R4〜R6）' : '中期（R7〜R9）'));
  }
  for (const t of ticks) {
    svg.append(sv('line', { class: 'gridl', x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }));
    svg.append(sv('text', { class: 'tick', x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, tickText(t)));
  }
  slots.forEach((s) => svg.append(sv('text', { class: 'tick', x: x(s), y: H - 10, 'text-anchor': 'middle' }, yl(s))));
  if (periods.length > 1) svg.append(sv('line', { class: 'base', x1: left(periods[1]), x2: left(periods[1]), y1: 0, y2: m.t + ih + 4 }));
  return { svg, textW, m, ih, sw, slots, x, y, left };
}

// 置いた印の範囲 [x1, y1, x2, y2] を覚えておき、文字の場所を、それと重ならないように選ぶ
function placer(W: number, top: number, bottom: number) {
  const boxes: Box[] = [];
  const mark = (cx: number, cy: number, r: number) => boxes.push([cx - r, cy - r, cx + r, cy + r]);
  const markPath = (pts: Pt[]) => pts.slice(1).forEach(([bx, by], i) => {
    const [ax, ay] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 5));
    for (let k = 0; k <= n; k++) mark(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, 1.5);
  });
  const overlap = (b: Box) => boxes.reduce((s, o) => s + Math.max(0, Math.min(b[2], o[2]) - Math.max(b[0], o[0])) * Math.max(0, Math.min(b[3], o[3]) - Math.max(b[1], o[1])), 0);
  const fits = (b: Box) => b[0] >= 0 && b[2] <= W && b[1] >= top && b[3] <= bottom;
  // 候補（左上の座標）のうち、図に収まって重なりのいちばん少ない場所（同じなら先の候補）
  const place = (w: number, h: number, cands: Pt[]) => {
    const bs = cands.map(([bx, by]): Box => [bx, by, bx + w, by + h]);
    const ok = bs.filter(fits);
    const b = (ok.length ? ok : bs).reduce((a, q) => (overlap(q) < overlap(a) ? q : a));
    boxes.push(b);
    return b;
  };
  return { mark, markPath, place };
}

// 最後の実績に添える「いまここ」の札。点の右 → 上 → 下 → 左の順に、ほかの印と重ならない場所を探す
// 札は、実績の線が「いまここ」の点に届いてから出す（ms）
function hereTag(svg: SVGSVGElement, textW: TextW, place: ReturnType<typeof placer>['place'], now: { cx: number; cy: number }, text: string, ms: number) {
  const w = textW(text, 'lbl2') + 18;
  const h = 22;
  const [bx, by] = place(w, h, [[now.cx + 12, now.cy - h / 2], [now.cx - w / 2, now.cy - 12 - h], [now.cx - w / 2, now.cy + 12], [now.cx - 12 - w, now.cy - h / 2]]);
  const g = popAt(sv('g'), 'm-tag', ms);
  g.append(sv('rect', { x: bx, y: by, width: w, height: h, rx: h / 2, fill: 'var(--paper)', stroke: 'var(--line)', 'stroke-width': 2 }));
  g.append(sv('text', { class: 'lbl2 here', x: bx + w / 2, y: by + 15.5, 'text-anchor': 'middle' }, text));
  svg.append(g);
}

// トップの4年間の推移: 主な取組の「順調」の割合と、成果指標の計画値に届いた割合（どちらも0〜100%の同じ目盛り）
function drawTrend(wrap: HTMLElement, W: number, { points }: TrendData) {
  const H = 250;
  const m = { l: 46, r: Math.min(140, W * 0.3), t: 32, b: 34 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const x = (i: number) => m.l + (points.length === 1 ? iw / 2 : (i * iw) / (points.length - 1));
  const y = (v: number) => m.t + (1 - v / 100) * ih;
  const svg = sv('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  for (const v of [0, 25, 50, 75, 100]) {
    svg.append(sv('line', { class: v === 0 ? 'base' : 'gridl', x1: m.l, x2: W - m.r + 8, y1: y(v), y2: y(v) }));
    svg.append(sv('text', { class: 'tick', x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, `${v}%`));
  }
  // 広い図は和暦に西暦を添える（西暦で表示するときは西暦だけ）
  points.forEach((p, i) => svg.append(sv('text', { class: 'tick', x: x(i), y: H - 10, 'text-anchor': 'middle' }, W < 480 || window.era?.seireki ? yl(p.y) : `${yl(p.y)}（${p.y}）`)));
  const div = points.findIndex((p) => p.y >= 2025);
  if (div > 0) {
    const dx = (x(div - 1) + x(div)) / 2;
    svg.append(sv('line', { class: 'base', x1: dx, x2: dx, y1: m.t - 20, y2: m.t + ih }));
    svg.append(sv('text', { class: 'lbl2', x: dx - 8, y: m.t - 10, 'text-anchor': 'end' }, '前期実施計画'));
    svg.append(sv('text', { class: 'lbl2', x: dx + 8, y: m.t - 10 }, '中期'));
  }
  const series: [key: 'a' | 'b', color: string, shape: string, name: string][] = [
    ['a', 'var(--series-1)', 'circle', '取組「順調」'],
    ['b', 'var(--ink-2)', 'square', '成果指標 到達'],
  ];
  // 右端のラベル（値と名前の2行）は、2つの値が近いと重なるので、上下に離して置く（図の上下の端からははみ出さない）
  const last = points.length - 1;
  const LABEL_H = 36;
  const ly = { a: y(points[last].a) + 1, b: y(points[last].b) + 1 };
  const [top, bottom] = ly.a <= ly.b ? (['a', 'b'] as const) : (['b', 'a'] as const);
  if (ly[bottom] - ly[top] < LABEL_H) {
    const mid = (ly[top] + ly[bottom]) / 2;
    ly[top] = mid - LABEL_H / 2;
    ly[bottom] = mid + LABEL_H / 2;
  }
  const shift = Math.max(0, m.t - ly[top]) - Math.max(0, ly[bottom] - (H - m.b - 10));
  ly[top] += shift;
  ly[bottom] += shift;
  // 2本の線は同じ時間で R4 から右へ伸ばし、右端の値と名前は描き終わってから出す
  for (const [k, color, shape, name] of series) {
    const pts = points.map((p, i): Pt => [x(i), y(p[k])]);
    const at = drawIn(svg.appendChild(sv('path', { d: pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(''), fill: 'none', stroke: color, 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })), pts);
    pts.forEach(([px, py], i) => svg.append(popAt(shape === 'circle'
      ? sv('circle', { cx: px, cy: py, r: 6, fill: color, stroke: 'var(--line)', 'stroke-width': 2 })
      : sv('rect', { x: px - 5.5, y: py - 5.5, width: 11, height: 11, fill: color, stroke: 'var(--line)', 'stroke-width': 2 }), 'm-dot', at[i])));
    const t = popAt(sv('text', { class: 'lbl', x: x(last) + 14, y: ly[k] }), 'm-tag', DRAW_MS + 80);
    t.append(sv('tspan', {}, `${points[last][k].toFixed(1)}%`), sv('tspan', { class: 'lbl2', x: x(last) + 14, dy: 16 }, name));
    svg.append(t);
  }
  wrap.replaceChildren(svg);
  crosshair(wrap, svg, points.map((_, i) => x(i)), m.t, m.t + ih, (i, cx, cy) => {
    const p = points[i];
    showRows(`${yl(p.y)}（${p.y <= 2024 ? '前期' : '中期'}）`, [
      [`${p.a.toFixed(1)}%`, `主な取組のうち順調（${nf.format(p.aOk)}/${nf.format(p.aN)}件）`, 'var(--series-1)'],
      [`${p.b.toFixed(1)}%`, `成果指標のうち計画値に到達（${nf.format(p.bOk)}/${nf.format(p.bN)}）`, 'var(--ink-2)'],
    ], cx, cy);
  }, points.length - 1);
}

// 成果指標の「ゴールまでの道のり」。横は報告年度で、計画期間（前期 R4〜R6・中期 R7〜R9）ごとに、
// スタート（基準値の小さな点）から点線の計画の道すじ（その年度の計画値）をたどってゴール（目標値。最後の計画値と同じ）へ。青い点が実績値で、最新に「いまここ」。
// 前期と中期で基準値・目標値が変わるので、最新の報告の計画期間でない方は地の色の帯に灰色の点線で描く。
// 主要指標（基本施策のページ）のように年度ごとの計画値がない指標は、道すじを引かず、ゴールの丸（目標値）を計画期間の最後の年度に置く。
// 数字はカードの「スタート → いま → ゴール」に出しているので、図の中の文字は「スタート」「ゴール」「いまここ」だけにし、ほかの印と重ならない場所に置く
function drawSeika(wrap: HTMLElement, W: number, { unit, years, latest }: SeikaData) {
  const num = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);
  const last = years[years.length - 1];
  // 計画期間ごとの最後の報告（r。基準値・計画値・目標値はこれを使う）と、最新の報告の計画期間か（cur）
  const periods = [[2022, 2023, 2024], [2025, 2026, 2027]].flatMap((ys) => {
    const r = years.filter((q) => ys.includes(q.y)).pop();
    return r ? [{ ys, r, cur: ys.includes(last.y) }] : [];
  });
  const vals: number[] = [];
  for (const r of years) if (num(r.actual)) vals.push(r.actual);
  for (const { r } of periods) [r.base, r.target, ...r.plan].forEach((v) => num(v) && vals.push(v));
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.14;
  lo -= pad;
  hi += pad;
  const ticks = niceTicks(lo, hi, 4);
  lo = Math.min(lo, ticks[0]);
  hi = Math.max(hi, ticks[ticks.length - 1]);
  // スマホ幅では低くして、カード1枚が1画面に収まるようにする
  const H = W < 480 ? 200 : 240;
  const { svg, textW, m, ih, sw, slots, x, y, left } = yearFrame(wrap, W, H, W < 480 ? 44 : 50, periods, ticks, lo, hi, unit);
  const line = (pts: Pt[]) => pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join('');
  const { mark, markPath, place } = placer(W, 24, m.t + ih + 2);

  // 計画の道すじと実績値の位置
  const plans = periods.map((p) => {
    const { r } = p;
    const sx = left(p) + 6;
    const pts: Pt[] = [];
    if (num(r.base)) pts.push([sx, y(r.base)]);
    const circles: Pt[] = r.plan.length
      ? r.plan.flatMap((v, i): Pt[] => (num(v) ? [[x(p.ys[i]), y(v)]] : []))
      : num(r.target) ? [[x(p.ys[2]), y(r.target)]] : [];
    if (r.plan.length) pts.push(...circles);
    markPath(pts);
    if (num(r.base)) mark(sx, y(r.base), 4);
    circles.forEach(([cx, cy]) => mark(cx, cy, 6));
    return { p, sx, pts, circles };
  });
  const act = years.flatMap((r) => (num(r.actual) ? [{ r, cx: x(r.y), cy: y(r.actual) }] : []));
  markPath(act.map((a) => [a.cx, a.cy]));
  const now = act[act.length - 1];
  act.forEach((a) => mark(a.cx, a.cy, a === now ? 9 : 6.5));

  // 「スタート」「ゴール」の文字を添える点（最新の報告の計画期間だけ）。道すじの外側を先に探す
  const ends: { name: string; ex: number; ey: number; start: boolean; rising: boolean }[] = [];
  for (const { p, sx } of plans) {
    const { r } = p;
    if (!p.cur) continue;
    const rising = !num(r.base) || !num(r.target) || r.target >= r.base;
    if (num(r.base)) ends.push({ name: 'スタート', ex: sx, ey: y(r.base), start: true, rising });
    if (num(r.target)) ends.push({ name: 'ゴール', ex: x(p.ys[2]), ey: y(r.target), start: false, rising });
  }

  // ここから描く（道すじ → 実績値 → 文字。帯と目盛りは yearFrame が先に描いている）
  for (const { p, sx, pts, circles } of plans) {
    const ink = p.cur ? 'var(--ink-2)' : 'var(--none)';
    // 基準値の高さに薄い線（実績値がスタートより悪くなったかを見分けるため）
    if (p.cur && num(p.r.base)) svg.append(sv('line', { x1: sx, x2: left(p) + sw * 3 - 4, y1: y(p.r.base), y2: y(p.r.base), stroke: 'var(--hair)', 'stroke-width': 1.5, 'stroke-dasharray': '2 3' }));
    if (pts.length > 1) svg.append(sv('path', { d: line(pts), fill: 'none', stroke: ink, 'stroke-width': 2, 'stroke-dasharray': '5 4', 'stroke-linejoin': 'round' }));
    circles.forEach(([cx, cy]) => svg.append(sv('circle', { cx, cy, r: 5, fill: 'var(--paper)', stroke: ink, 'stroke-width': 2.5 })));
    if (num(p.r.base)) svg.append(sv('circle', { cx: sx, cy: y(p.r.base), r: 3.5, fill: ink }));
  }
  // 実績の線はスタートの年度から伸ばす（点は線が届いたときに置く）
  const actPts = act.map((a): Pt => [a.cx, a.cy]);
  const at = act.length > 1 ? drawIn(svg.appendChild(sv('path', { d: line(actPts), fill: 'none', stroke: 'var(--pop)', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })), actPts) : [0];
  act.forEach((a, i) => svg.append(popAt(sv('circle', { cx: a.cx, cy: a.cy, r: a === now ? 8 : 5.5, fill: 'var(--pop)', stroke: 'var(--line)', 'stroke-width': a === now ? 2.5 : 2 }), 'm-dot', at[i])));

  // 「いまここ」の札（最新の報告で使われなくなった指標は「最後の報告」）と、スタート・ゴールの文字
  if (now) hereTag(svg, textW, place, now, latest ? 'いまここ' : '最後の報告', at[at.length - 1] + 160);
  for (const { name, ex, ey, start, rising } of ends) {
    const w = textW(name, 'lbl2');
    const h = 14;
    // 道すじの外側（上がる指標ならスタートの下・ゴールの上。下がる指標は逆）を先に試す
    const up: Pt[] = start ? [[ex + 6, ey - 19], [ex + 18, ey - 20]] : [[ex - w / 2, ey - 22], [ex - w - 8, ey - 20]];
    const down: Pt[] = start ? [[ex + 6, ey + 5], [ex + 18, ey + 6]] : [[ex - w / 2, ey + 9], [ex - w - 8, ey + 6]];
    // スタートは、実績値が基準値と同じだと「いまここ」の札のすぐ横になるので、札の上下に外した場所も最後に試す
    const [bx, by] = place(w, h, (start !== rising ? [...up, ...down] : [...down, ...up]).concat(start ? [[ex + 8, ey - 7], [ex + 6, ey + 15], [ex + 6, ey - 30]] : []));
    // 文字の後ろに地の色を敷き、下を通る薄い線を隠す
    svg.append(sv('rect', { x: bx - 2, y: by - 1, width: w + 4, height: h + 2, rx: 3, fill: 'var(--paper)' }));
    svg.append(sv('text', { class: 'lbl2', x: bx, y: by + 11 }, name));
  }

  crosshair(wrap, svg, slots.map(x), m.t - 8, m.t + ih, (i, cx, cy) => {
    const s = slots[i];
    const r = years.find((q) => q.y === s);
    const per = periods.find((p) => p.ys.includes(s))!.r;
    const rows: TipRow[] = [];
    if (r) rows.push([withUnit(r.actual_raw, unit), `実績値${r.ref ? `（${r.ref}）` : ''}`, 'var(--pop)']);
    // 計画値の欄が空・「―」の年度（目標値が文の成果指標など）は出さない
    const pr = per.plan_raw?.[planIndex(s)];
    if (pr && /[^\s\-－―—‐]/.test(pr)) rows.push([withUnit(pr, unit), `${yl(s)}の計画値`, 'var(--ink-2)']);
    rows.push([withUnit(per.target_raw, unit), `ゴール（目標値・${per.target_year}）`, 'var(--ink)']);
    rows.push([withUnit(per.base_raw, unit), 'スタート（基準値）', 'var(--none)']);
    showRows(`${yl(s)}${r ? 'の報告' : ''}（${s <= 2024 ? '前期' : '中期'}）`, rows, cx, cy);
  }, slots.indexOf(last.y));
}

// 主な取組の活動指標の「計画と実績」。成果指標の図と同じ形で、横は報告年度、計画期間ごとに点線でつないだ白い丸がその年度の計画、青い点が実績。
// 最新の報告にある取組は、部局票の年度別計画からこの先の年度の計画も白い丸で置く。活動の量なので縦の目盛りは0から。
// 図の中の文字は「いまここ」だけにし、進捗状況と達成割合はツールチップと「表で見る」に出す（最後の報告の年度の計画と実績は図の上の文。KatsudouChart.astro）。
// 右の余白（m.r の 8px）も、表の右の余白と同じ
function drawKatsudou(wrap: HTMLElement, W: number, { unit, years, here }: KatsudouData) {
  const num = (v: number | null): v is number => v != null && Number.isFinite(v);
  const done = years.filter((r) => !r.future);
  const last = done[done.length - 1];
  const periods = [[2022, 2023, 2024], [2025, 2026, 2027]].flatMap((ys) => {
    const rows = years.filter((q) => ys.includes(q.y));
    return rows.length ? [{ ys, rows, cur: ys.includes(last.y) }] : [];
  });
  const vals = years.flatMap((r) => [r.plan, r.actual]).filter(num);
  let lo = Math.min(0, ...vals);
  let hi = Math.max(0, ...vals);
  hi += (hi - lo || 1) * 0.12;
  const ticks = niceTicks(lo, hi, 4);
  lo = Math.min(lo, ticks[0]);
  hi = Math.max(hi, ticks[ticks.length - 1]);
  // 取組のページで頭の数字の次に見る図なので、成果指標の図より低くする
  const H = W < 480 ? 160 : 170;
  // 左の余白は、下の「表で見る」の表の行の見出し（「達成割合」）が入る幅より狭くしない。決まった余白はカードに --plot-l で渡し、
  // 表の列を図の年度にそろえる（取組のページの .progress.aligned）
  const { svg, textW, m, ih, slots, x, y } = yearFrame(wrap, W, H, 36, periods, ticks, lo, hi, unit, 60);
  wrap.parentElement?.style.setProperty('--plot-l', `${m.l}px`);
  const line = (pts: Pt[]) => pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join('');
  const { mark, markPath, place } = placer(W, 24, m.t + ih + 2);

  // 計画は計画期間ごとに点線でつなぎ、実績は年度をまたいでつなぐ
  const plans = periods.map((p) => ({ p, pts: p.rows.flatMap((r): Pt[] => (num(r.plan) ? [[x(r.y), y(r.plan)]] : [])) }));
  for (const { pts } of plans) {
    markPath(pts);
    pts.forEach(([cx, cy]) => mark(cx, cy, 6));
  }
  const act = done.flatMap((r) => (num(r.actual) ? [{ cx: x(r.y), cy: y(r.actual) }] : []));
  markPath(act.map((a) => [a.cx, a.cy]));
  const now = here ? act[act.length - 1] : undefined;
  const dotR = (a: (typeof act)[number]) => (a === now ? 8 : 5.5);
  act.forEach((a) => mark(a.cx, a.cy, dotR(a) + 3));
  // 実績が計画とほぼ同じ高さだと、計画の白い丸が実績の点に隠れるので、点の外側に輪で描く（計画どおりの年度が多いため）
  const under = (cx: number, cy: number) => act.find((a) => a.cx === cx && Math.abs(a.cy - cy) < 6);

  for (const { p, pts } of plans) {
    const ink = p.cur ? 'var(--ink-2)' : 'var(--none)';
    if (pts.length > 1) svg.append(sv('path', { d: line(pts), fill: 'none', stroke: ink, 'stroke-width': 2, 'stroke-dasharray': '5 4', 'stroke-linejoin': 'round' }));
    pts.forEach(([cx, cy]) => { if (!under(cx, cy)) svg.append(sv('circle', { cx, cy, r: 5, fill: 'var(--paper)', stroke: ink, 'stroke-width': 2.5 })); });
  }
  // 実績の線は最初の年度から伸ばす（点は線が届いたときに置く。計画の白い丸・輪は最初から出しておく）
  const actPts = act.map((a): Pt => [a.cx, a.cy]);
  const at = act.length > 1 ? drawIn(svg.appendChild(sv('path', { d: line(actPts), fill: 'none', stroke: 'var(--pop)', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })), actPts) : [0];
  act.forEach((a, i) => svg.append(popAt(sv('circle', { cx: a.cx, cy: a.cy, r: dotR(a), fill: 'var(--pop)', stroke: 'var(--line)', 'stroke-width': a === now ? 2.5 : 2 }), 'm-dot', at[i])));
  for (const { p, pts } of plans) {
    for (const [cx, cy] of pts) {
      const a = under(cx, cy);
      if (a) svg.append(sv('circle', { cx: a.cx, cy: a.cy, r: dotR(a) + 3, fill: 'none', stroke: p.cur ? 'var(--ink-2)' : 'var(--none)', 'stroke-width': 2 }));
    }
  }
  if (now) hereTag(svg, textW, place, now, here, at[at.length - 1] + 160);

  crosshair(wrap, svg, slots.map(x), m.t - 8, m.t + ih, (i, cx, cy) => {
    const s = slots[i];
    const r = years.find((q) => q.y === s);
    const per = s <= 2024 ? '前期' : '中期';
    if (!r) {
      showRows(`${yl(s)}（${per}）`, [['—', here === 'いまここ' && s > last.y ? 'これからの年度です（計画の記載なし）' : 'この年度の報告に、この活動指標はありません']], cx, cy);
    } else if (r.future) {
      showRows(`${yl(s)}の計画（${per}）`, [[r.plan_raw, '計画（年度別計画）', 'var(--ink-2)'], ['—', '実績はまだ報告されていません']], cx, cy);
    } else {
      const rows: TipRow[] = [[r.actual_raw || '—', '実績', 'var(--pop)'], [r.plan_raw || '—', '計画', 'var(--ink-2)']];
      if (r.ach) rows.push([r.ach, '達成割合']);
      rows.push([r.status, '進捗状況']);
      showRows(`${yl(s)}の報告（${per}）`, rows, cx, cy);
    }
  }, slots.indexOf(last.y));
}

const DRAW = { trend: drawTrend, seika: drawSeika, katsudou: drawKatsudou };
// 動き: 初めて描く図は、画面に入ってから実績の線を伸ばす（styles/global.css の「動き」）。それまでは図に m-anim を付けて止めておき、
// 3分の1ほど画面に入ったら m-go で動かし、動き終わったら両方を外す。描き直したとき（幅が変わった・印刷）は動かさない。
// 動きを減らす設定・IntersectionObserver の無いブラウザでは、はじめから描き終わった形
const ANIM_END_MS = DRAW_MS + 600;
const io = moving() && 'IntersectionObserver' in window
  ? new IntersectionObserver((entries, obs) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      obs.unobserve(e.target);
      e.target.classList.add('m-go');
      setTimeout(() => e.target.classList.remove('m-anim', 'm-go'), ANIM_END_MS);
    }
  }, { threshold: 0.35 })
  : null;
const charts: { el: HTMLElement; render: () => void }[] = [];
for (const el of document.querySelectorAll<HTMLElement>('[data-chart]')) {
  const json = el.querySelector('script[type="application/json"]');
  const draw = DRAW[el.dataset.chart as keyof typeof DRAW];
  if (!json || !draw) continue;
  const data = JSON.parse(json.textContent!);
  let drawn = false;
  charts.push({
    el,
    render: () => {
      if (!el.clientWidth) return;
      if (!drawn && io) {
        el.classList.add('m-anim');
        io.observe(el);
      }
      drawn = true;
      draw(el, el.clientWidth, data);
    },
  });
}
const renderAll = () => { for (const c of charts) c.render(); };
renderAll();
// 幅が変わったとき（画面の回転・縦のスクロールバーが出たとき）に描き直す。
// スマホはアドレスバーが出入りするたびに resize が起きるが、幅は変わらないので描き直さない
let w = document.documentElement.clientWidth;
window.addEventListener('resize', () => {
  if (document.documentElement.clientWidth === w) return;
  w = document.documentElement.clientWidth;
  renderAll();
});
// <details> を開いたときは、その中の図だけを描く（閉じている間は幅が 0 なので描いていない）
for (const d of document.querySelectorAll('details')) d.addEventListener('toggle', () => { if (d.open) for (const c of charts) if (d.contains(c.el)) c.render(); });
// 印刷の前後には全部を描き直す（scripts/print.ts が畳んだ内容を開いてページを紙の幅にそろえたあと・元に戻したあと）
// まだ画面に入っていない図も、紙には描き終わった形で出す
window.addEventListener('beforeprint', () => { for (const c of charts) c.el.classList.remove('m-anim', 'm-go'); });
window.addEventListener('beforeprint', renderAll);
window.addEventListener('afterprint', renderAll);
// 年の書き方を切り替えたら描き直す（文字の幅が変わるため。scripts/era.ts）
document.addEventListener('era', renderAll);
