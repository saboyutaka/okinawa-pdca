// 一覧の絞り込み（施策・成果指標・遅れが続いている取組・部局のページで共通）。
// <form data-filter="#一覧のid" data-count="#件数のid" data-empty="#0件の表示のid" data-summary="#条件の表示のid"> の各入力の name と、
// 一覧の [data-item] 要素の data-<name> を比べる。
//  - 入力の値も項目の値も「|」区切りで複数を表せる。どれか1つが同じなら一致（例: 判定「C|D」）
//  - 同じ name のチェックボックスが複数選ばれているときも、どれか1つが同じなら一致（name が違う条件どうしは「かつ」）
//  - name="q" は、項目の data-text に空白で区切ったすべての語が含まれれば一致
// [data-group] は中に表示中の項目が無ければ隠す。その中の [data-group-count] には表示中の件数を入れる。
// いまの条件は data-summary の場所に「くらしのテーマ: 子ども・子育て ×」のように並べ、1つずつ外せる（条件の名前は入力を囲む [data-label]）。
// 条件は URL のクエリに残すので、そのまま共有できる。
const norm = (s) => s.normalize('NFKC').toLowerCase();

for (const form of document.querySelectorAll('form[data-filter]')) {
  const scope = document.querySelector(form.dataset.filter);
  const items = [...scope.querySelectorAll('[data-item]')];
  const groups = [...scope.querySelectorAll('[data-group]')];
  const count = document.querySelector(form.dataset.count);
  const empty = document.querySelector(form.dataset.empty);
  const summary = form.dataset.summary && document.querySelector(form.dataset.summary);
  const inputsOf = (name) => [...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)];

  const conditions = () => {
    const conds = new Map();
    for (const [k, v] of new FormData(form)) {
      if (v === '') continue;
      if (!conds.has(k)) conds.set(k, []);
      conds.get(k).push(String(v));
    }
    return conds;
  };

  // 条件1つの表示名（「くらしのテーマ」「子ども・子育て」）と、それを外す処理
  const describe = (name, value) => {
    const inputs = inputsOf(name);
    const first = inputs[0];
    const label = first?.closest('[data-label]')?.dataset.label || '';
    if (first && (first.type === 'checkbox' || first.type === 'radio')) {
      const input = inputs.find((x) => x.value === value);
      const text = input?.dataset.text || input?.nextElementSibling?.textContent.trim() || value;
      return [label, text, () => {
        if (input) input.checked = false;
        const all = inputs.find((x) => x.type === 'radio' && x.value === '');
        if (all) all.checked = true;
      }];
    }
    if (first?.tagName === 'SELECT') {
      const opt = [...first.options].find((o) => o.value === value);
      return [label, opt?.textContent.trim() || value, () => { first.value = ''; }];
    }
    return [label, `「${value}」`, () => { if (first) first.value = ''; }];
  };

  const renderSummary = (conds) => {
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
      for (const el of form.elements) {
        if (el.type === 'checkbox') el.checked = false;
        else if (el.type === 'radio') el.checked = el.value === '';
        else if (el.name && el.tagName !== 'BUTTON') el.value = '';
      }
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
          const text = norm(el.dataset.text || '');
          return values.every((value) => norm(value).split(/\s+/).filter(Boolean).every((w) => text.includes(w)));
        }
        const have = (el.dataset[name] || '').split('|');
        return values.some((value) => value.split('|').some((v) => have.includes(v)));
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
    const params = new URLSearchParams();
    for (const [k, values] of conds) for (const v of values) params.append(k, v);
    const qs = params.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  };

  // URL の条件を入力に戻す。チェックボックス・ラジオは「C|D」のような書き方も1つずつ選ぶ
  const params = new URLSearchParams(location.search);
  for (const k of new Set(params.keys())) {
    const values = params.getAll(k).flatMap((v) => [v, ...v.split('|')]);
    for (const input of inputsOf(k)) {
      if (input.type === 'checkbox' || input.type === 'radio') input.checked = values.includes(input.value);
      else input.value = params.get(k);
    }
  }
  form.addEventListener('input', apply);
  form.addEventListener('change', apply);
  form.addEventListener('submit', (e) => e.preventDefault());
  apply();
}
