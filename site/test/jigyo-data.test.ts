// 予算事業をさがすの検索用データ（lib/jigyo-data.ts）。コミットした data/extracted を読む
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { jigyoDataJson, jigyoDataHash, jigyoDataPath, JIGYO_DATA_FALLBACK, type JigyoData } from '../src/lib/jigyo-data.ts';
import { getBudgetProjects, getTorikumiGroups, budgetCardsOf, budgetProjectOf } from '../src/lib/data.ts';
import { ikkatsuGroups, ikkatsuHref, IKKATSU_LATEST } from '../src/lib/plans.ts';

const data = () => JSON.parse(jigyoDataJson()) as JigyoData;
const field = (d: JigyoData, name: string) => d.fields.indexOf(name);

test('予算事業をさがすのデータは、予算事業のページのある予算事業と一括交付金の事後評価の事業をすべて、fields の並びで持ち、名前に中身のハッシュを付けて書き出す', () => {
  const d = data();
  assert.equal(jigyoDataHash(), createHash('sha256').update(jigyoDataJson()).digest('hex').slice(0, 8));
  assert.equal(jigyoDataPath(), `/yosan/jigyo/data-${jigyoDataHash()}.json`);
  for (const r of d.rows) assert.equal(r.length, d.fields.length);
  // 予算事業は予算事業のページへ、一括交付金の事業は施策のページの事業のカードへ
  assert.deepEqual(d.rows.filter((r) => r[0] === 0).map((r) => r[2]), getBudgetProjects().map((p) => p.href));
  assert.deepEqual(d.rows.filter((r) => r[0] === 1).map((r) => r[2]), ikkatsuGroups().map((g) => ikkatsuHref(g) ?? ''));
  assert.deepEqual(d.latest[1], IKKATSU_LATEST);
  // ハッシュの付いた名前は public/_headers でずっとキャッシュし、控えはしない
  const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf-8');
  assert.ok(headers.includes('/yosan/jigyo/data-*.json\n  Cache-Control: public, max-age=31536000, immutable'));
  assert.ok(!headers.includes(`${JIGYO_DATA_FALLBACK}\n`));
});

test('共通の金額の札は、取組のページの予算の箱と同じ比べ方（同じ年度に同じ決算見込額が2つ以上の取組に書かれている）', () => {
  const d = data();
  const [hi, yi, si] = ['href', 'year', 'shared'].map((n) => field(d, n));
  const byHref = new Map(d.rows.filter((r) => r[0] === 0).map((r) => [r[hi], r]));
  const row = (name: string) => byHref.get(budgetProjectOf(name)!.href)!;
  // クリーンエネルギーアイランド推進事業の R7 の決算見込額 2,081万円は5つの取組に同じ額。街路は取組ごとに違う額
  assert.deepEqual(row('クリーンエネルギーアイランド推進事業')[si], [20813, 5]);
  assert.equal(row('沖縄振興公共投資交付金事業費（街路）')[si], null);
  // 取組のページで共通の札が付く予算事業は、その年度が予算事業の最後の報告なら、こちらでも札が付く
  for (const g of getTorikumiGroups()) {
    for (const c of budgetCardsOf(g)) {
      const r = c.project && byHref.get(c.project.href);
      if (r && c.sharedWith > 0 && r[yi] === g.latest.year) assert.ok(r[si], `${g.href} ${c.project!.name}`);
    }
  }
  // 一括交付金の事業には共通の札も取組の数も無い
  assert.ok(d.rows.filter((r) => r[0] === 1).every((r) => r[si] == null));
});

test('キーワードで当たる文字には、予算事業は前の名前と書かれている取組の名前、一括交付金の事業は事業の内容が入る', () => {
  const d = data();
  const [hi, ti] = ['href', 'text'].map((n) => field(d, n));
  const r = d.rows.find((x) => x[hi] === budgetProjectOf('伝統文化活性化事業')!.href)!;
  assert.ok(String(r[ti]).includes('琉球歴史文化芸術興隆事業'));
  assert.ok(String(r[ti]).includes('国立劇場おきなわの伝統芸能県外公演'));
  const ik = d.rows.filter((x) => x[0] === 1);
  assert.ok(ik.filter((x) => String(x[ti]).length > 0).length > ik.length / 2);
});
