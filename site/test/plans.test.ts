// lib/plans.ts の、データを読まずに決まる関数（一括交付金の事後評価の区分・部局・カードの id）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRADES, gradeOf, isShort, ikkatsuDept, ikkatsuAnchor, ikkatsuStamps, IKKATSU_YEARS } from '../src/lib/plans.ts';
import type { YearGroup } from '../src/lib/data.ts';
import type { IkkatsuJigyoRow } from '../src/lib/types.ts';

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
