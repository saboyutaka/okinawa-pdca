// 指標のマップ（/map/。pages/map.astro・components/IndicatorMap.astro）。
//  - 指標と年度: form[data-map-form] の kind（'' はすべて）で出すマップを選び、year でマスの色を変える。マスの data-c は年度（data-years の順）ごとの区分の番号で、
//    '-' はその年度の報告に無いので隠す。マップの数・読み上げ（lib/map-label.ts）・「R7の達成率」の年度も書き換える
//  - 絞り込み: くらしのテーマ（マスの data-t）・部局（data-d）・マップごとの区分（select の name はマップの data-map-bin の区分の名前）に合わないマスを薄くする
//    （隠さずに、全体の中のどこにあるかを見せる）。主要指標は部局・テーマに分けていないので、その条件ではどれも薄くなる（マップの中にそう書く）
//  - 条件は URL のクエリに残し、テーマ・部局・区分は一覧の上に × で外せる札を並べる（scripts/list-filter.ts と同じ形）。年度は最新のとき、指標は「すべて」のときは書かない
//  - 中身: マスを押す・矢印キーで移ると、マップの下の枠にその年度の名前・親（基本施策・施策）・値を出す。マスを選んでいるあいだ枠は画面の下に貼り付き、× か Esc でやめる。
//    中身はマップごとの JSON（lib/map-data.ts）で、初めてマス目にマウスを乗せた・押した・フォーカスしたときに読む
//  - キーボード: マス目で Tab は1回だけ止まり、← → で前後のマス、↑ ↓ で上下の行のいちばん近いマス、Home・End で最初・最後に移る
import { iconSvg, type Tone } from '../lib/icons.ts';
import { mapLabel } from '../lib/map-label.ts';
import type { MapData } from '../lib/map-data.ts';
import { bump, reveal } from './motion.ts';

type Cat = [key: string, label: string, tone: Tone];
interface MapView {
  el: HTMLElement;
  kind: string;
  term: string;
  unit: string;
  parent: string;
  shapes: boolean; // 中身の札に状態の形を付けるか（主要指標は付けず、マスと同じ色の四角にする）
  cats: Cat[];
  grid: HTMLElement;
  cells: HTMLElement[];
  groups: HTMLElement[];
  panel: HTMLElement;
  bin: HTMLSelectElement | null;
  data?: Promise<MapData>;
  sel: number; // 選んでいるマス（cells の何番目か。選んでいなければ -1）
}

const nf = new Intl.NumberFormat('ja-JP');
const yl = (y: number) => `R${y - 2018}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const form = document.querySelector<HTMLFormElement>('form[data-map-form]');
if (form) init(form);

function init(form: HTMLFormElement) {
  const years = form.dataset.years!.split(',').map(Number);
  const latest = years.at(-1)!;
  const summary = document.getElementById(form.dataset.summary || '');
  const maps: MapView[] = [...document.querySelectorAll<HTMLElement>('[data-map]')].map((el) => {
    const kind = el.dataset.map!;
    const binLabel = form.querySelector<HTMLElement>(`[data-map-bin="${kind}"]`);
    return {
      el, kind, term: el.dataset.term!, unit: el.dataset.unit!, parent: el.dataset.parent!, shapes: el.dataset.shapes === 'true', cats: JSON.parse(el.dataset.cats!) as Cat[],
      grid: el.querySelector<HTMLElement>('[data-map-grid]')!,
      cells: [...el.querySelectorAll<HTMLElement>('.im-cells .mc')],
      groups: [...el.querySelectorAll<HTMLElement>('[data-map-group]')],
      panel: el.querySelector<HTMLElement>('[data-map-panel]')!,
      bin: binLabel?.querySelector('select') ?? null,
      sel: -1,
    };
  });
  const hint = new Map(maps.map((m) => [m, m.panel.innerHTML]));
  const value = (name: string) => (form.elements.namedItem(name) as RadioNodeList | HTMLSelectElement | null)?.value ?? '';
  const yearOf = () => Number(value('year')) || latest;
  // 絞り込みの条件（テーマ・部局・区分）の select
  const selects = [...form.querySelectorAll<HTMLSelectElement>('select[name]')];

  // ---------------------------------------------------------------- 中身の枠

  // マップの中身の JSON。名前にハッシュの付いたファイルが無ければ（公開し直した直後に前のページから開いたとき）控えを読む。読めなければ次に押したときにまた読む
  const load = (m: MapView) => {
    const get = async (url: string) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as MapData;
    };
    m.data ??= get(m.el.dataset.src!).catch(() => get(m.el.dataset.fallback!));
    m.data.catch(() => { m.data = undefined; });
    return m.data;
  };

  const clear = (m: MapView) => {
    m.cells[m.sel]?.classList.remove('sel');
    m.sel = -1;
    m.panel.classList.remove('on');
    m.panel.innerHTML = hint.get(m)!;
  };

  const render = async (m: MapView) => {
    const i = m.sel;
    const y = yearOf();
    const code = m.cells[i].dataset.c![years.indexOf(y)];
    if (code === '-') return clear(m);
    const [, label, tone] = m.cats[Number(code)];
    const mark = m.shapes ? iconSvg(tone) : `<i class="mc tone-${tone}" aria-hidden="true"></i>`;
    const head = `<p class="imp-head"><span class="chip">${mark}<span>${esc(label)}</span></span><span class="imp-year">${yl(y)}</span></p>`;
    const close = '<button type="button" class="imp-close" data-map-close aria-label="選ぶのをやめる">×</button>';
    m.panel.classList.add('on');
    let body: string;
    try {
      const data = await load(m);
      if (m.sel !== i || yearOf() !== y) return; // 読んでいるあいだに、ほかのマス・年度に移った
      if (data.check !== m.el.dataset.check) {
        body = '<p class="small">サイトが新しくなったため、このページのマスと中身が合いません。ページを読み込み直してください。</p>';
      } else {
        const item = data.items[i];
        const x = item.y[years.indexOf(y)]!;
        const [pcode, pname, phref] = data.parents[item.p];
        body = [
          `<p class="imp-name"><a class="name-link" href="${esc(item.h)}">${esc(item.n)}</a></p>`,
          x.n ? `<p class="imp-sub small secondary">${yl(y)}の報告の名前: ${esc(x.n)}</p>` : '',
          `<p class="imp-sub small secondary">${m.parent} <a class="sub-link" href="${esc(phref)}">${esc(pname)}</a> <span class="code-no">${esc(pcode)}</span></p>`,
          x.sub != null ? `<p class="imp-sub small"><span class="imp-l">${m.term}</span>${esc(x.sub || '—')}</p>` : '',
          `<dl class="imp-vals">${x.v.map(([l, v]) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`,
        ].join('');
      }
    } catch {
      if (m.sel !== i) return;
      body = '<p class="small">中身を読み込めませんでした。通信を確かめて、もう一度マスを押してください。</p>';
    }
    m.panel.innerHTML = head + body + close;
    reveal([m.panel]);
  };

  const select = (m: MapView, i: number) => {
    if (i < 0) return;
    m.cells[m.sel]?.classList.remove('sel');
    m.sel = i;
    m.cells[i].classList.add('sel');
    void render(m);
  };

  // ---------------------------------------------------------------- 指標・年度・絞り込み

  let ready = false;
  let shownYear = yearOf();
  const apply = () => {
    const kind = value('kind');
    const y = yearOf();
    // 年度を変えたときだけ、選んでいるマスの中身をその年度で出し直す（絞り込みでは中身は変わらない）
    const yearChanged = y !== shownYear;
    shownYear = y;
    const yi = years.indexOf(y);
    const theme = value('theme');
    const dept = value('dept');
    for (const m of maps) {
      const on = !kind || kind === m.kind;
      m.el.hidden = !on;
      const binLabel = m.bin?.closest<HTMLElement>('label');
      if (binLabel) binLabel.hidden = !on;
      const bin = on ? (m.bin?.value ?? '') : '';
      const filtered = Boolean(theme || dept || bin);
      const counts = m.cats.map(() => 0);
      let hit = 0;
      for (const c of m.cells) {
        const k = c.dataset.c![yi];
        c.hidden = k === '-';
        if (c.hidden) continue;
        const cat = m.cats[Number(k)];
        counts[Number(k)]++;
        const ok = (!theme || (c.dataset.t || '').split(' ').includes(theme)) && (!dept || c.dataset.d === dept) && (!bin || cat[0] === bin);
        if (ok) hit++;
        c.className = `mc tone-${cat[2]}${ok ? '' : ' dim'}`;
      }
      const shown = counts.reduce((s, x) => s + x, 0);
      for (const g of m.groups) g.hidden = !g.querySelector('.mc:not([hidden])');
      m.grid.hidden = shown === 0;
      m.el.querySelector<HTMLElement>('[data-map-empty]')!.hidden = shown > 0;
      const count = m.el.querySelector<HTMLElement>('[data-map-count]')!;
      if (count.textContent !== nf.format(shown)) {
        count.textContent = nf.format(shown);
        if (ready) bump(count);
      }
      m.el.querySelector<HTMLElement>('[data-map-hit]')!.textContent = filtered && shown ? `（条件に合う ${nf.format(hit)}${m.unit}）` : '';
      m.panel.hidden = shown === 0;
      m.grid.setAttribute('aria-label', mapLabel(m.term, yl(y), m.cats.map((c, i) => [c[1], counts[i]]), m.unit, filtered ? hit : null));
      for (const s of m.el.querySelectorAll('[data-map-year]')) s.textContent = yl(y);
      const nofilter = m.el.querySelector<HTMLElement>('[data-map-nofilter]');
      if (nofilter) nofilter.hidden = !(theme || dept) || shown === 0;
      if (m.sel >= 0) {
        if (m.cells[m.sel].hidden) clear(m);
        else if (yearChanged) select(m, m.sel);
        else m.cells[m.sel].classList.add('sel');
      }
    }
    renderSummary();
    const conds = selects.filter((s) => s.value && !s.closest<HTMLElement>('label')?.hidden).length;
    form.dataset.filterN = String(conds);
    form.dispatchEvent(new CustomEvent('filters:change', { detail: { n: conds } }));
    // URL: 指標は「すべて」、年度は最新のとき書かない。隠れているマップの区分は書かない
    const params = new URLSearchParams();
    if (kind) params.set('kind', kind);
    if (y !== latest) params.set('year', String(y));
    for (const s of selects) if (s.value && !s.closest<HTMLElement>('label')?.hidden) params.set(s.name, s.value);
    const qs = params.toString();
    history.replaceState(history.state, '', `${qs ? `?${qs}` : location.pathname}${location.hash}`);
  };

  // いまの絞り込みの条件（テーマ・部局・区分）。1つずつ外せる札（scripts/list-filter.ts と同じ形）
  const renderSummary = () => {
    if (!summary) return;
    const on = selects.filter((s) => s.value && !s.closest<HTMLElement>('label')?.hidden);
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

  // 上下の行のマス（d は 1 で下、-1 で上）。画面の上での位置で、いちばん近い行の、横の位置がいちばん近いマス
  const vertical = (shown: HTMLElement[], cur: HTMLElement, d: number) => {
    const r = cur.getBoundingClientRect();
    const rects = shown.map((c) => c.getBoundingClientRect());
    const dys = rects.map((q) => (q.top - r.top) * d).filter((dy) => dy > 2);
    if (!dys.length) return undefined;
    const row = Math.min(...dys);
    let best: HTMLElement | undefined;
    let bx = Infinity;
    rects.forEach((q, i) => {
      if (Math.abs((q.top - r.top) * d - row) > 2) return;
      const dx = Math.abs(q.left - r.left);
      if (dx < bx) [best, bx] = [shown[i], dx];
    });
    return best;
  };

  for (const m of maps) {
    m.grid.addEventListener('pointerenter', () => void load(m).catch(() => {}), { once: true });
    m.grid.addEventListener('click', (e) => {
      const c = (e.target as Element).closest<HTMLElement>('.mc');
      if (c) select(m, m.cells.indexOf(c));
    });
    // キーボードで入ったとき（マウスで押したときは除く）は、選んでいるマスか最初のマスの中身を出す
    m.grid.addEventListener('focus', () => {
      if (!m.grid.matches(':focus-visible')) return;
      if (m.sel < 0) select(m, m.cells.findIndex((c) => !c.hidden));
    });
    m.grid.addEventListener('keydown', (e) => {
      const shown = m.cells.filter((c) => !c.hidden);
      const cur = m.sel >= 0 ? m.cells[m.sel] : null;
      const at = cur ? shown.indexOf(cur) : -1;
      let next: HTMLElement | undefined;
      if (e.key === 'ArrowRight') next = shown[at + 1] ?? shown[at];
      else if (e.key === 'ArrowLeft') next = at < 0 ? shown.at(-1) : shown[Math.max(at - 1, 0)];
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') next = cur ? (vertical(shown, cur, e.key === 'ArrowDown' ? 1 : -1) ?? cur) : shown[0];
      else if (e.key === 'Home') next = shown[0];
      else if (e.key === 'End') next = shown.at(-1);
      else if (e.key === 'Escape' && m.sel >= 0) {
        e.preventDefault();
        clear(m);
        return;
      } else return;
      e.preventDefault();
      if (next) select(m, m.cells.indexOf(next));
    });
    m.panel.addEventListener('click', (e) => {
      if (!(e.target as Element).closest('[data-map-close]')) return;
      clear(m);
      m.grid.focus();
    });
    m.panel.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || m.sel < 0) return;
      clear(m);
      m.grid.focus();
    });
  }

  // URL の条件を入力に戻す。指標・年度に当たる選択肢が無ければ、初めの選択（すべて・最新の年度）に戻す
  const params = new URLSearchParams(location.search);
  for (const [k, v] of params) {
    const f = form.elements.namedItem(k) as RadioNodeList | HTMLSelectElement | null;
    if (f instanceof HTMLSelectElement) f.value = v;
    else if (f) for (const r of f) if (r instanceof HTMLInputElement) r.checked = r.value === v;
  }
  for (const name of ['kind', 'year']) {
    const radios = [...form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)];
    if (!radios.some((r) => r.checked)) for (const r of radios) r.checked = r.defaultChecked;
  }
  shownYear = yearOf();
  form.addEventListener('change', apply);
  form.addEventListener('submit', (e) => e.preventDefault());
  apply();
  ready = true;
}
