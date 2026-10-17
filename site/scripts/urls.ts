// URL の一覧（urls.txt）に、いまの全ページの URL を足して書き直す（make urls）。消えた URL は残す（公開した URL を守るため。docs/site.md の 8章）
import fs from 'node:fs';
import { URLS_FILE, pagePaths, parseUrlList, updateUrlList, urlListText } from '../src/lib/routes.ts';

const read = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '');
const listed = parseUrlList(read(URLS_FILE));
const next = updateUrlList(listed, pagePaths());
fs.writeFileSync(URLS_FILE, urlListText(next));

console.log(`urls.txt: ${next.length} 件（足した ${next.length - listed.length} 件）`);
