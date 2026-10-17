// 一覧の絞り込みの「条件で絞り込む」のボタン（components/FilterMore.astro）。
for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-filter-toggle]')) {
  const body = document.getElementById(btn.getAttribute('aria-controls') || '');
  const badge = btn.querySelector<HTMLElement>('[data-filter-count]');
  if (!body) continue;
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    body.hidden = !open;
  });
  // 入っている条件の数（キーワードを除く）をボタンに出す
  const show = (n: number) => {
    if (!badge) return;
    badge.hidden = n === 0;
    const num = document.createElement('span');
    num.setAttribute('aria-hidden', 'true');
    num.textContent = String(n);
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = `（入っている条件 ${n}）`;
    badge.replaceChildren(num, sr);
  };
  btn.form?.addEventListener('filters:change', (e) => show(e.detail.n));
  if (btn.form?.dataset.filterN) show(Number(btn.form.dataset.filterN));
}
