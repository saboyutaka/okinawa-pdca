// SNS のカードの画像（lib/card.ts）とページの頭の数（lib/heads.ts）。data/extracted を読む
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cardChars, cardImage, cardMeta, getCards, phrases, textOf } from '../src/lib/card.ts';
import { cacheFile, pruneCardCache, readCache } from '../src/lib/card-cache.ts';
import { deptHead, futureHead, kihonHead, shisakuHead, themeHead, total } from '../src/lib/heads.ts';
import { DEPTS, LATEST, getKihonList, getSeika, getShisakuList, getShouraizou, getTorikumi, seikaVerdict } from '../src/lib/data.ts';
import { getThemes } from '../src/lib/themes.ts';
import { pagePaths } from '../src/lib/routes.ts';

test('カードの画像のフォントに、カードで使う字が全部入っている（足りなければ make card-font）', () => {
  const have = new Set(fs.readFileSync('src/fonts/card-chars.txt', 'utf-8').replace(/\n$/, ''));
  const missing = [...cardChars()].filter((c) => !have.has(c));
  assert.deepEqual(missing, [], `フォントに無い字: ${missing.join('')}（make card-font で切り出し直す）`);
});

test('施策・基本施策・将来像・くらしのテーマ・部局・主な取組・成果指標のページには、どれもカードがある', () => {
  const kinds = /^\/(shisaku|kihon|future|theme|bukyoku|torikumi|shihyou)\/.+\/$/;
  const pages = pagePaths().filter((p) => kinds.test(p) && p !== '/shihyou/shuyou/');
  const cards = getCards();
  assert.deepEqual(pages.filter((p) => !cards.has(p)), []);
  // ページの無いカードも作らない
  assert.deepEqual([...cards.keys()].filter((p) => !pages.includes(p)), []);
});

test('カードの画像の URL は、ページの URL の末尾の / を .png にして /og の下に置く', () => {
  assert.equal(cardImage('/shisaku/1-1-a-1/'), '/og/shisaku/1-1-a-1.png');
  assert.equal(cardImage('/torikumi/1-1-a-1/0123abcd/'), '/og/torikumi/1-1-a-1/0123abcd.png');
  const images = [...getCards().values()].map((c) => c.image);
  assert.equal(new Set(images).size, images.length);
});

test('og:image の URL には中身のハッシュを付け、カードの無いページは null', () => {
  const s = getShisakuList()[0];
  const m = cardMeta(`/shisaku/${s.id}/`);
  assert.match(m!.image, /^\/og\/shisaku\/[^/]+\.png\?v=[0-9a-f]{8}$/);
  assert.match(m!.alt, new RegExp(s.name));
  // 同じ中身なら同じハッシュ
  assert.equal(cardMeta(`/shisaku/${s.id}/`)!.image, m!.image);
  assert.equal(cardMeta('/about/'), null);
  assert.equal(cardMeta('/shisaku/'), null);
});

test('カードには名前・県の区分の言葉・非公式と作り手が入る', () => {
  const s = getShisakuList().find((x) => x.judges[LATEST] && x.torikumi.some((t) => t.year === LATEST))!;
  const text = textOf(getCards().get(`/shisaku/${s.id}/`)!.node());
  assert.ok(text.includes('（非公式）'));
  assert.ok(text.includes('Code for Okinawa'));
  assert.ok(text.includes(`${s.judges[LATEST]} `));
  for (const part of phrases(s.name)) assert.ok(text.includes(part), part);
  // くらしのテーマは、このサイト独自の分類だと分かるようにする
  const t = getThemes()[0];
  assert.ok(textOf(getCards().get(`/theme/${t.id}/`)!.node()).includes('このサイト独自の分類'));
});

test('名前は文節で区切る（ひらがな・句読点の後ろで、次がひらがなでないところ）', () => {
  assert.deepEqual(phrases('再生可能エネルギー等のクリーンなエネルギーの導入促進'), ['再生可能エネルギー等の', 'クリーンな', 'エネルギーの', '導入促進']);
  assert.deepEqual(phrases('心豊かで、安全・安心に暮らせる島を目指して'), ['心豊かで、', '安全・', '安心に', '暮らせる', '島を', '目指して']);
  // 小さい仮名の後ろでは区切らない
  assert.ok(!phrases('世界に誇れる島しょ型環境モデル地域の形成').some((p) => p.endsWith('しょ')));
  // 区切っても字は変わらない
  for (const s of getShisakuList()) assert.equal(phrases(s.name).join(''), s.name);
});

test('ページの頭の数: 将来像ごとに数えた施策・取組・成果指標を足すと、全体の数になる', () => {
  const fs_ = getShouraizou().map((v) => futureHead(v.id));
  assert.equal(fs_.reduce((a, h) => a + h.shisaku.length, 0), getShisakuList().length);
  assert.equal(fs_.reduce((a, h) => a + total(h.judges), 0), getShisakuList().length);
  assert.equal(fs_.reduce((a, h) => a + total(h.tori), 0), getTorikumi(LATEST).length);
  assert.equal(fs_.reduce((a, h) => a + h.seika, 0), getSeika(LATEST).length);
  const ks = getKihonList().map((k) => kihonHead(k.id));
  assert.equal(ks.reduce((a, h) => a + total(h.tori), 0), getTorikumi(LATEST).length);
});

test('ページの頭の数: 計画値に到達した数は、達成率の内訳の「100%以上」と同じ', () => {
  const heads = [...getShisakuList().map(shisakuHead), ...getThemes().map(themeHead), ...DEPTS.map((d) => deptHead(d.name))];
  for (const h of heads) {
    assert.equal(h.reached, h.rates['100%以上']);
    assert.equal(h.seika, total(h.rates));
  }
});

test('成果指標が計画値に届いたかの文（施策ページのカードと SNS のカードで同じ）', () => {
  const x = { year: 2025, rate: 40.7, rate_raw: '40.7', base: 11.1, actual: 12.2, target: 15.1 };
  assert.deepEqual(seikaVerdict(x), { tone: 'serious', chip: '達成率 40.7%', text: 'R7の計画値にまだ届いていません', down: false });
  assert.equal(seikaVerdict({ ...x, rate: 120, actual: 16 }).text, 'R7の計画値に届き、ゴールの目標値も超えています');
  assert.equal(seikaVerdict({ ...x, rate: -10, actual: 10 }).text, 'スタートの基準値より悪くなっています');
  assert.equal(seikaVerdict({ ...x, rate: null, rate_raw: '達成' }).text, '県の報告書ではR7の計画値を「達成」としています');
  assert.equal(seikaVerdict({ ...x, target: 9 }).down, true);
});

test('カードの画像のキャッシュ: 名前は中身で決まり、ビルドで使わなかった画像だけを消す', () => {
  assert.equal(cacheFile('{"a":1}'), cacheFile('{"a":1}'));
  assert.notEqual(cacheFile('{"a":1}'), cacheFile('{"a":2}'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cards-'));
  const old = new Date(Date.now() - 60_000);
  for (const n of ['used', 'unused', 'drawn']) {
    fs.writeFileSync(path.join(dir, `${n}.png`), n);
    fs.utimesSync(path.join(dir, `${n}.png`), old, old);
  }
  const since = Date.now() - 1000;
  // 前のビルドの画像を使った・新しく描いた
  assert.equal(readCache(path.join(dir, 'used.png'))!.toString(), 'used');
  fs.writeFileSync(path.join(dir, 'drawn.png'), 'drawn');
  assert.deepEqual(pruneCardCache(since, dir), { reused: 1, drawn: 1, removed: 1 });
  assert.deepEqual(fs.readdirSync(dir).sort(), ['drawn.png', 'used.png']);
  assert.equal(readCache(path.join(dir, 'unused.png')), null);
  fs.rmSync(dir, { recursive: true });
});
