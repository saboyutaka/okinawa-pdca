// 取組をさがす（pages/torikumi/index.astro）の検索と一覧。検索用のデータ（lib/search-data.ts）を読んで、一覧をここで描く。
// どのページでも読み込む（scripts/site.ts）ので、検索のフォーム（#tf）があるページでだけ動かす。
// 押したボタンが消えるときは、フォーカスを続きの場所へ移す（WCAG 2.4.3）: 「さらに表示」は出した最初の行へ、
// 絞り込み中の札で条件を外したときは、同じ位置の札（無ければ1つ前の札）へ、札が無くなったら件数の行へ
import { iconSvg } from '../lib/icons.ts';
import { matchesAll, searchText, searchWords, type SearchWord } from '../lib/search.ts';
import type { SearchData as Data, SearchSummary as Summary } from '../lib/search-data.ts';
import { bump } from './motion.ts';

const form = document.getElementById('tf') as HTMLFormElement | null;
if (form) search(form);

function search(form: HTMLFormElement) {
  const PAGE = 50;
  const DELAY = new Set([2, 3, 4]); // やや遅れ・大幅遅れ・未着手
  const list = document.getElementById('results')!;
  const count = document.getElementById('count')!;
  const more = document.getElementById('more') as HTMLButtonElement;
  let data: Data | undefined;
  // やったこと（data.rows と同じ並び）。キーワードで探すときに読む。読めなかったときは summaryFailed
  let summary: string[] | undefined;
  let summaryFailed = false;
  const unit = document.getElementById('unit')!;
  const noSummary = document.getElementById('no-summary')!;
  // 札が無くなったときのフォーカスの行き先（件数の行。Tab では止めない）
  const countLine = count.closest<HTMLElement>('.result-count');
  if (countLine) countLine.tabIndex = -1;
  let refocus = -1; // 押して外した札の位置（外したあとにフォーカスを移す）
  let hits: number[] = []; // 当たった行の番号（data.rows の）
  let shown = 0;
  let words: SearchWord[] = [];
  // 行ごとの検索される文字（名前など一覧の行に見えるもの・やったこと）。初めて探すときに作って使い回す
  let texts: [shown: string, summary: string][] = [];

  function el(tag: string, cls?: string, text?: string) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function render(row: Data['rows'][number], i: number) {
    const [sid, name, section, dept, sts, indicator, target, actual, latestYear, href] = row;
    const [code, sname] = data!.shisaku[sid];
    const li = el('li', 't-row');
    const main = el('div', 't-main');
    const n = el('a', 'name name-link', name) as HTMLAnchorElement;
    n.href = href;
    const s = el('div', 'small secondary');
    if (data!.depts[dept]) {
      const d = el('a', 'sub-link', section) as HTMLAnchorElement;
      d.href = `/bukyoku/${data!.depts[dept]}/`;
      s.append(d);
    } else {
      s.append(section);
    }
    s.append('・施策 ');
    const a = el('a', 'sub-link', sname) as HTMLAnchorElement;
    a.href = `/shisaku/${sid}/`;
    s.append(a, ' ', el('span', 'code-no', code));
    // 最新の年度の報告から新しく載った取組（「R7から」）と、最新の年度の報告に無い取組（「R6まで」）の札（components/YearTag.astro と同じ形）
    const kind = row[11].includes('new') ? 'new' : row[11].includes('ended') ? 'ended' : '';
    if (kind) {
      const yl = `R${latestYear - 2018}`;
      const tag = el('span', `year-tag ${kind}`, kind === 'new' ? `${yl}から` : `${yl}まで`);
      tag.title = kind === 'new' ? `${yl}の報告から新しく載った取組` : `${yl}の報告まで載っていた取組`;
      tag.append(el('span', 'sr-only', kind === 'new' ? '新しく載った取組' : '載っていた取組'));
      const head = el('div');
      head.append(n, ' ', tag);
      main.append(head, s);
    } else {
      main.append(n, s);
    }
    // 個別計画（観光ロードマップ）でも評価されている取組の札（styles/global.css の .plan-tag）
    if (row[12].includes('kanko')) main.append(el('span', 'plan-tag', '観光ロードマップでも評価'));
    if (indicator) main.append(el('div', 'small secondary', `活動指標（R${latestYear - 2018}）: ${indicator}　計画 ${target || '—'} → 実績 ${actual || '—'}`));
    // キーワードが行に見える文字に無く、やったことにだけあるときは、やったことを出す（なぜ出たかが分かるように）
    if (words.length && summary && !matchesAll(texts[i][0], words)) main.append(el('div', 'small secondary', `R${latestYear - 2018}にやったこと: ${summary[i]}`));
    // くらしのテーマは絞り込みと取組のページに任せる（一覧の行には出さない）
    li.append(main, stamps(sts));
    return li;
  }

  // 4年のスタンプ（components/Stamps.astro の size="small" と同じ形。見た目は styles/global.css の .stamps）
  function stamps(sts: (number | null)[]) {
    const ol = el('ol', 'stamps small-stamps');
    ol.setAttribute('aria-label', '4年の進捗状況');
    data!.years.forEach((y, i) => {
      const st = sts[i];
      const yl = `R${y - 2018}`;
      const li = el('li', `stamp${i > 0 ? ' seg' : ''}${i > 0 && (st == null || sts[i - 1] == null) ? ' seg-dash' : ''}`);
      const tone = st == null ? 'blank' : data!.statuses[st][1];
      const c = el('span', `c tone-${tone}`);
      c.setAttribute('aria-hidden', 'true');
      c.insertAdjacentHTML('beforeend', st == null ? iconSvg('blank', 'ring', 12) : iconSvg(tone, undefined, 12));
      const cw = el('span', 'cw');
      cw.append(c);
      const t = el('span', 't');
      t.append(el('span', 'sr-only', `${yl}: `), st == null ? '報告なし' : data!.statuses[st][0]);
      li.append(el('span', 'y', yl), cw, t);
      ol.append(li);
    });
    return ol;
  }

  function showMore() {
    const frag = document.createDocumentFragment();
    for (const i of hits.slice(shown, shown + PAGE)) frag.append(render(data!.rows[i], i));
    list.append(frag);
    shown = Math.min(hits.length, shown + PAGE);
    more.hidden = shown >= hits.length;
    more.textContent = `さらに表示（残り ${hits.length - shown}件）`;
  }

  function apply() {
    // 検索用のデータを読み込む前の入力は、読み込み後にまとめて反映する。絞り込み中の札だけは先に出す
    if (!data) {
      renderActive();
      return;
    }
    const f = new FormData(form);
    words = searchWords(String(f.get('q') || ''));
    // キーワードは、やったことが届いてから探す（読み始めて、届いたらもう一度ここに来る）。それまでの一覧はそのまま
    if (words.length && !summary && !summaryFailed) {
      loadSummary();
      count.textContent = '読み込み中…';
      unit.hidden = true;
      renderActive();
      return;
    }
    noSummary.hidden = !(words.length && summaryFailed);
    const s = String(f.get('s') || '');
    const dept = String(f.get('dept') || '');
    const st = String(f.get('st') || '');
    const pat = String(f.get('pat') || '');
    const theme = String(f.get('theme') || '');
    const plan = String(f.get('plan') || '');
    const ti = theme ? data.themes.findIndex(([id]) => id === theme) : -1;
    const last = data.years.length - 1;
    if (words.length && !texts.length) {
      texts = data.rows.map(([sid, name, section, , , indicator], i) => {
        const sh = data!.shisaku[sid];
        return [searchText(`${name} ${section} ${indicator} ${sh[0]} ${sh[1]}`), searchText(summary?.[i] ?? '')];
      });
    }
    const ok = (r: Data['rows'][number], i: number) => {
      const [sid, , , d, sts] = r;
      const sh = data!.shisaku[sid];
      if (s && String(sh[2]) !== s) return false;
      if (dept && d !== dept) return false;
      if (ti >= 0 && !r[10].includes(ti)) return false;
      if (st === 'none' ? sts[last] != null : st === 'delay' ? !(sts[last] != null && DELAY.has(sts[last]!)) : st && sts[last] !== Number(st)) return false;
      // 4年間の様子は、ビルド時に lib/data.ts の PATTERNS で決めたものを見る（トップや将来像の数とそろえるため）
      if (pat && !r[11].includes(pat)) return false;
      if (plan && !r[12].includes(plan)) return false;
      // 名前などとやったことを合わせた中に、すべての言葉があれば当たり（言葉ごとに別の欄にあってもよい）
      if (words.length && !matchesAll(`${texts[i][0]}\n${texts[i][1]}`, words)) return false;
      return true;
    };
    hits = data.rows.flatMap((r, i) => (ok(r, i) ? [i] : []));
    list.removeAttribute('aria-busy');
    // 件数が変わったら数字を小さくはねさせる（データが届いて初めて出すときと、「読み込み中…」から出すときは動かさない）
    const n = hits.length.toLocaleString('ja-JP');
    if (count.textContent !== n) {
      const first = unit.hidden;
      count.textContent = n;
      if (!first) bump(count);
    }
    unit.hidden = false;
    list.replaceChildren();
    shown = 0;
    showMore();
    renderActive();
    // キーワード以外で入っている条件の数を、条件のボタン（components/FilterMore.astro）に送る
    const changed = [...f.entries()].filter(([k, v]) => k !== 'q' && v !== '').length;
    form.dataset.filterN = String(changed);
    form.dispatchEvent(new CustomEvent('filters:change', { detail: { n: changed } }));
    const params = new URLSearchParams([...f.entries()].filter(([, v]) => v !== '').map(([k, v]) => [k, String(v)]));
    const qs = params.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  // いまの条件を「テーマ: 子ども・子育て ×」のように並べ、1つずつ外せるようにする
  const active = document.getElementById('active')!;
  function renderActive() {
    const chips: HTMLElement[] = [];
    for (const input of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[name], select[name]')) {
      if (!input.value) continue;
      const i = chips.length;
      const label = input.closest<HTMLElement>('[data-label]')?.dataset.label || '';
      const text = input instanceof HTMLSelectElement ? input.selectedOptions[0]?.textContent?.trim() : `「${input.value}」`;
      const b = el('button', 'active-chip', `${label}: ${text}`) as HTMLButtonElement;
      b.type = 'button';
      b.setAttribute('aria-label', `${label} ${text} の条件を外す`);
      const x = el('span', '', '×');
      x.setAttribute('aria-hidden', 'true');
      b.append(x);
      b.addEventListener('click', () => { input.value = ''; refocus = i; apply(); });
      chips.push(b);
    }
    active.hidden = chips.length === 0;
    active.replaceChildren(...(chips.length ? [el('span', 'active-l', '絞り込み中:'), ...chips] : []));
    if (refocus >= 0) {
      (chips[Math.min(refocus, chips.length - 1)] ?? countLine)?.focus();
      refocus = -1;
    }
  }

  for (const [k, v] of new URLSearchParams(location.search)) {
    const input = form.elements.namedItem(k) as HTMLInputElement | null;
    if (input) input.value = v;
  }
  // 絞り込み中の札は、URL の条件からデータを待たずに出す（データが届いてから出すと、そのぶん件数と一覧が下にずれる）
  renderActive();
  form.addEventListener('input', apply);
  form.addEventListener('submit', (e) => e.preventDefault());
  more.addEventListener('click', () => {
    const first = list.children.length;
    showMore();
    list.children[first]?.querySelector<HTMLElement>('a')?.focus();
  });
  async function load<T>(url: string) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    return r.json() as Promise<T>;
  }
  // 名前にハッシュの付いたファイル（ずっとキャッシュされる）を読む。公開し直した直後に、キャッシュした前のページから開くと
  // 前のハッシュのファイルはもう無いので、名前の変わらない控えを読む
  async function loadOr<T>(src: string, fallback: string) {
    try {
      return await load<T>(src);
    } catch {
      return load<T>(fallback);
    }
  }
  const { src, fallback, summarySrc, summaryFallback } = list.dataset as Record<string, string>;
  const dataLoad = loadOr<Data>(src, fallback);
  dataLoad
    .then((d) => {
      data = d;
      apply();
    })
    .catch(() => {
      list.removeAttribute('aria-busy');
      count.textContent = '検索用のデータを読み込めませんでした。時間をおいて、ページを再読み込みしてください。';
    });

  // やったことは、キーワードで探すときにしか使わないので、キーワードの欄に入ったときに読む（最初の一覧はこれを待たない）
  let summaryLoad: Promise<void> | undefined;
  function loadSummary() {
    summaryLoad ??= Promise.all([dataLoad, loadOr<Summary>(summarySrc, summaryFallback)])
      .then(async ([d, s]) => {
        if (s.hash === d.summary) {
          summary = s.rows;
          return false;
        }
        // 片方だけ控えを読むと、データとやったことの版が違うことがある（公開し直した直後で、片方が前の版のままブラウザにキャッシュされているとき）。
        // そのときは両方を控えから読み直す（行の並びで対応させているので、合わないと別の取組のやったことで当たってしまう）
        [d, s] = await Promise.all([load<Data>(fallback), load<Summary>(summaryFallback)]);
        if (s.hash !== d.summary) throw new Error('版が合わない');
        data = d;
        summary = s.rows;
        return true;
      })
      .catch(() => {
        summaryFailed = true;
        return false;
      })
      .then((reloaded) => {
        texts = [];
        // キーワードで探すのを待っていたときと、データを読み直したときだけ探し直す（キーワードの欄に入っただけなら、さらに表示した一覧をそのまま残す）
        if (words.length || reloaded) apply();
      });
  }
  // URL にキーワードがあるときは、データと同じときに読み始める
  const q = form.elements.namedItem('q') as HTMLInputElement;
  if (q.value.trim()) loadSummary();
  q.addEventListener('focus', loadSummary, { once: true });
}
