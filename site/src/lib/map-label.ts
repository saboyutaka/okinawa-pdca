// 指標のマップのマス目の読み上げ（aria-label）。書き出すとき（components/IndicatorMap.astro）と、年度や絞り込みを変えたとき（scripts/indicator-map.ts）で同じ文にする。
// マス目は1つの画像として読み、区分ごとの数を県の区分の並びのまま全部同じ重みで並べる（docs/design.md の1章・9章）。マス1つずつの中身は、矢印キーで移って下の枠に出す
const nf = new Intl.NumberFormat('ja-JP');
export function mapLabel(term: string, year: string, counts: [label: string, n: number][], unit: string, hit: number | null) {
  const total = counts.reduce((s, [, n]) => s + n, 0);
  const cats = counts.filter(([, n]) => n > 0).map(([label, n]) => `${label} ${nf.format(n)}${unit}`).join('、');
  return `${term}のマップ（${year}、${nf.format(total)}${unit}）。${cats}。${hit != null ? `絞り込みの条件に合うのは ${nf.format(hit)}${unit}。` : ''}矢印キーでマスを移ると、下に中身を出します`;
}
