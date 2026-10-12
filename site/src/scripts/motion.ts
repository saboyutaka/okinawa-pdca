// 動きの補助（docs/design.md の12章）。動きの見た目は styles/global.css の「動き」で決め、ここではスクリプトから動かすものだけを受け持つ。
// 端末で動きを減らす設定（prefers-reduced-motion: reduce）にしているときは何もしない
const motion = matchMedia('(prefers-reduced-motion: no-preference)');
export const moving = () => motion.matches;

// 数が変わったことに気づけるように、数字を一度だけ小さくはねさせる（絞り込みの件数）。要素は inline-block にしておく（inline では動かない）
export function bump(el: Element | null) {
  if (!el || !moving() || !el.animate) return;
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.2)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
}

// 押して出した要素に、すっと出す動き（styles/global.css の cls）を付け、終わったら外す
// （外さないと、絞り込みで隠して出し直したときにまた動くため）
export function reveal(els: Element[], cls = 'm-in') {
  if (!moving()) return;
  for (const el of els) el.classList.add(cls);
  setTimeout(() => { for (const el of els) el.classList.remove(cls); }, 400);
}
