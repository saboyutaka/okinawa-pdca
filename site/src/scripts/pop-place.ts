// 吹き出し（styles/global.css の .cellpop）を押した四角の下に置き、画面の下に入らなければ上に置く（上にも入らなければ下）。
// 横は画面の中に収め、尾（--ax）は四角の真ん中を指す。origin は吹き出しの位置の基準（body に置くならスクロールの量、箱の中に置くなら箱の左上を引く）
export function placePop(pop: HTMLElement, cell: DOMRect, origin: { x: number; y: number }) {
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  const vw = document.documentElement.clientWidth;
  const left = Math.max(8, Math.min(cell.left + cell.width / 2 - w / 2, vw - w - 8));
  const below = cell.bottom + 12 + h <= innerHeight - 8 || cell.top - 12 - h < 8;
  pop.classList.toggle('above', !below);
  pop.style.left = `${left + origin.x}px`;
  pop.style.top = `${(below ? cell.bottom + 12 : cell.top - 12 - h) + origin.y}px`;
  pop.style.setProperty('--ax', `${cell.left + cell.width / 2 - left}px`);
}
