// SNS のシェアの URL（lib/share.js）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SNS, shareHref } from '../src/lib/share.ts';
import { HASHTAG } from '../src/lib/iken.ts';

const opts = { text: '施策「観光の振興」', url: 'https://example.jp/shisaku/5-5-b-1/' };
const params = (id: string, o: Partial<typeof opts> = opts) => new URL(shareHref(id, o)).searchParams;

test('並びは Facebook・LINE・X・Threads・Bluesky', () => {
  assert.deepEqual(SNS.map((s) => s.id), ['facebook', 'line', 'x', 'threads', 'bluesky']);
});

test('公開の場の X・Threads・Bluesky にだけハッシュタグを付ける', () => {
  for (const id of ['x', 'threads', 'bluesky']) assert.ok(shareHref(id, opts).includes(HASHTAG), id);
  for (const id of ['facebook', 'line']) assert.ok(!shareHref(id, opts).includes(HASHTAG), id);
});

test('Facebook は URL だけを渡す', () => {
  assert.deepEqual([...params('facebook')], [['u', opts.url]]);
});

test('LINE・X・Threads は本文と URL を別の引数で渡す', () => {
  assert.deepEqual([...params('line')], [['url', opts.url], ['text', opts.text]]);
  assert.deepEqual([...params('x')], [['text', opts.text], ['url', opts.url], ['hashtags', HASHTAG]]);
  assert.deepEqual([...params('threads')], [['text', opts.text], ['url', opts.url], ['tag', HASHTAG]]);
});

test('Bluesky は本文・URL・ハッシュタグを改行で区切って本文に入れる', () => {
  assert.equal(params('bluesky').get('text'), `${opts.text}\n${opts.url}\n#${HASHTAG}`);
  assert.equal(params('bluesky', { text: opts.text }).get('text'), `${opts.text}\n#${HASHTAG}`);
});

test('空の引数は URL に入れない', () => {
  assert.deepEqual([...params('x', { text: opts.text })], [['text', opts.text], ['hashtags', HASHTAG]]);
  assert.deepEqual([...params('facebook', {})], []);
});
