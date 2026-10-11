// 表記ゆれをそろえる・一覧の検索の比べ方（lib/search.ts）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldVariants, searchText, searchWords, matchesAll } from '../src/lib/search.ts';

const hit = (text: string, q: string) => matchesAll(searchText(text), searchWords(q));

test('foldVariants: 「子供」「子ども」は「こども」に、「障がい」「障碍」は「障害」にそろえる', () => {
  assert.equal(foldVariants('沖縄子供の貧困緊急対策事業'), '沖縄こどもの貧困緊急対策事業');
  assert.equal(foldVariants('子どもの貧困問題'), 'こどもの貧困問題');
  assert.equal(foldVariants('障がい者の就労'), '障害者の就労');
  assert.equal(foldVariants('子育て支援'), '子育て支援');
});

test('検索: どの書き方で探しても、ほかの書き方の名前が当たる', () => {
  for (const q of ['子ども', '子供', 'こども']) {
    assert.ok(hit('沖縄子供の貧困緊急対策事業', q), q);
    assert.ok(hit('沖縄こどもの貧困緊急対策事業', q), q);
    assert.ok(hit('子どもの貧困問題に関する普及啓発', q), q);
  }
  assert.ok(hit('障害者の就労支援', '障がい'));
  assert.ok(hit('障がい福祉サービス', '障害'));
});

test('検索: 書かれたままの形でも当たる（「子」で「子ども」も見つかる）', () => {
  assert.ok(hit('子どもの貧困', '子'));
  assert.ok(hit('子供の居場所', '子'));
});

test('検索: 空白で区切った言葉は、すべて含まれるものだけ。全角・半角と英字の大文字・小文字は区別しない', () => {
  assert.ok(hit('子供の貧困対策支援員の配置', '子ども　貧困'));
  assert.ok(!hit('子供の居場所', '子ども 貧困'));
  assert.ok(hit('ＩＣＴを活用した', 'ict'));
  assert.deepEqual(searchWords('  '), []);
});
