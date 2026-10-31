// X の公式アカウントで毎日紹介する主な取組の投稿文と、紹介の順番（site/scripts/posts.ts が書き出す。投稿のデータはリポジトリに入れない）。
// 順番は進捗状況で決めず、ランダムにする（docs/design.md の1章）
import { LATEST, halfWidth, keySlug, statusOf, yearLong, type TorikumiGroup } from './data.ts';
import { SITE } from './links.ts';
import { firstSentence, isBlankCell, oneLine } from './text.ts';

// X の文字数（twitter-text の v3 の数え方）。日本語などは1字を2、ラテン文字・記号の一部は1と数え、URL は長さによらず23。上限は280
export const X_MAX = 280;
const X_URL = 23;
const LIGHT: [number, number][] = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
export function xLength(text: string): number {
  let n = 0;
  for (const part of text.normalize('NFC').split(/(https?:\/\/\S+)/)) {
    if (/^https?:\/\//.test(part)) { n += X_URL; continue; }
    for (const c of part) {
      const cp = c.codePointAt(0)!;
      n += LIGHT.some(([a, b]) => cp >= a && cp <= b) ? 1 : 2;
    }
  }
  return n;
}

// 同じ取組が複数の施策に載っているもの（再掲）は、施策の並びで初めのものだけを紹介する。最新の年度の報告に無い取組は紹介しない
export function postGroups(groups: TorikumiGroup[]): TorikumiGroup[] {
  const seen = new Set<string>();
  return groups.filter((g) => {
    if (g.latest.year !== LATEST || seen.has(g.key)) return false;
    seen.add(g.key);
    return true;
  });
}

// 紹介の順番。取組の名前（key）のハッシュの順に並べる。ランダムな並びだが、作り直しても同じ順になり、取組が増えたり減ったりしてもほかの取組の前後は変わらない
// （書き出したあとにスプレッドシートで予約した行と、作り直した行の順がずれないように）
export function postOrder(groups: TorikumiGroup[]): TorikumiGroup[] {
  return groups.map((g) => ({ g, h: keySlug(`post:${g.key}`) })).sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0)).map((x) => x.g);
}

const cell = (v: string) => (isBlankCell(v) ? '' : halfWidth(oneLine(v)).trim());

// 動詞の言い切りの形を過去の形にする（「支援する」→「支援した」、「行う」→「行った」、「進めている」→「進めていた」）。
// 「る」で終わるものは、前がい段・え段のかなら一段（「進める」「いる」「される」）、それ以外は五段（「図る」「なる」「ある」）とみなす
const PAST: [RegExp, string][] = [
  [/ています$/, 'ていた'],
  [/します$/, 'した'],
  [/ます$/, 'ました'],
  [/する$/, 'した'],
  [/ない$/, 'なかった'],
  [/(行|い)く$/, '$1った'],
  [/く$/, 'いた'],
  [/ぐ$/, 'いだ'],
  [/す$/, 'した'],
  [/[うつ]$/, 'った'],
  [/[むぶぬ]$/, 'んだ'],
  [/([いきしちにひみりぎじびぴけせてねへめれえげぜでべぺ])る$/, '$1た'],
  [/る$/, 'った'],
];
export const past = (s: string) => (/[ただ]$/.test(s) ? s : PAST.reduce((t, [re, to]) => (t === s ? t.replace(re, to) : t), s));

// 県の活動概要の文（「〜した。」「〜を支援する。」「〜を実施。」）を「〜したみたい」の形にする（令和7年度にやったことなので過去の形。句点は付けない）。
// 終わりの「（各1回）」のような補いは「みたい」の後ろに置く
export function hearsay(s: string): string {
  const [, body, note] = s.replace(/[。.．]$/, '').match(/^(.*?)((?:（[^（）]*）)?)$/)!;
  return `${/\p{Script=Han}$/u.test(body) ? `${body}した` : past(body)}みたい${note}`;
}

// やったことの候補（長い順）。活動概要の初めの1文と、頭の目的（「〜のため、」「〜に向けて、」）を省いたもの、
// それぞれを動作の区切り（「〜し、」「〜し（…）、」「〜を行い、」「〜するとともに、」など。「〜に対し、」「〜として、」は区切りでない）のところで切って「〜した」の形にしたもの。
// 「以下のとおり」「下記の支援」のように報告書の表を指すものは、投稿に表が無いので使わない
const PURPOSE = /^.*?(ため|ために|に向け|に向けて)、/;
const BREAKS: [RegExp, string][] = [[/するとともに、/g, 'した'], [/(?<![対関際通])(?:(?<!と)して|し)(?:（[^）]*）)?、/g, 'した'], [/行い、/g, '行った'], [/図り、/g, '図った'], [/たほか、/g, 'た']];
export function didCandidates(summary: string): string[] {
  const first = firstSentence(summary).replace(/。$/, '');
  const bases = [first, first.replace(PURPOSE, '')].filter(Boolean);
  const cuts = (b: string) => BREAKS.flatMap(([re, to]) => [...b.matchAll(re)].map((m) => `${b.slice(0, m.index)}${to}`));
  return [...new Set(bases.flatMap((b) => [b, ...cuts(b)]))].filter((c) => !/以下|下記/.test(c)).sort((a, b) => [...b].length - [...a].length);
}

// 活動指標の名前を「〇〇は計画○・実績○」の主語の形にする。終わりの数え方（「開催箇所数」の「箇所数」、「協議回数」の「回数」など）を除き、
// 終わりのかっこ（「（累計）」など）は note として計画と実績の後ろに回す（「パネル展の開催箇所数（累計）」→「パネル展の開催」と「（累計）」）
const COUNTERS = /(?:回|件|箇所|か所|ヵ所|カ所|ケ所|人|名|者|圏域|地区|市町村|団体|世帯|戸|台|項目|講座|企業)?数$/;
export function indicatorTopic(name: string): { topic: string; note: string } {
  const [, body, note] = name.match(/^(.*?)((?:（[^（）]*）)*)$/)!;
  const topic = body.replace(COUNTERS, '');
  return { topic: [...topic].length >= 2 ? topic : body, note };
}

// 投稿文。取組名、最新の年度にやったこと（総括報告書の活動概要）、活動指標の計画と実績とそれを踏まえた進捗状況（県の区分のまま）、
// ページの URL を、話しかける言い方で短く書く（ハッシュタグは付けない）。280 に収まるように、かっこ（「（累計）」「（内訳）」や値の補い）→
// やったこと → 活動指標の名前 → 計画と実績の順に省く（やったことは didCandidates の短いものから試す。取組名・進捗状況・URL は省かない）
const PAREN = /\s*[（(][^（）()]*[）)]/g;
export function postText(g: TorikumiGroup): string {
  const t = g.latest;
  const status = statusOf(t);
  const year = yearLong(t.year);
  // 「県は令和7年度、令和7年度は、…」「県は令和7年度、県では、…」と重ならないように、活動概要の頭の年度と県は除く
  const summary = cell(t.summary).replace(new RegExp(`^(${year}は|(本県|沖縄県|県)(では|は))、?`), '');
  const { topic, note } = indicatorTopic(cell(t.indicator));
  const [plan, actual] = [cell(t.target), cell(t.actual)];
  // 計画と実績は1行で、どちらも数のあるものだけ（「集計中」などは書かない）。short はかっこを除いたもの（除くと数が無くなるときは除かない）
  const hasNums = !t.lines && /\d/.test(plan) && /\d/.test(actual);
  const [planShort, actualShort] = [plan.replace(PAREN, ''), actual.replace(PAREN, '')];
  const canShort = /\d/.test(planShort) && /\d/.test(actualShort);
  const numsOf = (short: boolean) => (short && canShort ? `計画${planShort}・実績${actualShort}` : `計画${plan}・実績${actual}${note}`);
  const said = status === '記載なし' ? '進捗は報告書に書かれていないみたい。' : `進捗は「${status}」。`;
  // 進捗の行（省く順）。やったことの行が無いときは、何年度の値かを頭に書く
  type Line = (withDid: boolean, short: boolean) => string;
  const lines: Line[] = [
    ...(topic && hasNums ? [(w: boolean, s: boolean) => `${w ? '' : `${year}の`}${topic}は${numsOf(s)}で、${said}`] : []),
    ...(hasNums ? [(w: boolean, s: boolean) => `${w ? '' : `${year}は`}${numsOf(s)}で、${said}`] : []),
    (w: boolean) => `${w ? '' : `${year}の`}${said}`,
  ];
  const compose = (did: string, line: Line, short: boolean) =>
    [`「${t.name}」を紹介するよ。`, did && `県は${year}、${hearsay(did)}。`, line(!!did, short), new URL(g.href, SITE.url).href]
      .filter(Boolean).join('\n');
  const dids = didCandidates(summary);
  const tries = lines.flatMap((l) => [...dids, ''].flatMap((d) => [compose(d, l, false), compose(d, l, true)]));
  return tries.find((text) => xLength(text) <= X_MAX) ?? tries.at(-1)!;
}
