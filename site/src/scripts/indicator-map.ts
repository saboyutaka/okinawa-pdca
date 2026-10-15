// 指標のマップ（/map/。pages/map.astro）。
//  - 指標と年度: form[data-map-form] の kind（'' はすべて）を枠の data-kind にして出す指標を選び（隠すのは CSS）、year でマスの色を変える。
//    マスの data-c は年度（data-years の順）ごとの区分の番号で、'-' はその年度の報告に無いので隠す。指標の数・読み上げ（lib/map-label.ts）・「R7の区分」の年度も書き換える。
//    その年度にマスが1つも無い指標（主要指標の R5）は、列ごと隠して（.empty）わけを書く
//  - 絞り込み: くらしのテーマ（マスの data-t）・部局（data-d）・指標ごとの区分（select の name は区分の名前。指標は data-map-bin）に合わないマスを薄くする
//    （隠さずに、全体の中のどこにあるかを見せる）。主要指標は部局・テーマに分けていないので、その条件ではどれも薄くなる（枠の中にそう書く）
//  - 条件は URL のクエリに残し、テーマ・部局・区分は一覧の上に × で外せる札を並べる（scripts/list-filter.ts と同じ形）。年度は最新のとき、指標は「すべて」のときは書かない
//  - 中身: マスを押す・矢印キーで移ると、マスの下（画面に入らなければ上）の吹き出しに、その年度の名前・親（基本施策・施策）・値を出す。× か Esc、吹き出しの外を押すと閉じる。
//    中身は指標ごとの JSON（lib/map-data.ts）で、初めてマス目にマウスを乗せた・押した・フォーカスしたときに読む
//  - キーボード: マス目で Tab は1回だけ止まり、← → で前後のマス（並びの順。行の中では主要指標 → 成果指標 → 活動指標）、↑ ↓ で同じ指標の上下の行のいちばん近いマス、
//    Home・End で最初・最後に移る
import { iconSvg, type Tone } from '../lib/icons.ts';
import { mapLabel, type TierCount } from '../lib/map-label.ts';
import type { MapData } from '../lib/map-data.ts';
import { bump, reveal } from './motion.ts';

type Cat = [key: string, label: string, tone: Tone];
interface Tier {
  kind: string;
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
}

const nf = new Intl.NumberFormat('ja-JP');
const yl = (y: number) => `R${y - 2018}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const form = document.querySelector<HTMLFormElement>('form[data-map-form]');
const root = document.querySelector<HTMLElement>('[data-map-root]');
if (form && root) init(form, root);

function init(form: HTMLFormElement, root: HTMLElement) {
  const years = form.dataset.years!.split(',').map(Number);
  const latest = years.at(-1)!;
  const summary = document.getElementById(form.dataset.summary || '');
  const grid = root.querySelector<HTMLElement>('[data-map-grid]')!;
  const pop = root.querySelector<HTMLElement>('[data-map-pop]')!;
  const tiers: Tier[] = [...root.querySelectorAll<HTMLElement>('[data-tier-head]')].map((head) => {
    const kind = head.dataset.tierHead!;
    const blocks = [...grid.querySelectorAll<HTMLElement>(`.im-tier[data-tier="${kind}"]`)];
    return {
      kind, head, term: head.dataset.term!, unit: head.dataset.unit!, parent: head.dataset.parent!, shapes: head.dataset.shapes === 'true',
      cats: JSON.parse(head.dataset.cats!) as Cat[],
      blocks,
      cells: blocks.flatMap((b) => [...b.querySelectorAll<HTMLElement>('.mc')]),
      bin: form.querySelector<HTMLElement>(`[data-map-bin="${kind}"]`)?.querySelector('select') ?? null,
    };
  });
  const tierOf = new Map(tiers.flatMap((t) => t.cells.map((c, i) => [c, { t, i }] as const)));
  // マス目のすべてのマス（画面の並びの順。行の中では主要指標 → 成果指標 → 活動指標）
  const allCells = [...grid.querySelectorAll<HTMLElement>('.im-cells .mc')];
  const value = (name: string) => (form.elements.namedItem(name) as RadioNodeList | HTMLSelectElement | null)?.value ?? '';
  const yearOf = () => Number(value('year')) || latest;
  // 絞り込みの条件（テーマ・部局・区分）の select。隠れている指標の区分は条件にしない
  const selects = [...form.querySelectorAll<HTMLSelectElement>('select[name]')];
  const activeSelects = () => selects.filter((s) => s.value && !s.closest<HTMLElement>('label')?.hidden);

  // ---------------------------------------------------------------- 吹き出し

  // 指標の中身の JSON。名前にハッシュの付いたファイルが無ければ（公開し直した直後に前のページから開いたとき）控えを読む。読めなければ次に押したときにまた読む
  const load = (t: Tier) => {
    const get = async (url: string) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as MapData;
    };
    t.data ??= get(t.head.dataset.src!).catch(() => get(t.head.dataset.fallback!));
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
        body = [
          `<p class="imp-name"><a class="name-link" href="${esc(item.h)}">${esc(item.n)}</a></p>`,
          x.n ? `<p class="imp-sub small secondary">${yl(y)}の報告の名前: ${esc(x.n)}</p>` : '',
          `<p class="imp-sub small secondary">${t.parent} <a class="sub-link" href="${esc(phref)}">${esc(pname)}</a> <span class="code-no">${esc(pcode)}</span></p>`,
          x.sub != null ? `<p class="imp-sub small"><span class="imp-l">${t.term}</span>${esc(x.sub || '—')}</p>` : '',
          `<dl class="imp-vals">${x.v.map(([l, v]) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`,
        ].join('');
      }
    } catch {
      if (sel?.t !== t || sel.i !== i) return;
      body = '<p class="imp-sub small">中身を読み込めませんでした。通信を確かめて、もう一度マスを押してください。</p>';
    }
    pop.innerHTML = head + body + closeBtn;
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

  // ---------------------------------------------------------------- 指標・年度・絞り込み

  let ready = false;
  let shownYear = yearOf();
  const apply = () => {
    const kind = value('kind');
    const y = yearOf();
    const yi = years.indexOf(y);
    // 年度を変えたときだけ、吹き出しの中身をその年度で出し直す（絞り込みでは中身は変わらない）
    const yearChanged = y !== shownYear;
    shownYear = y;
    const theme = value('theme');
    const dept = value('dept');
    root.dataset.kind = kind;
    const parts: TierCount[] = [];
    let emptyShuyou = false;
    for (const t of tiers) {
      const on = !kind || kind === t.kind;
      const binLabel = t.bin?.closest<HTMLElement>('label');
      if (binLabel) binLabel.hidden = !on;
      const bin = on ? (t.bin?.value ?? '') : '';
      const filtered = Boolean(theme || dept || bin);
      const counts = t.cats.map(() => 0);
      let hit = 0;
      for (const c of t.cells) {
        const k = c.dataset.c![yi];
        c.hidden = k === '-';
        if (c.hidden) continue;
        const cat = t.cats[Number(k)];
        counts[Number(k)]++;
        const ok = (!theme || (c.dataset.t || '').split(' ').includes(theme)) && (!dept || c.dataset.d === dept) && (!bin || cat[0] === bin);
        if (ok) hit++;
        c.className = `mc tone-${cat[2]}${ok ? '' : ' dim'}`;
      }
      const shown = counts.reduce((s, x) => s + x, 0);
      for (const b of t.blocks) b.classList.toggle('empty', !b.querySelector('.mc:not([hidden])'));
      t.head.classList.toggle('empty', shown === 0);
      if (t.kind === 'shuyou' && on && shown === 0) emptyShuyou = true;
      const count = t.head.querySelector<HTMLElement>('[data-map-count]')!;
      if (count.textContent !== nf.format(shown)) {
        count.textContent = nf.format(shown);
        if (ready) bump(count);
      }
      t.head.querySelector<HTMLElement>('[data-map-hit]')!.textContent = filtered && shown ? `（条件に合う ${nf.format(hit)}）` : '';
      if (on) parts.push({ term: t.term, unit: t.unit, counts: t.cats.map((c, i) => [c[1], counts[i]]), hit: filtered ? hit : null });
    }
    grid.setAttribute('aria-label', mapLabel(yl(y), parts));
    for (const s of root.querySelectorAll('[data-map-year]')) s.textContent = yl(y);
    root.querySelector<HTMLElement>('[data-map-empty]')!.hidden = !emptyShuyou;
    root.querySelector<HTMLElement>('[data-map-nofilter]')!.hidden = !(theme || dept) || emptyShuyou || (Boolean(kind) && kind !== 'shuyou');
    if (sel) {
      const c = sel.t.cells[sel.i];
      if (c.hidden || !c.offsetParent) close();
      else if (yearChanged) select(sel.t, sel.i);
      else {
        c.classList.add('sel');
        place();
      }
    }
    renderSummary();
    const conds = activeSelects().length;
    form.dataset.filterN = String(conds);
    form.dispatchEvent(new CustomEvent('filters:change', { detail: { n: conds } }));
    // URL: 指標は「すべて」、年度は最新のとき書かない。隠れている指標の区分は書かない
    const params = new URLSearchParams();
    if (kind) params.set('kind', kind);
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

  // 見えているマス（並びの順。隠した指標・年度に無いマスは除く）
  const visible = (cs: HTMLElement[]) => cs.filter((c) => !c.hidden && c.offsetParent);
  const shownCells = () => visible(allCells);
  // 同じ指標の上下の行のマス（d は 1 で下、-1 で上）。画面の上での位置で、いちばん近い行の、横の位置がいちばん近いマス
  const vertical = (cur: HTMLElement, d: number) => {
    const same = visible(tierOf.get(cur)!.t.cells);
    const r = cur.getBoundingClientRect();
    const rects = same.map((c) => c.getBoundingClientRect());
    const dys = rects.map((q) => (q.top - r.top) * d).filter((dy) => dy > 2);
    if (!dys.length) return undefined;
    const row = Math.min(...dys);
    let best: HTMLElement | undefined;
    let bx = Infinity;
    rects.forEach((q, i) => {
      if (Math.abs((q.top - r.top) * d - row) > 2) return;
      const dx = Math.abs(q.left - r.left);
      if (dx < bx) [best, bx] = [same[i], dx];
    });
    return best;
  };
  const selectCell = (c: HTMLElement | null | undefined) => {
    const at = c && tierOf.get(c);
    if (at) select(at.t, at.i);
  };

  grid.addEventListener('pointerenter', () => { for (const t of tiers) void load(t).catch(() => {}); }, { once: true });
  grid.addEventListener('click', (e) => selectCell((e.target as Element).closest<HTMLElement>('.mc')));
  // キーボードで入ったとき（マウスで押したときは除く）は、選んでいるマスか最初のマスの中身を出す
  grid.addEventListener('focus', () => {
    if (grid.matches(':focus-visible') && !sel) selectCell(shownCells()[0]);
  });
  grid.addEventListener('keydown', (e) => {
    const shown = shownCells();
    const cur = sel ? sel.t.cells[sel.i] : null;
    const at = cur ? shown.indexOf(cur) : -1;
    let next: HTMLElement | undefined;
    if (e.key === 'ArrowRight') next = shown[at + 1] ?? shown[at];
    else if (e.key === 'ArrowLeft') next = at < 0 ? shown.at(-1) : shown[Math.max(at - 1, 0)];
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') next = cur ? (vertical(cur, e.key === 'ArrowDown' ? 1 : -1) ?? cur) : shown[0];
    else if (e.key === 'Home') next = shown[0];
    else if (e.key === 'End') next = shown.at(-1);
    else if (e.key === 'Escape' && sel) {
      e.preventDefault();
      close();
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
