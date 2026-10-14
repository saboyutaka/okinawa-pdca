// data/extracted（コミットした抽出結果）を読み、サイトが前提にしていることが成り立つかを確かめる。
// 件数が公表値と合うかは make check で見るので、ここではサイトの側で結び付け・URL・出典が欠けないかを見る
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  load, YEARS, LATEST, nameKey, sameKey, getShisakuList, getKihonList, getShuyou, shuyouRows, shuyouAnchor, getShuyouStatus, SHUYOU_BINS, getTorikumiGroups, getSeikaGroups, torikumiPage, budgetOf,
  getTorikumi, getSeika, trendPoints, seikaDept, deptHref, sectionHref, deptSourcePages, shisakuDepts, DEPTS, sourceLink, activityRuns,
  amountEntries, budgetGroups, judgeByGrid, seikaGroupsOf, seikaNameMatches, torikumiOfSeika, SEIKA_ALIASES, seikaAlias, getShouraizou,
} from '../src/lib/data.ts';
import { getThemes, unthemed, inTheme } from '../src/lib/themes.ts';
import { themeHead, total } from '../src/lib/heads.ts';
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

test('成果指標のページの URL が重複せず、どの成果指標（各年度の行）もどれかのページに入る', () => {
  const groups = getSeikaGroups();
  assert.equal(new Set(groups.map((g) => g.href)).size, groups.length);
  const inGroups = new Set(groups.flatMap((g) => Object.values(g.years)));
  none(load('seika').filter((x) => !inGroups.has(x)), (x) => `${x.year} ${x.shisaku_id} ${x.name}`);
});

test('印字の名前で見分けられない成果指標は、どれも内訳の名前で出し、その名前のほかの年度の指標とまとめる（SEIKA_ALIASES）', () => {
  // 同じ施策の同じ年度に同じ名前の指標が2つ以上ある行は、どれも SEIKA_ALIASES で名前が付く（新しい年度の報告で増えたら、ページの画像で内訳を確かめて足す）
  const rows = load('seika');
  const count = new Map<string, number>();
  for (const x of rows) count.set(`${x.year}|${x.shisaku_id}|${nameKey(x.name)}`, (count.get(`${x.year}|${x.shisaku_id}|${nameKey(x.name)}`) || 0) + 1);
  const twins = rows.filter((x) => count.get(`${x.year}|${x.shisaku_id}|${nameKey(x.name)}`)! > 1);
  none(twins.filter((x) => !seikaAlias(x)), (x) => `${x.year} ${x.shisaku_id} ${x.name}`);
  // 表の名前はどれも使われている（抽出を直して印字の名前が変わったら、ここで分かる）
  const used = new Set(rows.flatMap((x) => seikaAlias(x)?.name ?? []));
  none(SEIKA_ALIASES.flatMap((a) => Object.values(a.names).filter((n) => !used.has(n))), (n) => n);
  // 内訳の名前のページは、内訳の名前で載っている年度とまとまる（R7 の就職内定率は R4〜R6 の（大学）（短大）（専門学校）と）
  const g = getSeikaGroups().filter((x) => x.shisaku.id === '5-3-c-3');
  assert.deepEqual(g.map((x) => [x.name.replace(/^.*の就職内定率/, ''), Object.keys(x.years).join(',')]), [
    ['（大学）', '2022,2023,2024,2025'], ['（短大）', '2022,2023,2024,2025'], ['（専門学校）', '2022,2023,2024,2025'],
  ]);
});

test('部局票の「対応する成果指標」は、その施策のその年度の成果指標すべてに当たる（県は施策の成果指標をまとめて書いている）', () => {
  // 取組ごとに分かれていないので、成果指標のページは施策の取組をまとめて出す（torikumiOfSeika）。
  // 「〜及び〜」「野菜・果樹・花き類の〜」「〜児童生徒の割合」のようにまとめた名前でも、内訳の指標に当たること（seikaNameMatches）。
  // 県が取組ごとに書き分けるようになったら、ここが落ちる。そのときは成果指標のページの取組の出し方を見直す
  const bad = load('bukyoku/torikumi').flatMap((b) =>
    seikaGroupsOf(b.shisaku_id).filter((x) => x.years[b.year] && !seikaNameMatches(b.seika_name, x.years[b.year].name)).map((x) => [b, x] as const));
  none(bad, ([b, x]) => `${b.year} ${b.shisaku_id} ${b.name}: 「${b.seika_name}」→「${x.years[b.year].name}」`);
});

test('成果指標のページの施策の主な取組は、指標の最新の報告と同じ年度にある、同じ施策の取組', () => {
  none(getSeikaGroups().flatMap((x) => torikumiOfSeika(x).filter((g) => g.shisaku.id !== x.shisaku.id || !g.years[x.latest.year]).map((g) => [x, g] as const)), ([x, g]) => `${x.href} ${g.href}`);
  // 施策の取組が1件も無い成果指標のページは無い
  none(getSeikaGroups().filter((x) => !torikumiOfSeika(x).length), (x) => `${x.href} ${x.latest.name}`);
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
  // テーマのページの「このサイト独自の分類」の説明に「〇〇」「〇〇」と出す
  none(getThemes().flatMap((t) => t.words.filter((w) => !w || /[()[\]?*+.\\^$]/.test(w)).map((w) => `${t.id}: ${w}`)), (x) => x);
});

test('どのくらしのテーマも4年度とも主な取組と成果指標があり、4年間の推移の最新の年度は頭の数と同じ', () => {
  // 推移は年度ごとの行（trendPoints）、頭は年度をまたいでまとめた取組・成果指標（lib/heads.ts）で数えるので、最新の年度で数がずれないか
  const bad = getThemes().flatMap((t) => {
    const pick = (x: { shisaku_id: string; name: string }) => inTheme(t, x.shisaku_id, x.name);
    const points = trendPoints(pick, pick);
    const head = themeHead(t);
    const last = points.at(-1)!;
    return [
      ...points.filter((p) => !p.aN || !p.bN).map((p) => `${t.id} ${p.y}: 取組 ${p.aN}・成果指標 ${p.bN}`),
      ...(last.aN !== total(head.tori) || last.aOk !== (head.tori['順調'] || 0) || last.bN !== head.seika || last.bOk !== head.reached
        ? [`${t.id}: 推移 ${last.aOk}/${last.aN}・${last.bOk}/${last.bN}、頭 ${head.tori['順調']}/${total(head.tori)}・${head.reached}/${head.seika}`]
        : []),
    ];
  });
  none(bad, (x) => x);
});

test('どのくらしのテーマにもアイコンがある', () => {
  // アイコンは lib/icons.ts の THEME_ICONS。テーマを足したらここにも足す
  none(getThemes().filter((t) => !/<(path|circle|rect)/.test(themeIconSvg(t.id))), (t) => `${t.id} ${t.label}`);
});

test('沖縄県PDCA の抽出結果は、どの行も出典（県の PDF のページ）にたどれる', () => {
  for (const file of ['shisaku', 'kihon', 'torikumi', 'seika', 'shuyou', 'shuyou_gaiyou', 'bukyoku/torikumi'] as const) {
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

test('書き方の違いだけで名前が変わった取組・成果指標（R7からの「こども」など）は、年度をまたいで1つにまとまる', () => {
  // 同じ施策に、sameKey が同じ取組のまとまりが2つ以上ない
  const seen = new Map<string, number>();
  for (const g of getTorikumiGroups()) {
    const k = `${g.shisaku.id}|${sameKey(g.key)}`;
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  none([...seen].filter(([, n]) => n > 1), ([k]) => k);
  // 例: R4〜R6 は「沖縄子供の…」、R7 は「沖縄こどもの…」
  const g = getTorikumiGroups().find((x) => x.shisaku.id === '2-1-a-1' && x.latest.name === '沖縄こどもの貧困緊急対策事業（支援コーディネーターの配置）');
  assert.ok(g);
  assert.deepEqual(g.statuses.map(Boolean), [true, true, true, true]);
  assert.equal(g.years[2022].name, '沖縄子供の貧困緊急対策事業（支援コーディネーターの配置）');
  // どの年度の名前から引いても、まとめたページと部局票の記載にたどれる
  for (const y of YEARS) {
    assert.equal(torikumiPage('2-1-a-1', g.years[y].key), g.href);
    assert.ok(budgetOf(y, '2-1-a-1', g.key), `${y} の部局票`);
  }
  // 成果指標も、R6までの「子供の…」とR7の「こどもの…」が1つの行になる
  const s = getSeikaGroups().find((x) => x.shisaku.id === '2-1-a-1' && x.latest.name === 'こどもの貧困対策支援員による支援人数');
  assert.ok(s);
  assert.deepEqual(YEARS.filter((y) => s.years[y]), YEARS);
});

test('主要指標の達成状況の行き先（基本施策ページのカードの id）は、基本施策ごとに重ならず、最新の報告の指標が先に並ぶ', () => {
  for (const k of getKihonList()) {
    const groups = shuyouRows(k.id);
    const ids = groups.map((g) => shuyouAnchor(groups, g));
    assert.equal(new Set(ids).size, ids.length, k.id);
    const latest = groups.map((g) => g.latest.year === LATEST);
    assert.deepEqual(latest, [...latest].sort((a, b) => Number(b) - Number(a)), `${k.id}: 最新の報告の指標が先にない`);
  }
});

test('主要指標の達成状況（概要版）は、最新の年度の49指標で、区分ごとの数が概要版の集計と同じ', () => {
  const rows = getShuyouStatus();
  assert.equal(rows.length, 49);
  // 概要版（R7）「主要指標の達成状況1」の表: 100%以上 11・60%以上 8・0%超60%未満 14・横ばい 1・後退 11・その他 4
  assert.deepEqual(SHUYOU_BINS.map((b) => rows.filter((r) => r.bin === b.key).length), [11, 8, 14, 1, 11, 4]);
  // 将来像ごとの数（概要版の将来像ごとの棒の合計）
  assert.deepEqual([1, 2, 3, 4, 5].map((v) => rows.filter((r) => r.kihon.shouraizou === v).length), [5, 14, 18, 5, 7]);
});

test('主要指標の達成状況の名前は、基本施策ページのその指標のカードへ向く（基本施策に主要指標が2つあれば名前で選ぶ）', () => {
  for (const r of getShuyouStatus()) {
    const groups = shuyouRows(r.kihon_id);
    const ids = groups.filter((g) => g.latest.year === LATEST).map((g) => `/kihon/${r.kihon_id}/#${shuyouAnchor(groups, g)}`);
    assert.ok(ids.includes(r.href), `${r.code} ${r.name}: ${r.href}`);
  }
  const k312 = getShuyouStatus().filter((r) => r.kihon_id === '3-12');
  assert.equal(new Set(k312.map((r) => r.href)).size, 2, '3-(12) の2つの指標が同じカードに向いている');
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

test('将来像の名前は、印字の「〜島を目指して」から語尾を外した「〜島」になる（lib/data.ts の shouraizouName）', () => {
  const printed = load('shouraizou').filter((s) => s.year === LATEST);
  assert.equal(printed.length, 5);
  assert.ok(printed.every((s) => s.name.endsWith('島を目指して')), '報告書の印字の形が変わったら shouraizouName を見直す');
  assert.ok(getShouraizou().every((v) => v.name.endsWith('島')));
});
