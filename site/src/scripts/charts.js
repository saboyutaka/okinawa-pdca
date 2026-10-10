// [data-chart] の中の JSON から、表示幅に合わせて SVG の図を描く（幅を固定した SVG を縮めると、スマホで文字が小さくなりすぎるため）。
// 図全体でタブは1回だけ止まり、左右の矢印キーで年度を移る。値は各図の近くの表（「表で見る」）にも必ず出している
import { showRows, hide } from './tip.js';

const NS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}
const nf = new Intl.NumberFormat('ja-JP');
const yl = (y) => `R${y - 2018}`;
const planIndex = (y) => (y <= 2024 ? y - 2022 : y - 2025);
const withUnit = (raw, unit) => (raw && /^[-△]?[\d,.]+$/.test(raw.normalize('NFKC')) && unit ? `${raw}${unit}` : raw || '—');
function niceTicks(lo, hi, n = 4) {
  const raw = (hi - lo || 1) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

// 横に並ぶ点（年度）を、ポインターと矢印キーで選ぶ
function crosshair(wrap, svg, xs, top, bottom, onShow, start) {
  let idx = -1;
  const line = sv('line', { class: 'cross', y1: top, y2: bottom, visibility: 'hidden' });
  svg.append(line);
  const show = (i, pt) => {
    idx = i;
    line.setAttribute('x1', xs[i]);
    line.setAttribute('x2', xs[i]);
    line.setAttribute('visibility', 'visible');
    const r = svg.getBoundingClientRect();
    onShow(i, pt ? pt[0] : r.left + xs[i], pt ? pt[1] : r.top + top);
  };
  const off = () => {
    idx = -1;
    line.setAttribute('visibility', 'hidden');
    hide();
  };
  const nearest = (cx) => {
    const x = cx - svg.getBoundingClientRect().left;
    let b = 0;
    xs.forEach((v, i) => { if (Math.abs(v - x) < Math.abs(xs[b] - x)) b = i; });
    return b;
  };
  svg.addEventListener('pointermove', (e) => show(nearest(e.clientX), [e.clientX, e.clientY]));
  svg.addEventListener('pointerdown', (e) => show(nearest(e.clientX), [e.clientX, e.clientY]));
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') off(); });
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

// トップの4年間の推移: 主な取組の「順調」の割合と、成果指標の計画値に届いた割合（どちらも0〜100%の同じ目盛り）
function drawTrend(wrap, W, { points }) {
  const H = 250;
  const m = { l: 46, r: Math.min(140, W * 0.3), t: 32, b: 34 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const x = (i) => m.l + (points.length === 1 ? iw / 2 : (i * iw) / (points.length - 1));
  const y = (v) => m.t + (1 - v / 100) * ih;
  const svg = sv('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  for (const v of [0, 25, 50, 75, 100]) {
    svg.append(sv('line', { class: v === 0 ? 'base' : 'gridl', x1: m.l, x2: W - m.r + 8, y1: y(v), y2: y(v) }));
    svg.append(sv('text', { class: 'tick', x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, `${v}%`));
  }
  points.forEach((p, i) => svg.append(sv('text', { class: 'tick', x: x(i), y: H - 10, 'text-anchor': 'middle' }, W < 480 ? yl(p.y) : `${yl(p.y)}（${p.y}）`)));
  const div = points.findIndex((p) => p.y >= 2025);
  if (div > 0) {
    const dx = (x(div - 1) + x(div)) / 2;
    svg.append(sv('line', { class: 'base', x1: dx, x2: dx, y1: m.t - 20, y2: m.t + ih }));
    svg.append(sv('text', { class: 'lbl2', x: dx - 8, y: m.t - 10, 'text-anchor': 'end' }, '前期実施計画'));
    svg.append(sv('text', { class: 'lbl2', x: dx + 8, y: m.t - 10 }, '中期'));
  }
  const series = [
    ['a', 'var(--series-1)', 'circle', '取組「順調」'],
    ['b', 'var(--ink-2)', 'square', '成果指標 到達'],
  ];
  for (const [k, color, shape, name] of series) {
    svg.append(sv('path', { d: points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p[k])}`).join(''), fill: 'none', stroke: color, 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    points.forEach((p, i) => svg.append(shape === 'circle'
      ? sv('circle', { cx: x(i), cy: y(p[k]), r: 6, fill: color, stroke: 'var(--line)', 'stroke-width': 2 })
      : sv('rect', { x: x(i) - 5.5, y: y(p[k]) - 5.5, width: 11, height: 11, fill: color, stroke: 'var(--line)', 'stroke-width': 2 })));
    const last = points.length - 1;
    const t = sv('text', { class: 'lbl', x: x(last) + 14, y: y(points[last][k]) + 1 });
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

// 成果指標の報告年度ごとの推移。前期（R4〜R6）と中期（R7〜R9）で基準値・目標値が変わるので、計画期間ごとに線を引く
function drawSeika(wrap, W, { unit, years }) {
  const SLOTS = [2022, 2023, 2024, 2025, 2026, 2027];
  const H = 220;
  const m = { l: 50, r: 14, t: 40, b: 32 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const sw = iw / SLOTS.length;
  const x = (y) => m.l + (SLOTS.indexOf(y) + 0.5) * sw;
  const periods = [years.filter((r) => r.y <= 2024).pop(), years.filter((r) => r.y >= 2025).pop()].filter(Boolean);
  const vals = [];
  for (const r of years) if (r.actual != null) vals.push(r.actual);
  for (const r of periods) [r.base, r.target, ...r.plan].forEach((v) => v != null && Number.isFinite(v) && vals.push(v));
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.12;
  lo -= pad;
  hi += pad;
  const ticks = niceTicks(lo, hi, 4);
  lo = Math.min(lo, ticks[0]);
  hi = Math.max(hi, ticks[ticks.length - 1]);
  const y = (v) => m.t + (1 - (v - lo) / (hi - lo)) * ih;
  const u = (unit || '').normalize('NFKC');
  const svg = sv('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  for (const t of ticks) {
    svg.append(sv('line', { class: 'gridl', x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }));
    svg.append(sv('text', { class: 'tick', x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, `${nf.format(t)}${u.length <= 2 ? u : ''}`));
  }
  SLOTS.forEach((s) => svg.append(sv('text', { class: 'tick', x: x(s), y: H - 10, 'text-anchor': 'middle' }, yl(s))));
  const dx = m.l + 3 * sw;
  svg.append(sv('line', { class: 'base', x1: dx, x2: dx, y1: 8, y2: m.t + ih }));
  svg.append(sv('text', { class: 'lbl2', x: dx - 8, y: 16, 'text-anchor': 'end' }, '前期（R4〜R6）'));
  svg.append(sv('text', { class: 'lbl2', x: dx + 8, y: 16 }, '中期（R7〜R9）'));
  for (const r of periods) {
    const ys = r.y <= 2024 ? [2022, 2023, 2024] : [2025, 2026, 2027];
    const x1 = x(ys[0]) - sw * 0.42;
    const x2 = x(ys[2]) + sw * 0.42;
    if (r.base != null) svg.append(sv('line', { x1, x2, y1: y(r.base), y2: y(r.base), stroke: 'var(--none)', 'stroke-width': 2 }));
    if (r.target != null) {
      svg.append(sv('line', { x1, x2, y1: y(r.target), y2: y(r.target), stroke: 'var(--ink)', 'stroke-width': 2.5 }));
      const above = r.target >= (r.base ?? r.target);
      svg.append(sv('text', { class: 'lbl2', x: x1 + 2, y: y(r.target) + (above ? -7 : 16) }, `ゴール ${withUnit(r.target_raw, unit)}`));
    }
    r.plan.forEach((v, i) => {
      if (v != null && Number.isFinite(v)) svg.append(sv('circle', { cx: x(ys[i]), cy: y(v), r: 5, fill: 'var(--paper)', stroke: 'var(--ink-2)', 'stroke-width': 2.5 }));
    });
  }
  const act = years.filter((r) => r.actual != null);
  if (act.length > 1) svg.append(sv('path', { d: act.map((r, i) => `${i ? 'L' : 'M'}${x(r.y)},${y(r.actual)}`).join(''), fill: 'none', stroke: 'var(--pop)', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  act.forEach((r) => svg.append(sv('circle', { cx: x(r.y), cy: y(r.actual), r: 6.5, fill: 'var(--pop)', stroke: 'var(--line)', 'stroke-width': 2 })));
  const last = act[act.length - 1];
  if (last) svg.append(sv('text', { class: 'lbl', x: x(last.y), y: y(last.actual) + (last.actual >= (last.target ?? last.actual) ? -13 : 23), 'text-anchor': 'middle' }, withUnit(last.actual_raw, unit)));
  wrap.replaceChildren(svg);
  crosshair(wrap, svg, SLOTS.map(x), m.t, m.t + ih, (i, cx, cy) => {
    const s = SLOTS[i];
    const r = years.find((q) => q.y === s);
    const per = periods.find((p) => (s <= 2024) === (p.y <= 2024));
    const rows = [];
    if (r) rows.push([withUnit(r.actual_raw, unit), `実績値${r.ref ? `（${r.ref}の値）` : ''}`, 'var(--pop)']);
    if (per?.plan_raw?.length) rows.push([withUnit(per.plan_raw[planIndex(s)], unit), `${yl(s)}の計画値`, 'var(--ink-2)']);
    if (per) rows.push([withUnit(per.target_raw, unit), `目標値（${per.target_year}）`, 'var(--ink)']);
    showRows(`${yl(s)}${r ? '報告' : ''}（${s <= 2024 ? '前期' : '中期'}）`, rows.length ? rows : [['—', 'この年度の値はありません']], cx, cy);
  }, SLOTS.indexOf(years[years.length - 1]?.y ?? 2025));
}

const DRAW = { trend: drawTrend, seika: drawSeika };
const charts = [];
for (const el of document.querySelectorAll('[data-chart]')) {
  const json = el.querySelector('script[type="application/json"]');
  const draw = DRAW[el.dataset.chart];
  if (!json || !draw) continue;
  const data = JSON.parse(json.textContent);
  charts.push({ el, render: () => el.clientWidth && draw(el, el.clientWidth, data) });
}
const renderAll = () => { for (const c of charts) c.render(); };
renderAll();
// 幅が変わったとき（画面の回転・<details> を開いたとき）に描き直す
let w = document.documentElement.clientWidth;
window.addEventListener('resize', () => {
  if (document.documentElement.clientWidth !== w) w = document.documentElement.clientWidth;
  renderAll();
});
for (const d of document.querySelectorAll('details')) d.addEventListener('toggle', () => { if (d.open) renderAll(); });
