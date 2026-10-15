// シェアのボタン（components/ShareMenu.astro）。開いた枠が画面の左右にはみ出すときは内側へずらし、ほかの場所を押す・Esc で閉じ、
// 1つ開くとほかは閉じる。「リンクをコピー」はシェア用のページの URL をクリップボードに入れ、読み上げにも伝える
const shares = [...document.querySelectorAll<HTMLDetailsElement>('[data-share-menu]')];
const COPIED_MS = 2000;
// 画面の端からあける幅
const EDGE = 8;

for (const d of shares) {
  const pop = d.querySelector<HTMLElement>('.share-menu-pop');
  const btn = d.querySelector<HTMLButtonElement>('[data-copy]');
  const input = d.querySelector<HTMLInputElement>('.share-menu-copy input');
  const status = d.querySelector<HTMLElement>('[role="status"]');
  d.addEventListener('toggle', () => {
    if (!d.open || !pop) return;
    for (const o of shares) if (o !== d) o.open = false;
    pop.style.translate = '';
    const r = pop.getBoundingClientRect();
    const right = document.documentElement.clientWidth - EDGE;
    const dx = r.left < EDGE ? EDGE - r.left : r.right > right ? right - r.right : 0;
    if (dx) pop.style.translate = `${Math.round(dx)}px 0`;
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
