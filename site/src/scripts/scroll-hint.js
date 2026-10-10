// 横にすべらせる帯（[data-scroll-hint]。ヘッダーのナビ・ページ内の目次）に、続きがある向きを付ける。
// 左に続きがあれば more-l、右に続きがあれば more-r を付け、styles/global.css がその側の端をぼかす
for (const el of document.querySelectorAll('[data-scroll-hint]')) {
  const update = () => {
    const max = el.scrollWidth - el.clientWidth;
    el.classList.toggle('more-l', max > 1 && el.scrollLeft > 4);
    el.classList.toggle('more-r', max > 1 && el.scrollLeft < max - 4);
  };
  el.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}
