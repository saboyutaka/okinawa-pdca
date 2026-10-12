// ページ内の目次（components/Toc.astro の .toc。施策・基本施策・取組などのページ）。
//  - いま読んでいる節のリンクに aria-current="location" を付ける（styles/global.css）。節の見出しが画面の上（目次の下あたり）を過ぎたら、その節にいるとする。
//    ページのいちばん下まで来たら最後の節にする（短い節の見出しは上まで届かないため）。スマホで目次のリンクが横にはみ出すときは、
//    いまの節のリンクが見えるように目次だけを横にずらす（ページは動かさない）
//  - 目次が画面の上に貼り付いたら stuck を付け、何のページかの1行（.toc-head）を出す。目次のすぐ前の目印（.toc-mark）が画面の上から出たかで決める。
//    IntersectionObserver は、# のリンクで画面の下から上へ一度に跳ぶと（目印が画面に入らないまま）知らせないので、スクロールのたびに位置を見る
import { moving } from './motion.ts';

// 見出しの上の端がここ（画面の上からの px）より上に来たら、その節にいる。見出しの scroll-margin-top（104px）より少し下
const LINE = 120;
for (const toc of document.querySelectorAll<HTMLElement>('.toc')) {
  const strip = toc.querySelector<HTMLElement>('.toc-links');
  const links = [...toc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')].flatMap((a) => {
    const h = document.getElementById(decodeURIComponent(a.hash.slice(1)));
    return h ? [{ a, h }] : [];
  });
  const mark = toc.previousElementSibling;
  const head = toc.querySelector('.toc-head') && mark?.classList.contains('toc-mark') ? mark : null;
  if (!links.length && !head) continue;
  let cur: HTMLAnchorElement | null = null;
  const update = () => {
    if (head) toc.classList.toggle('stuck', head.getBoundingClientRect().top < 0);
    if (!links.length) return;
    const bottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    const hit = bottom ? links[links.length - 1] : links.filter(({ h }) => h.getBoundingClientRect().top <= LINE).pop();
    const next = hit?.a ?? null;
    if (next === cur) return;
    cur?.removeAttribute('aria-current');
    next?.setAttribute('aria-current', 'location');
    cur = next;
    if (next && strip && strip.scrollWidth > strip.clientWidth) {
      // 目次のリンクの並びの中での左の位置
      const l = next.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
      if (l < strip.scrollLeft || l + next.offsetWidth > strip.scrollLeft + strip.clientWidth) {
        strip.scrollTo({ left: l - (strip.clientWidth - next.offsetWidth) / 2, behavior: moving() ? 'smooth' : 'auto' });
      }
    }
  };
  let queued = false;
  window.addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      update();
    });
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
}
