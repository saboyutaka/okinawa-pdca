// data/extracted（コミットした抽出結果）を読み、サイトが前提にしていることが成り立つかを確かめる。
// 件数が公表値と合うかは make check で見るので、ここではサイトの側で結び付け・URL・出典が欠けないかを見る
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  load, YEARS, LATEST, nameKey, getShisakuList, getKihonList, getShuyou, shuyouRows, getTorikumiGroups,
  getTorikumi, getSeika, seikaDept, deptHref, sectionHref, deptSourcePages, shisakuDepts, DEPTS, sourceLink, activityRuns,
  amountEntries, budgetGroups, judgeByGrid,
} from '../src/lib/data.ts';
import { getThemes, unthemed } from '../src/lib/themes.ts';
import { themeIconSvg } from '../src/lib/icons.ts';
import {
  planSourceLink, kankoSeikaList, kankoShisakuList, RM_JUDGEMENTS, IKKATSU_LATEST, ikkatsuGroups, ikkatsuOf, ikkatsuHref, ikkatsuAnchor, ikkatsuDept,
} from '../src/lib/plans.ts';

// 当てはまらなかったものを、先頭の数件だけメッセージに出す
const none = <T>(bad: T[], show: (x: T) => string) => assert.deepEqual(bad.slice(0, 5).map(show), [], `${bad.length} 件`);

test('抽出側の名前の key（name_key）と、サイトの nameKey が同じ規則になっている', () => {
  // 年度をまたいだ取組のまとまり・部局票や個別計画との結び付けは、どちらも名前の key で照らし合わせる
  for (const file of ['torikumi', 'bukyoku/torikumi', 'kanko/torikumi', 'kanko/seika', 'ikkatsu/jigyo'] as const) {
    const rows: { name: string; key: string }[] = load(file);
    none(rows.filter((r) => nameKey(r.name) !== r.key), (r) => `${file}: ${r.name} → ${r.key}`);
  }
});

test('施策総括表に印字された判定（A〜G）は、取組の内訳と成果指標の達成率から区分表で計算したものと同じ', () => {
  // 判定・「主な取組数」の内訳・達成率の読み取りが互いに矛盾しないことの確かめ（区分表のマスの置き方の確かめにもなる）。
  // 成果指標が2つ以上ある施策は達成率を平均する（施策総括表の印字はこの平均と合う。概要版の件数は100%で頭打ちにした平均とみられ、少しずれる）
  const bad: string[] = [];
  for (const s of load('shisaku')) {
    if (!s.judge || !s.summary_counts) continue;
    const n = Object.values(s.summary_counts).reduce((a, b) => a + b, 0);
    const rates = load('seika').filter((x) => x.year === s.year && x.shisaku_id === s.id)
      .map((x) => (x.rate != null ? x.rate : x.rate_raw === '達成' ? 100 : x.rate_raw === '未達成' ? 0 : null)).filter((v): v is number => v != null);
    if (!n || !rates.length) continue;
    const k = judgeByGrid((100 * (s.summary_counts['順調'] || 0)) / n, rates.reduce((a, b) => a + b, 0) / rates.length);
    if (k !== s.judge) bad.push(`${s.year} ${s.id}: 印字 ${s.judge}・計算 ${k}`);
  }
  none(bad, (x) => x);
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

test('くらしのテーマの決め方の言葉に、正規表現の記号が残らない', () => {
  // テーマのページに「〇〇」「〇〇」のどれかを含む施策、と出す
  none(getThemes().flatMap((t) => t.words.filter((w) => !w || /[()[\]?*+.\\^$]/.test(w)).map((w) => `${t.id}: ${w}`)), (x) => x);
});

test('どのくらしのテーマにもアイコンがある', () => {
  // アイコンは lib/icons.ts の THEME_ICONS。テーマを足したらここにも足す
  none(getThemes().filter((t) => !/<(path|circle|rect)/.test(themeIconSvg(t.id))), (t) => `${t.id} ${t.label}`);
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

test('最新の年度の取組の所管部課は、部局のページの課ごとの図に行がある', () => {
  // 取組のページの「所管」のリンクは、部局のページのその課の行へ飛ぶ。部局のページの課の行は、最新の年度の取組の所管部課で作る
  none(getTorikumi(LATEST).filter((t) => !sectionHref(t.section)?.includes('#') || deptHref(t.section) !== deptHref(t.dept)), (t) => `${t.shisaku_id} ${t.name}: ${t.section}（${t.dept}）`);
});

test('施策にかかわる部局（関係部等と取組の部局）には、どれも部局のページがある', () => {
  // 部局のページの施策の一覧と、施策をさがすの部局の絞り込みは、shisakuDepts で同じように数える
  none(getShisakuList().flatMap((s) => shisakuDepts(s).filter((d) => !deptHref(d.dept)).map((d) => `${s.id}: ${d.dept}`)), (x) => x);
});

test('どの部局のページにも、出典の検証票のページがある', () => {
  none(DEPTS.filter((d) => !deptSourcePages(d.name).length), (d) => d.name);
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

test('観光ロードマップの成果指標の一覧は、良い・悪いで並べ替えず報告書の順（施策の順）に並べる', () => {
  const order = kankoShisakuList().map((s) => s.id);
  const rows = kankoSeikaList();
  none(rows.filter((r) => !RM_JUDGEMENTS.some((j) => j.key === r.judgement)), (r) => `${r.x.name}: 知らない達成状況 ${r.judgement}`);
  const ranks = rows.map((r) => order.indexOf(r.rm.id));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
});

test('予算事業ごとにまとめても、決算見込額の合計は変わらない', () => {
  const total = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0));
  const groups = budgetGroups(LATEST);
  assert.equal(total(groups.map((g) => g.estimate)), total(amountEntries(LATEST, 'estimate').map((e) => e.amount)));
  assert.equal(new Set(groups.map((g) => g.key)).size, groups.length, '同じ予算事業が2行ある');
  none(groups.filter((g) => !g.related.length), (g) => `${g.name}: 書かれている取組が無い`);
});

test('一括交付金の事業は、どれも施策のページの事業のカードにたどれる', () => {
  const groups = ikkatsuGroups();
  const anchors = groups.map((g) => ikkatsuAnchor(g.key));
  assert.equal(new Set(anchors).size, anchors.length, '事業のカードの id が重複している');
  // 施策のコードが決まらない事業（R5 の1件）だけは行き先が無い
  const bad = groups.filter((g) => {
    const href = ikkatsuHref(g);
    if (!href) return Object.values(g.years).some((r) => r.shisaku_ids.length);
    const sid = href.match(/^\/shisaku\/([^/]+)\//)![1];
    return !ikkatsuOf(sid).some((x) => x.key === g.key);
  });
  none(bad, (g) => g.latest.name);
});

test('最新の年度の一括交付金の事業の担当部局には、どれも部局のページがある', () => {
  // R4 で終わった事業には、R5 の再編の前の部局（保健医療部など）のものがある
  const latest = ikkatsuGroups().filter((g) => g.years[IKKATSU_LATEST]);
  none(latest.filter((g) => g.latest.dept && !deptHref(ikkatsuDept(g.latest.dept))), (g) => `${g.latest.name}: ${g.latest.dept}`);
});
