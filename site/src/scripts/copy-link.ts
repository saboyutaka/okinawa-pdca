// リンクのコピーのボタン（data-copy に URL）。指標のシェアの枠（components/ShareMenu.astro）の「リンクをコピー」と、
// ページの終わりのシェアの枠のリンクのアイコン（components/Share.astro の copy）。
// 押すと URL をクリップボードに入れ、2秒のあいだ data-copied を付ける（文字のボタンは .copy-label を「コピーしました」に、アイコンはチェックの印にする）。
// 読み上げには、まわり（data-copy-box）の role="status" で伝える。クリップボードに書けないとき（権限が無いなど）は、まわりのリンクの欄があれば選んで写してもらう
const COPIED_MS = 2000;

for (const btn of document.querySelectorAll<HTMLButtonElement>('button[data-copy]')) {
  const box = btn.closest<HTMLElement>('[data-copy-box]');
  const status = box?.querySelector<HTMLElement>('[role="status"]');
  const input = box?.querySelector<HTMLInputElement>('input');
  const label = btn.querySelector<HTMLElement>('.copy-label');
  const text = label?.textContent ?? '';
  const tip = btn.dataset.tipValue;
  const say = (s: string) => { if (status) status.textContent = s; };
  let timer = 0;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy || '');
    } catch {
      if (input) {
        input.select();
        say('リンクを選びました。コピーしてください');
      } else say('リンクをコピーできませんでした');
      return;
    }
    btn.dataset.copied = '';
    if (label) label.textContent = 'コピーしました';
    if (tip) btn.dataset.tipValue = 'コピーしました';
    say('リンクをコピーしました');
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      delete btn.dataset.copied;
      if (label) label.textContent = text;
      if (tip) btn.dataset.tipValue = tip;
      say('');
    }, COPIED_MS);
  });
}
