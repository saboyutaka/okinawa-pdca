// 取組をさがす（/torikumi/）が読み込む検索用データ。ビルド時に2つの JSON として書き出す（pages/torikumi/ の data-[hash].json.ts・summary-[hash].json.ts と、控えの data.json.ts・summary.json.ts）。
// - data: 一覧の行と絞り込みに使うもの。ページを開くとすぐ読む
// - summary: 最新の報告の「やったこと」。キーワードで探すときにしか使わず、data と同じくらいの大きさがあるので分けて、キーワードの欄に入ったときに読む
// 行は配列で持ってファイルを小さくする（並びは fields のとおり。summary の rows も data の rows と同じ並び）。
// ファイルの名前に中身のハッシュを入れ（/torikumi/data-<ハッシュ>.json）、ブラウザにずっとキャッシュさせる（public/_headers）。中身が変われば名前も変わる。
// ビルドの中でだけ使う（Node の機能を使う。ブラウザのスクリプトは型だけを読む）
import { createHash } from 'node:crypto';
import { YEARS, STATUSES, DEPTS, getShisakuList, getTorikumiGroups, torikumiLinks } from './data.ts';
import { getThemes, themeIdsOf } from './themes.ts';
import { kankoOfPdca } from './plans.ts';
import type { Tone } from './icons.ts';

// JSON の形（ブラウザのスクリプト pages/torikumi/index.astro もこの型で読む）
export interface SearchData {
  years: number[];
  statuses: [key: string, tone: Tone][];
  depts: Record<string, string>;
  shisaku: Record<string, [code: string, name: string, shouraizou: number]>;
  themes: [id: string, label: string][];
  fields: string[];
  rows: [
    shisaku_id: string, name: string, section: string, dept: string, statuses: (number | null)[], indicator: string, target: string, actual: string,
    latest_year: number, href: string, themes: number[], patterns: string[], plans: string[], links: string[],
  ][];
  // 同じビルドの「やったこと」（SearchSummary）の hash。読み込んだやったことが、このデータと同じ版かを確かめる
  summary: string;
}

// 最新の報告の「やったこと」（総括報告書の取組の概要）。rows は SearchData の rows と同じ並び。
// hash は rows の中身の SHA-256 の先頭8桁で、書き出す場所の名前にも使う
export interface SearchSummary {
  hash: string;
  rows: string[];
}

const sha8 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 8);

function buildSummary(): SearchSummary {
  // キーワードで探すだけで、一覧の行には、ここにだけ当たったときに出す
  // （市町村の名前や「不登校」のような言葉は、取組の名前より、ここに書かれていることが多い）
  const rows = getTorikumiGroups().map((g) => g.latest.summary || '');
  return { hash: sha8(JSON.stringify(rows)), rows };
}

function build(): SearchData {
  const code = Object.fromEntries(STATUSES.map((s, i) => [s.key, i]));
  const themes = getThemes();
  const themeIndex = new Map(themes.map((t, i) => [t.id, i]));
  return {
    years: YEARS,
    statuses: STATUSES.map((s) => [s.key, s.tone]),
    depts: Object.fromEntries(DEPTS.map((d) => [d.name, d.slug])), // 部局名 → 部局ページの slug
    shisaku: Object.fromEntries(getShisakuList().map((s) => [s.id, [s.code, s.name, s.shouraizou]])),
    themes: themes.map((t) => [t.id, t.label]), // くらしのテーマ（このサイト独自の分類）
    fields: ['shisaku_id', 'name', 'section', 'dept', 'statuses', 'indicator', 'target', 'actual', 'latest_year', 'href', 'themes', 'patterns', 'plans', 'links'],
    rows: getTorikumiGroups().map((g) => [
      g.shisaku.id,
      g.latest.name,
      g.section,
      g.dept,
      g.statuses.map((x) => (x == null ? null : code[x])),
      g.latest.indicator,
      // 目標・実績が2行以上の取組は、行を「／」でつないで1行にする（一覧の行は1行で描くため）
      g.latest.lines ? g.latest.lines.map((l) => l.target || '—').join(' ／ ') : g.latest.target,
      g.latest.lines ? g.latest.lines.map((l) => l.actual || '—').join(' ／ ') : g.latest.actual,
      g.latest.year,
      // 取組のページの URL。施策の番号（1列目）と重なるが、短くしても gzip で約4KB しか減らない（残りはハッシュの8桁で縮まない）ので、
      // URL の作り方（lib/data.ts の torikumiHref）をブラウザに持たせず、そのまま渡す
      g.href,
      themeIdsOf(g.shisaku.id).map((id) => themeIndex.get(id)!),
      g.patterns, // 4年間の様子（lib/data.ts の PATTERNS のうち当てはまるもの）
      kankoOfPdca(g.shisaku.id, g.key).length ? ['kanko'] : [], // 個別計画でも評価されているか（いまは観光ロードマップだけ）
      torikumiLinks(g), // ほかの取組とのつながり（前回までの取組・後続の取組・再掲があるか。lib/data.ts の relatedOf）
    ]),
    summary: searchSummary().hash,
  };
}

// 書き出す JSON（1回のビルドで1度だけ作る）
let summary: SearchSummary | undefined;
const searchSummary = () => (summary ??= buildSummary());
let summaryJson: string | undefined;
export const searchSummaryJson = () => (summaryJson ??= JSON.stringify(searchSummary()));
let json: string | undefined;
export const searchDataJson = () => (json ??= JSON.stringify(build()));

// 書き出す場所。名前は中身の SHA-256 の先頭8桁（取組のページの URL と同じ長さ）
export const searchDataHash = () => sha8(searchDataJson());
export const searchDataPath = () => `/torikumi/data-${searchDataHash()}.json`;
export const searchSummaryHash = () => searchSummary().hash;
export const searchSummaryPath = () => `/torikumi/summary-${searchSummaryHash()}.json`;
// 名前の変わらない控え。公開し直した直後に、キャッシュした前のページ（5分）から開くと、前のハッシュのファイルはもう無いので、こちらを読む
export const SEARCH_DATA_FALLBACK = '/torikumi/data.json';
export const SEARCH_SUMMARY_FALLBACK = '/torikumi/summary.json';

export const jsonResponse = (body: string) => new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
