// 取組をさがすの検索用データ（lib/search-data.ts）。コミットした data/extracted を読む
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  searchDataJson, searchDataHash, searchDataPath, SEARCH_DATA_FALLBACK,
  searchSummaryJson, searchSummaryHash, searchSummaryPath, SEARCH_SUMMARY_FALLBACK,
  type SearchData, type SearchSummary,
} from '../src/lib/search-data.ts';
import { getTorikumiGroups, relatedOf } from '../src/lib/data.ts';
import { treeDataPath, TREE_DATA_FALLBACK } from '../src/lib/tree-data.ts';

const sha8 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 8);
const data = () => JSON.parse(searchDataJson()) as SearchData;
const summary = () => JSON.parse(searchSummaryJson()) as SearchSummary;

test('書き出す場所の名前は、中身の SHA-256 の先頭8桁（やったことは rows の中身）', () => {
  assert.equal(searchDataHash(), sha8(searchDataJson()));
  assert.equal(searchDataPath(), `/torikumi/data-${searchDataHash()}.json`);
  assert.equal(searchSummaryHash(), sha8(JSON.stringify(summary().rows)));
  assert.equal(summary().hash, searchSummaryHash());
  assert.equal(searchSummaryPath(), `/torikumi/summary-${searchSummaryHash()}.json`);
});

// public/_headers の、ずっとキャッシュする（immutable）ルールのパス
function immutableRules() {
  const rules: RegExp[] = [];
  let path = '';
  for (const line of readFileSync(new URL('../public/_headers', import.meta.url), 'utf-8').split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    if (!/^\s/.test(line)) path = line.trim();
    else if (/^\s*Cache-Control:.*immutable/.test(line)) rules.push(new RegExp(`^${path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`));
  }
  return rules;
}

test('ハッシュの付いた名前は public/_headers のずっとキャッシュするルールに当たり、控えは当たらない', () => {
  const rules = immutableRules();
  for (const p of [searchDataPath(), searchSummaryPath(), treeDataPath()]) assert.ok(rules.some((r) => r.test(p)), p);
  for (const p of [SEARCH_DATA_FALLBACK, SEARCH_SUMMARY_FALLBACK, TREE_DATA_FALLBACK]) assert.ok(!rules.some((r) => r.test(p)), p);
});

test('JSON はすべての取組を、fields の並びで持つ', () => {
  const d = data();
  assert.equal(d.rows.length, getTorikumiGroups().length);
  for (const r of d.rows) assert.equal(r.length, d.fields.length);
});

test('ほかの取組とのつながり（links）は、取組のページの頭に出るもの（relatedOf）と同じ', () => {
  const d = data();
  const groups = getTorikumiGroups();
  const li = d.fields.indexOf('links');
  d.rows.forEach((r, i) => {
    const rel = relatedOf(groups[i]);
    assert.deepEqual(r[li], (['before', 'after', 'repost'] as const).filter((k) => rel[k].length > 0), groups[i].href);
  });
  for (const k of ['before', 'after', 'repost']) assert.ok(d.rows.some((r) => (r[li] as string[]).includes(k)), k);
});

test('やったことは data の行と同じ並びで、data が同じ版のやったことの hash を持つ', () => {
  const d = data();
  const s = summary();
  assert.equal(d.summary, s.hash);
  assert.equal(s.rows.length, d.rows.length);
  const groups = getTorikumiGroups();
  s.rows.forEach((text, i) => {
    assert.equal(d.rows[i][9], groups[i].href);
    assert.equal(text, groups[i].latest.summary || '');
  });
  assert.ok(s.rows.filter(Boolean).length > s.rows.length / 2, 'やったことのある取組が半分より少ない');
});
