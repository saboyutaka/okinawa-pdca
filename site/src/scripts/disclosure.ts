// 畳んだ内容の開け閉め。
//  - URL の # の行き先が閉じた <details> の中にあるときは開く
//  - 押して開いたときだけ、中身をすっと出す（styles/global.css の m-opening。# の行き先で開いたときは動かさない）
// 最新の年度の県のふりかえり・取組の活動と検証は、途中で切らずに全部出す（前の年度だけ details で畳む）
import { hashId } from './hash.ts';
import { reveal } from './motion.ts';

function revealHash() {
  const id = hashId();
  const t = id && document.getElementById(id);
  if (!t) return;
  let d: HTMLDetailsElement | null | undefined = t.closest('details');
  let opened = false;
  while (d) {
    if (!d.open) { d.open = true; opened = true; }
    d = d.parentElement?.closest('details');
  }
  if (opened) t.scrollIntoView();
}
revealHash();
window.addEventListener('hashchange', revealHash);
document.addEventListener('click', (e) => {
  const s = e.target instanceof Element ? e.target.closest('summary') : null;
  const d = s?.parentElement;
  // 閉じているものを押したとき（このあと開く）だけ
  if (d instanceof HTMLDetailsElement && !d.open) reveal([d], 'm-opening');
});
