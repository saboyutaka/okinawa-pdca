// 指標のマップのマス目の読み上げ（aria-label）。書き出すとき（pages/map.astro）と、年度や絞り込みを変えたとき（scripts/indicator-map.ts）で同じ文にする。
// マス目は1つの画像として読み、指標ごとに区分ごとの数を県の区分の並びのまま全部同じ重みで並べる（docs/design.md の1章・9章）。マス1つずつの中身は、矢印キーで移って出す
const nf = new Intl.NumberFormat('ja-JP');
export interface TierCount {
  term: string;
  unit: string;
  counts: [label: string, n: number][];
  hit: number | null; // 絞り込みの条件に合う数（絞り込んでいなければ null）
}
export function mapLabel(year: string, tiers: TierCount[]) {
  const part = ({ term, unit, counts, hit }: TierCount) => {
    const total = counts.reduce((s, [, n]) => s + n, 0);
    if (!total) return `${term}は${year}の分を出していません`;
    const cats = counts.filter(([, n]) => n > 0).map(([label, n]) => `${label} ${nf.format(n)}${unit}`).join('、');
    return `${term} ${nf.format(total)}${unit}（${cats}${hit != null ? `。絞り込みの条件に合うのは ${nf.format(hit)}${unit}` : ''}）`;
  };
  return `指標のマップ（${year}）。${tiers.map(part).join('。')}。矢印キーでマスを移ると、その中身を出します。Enter でその指標のページを開きます`;
}
