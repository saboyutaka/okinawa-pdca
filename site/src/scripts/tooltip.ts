// data-tip-value / data-tip-label を持つ要素に、マウスを乗せる・タップするで同じ内容を出す。
// 値は表やラベルにも必ず出しているので、ツールチップは補助にとどめる（棒の区間ごとにタブでは止めない）
import { showText, hide } from './tip.ts';

const closest = (e: Event, selector: string) => (e.target instanceof Element ? e.target.closest<HTMLElement>(selector) : null);
const target = (e: Event) => closest(e, '[data-tip-value]');
const inChart = (e: Event) => closest(e, '.chart');
let pinned: HTMLElement | null = null;

document.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || inChart(e)) return;
  const el = target(e);
  if (el) showText(el.dataset.tipValue, el.dataset.tipLabel, e.clientX, e.clientY);
  else if (!pinned) hide();
});
// スマホ: タップで出したままにし、もう一度タップするか、ほかの場所をタップすると消す（リンクやボタンの中では出さない）
document.addEventListener('pointerup', (e) => {
  if (e.pointerType === 'mouse' || inChart(e)) return;
  const el = target(e);
  if (el && !el.closest('a, button') && pinned !== el) {
    pinned = el;
    showText(el.dataset.tipValue, el.dataset.tipLabel, e.clientX, e.clientY);
  } else {
    pinned = null;
    hide();
  }
});
document.addEventListener('focusin', (e) => {
  const el = target(e);
  if (!el) return;
  const r = el.getBoundingClientRect();
  showText(el.dataset.tipValue, el.dataset.tipLabel, r.left + r.width / 2, r.top);
});
document.addEventListener('focusout', (e) => {
  if (target(e)) hide();
});
window.addEventListener('scroll', () => {
  pinned = null;
  hide();
}, { passive: true });
