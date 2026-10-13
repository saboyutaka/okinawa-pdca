// 施策の一覧（pages/shisaku/index.astro）の頭の「判定の移り変わり」のリンクは、ページを開き直さずに絞り込みの「判定の移り変わり」だけを変える（キーワードなど、いま入っている条件は残す）
const trend = document.querySelector<HTMLSelectElement>('form[data-filter] select[name="trend"]');
for (const a of document.querySelectorAll<HTMLAnchorElement>('.trends [data-trend]')) {
  a.addEventListener('click', (e) => {
    if (!trend) return;
    e.preventDefault();
    trend.value = a.dataset.trend!;
    trend.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
