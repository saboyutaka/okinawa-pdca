// URL の一覧（urls.txt）に、いまの全ページの URL を足して書き直す（make urls）。消えた URL は残す（公開した URL を守るため）。
// --prune: ページも転送（public/_redirects）も無くなった URL を消す。公開前だけ使う（docs/site.md の 8章）
import fs from 'node:fs';
import { REDIRECTS_FILE, URLS_FILE, pagePaths, parseRedirects, parseUrlList, updateUrlList, urlListText } from '../src/lib/routes.ts';

const read = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '');
const prune = process.argv.includes('--prune');
const listed = parseUrlList(read(URLS_FILE));
const next = updateUrlList(listed, pagePaths(), parseRedirects(read(REDIRECTS_FILE)), prune);
fs.writeFileSync(URLS_FILE, urlListText(next));

const before = new Set(listed);
const after = new Set(next);
const added = next.filter((u) => !before.has(u)).length;
const removed = listed.filter((u) => !after.has(u));
console.log(`urls.txt: ${next.length} 件（足した ${added} 件・消した ${removed.length} 件）`);
for (const u of removed.slice(0, 20)) console.log(`  消した: ${u}`);
if (removed.length > 20) console.log(`  ほか ${removed.length - 20} 件`);
