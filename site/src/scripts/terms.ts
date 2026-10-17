// 用語（components/Term.astro）を押すと、短い説明を吹き出しで出す。その場所だけの一言（data-term-note）があれば説明の下に足す。
// data-term-brief があれば、説明の代わりに、その id の <template> の中身（短い説明と区分の一覧など）を写す
// Esc か「×」で閉じ、押したボタンにフォーカスを戻す
import { OWN_TERMS, TERMS } from '../lib/terms.ts';

// data-term の文字で引く（どちらにも無い言葉は undefined）
const texts: Partial<Record<string, string>> = TERMS;
const owns: Partial<Record<string, { text: string; href: string }>> = OWN_TERMS;

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
  body.className = 'termpop-body';
  const brief = document.createElement('div');
  brief.className = 'termpop-brief';
  const note = document.createElement('p');
  note.className = 'termpop-note';
  const link = document.createElement('a');
  link.className = 'termpop-link';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'termpop-close';
  close.setAttribute('aria-label', '用語の説明を閉じる');
  close.textContent = '×';
  close.addEventListener('click', () => closePop());
  pop.append(title, body, brief, note, link, close);
  document.body.append(pop);
  return pop;
}
function open(btn: HTMLElement) {
  pop ??= build();
  if (from) from.setAttribute('aria-expanded', 'false');
  from = btn;
  const word = btn.dataset.term || '';
  pop.querySelector('.termpop-title')!.textContent = `${word}とは`;
  const body = pop.querySelector<HTMLElement>('.termpop-body')!;
  const brief = pop.querySelector<HTMLElement>('.termpop-brief')!;
  const tpl = btn.dataset.termBrief ? document.getElementById(btn.dataset.termBrief) : null;
  brief.replaceChildren(...(tpl instanceof HTMLTemplateElement ? [tpl.content.cloneNode(true)] : []));
  brief.hidden = !brief.childElementCount;
  const own = owns[word];
  body.textContent = own?.text ?? texts[word] ?? '';
  const link = pop.querySelector<HTMLAnchorElement>('.termpop-link')!;
  link.href = own?.href ?? '/pdca/#yougo';
  link.textContent = own ? 'くわしく' : '用語の一覧';
  body.hidden = !brief.hidden;
  const note = pop.querySelector<HTMLElement>('.termpop-note')!;
  note.textContent = btn.dataset.termNote || '';
  note.hidden = !btn.dataset.termNote;
  // 西暦で表示するときは、大きさを測る前に書き換える（lib/era.ts）
  window.era?.fix(pop);
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
