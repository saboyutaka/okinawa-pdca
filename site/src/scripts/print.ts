// 印刷（勉強会や会議の資料に）。印刷の直前に、畳んだ内容（<details>）を開き、ダークの配色をライトにし、
// ページの幅を紙の幅にそろえる（html.printing。図は scripts/charts.ts がこのあとこの幅で描き直す）。印刷が終わったら元に戻す。
// 「さらに表示」で隠した行は scripts/show-more.ts が出す。印刷の見た目は styles/global.css の @media print
const html = document.documentElement;
let opened: HTMLDetailsElement[] = [];
let dark = false;

window.addEventListener('beforeprint', () => {
  opened = [...document.querySelectorAll('details')].filter((d) => !d.open);
  for (const d of opened) d.open = true;
  dark = html.dataset.theme === 'dark';
  if (dark) html.dataset.theme = 'light';
  html.classList.add('printing');
});

window.addEventListener('afterprint', () => {
  for (const d of opened) d.open = false;
  opened = [];
  if (dark) html.dataset.theme = 'dark';
  html.classList.remove('printing');
});
