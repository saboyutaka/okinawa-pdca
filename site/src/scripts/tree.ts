// 計画の目次（/mokuji/。pages/mokuji.astro）。
//  - 描く: ul[data-tree] の data-src（名前にハッシュの付いた JSON。読めなければ data-fallback の控え）を読み、目次を描く（データの形は lib/tree-data.ts）。
//    URL に q があれば、さがしてから一度で描く。描く HTML の形と見た目の決まりは pages/mokuji.astro の頭の説明と CSS
//  - 開く深さ: [data-tree-depth="i"] のボタンを押すと、木の details のうち階層（data-level。将来像が 0）が i 未満のものを開き、ほかは閉じる。
//    いまの開き方がどれかのボタンの形にそろっているときだけ、そのボタンを押した形（aria-pressed）にする
//    （1つずつ開け閉めしてそろわなくなったら、どれも押していない形。印刷の前後に scripts/print.ts が開け閉めしたときも同じ）
//  - キーワード: form[data-tree-search="木の id"] の言葉で、施策・取組・成果指標の名前（li[data-q] の .qn）を部分一致でさがす
//    （全角・半角と表記ゆれは lib/search.ts でそろえる）。当たった行とその親の行・当たった行の中だけを見せ、当たった行の親を開いて、当たった字に印を付ける。
//    成果指標は、PC の幅では施策の行の名前の横にあるので（同じ指標の .qn が2つある。data-qk）、施策の行が当たったことにする。
//    言葉を消すと、さがす前の開き方に戻す。言葉は URL の q に残す（ほかの一覧の絞り込みと同じ）
//  - 戻る・進む: bfcache から戻したときは、言葉の欄と木を URL の q にそろえる。bfcache を使わずに読み直したときは目次を描き直すので、
//    離れるときに開き方とスクロールの位置を history.state に残し、描いたあとに戻す
import { matchRanges, matchesAll, searchText, searchWords, type SearchWord } from '../lib/search.ts';
import type { TreeData, TreeKihon, TreeLink, TreeShisaku, TreeTenkai, TreeVision } from '../lib/tree-data.ts';
import { bump } from './motion.ts';

// ---------------------------------------------------------------- 描く

const esc = (s: string | number) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
// すぐ下に並ぶものの数（0 のものは出さない）。閉じている行の名前の後ろに出す。ind は指標の数（PC では出さないので、区切りの「・」がずれないよう後ろに置く）。
// ▶ の丸の読み上げの名前には、指標を除いた数を使う（PC では指標は名前の横にあるため）。
// 名前のある行（将来像・基本施策・施策）では、▶ の丸の読み上げの名前に同じ数があるので、画面の数は読ませない（hide。施策展開は行ごと summary で、数はそこでしか読まれないので読ませる。docs/design.md の9章）
type Count = [label: string, n: number, ind?: boolean];
const counts = (cs: Count[], hide = true) =>
  `<span class="cnt"${hide ? ' aria-hidden="true"' : ''}>${cs.filter(([, n]) => n > 0).map(([l, n, ind]) => `<span${ind ? ' class="c-ind"' : ''}>${l} <b>${n}</b></span>`).join('')}</span>`;
const said = (cs: Count[]) => cs.filter(([, n, ind]) => n > 0 && !ind).map(([l, n]) => `${l} ${n}`).join('・');
// 開け閉めの丸（名前のある行の summary）
const toggle = (level: number, cs: Count[]) =>
  `<details data-level="${level}"><summary class="tg"><span class="tw" aria-hidden="true"></span><span class="sr-only">${said(cs)}</span></summary>`;
// 指標。q はキーワードでさがすもの（成果指標）。名前の横（PC）と開いた中の行（スマホ）の2か所に書く
const qAttrs = (href: string, q: boolean) => (q ? ` data-qk="${esc(href)}"` : '');
const inds = (links: TreeLink[], q: boolean) =>
  links.length
    ? `<span class="inds">${links.map(([name, href]) => `<span class="ind-i"><span class="ind">指標</span><a class="sub-link${q ? ' qn' : ''}" href="${esc(href)}"${qAttrs(href, q)}>${esc(name)}</a></span>`).join('')}</span>`
    : '';
const indRow = ([name, href]: TreeLink, q: boolean) =>
  `<li class="leaf leaf-ind"${q ? ' data-q="成果指標"' : ''}><div class="tb"><span class="no ind">指標</span><a class="name-link${q ? ' qn' : ''}" href="${esc(href)}"${qAttrs(href, q)}>${esc(name)}</a></div></li>`;

function shisakuRow(s: TreeShisaku) {
  const cs: Count[] = [['取組', s.torikumi.length], ['成果指標', s.seika.length, true]];
  const rows = [
    ...s.seika.map((l) => indRow(l, true)),
    ...s.torikumi.map(([no, name, href]) => `<li class="leaf" data-q="取組"><div class="tb"><span class="no">${no}</span><a class="name-link qn" href="${esc(href)}">${esc(name)}</a></div></li>`),
  ];
  return `<li class="nd lv3" id="s-${esc(s.id)}" data-q="施策"><div class="tb"><span class="no">${esc(s.no)}</span><span class="nm"><a class="name-link qn" href="/shisaku/${esc(s.id)}/">${esc(s.name)}</a>${inds(s.seika, true)} ${counts(cs)}</span></div>${
    rows.length ? `${toggle(3, cs)}<ul>${rows.join('')}</ul></details>` : '<span class="tg" aria-hidden="true"><span class="tw tw-none"></span></span>'
  }</li>`;
}
// 施策展開にはページが無いので、名前はリンクにせず、行ごと summary にする
const tenkaiRow = (t: TreeTenkai) =>
  `<li class="lv2" id="t-${esc(t.id)}"><details data-level="2"><summary class="sum"><span class="tw" aria-hidden="true"></span><span class="tb"><span class="no">${esc(t.no)}</span><span class="nm"><span class="tk-name">${esc(t.name)}</span> ${counts([['施策', t.shisaku.length]], false)}</span></span></summary><ul>${t.shisaku.map(shisakuRow).join('')}</ul></details></li>`;
function kihonRow(k: TreeKihon) {
  const cs: Count[] = [['施策展開', k.tenkai.length], ['主要指標', k.shuyou.length, true]];
  return `<li class="nd lv1" id="k-${esc(k.id)}"><div class="tb"><span class="no">${esc(k.no)}</span><span class="nm"><a class="name-link" href="/kihon/${esc(k.id)}/">${esc(k.name)}</a>${inds(k.shuyou, false)} ${counts(cs)}</span></div>${toggle(1, cs)}<ul>${k.shuyou.map((l) => indRow(l, false)).join('')}${k.tenkai.map(tenkaiRow).join('')}</ul></details></li>`;
}
// 将来像は帯にする（番号の印は components/Sz.astro と同じ形）
function visionRow(v: TreeVision) {
  const cs: Count[] = [['基本施策', v.kihon.length]];
  return `<li class="nd lv0" id="v-${v.id}"><div class="tb"><span class="nm"><span class="sz-ribbon sz-${v.id}"><span class="badge-sz sz-${v.id}" aria-hidden="true">${v.id}</span><a class="name-link" href="/future/${v.id}/"><span class="sr-only">将来像${v.id}　</span>${esc(v.name)}</a></span> ${counts(cs)}</span></div>${toggle(0, cs)}<ul>${v.kihon.map(kihonRow).join('')}</ul></details></li>`;
}

// ---------------------------------------------------------------- 読み込み

async function load(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json() as Promise<TreeData>;
}

// 離れるときに残す、開き方とスクロールの位置（history.state の tree）。src は描いたデータで、データが変わったら（公開し直したら）使わない
interface Saved { src: string; open: number[]; y: number }
const savedOf = (src: string): Saved | null => {
  const s = (history.state as { tree?: Saved } | null)?.tree;
  return s && s.src === src ? s : null;
};

for (const tree of document.querySelectorAll<HTMLElement>('ul[data-tree]')) void init(tree);

async function init(tree: HTMLElement) {
  const msg = tree.parentElement?.querySelector<HTMLElement>('.tree-msg');
  const form = document.querySelector<HTMLFormElement>(`form[data-tree-search="${tree.id}"]`);
  const input = form?.querySelector<HTMLInputElement>('input[name="q"]') ?? null;
  const hits = document.querySelector<HTMLElement>(`[data-tree-hits="${tree.id}"] > span`);
  const btns = [...document.querySelectorAll<HTMLButtonElement>(`[data-tree-depth][aria-controls="${tree.id}"]`)];
  const urlQ = () => new URLSearchParams(location.search).get('q') || '';
  // 成果指標を施策の名前の横に出す幅（pages/mokuji.astro の CSS と同じ）
  const wide = matchMedia('(min-width: 760px)');

  // 言葉の欄は、データを待たずに URL の q で埋める。届くまでに打った言葉も URL に残し、描いたあとにさがす
  let ready = false;
  let timer = 0;
  if (input) input.value = urlQ();
  const update = () => {
    if (!input) return;
    if (ready) run();
    const url = new URL(location.href);
    const q = input.value.trim();
    if (q) url.searchParams.set('q', q);
    else url.searchParams.delete('q');
    history.replaceState(history.state, '', url);
  };
  input?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(update, 120);
  });
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    update();
  });

  const src = tree.dataset.src!;
  let data: TreeData;
  try {
    data = await load(src).catch(() => load(tree.dataset.fallback!));
  } catch {
    tree.removeAttribute('aria-busy');
    if (msg) msg.textContent = '目次を読み込めませんでした。時間をおいて、ページを再読み込みしてください。';
    return;
  }
  // はじめに押してあるボタンの深さまで開く（pages/mokuji.astro の START）
  const startDepth = Number(btns.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.treeDepth ?? 1);
  tree.innerHTML = data.visions.map(visionRow).join('');
  const nodes = [...tree.querySelectorAll<HTMLDetailsElement>('details[data-level]')];
  const saved = savedOf(src);
  const openSet = saved ? new Set(saved.open) : null;
  nodes.forEach((d, i) => { d.open = openSet ? openSet.has(i) : Number(d.dataset.level) < startDepth; });

  // ---------------------------------------------------------------- 開く深さ
  const opensAt = (b: HTMLButtonElement) => (d: HTMLDetailsElement) => Number(d.dataset.level) < Number(b.dataset.treeDepth);
  // キーワードでさがす前の開き方（さがしているあいだだけ持つ）
  let before: boolean[] | null = null;
  let queued = false;
  const sync = () => {
    queued = false;
    for (const b of btns) b.setAttribute('aria-pressed', String(nodes.every((d) => d.open === opensAt(b)(d))));
  };
  // toggle は泡立たないので、木で捕まえて受ける。一度にたくさん開け閉めしたときも、そろったかを見るのは1回だけにする
  tree.addEventListener('toggle', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(sync);
  }, true);
  for (const b of btns) {
    b.addEventListener('click', () => {
      const open = opensAt(b);
      for (const d of nodes) d.open = open(d);
      // さがしているあいだに押したときは、言葉を消したあともその開き方にする
      if (before) before = nodes.map(open);
      sync();
    });
  }

  // ---------------------------------------------------------------- キーワード
  const lis = [...tree.querySelectorAll<HTMLLIElement>('li')];
  const original = new Map([...tree.querySelectorAll<HTMLElement>('.qn')].map((el) => [el, el.textContent || '']));
  const items = [...tree.querySelectorAll<HTMLLIElement>('li[data-q]')].map((li) => {
    const name = li.querySelector<HTMLElement>(':scope > .tb .qn')!;
    const key = name.dataset.qk;
    return {
      li,
      kind: li.dataset.q!,
      text: searchText(original.get(name)!),
      names: key ? [...tree.querySelectorAll<HTMLElement>(`.qn[data-qk="${CSS.escape(key)}"]`)] : [name],
      row: li.closest<HTMLLIElement>('li.lv3')!,
    };
  });
  // 件数は、言葉の欄の説明と同じ順（施策・取組・成果指標）に並べる
  const kinds = ['施策', '取組', '成果指標'];

  // 当たった字に印（mark）を付ける。words が null なら元の文字に戻す
  const painted = new Set<HTMLElement>();
  const paint = (el: HTMLElement, words: SearchWord[] | null) => {
    const text = original.get(el)!;
    const ranges = words ? matchRanges(text, words) : [];
    if (!ranges.length) {
      el.textContent = text;
      painted.delete(el);
      return;
    }
    const parts: (string | HTMLElement)[] = [];
    let at = 0;
    for (const [a, b] of ranges) {
      const m = document.createElement('mark');
      m.textContent = text.slice(a, b);
      parts.push(text.slice(at, a), m);
      at = b;
    }
    parts.push(text.slice(at));
    el.replaceChildren(...parts);
    painted.add(el);
  };

  // 木がいま見せている言葉（URL の q と同じ形。前後の空白を除く）
  let shown = '';
  function run() {
    if (!input || !hits) return;
    shown = input.value.trim();
    const words = searchWords(input.value);
    for (const el of [...painted]) paint(el, null);
    for (const li of tree.querySelectorAll('li[data-hit]')) li.removeAttribute('data-hit');
    if (!words.length) {
      for (const li of lis) li.hidden = false;
      if (before) nodes.forEach((d, i) => { d.open = before![i]; });
      before = null;
      hits.textContent = '';
      return;
    }
    before ??= nodes.map((d) => d.open);
    const n = new Map(kinds.map((k) => [k, 0]));
    const hit: HTMLLIElement[] = [];
    for (const it of items) {
      if (!matchesAll(it.text, words)) continue;
      n.set(it.kind, n.get(it.kind)! + 1);
      const li = it.kind === '成果指標' && wide.matches ? it.row : it.li;
      li.dataset.hit = '';
      hit.push(li);
      for (const el of it.names) paint(el, words);
    }
    // 当たった行の親の行は見せて開き、ほかは閉じる。当たった行とその中は見せる（中は閉じたまま）
    const keep = new Set<Element>();
    const open = new Set<Element>();
    for (const li of hit) {
      for (let a = li.parentElement; a && a !== tree; a = a.parentElement) {
        if (a instanceof HTMLLIElement) keep.add(a);
        else if (a instanceof HTMLDetailsElement) open.add(a);
      }
    }
    for (const li of lis) li.hidden = !keep.has(li) && !li.closest('li[data-hit]');
    for (const d of nodes) d.open = open.has(d);
    const found = [...n].filter(([, x]) => x > 0).map(([k, x]) => `${k} ${x.toLocaleString('ja-JP')}`).join('・');
    const text = found ? `${found} が見つかりました` : '見つかりませんでした';
    if (hits.textContent !== text) {
      hits.textContent = text;
      bump(hits);
    }
  }

  // 言葉の欄と木を URL の q にそろえる。URL はさがすたびに書き換えているので、いつも正しい。木がもうその言葉を見せていれば、欄だけを直す
  const fromUrl = () => {
    if (!input) return;
    const q = urlQ();
    if (input.value.trim() !== q) input.value = q;
    if (shown !== q) run();
  };
  ready = true;
  fromUrl();
  sync();
  tree.removeAttribute('aria-busy');
  if (msg) msg.hidden = true;

  if (saved) {
    // bfcache を使わずに戻ったとき: 離れたときのスクロールの位置に戻す（描く前はページが短く、ブラウザが戻せないことがある）
    window.scrollTo(0, saved.y);
  } else {
    // # の行き先（/mokuji/#s-1-1-a-1 など）が目次の中にあれば、親を開いてそこへ動く（scripts/disclosure.ts は目次を描く前に動くので、ここで行う）
    const id = decodeURIComponent(location.hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    if (target && tree.contains(target)) {
      for (let d = target.parentElement?.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
      target.scrollIntoView();
    }
  }

  // 幅が変わって成果指標の出る場所が変わったら、さがし直す
  wide.addEventListener('change', () => { if (input?.value.trim()) run(); });
  // bfcache から戻したとき。ブラウザによっては、木の見た目はそのままで欄だけを空にし、それを pageshow より後に別の処理として行う（WebKit）ので、
  // 少しあとにもう一度そろえる
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    fromUrl();
    setTimeout(fromUrl, 0);
    setTimeout(fromUrl, 300);
  });
  // 離れるときに、開き方（さがしているときは、さがす前の開き方）とスクロールの位置を残す
  window.addEventListener('pagehide', () => {
    const opens = before ?? nodes.map((d) => d.open);
    const state: Saved = { src, open: opens.flatMap((o, i) => (o ? [i] : [])), y: window.scrollY };
    history.replaceState({ ...(history.state as object | null), tree: state }, '');
  });
}
