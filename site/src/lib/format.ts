const nf = new Intl.NumberFormat('ja-JP');

export const fmt = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));

export const pct = (n: number, d: number) => (d ? `${(Math.round((n / d) * 1000) / 10).toFixed(1)}%` : '—');

// 割合（%）の幅を「7〜8割台」のように丸めて言う（4年間の推移の頭の文。components/TrendFigure.astro。正確な値は図と表にある。良い・悪いは言わない）
export function band(vals: number[]) {
  const [lo, hi] = [Math.floor(Math.min(...vals) / 10), Math.floor(Math.max(...vals) / 10)];
  return lo === hi ? `${lo}割台` : `${lo}〜${hi}割台`;
}

const oku = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// 決算見込額は千円単位で載っている
export function yen(senYen: number | null | undefined) {
  if (senYen == null) return '—';
  const v = senYen * 1000;
  if (v >= 1e8) return `${oku.format(v / 1e8)}億円`;
  if (v >= 1e4) return `${nf.format(Math.round(v / 1e4))}万円`;
  return `${nf.format(v)}円`;
}
