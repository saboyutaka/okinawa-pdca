// ページ内の目次（.toc。施策・基本施策・取組などのページ）で、いま読んでいる節のリンクに aria-current="location" を付ける（styles/global.css）。
// 節の見出しが画面の上（目次の下あたり）を過ぎたら、その節にいるとする。ページのいちばん下まで来たら最後の節にする（短い節の見出しは上まで届かないため）。
// スマホで目次のリンクが横にはみ出すときは、いまの節のリンクが見えるように目次だけを横にずらす（ページは動かさない）
import { moving } from './motion.ts';

// 見出しの上の端がここ（画面の上からの px）より上に来たら、その節にいる。見出しの scroll-margin-top（72px）より少し下
const LINE = 96;
for (const toc of document.querySelectorAll<HTMLElement>('.toc')) {
  const strip = toc.querySelector<HTMLElement>('.toc-links');
  const links = [...toc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')].flatMap((a) => {
    const h = document.getElementById(decodeURIComponent(a.hash.slice(1)));
    return h ? [{ a, h }] : [];
  });
  if (!links.length) continue;
  let cur: HTMLAnchorElement | null = null;
  const update = () => {
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
  update();
}
