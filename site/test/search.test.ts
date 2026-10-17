// 表記ゆれをそろえる・一覧の検索の比べ方（lib/search.ts）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldVariants, searchText, searchWords, matchesAll, matchRanges, splitMatches } from '../src/lib/search.ts';

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

test('matchRanges: 当たった所を元の文字の位置で返し、重なりはまとめる', () => {
  const mark = (text: string, q: string) => matchRanges(text, searchWords(q)).map(([a, b]) => text.slice(a, b));
  assert.deepEqual(mark('離島の離島振興', '離島'), ['離島', '離島']);
  assert.deepEqual(mark('観光振興', '観光 光振'), ['観光振']);
  // 全角・半角と大文字・小文字をそろえて探し、元の字のまま印を付ける
  assert.deepEqual(mark('ＭａａＳの導入', 'maas'), ['ＭａａＳ']);
  // 表記ゆれ: 「子ども」で探して「こども」に当たる
  assert.deepEqual(mark('こども家庭支援', '子ども'), ['こども']);
  // NFKC で字の数が変わるもの（㎡ → m2）も、元の1字ごと印を付ける
  assert.deepEqual(mark('100㎡以上', 'm2'), ['㎡']);
  assert.deepEqual(mark('観光', '離島'), []);
});

test('splitMatches: 当たった所とそうでない所に順に分ける（言葉が無ければ全部が当たっていない所）', () => {
  assert.deepEqual(splitMatches('離島の離島振興', searchWords('離島')), [
    { text: '', hit: false }, { text: '離島', hit: true }, { text: 'の', hit: false }, { text: '離島', hit: true }, { text: '振興', hit: false },
  ]);
  assert.deepEqual(splitMatches('観光', []), [{ text: '観光', hit: false }]);
});
