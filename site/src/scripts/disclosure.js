// 畳んだ内容の開け閉め。
//  - [data-open-all="#範囲"] のボタン: 範囲の中の <details> と「続きを読む」をまとめて開く・閉じる
//  - [data-clamp] の文章: 長いときだけ途中まで見せ、「続きを読む」ボタン（[data-clamp-toggle="id"]）で全文にする
//    （スクリプトが動かない環境では、はじめから全文が見える）
//  - URL の # の行き先が閉じた <details> の中にあるときは開く
function setClamp(box, open) {
  box.classList.toggle('open', open);
  const btn = document.querySelector(`[data-clamp-toggle="${box.id}"]`);
  if (btn) {
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? '短く表示する' : '続きを読む';
  }
}
for (const box of document.querySelectorAll('[data-clamp]')) {
  const btn = document.querySelector(`[data-clamp-toggle="${box.id}"]`);
  box.classList.add('clamp');
  if (box.scrollHeight <= box.clientHeight + 24) {
    box.classList.remove('clamp');
    continue;
  }
  if (btn) {
    btn.hidden = false;
    btn.addEventListener('click', () => setClamp(box, !box.classList.contains('open')));
    setClamp(box, false);
  }
}
for (const btn of document.querySelectorAll('[data-open-all]')) {
  const scope = document.querySelector(btn.dataset.openAll) || document.body;
  btn.hidden = false;
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(open));
    btn.textContent = open ? 'すべて閉じる' : 'すべて開く';
    for (const d of scope.querySelectorAll('details')) d.open = open;
    for (const box of scope.querySelectorAll('[data-clamp].clamp')) setClamp(box, open);
    window.dispatchEvent(new Event('resize'));
  });
}
function revealHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const t = id && document.getElementById(id);
  if (!t) return;
  let d = t.closest('details');
  let opened = false;
  while (d) {
    if (!d.open) { d.open = true; opened = true; }
    d = d.parentElement?.closest('details');
  }
  if (opened) t.scrollIntoView();
}
revealHash();
window.addEventListener('hashchange', revealHash);
