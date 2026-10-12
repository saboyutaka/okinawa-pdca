// ページの説明文（<meta name="description">・og:description）と、取組・成果指標のページの題名。検索結果と SNS のカードに出る。
// 検索結果で切れても意味が通るように、最新の年度の判定・件数を先に、何のページかを後ろに書く。
// 検索エンジンに重複とみなされないよう、題名と説明文はページごとに違うものにする（test/describe.test.ts で確かめ、ビルドでも同じページを数える）。
// 数はページが表示している数をそのまま受け取る（数え方は lib/data.ts の1か所。ここでは数えない）。
// 内訳は県の区分の並びのまま、0でない区分を全部同じ重みで並べる（遅れだけを書いたり、遅れを先に書いたりしない。docs/design.md の1章）
import { YEARS, LATEST, STATUSES, JUDGES, yearLabel, yearLong, judgeOf, withUnit, rateText, repostsOf, type SeikaGroup, type TorikumiGroup } from './data.ts';
import type { SeikaRow } from './types.ts';
import { fmt } from './format.ts';
import { oneLine } from './text.ts';

type Counts = Record<string, number>;

// 令和4〜7年度
const SPAN = `令和${YEARS[0] - 2018}〜${LATEST - 2018}年度`;
const sum = (c: Counts) => Object.values(c).reduce((a, n) => a + n, 0);

// 内訳（順調8・概ね順調2）。keys の順に並べ、keys に無い区分があれば後ろに足す（内訳の合計が件数と合わなくならないように）
export function breakdown(keys: readonly string[], counts: Counts, label = (k: string) => k) {
  const all = [...keys, ...Object.keys(counts).filter((k) => !keys.includes(k))];
  return all.filter((k) => counts[k]).map((k) => `${label(k)}${fmt(counts[k])}`).join('・');
}

// 主な取組12件（順調8・概ね順調2・やや遅れ2）。0件なら ''
export const toriText = (counts: Counts) => (sum(counts) ? `主な取組${fmt(sum(counts))}件（${breakdown(STATUSES.map((s) => s.key), counts)}）` : '');
// 成果指標3（計画値に到達2）。ページの頭の札と同じ「計画値に到達」の数。0なら ''
export const seikaText = (n: number, reached: number) => (n ? `成果指標${fmt(n)}（計画値に到達${fmt(reached)}）` : '');
// 施策52（判定 A 12・B 30・D 8・G 2）。counts は lib/data.ts の countJudges。0なら ''
export const judgesText = (counts: Counts, label = '施策') =>
  sum(counts) ? `${label}${fmt(sum(counts))}（判定 ${breakdown(JUDGES.map((j) => j.key), counts, (k) => `${k} `)}）` : '';

// 件数の文を「、」でつなぎ、最新の年度を頭に付けて1文にする（令和7年度、施策52（…）、主な取組…。）。どれも無ければ ''
const facts = (xs: string[]) => {
  const s = xs.filter(Boolean).join('、');
  return s && `${yearLong(LATEST)}、${s}。`;
};

// 施策: 令和7年度の判定 B（概ね順調）。主な取組12件（…）、成果指標3（計画値に到達2）。沖縄県PDCAの施策「〇〇」の…
export function shisakuDescription(o: { name: string; judge: string | null | undefined; tori: Counts; seika: number; reached: number }) {
  const j = judgeOf(o.judge);
  const judge = j ? `${yearLong(LATEST)}の判定 ${j.key}（${j.label}）。` : `${yearLong(LATEST)}の判定はなし。`;
  const rest = [toriText(o.tori), seikaText(o.seika, o.reached)].filter(Boolean).join('、');
  return `${judge}${rest && `${rest}。`}沖縄県PDCAの施策「${o.name}」の${SPAN}の成果指標と主な取組。`;
}

// 主な取組の題名。同じ取組が複数の施策に載っている（総括報告書の「再掲」）と施策ごとにページがあるので、題名が同じにならないように施策の番号を足す。
// 番号は名前より目立たせないので、後ろに置く（docs/design.md の6章）
export const torikumiTitle = (o: { name: string; code: string; reposted: boolean }) =>
  `${o.name}（沖縄県の主な取組${o.reposted ? `・施策 ${o.code}` : ''}）`;

// 主な取組: 進捗状況 R4 順調・R5 概ね順調・R6 順調・R7 順調。R7にやったこと: 〇〇。所管 〇〇部〇〇課。沖縄県PDCAの施策「〇〇」の主な取組。…
// statuses は年度の順の進捗状況（報告の無い年度は null。lib/data.ts の TorikumiGroup の statuses）。最新の年度の報告に無い取組はそうと書く。
// 同じ施策で所管課と進捗状況が同じ取組も説明文が同じにならないように、最新の報告の「やったこと」（総括報告書の活動概要。100字ほどまで）と
// 活動指標の名前を入れる（県が複数の取組に同じ活動概要を書いていることもあるので、活動指標でも見分ける）。取組の名前は題名にあるので入れない
export function torikumiDescription(o: { statuses: (string | null)[]; year: number; summary: string; indicator: string; section: string; shisaku: string }) {
  const st = YEARS.flatMap((y, i) => (o.statuses[i] ? [`${yearLabel(y)} ${o.statuses[i]}`] : []));
  const ended = o.statuses.at(-1) ? '' : `（${yearLabel(LATEST)}の報告には無い）`;
  // 「-」だけの欄は書かない
  const text = (v: string) => oneLine(v).trim().replace(/^[-―ー－—]+$/, '');
  const did = text(o.summary);
  const didText = did ? `${yearLabel(o.year)}にやったこと: ${did}${did.endsWith('。') ? '' : '。'}` : '';
  const indicator = text(o.indicator);
  return `進捗状況 ${st.join('・')}${ended}。${didText}${o.section ? `所管 ${o.section}。` : ''}沖縄県PDCAの施策「${o.shisaku}」の主な取組。${indicator ? `活動指標「${indicator}」の計画と実績` : '活動指標'}・予算・県の検証と改善案。`;
}

// 成果指標の題名。name は lib/data.ts の SeikaGroup の name（印字で見分けられない指標は内訳の名前）
export const seikaTitle = (name: string) => `${name}（沖縄県の成果指標）`;

// 成果指標: 最新の報告の実績値・達成率・目標値を先に置く。name は題名と同じ名前
export function seikaDescription(x: SeikaRow, name: string) {
  const u = x.unit;
  return `${yearLabel(x.year)}の実績値 ${oneLine(withUnit(x.actual_raw, u))}（達成率 ${rateText(x)}）、目標値 ${oneLine(withUnit(x.target_raw, u))}（${x.target_year}）。沖縄県PDCAの成果指標「${name}」の基準値からの道のり・県による説明・かかわる主な取組。`;
}

// 取組・成果指標のページの題名と説明文（ページと、ほかのページと同じにならないかのテストで同じものを使う）
export const torikumiHead = (g: TorikumiGroup) => ({
  title: torikumiTitle({ name: g.latest.name, code: g.shisaku.code, reposted: repostsOf(g).length > 0 }),
  description: torikumiDescription({ statuses: g.statuses, year: g.latest.year, summary: g.latest.summary, indicator: g.latest.indicator, section: g.section, shisaku: g.shisaku.name }),
});
export const seikaHead = (g: SeikaGroup) => ({ title: seikaTitle(g.name), description: seikaDescription(g.latest, g.name) });

// 基本施策・将来像・部局・くらしのテーマに渡す数（ページの頭の札・ドーナツ・判定のマス目と同じもの）
interface AreaCounts {
  judges: Counts; // 施策の判定の内訳（countJudges）
  tori: Counts; // 最新の年度の主な取組の進捗状況の内訳
  seika?: number; // 最新の年度の成果指標の数
  reached?: number; // そのうち計画値に到達した数
}
const seikaOf = (c: AreaCounts) => seikaText(c.seika ?? 0, c.reached ?? 0);

export const kihonDescription = (name: string, c: AreaCounts) =>
  `${facts([judgesText(c.judges), toriText(c.tori)])}沖縄県PDCAの基本施策「${name}」の主要指標・施策・主な取組の進み具合。`;

export const futureDescription = (id: number, name: string, c: AreaCounts) =>
  `${facts([judgesText(c.judges), toriText(c.tori), seikaOf(c)])}沖縄県PDCAの将来像${id}「${name}」の基本施策ごとの進み具合と${SPAN}の推移。`;

// 部局のページは所管する取組が主なので、取組・成果指標を先に、かかわる施策を後ろに書く
export const deptDescription = (name: string, c: AreaCounts) =>
  `${facts([toriText(c.tori), seikaOf(c), judgesText(c.judges, 'かかわる施策')])}沖縄県PDCAで${name}が所管する主な取組・成果指標と、かかわる施策の進み具合。`;

// くらしのテーマはこのサイト独自の分類なので、切れても分かるように頭に書く（docs/design.md の8章）
export const themeDescription = (label: string, c: AreaCounts) =>
  `「${label}」はこのサイト独自の分類。${facts([judgesText(c.judges), toriText(c.tori), seikaOf(c)])}沖縄県PDCAの施策・主な取組・成果指標を、くらしのテーマで分けて見られます。`;
