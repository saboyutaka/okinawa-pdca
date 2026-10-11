// data/extracted（コミットした抽出結果）を読み、サイトが前提にしていることが成り立つかを確かめる。
// 件数が公表値と合うかは make check で見るので、ここではサイトの側で結び付け・URL・出典が欠けないかを見る
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  load, YEARS, LATEST, nameKey, getShisakuList, getKihonList, getShuyou, shuyouRows, getTorikumiGroups,
  getTorikumi, getSeika, seikaDept, deptHref, sourceLink, activityRuns,
} from '../src/lib/data.ts';
import { getThemes, unthemed } from '../src/lib/themes.ts';
import { planSourceLink, kankoSeikaList } from '../src/lib/plans.ts';

// 当てはまらなかったものを、先頭の数件だけメッセージに出す
const none = <T>(bad: T[], show: (x: T) => string) => assert.deepEqual(bad.slice(0, 5).map(show), [], `${bad.length} 件`);

test('抽出側の名前の key（name_key）と、サイトの nameKey が同じ規則になっている', () => {
  // 年度をまたいだ取組のまとまり・部局票や個別計画との結び付けは、どちらも名前の key で照らし合わせる
  for (const file of ['torikumi', 'bukyoku/torikumi', 'kanko/torikumi', 'kanko/seika', 'ikkatsu/jigyo'] as const) {
    const rows: { name: string; key: string }[] = load(file);
    none(rows.filter((r) => nameKey(r.name) !== r.key), (r) => `${file}: ${r.name} → ${r.key}`);
  }
});

test('施策は施策コードの順に並ぶ（1-1-a-2 の次に 1-1-a-10）', () => {
  const tuple = (id: string) => id.split('-').map((x) => (/^\d+$/.test(x) ? Number(x) : x));
  const ids = getShisakuList().map((s) => s.id);
  const bad = ids.slice(1).filter((id, i) => {
    const [a, b] = [tuple(ids[i]), tuple(id)];
    const k = a.findIndex((x, j) => x !== b[j]);
    return k >= 0 && a[k] > b[k];
  });
  none(bad, (id) => id);
});

test('取組のページの URL が重複しない', () => {
  const hrefs = getTorikumiGroups().map((g) => g.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
});

test('どの施策も、いずれかのくらしのテーマに入る', () => {
  none(unthemed(), (s) => `${s.id} ${s.name}`);
});

test('くらしのテーマの include・exclude の施策 ID が実在する', () => {
  const ids = new Set(getShisakuList().map((s) => s.id));
  const themes = getThemes();
  assert.equal(new Set(themes.map((t) => t.id)).size, themes.length, 'テーマの id が重複している');
  none(themes.flatMap((t) => [...t.include, ...t.exclude].filter((id) => !ids.has(id)).map((id) => `${t.id}: ${id}`)), (x) => x);
});

test('沖縄県PDCA の抽出結果は、どの行も出典（県の PDF のページ）にたどれる', () => {
  for (const file of ['shisaku', 'kihon', 'torikumi', 'seika', 'shuyou', 'bukyoku/torikumi'] as const) {
    const rows: { source: string; page: number }[] = load(file);
    none(rows.filter((r) => !r.page || !sourceLink(r.source, r.page)), (r) => `${file}: ${r.source} p.${r.page}`);
  }
});

test('個別計画などの抽出結果も、どの行も出典にたどれる', () => {
  for (const file of ['kanko/shisaku', 'kanko/torikumi', 'kanko/seika', 'ikkatsu/jigyo', 'hyoka/kihon'] as const) {
    const kind = file.split('/')[0] as 'kanko' | 'ikkatsu' | 'hyoka';
    const rows: { source: string; page: number }[] = load(file);
    none(rows.filter((r) => !r.page || !planSourceLink(kind, r.source, r.page)), (r) => `${file}: ${r.source} p.${r.page}`);
  }
});

test('最新の年度の取組・成果指標の部局には、どれも部局のページがある', () => {
  const depts = new Set([
    ...getTorikumi(LATEST).map((t) => t.dept),
    ...getSeika(LATEST).map(seikaDept),
    ...getTorikumiGroups().map((g) => g.dept),
  ]);
  none([...depts].filter((d) => !deptHref(d)), (d) => d || '（空）');
});

test('主要指標を年度をまたいでまとめても、行が落ちたり2回出たりしない', () => {
  for (const k of getKihonList()) {
    const used = shuyouRows(k.id).flatMap((g) => Object.values(g.years));
    assert.equal(new Set(used).size, used.length, `${k.id}: 2回出た行がある`);
    assert.equal(used.length, getShuyou(k.id).length, `${k.id}: 落ちた行がある`);
  }
});

test('取組の4年間の進捗状況は、報告の年度の順に並ぶ', () => {
  for (const g of getTorikumiGroups()) {
    assert.equal(g.statuses.length, YEARS.length);
    assert.deepEqual(g.statuses.map(Boolean), YEARS.map((y) => Boolean(g.years[y])), g.href);
  }
});

test('取組の活動指標のまとまりは、報告の年度を1回ずつ含み、この先の年度の計画は最新の報告にある取組のいまの活動指標にだけ付く', () => {
  const bad: string[] = [];
  for (const g of getTorikumiGroups()) {
    const runs = activityRuns(g);
    // 新しい活動指標が先なので、まとまりを古い順に並べ直すと報告の年度の順になる
    const reported = [...runs].reverse().flatMap((r) => r.years.filter((y) => !y.future).map((y) => y.y));
    if (reported.join() !== YEARS.filter((y) => g.years[y]).join()) bad.push(`${g.href} 年度 ${reported.join()}`);
    const future = runs.flatMap((r, i) => r.years.filter((y) => y.future).map((y) => ({ i, y: y.y })));
    if (future.some((f) => f.i > 0 || f.y <= LATEST || g.latest.year !== LATEST)) bad.push(`${g.href} この先の年度 ${future.map((f) => f.y).join()}`);
    // 図に置く値は、まとまりの単位でそろっている（単位の違う値は null）
    if (runs.some((r) => r.chart !== r.years.some((y) => y.actual != null))) bad.push(`${g.href} 図の有無`);
  }
  none(bad, (x) => x);
});

test('観光ロードマップの成果指標は、後退・横ばいを先に並べる', () => {
  const order = ['後退', '横ばい', 'その他', '前進'];
  const ranks = kankoSeikaList().map((r) => order.indexOf(r.judgement));
  assert.ok(!ranks.includes(-1), '知らない達成状況がある');
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});
