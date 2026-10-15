// 指標のシェアのボタン（components/ShareMenu.astro）。開いた枠が画面の左右にはみ出すときは内側へずらし、ほかの場所を押す・Esc で閉じ、
// 1つ開くとほかは閉じる。「リンクをコピー」は scripts/copy-link.ts
const shares = [...document.querySelectorAll<HTMLDetailsElement>('[data-share-menu]')];
// 画面の端からあける幅
const EDGE = 8;

for (const d of shares) {
  const pop = d.querySelector<HTMLElement>('.share-menu-pop');
  d.addEventListener('toggle', () => {
    if (!d.open || !pop) return;
    for (const o of shares) if (o !== d) o.open = false;
    pop.style.translate = '';
    const r = pop.getBoundingClientRect();
    const right = document.documentElement.clientWidth - EDGE;
    const dx = r.left < EDGE ? EDGE - r.left : r.right > right ? right - r.right : 0;
    if (dx) pop.style.translate = `${Math.round(dx)}px 0`;
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
