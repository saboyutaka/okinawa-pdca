// PDF から読んだ文章の整形（lib/text.js）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oneLine, joinLines, sections, firstSentence } from '../src/lib/text.ts';

// 21字（joinLines は20字以下の行を見出しとみなして改行を残す）
const LONG = 'あいうえおかきくけこさしすせそたちつてと、';

test('oneLine: 表の値の改行を空白にする。空なら —', () => {
  assert.equal(oneLine('1,032万t-CO₂\n（R3年度）'), '1,032万t-CO₂ （R3年度）');
  assert.equal(oneLine('a \n  b'), 'a b');
  assert.equal(oneLine(''), '—');
  assert.equal(oneLine(null), '—');
});

test('joinLines: 文の途中の折り返しはつなぐ', () => {
  assert.equal(joinLines(`${LONG}\nつづき。`), `${LONG}つづき。`);
});

test('joinLines: 文末・箇条の頭・短い行（見出し）の改行は残す', () => {
  assert.equal(joinLines('一つ目の文です。\n二つ目の文です。'), '一つ目の文です。\n二つ目の文です。');
  assert.equal(joinLines(`${LONG}\n・箇条`), `${LONG}\n・箇条`);
  assert.equal(joinLines(`${LONG}\n①番号`), `${LONG}\n①番号`);
  assert.equal(joinLines(`${LONG}\n※注記`), `${LONG}\n※注記`);
  assert.equal(joinLines('短い見出し\n本文'), '短い見出し\n本文');
  assert.equal(joinLines(''), '');
  assert.equal(joinLines(null), '');
});

test('sections: 「[主な取組]」のような行で区切る', () => {
  assert.deepEqual(sections('[主な取組]\n取組の分析。\n[成果指標]\n指標の分析。'), [
    { head: '主な取組', body: '取組の分析。' },
    { head: '成果指標', body: '指標の分析。' },
  ]);
});

test('sections: 最初の見出しより前の文章は見出しなしの節にし、空の節は落とす', () => {
  assert.deepEqual(sections('前書き。\n[主な取組]\n本文。'), [
    { head: null, body: '前書き。' },
    { head: '主な取組', body: '本文。' },
  ]);
  assert.deepEqual(sections('[主な取組]'), [{ head: '主な取組', body: '' }]);
  assert.deepEqual(sections(''), []);
});

test('firstSentence: 最初の一文。頭の「・」と改行は除く', () => {
  assert.equal(firstSentence('・施策の\n方向です。次の文。'), '施策の方向です。');
  assert.equal(firstSentence('句点の無い文'), '句点の無い文');
  assert.equal(firstSentence(null), '');
});
