// 年の書き方の切り替え（lib/era.ts）。SEIREKI はブラウザで動かす JS の文字列なので、関数にして確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERA_JS, ERA_JS_PATH, SEIREKI } from '../src/lib/era.ts';

const seireki = new Function(`return ${SEIREKI}`)() as (s: string) => string;

test('seireki: 令和・平成・昭和と略した R・H・S を西暦にし、後ろの年度・年はそのまま', () => {
  assert.equal(seireki('令和7年度版'), '2025年度版');
  assert.equal(seireki('R7の判定: B 概ね順調'), '2025の判定: B 概ね順調');
  assert.equal(seireki('R4 順調'), '2022 順調');
  assert.equal(seireki('（R3年）'), '（2021年）');
  assert.equal(seireki('（H29年度）'), '（2017年度）');
  assert.equal(seireki('平成31年'), '2019年');
  assert.equal(seireki('S47～R7までの54年間'), '1972～2025までの54年間');
  assert.equal(seireki('昭和47年'), '1972年');
  assert.equal(seireki('公表は令和8年5月'), '公表は2026年5月');
});

test('seireki: 全角の文字と数字・「元」・空白も読む', () => {
  assert.equal(seireki('Ｒ４年度から'), '2022年度から');
  assert.equal(seireki('令和５年度'), '2023年度');
  assert.equal(seireki('Ｈ２６年度'), '2014年度');
  assert.equal(seireki('（R元年度）'), '（2019年度）');
  assert.equal(seireki('令和元年'), '2019年');
  assert.equal(seireki('（R ２年）'), '（2020年）');
  assert.equal(seireki('平成 28 年'), '2016 年');
});

test('seireki: 日付と、元号の付いた範囲', () => {
  assert.equal(seireki('R7.1.1'), '2025.1.1');
  assert.equal(seireki('(R6.3～R6.6予定)'), '(2024.3～2024.6予定)');
  assert.equal(seireki('R7.11見込値'), '2025.11見込値');
  assert.equal(seireki('計画期間 H30～R13'), '計画期間 2018～2031');
  assert.equal(seireki('R4〜R6・この取組の前'), '2022〜2024・この取組の前');
  assert.equal(seireki('R4・R5・R6・R7: '), '2022・2023・2024・2025: ');
  assert.equal(seireki('令和３年10月～令和 ６年９月'), '2021年10月～2024年９月');
});

test('seireki: 範囲の後ろの元号の無い数も、前の数より大きければ西暦にする', () => {
  assert.equal(seireki('令和4〜7年度'), '2022〜2025年度');
  assert.equal(seireki('令和9～11年度'), '2027～2029年度');
  assert.equal(seireki('令和４年度～６年度'), '2022年度～2024年度');
  assert.equal(seireki('中長期計画（R３～12））'), '中長期計画（2021～2030））');
  assert.equal(seireki('R4－7特許等出願件数'), '2022－2025特許等出願件数');
  assert.equal(seireki('令和4~6年度累計'), '2022~2024年度累計');
  // 前の数より小さいもの・月や日が続くものは範囲と見ない
  assert.equal(seireki('令和5年度-1'), '2023年度-1');
  assert.equal(seireki('R5～8月'), '2023～8月');
});

test('seireki: 西暦と和暦を並べた書き方は西暦だけにする', () => {
  assert.equal(seireki('2026年（令和8年）9月4日（金）'), '2026年9月4日（金）');
  assert.equal(seireki('2022年（令和４年）の'), '2022年の');
  assert.equal(seireki('令和7年度（2025年度）の'), '2025年度の');
});

test('seireki: 年でない英数字はそのまま', () => {
  for (const s of ['認知症高齢者GH36人', 'ＧＨ18人', 'H5N1', '/minato/R06102', 'R4R6年は12月公表', 'CO2', 'Society5.0', '2030年までに']) {
    assert.equal(seireki(s), s);
  }
  // 西暦にしたものをもう一度通しても変わらない（ページを読みながら何度も通すため）
  for (const s of ['令和4〜7年度', 'R7.1.1', 'H30～R13', '2026年（令和8年）9月']) assert.equal(seireki(seireki(s)), seireki(s));
});

test('ERA_JS: ブラウザで読める JS で、名前に中身のハッシュが付く', () => {
  assert.doesNotThrow(() => new Function(ERA_JS));
  // 後読みは古いブラウザで読めず、ERA_JS 全体が動かなくなる
  assert.doesNotMatch(ERA_JS, /\(\?<[=!]/);
  assert.match(ERA_JS_PATH, /^\/era-[0-9a-f]{8}\.js$/);
});
