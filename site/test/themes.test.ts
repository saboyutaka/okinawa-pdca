// くらしのテーマ（lib/themes.ts）の関数を、作った値で確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchWords } from '../src/lib/themes.ts';

test('決め方の言葉は、先読み・後読みを除いて | で分ける', () => {
  assert.deepEqual(matchWords('子ども|児童(?!生徒)'), ['子ども', '児童']);
  assert.deepEqual(matchWords('(?<![多異])文化|歴史'), ['文化', '歴史']);
  assert.deepEqual(matchWords('物流|(?<!緊急)輸送(?!機能|力)'), ['物流', '輸送']);
});
