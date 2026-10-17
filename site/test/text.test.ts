// PDF から読んだ文章の整形（lib/text.js）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oneLine, isBlankCell, joinLines, sections, proseBlocks, firstSentence } from '../src/lib/text.ts';

// 21字（joinLines は20字以下の行を見出しとみなして改行を残す）
const LONG = 'あいうえおかきくけこさしすせそたちつてと、';

test('oneLine: 表の値の改行を空白にする。空なら —', () => {
  assert.equal(oneLine('1,032万t-CO₂\n（R3年度）'), '1,032万t-CO₂ （R3年度）');
  assert.equal(oneLine('a \n  b'), 'a b');
  assert.equal(oneLine(''), '—');
  assert.equal(oneLine(null), '—');
});

test('isBlankCell: 空白と「-」「―」などだけの欄は空', () => {
  for (const v of ['', ' ', '―', '－', ' - ', '—\n‐']) assert.equal(isBlankCell(v), true, v);
  for (const v of ['0', '３回', '―件']) assert.equal(isBlankCell(v), false, v);
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

test('proseBlocks: 分析の分け方と丸数字の項目を小見出しにし、続く文章の行はまとめる', () => {
  assert.deepEqual(proseBlocks('外部環境の分析\n④社会・経済情勢の変化\n・一つ目。\n・二つ目。\n改善余地の検証等\n⑦その他内部要因\n・三つ目。'), [
    { kind: 'group', text: '外部環境の分析' },
    { kind: 'factor', text: '④社会・経済情勢の変化' },
    { kind: 'text', text: '・一つ目。\n・二つ目。' },
    { kind: 'group', text: '改善余地の検証等' },
    { kind: 'factor', text: '⑦その他内部要因' },
    { kind: 'text', text: '・三つ目。' },
  ]);
});

test('proseBlocks: 丸数字で始まっても、句点のある行・長い行は文章のまま', () => {
  assert.deepEqual(proseBlocks('①計画どおり進んだ。'), [{ kind: 'text', text: '①計画どおり進んだ。' }]);
  const long = `②${'あ'.repeat(31)}`;
  assert.deepEqual(proseBlocks(long), [{ kind: 'text', text: long }]);
  assert.deepEqual(proseBlocks('当該施策は順調である。\n⑮その他個別要因(外部要因)'), [
    { kind: 'text', text: '当該施策は順調である。' },
    { kind: 'factor', text: '⑮その他個別要因(外部要因)' },
  ]);
  assert.deepEqual(proseBlocks(''), []);
});

test('firstSentence: 最初の一文。頭の「・」と改行は除く', () => {
  assert.equal(firstSentence('・施策の\n方向です。次の文。'), '施策の方向です。');
  assert.equal(firstSentence('句点の無い文'), '句点の無い文');
  assert.equal(firstSentence(null), '');
});
