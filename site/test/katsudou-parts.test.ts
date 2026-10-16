// 目標・実績が2行以上の活動指標を、行ごとの図と表に分ける（lib/data.ts の activityRuns）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityRuns, getTorikumiGroups, keySlug, type ActivityRun } from '../src/lib/data.ts';

const groupOf = (shisaku: string, slug: string) => getTorikumiGroups().find((g) => g.shisaku.id === shisaku && keySlug(g.key) === slug)!;
const parts = (runs: ActivityRun[], group = 0) => runs.filter((r) => r.group === group);
const year = (run: ActivityRun, y: number) => run.years.find((r) => r.y === y)!;

test('「開催数、参加者数（累計）」は名前を読点で分けた2つの行になり、どちらも図に置ける', () => {
  const ps = parts(activityRuns(groupOf('3-1-a-1', '8c9a8d82')));
  assert.deepEqual(ps.map((p) => [p.part, p.unit, p.chart]), [['経営者向けＤＸセミナーの開催数', '回', true], ['参加者数（累計）', '名', true]]);
  assert.deepEqual(ps.map((p) => year(p, 2024).actual), [3, 206]);
  // 部局票の年度別計画「５回（10回）200名（400名）」も行ごとに分かれる
  assert.deepEqual(ps.map((p) => year(p, 2026).plan_raw), ['５回（10回）', '200名（400名）']);
});

test('計画の欄の頭の文字（北部・西表）が行の札になり、実績からは札を外す', () => {
  const ps = parts(activityRuns(groupOf('1-2-a-1', '97c6fb80')));
  assert.deepEqual(ps.map((p) => p.part), ['北部', '西表']);
  assert.deepEqual(ps.map((p) => [year(p, 2022).plan_raw, year(p, 2022).actual_raw]), [['15項目', '15項目'], ['11項目', '11項目']]);
});

test('合算の行（300件・12回）は落とし、1つの欄にまとめた年度（R7）は値ごとに分ける', () => {
  const ps = parts(activityRuns(groupOf('3-8-c-1', '80717804')));
  assert.deepEqual(ps.map((p) => p.part), ['窓口相談件数', 'セミナーの開催回数（累計）']);
  assert.deepEqual(ps.map((p) => [year(p, 2025).plan_raw, year(p, 2025).actual_raw]), [['300件', '322件'], ['12回', '12回']]);
  assert.deepEqual(ps.map((p) => year(p, 2023).actual), [321, 12]);
});

test('実績の単位が別の行の単位なら、その行の実績とみなす（19地点／１海域 の実績「11地点」）', () => {
  const ps = parts(activityRuns(groupOf('2-9-a-3', '2655f2fa')));
  assert.deepEqual(ps.map((p) => p.part), ['地点', '海域']);
  assert.deepEqual(ps.map((p) => year(p, 2025).actual_raw), ['11地点', '']);
  assert.deepEqual(ps.map((p) => year(p, 2022).actual_raw), ['', '1海域']);
});

test('単位の無い数（18・39）は、そのまとまりの単位（クラス）とみなして図に置く', () => {
  const ps = parts(activityRuns(groupOf('5-2-a-3', 'c2a86986')));
  assert.deepEqual(ps.map((p) => p.part), ['小学校', '中学校', '高等学校', '特別支援学校']);
  assert.deepEqual(ps.map((p) => [year(p, 2024).plan, year(p, 2024).actual]), [[18, 39], [18, 31], [18, 30], [18, 1]]);
  // 部局票の行ごとの達成割合は、その行に付く
  assert.deepEqual(ps.map((p) => year(p, 2024).ach), ['100.0%', '100.0%', '100.0%', '5.6%']);
});

test('数で書かれていない行（給食費無償化の情報収集・検討）は、分けたうえで表だけにする', () => {
  const runs = activityRuns(groupOf('5-2-b-5', '65d90b07'));
  const ps = parts(runs, 1); // R7 は「研修等開催数（累計）」だけの別の活動指標
  assert.deepEqual(ps.map((p) => [p.part, p.chart]), [['研修等開催数（累計）', true], ['給食費無償化に係る情報収集・検討', false]]);
});

test('2行以上の活動指標は全部が行ごとに分かれ、同じ活動指標の行は同じ年度を持つ', () => {
  const bad: string[] = [];
  for (const g of getTorikumiGroups()) {
    const runs = activityRuns(g);
    for (const run of runs) {
      if (run.years.some((y) => /\n/.test(y.plan_raw + y.actual_raw))) bad.push(`${g.href} 改行が残っている`);
      const same = runs.filter((r) => r.group === run.group);
      if (same.some((r) => r.years.map((y) => y.y).join() !== run.years.map((y) => y.y).join())) bad.push(`${g.href} 行で年度が違う`);
      if (same.length > 1 && (new Set(same.map((r) => r.part)).size !== same.length || same.some((r) => !r.part))) bad.push(`${g.href} 行の札 ${same.map((r) => r.part).join('/')}`);
    }
  }
  assert.deepEqual(bad.slice(0, 8), [], `${bad.length} 件`);
});
