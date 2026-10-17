// 押せる四角（components/StatusBar.astro の pop。将来像のページの頭の主要指標と、施策の行の主な取組）。
// 四角を押す・タップすると、その1件の中身を吹き出しに出す（指標のマップの吹き出し scripts/indicator-map.ts と同じ形）。
//  - 中身は四角の並び（[data-cell-pop]）の <template> に、四角と同じ順で書いてある。頭の区分の札は、四角の区分の番号（data-k）と並びの data-cats から書く
//  - 吹き出しは1つを使い回し、押した四角の下（画面に入らなければ上）に置いて、尾で四角を指す。同じ四角をもう一度押す・×・Esc・吹き出しの外を押すと閉じる
//  - Tab で止まる並び（tabindex を付けたもの）は、止まっただけでは開かず、← → Home End で1件ずつ移って中身を出し、Enter でそのページへ移る。
//    フォーカスが並びと吹き出しの外へ出たら閉じる
import { popClose, popHead } from '../lib/cell-pop.ts';
import { iconSvg, type Tone } from '../lib/icons.ts';
import { reveal } from './motion.ts';
import { placePop } from './pop-place.ts';

type Cat = [label: string, tone: Tone];
interface Sel { wrap: HTMLElement; cells: HTMLElement[]; i: number }

let pop: HTMLDivElement | undefined;
let sel: Sel | null = null;
const cellsOf = (wrap: HTMLElement) => [...wrap.querySelectorAll<HTMLElement>('.sbar .seg')];
const groupOf = (wrap: HTMLElement) => wrap.querySelector<HTMLElement>('.sbar[tabindex]');

function build() {
  const p = document.createElement('div');
  p.className = 'cellpop';
  p.hidden = true;
  p.setAttribute('aria-live', 'polite');
  p.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-cp-close]')) close(true);
  });
  p.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close(true);
  });
  document.body.append(p);
  return p;
}

// 吹き出しは body に置くので、ページのスクロールの量を足して置く
function place() {
  if (!sel || !pop) return;
  const cell = sel.cells[sel.i];
  if (!cell.offsetParent) return close(); // 絞り込みなどで行が隠れた
  placePop(pop, cell.getBoundingClientRect(), { x: scrollX, y: scrollY });
}

function show(wrap: HTMLElement, i: number) {
  pop ??= build();
  if (sel) sel.cells[sel.i].classList.remove('sel');
  const cells = cellsOf(wrap);
  sel = { wrap, cells, i };
  cells[i].classList.add('sel');
  const [label, tone] = (JSON.parse(wrap.dataset.cats!) as Cat[])[Number(cells[i].dataset.k)];
  const mark = wrap.dataset.shapes === 'true' ? iconSvg(tone) : `<i class="cp-sq tone-${tone}" aria-hidden="true"></i>`;
  pop.innerHTML = popHead(wrap.dataset.term!, mark, label, wrap.dataset.year!) + popClose('data-cp-close');
  const body = wrap.querySelector('template')!.content.children[i];
  if (body) pop.insertBefore(body.cloneNode(true), pop.lastChild);
  pop.hidden = false;
  window.era?.fix(pop); // 西暦で表示しているときは、大きさを測る前に書き換える（lib/era.ts）
  place();
  reveal([pop]);
}

function close(refocus = false) {
  if (!sel || !pop) return;
  sel.cells[sel.i].classList.remove('sel');
  const g = groupOf(sel.wrap);
  sel = null;
  pop.hidden = true;
  pop.replaceChildren();
  if (refocus && g) g.focus();
}

document.addEventListener('click', (e) => {
  const t = e.target as Element;
  const cell = t.closest?.<HTMLElement>('[data-cell-pop] .seg');
  if (cell) {
    const wrap = cell.closest<HTMLElement>('[data-cell-pop]')!;
    const i = cellsOf(wrap).indexOf(cell);
    if (sel?.wrap === wrap && sel.i === i) close();
    else show(wrap, i);
    return;
  }
  if (sel && pop && !pop.contains(t)) close();
});

document.addEventListener('keydown', (e) => {
  const g = (e.target as Element).closest?.<HTMLElement>('[data-cell-pop] .sbar[tabindex]');
  if (!g) {
    if (e.key === 'Escape') close();
    return;
  }
  const wrap = g.closest<HTMLElement>('[data-cell-pop]')!;
  const n = cellsOf(wrap).length;
  const at = sel?.wrap === wrap ? sel.i : -1;
  let i: number;
  if (e.key === 'ArrowRight') i = at < 0 ? 0 : Math.min(at + 1, n - 1);
  else if (e.key === 'ArrowLeft') i = at < 0 ? n - 1 : Math.max(at - 1, 0);
  else if (e.key === 'Home') i = 0;
  else if (e.key === 'End') i = n - 1;
  else if (e.key === 'Escape' && at >= 0) {
    e.preventDefault();
    close();
    return;
  } else if (e.key === 'Enter' && at >= 0) {
    e.preventDefault();
    const a = pop?.querySelector<HTMLAnchorElement>('.cp-name a');
    if (a) location.assign(a.href);
    return;
  } else return;
  e.preventDefault();
  show(wrap, i);
});

// フォーカスが並びと吹き出しの外へ出たら閉じる（マウスで押して開いたときは、フォーカスはそのまま動かないので閉じない）
document.addEventListener('focusin', (e) => {
  if (sel && pop && !sel.wrap.contains(e.target as Node) && !pop.contains(e.target as Node)) close();
});
// 一覧の絞り込みで行が隠れたときは閉じ、画面の幅が変わったら置き直す
document.addEventListener('input', () => close());
addEventListener('resize', place);
