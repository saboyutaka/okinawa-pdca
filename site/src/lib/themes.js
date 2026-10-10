// このサイト独自の「くらしのテーマ」（data/reference/themes.json）。県の計画の分類ではないので、画面では必ずそうと分かるように出す。
// 施策は、施策名・施策展開・基本施策の名前に当たる言葉で決める。主な取組・成果指標は、その施策のテーマに加えて、取組・指標の名前に当たるテーマにも入れる
import fs from 'node:fs';
import path from 'node:path';
import { getShisakuList, getKihonList } from './data.js';

const FILE = path.resolve(process.cwd(), '../data/reference/themes.json');

let themes;
export function getThemes() {
  if (themes) return themes;
  const conf = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  const kihonName = new Map(getKihonList().map((k) => [k.id, k.name]));
  const list = getShisakuList();
  themes = conf.themes.map((t) => {
    const re = new RegExp(t.match);
    const ids = list
      .filter((s) => (re.test(`${s.name} ${s.tenkai_name} ${kihonName.get(s.kihon_id)}`) || t.include.includes(s.id)) && !t.exclude.includes(s.id))
      .map((s) => s.id);
    // 画面に出す「決め方」の言葉（先読みなどの正規表現の記号は除く）
    const words = t.match.replace(/\(\?[!=][^)]*\)/g, '').split('|');
    return { ...t, re, words, ids, idSet: new Set(ids) };
  });
  const missing = unthemed();
  if (missing.length) console.warn(`[themes] どのテーマにも入らない施策が ${missing.length} あります: ${missing.map((s) => s.id).join(', ')}（data/reference/themes.json を直してください）`);
  return themes;
}

export const getTheme = (id) => getThemes().find((t) => t.id === id);
export const themesOf = (shisakuId) => getThemes().filter((t) => t.idSet.has(shisakuId));
export function unthemed() {
  const inAny = new Set(getThemes().flatMap((t) => t.ids));
  return getShisakuList().filter((s) => !inAny.has(s.id));
}

// 主な取組・成果指標のテーマ（施策のテーマ ＋ 名前に当たるテーマ）。テーマの並びは themes.json の順
export function themesOfItem(shisakuId, name) {
  const n = name || '';
  return getThemes().filter((t) => t.idSet.has(shisakuId) || (!t.exclude.includes(shisakuId) && t.re.test(n)));
}
export const themeIdsOfItem = (shisakuId, name) => themesOfItem(shisakuId, name).map((t) => t.id);
