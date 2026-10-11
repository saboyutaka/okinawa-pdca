// 一覧の絞り込み（施策・成果指標・部局のページで共通）。
// <form data-filter="#一覧のid" data-count="#件数のid" data-empty="#0件の表示のid" data-summary="#条件の表示のid"> の各入力の name と、
// 一覧の [data-item] 要素の data-<name> を比べる。
//  - 入力の値も項目の値も「|」区切りで複数を表せる。どれか1つが同じなら一致（例: 判定「C|D」）
//  - 同じ name のチェックボックスが複数選ばれているときも、どれか1つが同じなら一致（name が違う条件どうしは「かつ」）
//  - name="q" は、項目の data-text に空白で区切ったすべての語が含まれれば一致（全角・半角と「子ども・子供・こども」などの表記ゆれは lib/search.ts でそろえる）
// [data-group] は中に表示中の項目が無ければ隠す。その中の [data-group-count] には表示中の件数を入れる。
// いまの条件は data-summary の場所に「くらしのテーマ: 子ども・子育て ×」のように並べ、1つずつ外せる（条件の名前は入力を囲む [data-label]）。
// 条件は URL のクエリに残すので、そのまま共有できる。
// 絞り込むたびに、キーワード以外で初めの選択から変えた条件の数を、フォームの data-filter-n に残し、filters:change（detail.n）で送る（components/FilterMore.astro のボタンの数）。
// 初めから選んである select（成果指標の「対象: R7の報告にある指標」）を「すべて」に変えたときも条件として扱う（札・数・URL の「period=」に出す）。
import { matchesAll, searchText, searchWords } from '../lib/search.ts';

// 絞り込みの入力（キーワード・チェックボックス・ラジオ・select）
type Field = HTMLInputElement | HTMLSelectElement;
type CheckInput = HTMLInputElement & { type: 'checkbox' | 'radio' };
const isCheck = (el: Element): el is CheckInput => el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');

for (const form of document.querySelectorAll<HTMLFormElement>('form[data-filter]')) {
  const scope = document.querySelector(form.dataset.filter!)!;
  const items = [...scope.querySelectorAll<HTMLElement>('[data-item]')];
  const groups = [...scope.querySelectorAll<HTMLElement>('[data-group]')];
  const count = form.dataset.count ? document.querySelector(form.dataset.count) : null;
  const empty = form.dataset.empty ? document.querySelector<HTMLElement>(form.dataset.empty) : null;
  const summary = form.dataset.summary && document.querySelector<HTMLElement>(form.dataset.summary);
  const inputsOf = (name: string) => [...form.querySelectorAll<Field>(`[name="${CSS.escape(name)}"]`)];
  // 入力の初めの値（select は selected の付いた選択肢。無ければ先頭）
  const defaultOf = (el: Field) => (el instanceof HTMLSelectElement ? (([...el.options].find((o) => o.defaultSelected) || el.options[0])?.value ?? '') : el.defaultValue);
  const selects = [...form.querySelectorAll<HTMLSelectElement>('select[name]')];
  // 初めの選択のままの条件か（成果指標の「対象: R7の報告にある指標」のように、初めから選んである条件は数えない）
  const isDefault = (name: string, value: string) => {
    const first = inputsOf(name)[0];
    if (!first) return false;
    if (first instanceof HTMLSelectElement) return value === defaultOf(first);
    if (isCheck(first)) return inputsOf(name).some((x) => x.value === value && isCheck(x) && x.defaultChecked);
    return value === first.defaultValue;
  };
  // 入力を初めの値に戻す
  const reset = (el: Element) => {
    if (isCheck(el)) el.checked = el.defaultChecked;
    else if ((el instanceof HTMLInputElement || el instanceof HTMLSelectElement) && el.name) el.value = defaultOf(el);
  };

  const conditions = () => {
    const conds = new Map<string, string[]>();
    for (const [k, v] of new FormData(form)) {
      if (v === '') continue;
      if (!conds.has(k)) conds.set(k, []);
      conds.get(k)!.push(String(v));
    }
    // 初めから選んである select を「すべて」（空）にしたときも、条件として残す
    for (const el of selects) if (el.value === '' && defaultOf(el) !== '') conds.set(el.name, ['']);
    return conds;
  };

  // 条件1つの表示名（「くらしのテーマ」「子ども・子育て」）と、それを外す処理
  const describe = (name: string, value: string): [label: string, text: string, clear: () => void] => {
    const inputs = inputsOf(name);
    const first = inputs[0];
    const label = first?.closest<HTMLElement>('[data-label]')?.dataset.label || '';
    if (first && isCheck(first)) {
      // 同じ name の入力は、どれもチェックボックスかラジオ
      const boxes = inputs.filter(isCheck);
      const input = boxes.find((x) => x.value === value);
      const text = input?.dataset.text || input?.nextElementSibling?.textContent?.trim() || value;
      return [label, text, () => {
        if (input) input.checked = false;
        const all = boxes.find((x) => x.type === 'radio' && x.value === '');
        if (all) all.checked = true;
      }];
    }
    if (first instanceof HTMLSelectElement) {
      const opt = [...first.options].find((o) => o.value === value);
      // 外すと初めの選択に戻す。初めの選択のままの条件を外すときは「すべて」にする
      const def = defaultOf(first);
      return [label, opt?.textContent?.trim() || value, () => { first.value = value === def ? '' : def; }];
    }
    return [label, `「${value}」`, () => { if (first) first.value = ''; }];
  };

  const renderSummary = (conds: Map<string, string[]>) => {
    if (!summary) return;
    const parts = [...conds].flatMap(([name, values]) => values.map((v) => [name, v]));
    if (!parts.length) {
      summary.replaceChildren();
      summary.hidden = true;
      return;
    }
    summary.hidden = false;
    const head = document.createElement('span');
    head.className = 'active-l';
    head.textContent = '絞り込み中:';
    const chips = parts.map(([name, value]) => {
      const [label, text, clear] = describe(name, value);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'active-chip';
      b.setAttribute('aria-label', `${label ? `${label} ` : ''}${text} の条件を外す`);
      b.textContent = `${label ? `${label}: ` : ''}${text}`;
      const x = document.createElement('span');
      x.setAttribute('aria-hidden', 'true');
      x.textContent = '×';
      b.append(x);
      b.addEventListener('click', () => { clear(); apply(); });
      return b;
    });
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'more';
    all.textContent = 'すべて外す';
    all.addEventListener('click', () => {
      for (const el of form.elements) reset(el);
      apply();
    });
    summary.replaceChildren(head, ...chips, ...(parts.length > 1 ? [all] : []));
  };

  const apply = () => {
    const conds = conditions();
    let n = 0;
    for (const el of items) {
      const ok = [...conds].every(([name, values]) => {
        if (name === 'q') {
          const text = searchText(el.dataset.text || '');
          return values.every((value) => matchesAll(text, searchWords(value)));
        }
        const vs = values.filter(Boolean);
        if (!vs.length) return true; // 「すべて」
        const have = (el.dataset[name] || '').split('|');
        return vs.some((value) => value.split('|').some((v) => have.includes(v)));
      });
      el.hidden = !ok;
      if (ok) n++;
    }
    for (const g of groups) {
      const shown = g.querySelectorAll('[data-item]:not([hidden])').length;
      g.hidden = shown === 0;
      for (const c of g.querySelectorAll('[data-group-count]')) c.textContent = String(shown);
    }
    if (count) count.textContent = String(n);
    if (empty) empty.hidden = n > 0;
    renderSummary(conds);
    const changed = [...conds].filter(([k]) => k !== 'q').reduce((s, [k, values]) => s + values.filter((v) => !isDefault(k, v)).length, 0);
    form.dataset.filterN = String(changed);
    form.dispatchEvent(new CustomEvent('filters:change', { detail: { n: changed } }));
    const params = new URLSearchParams();
    for (const [k, values] of conds) for (const v of values) params.append(k, v);
    const qs = params.toString();
    // # の行き先（部局のページの課の行など）は残す（消すと、開いたときにその場所へ移らない）
    history.replaceState(null, '', `${qs ? `?${qs}` : location.pathname}${location.hash}`);
  };

  // URL の条件を入力に戻す。チェックボックス・ラジオは「C|D」のような書き方も1つずつ選ぶ
  const params = new URLSearchParams(location.search);
  for (const k of new Set(params.keys())) {
    const values = params.getAll(k).flatMap((v) => [v, ...v.split('|')]);
    for (const input of inputsOf(k)) {
      if (isCheck(input)) input.checked = values.includes(input.value);
      else input.value = params.get(k)!;
    }
  }
  form.addEventListener('input', apply);
  form.addEventListener('change', apply);
  form.addEventListener('submit', (e) => e.preventDefault());
  apply();
}
