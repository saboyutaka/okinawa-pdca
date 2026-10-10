// ツールチップ1つを、ホバー・フォーカス・タップ（tooltip.js）と図の十字線（charts.js）で使い回す。
// 値は表やラベル・aria-label にも必ず出しているので、読み上げソフトには出さない
let tip;
function el() {
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.hidden = true;
    tip.setAttribute('aria-hidden', 'true');
    document.body.append(tip);
  }
  return tip;
}
function place(x, y) {
  const t = el();
  t.hidden = false;
  const r = t.getBoundingClientRect();
  t.style.left = `${Math.min(Math.max(8, x - r.width / 2), window.innerWidth - r.width - 8)}px`;
  t.style.top = `${y - r.height - 12 < 8 ? y + 20 : y - r.height - 12}px`;
}
const node = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  n.textContent = text;
  return n;
};
export function showText(value, label, x, y) {
  el().replaceChildren(node('strong', value || ''), node('span', label || ''));
  place(x, y);
}
// rows: [値, 説明, 線の色] の並び（図の十字線で、その年度のすべての系列を出す）
export function showRows(title, rows, x, y) {
  el().replaceChildren(
    node('strong', title),
    ...rows.map(([v, label, color]) => {
      const r = node('div', '', 'tr');
      if (color) {
        const k = node('span', '', 'tk');
        k.style.setProperty('--k', color);
        r.append(k);
      }
      r.append(node('b', v), node('span', label));
      return r;
    }),
  );
  place(x, y);
}
export function hide() {
  if (tip) tip.hidden = true;
}
