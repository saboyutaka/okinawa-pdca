// ページ内の目次（components/Toc.astro）が画面の上に貼り付いたら stuck を付け、何のページかの1行（.toc-head）を出す（styles/global.css）。
// 目次のすぐ前の目印（.toc-mark）が画面の上から出たかどうかで決める。
// IntersectionObserver は、# のリンクで画面の下から上へ一度に跳ぶと（目印が画面に入らないまま）知らせないので、スクロールのたびに位置を見る
for (const toc of document.querySelectorAll<HTMLElement>('.toc')) {
  const mark = toc.previousElementSibling;
  if (!toc.querySelector('.toc-head') || !mark?.classList.contains('toc-mark')) continue;
  const update = () => toc.classList.toggle('stuck', mark.getBoundingClientRect().top < 0);
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}
