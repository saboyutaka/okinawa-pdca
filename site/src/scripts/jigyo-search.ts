// 予算事業をさがす（pages/yosan/jigyo/index.astro）の検索と一覧。検索用のデータ（lib/jigyo-data.ts）を読んで、一覧をここで描く。
// どのページでも読み込む（scripts/site.ts）ので、検索のフォーム（#jf）があるページでだけ動かす。
// 絞り込み中の札・URL のクエリ・さらに表示・フォーカスの移し方は、取組をさがす（scripts/torikumi-search.ts）と同じ。並び（sort）は条件ではないので札にしない
import { fmt, yen } from '../lib/format.ts';
import { matchesAll, searchText, searchWords, type SearchWord } from '../lib/search.ts';
import type { JigyoData as Data } from '../lib/jigyo-data.ts';
import { yearLabel, yearLong } from '../lib/years.ts';
import { getJsonOr } from './fetch-json.ts';
import { filterChips, type FilterChip } from './filter-chips.ts';
import { bump } from './motion.ts';

const form = document.querySelector<HTMLFormElement>('form#jf');
const list = document.getElementById('results');
const count = document.getElementById('count');
const unit = document.getElementById('unit');
const active = document.getElementById('active');
const more = document.querySelector<HTMLButtonElement>('button#more');
if (form && list && count && unit && active && more) search({ form, list, count, unit, active, more });

interface Parts { form: HTMLFormElement; list: HTMLElement; count: HTMLElement; unit: HTMLElement; active: HTMLElement; more: HTMLButtonElement }
type Row = Data['rows'][number];
function search({ form, list, count, unit, active, more }: Parts) {
  const PAGE = 50;
  let data: Data | undefined;
  const countLine = count.closest<HTMLElement>('.result-count');
  if (countLine) countLine.tabIndex = -1;
  let refocus = -1;
  let hits: number[] = [];
  let shown = 0;
  let words: SearchWord[] = [];
  // 行ごとの検索される文字（行に見える名前・所管課と、見えない前の名前・取組の名前）。初めて探すときに作って使い回す
  let texts: [shown: string, hidden: string][] = [];

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function render(d: Data, row: Row, i: number) {
    const [slug, name, year, estimate, funds, section, , , torikumi, shared, , text] = row;
    const yl = yearLabel(year);
    const li = el('li', 'j-row');
    const main = el('div', 'j-main');
    const head = el('div');
    const a = el('a', 'name-link', name);
    a.href = `/yosan/jigyo/${slug}/`;
    head.append(a);
    // 最新の報告に無い予算事業の札（components/YearTag.astro の「R6まで」と同じ形）。金額と取組の数はこの年度のもの（ページの下の注記）
    if (year < d.latest) {
      const tag = el('span', 'year-tag ended', `${yl}まで`);
      tag.title = `${yl}の報告まで載っていた予算事業`;
      tag.append(el('span', 'sr-only', '載っていた予算事業'));
      head.append(' ', tag);
    }
    main.append(head, el('div', 'small secondary', `${section ? `${section}・` : ''}取組 ${fmt(torikumi)}件`));
    if (funds.length) {
      const f = el('div', 'small secondary j-funds');
      for (const k of funds) f.append(el('span', `swatch series-${d.funds[k][1]}`, d.funds[k][0]));
      main.append(f);
    }
    // キーワードが行に見える文字に無く、前の名前や取組の名前にだけあるときは、当たった名前を出す（なぜ出たかが分かるように）
    if (words.length && !matchesAll(texts[i][0], words)) {
      const names = text.split('\n').filter((t) => words.some(([w, f]) => searchText(t).includes(w) || searchText(t).includes(f)));
      if (names.length) main.append(el('div', 'small secondary', `当たった名前（前の名前・取組）: ${names.slice(0, 3).join('、')}${names.length > 3 ? ' ほか' : ''}`));
    }
    const amt = el('div', 'j-amt');
    const v = el('span', 'j-amt-v');
    v.append(el('span', 'big num', yen(estimate)));
    // 共通の金額の札（取組のページの予算の箱と同じ。押すと lib/terms.ts の「共通の金額」の説明。scripts/terms.ts が押されたのを受ける）
    if (shared) {
      const b = el('button', 'term common-tag', '共通');
      b.type = 'button';
      b.dataset.term = '共通の金額';
      b.dataset.termNote = `この予算事業の${yearLong(year)}の決算見込額のうち${yen(shared[0])}は、${shared[1]}つの取組に同じ額で書かれています。`;
      b.setAttribute('aria-expanded', 'false');
      b.setAttribute('aria-controls', 'termpop');
      b.tabIndex = -1;
      v.append(b);
    }
    amt.append(v);
    li.append(main, amt);
    return li;
  }

  function showMore(d: Data) {
    const frag = document.createDocumentFragment();
    for (const i of hits.slice(shown, shown + PAGE)) frag.append(render(d, d.rows[i], i));
    list.append(frag);
    shown = Math.min(hits.length, shown + PAGE);
    more.hidden = shown >= hits.length;
    more.textContent = `さらに表示（残り ${hits.length - shown}件）`;
  }

  // 並び。金額の順は、最新の報告の予算事業を先に（金額の大きい順）、そのあとに年度の新しい順・金額の大きい順。名前は五十音順、施策の順は報告書の順
  const SORTS: Record<string, (a: Row, b: Row) => number> = {
    '': (a, b) => b[2] - a[2] || (b[3] ?? -1) - (a[3] ?? -1),
    name: (a, b) => a[1].localeCompare(b[1], 'ja'),
    order: (a, b) => a[10] - b[10],
  };

  function apply() {
    const d = data;
    if (!d) {
      renderActive();
      return;
    }
    const f = new FormData(form);
    words = searchWords(String(f.get('q') || ''));
    // 財源と部局は名前で選ぶ（URL に名前が出るように）。データの中では番号
    const fund = String(f.get('fund') || '');
    const dept = String(f.get('dept') || '');
    const fi = d.funds.findIndex(([k]) => k === fund);
    const di = d.depts.indexOf(dept);
    const s = String(f.get('s') || '');
    const yr = String(f.get('yr') || '');
    const shared = String(f.get('shared') || '');
    const sort = SORTS[String(f.get('sort') || '')] ?? SORTS[''];
    if (words.length && !texts.length) texts = d.rows.map((r) => [searchText(`${r[1]} ${r[5]}`), searchText(r[11])]);
    const ok = (r: Row, i: number) => {
      if (fund && !r[4].includes(fi)) return false;
      if (dept && !r[6].includes(di)) return false;
      if (s && !r[7].includes(Number(s))) return false;
      if (yr === 'latest' ? r[2] !== d.latest : yr === 'old' ? r[2] === d.latest : false) return false;
      if (shared && !r[9]) return false;
      if (words.length && !matchesAll(`${texts[i][0]}\n${texts[i][1]}`, words)) return false;
      return true;
    };
    hits = d.rows.flatMap((r, i) => (ok(r, i) ? [i] : [])).sort((a, b) => sort(d.rows[a], d.rows[b]));
    list.removeAttribute('aria-busy');
    const n = fmt(hits.length);
    if (count.textContent !== n) {
      const first = unit.hidden;
      count.textContent = n;
      if (!first) bump(count);
    }
    unit.hidden = false;
    list.replaceChildren();
    shown = 0;
    showMore(d);
    renderActive();
    // キーワードと並び以外で入っている条件の数を、条件のボタン（components/FilterMore.astro）に送る
    const changed = [...f.entries()].filter(([k, v]) => k !== 'q' && k !== 'sort' && v !== '').length;
    form.dataset.filterN = String(changed);
    form.dispatchEvent(new CustomEvent('filters:change', { detail: { n: changed } }));
    const params = new URLSearchParams([...f.entries()].filter(([, v]) => v !== '').map(([k, v]) => [k, String(v)]));
    const qs = params.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  // いまの条件を「財源: 県単等 ×」のように並べ、1つずつ外せるようにする（並びは条件ではないので出さない）
  function renderActive() {
    const chips: FilterChip[] = [];
    const clears: (() => void)[] = [];
    for (const input of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[name], select[name]')) {
      if (input.name === 'sort') continue;
      const box = input instanceof HTMLInputElement && input.type === 'checkbox' ? input : null;
      if (box ? !box.checked : !input.value) continue;
      const label = input.closest<HTMLElement>('[data-label]')?.dataset.label || '';
      const text = input instanceof HTMLSelectElement ? input.selectedOptions[0]?.textContent?.trim() : box ? box.dataset.text : `「${input.value}」`;
      chips.push({ label: box ? '' : label, text: text ?? '' });
      clears.push(() => {
        if (box) box.checked = false;
        else input.value = '';
      });
    }
    active.hidden = chips.length === 0;
    active.replaceChildren(...filterChips(chips, (i) => {
      clears[i]();
      refocus = i;
      apply();
    }));
    if (refocus >= 0) {
      const left = [...active.querySelectorAll<HTMLElement>('.active-chip')];
      (left[Math.min(refocus, left.length - 1)] ?? countLine)?.focus();
      refocus = -1;
    }
  }

  for (const [k, v] of new URLSearchParams(location.search)) {
    const input = form.elements.namedItem(k);
    if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = input.value === v;
    else if (input && 'value' in input) input.value = v;
  }
  renderActive();
  form.addEventListener('input', apply);
  form.addEventListener('submit', (e) => e.preventDefault());
  more.addEventListener('click', () => {
    if (!data) return;
    const first = list.children.length;
    showMore(data);
    list.children[first]?.querySelector<HTMLElement>('a')?.focus();
  });
  const { src = '', fallback = '' } = list.dataset;
  getJsonOr<Data>(src, fallback)
    .then((d) => {
      data = d;
      apply();
    })
    .catch(() => {
      list.removeAttribute('aria-busy');
      count.textContent = '検索用のデータを読み込めませんでした。時間をおいて、ページを再読み込みしてください。';
    });
}
