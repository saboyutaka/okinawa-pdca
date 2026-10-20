// 予算事業をさがすの検索用データ（lib/jigyo-data.ts）。コミットした data/extracted を読む
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { jigyoDataJson, jigyoDataHash, jigyoDataPath, JIGYO_DATA_FALLBACK, type JigyoData } from '../src/lib/jigyo-data.ts';
import { getBudgetProjects, getTorikumiGroups, budgetCardsOf, budgetProjectOf } from '../src/lib/data.ts';

const data = () => JSON.parse(jigyoDataJson()) as JigyoData;

test('予算事業をさがすのデータは、予算事業のページのある予算事業をすべて、fields の並びで持ち、名前に中身のハッシュを付けて書き出す', () => {
  const d = data();
  assert.equal(jigyoDataHash(), createHash('sha256').update(jigyoDataJson()).digest('hex').slice(0, 8));
  assert.equal(jigyoDataPath(), `/yosan/jigyo/data-${jigyoDataHash()}.json`);
  assert.deepEqual(d.rows.map((r) => r[0]), getBudgetProjects().map((p) => p.slug));
  for (const r of d.rows) assert.equal(r.length, d.fields.length);
  // ハッシュの付いた名前は public/_headers でずっとキャッシュし、控えはしない
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf-8');
  assert.ok(headers.includes('/yosan/jigyo/data-*.json\n  Cache-Control: public, max-age=31536000, immutable'));
  assert.ok(!headers.includes(`${JIGYO_DATA_FALLBACK}\n`));
});

test('共通の金額の札は、取組のページの予算の箱と同じ比べ方（同じ年度に同じ決算見込額が2つ以上の取組に書かれている）', () => {
  const d = data();
  const row = (name: string) => d.rows.find((r) => r[0] === budgetProjectOf(name)!.slug)!;
  // クリーンエネルギーアイランド推進事業の R7 の決算見込額 2,081万円は5つの取組に同じ額。街路は取組ごとに違う額
  assert.deepEqual(row('クリーンエネルギーアイランド推進事業')[9], [20813, 5]);
  assert.equal(row('沖縄振興公共投資交付金事業費（街路）')[9], null);
  // 取組のページで共通の札が付く予算事業は、その年度が予算事業の最後の報告なら、こちらでも札が付く
  const bySlug = new Map(d.rows.map((r) => [r[0], r]));
  for (const g of getTorikumiGroups()) {
    for (const c of budgetCardsOf(g)) {
      const r = c.project && bySlug.get(c.project.slug);
      if (r && c.sharedWith > 0 && r[2] === g.latest.year) assert.ok(r[9], `${g.href} ${c.project!.name}`);
    }
  }
});

test('キーワードで当たる文字には、前の名前と書かれている取組の名前が入る', () => {
  const d = data();
  const r = d.rows.find((x) => x[0] === budgetProjectOf('伝統文化活性化事業')!.slug)!;
  assert.ok(r[11].includes('琉球歴史文化芸術興隆事業'));
  assert.ok(r[11].includes('国立劇場おきなわの伝統芸能県外公演'));
});
