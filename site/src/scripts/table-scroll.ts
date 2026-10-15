// 横にすべらせる表の箱（.table-wrap）。表が箱の幅に入りきらないとき（スマホなど）だけ、Tab で止まるようにして、
// キーボードの ← → でも横に送れるようにする（WCAG 2.1.1。中にリンクの無い表は、そのままではキーボードで送れないブラウザがある）。
// 止まったときに何の表かが分かるよう、名前を付けた region にする。名前は表の caption、無ければ図の題名か節の見出しに「の表」を付ける。
// region は読み上げソフトの目印の一覧に並ぶので、同じページで名前が重なったら（2）（3）と番号を付けて分ける。
// 畳んだ中（「表で見る」）の表は開くまで幅が0なので、箱の大きさが変わるたびに確かめ直す
const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() || '';
const used = new Map<string, number>();
const nameOf = (wrap: HTMLElement) => {
  const caption = text(wrap.querySelector('caption'));
  const section = wrap.closest('section');
  const title = text(wrap.closest('figure')?.querySelector('.chart-title, figcaption')) || text(section?.querySelector('h2, h3'));
  const name = caption || (title ? `${title}の表` : '表');
  const n = (used.get(name) ?? 0) + 1;
  used.set(name, n);
  return n > 1 ? `${name}（${n}）` : name;
};
const update = (wrap: HTMLElement) => {
  const scrolls = wrap.scrollWidth > wrap.clientWidth + 1;
  if (scrolls === (wrap.tabIndex === 0)) return;
  if (scrolls) {
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    // 名前は初めて止めるときに1回だけ決める（幅が変わって外し、また付けるときに番号が進まないように）
    wrap.setAttribute('aria-label', (wrap.dataset.regionName ??= nameOf(wrap)));
  } else {
    wrap.removeAttribute('tabindex');
    wrap.removeAttribute('role');
    wrap.removeAttribute('aria-label');
  }
};
const wraps = document.querySelectorAll<HTMLElement>('.table-wrap');
if (wraps.length) {
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const wrap = (e.target as HTMLElement).closest<HTMLElement>('.table-wrap');
      if (wrap) update(wrap);
    }
  });
  // 箱の幅が変わったとき（画面の向き・開いたとき）と、中の表の幅が変わったとき（文字の読み込み）の両方を見る
  for (const wrap of wraps) {
    ro.observe(wrap);
    if (wrap.firstElementChild) ro.observe(wrap.firstElementChild);
  }
}
