// HTML で描いた図に、画面に入ったときに1回だけ動きを付ける（data-draw-in の要素。いまは主要指標の道のり components/ShuyouRoad.astro）。
// 動きの見た目は styles/global.css の「動き」で決め、ここでは止めておく m-anim と、動かす m-go を付け外しするだけ（scripts/charts.ts の図と同じ）。
// 動き終わったら両方を外す。動きを減らす設定・IntersectionObserver の無いブラウザでは何もしない（はじめから描き終わった形）
import { moving } from './motion.ts';

const ANIM_END_MS = 1000;
const els = document.querySelectorAll<HTMLElement>('[data-draw-in]');
if (els.length && moving() && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries, obs) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      obs.unobserve(e.target);
      e.target.classList.add('m-go');
      setTimeout(() => e.target.classList.remove('m-anim', 'm-go'), ANIM_END_MS);
    }
  }, { threshold: 0.6 });
  for (const el of els) {
    el.classList.add('m-anim');
    io.observe(el);
  }
}
