// 長い一覧の「さらに表示」。ul[data-more="N"] の一覧は最初の N 件より後を隠し、[data-more-btn="一覧の id"] のボタンで残りを全部出す。
// 隠すのはこのスクリプトが動いてから（動かないときは全部見える）。残りが2件以下なら畳まない（ボタンを押す手間のほうが大きいため）。
// 出した行は、すっと出す（scripts/motion.ts の reveal）
import { reveal } from './motion.ts';

for (const list of document.querySelectorAll<HTMLElement>('[data-more]')) {
  const btn = document.querySelector<HTMLButtonElement>(`[data-more-btn="${list.id}"]`);
  const rest = [...list.children].slice(Number(list.dataset.more)) as HTMLElement[];
  if (!btn || rest.length <= 2) continue;
  for (const el of rest) el.hidden = true;
  btn.hidden = false;
  btn.addEventListener('click', () => {
    for (const el of rest) el.hidden = false;
    reveal(rest);
    btn.hidden = true;
    // キーボードで押したときに、出てきた最初の行から読み進められるようにする
    rest[0].querySelector<HTMLElement>('a')?.focus();
  });
  // 印刷するときは残りも出す（印刷が終わったら、ボタンを押していなければ隠し直す）
  window.addEventListener('beforeprint', () => { if (!btn.hidden) for (const el of rest) el.hidden = false; });
  window.addEventListener('afterprint', () => { if (!btn.hidden) for (const el of rest) el.hidden = true; });
}
