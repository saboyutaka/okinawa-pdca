// lib/data.ts の、データを読まずに決まる関数（年度・区分・数の読み取り・URL）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  yearLabel, yearLong, planLabel, planIndex, withUnit, refText,
  statusOf, toneOfStatus, rateBin, rateText, rateTone, judgesOf, halfWidth, nameKey,
  splitDepts, deptOf, deptHref, sectionName, sectionAnchor, deptRoles, fundOf, budgetKey,
  PATTERNS, JUDGE_TRENDS, JUDGE_CELLS, judgeByGrid, torikumiSlug, torikumiHref, textGoalChartRow, activityQty,
  type JudgeTrend, type Pattern,
} from '../src/lib/data.ts';
import type { SeikaRow } from '../src/lib/types.ts';

test('年度の書き方', () => {
  assert.equal(yearLabel(2025), 'R7');
  assert.equal(yearLong(2022), '令和4年度');
  assert.equal(planLabel(2024), '前期実施計画（R4〜R6）');
  assert.equal(planLabel(2025), '中期実施計画（R7〜R9）');
});

test('judgeByGrid: 県の区分表のマス（A・B は「順調」の割合40%以上の2段、C・D は達成率40%未満の列を80%で分ける）', () => {
  // [「順調」の割合, 達成率, 判定]
  const cases: [number, number, string][] = [
    [100, 100, 'A'], [40, 80, 'A'], [79.9, 80, 'A'], [50, 120, 'A'],
    [100, 79.9, 'B'], [40, 40, 'B'], [60, 50, 'B'],
    [80, 39.9, 'C'], [100, -20, 'C'],
    [79.9, 39.9, 'D'], [40, 0, 'D'],
    [39.9, 80, 'E'], [0, 150, 'E'],
    [39.9, 40, 'F'], [20, 79.9, 'F'],
    [39.9, 39.9, 'G'], [0, -100, 'G'],
  ];
  for (const [y, x, k] of cases) assert.equal(judgeByGrid(y, x), k, `順調 ${y}%・達成率 ${x}%`);
  // マスは重ならず、すべての点がどれか1つに入る
  for (let y = 0; y <= 100; y += 5) for (let x = -50; x <= 200; x += 5) {
    assert.equal(JUDGE_CELLS.filter((c) => y >= c.y[0] && y < c.y[1] && x >= c.x[0] && x < c.x[1]).length, 1, `${y} ${x}`);
  }
});

test('planIndex: 計画値の欄の何番目か（前期は R4 から、中期は R7 から数える）', () => {
  assert.deepEqual([2022, 2023, 2024, 2025, 2026, 2027].map(planIndex), [0, 1, 2, 0, 1, 2]);
});

test('withUnit: 数字だけの欄にだけ単位を付ける', () => {
  assert.equal(withUnit('1,234', '件'), '1,234件');
  assert.equal(withUnit('△5.2', '%'), '△5.2%');
  assert.equal(withUnit('35件（R２年）', '件'), '35件（R２年）');
  assert.equal(withUnit('12', ''), '12');
  assert.equal(withUnit('', '件'), '—');
  assert.equal(withUnit(null, '件'), '—');
});

test('refText: 実績値の年度は、年度で終わるものにだけ「の値」を付ける', () => {
  assert.equal(refText('（R4年度）'), 'R4年度の値');
  assert.equal(refText('(R5)'), 'R5の値');
  assert.equal(refText('R５'), 'R５の値');
  assert.equal(refText('2023年'), '2023年の値');
  assert.equal(refText('速報値'), '速報値');
  assert.equal(refText('R7.5月未確定値'), 'R7.5月未確定値');
  assert.equal(refText(''), '');
  assert.equal(refText(null), '');
});

test('進捗状況: 空欄は「記載なし」、知らない言い方の色は blank', () => {
  assert.equal(statusOf({ status: '' }), '記載なし');
  assert.equal(statusOf({ status: '順調' }), '順調');
  assert.equal(toneOfStatus('やや遅れ'), 'serious');
  assert.equal(toneOfStatus('知らない言い方'), 'blank');
});

test('rateBin: 達成率の区分（概要版と同じ区切り）', () => {
  const bin = (rate: number | null, rate_raw = '') => rateBin({ rate, rate_raw });
  assert.equal(bin(100), '100%以上');
  assert.equal(bin(99.9), '60%以上100%未満');
  assert.equal(bin(60), '60%以上100%未満');
  assert.equal(bin(59.9), '0%超60%未満');
  assert.equal(bin(0.1), '0%超60%未満');
  assert.equal(bin(0), '0%以下');
  assert.equal(bin(-12), '0%以下');
  assert.equal(bin(null, '-'), '達成率なし');
  // 「達成」「未達成」とだけ書かれた指標
  assert.equal(bin(null, '達成'), '100%以上');
  assert.equal(bin(null, '未達成'), '0%以下');
});

test('rateText・rateTone: 一覧の行の達成率の札', () => {
  assert.equal(rateText({ rate: 85.3, rate_raw: '85.3' }), '85.3%');
  assert.equal(rateText({ rate: 0, rate_raw: '0.0' }), '0%');
  assert.equal(rateText({ rate: null, rate_raw: '達成' }), '達成');
  assert.equal(rateText({ rate: null, rate_raw: '-' }), 'なし');
  assert.equal(rateTone({ rate: 120, rate_raw: '120.0' }), 'good');
  assert.equal(rateTone({ rate: null, rate_raw: '未達成' }), 'critical');
  assert.equal(rateTone({ rate: null, rate_raw: '' }), 'blank');
});

test('judgesOf: 見通しの欄を名前ごとに分ける', () => {
  assert.deepEqual(judgesOf('目標達成'), [{ label: '', key: '目標達成' }]);
  assert.deepEqual(judgesOf('男性:目標達成\n女性:達成は困難'), [
    { label: '男性', key: '目標達成' },
    { label: '女性', key: '達成は困難' },
  ]);
  // 長い言い方を先に当てる（「目標達成の見込み」を「目標達成」で切らない）
  assert.deepEqual(judgesOf('男性：目標達成の見込み'), [{ label: '男性', key: '目標達成の見込み' }]);
  assert.equal(judgesOf('男性:目標達成 補足'), null);
  assert.equal(judgesOf('知らない言い方'), null);
  assert.equal(judgesOf(''), null);
});

test('halfWidth: 全角の英数字だけを半角にする', () => {
  assert.equal(halfWidth('３兆２，８８５億円'), '3兆2,885億円');
  assert.equal(halfWidth('ＣＯ₂ 100㎡ 50％'), 'CO₂ 100㎡ 50％');
});

test('nameKey: 空白・中黒・句読点・括弧を除き、全角を半角にする', () => {
  assert.equal(nameKey('ＩＴ（情報技術）・人材 育成。'), 'IT情報技術人材育成');
  assert.equal(nameKey('「しまくとぅば」の普及、継承'), 'しまくとぅばの普及継承');
});

test('部局: 所管部課から部局を取り出し、部局のページの URL にする', () => {
  assert.deepEqual(splitDepts('商工労働部土木建築部'), ['商工労働部', '土木建築部']);
  assert.deepEqual(splitDepts('知事公室教育庁'), ['知事公室', '教育庁']);
  // 「、」「,」で区切られたもの（抽出で欄の中の改行を「、」にしたもの・R6以降の印字の「,」）
  assert.deepEqual(splitDepts('商工労働部、土木建築部'), ['商工労働部', '土木建築部']);
  assert.deepEqual(splitDepts('企画部, 文化観光スポーツ部'), ['企画部', '文化観光スポーツ部']);
  assert.deepEqual(splitDepts(''), []);
  assert.equal(deptOf('商工労働部産業政策課'), '商工労働部');
  assert.equal(deptOf('知事公室防災危機管理課'), '知事公室');
  assert.equal(deptOf(null), '');
  assert.equal(deptHref('商工労働部'), '/bukyoku/shoko/');
  assert.equal(deptHref('教育庁総務課'), '/bukyoku/kyoiku/');
  // R5 の組織再編で無くなった部にはページが無い
  assert.equal(deptHref('子ども生活福祉部'), null);
});

test('課: 所管部課から部局の名前を除き、部局のページの課の行の id にする', () => {
  assert.equal(sectionName('こども未来部子育て支援課'), '子育て支援課');
  assert.equal(sectionName('知事公室防災危機管理課'), '防災危機管理課');
  assert.equal(sectionName('知事公室'), '');
  assert.equal(sectionAnchor('商工労働部産業政策課'), 'ka-産業政策課');
});

test('deptRoles: 関係部等の部局を先に、取組だけある部局を後ろに、重ねずに並べる', () => {
  assert.deepEqual(deptRoles(['環境部'], ['企画部', '環境部']), [
    { dept: '環境部', role: 'kankei' },
    { dept: '企画部', role: 'torikumi' },
  ]);
  // 関係部等に同じ部局が2回書かれていても1つ。取組の部局の空は数えない
  assert.deepEqual(deptRoles(['企画部', '企画部'], ['', '企画部']), [{ dept: '企画部', role: 'kankei' }]);
  assert.deepEqual(deptRoles([], ['教育庁']), [{ dept: '教育庁', role: 'torikumi' }]);
});

test('fundOf: 財源の欄を6つの区分に寄せる', () => {
  assert.equal(fundOf('県単等'), '県単等');
  assert.equal(fundOf('県 単 等'), '県単等');
  assert.equal(fundOf('一括交付金（ソフト）'), '一括交付金（ソフト）');
  assert.equal(fundOf('一括交付金 (ハード)'), '一括交付金（ハード）');
  assert.equal(fundOf('一括交付金'), '一括交付金（ソフト）');
  assert.equal(fundOf('内閣府計上'), '内閣府計上');
  assert.equal(fundOf('各省計上'), '各省計上');
  assert.equal(fundOf('国直轄'), 'その他');
  assert.equal(fundOf('―'), 'その他');
  assert.equal(fundOf(null), 'その他');
});

test('budgetKey: 予算事業名の空白と全角の違いを無くす', () => {
  assert.equal(budgetKey('　Ａ事業 推進\n費'), 'A事業推進費');
  assert.equal(budgetKey(null), '');
});

// 取組の4年間の様子。statuses は R4〜R7 の順（報告の無い年度は null）
const patternsOf = (...st: (string | null)[]) => (Object.keys(PATTERNS) as Pattern[]).filter((k) => PATTERNS[k](st));

test('PATTERNS: 遅れの続き方', () => {
  assert.deepEqual(patternsOf('大幅遅れ', 'やや遅れ', '未着手', '大幅遅れ'), ['delay4', 'delay3', 'streak']);
  // 間に順調の年度をはさんでも3年遅れなら delay3。最新の年度まで3年続いていないので streak ではない
  assert.deepEqual(patternsOf('大幅遅れ', '順調', 'やや遅れ', '大幅遅れ'), ['delay3']);
  // R4 の報告に無い取組は delay3 に入れない（4年とも報告にあるものだけ）
  assert.deepEqual(patternsOf(null, '大幅遅れ', 'やや遅れ', '大幅遅れ'), ['streak']);
});

test('PATTERNS: 前の年度からの変わり方', () => {
  assert.deepEqual(patternsOf('順調', '順調', 'やや遅れ', '順調'), ['recover']);
  // 概ね順調に戻っただけでは recover にしない
  assert.deepEqual(patternsOf('順調', '順調', 'やや遅れ', '概ね順調'), []);
  assert.deepEqual(patternsOf('順調', '順調', '概ね順調', 'やや遅れ'), ['newdelay']);
  assert.deepEqual(patternsOf('順調', '順調', '未着手', 'やや遅れ'), []);
  assert.deepEqual(patternsOf(null, null, null, '大幅遅れ'), ['new']);
  assert.deepEqual(patternsOf('順調', '順調', '順調', null), ['ended']);
  assert.deepEqual(patternsOf('順調', '順調', '順調', '順調'), []);
});

// 施策の判定の移り変わり。判定を A → B → C〜F → G の順に並べて比べる
const RANK: Record<string, number> = { A: 0, B: 1, C: 2, D: 2, E: 2, F: 2, G: 3 };
const trendsOf = (...judges: (string | null)[]) => {
  const r = judges.map((j) => (j == null ? null : RANK[j]));
  return (Object.keys(JUDGE_TRENDS) as JudgeTrend[]).filter((k) => JUDGE_TRENDS[k](r));
};

test('JUDGE_TRENDS: 前の年度より上がった・下がった', () => {
  assert.deepEqual(trendsOf(null, 'A', 'A', 'B'), ['down']);
  assert.deepEqual(trendsOf(null, 'A', 'G', 'C'), ['up']);
  // C〜F の中での入れ替わりは数えない
  assert.deepEqual(trendsOf(null, 'A', 'C', 'E'), []);
  // 前の年度の判定が無ければ比べない
  assert.deepEqual(trendsOf(null, 'A', null, 'G'), []);
});

test('JUDGE_TRENDS: 最新の年度まで3年続けて C〜G', () => {
  assert.deepEqual(trendsOf(null, 'C', 'D', 'F'), ['streak']);
  assert.deepEqual(trendsOf(null, 'C', 'G', 'C'), ['up', 'streak']);
  assert.deepEqual(trendsOf(null, 'B', 'C', 'C'), []);
  assert.deepEqual(trendsOf(null, null, 'C', 'C'), []);
});

test('取組のページの URL は、名前の key の SHA-1 の先頭8桁（変えると URL が変わる）', () => {
  assert.equal(torikumiSlug('abc'), 'a9993e36');
  assert.equal(torikumiHref('1-1-a-1', 'abc'), '/torikumi/1-1-a-1/a9993e36/');
});

test('activityQty: 活動指標の計画・実績は、かっこの前のその年度の数と単位を読む', () => {
  assert.deepEqual(activityQty('10件（20件）'), { v: 10, u: '件' });
  assert.deepEqual(activityQty('１,０７０人'), { v: 1070, u: '人' });
  assert.deepEqual(activityQty('5.0％'), { v: 5, u: '%' });
  assert.deepEqual(activityQty('２地区（新規１地区、継続１地区、累計２地区）'), { v: 2, u: '地区' });
  // △ と - は減らす量。単位は NFKC で比べるので、₂ や ㎥ の中の数字も単位に入れる
  assert.deepEqual(activityQty('△0.0015t-CO₂/千㎥（0.2978t-CO₂/千㎥）'), { v: -0.0015, u: 't-CO2/千m3' });
  assert.deepEqual(activityQty('-0.006t-CO₂/千㎥'), { v: -0.006, u: 't-CO2/千m3' });
  assert.equal(activityQty('方針検討'), null);
  assert.equal(activityQty('－'), null);
  assert.equal(activityQty('-％'), null);
  assert.equal(activityQty(''), null);
});

// 目標値が文の成果指標の R7 の行
const textGoalRow = (r: Partial<SeikaRow>): SeikaRow => ({
  year: 2025, shisaku_id: '1-1-a-1', name: '跡地の区域数', unit: '区域',
  base_raw: '', base: null, actual_raw: '', actual: null, actual_year: '', actual_ref_year: '', actual_series: [],
  plan_raw: [], plan: [], target_raw: '跡地における事業の取組を目指す', target: null, target_year: 'R9年度',
  rate_raw: '', rate: null, judgement: '', source: '', page: 1, dept: '', explanation: '',
  ...r,
});
// 図の材料の R7 の行。描けなければ undefined
const chartYear = (r: Partial<SeikaRow>) => {
  const x = textGoalRow(r);
  return textGoalChartRow({ key: nameKey(x.name), latest: x, years: { [x.year]: x } })?.years[x.year];
};
const drawn = (r: Partial<SeikaRow>) => {
  const y = chartYear(r);
  assert.ok(y, '図の材料ができない');
  return y;
};

test('textGoalChartRow: 目標値が文の指標の基準値・実績値を数で読む', () => {
  const r = drawn({ base_raw: '3区域', actual_raw: '5区域（R6年度）' });
  assert.equal(r.base, 3);
  assert.equal(r.actual, 5);
  // 単位が書かれていない値もそのまま読む
  assert.equal(drawn({ base_raw: '3', actual_raw: '4' }).actual, 4);
  // 数で持っている値はそのまま使う
  assert.equal(drawn({ base: 2, base_raw: '3区域', actual_raw: '5区域' }).base, 2);
});

test('textGoalChartRow: 位の付いた数を、指標の単位にそろえて読む', () => {
  const r = drawn({ unit: '億円', base_raw: '1,117億円', actual_raw: '1,250億円' });
  assert.equal(r.base, 1117);
  assert.equal(r.actual, 1250);
  const t = drawn({ unit: '兆円', base_raw: '３兆2,885億円', actual_raw: '3兆5,000億円' });
  assert.ok(Math.abs(t.base! - 3.2885) < 1e-9);
  assert.ok(Math.abs(t.actual! - 3.5) < 1e-9);
});

test('textGoalChartRow: 指標の名前の括弧の中の言葉が値の頭にあれば除いて読む', () => {
  const r = drawn({ name: '平均寿命（男性）', unit: '年', base_raw: '男性72.11年', actual_raw: '男性73.0年' });
  assert.equal(r.base, 72.11);
  assert.equal(r.actual, 73);
});

test('textGoalChartRow: 描けない指標は null', () => {
  // 目標値が数の指標（ふつうの図で描く）
  assert.equal(chartYear({ target: 10, base_raw: '3区域', actual_raw: '5区域' }), undefined);
  // 「〜との差の縮小」は値の図では目標に近づいたか分からない
  assert.equal(chartYear({ target_raw: '全国との差を縮小', base_raw: '3区域', actual_raw: '5区域' }), undefined);
  // 単位が指標と違う・数で読めない
  assert.equal(chartYear({ base_raw: '3件', actual_raw: '5件' }), undefined);
  assert.equal(chartYear({ base_raw: '調査中', actual_raw: '5区域' }), undefined);
});
