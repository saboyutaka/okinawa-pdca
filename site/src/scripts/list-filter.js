// 一覧の絞り込み（施策・指標の一覧で共通）。
// <form data-filter="#一覧のid" data-count="#件数のid" data-empty="#0件の表示のid"> の各入力の name と、
// 一覧の [data-item] 要素の data-<name> を比べる。
//  - 入力の値も項目の値も「|」区切りで複数を表せる。どれか1つが同じなら一致（例: 判定「C|D」）
//  - 同じ name のチェックボックスが複数選ばれているときも、どれか1つが同じなら一致（name が違う条件どうしは「かつ」）
//  - name="q" は、項目の data-text に空白で区切ったすべての語が含まれれば一致
// [data-group] は中に表示中の項目が無ければ隠す。条件は URL のクエリに残すので、そのまま共有できる。
const norm = (s) => s.normalize('NFKC').toLowerCase();

for (const form of document.querySelectorAll('form[data-filter]')) {
  const scope = document.querySelector(form.dataset.filter);
  const items = [...scope.querySelectorAll('[data-item]')];
  const groups = [...scope.querySelectorAll('[data-group]')];
  const count = document.querySelector(form.dataset.count);
  const empty = document.querySelector(form.dataset.empty);

  const apply = () => {
    const conds = new Map();
    for (const [k, v] of new FormData(form)) {
      if (v === '') continue;
      if (!conds.has(k)) conds.set(k, []);
      conds.get(k).push(String(v));
    }
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
    for (const g of groups) g.hidden = !g.querySelector('[data-item]:not([hidden])');
    if (count) count.textContent = String(n);
    if (empty) empty.hidden = n > 0;
    const params = new URLSearchParams();
    for (const [k, values] of conds) for (const v of values) params.append(k, v);
    const qs = params.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  };

  // URL の条件を入力に戻す。チェックボックス・ラジオは「C|D」のような書き方も1つずつ選ぶ
  const params = new URLSearchParams(location.search);
  for (const k of new Set(params.keys())) {
    const values = params.getAll(k).flatMap((v) => [v, ...v.split('|')]);
    for (const input of form.querySelectorAll(`[name="${CSS.escape(k)}"]`)) {
      if (input.type === 'checkbox' || input.type === 'radio') input.checked = values.includes(input.value);
      else input.value = params.get(k);
    }
  }
  form.addEventListener('input', apply);
  form.addEventListener('change', apply);
  form.addEventListener('submit', (e) => e.preventDefault());
  apply();
}
