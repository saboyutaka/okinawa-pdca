// このサイト独自の「くらしのテーマ」（data/reference/themes.json）。県の計画の分類ではないので、画面では必ずそうと分かるように出す。
// 施策は、施策名・施策展開・基本施策の名前に当たる言葉で決める。主な取組・成果指標は、その施策のテーマに入る（docs/site.md の 5章）
import fs from 'node:fs';
import path from 'node:path';
import { getShisakuList, getKihonList } from './data.ts';
import type { ThemeConfig } from './types.ts';

// くらしのテーマ（themes.json の1つに、当てる正規表現と、入る施策 ID を付けたもの）
export interface Theme extends ThemeConfig {
  words: string[]; // 画面に出す「決め方」の言葉
  ids: string[];
  idSet: Set<string>;
}

const FILE = path.resolve(process.cwd(), '../data/reference/themes.json');

let themes: Theme[] | undefined;
export function getThemes(): Theme[] {
  if (themes) return themes;
  const conf: { themes: ThemeConfig[] } = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  const kihonName = new Map(getKihonList().map((k) => [k.id, k.name]));
  const list = getShisakuList();
  themes = conf.themes.map((t) => {
    const re = new RegExp(t.match);
    const ids = list
      .filter((s) => (re.test(`${s.name} ${s.tenkai_name} ${kihonName.get(s.kihon_id)}`) || t.include.includes(s.id)) && !t.exclude.includes(s.id))
      .map((s) => s.id);
    return { ...t, words: matchWords(t.match), ids, idSet: new Set(ids) };
  });
  const missing = unthemed();
  if (missing.length) console.warn(`[themes] どのテーマにも入らない施策が ${missing.length} あります: ${missing.map((s) => s.id).join(', ')}（data/reference/themes.json を直してください）`);
  return themes;
}

// 画面に出す「決め方」の言葉。match を | で分け、先読み・後読み（(?!…)・(?<!…) など）は除く
export const matchWords = (match: string) => match.replace(/\(\?<?[!=][^)]*\)/g, '').split('|');

export const themesOf = (shisakuId: string) => getThemes().filter((t) => t.idSet.has(shisakuId));
export const themeIdsOf = (shisakuId: string) => themesOf(shisakuId).map((t) => t.id);
export function unthemed() {
  const inAny = new Set(getThemes().flatMap((t) => t.ids));
  return getShisakuList().filter((s) => !inAny.has(s.id));
}
