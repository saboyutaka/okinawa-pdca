// 年度の書き方と実施計画の期間。年度は報告の対象年度の西暦（2025 は令和7年度）。
// ビルドとブラウザのスクリプト（scripts/charts.ts など）の両方で読み込むので、ほかのファイルを import しない（ビルドの lib とページは lib/data.ts からも読める）
export const yearLabel = (y: number) => `R${y - 2018}`;
export const yearLong = (y: number) => `令和${y - 2018}年度`;
// 年度の範囲の文章での書き方（「令和4〜6年度」。1年なら「令和7年度」）。表・図・札は yearLabel で「R4〜R6」
export const yearsLong = (from: number, to = from) => (from === to ? yearLong(from) : `令和${from - 2018}〜${to - 2018}年度`);

// R4〜R6 は前期実施計画（目標年度R6）、R7からは中期実施計画（目標年度R9）。基準値・目標値が切り替わる
export const PLAN_PERIODS = [[2022, 2023, 2024], [2025, 2026, 2027]];
const former = (y: number) => y <= 2024;
export const periodName = (y: number) => (former(y) ? '前期' : '中期');
// 図の帯の見出しと表の列の分け方（「前期（R4〜R6）」）
export const periodLabel = (y: number) => `${periodName(y)}（${former(y) ? 'R4〜R6' : 'R7〜R9'}）`;
export const planLabel = (y: number) => `${periodName(y)}実施計画（${former(y) ? 'R4〜R6' : 'R7〜R9'}）`;
// 成果指標の計画値の欄は計画期間の3年分が並ぶ。その年度の計画値が何番目か（scripts/check_extracted.py の plan_index と同じ）
export const planIndex = (y: number) => (former(y) ? y - 2022 : y - 2025);
