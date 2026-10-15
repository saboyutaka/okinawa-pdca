// 指標のマップ（/map/。pages/map.astro）。
//  - 年度: form[data-map-form] の year でマスの色を変える。マスの data-c は年度（data-years の順）ごとの区分の番号で、'-' はその年度の報告に無いので隠す。
//    指標の数・読み上げ（lib/map-label.ts）・「R7の区分」の年度も書き換える。その年度にマスが1つも無い指標（主要指標の R5）は、列ごと隠して（.empty）わけを書く
//  - 絞り込み: キーワード（q）・くらしのテーマ（マスの data-t）・部局（data-d）・指標ごとの区分（select の name は区分の名前）に合わないマスを薄くする
//    （隠さずに、全体の中のどこにあるかを見せる）。主要指標は部局・テーマに分けていないので、その条件ではどれも薄くなる（枠の中にそう書く）。
//    キーワードは計画の目次と同じ探し方（lib/search.ts。すべての言葉を含むもの）で、指標の名前・活動指標の名前・親の名前を探す。探す文字は1つの JSON（lib/map-data.ts の
//    mapSearchJson）で、キーワードの欄に入ったとき（URL に q があれば初めから）読む。届くまでは件数の行に「読み込んでいます」と書き、キーワード以外の条件だけで薄くする
//  - 条件は URL のクエリに残し、テーマ・部局・区分は一覧の上に × で外せる札を並べる（scripts/list-filter.ts と同じ形）。条件に合う数は列の見出しの数に書き、件数の行（aria-live）で読み上げる（画面には出さない）。年度は最新のときは書かない
//  - 中身: マスを押す・矢印キーで移ると、マスの下（画面に入らなければ上）の吹き出しに、その年度の名前・親（基本施策・施策）・値を出す（キーワードに当たった字に印を付ける）。
//    × か Esc、吹き出しの外を押すと閉じる。中身は指標ごとの JSON（lib/map-data.ts）で、初めてマス目にマウスを乗せた・押した・フォーカスしたときに読む
//  - キーボード: マス目で Tab は1回だけ止まり（止まっただけでは開かず、矢印キーで移れることをマス目の上に小さく出す）、マス目と吹き出し・絞り込みの外へ出ると閉じる。
//    ← → で同じ段の左右のマス（箱の端では横に並ぶ隣の箱へ）、↑ ↓ で上下の段のいちばん近いマス（PC は同じ指標の列、スマホは縦に積んだ真上・真下の箱）、
//    Home・End で最初・最後に移る。吹き出しが出ているときは Enter でその指標のページへ移る
import { iconSvg, type Tone } from '../lib/icons.ts';
import { mapLabel, type TierCount } from '../lib/map-label.ts';
import { matchRanges, matchesAll, searchText, searchWords, type SearchWord } from '../lib/search.ts';
import type { MapData, MapSearch } from '../lib/map-data.ts';
import { bump, reveal } from './motion.ts';

type Cat = [key: string, label: string, tone: Tone];
interface Tier {
  kind: keyof MapSearch;
  head: HTMLElement; // 列の見出し（指標の材料は data-*）
  term: string;
  unit: string;
  parent: string;
  shapes: boolean; // 吹き出しの札に状態の形を付けるか（主要指標は付けず、マスと同じ色の四角にする）
  cats: Cat[];
  blocks: HTMLElement[]; // 将来像ごとの行の中の、この指標のマスの箱
  cells: HTMLElement[]; // マス（JSON の items と同じ並び）
  bin: HTMLSelectElement | null;
  data?: Promise<MapData>;
  texts?: string[]; // キーワードで探す文字（searchText でそろえたもの。マスと同じ並び）
}

const nf = new Intl.NumberFormat('ja-JP');
const yl = (y: number) => `R${y - 2018}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
// キーワードに当たった字に印を付けた HTML（計画の目次と同じ）
const marked = (text: string, words: SearchWord[]) => {
  let out = '';
  let at = 0;
  for (const [a, b] of words.length ? matchRanges(text, words) : []) {
    out += `${esc(text.slice(at, a))}<mark>${esc(text.slice(a, b))}</mark>`;
    at = b;
  }
  return out + esc(text.slice(at));
};
const getJson = async <T>(url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as T;
};

const form = document.querySelector<HTMLFormElement>('form[data-map-form]');
const root = document.querySelector<HTMLElement>('[data-map-root]');
if (form && root) init(form, root);

function init(form: HTMLFormElement, root: HTMLElement) {
  const years = form.dataset.years!.split(',').map(Number);
  const latest = years.at(-1)!;
  const summary = document.getElementById(form.dataset.summary || '');
  const result = document.querySelector<HTMLElement>('[data-map-result]');
  const grid = root.querySelector<HTMLElement>('[data-map-grid]')!;
  const pop = root.querySelector<HTMLElement>('[data-map-pop]')!;
  const q = form.querySelector<HTMLInputElement>('input[name="q"]')!;
  const year = form.querySelector<HTMLSelectElement>('select[name="year"]')!;
  const tiers: Tier[] = [...root.querySelectorAll<HTMLElement>('[data-tier-head]')].map((head) => {
    const kind = head.dataset.tierHead as Tier['kind'];
    const blocks = [...grid.querySelectorAll<HTMLElement>(`.im-tier[data-tier="${kind}"]`)];
    return {
      kind, head, term: head.dataset.term!, unit: head.dataset.unit!, parent: head.dataset.parent!, shapes: head.dataset.shapes === 'true',
      cats: JSON.parse(head.dataset.cats!) as Cat[],
      blocks,
      cells: blocks.flatMap((b) => [...b.querySelectorAll<HTMLElement>('.mc')]),
      bin: form.querySelector<HTMLSelectElement>(`select[name="${CSS.escape(head.dataset.param || '')}"]`),
    };
  });
  const tierOf = new Map(tiers.flatMap((t) => t.cells.map((c, i) => [c, { t, i }] as const)));
  // マス目のすべてのマス（画面の並びの順。行の中では主要指標 → 成果指標 → 活動指標）
  const allCells = [...grid.querySelectorAll<HTMLElement>('.im-cells .mc')];
  const yearOf = () => Number(year.value) || latest;
  const wordsOf = () => searchWords(q.value);
  // 絞り込みの条件（テーマ・部局・区分）の select（年度は除く）
  const selects = [...form.querySelectorAll<HTMLSelectElement>('select[name]')].filter((s) => s !== year);
  const activeSelects = () => selects.filter((s) => s.value);

  // ---------------------------------------------------------------- キーワードで探す文字

  // 'idle' まだ読んでいない、'loading' 読んでいる、'ready' 読めた、'error' 読めなかった、'stale' ページと合わない（公開し直した直後の前のページ）
  let searchState: 'idle' | 'loading' | 'ready' | 'error' | 'stale' = 'idle';
  const loadSearch = () => {
    if (searchState !== 'idle' && searchState !== 'error') return;
    searchState = 'loading';
    apply();
    getJson<MapSearch>(form.dataset.search!)
      .catch(() => getJson<MapSearch>(form.dataset.searchFallback!))
      .then((s) => {
        if (tiers.some((t) => s[t.kind].check !== t.head.dataset.check)) {
          searchState = 'stale';
        } else {
          for (const t of tiers) t.texts = s[t.kind].texts.map(searchText);
          searchState = 'ready';
        }
      })
      .catch(() => { searchState = 'error'; })
      .finally(apply);
  };

  // ---------------------------------------------------------------- 吹き出し

  // 指標の中身の JSON。名前にハッシュの付いたファイルが無ければ（公開し直した直後に前のページから開いたとき）控えを読む。読めなければ次に押したときにまた読む
  const load = (t: Tier) => {
    t.data ??= getJson<MapData>(t.head.dataset.src!).catch(() => getJson<MapData>(t.head.dataset.fallback!));
    t.data.catch(() => { t.data = undefined; });
    return t.data;
  };

  let sel: { t: Tier; i: number } | null = null;

  // 吹き出しをマスの下に置き、画面の下に入らなければ上に置く（上にも入らなければ下）。横は画面の中に収め、尾はマスの真ん中を指す
  const place = () => {
    if (!sel) return;
    const c = sel.t.cells[sel.i].getBoundingClientRect();
    const box = root.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const left = Math.max(8, Math.min(c.left + c.width / 2 - w / 2, vw - w - 8));
    const below = c.bottom + 12 + h <= innerHeight - 8 || c.top - 12 - h < 8;
    pop.classList.toggle('above', !below);
    pop.style.left = `${left - box.left}px`;
    pop.style.top = `${(below ? c.bottom + 12 : c.top - 12 - h) - box.top}px`;
    pop.style.setProperty('--ax', `${c.left + c.width / 2 - left}px`);
  };

  const close = () => {
    if (sel) sel.t.cells[sel.i].classList.remove('sel');
    sel = null;
    pop.hidden = true;
    pop.replaceChildren();
  };

  const render = async () => {
    if (!sel) return;
    const { t, i } = sel;
    const y = yearOf();
    const code = t.cells[i].dataset.c![years.indexOf(y)];
    if (code === '-') return close();
    const [, label, tone] = t.cats[Number(code)];
    const mark = t.shapes ? iconSvg(tone) : `<i class="mc tone-${tone}" aria-hidden="true"></i>`;
    const head = `<p class="imp-head"><span class="imp-tier">${esc(t.term)}</span><span class="chip">${mark}<span>${esc(label)}</span></span><span class="imp-year">${yl(y)}</span></p>`;
    const closeBtn = '<button type="button" class="imp-close" data-map-close aria-label="閉じる">×</button>';
    pop.hidden = false;
    pop.innerHTML = head + '<p class="imp-sub small secondary">読み込んでいます…</p>' + closeBtn;
    window.era?.fix(pop); // 西暦で表示しているときは、大きさを測る前に書き換える（lib/era.ts）
    place();
    let body: string;
    try {
      const data = await load(t);
      if (sel?.t !== t || sel.i !== i || yearOf() !== y) return; // 読んでいるあいだに、ほかのマス・年度に移った
      if (data.check !== t.head.dataset.check) {
        body = '<p class="imp-sub small">サイトが新しくなったため、このページのマスと中身が合いません。ページを読み込み直してください。</p>';
      } else {
        const item = data.items[i];
        const x = item.y[years.indexOf(y)]!;
        const [pcode, pname, phref] = data.parents[item.p];
        const words = wordsOf();
        body = [
          `<p class="imp-name"><a class="name-link" href="${esc(item.h)}">${marked(item.n, words)}</a></p>`,
          x.n ? `<p class="imp-sub small secondary">${yl(y)}の報告の名前: ${marked(x.n, words)}</p>` : '',
          `<p class="imp-sub small secondary">${t.parent} <a class="sub-link" href="${esc(phref)}">${marked(pname, words)}</a> <span class="code-no">${esc(pcode)}</span></p>`,
          x.sub != null ? `<p class="imp-sub small"><span class="imp-l">${t.term}</span>${x.sub ? marked(x.sub, words) : '—'}</p>` : '',
          `<dl class="imp-vals">${x.v.map(([l, v]) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`,
        ].join('');
      }
    } catch {
      if (sel?.t !== t || sel.i !== i) return;
      body = '<p class="imp-sub small">中身を読み込めませんでした。通信を確かめて、もう一度マスを押してください。</p>';
    }
    pop.innerHTML = head + body + closeBtn;
    window.era?.fix(pop);
    place();
    reveal([pop]);
  };

  const select = (t: Tier, i: number) => {
    if (i < 0) return;
    if (sel) sel.t.cells[sel.i].classList.remove('sel');
    sel = { t, i };
    t.cells[i].classList.add('sel');
    void render();
  };

  // ---------------------------------------------------------------- 年度・絞り込み

  let ready = false;
  let shownYear = yearOf();
  let shownWords = '';
  const apply = () => {
    const y = yearOf();
    const yi = years.indexOf(y);
    const words = wordsOf();
    // 年度・キーワードを変えたときだけ、吹き出しの中身を出し直す（ほかの絞り込みでは中身は変わらない）
    const redraw = y !== shownYear || q.value !== shownWords;
    shownYear = y;
    shownWords = q.value;
    const byWords = words.length > 0 && searchState === 'ready';
    const theme = form.querySelector<HTMLSelectElement>('select[name="theme"]')!.value;
    const dept = form.querySelector<HTMLSelectElement>('select[name="dept"]')!.value;
    const parts: TierCount[] = [];
    let emptyShuyou = false;
    for (const t of tiers) {
      const bin = t.bin?.value ?? '';
      const filtered = Boolean(byWords || theme || dept || bin);
      const counts = t.cats.map(() => 0);
      let hit = 0;
      t.cells.forEach((c, i) => {
        const k = c.dataset.c![yi];
        c.hidden = k === '-';
        if (c.hidden) return;
        const cat = t.cats[Number(k)];
        counts[Number(k)]++;
        const ok = (!byWords || matchesAll(t.texts![i], words)) && (!theme || (c.dataset.t || '').split(' ').includes(theme))
          && (!dept || c.dataset.d === dept) && (!bin || cat[0] === bin);
        if (ok) hit++;
        c.className = `mc tone-${cat[2]}${ok ? '' : ' dim'}`;
      });
      const shown = counts.reduce((s, x) => s + x, 0);
      for (const b of t.blocks) b.classList.toggle('empty', !b.querySelector('.mc:not([hidden])'));
      t.head.classList.toggle('empty', shown === 0);
      if (t.kind === 'shuyou' && shown === 0) emptyShuyou = true;
      const count = t.head.querySelector<HTMLElement>('[data-map-count]')!;
      const n = nf.format(filtered ? hit : shown);
      if (count.textContent !== n) {
        count.textContent = n;
        if (ready) bump(count);
      }
      parts.push({ term: t.term, unit: t.unit, counts: t.cats.map((c, i) => [c[1], counts[i]]), hit: filtered ? hit : null });
    }
    grid.setAttribute('aria-label', mapLabel(yl(y), parts));
    for (const s of document.querySelectorAll('[data-map-year]')) s.textContent = yl(y);
    root.querySelector<HTMLElement>('[data-map-empty]')!.hidden = !emptyShuyou;
    root.querySelector<HTMLElement>('[data-map-nofilter]')!.hidden = !(theme || dept) || emptyShuyou;
    // 条件に合う数（件数の行。読み上げだけ）。キーワードの文字を読んでいるあいだ・読めなかったときは、画面にもそう書く
    if (result) {
      const hits = parts.filter((p) => p.hit != null && p.counts.some(([, n]) => n > 0));
      const state = words.length ? { loading: 'キーワードで探す文字を読み込んでいます…', error: 'キーワードで探す文字を読み込めませんでした。', stale: 'サイトが新しくなったため、キーワードで探せません。ページを読み込み直してください。' }[searchState as string] : '';
      result.textContent = state || (hits.length ? `条件に合う指標: ${hits.map((p) => `${p.term} ${nf.format(p.hit!)}${p.unit}`).join('・')}` : '');
      result.classList.toggle('sr-only', !state);
    }
    if (sel) {
      const c = sel.t.cells[sel.i];
      if (c.hidden) close();
      else if (redraw) select(sel.t, sel.i);
      else {
        c.classList.add('sel');
        place();
      }
    }
    renderSummary();
    const conds = activeSelects().length;
    form.dataset.filterN = String(conds);
    form.dispatchEvent(new CustomEvent('filters:change', { detail: { n: conds } }));
    // URL: 年度は最新のときは書かない
    const params = new URLSearchParams();
    if (q.value.trim()) params.set('q', q.value.trim());
    if (y !== latest) params.set('year', String(y));
    for (const s of activeSelects()) params.set(s.name, s.value);
    const qs = params.toString();
    history.replaceState(history.state, '', `${qs ? `?${qs}` : location.pathname}${location.hash}`);
  };

  // いまの絞り込みの条件（テーマ・部局・区分）。1つずつ外せる札（scripts/list-filter.ts と同じ形）
  const renderSummary = () => {
    if (!summary) return;
    const on = activeSelects();
    summary.hidden = !on.length;
    if (!on.length) return summary.replaceChildren();
    const head = document.createElement('span');
    head.className = 'active-l';
    head.textContent = '絞り込み中:';
    const chips = on.map((s) => {
      const label = s.closest<HTMLElement>('[data-label]')?.dataset.label || '';
      const text = s.selectedOptions[0]?.textContent?.trim() || s.value;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'active-chip';
      b.setAttribute('aria-label', `${label} ${text} の条件を外す`);
      b.textContent = `${label}: ${text}`;
      const x = document.createElement('span');
      x.setAttribute('aria-hidden', 'true');
      x.textContent = '×';
      b.append(x);
      b.addEventListener('click', () => { s.value = ''; apply(); });
      return b;
    });
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'more';
    all.textContent = 'すべて外す';
    all.addEventListener('click', () => {
      for (const s of selects) s.value = '';
      apply();
    });
    summary.replaceChildren(head, ...chips, ...(on.length > 1 ? [all] : []));
  };

  // ---------------------------------------------------------------- 押す・キーボード

  // 見えているマス（並びの順。年度に無いマス・隠した列のマスは除く）
  const visible = (cs: HTMLElement[]) => cs.filter((c) => !c.hidden && c.offsetParent);
  // 上下のマス（d は 1 で下、-1 で上）。画面の上で横に重なる箱（PC は同じ指標の列、スマホは縦に積んだ全部の箱）のマスのうち、
  // いちばん近い段の、横の位置がいちばん近いマス
  const vertical = (cur: HTMLElement, d: number) => {
    const b = cur.closest<HTMLElement>('.im-tier')!.getBoundingClientRect();
    const col = [...grid.querySelectorAll<HTMLElement>('.im-tier')].filter((x) => {
      const p = x.getBoundingClientRect();
      return p.width > 0 && p.left < b.right && p.right > b.left;
    });
    const same = visible(col.flatMap((x) => [...x.querySelectorAll<HTMLElement>('.mc')]));
    const r = cur.getBoundingClientRect();
    const rects = same.map((c) => c.getBoundingClientRect());
    const dys = rects.map((p) => (p.top - r.top) * d).filter((dy) => dy > 2);
    if (!dys.length) return undefined;
    const row = Math.min(...dys);
    let best: HTMLElement | undefined;
    let bx = Infinity;
    rects.forEach((p, i) => {
      if (Math.abs((p.top - r.top) * d - row) > 2) return;
      const dx = Math.abs(p.left - r.left);
      if (dx < bx) [best, bx] = [same[i], dx];
    });
    return best;
  };
  // 左右のマス（d は 1 で右、-1 で左）。同じ箱の同じ段の隣。段の端では、同じ将来像の行で画面の上でその向きに並ぶ隣の箱の、高さがいちばん近い段の端のマス。
  // その向きに箱が無ければ（活動指標の右端・主要指標の左端、スマホで箱が縦に積まれているとき）、並びの順の前後（shown）
  const horizontal = (cur: HTMLElement, d: number, shown: HTMLElement[]) => {
    const r = cur.getBoundingClientRect();
    const block = cur.closest<HTMLElement>('.im-tier')!;
    const own = visible([...block.querySelectorAll<HTMLElement>('.mc')]);
    const nb = own[own.indexOf(cur) + d];
    if (nb && Math.abs(nb.getBoundingClientRect().top - r.top) <= 2) return nb;
    const b = block.getBoundingClientRect();
    const side = [...block.parentElement!.children]
      .map((x) => ({ x, p: x.getBoundingClientRect() }))
      .filter(({ x, p }) => x !== block && p.width > 0 && (d > 0 ? p.left >= b.right : p.right <= b.left))
      .sort((m, n) => (m.p.left - n.p.left) * d)[0];
    if (side) {
      const cs = visible([...side.x.querySelectorAll<HTMLElement>('.mc')]);
      const tops = cs.map((c) => c.getBoundingClientRect().top);
      const top = tops.reduce((a, t) => (Math.abs(t - r.top) < Math.abs(a - r.top) ? t : a), Infinity);
      const line = cs.filter((_, i) => Math.abs(tops[i] - top) <= 2);
      if (line.length) return d > 0 ? line[0] : line.at(-1);
    }
    return shown[shown.indexOf(cur) + d] ?? cur;
  };
  const selectCell = (c: HTMLElement | null | undefined) => {
    const at = c && tierOf.get(c);
    if (at) select(at.t, at.i);
  };
  // 選んだマスの指標のページへ移る。中身を読んでいるあいだに押したときは、読めてから移る（読めない・ページと合わない・ほかのマスに移ったときは移らない）
  const open = async ({ t, i }: { t: Tier; i: number }) => {
    const data = await load(t).catch(() => undefined);
    if (data && data.check === t.head.dataset.check && sel?.t === t && sel.i === i) location.assign(data.items[i].h);
  };

  for (const ev of ['pointerenter', 'focus']) grid.addEventListener(ev, () => { for (const t of tiers) void load(t).catch(() => {}); }, { once: true });
  grid.addEventListener('click', (e) => selectCell((e.target as Element).closest<HTMLElement>('.mc')));
  // フォーカスがマス目・吹き出し・絞り込みの外へ出たら閉じる（絞り込みでは、年度を変えて同じマスの中身を見られるように閉じない）
  document.addEventListener('focusin', (e) => {
    if (sel && ![grid, pop, form, summary].some((x) => x?.contains(e.target as Node))) close();
  });
  grid.addEventListener('keydown', (e) => {
    const shown = visible(allCells);
    const cur = sel ? sel.t.cells[sel.i] : null;
    let next: HTMLElement | undefined;
    if (e.key === 'ArrowRight') next = cur ? horizontal(cur, 1, shown) : shown[0];
    else if (e.key === 'ArrowLeft') next = cur ? horizontal(cur, -1, shown) : shown.at(-1);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') next = cur ? (vertical(cur, e.key === 'ArrowDown' ? 1 : -1) ?? cur) : shown[0];
    else if (e.key === 'Home') next = shown[0];
    else if (e.key === 'End') next = shown.at(-1);
    else if (e.key === 'Escape' && sel) {
      e.preventDefault();
      close();
      return;
    } else if (e.key === 'Enter' && sel) {
      e.preventDefault();
      void open(sel);
      return;
    } else return;
    e.preventDefault();
    selectCell(next);
  });
  pop.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('[data-map-close]')) return;
    close();
    grid.focus();
  });
  pop.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    close();
    grid.focus();
  });
  // 吹き出しの外（マス以外）を押したら閉じる。年度などを変えたときは、同じマスのその年度の中身を見られるように閉じない
  document.addEventListener('pointerdown', (e) => {
    const target = e.target as Element;
    if (!sel || pop.contains(target) || form.contains(target) || target.closest?.('.im-cells .mc')) return;
    close();
  });
  addEventListener('resize', place);

  // URL の条件を入力に戻す。年度に当たる選択肢が無ければ、最新の年度に戻す
  const params = new URLSearchParams(location.search);
  for (const [k, v] of params) {
    const f = form.elements.namedItem(k);
    if (f instanceof HTMLSelectElement || f instanceof HTMLInputElement) f.value = v;
  }
  if (!year.value) year.value = String(latest);
  shownYear = yearOf();
  shownWords = q.value;
  q.addEventListener('focus', loadSearch);
  form.addEventListener('input', (e) => {
    if (e.target === q) loadSearch();
    apply();
  });
  form.addEventListener('change', apply);
  form.addEventListener('submit', (e) => e.preventDefault());
  if (q.value.trim()) loadSearch();
  apply();
  ready = true;
}
