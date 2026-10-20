// 予算事業をさがす（pages/yosan/jigyo/index.astro）の検索と一覧。検索用のデータ（lib/jigyo-data.ts）を読んで、一覧をここで描く。
// 行は2種類: 部局票の予算事業と、一括交付金（ソフト）の事後評価の事業（頭に一括交付金の事後評価の札 .ik-tag を付けて見分ける）。
// どのページでも読み込む（scripts/site.ts）ので、検索のフォーム（#jf）があるページでだけ動かす。
// 絞り込み中の札・URL のクエリ・さらに表示・フォーカスの移し方は、取組をさがす（scripts/torikumi-search.ts）と同じ。並び（sort）は条件ではないので札にしない
import { fmt, yen } from '../lib/format.ts';
import { iconSvg } from '../lib/icons.ts';
import { matchesAll, searchText, searchWords, type SearchWord } from '../lib/search.ts';
import type { JigyoData as Data } from '../lib/jigyo-data.ts';
import { yearLabel } from '../lib/years.ts';
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
const KINDS = { budget: 0, ikkatsu: 1 } as const;
function search({ form, list, count, unit, active, more }: Parts) {
  const PAGE = 50;
  let data: Data | undefined;
  const countLine = count.closest<HTMLElement>('.result-count');
  if (countLine) countLine.tabIndex = -1;
  let refocus = -1;
  let hits: number[] = [];
  let shown = 0;
  let words: SearchWord[] = [];
  // 行ごとの検索される文字（行に見える名前・所管課と、見えない前の名前・取組の名前・事業の内容）。初めて探すときに作って使い回す
  let texts: [shown: string, hidden: string][] = [];

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // 一括交付金の事業の評価の札（components/Chip.astro と同じ形）
  function chip(d: Data, g: number) {
    const c = el('span', 'chip');
    const x = g >= 0 ? d.grades[g] : null;
    c.insertAdjacentHTML('beforeend', x ? iconSvg(x[2], x[3]) : iconSvg('blank', 'ring'));
    c.append(el('span', '', x ? `${x[1]} ${x[0]}` : '評価なし'));
    return c;
  }

  function render(d: Data, row: Row, i: number) {
    const [kind, name, href, year, amount, funds, section, , , , torikumi, shared, grades, rate, exec, , , text] = row;
    const yl = yearLabel(year);
    const old = year < d.latest[kind];
    const li = el('li', 'j-row');
    const main = el('div', 'j-main');
    const head = el('div');
    // 一括交付金の事業は、予算事業と取り違えないよう頭に札を付ける（components/IkkatsuRow.astro と同じ。事業には自分のページが無いので、施策のページの事業のカードへ）
    if (kind === KINDS.ikkatsu) head.append(el('span', 'ik-tag', '一括交付金の事後評価'), ' ');
    const a = el('a', 'name-link', name);
    a.href = href;
    head.append(a);
    // 最新の年度に無いものの札（components/YearTag.astro の「R6まで」と同じ形）
    if (old) {
      const tag = el('span', 'year-tag ended', `${yl}まで`);
      tag.title = kind === KINDS.ikkatsu ? `${yl}の事後評価まで載っていた事業` : `${yl}の報告まで載っていた予算事業`;
      tag.append(el('span', 'sr-only', '載っていた'));
      head.append(' ', tag);
    }
    main.append(head);
    if (kind === KINDS.budget) {
      main.append(el('div', 'small secondary', `${section ? `${section}・` : ''}${old ? `${yl}の報告で` : ''}取組 ${fmt(torikumi)}件`));
    } else {
      main.append(el('div', 'small secondary', section || '担当部課の記載なし'));
      const g = el('div', 'small secondary j-grade');
      const last = d.ikkatsuYears.indexOf(year);
      g.append(`${yl}の事後評価 `, chip(d, grades[last]), `　成果目標の達成率 ${rate || '—'}`);
      // 前の年度の評価も年度つきで並べる（一括交付金の事業をさがすのスタンプの代わり）
      const past = d.ikkatsuYears.flatMap((y, k) => (k < last && grades[k] !== -1 ? [`${yearLabel(y)} ${grades[k] >= 0 ? d.grades[grades[k]][1] : 'なし'}`] : []));
      if (past.length) g.append(`（${past.join('・')}）`);
      main.append(g);
    }
    if (funds.length) {
      const f = el('div', 'small secondary j-funds');
      for (const k of funds) f.append(el('span', `swatch series-${d.funds[k][1]}`, d.funds[k][0]));
      main.append(f);
    }
    // キーワードが行に見える文字に無く、見えない文字にだけあるときは、当たったところを出す（なぜ出たかが分かるように）
    if (words.length && !matchesAll(texts[i][0], words)) {
      const lines = text.split('\n').filter((t) => words.some(([w, f]) => searchText(t).includes(w) || searchText(t).includes(f)));
      if (lines.length) main.append(el('div', 'small secondary', kind === KINDS.budget ? `当たった名前（前の名前・取組）: ${lines.slice(0, 3).join('、')}${lines.length > 3 ? ' ほか' : ''}` : `当たった内容: ${lines[0]}`));
    }
    const amt = el('div', 'j-amt');
    const v = el('span', 'j-amt-v');
    v.append(el('span', 'big num', yen(amount)));
    // 共通の金額の札（取組のページの予算の箱と同じ。押すと lib/terms.ts の「共通の金額」の説明。scripts/terms.ts が押されたのを受ける）
    if (shared) {
      const b = el('button', 'term common-tag', '共通');
      b.type = 'button';
      b.dataset.term = '共通の金額';
      b.dataset.termNote = `この予算事業の${yl}の決算見込額のうち${yen(shared[0])}は、${shared[1]}つの取組に同じ額で書かれています。`;
      b.setAttribute('aria-expanded', 'false');
      b.setAttribute('aria-controls', 'termpop');
      b.tabIndex = -1;
      v.append(b);
    }
    amt.append(v, el('span', 'small secondary', kind === KINDS.budget ? `${yl}の決算見込額` : `${yl}の予算額${exec != null ? `（執行率 ${exec}%）` : ''}`));
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

  // 並び。金額の順は、種類ごとの最新の年度のもの（予算事業は最新の報告、一括交付金の事業は最新の事後評価）を先に金額の大きい順、
  // そのあとに年度の新しい順・金額の大きい順。名前は五十音順、施策の順は報告書の順
  function sorter(d: Data, key: string) {
    const isNow = (r: Row) => (r[3] === d.latest[r[0]] ? 1 : 0);
    if (key === 'name') return (a: Row, b: Row) => a[1].localeCompare(b[1], 'ja');
    if (key === 'order') return (a: Row, b: Row) => a[16] - b[16];
    return (a: Row, b: Row) => isNow(b) - isNow(a) || b[3] - a[3] || (b[4] ?? -1) - (a[4] ?? -1);
  }

  function apply() {
    const d = data;
    if (!d) {
      renderActive();
      return;
    }
    const f = new FormData(form);
    words = searchWords(String(f.get('q') || ''));
    const kind = String(f.get('kind') || '');
    const fund = String(f.get('fund') || '');
    const dept = String(f.get('dept') || '');
    const s = String(f.get('s') || '');
    const theme = String(f.get('theme') || '');
    const yr = String(f.get('yr') || '');
    const shared = String(f.get('shared') || '');
    const gr = f.getAll('gr').map(String);
    const tr = String(f.get('tr') || '');
    const ti = theme ? d.themes.findIndex(([id]) => id === theme) : -1;
    const sort = sorter(d, String(f.get('sort') || ''));
    if (words.length && !texts.length) texts = d.rows.map((r) => [searchText(`${r[1]} ${r[6]}`), searchText(r[17])]);
    const ok = (r: Row, i: number) => {
      if (kind && r[0] !== KINDS[kind as keyof typeof KINDS]) return false;
      if (fund && !r[5].includes(Number(fund))) return false;
      if (dept && !r[7].includes(Number(dept))) return false;
      if (s && !r[8].includes(Number(s))) return false;
      if (ti >= 0 && !r[9].includes(ti)) return false;
      const now = r[3] === d.latest[r[0]];
      if (yr === 'latest' ? !now : yr === 'old' ? now : false) return false;
      if (shared && !r[11]) return false;
      // 事後評価の評価と移り変わりは、一括交付金の事業だけにある（選ぶと一括交付金の事業だけになる）
      if (gr.length) {
        if (r[0] !== KINDS.ikkatsu) return false;
        const g = now ? r[12][d.ikkatsuYears.indexOf(r[3])] : -1;
        if (!gr.includes(g >= 0 ? d.grades[g][0] : 'none')) return false;
      }
      if (tr && !r[15].includes(tr)) return false;
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

  // チェックボックスは、URL にその値があるときだけ入れる（評価は ?gr=達成&gr=未達成 のように いくつでも）
  const query = new URLSearchParams(location.search);
  for (const input of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[name], select[name]')) {
    const vs = query.getAll(input.name);
    if (!vs.length) continue;
    if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = vs.includes(input.value);
    else input.value = vs[0];
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
