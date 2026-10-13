// いいねのボタン（components/Like.astro）。押すと /api/like に1回送り、お礼を出す（docs/deploy.md の 7章）。
import { LIKE_FROM, LIKE_THANKS, likeUrl } from '../lib/like.ts';

const SHOW_MS = 3500;
// ボタンとポップアップのあいだ（.like-pop の bottom・top と同じ）
const GAP = 14;

for (const wrap of document.querySelectorAll<HTMLElement>('[data-like]')) {
  const btn = wrap.querySelector<HTMLButtonElement>('.like-btn');
  const pop = wrap.querySelector<HTMLElement>('.like-pop');
  const status = wrap.querySelector<HTMLElement>('[role="status"]');
  if (!btn || !pop || !status) continue;
  let timer = 0;
  const close = () => {
    window.clearTimeout(timer);
    if (pop.hidden || pop.classList.contains('leaving')) return;
    const done = () => {
      pop.hidden = true;
      pop.classList.remove('leaving');
    };
    pop.classList.add('leaving');
    // 消える動き（styles/global.css の「動き」）が終わってから隠す。動きを減らす設定・印刷のときは動きが無いので、すぐに隠す
    if (pop.getAnimations().length) pop.addEventListener('animationend', done, { once: true });
    else done();
  };
  btn.addEventListener('click', () => {
    if (btn.getAttribute('aria-pressed') === 'true') return;
    // disabled にするとフォーカスが外れるので、押せないことは aria-disabled で伝える
    btn.setAttribute('aria-pressed', 'true');
    btn.setAttribute('aria-disabled', 'true');
    fetch(likeUrl(location.pathname), { method: 'POST', keepalive: true }).catch(() => {});
    status.textContent = `${LIKE_THANKS.join('')}（${LIKE_FROM.join('')}より）`;
    pop.hidden = false;
    // ボタンの上に出す場所が画面に無いとき（ボタンが画面の上の端にあるとき）は、下に出す
    pop.classList.toggle('below', btn.getBoundingClientRect().top - pop.offsetHeight - GAP < 8);
    timer = window.setTimeout(close, SHOW_MS);
  });
  document.addEventListener('click', (e) => {
    if (!pop.hidden && !btn.contains(e.target as Node)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}
