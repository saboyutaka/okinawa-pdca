// data-tip-value / data-tip-label を持つ要素に、ホバーとキーボードのフォーカスで同じ内容を出す。
// 値は表やラベルにも必ず出しているので、ツールチップは補助にとどめる。
const tip = document.createElement('div');
tip.className = 'tooltip';
tip.hidden = true;
// 値はラベル・表・aria-label でも読めるので、読み上げソフトには出さない（ホバーのたびに読み上げられるのを避ける）
tip.setAttribute('aria-hidden', 'true');
const strong = document.createElement('strong');
const label = document.createElement('span');
tip.append(strong, label);
document.body.append(tip);

function show(el, x, y) {
  strong.textContent = el.dataset.tipValue || '';
  label.textContent = el.dataset.tipLabel || '';
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  const left = Math.min(Math.max(8, x - r.width / 2), window.innerWidth - r.width - 8);
  const top = y - r.height - 12 < 8 ? y + 16 : y - r.height - 12;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}
const target = (e) => e.target.closest?.('[data-tip-value]');

document.addEventListener('pointermove', (e) => {
  const el = target(e);
  if (el) show(el, e.clientX, e.clientY);
  else tip.hidden = true;
});
document.addEventListener('focusin', (e) => {
  const el = target(e);
  if (!el) return;
  const r = el.getBoundingClientRect();
  show(el, r.left + r.width / 2, r.top);
});
document.addEventListener('focusout', () => (tip.hidden = true));
window.addEventListener('scroll', () => (tip.hidden = true), { passive: true });
