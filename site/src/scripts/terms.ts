// 用語（components/Term.astro）を押すと、短い説明を吹き出しで出す。その場所だけの一言（data-term-note）があれば説明の下に足す。
// data-term-extra があれば、その id の <template> の中身（区分の一覧など）を説明の下に写す
// Esc か「×」で閉じ、押したボタンにフォーカスを戻す
import { TERMS } from '../lib/terms.ts';

let pop: HTMLDivElement | undefined;
let from: HTMLElement | null = null;
function build() {
  const pop = document.createElement('div');
  pop.className = 'termpop';
  pop.id = 'termpop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-labelledby', 'termpop-title');
  pop.tabIndex = -1;
  pop.hidden = true;
  const title = document.createElement('div');
  title.className = 'termpop-title';
  title.id = 'termpop-title';
  const body = document.createElement('p');
  const extra = document.createElement('div');
  extra.className = 'termpop-extra';
  const note = document.createElement('p');
  note.className = 'termpop-note';
  const link = document.createElement('a');
  link.href = '/about/#yougo';
  link.textContent = '用語の一覧';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'termpop-close';
  close.setAttribute('aria-label', '用語の説明を閉じる');
  close.textContent = '×';
  close.addEventListener('click', () => closePop());
  pop.append(title, body, extra, note, link, close);
  document.body.append(pop);
  return pop;
}
function open(btn: HTMLElement) {
  pop ??= build();
  if (from) from.setAttribute('aria-expanded', 'false');
  from = btn;
  const word = btn.dataset.term || '';
  pop.querySelector('.termpop-title')!.textContent = `${word}とは`;
  pop.querySelector('p')!.textContent = TERMS[word] || '';
  const extra = pop.querySelector<HTMLElement>('.termpop-extra')!;
  const tpl = btn.dataset.termExtra ? document.getElementById(btn.dataset.termExtra) : null;
  extra.replaceChildren(...(tpl instanceof HTMLTemplateElement ? [tpl.content.cloneNode(true)] : []));
  extra.hidden = !extra.childElementCount;
  const note = pop.querySelector<HTMLElement>('.termpop-note')!;
  note.textContent = btn.dataset.termNote || '';
  note.hidden = !btn.dataset.termNote;
  pop.hidden = false;
  const r = btn.getBoundingClientRect();
  const w = pop.offsetWidth;
  pop.style.left = `${Math.min(Math.max(8, r.left + window.scrollX), window.scrollX + document.documentElement.clientWidth - w - 8)}px`;
  pop.style.top = `${r.bottom + window.scrollY + 8}px`;
  btn.setAttribute('aria-expanded', 'true');
  pop.focus({ preventScroll: true });
}
function closePop(refocus = true) {
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  if (from) {
    from.setAttribute('aria-expanded', 'false');
    if (refocus) from.focus({ preventScroll: true });
  }
  from = null;
}
document.addEventListener('click', (e) => {
  const t = e.target instanceof Element ? e.target.closest<HTMLElement>('.term') : null;
  if (t) {
    if (from === t) closePop();
    else open(t);
    return;
  }
  if (pop && !pop.hidden && !pop.contains(e.target as Node)) closePop(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePop();
});
