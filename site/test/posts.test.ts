// X の公式アカウントで紹介する主な取組の投稿文と順番（lib/posts.ts）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { X_MAX, didCandidates, hearsay, indicatorTopic, postGroups, postOrder, postText, xLength } from '../src/lib/posts.ts';
import { LATEST, getTorikumiGroups, statusOf } from '../src/lib/data.ts';
import { SITE } from '../src/lib/links.ts';

test('X の文字数は日本語を2、ラテン文字を1、URL を長さによらず23と数える', () => {
  assert.equal(xLength('abc'), 3);
  assert.equal(xLength('沖縄'), 4);
  assert.equal(xLength('「順調」。'), 10);
  assert.equal(xLength(`見る\n${SITE.url}torikumi/1-1-a-1/0123abcd/`), 4 + 1 + 23);
});

test('県の活動概要の文を「〜したみたい」にする', () => {
  assert.equal(hearsay('研修会を5回開催した。'), '研修会を5回開催したみたい');
  assert.equal(hearsay('パネル展を実施'), 'パネル展を実施したみたい');
  assert.equal(hearsay('モニタリング調査を行う。'), 'モニタリング調査を行うみたい');
  assert.equal(hearsay('対面サービスを提供します。'), '対面サービスを提供するみたい');
  assert.equal(hearsay('生産地案内ツアーを開催した（各1回）。'), '生産地案内ツアーを開催したみたい（各1回）');
  assert.equal(hearsay('研修事業を実施した.'), '研修事業を実施したみたい');
});

test('やったことは初めの1文と、頭の目的を省いたもの、それぞれを動作の区切りで切って「〜した」の形にしたもの（長い順）', () => {
  assert.deepEqual(didCandidates('課題別の3グループを構成し、意見交換を行った。研修を開催した。'), ['課題別の3グループを構成し、意見交換を行った', '課題別の3グループを構成した']);
  assert.deepEqual(didCandidates('居場所を設置して、相談支援を行い、交流会を開催した。'), ['居場所を設置して、相談支援を行い、交流会を開催した', '居場所を設置して、相談支援を行った', '居場所を設置した']);
  assert.deepEqual(didCandidates('導入拡大のため、事業者と広く協議した。'), ['導入拡大のため、事業者と広く協議した', '事業者と広く協議した']);
  assert.deepEqual(didCandidates('認定を行い、啓発を行った。'), ['認定を行い、啓発を行った', '認定を行った']);
  assert.deepEqual(didCandidates('データを収集・掲載するとともに、活用を促した。'), ['データを収集・掲載するとともに、活用を促した', 'データを収集・掲載した']);
  assert.deepEqual(didCandidates('居場所を設置し（北部、那覇市）、相談に応じた。'), ['居場所を設置し（北部、那覇市）、相談に応じた', '居場所を設置した']);
  assert.deepEqual(didCandidates('事業者に対し、実証を支援した。'), ['事業者に対し、実証を支援した']);
  assert.deepEqual(didCandidates('国外への貢献として、研修員を受け入れた。'), ['国外への貢献として、研修員を受け入れた']);
  assert.deepEqual(didCandidates('経営者を対象とし、研修を行った。'), ['経営者を対象とし、研修を行った', '経営者を対象とした']);
  assert.deepEqual(didCandidates(''), []);
});

test('活動指標の名前は、終わりの数え方を除いて主語にし、終わりのかっこは計画と実績の後ろに回す', () => {
  assert.deepEqual(indicatorTopic('パネル展の開催箇所数（累計）'), { topic: 'パネル展の開催', note: '（累計）' });
  assert.deepEqual(indicatorTopic('プレイヤーとなる事業者、関係団体等との協議回数（累計）'), { topic: 'プレイヤーとなる事業者、関係団体等との協議', note: '（累計）' });
  assert.deepEqual(indicatorTopic('追加刻銘者数'), { topic: '追加刻銘', note: '' });
  assert.deepEqual(indicatorTopic('派遣児童・生徒数（累計）'), { topic: '派遣児童・生徒', note: '（累計）' });
  assert.deepEqual(indicatorTopic('学校数'), { topic: '学校', note: '' });
  assert.deepEqual(indicatorTopic('整備率'), { topic: '整備率', note: '' });
  // 数え方を除くと1字しか残らないものは、そのまま
  assert.deepEqual(indicatorTopic('件数'), { topic: '件数', note: '' });
});

const groups = postGroups(getTorikumiGroups());
const order = postOrder(groups);

test('紹介するのは最新の年度の報告にある取組で、再掲は1回だけ', () => {
  assert.ok(groups.every((g) => g.latest.year === LATEST));
  assert.equal(new Set(groups.map((g) => g.key)).size, groups.length);
});

test('順番はランダムで、作り直しても同じ。取組を除いてもほかの取組の前後は変わらない', () => {
  assert.equal(new Set(order).size, groups.length);
  assert.deepEqual(postOrder(groups), order);
  assert.notDeepEqual(order.map((g) => g.href), groups.map((g) => g.href));
  const rest = groups.slice(1);
  assert.deepEqual(postOrder(rest), order.filter((g) => g !== groups[0]));
});

test('投稿文は X の上限に収まり、取組名・進捗状況・ページの URL を省かない', () => {
  for (const g of groups) {
    const text = postText(g);
    assert.ok(xLength(text) <= X_MAX, `${g.href} ${xLength(text)}`);
    assert.ok(text.includes(`「${g.latest.name}」`), g.href);
    const st = statusOf(g.latest);
    assert.ok(text.includes(st === '記載なし' ? '報告書に書かれていない' : `「${st}」`), g.href);
    assert.ok(text.includes(new URL(g.href, SITE.url).href), g.href);
  }
});
