// 県民意見募集の受付の状態と日付の書き方（lib/iken.js）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOSHU, BOSHU_PAST, boshuState, dayText, periodText, shareText, shortName } from '../src/lib/iken.ts';

const b = { start: '2026-09-04', end: '2026-10-04' };

test('boshuState: 日本時間の初日の0時から最終日の23時59分59秒までが受付中', () => {
  assert.equal(boshuState(b, new Date('2026-09-03T23:59:59+09:00')), 'before');
  assert.equal(boshuState(b, new Date('2026-09-04T00:00:00+09:00')), 'open');
  assert.equal(boshuState(b, new Date('2026-10-04T23:59:59+09:00')), 'open');
  assert.equal(boshuState(b, new Date('2026-10-05T00:00:00+09:00')), 'closed');
});

test('boshuState: 世界時で見ると前の日でも、日本時間で初日なら受付中', () => {
  assert.equal(boshuState(b, new Date('2026-09-03T15:00:00Z')), 'open');
  assert.equal(boshuState(b, new Date('2026-10-04T15:00:00Z')), 'closed');
});

test('dayText: 西暦・令和・曜日を付ける', () => {
  assert.equal(dayText('2026-09-04'), '2026年（令和8年）9月4日（金）');
  assert.equal(dayText('2026-10-04', false), '10月4日（日）');
});

test('periodText: 終わりの日の年は、始まりと同じ年なら書かない', () => {
  assert.equal(periodText(b), '2026年（令和8年）9月4日（金）〜10月4日（日）');
  assert.equal(periodText({ start: '2025-12-20', end: '2026-01-10' }), '2025年（令和7年）12月20日（土）〜2026年（令和8年）1月10日（土）');
});

test('shortName: 長い名前は途中で切って … を付ける（全体で max 字）', () => {
  assert.equal(shortName('あ'.repeat(40)), 'あ'.repeat(40));
  assert.equal(shortName('あ'.repeat(41)), `${'あ'.repeat(39)}…`);
  assert.equal(shortName('あいうえお', 4), 'あいう…');
});

test('BOSHU: いちばん新しい募集が、これまでの募集の一覧の最後と同じ', () => {
  const last = BOSHU_PAST.at(-1);
  assert.deepEqual({ year: BOSHU.year, start: BOSHU.start, end: BOSHU.end }, last);
  for (const x of BOSHU_PAST) assert.ok(x.start <= x.end, `${x.year} の募集の期間`);
});

test('shareText: 種類と名前から投稿の本文を作り、サイトの名前を添える（長い名前は shortName で切る）', () => {
  assert.equal(shareText('主要指標', '二酸化炭素排出量'), '主要指標「二酸化炭素排出量」 | おきなわ、みらい、いま');
  assert.equal(shareText('部局', 'あ'.repeat(41)), `部局「${'あ'.repeat(39)}…」 | おきなわ、みらい、いま`);
});
