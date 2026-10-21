// X の公式アカウントで紹介する主な取組の投稿文を、紹介の順に CSV に書き出す（make posts。lib/posts.ts）。
// 書き出す先は引数（既定は tmp/posts.csv。tmp/ は git に入れない）。投稿のデータはリポジトリに置かず、スプレッドシートに貼って使う
import fs from 'node:fs';
import path from 'node:path';
import { getKihonList, getShouraizou, getTorikumiGroups } from '../src/lib/data.ts';
import { SITE } from '../src/lib/links.ts';
import { X_MAX, postGroups, postOrder, postText, xLength } from '../src/lib/posts.ts';
import { themesOf } from '../src/lib/themes.ts';

const out = process.argv[2] || '../tmp/posts.csv';
const limit = Number(process.argv[3]) || Infinity;
const names = new Map(getShouraizou().map((s) => [s.id, s.name]));
const kihon = new Map(getKihonList().map((k) => [k.id, `${k.id} ${k.name}`]));
// 投稿に使う列（A〜J）の後ろに、紹介する取組を選ぶときに見る列（基本施策・くらしのテーマ）を置く
const rows = postOrder(postGroups(getTorikumiGroups())).slice(0, limit).map((g, i) => {
  const text = postText(g);
  const themes = themesOf(g.shisaku.id).map((t) => t.label).join('、');
  return [String(i + 1), g.latest.name, names.get(g.shisaku.shouraizou) ?? '', `${g.shisaku.code} ${g.shisaku.name}`, new URL(g.href, SITE.url).href, text, String(xLength(text)), '', '', '', kihon.get(g.shisaku.kihon_id) ?? '', themes];
});
const over = rows.filter((r) => Number(r[6]) > X_MAX);
if (over.length) throw new Error(`X の上限（${X_MAX}）を超える投稿: ${over.map((r) => r[0]).join(', ')}`);

const csv = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const header = ['順番', '取組', '将来像', '施策', 'ページ', '投稿文', '文字数', '状態', '予約日時', 'BufferのID', '基本施策', 'くらしのテーマ'];
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, [header, ...rows].map((r) => r.map(csv).join(',')).join('\n') + '\n');
console.log(`${out}: ${rows.length} 件`);
