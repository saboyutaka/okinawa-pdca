// 指標のシェアのボタン（components/IndicatorShare.astro）。開いた枠が左にはみ出すときは左の端をそろえ、ほかの場所を押す・Esc で閉じ、
// 1つ開くとほかは閉じる。「リンクをコピー」はシェア用のページの URL をクリップボードに入れ、読み上げにも伝える
const shares = [...document.querySelectorAll<HTMLDetailsElement>('[data-ishare]')];
const COPIED_MS = 2000;

for (const d of shares) {
  const pop = d.querySelector<HTMLElement>('.ishare-pop');
  const btn = d.querySelector<HTMLButtonElement>('[data-copy]');
  const input = d.querySelector<HTMLInputElement>('.ishare-copy input');
  const status = d.querySelector<HTMLElement>('[role="status"]');
  d.addEventListener('toggle', () => {
    if (!d.open || !pop) return;
    for (const o of shares) if (o !== d) o.open = false;
    pop.classList.remove('left');
    if (pop.getBoundingClientRect().left < 8) pop.classList.add('left');
  });
  if (!btn || !status) continue;
  const label = btn.textContent;
  let timer = 0;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy || '');
      btn.textContent = 'コピーしました';
      status.textContent = 'リンクをコピーしました';
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        btn.textContent = label;
        status.textContent = '';
      }, COPIED_MS);
    } catch {
      // クリップボードに書けないとき（権限が無いなど）は、リンクの欄を選んで写してもらう
      input?.select();
      status.textContent = 'リンクを選びました。コピーしてください';
    }
  });
}

if (shares.length) {
  document.addEventListener('click', (e) => {
    for (const d of shares) if (d.open && !d.contains(e.target as Node)) d.open = false;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const d = shares.find((x) => x.open);
    if (!d) return;
    d.open = false;
    d.querySelector('summary')?.focus();
  });
}
