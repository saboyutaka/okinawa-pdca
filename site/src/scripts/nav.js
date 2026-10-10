// ヘッダーのナビの「▾」でサブメニュー（施策をさがす／基本施策の一覧 など）を開け閉めする。
// ナビはスマホで横にすべらせるので、下に重ねるドロップダウンではなく、ナビの下に1段で出す。
// スクリプトが動かない環境でも、そのグループのページではサブメニューがはじめから見え、「施策」などの文字はふつうのリンクとして使える
const toggles = [...document.querySelectorAll('.nav-toggle')];
const menuOf = (btn) => document.getElementById(btn.getAttribute('aria-controls'));
function setOpen(btn, open) {
  btn.setAttribute('aria-expanded', String(open));
  menuOf(btn).hidden = !open;
}
for (const btn of toggles) {
  btn.hidden = false;
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    for (const other of toggles) if (other !== btn) setOpen(other, false);
    setOpen(btn, open);
    if (open) menuOf(btn).querySelector('a')?.focus({ preventScroll: true });
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const btn = toggles.find((b) => b.getAttribute('aria-expanded') === 'true' && !menuOf(b).hasAttribute('data-default-open'));
  if (btn) { setOpen(btn, false); btn.focus(); }
});
