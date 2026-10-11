// 取組をさがすの検索用データ（lib/search-data.ts）。コミットした data/extracted を読む
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { searchDataJson, searchDataHash, searchDataPath, SEARCH_DATA_FALLBACK, type SearchData } from '../src/lib/search-data.ts';
import { getTorikumiGroups } from '../src/lib/data.ts';

test('書き出す場所の名前は、中身の SHA-256 の先頭8桁', () => {
  const hash = createHash('sha256').update(searchDataJson()).digest('hex').slice(0, 8);
  assert.equal(searchDataHash(), hash);
  assert.equal(searchDataPath(), `/torikumi/data-${hash}.json`);
});

test('ハッシュの付いた名前は public/_headers のずっとキャッシュするルール（/torikumi/data-*.json）に当たり、控えは当たらない', () => {
  const rule = /^\/torikumi\/data-.*\.json$/;
  assert.match(searchDataPath(), rule);
  assert.doesNotMatch(SEARCH_DATA_FALLBACK, rule);
});

test('JSON はすべての取組を、fields の並びで持つ', () => {
  const d = JSON.parse(searchDataJson()) as SearchData;
  assert.equal(d.rows.length, getTorikumiGroups().length);
  for (const r of d.rows) assert.equal(r.length, d.fields.length);
});
