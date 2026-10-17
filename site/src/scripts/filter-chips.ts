// いまの絞り込みの条件の札（「くらしのテーマ: 子ども・子育て ×」。styles/global.css の .active-chip）。一覧の絞り込み（list-filter.ts）・取組をさがす・指標のマップで同じ形にする。
// label が空の条件（チェックボックス。それだけで条件が分かる）は見出しを付けない。札を押すと remove(その札の位置) を呼ぶ。
// clearAll を渡すと、条件が2つ以上のときに「すべて外す」を置く。条件が無ければ何も返さない（札を外したあとのフォーカスは呼ぶ側で移す）
export interface FilterChip { label: string; text: string }
export function filterChips(chips: FilterChip[], remove: (i: number) => void, clearAll?: () => void): HTMLElement[] {
  if (!chips.length) return [];
  const head = document.createElement('span');
  head.className = 'active-l';
  head.textContent = '絞り込み中:';
  const buttons = chips.map(({ label, text }, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'active-chip';
    b.setAttribute('aria-label', `${label ? `${label} ` : ''}${text} の条件を外す`);
    b.textContent = label ? `${label}: ${text}` : text;
    const x = document.createElement('span');
    x.setAttribute('aria-hidden', 'true');
    x.textContent = '×';
    b.append(x);
    b.addEventListener('click', () => remove(i));
    return b;
  });
  if (!clearAll || chips.length < 2) return [head, ...buttons];
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'more';
  all.textContent = 'すべて外す';
  all.addEventListener('click', clearAll);
  return [head, ...buttons, all];
}
