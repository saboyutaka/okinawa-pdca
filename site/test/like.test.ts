// いいねの送り先（lib/like.ts）と、それを受ける Worker（worker/api.ts）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIKE_PATH, likeUrl } from '../src/lib/like.ts';
import worker from '../worker/api.ts';

// 静的なファイルの側の代わり。Worker から戻されたら 404 のページを返したことにする
const env = { ASSETS: { fetch: async () => new Response('404 のページ', { status: 404 }) } };
const req = (path: string, method = 'GET') => new Request(`https://okinawa-miraima.com${path}`, { method });

test('likeUrl: /api/like の page にページのパスをそのまま入れる', () => {
  assert.equal(likeUrl('/shisaku/1-1-a-1/'), '/api/like?page=/shisaku/1-1-a-1/');
  assert.equal(likeUrl('/'), '/api/like?page=/');
  const url = new URL(likeUrl('/kihon/1-1/'), 'https://okinawa-miraima.com');
  assert.equal(url.pathname, LIKE_PATH);
  assert.equal(url.searchParams.get('page'), '/kihon/1-1/');
});

test('Worker: いいねの POST には中身の無い 204 を返す', async () => {
  const res = await worker.fetch(req(likeUrl('/shisaku/1-1-a-1/'), 'POST'), env);
  assert.equal(res.status, 204);
  assert.equal(await res.text(), '');
});

test('Worker: /api/like への POST 以外（クローラーの GET など）は 405', async () => {
  for (const method of ['GET', 'HEAD', 'PUT']) {
    const res = await worker.fetch(req(likeUrl('/shisaku/1-1-a-1/'), method), env);
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get('Allow'), 'POST');
  }
});

test('Worker: /api/like でないリクエストは静的なファイルの側に戻す', async () => {
  for (const [path, method] of [['/no-such-file.png', 'GET'], ['/api/other', 'POST'], ['/api/like/', 'POST']]) {
    const res = await worker.fetch(req(path, method), env);
    assert.equal(res.status, 404, path);
    assert.equal(await res.text(), '404 のページ');
  }
});

test('wrangler.jsonc: /api/ を Worker に先に通す', () => {
  const conf = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(conf, /"main": "\.\/worker\/api\.ts"/);
  assert.match(conf, /"run_worker_first": \["\/api\/\*"\]/);
  assert.match(conf, /"binding": "ASSETS"/);
});
