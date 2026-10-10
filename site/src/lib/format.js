const nf = new Intl.NumberFormat('ja-JP');

export const fmt = (n) => (n == null ? '—' : nf.format(n));

export const pct = (n, d) => (d ? `${(Math.round((n / d) * 1000) / 10).toFixed(1)}%` : '—');

// 決算見込額は千円単位で載っている
export function yen(senYen) {
  if (senYen == null) return '—';
  const v = senYen * 1000;
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}億円`;
  if (v >= 1e4) return `${nf.format(Math.round(v / 1e4))}万円`;
  return `${nf.format(v)}円`;
}
