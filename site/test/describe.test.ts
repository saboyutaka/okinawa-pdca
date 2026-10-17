// ページの説明文（lib/describe.ts）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  breakdown, toriText, seikaText, judgesText,
  shisakuDescription, torikumiDescription, seikaDescription, kihonDescription, futureDescription, deptDescription, themeDescription,
  torikumiTitle, seikaTitle, torikumiMeta, seikaMeta, shuyouMeta, katsudouMeta, statusRuns, shorten,
} from '../src/lib/describe.ts';
import { LATEST, STATUSES, statusOf, countBy, countJudges, getShisakuList, getSeikaGroups, getShuyouGroups, getActivityShares, getTorikumiGroups } from '../src/lib/data.ts';
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

test('進捗状況は同じ区分が続く年度をまとめ、報告の無い年度で区切る', () => {
  assert.deepEqual(statusRuns(['順調', '概ね順調', 'やや遅れ', '順調']), ['令和4年度 順調', '令和5年度 概ね順調', '令和6年度 やや遅れ', '令和7年度 順調']);
  assert.deepEqual(statusRuns(['順調', '順調', '順調', '順調']), ['令和4〜7年度 順調']);
  assert.deepEqual(statusRuns(['順調', '順調', '順調', '概ね順調']), ['令和4〜6年度 順調', '令和7年度 概ね順調']);
  assert.deepEqual(statusRuns(['順調', null, '順調', '順調']), ['令和4年度 順調', '令和6〜7年度 順調']);
  assert.deepEqual(statusRuns([null, null, null, null]), []);
});

test('やったことは 50字ほどまでで、読点・句点のところで切る', () => {
  const s60 = 'あ'.repeat(60);
  assert.equal(shorten(s60), s60); // 10字ほどの超えなら切らない
  const long = '認知症キャラバン・メイト養成研修を１回開催した。定員１５０名に対しキャンセル等もあり最終的に受講者は６９名となった。参加者からは好評だった。';
  assert.equal(shorten(long), '認知症キャラバン・メイト養成研修を１回開催した…');
  assert.equal(shorten('市町村と連携して、' + 'あ'.repeat(70)), '市町村と連携して、' + 'あ'.repeat(41) + '…'); // 読点が半分より手前にしか無ければ、50字で切る
  assert.equal(shorten('アクセラレータープログラムでは、OISTが、世界中から研究開発型起業を目指す起業家チームを公募して２件程度選定し、約１年間、起業に向けた一連のサポートを提供する。'), 'アクセラレータープログラムでは、OISTが、世界中から研究開発型起業を目指す起業家チームを公募して２…'); // 読点が半分より手前にしか無いので、50字で切る
  assert.equal(shorten('あ'.repeat(30) + '、' + 'あ'.repeat(40)), 'あ'.repeat(30) + '…'); // 半分より後ろの読点で切る
  assert.equal(shorten('あ'.repeat(80), 20), 'あ'.repeat(20) + '…');
});

test('主な取組: 4年分の進捗状況・最新の報告のやったこと・所管課・施策の名前・活動指標', () => {
  assert.equal(
    torikumiDescription({ statuses: ['順調', '概ね順調', 'やや遅れ', '順調'], year: 2025, summary: '説明会を2回開催した。', indicator: '説明会の回数（累計）', section: '商工労働部産業政策課', shisaku: '産業の振興' }),
    '進捗状況 令和4年度 順調・令和5年度 概ね順調・令和6年度 やや遅れ・令和7年度 順調。令和7年度にやったこと: 説明会を2回開催した。所管 商工労働部産業政策課。沖縄県PDCAの施策「産業の振興」の主な取組。活動指標「説明会の回数（累計）」。',
  );
  // 報告の無い年度は書かず、最新の年度の報告に無い取組はそうと書く。やったことはその取組の最新の報告のもの
  const ended = torikumiDescription({ statuses: [null, '順調', '順調', null], year: 2024, summary: '研修会の実施', indicator: '研修会の回数', section: '', shisaku: '産業の振興' });
  assert.ok(ended.startsWith('進捗状況 令和5〜6年度 順調（令和7年度の報告には無い）。令和6年度にやったこと: 研修会の実施。沖縄県PDCAの施策'), ended);
  // 長いやったことは短くし、「…」のあとに句点を足す
  const long = torikumiDescription({ statuses: ['順調', '順調', '順調', '順調'], year: 2025, summary: '認知症キャラバン・メイト養成研修を１回開催した。定員１５０名に対しキャンセル等もあり最終的に受講者は６９名となった。参加者からは好評だった。', indicator: '', section: '', shisaku: 'x' });
  assert.equal(long, '進捗状況 令和4〜7年度 順調。令和7年度にやったこと: 認知症キャラバン・メイト養成研修を１回開催した…。沖縄県PDCAの施策「x」の主な取組。');
  // 「-」だけのやったこと・活動指標は書かない
  for (const v of ['―', '-', '－', '']) {
    const d = torikumiDescription({ statuses: [null, null, '順調', '順調'], year: 2025, summary: v, indicator: v, section: '', shisaku: 'x' });
    assert.equal(d, '進捗状況 令和6〜7年度 順調。沖縄県PDCAの施策「x」の主な取組。');
  }
});

test('主な取組の題名: 複数の施策に載っている取組だけ、施策の番号を後ろに足す', () => {
  assert.equal(torikumiTitle({ name: '漁港漁村環境整備事業', code: '1-(2)-イ-①', reposted: false }), '漁港漁村環境整備事業（沖縄県の主な取組）');
  assert.equal(torikumiTitle({ name: '漁港漁村環境整備事業', code: '1-(2)-イ-①', reposted: true }), '漁港漁村環境整備事業（沖縄県の主な取組・施策 1-(2)-イ-①）');
});

test('成果指標: 最新の報告の実績値・達成率・目標値を先に書く', () => {
  const x = { name: '待機児童数', year: 2025, unit: '人', actual_raw: '120', rate: 80, rate_raw: '80%', target_raw: '0', target_year: 'R9' } as SeikaRow;
  assert.equal(seikaDescription(x, x.name), '令和7年度の実績値 120人（達成率 80%）、目標値 0人（令和9年度）。沖縄県PDCAの成果指標「待機児童数」の基準値からの道のりと県による説明。');
  assert.equal(seikaTitle('待機児童数'), '待機児童数（沖縄県の成果指標）');
});

// 同じ題名・説明文のページがあると、検索結果で見分けにくく、検索エンジンにも重複とみなされやすい（ビルドでも全ページを数えて警告する）
const dupes = (xs: { title: string; description: string }[], key: 'title' | 'description') => {
  const seen = new Map<string, number>();
  for (const x of xs) seen.set(x[key], (seen.get(x[key]) || 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([k, n]) => `${n} ${k}`);
};

test('取組のページの題名と説明文は、ほかの取組のページと同じにならない', () => {
  const metas = getTorikumiGroups().map(torikumiMeta);
  assert.deepEqual(dupes(metas, 'title'), []);
  assert.deepEqual(dupes(metas, 'description'), []);
  for (const h of metas) assert.ok(!/undefined|NaN|\n/.test(h.title + h.description), h.description);
});

test('成果指標のシェア用のページの題名と説明文は、ほかの成果指標と同じにならない', () => {
  const metas = getSeikaGroups().map(seikaMeta);
  assert.deepEqual(dupes(metas, 'title'), []);
  assert.deepEqual(dupes(metas, 'description'), []);
});

test('主要指標・活動指標のシェア用のページ: 題名に指標の名前（活動指標は取組の名前も）、説明文に最新の報告の値と名前が入る', () => {
  for (const g of getShuyouGroups()) {
    const h = shuyouMeta(g);
    assert.ok(h.title.startsWith(g.latest.name) && h.description.includes(`「${g.latest.name}」`), h.description);
    assert.ok(!/undefined|NaN|\n/.test(h.title + h.description), h.description);
  }
  for (const a of getActivityShares()) {
    const h = katsudouMeta(a);
    assert.ok(h.title.startsWith(a.name) && h.description.includes(`「${a.name}」`), h.description);
    assert.ok(!/undefined|NaN|\n/.test(h.title + h.description), h.description);
  }
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
    const d = seikaDescription(g.latest, g.name);
    assert.ok(!d.includes('undefined') && !d.includes('NaN') && !d.includes('\n'), d);
  }
});
