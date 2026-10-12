// ページの説明文（lib/describe.ts）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  breakdown, toriText, seikaText, judgesText,
  shisakuDescription, torikumiDescription, seikaDescription, kihonDescription, futureDescription, deptDescription, themeDescription,
} from '../src/lib/describe.ts';
import { LATEST, STATUSES, statusOf, countBy, countJudges, getShisakuList, getSeikaGroups } from '../src/lib/data.ts';
import type { SeikaRow } from '../src/lib/types.ts';

const STATUS_KEYS = STATUSES.map((s) => s.key);
const tori = countBy(['順調', 'やや遅れ', '順調', '概ね順調', '大幅遅れ', '順調'], (s) => s, STATUS_KEYS);
const judges = { A: 2, B: 5, C: 0, D: 1, E: 0, F: 0, G: 1 };

test('内訳は区分の並びのまま、0の区分を除いて全部並べる', () => {
  assert.equal(breakdown(STATUS_KEYS, tori), '順調3・概ね順調1・やや遅れ1・大幅遅れ1');
  // 遅れが多くても、遅れを先にしない
  assert.equal(breakdown(STATUS_KEYS, { 順調: 1, 大幅遅れ: 9 }), '順調1・大幅遅れ9');
  assert.equal(breakdown(['A', 'B'], { A: 1200, B: 3 }, (k) => `${k} `), 'A 1,200・B 3');
});

test('内訳の区分に無いものは後ろに足し、合計が件数と合うようにする', () => {
  assert.equal(breakdown(['A', 'B'], { A: 1, B: 0, なし: 2 }, (k) => `${k} `), 'A 1・なし 2');
});

test('件数の文', () => {
  assert.equal(toriText(tori), '主な取組6件（順調3・概ね順調1・やや遅れ1・大幅遅れ1）');
  assert.equal(seikaText(3, 2), '成果指標3（計画値に到達2）');
  assert.equal(seikaText(3, 0), '成果指標3（計画値に到達0）');
  assert.equal(judgesText(judges), '施策9（判定 A 2・B 5・D 1・G 1）');
  assert.equal(judgesText(judges, 'かかわる施策'), 'かかわる施策9（判定 A 2・B 5・D 1・G 1）');
  // 0件のものは書かない
  assert.equal(toriText(countBy([], (s: string) => s, STATUS_KEYS)), '');
  assert.equal(seikaText(0, 0), '');
  assert.equal(judgesText({ A: 0 }), '');
});

test('判定の内訳は最新の年度の判定で数え、判定の無い施策は「なし」', () => {
  const list: { judges: Record<number, string | null> }[] = [{ judges: { 2024: 'C', 2025: 'A' } }, { judges: { 2025: 'A' } }, { judges: { 2025: 'G' } }, { judges: { 2025: null } }];
  assert.deepEqual(countJudges(list), { A: 2, B: 0, C: 0, D: 0, E: 0, F: 0, G: 1, なし: 1 });
  assert.equal(judgesText(countJudges(list)), '施策4（判定 A 2・G 1・なし 1）');
});

test('施策: 最新の年度の判定と件数を先に、施策の名前を後ろに書く', () => {
  const d = shisakuDescription({ name: '子育て支援の充実', judge: 'B', tori, seika: 3, reached: 2 });
  assert.equal(d, '令和7年度の判定 B（概ね順調）。主な取組6件（順調3・概ね順調1・やや遅れ1・大幅遅れ1）、成果指標3（計画値に到達2）。沖縄県PDCAの施策「子育て支援の充実」の令和4〜7年度の成果指標と主な取組。');
  // 判定の言い方は県の区分のまま
  assert.ok(shisakuDescription({ name: 'x', judge: 'C', tori, seika: 1, reached: 0 }).startsWith('令和7年度の判定 C（取組は順調だが、成果は遅れている）。'));
  // 判定・成果指標の無い施策
  assert.equal(shisakuDescription({ name: 'x', judge: null, tori, seika: 0, reached: 0 }), '令和7年度の判定はなし。主な取組6件（順調3・概ね順調1・やや遅れ1・大幅遅れ1）。沖縄県PDCAの施策「x」の令和4〜7年度の成果指標と主な取組。');
});

test('主な取組: 4年分の進捗状況・所管課・施策の名前', () => {
  assert.equal(
    torikumiDescription({ statuses: ['順調', '概ね順調', 'やや遅れ', '順調'], section: '商工労働部産業政策課', shisaku: '産業の振興' }),
    '進捗状況 R4 順調・R5 概ね順調・R6 やや遅れ・R7 順調。所管 商工労働部産業政策課。沖縄県PDCAの施策「産業の振興」の主な取組。活動指標・予算・県の検証と改善案。',
  );
  // 報告の無い年度は書かず、最新の年度の報告に無い取組はそうと書く
  const ended = torikumiDescription({ statuses: [null, '順調', '順調', null], section: '', shisaku: '産業の振興' });
  assert.ok(ended.startsWith('進捗状況 R5 順調・R6 順調（R7の報告には無い）。沖縄県PDCAの施策'), ended);
});

test('成果指標: 最新の報告の実績値・達成率・目標値を先に書く', () => {
  const x = { name: '待機児童数', year: 2025, unit: '人', actual_raw: '120', rate: 80, rate_raw: '80%', target_raw: '0', target_year: 'R9' } as SeikaRow;
  assert.equal(seikaDescription(x), 'R7の実績値 120人（達成率 80%）、目標値 0人（R9）。沖縄県PDCAの成果指標「待機児童数」の基準値からの道のり・県による説明・かかわる主な取組。');
});

test('基本施策・将来像・部局・くらしのテーマ: 最新の年度の件数を先に書く', () => {
  const c = { judges, tori, seika: 10, reached: 4 };
  assert.equal(kihonDescription('健康長寿', c), '令和7年度、施策9（判定 A 2・B 5・D 1・G 1）、主な取組6件（順調3・概ね順調1・やや遅れ1・大幅遅れ1）。沖縄県PDCAの基本施策「健康長寿」の主要指標・施策・主な取組の進み具合。');
  assert.ok(futureDescription(1, '将来像の名前', c).startsWith('令和7年度、施策9（判定 A 2・B 5・D 1・G 1）、主な取組6件（順調3・概ね順調1・やや遅れ1・大幅遅れ1）、成果指標10（計画値に到達4）。沖縄県PDCAの将来像1「将来像の名前」'));
  // 部局は所管する取組が先で、かかわる施策が後ろ。成果指標の無い部局は書かない
  assert.ok(deptDescription('企業局', { judges, tori }).startsWith('令和7年度、主な取組6件（順調3・概ね順調1・やや遅れ1・大幅遅れ1）、かかわる施策9（判定 A 2・B 5・D 1・G 1）。沖縄県PDCAで企業局が所管する'));
  // くらしのテーマはこのサイト独自の分類だと頭に書く
  assert.ok(themeDescription('子育て', c).startsWith('「子育て」はこのサイト独自の分類。令和7年度、施策9'));
});

test('実際の施策・成果指標でも、説明文に名前と数が入る', () => {
  for (const s of getShisakuList()) {
    const d = shisakuDescription({ name: s.name, judge: s.judges[LATEST], tori: countBy(s.torikumi.filter((t) => t.year === LATEST), statusOf, STATUS_KEYS), seika: 0, reached: 0 });
    assert.ok(d.includes(`「${s.name}」`), s.id);
    assert.ok(!d.includes('undefined') && !d.includes('NaN'), d);
  }
  for (const g of getSeikaGroups()) {
    const d = seikaDescription(g.latest);
    assert.ok(!d.includes('undefined') && !d.includes('NaN') && !d.includes('\n'), d);
  }
});
