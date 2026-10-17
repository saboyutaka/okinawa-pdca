// lib/plans.ts の、データを読まずに決まる関数（一括交付金の事後評価の区分・部局・カードの id）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRADES, gradeOf, isShort, ikkatsuDept, ikkatsuAnchor, ikkatsuStamps, IKKATSU_YEARS, countGrades, countRmJudgements, RM_JUDGEMENTS, rmLatestIndex } from '../src/lib/plans.ts';
import type { YearGroup } from '../src/lib/data.ts';
import type { IkkatsuJigyoRow, KankoSeikaRow } from '../src/lib/types.ts';

test('事後評価の区分: 目標に届かなかったのは △一部達成・未達成', () => {
  assert.deepEqual(GRADES.map((x) => x.key), ['達成', '概ね達成', '一部達成', '未達成']);
  assert.deepEqual(GRADES.map((x) => isShort(x.key)), [false, false, true, true]);
  assert.equal(isShort(''), false);
  assert.equal(gradeOf('概ね達成')?.mark, '○');
  assert.equal(gradeOf(''), undefined);
});

test('ikkatsuDept: 担当部課から部局を取り、教育委員会は教育庁にそろえる', () => {
  assert.equal(ikkatsuDept('商工労働部 ものづくり振興課'), '商工労働部');
  assert.equal(ikkatsuDept('総務部総務私学課'), '総務部');
  assert.equal(ikkatsuDept('教育委員会 文化財課'), '教育庁');
  assert.equal(ikkatsuDept('教育委員会 教育支援課総務部'), '教育庁');
  assert.equal(ikkatsuDept(''), '');
});

test('ikkatsuAnchor: 事業のカードの id は名前の key から決まる', () => {
  assert.match(ikkatsuAnchor('沖縄型森林環境保全事業'), /^ik-[0-9a-f]{8}$/);
  assert.equal(ikkatsuAnchor('a'), ikkatsuAnchor('a'));
  assert.notEqual(ikkatsuAnchor('a'), ikkatsuAnchor('b'));
});

test('ikkatsuStamps: 年度ごとの評価。評価の無い年度・報告の無い年度は空の印', () => {
  const row = (year: number, grade_label: string) => ({ year, grade_label }) as IkkatsuJigyoRow;
  const g: YearGroup<IkkatsuJigyoRow> = { key: 'x', latest: row(2024, '未達成'), years: { 2023: row(2023, ''), 2024: row(2024, '未達成') } };
  const st = ikkatsuStamps(g);
  assert.deepEqual(st.map((x) => x.year), IKKATSU_YEARS);
  assert.deepEqual(st.map((x) => x.text), ['—', '評価なし', '未 未達成']);
  assert.deepEqual(st.map((x) => x.tone), [null, null, 'critical']);
});

test('countGrades・countRmJudgements: 区分の並びのまま数え、評価・判定の無いものは「なし」「その他」', () => {
  assert.deepEqual(countGrades([{ g: '達成' }, { g: '' }, { g: '未達成' }], (x) => x.g), { 達成: 1, 概ね達成: 0, 一部達成: 0, 未達成: 1, なし: 1 });
  const rm = countRmJudgements([{ judgement: '前進' }, { judgement: '' }]);
  assert.deepEqual(Object.keys(rm), RM_JUDGEMENTS.map((j) => j.key));
  assert.equal(rm['前進'], 1);
  assert.equal(rm['その他'], 1);
});

test('rmLatestIndex: 観光ロードマップの成果指標の最新の実績値は、実績値の欄のうち最後に値があるもの', () => {
  const row = (actual_raw: string[]) => ({ actual_raw }) as KankoSeikaRow;
  assert.equal(rmLatestIndex(row(['10', '12', '15'])), 2);
  assert.equal(rmLatestIndex(row(['10', '12', '―'])), 1);
  assert.equal(rmLatestIndex(row(['10', ' ‐ ', 'ー'])), 0);
  assert.equal(rmLatestIndex(row(['', '－', '―'])), -1);
});
