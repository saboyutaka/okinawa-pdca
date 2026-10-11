// 数・割合・金額の書き方（lib/format.js）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmt, pct, yen } from '../src/lib/format.ts';

test('fmt: 3桁ごとに区切り、値が無ければ —', () => {
  assert.equal(fmt(1234567), '1,234,567');
  assert.equal(fmt(0), '0');
  assert.equal(fmt(null), '—');
  assert.equal(fmt(undefined), '—');
});

test('pct: 小数1桁まで。分母が0なら —', () => {
  assert.equal(pct(1, 3), '33.3%');
  assert.equal(pct(2, 3), '66.7%');
  assert.equal(pct(1, 1), '100.0%');
  assert.equal(pct(0, 5), '0.0%');
  assert.equal(pct(1, 0), '—');
});

test('yen: 千円単位の金額を、億円・万円・円で書く', () => {
  assert.equal(yen(123456), '1.2億円'); // 1億2,345万6千円
  assert.equal(yen(100000), '1.0億円');
  assert.equal(yen(5000), '500万円');
  assert.equal(yen(15), '2万円'); // 1.5万円は四捨五入
  assert.equal(yen(5), '5,000円');
  assert.equal(yen(0), '0円');
  assert.equal(yen(null), '—');
});
