// ページの URL と、公開した URL の一覧（urls.txt）・転送（public/_redirects）の確かめ（lib/routes.ts。docs/site.md の 8章）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  REDIRECTS_FILE, URLS_FILE, checkUrls, pageFiles, pagePaths, parseRedirects, parseUrlList, routePath, updateUrlList, urlListText, type Redirect,
} from '../src/lib/routes.ts';
import { getSeikaGroups, getTorikumiGroups } from '../src/lib/data.ts';

test('ページのファイルと params から URL を作る', () => {
  assert.equal(routePath('index'), '/');
  assert.equal(routePath('about'), '/about/');
  assert.equal(routePath('keikaku/kanko/index'), '/keikaku/kanko/');
  assert.equal(routePath('keikaku/kanko/torikumi'), '/keikaku/kanko/torikumi/');
  assert.equal(routePath('torikumi/[shisaku]/[slug]', { shisaku: '1-1-a-1', slug: '0123abcd' }), '/torikumi/1-1-a-1/0123abcd/');
  assert.throws(() => routePath('shisaku/[id]', {}));
});

test('_redirects は1行に1つ。# の行と空行は飛ばし、状態コードの無い行は null', () => {
  const text = '# 説明\n\n/torikumi/1-1-a-1/aaaaaaaa/ /torikumi/1-1-a-1/bbbbbbbb/ 301\n  /a/ /b/\n';
  assert.deepEqual(parseRedirects(text), [
    { from: '/torikumi/1-1-a-1/aaaaaaaa/', to: '/torikumi/1-1-a-1/bbbbbbbb/', status: 301, line: 3 },
    { from: '/a/', to: '/b/', status: null, line: 4 },
  ]);
  assert.deepEqual(parseUrlList(urlListText(['/', '/about/'])), ['/', '/about/']);
});

const r = (from: string, to: string, status: number | null = 301, line = 1): Redirect => ({ from, to, status, line });

test('一覧の URL は、ページか転送があればよい。ページが増えるのはよい', () => {
  const pages = ['/', '/new/', '/extra/'];
  const res = checkUrls(['/', '/old/', '/gone/'], pages, [r('/old/', '/new/')]);
  assert.deepEqual(res.missing, ['/gone/']);
  assert.deepEqual(res.unlisted, ['/new/', '/extra/']);
  assert.deepEqual(res.problems, []);
});

test('転送の書き方の誤りを見つける', () => {
  const pages = ['/', '/a/', '/b/'];
  const bad = (rd: Redirect) => checkUrls([], pages, [rd]).problems.length;
  assert.equal(bad(r('/old/', '/a/', null)), 1); // 302 になる
  assert.equal(bad(r('/old/', '/a/', 302)), 1);
  assert.equal(bad(r('/a/', '/b/')), 1); // 古い URL にページがある（ページが見えなくなる）
  assert.equal(bad(r('/old/', '/nowhere/')), 1); // 行き先が無い
  assert.equal(bad(r('/torikumi/*', '/a/')), 1); // 完全なパスでない
  assert.equal(bad(r('/old', '/a/')), 1); // 末尾の / が無い
  assert.equal(checkUrls([], pages, [r('/old/', '/a/', 301, 1), r('/old/', '/b/', 301, 2)]).problems.length, 1); // 同じ古い URL が2つ
  assert.equal(checkUrls(['about/'], pages, []).problems.length, 1);
});

test('一覧を書き直すとき、消えた URL は残し、prune のときだけページも転送も無いものを消す', () => {
  const listed = ['/', '/gone/', '/old/'];
  const pages = ['/', '/new/'];
  const redirects = [r('/old/', '/new/')];
  assert.deepEqual(updateUrlList(listed, pages, redirects), ['/', '/gone/', '/new/', '/old/']);
  assert.deepEqual(updateUrlList(listed, pages, redirects, true), ['/', '/new/', '/old/']);
});

test('ROUTES と src/pages の動的なページが1対1', () => {
  // ROUTES に無い動的なページを足したり、ページのファイルを消したりすると止まる
  assert.throws(() => pagePaths([...pageFiles(), 'foo/[id]']), /foo\/\[id\]/);
  assert.throws(() => pagePaths(pageFiles().filter((f) => f !== 'shisaku/[id]')), /shisaku\/\[id\]/);
});

test('取組・成果指標のリンク先（href）は、どれもページの URL', () => {
  const paths = new Set(pagePaths());
  const bad = [...getTorikumiGroups(), ...getSeikaGroups()].map((g) => g.href).filter((h) => !paths.has(h));
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} 件`);
});

test('公開した URL の一覧（urls.txt）にある URL は、どれもページか転送（public/_redirects）で開ける', (t) => {
  const read = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '');
  const { missing, unlisted, problems } = checkUrls(parseUrlList(read(URLS_FILE)), pagePaths(), parseRedirects(read(REDIRECTS_FILE)));
  assert.deepEqual(problems, []);
  assert.deepEqual(
    missing.slice(0, 20),
    [],
    `一覧にある ${missing.length} 件の URL のページが無くなった。公開した後なら public/_redirects で新しい URL へ転送し、公開前なら make urls PRUNE=1 で一覧から消す（docs/site.md の 8章）`,
  );
  if (unlisted.length) t.diagnostic(`一覧に無いページが ${unlisted.length} 件ある（make urls で足す）`);
});
