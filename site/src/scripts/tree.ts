// 計画の目次（/tree/）。
//  - 開く深さ: [data-tree-depth="i"] のボタンを押すと、木の details のうち階層（data-level。将来像が 0）が i 未満のものを開き、ほかは閉じる。
//    いまの開き方がどれかのボタンの形にそろっているときだけ、そのボタンを押した形（aria-pressed）にする
//    （1つずつ開け閉めしてそろわなくなったら、どれも押していない形。印刷の前後に scripts/print.ts が開け閉めしたときも同じ）
//  - キーワード: form[data-tree-search="木の id"] の言葉で、施策・取組・成果指標の名前（li[data-q] の .qn）を部分一致でさがす
//    （全角・半角と表記ゆれは lib/search.ts でそろえる）。当たった行とその親の行・当たった行の中だけを見せ、当たった行の親を開いて、当たった字に印を付ける。
//    成果指標は、PC の幅では施策の行の名前の横にあるので（同じ指標の .qn が2つある。data-qk）、施策の行が当たったことにする。
//    言葉を消すと、さがす前の開き方に戻す。言葉は URL の q に残す（ほかの一覧の絞り込みと同じ）
import { matchRanges, matchesAll, searchText, searchWords, type SearchWord } from '../lib/search.ts';
import { bump } from './motion.ts';

const wide = matchMedia('(min-width: 760px)');

for (const tree of document.querySelectorAll<HTMLElement>('[data-tree]')) {
  const nodes = [...tree.querySelectorAll<HTMLDetailsElement>('details[data-level]')];
  const btns = [...document.querySelectorAll<HTMLButtonElement>(`[data-tree-depth][aria-controls="${tree.id}"]`)];
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
  sync();

  const form = document.querySelector<HTMLFormElement>(`form[data-tree-search="${tree.id}"]`);
  const input = form?.querySelector<HTMLInputElement>('input[name="q"]');
  const hits = document.querySelector<HTMLElement>(`[data-tree-hits="${tree.id}"] > span`);
  if (!form || !input || !hits) continue;
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

  const run = () => {
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
  };

  // 打つたびに少し待ってからさがし、URL の q を書き換える（戻るボタンの履歴は増やさない）
  let timer = 0;
  const update = () => {
    run();
    const url = new URL(location.href);
    const q = input.value.trim();
    if (q) url.searchParams.set('q', q);
    else url.searchParams.delete('q');
    history.replaceState(history.state, '', url);
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(update, 120);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    update();
  });
  // 幅が変わって成果指標の出る場所が変わったら、さがし直す
  wide.addEventListener('change', () => { if (input.value.trim()) run(); });
  // 言葉の欄を URL の q にそろえてさがす。開いたときと、ほかのページから戻る・進むで bfcache から戻したとき
  // （ブラウザによっては、戻したときに木の見た目はそのままで、言葉の欄だけを空にする。URL はさがすたびに書き換えているので、いつも木と合っている）
  const fromUrl = () => {
    const q = new URLSearchParams(location.search).get('q') || '';
    if (input.value === q && !q) return;
    input.value = q;
    run();
  };
  fromUrl();
  window.addEventListener('pageshow', (e) => { if (e.persisted) fromUrl(); });
}
