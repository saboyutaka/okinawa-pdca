// 畳んだ内容の開け閉め。
//  - [data-open-all="#範囲"] のボタン: 範囲の中の <details> をまとめて開く・閉じる
//  - URL の # の行き先が閉じた <details> の中にあるときは開く
//  - 押して開いたときだけ、中身をすっと出す（styles/global.css の m-opening。「すべて開く」・# の行き先で開いたときは動かさない）
// 最新の年度の県のふりかえり・取組の活動と検証は、途中で切らずに全部出す（前の年度だけ details で畳む）
import { reveal } from './motion.ts';

for (const btn of document.querySelectorAll<HTMLElement>('[data-open-all]')) {
  const scope = document.querySelector(btn.dataset.openAll!) || document.body;
  btn.hidden = false;
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(open));
    btn.textContent = open ? 'すべて閉じる' : 'すべて開く';
    for (const d of scope.querySelectorAll('details')) d.open = open;
    window.dispatchEvent(new Event('resize'));
  });
}
function revealHash() {
  const id = decodeURIComponent(location.hash.slice(1));
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
