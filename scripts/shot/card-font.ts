// SNS のカードの画像（site/src/lib/card.ts）で使う字だけを、Noto Sans CJK JP の Bold から切り出す。
//
// 使い方（コンテナ shot の中で動かす）: make card-font
//
// - 書き出すのは site/src/fonts/card-bold.woff（satori は WOFF2 を読めないので WOFF）と、入れた字の一覧 site/src/fonts/card-chars.txt。どちらも git に入れる
// - 字はカードの要素の木から集める（lib/card.ts の cardChars）。データや画面の言葉が変わって新しい字が出ると、
//   make test（site/test/card.test.ts）とビルド（lib/card-render.ts）が止まるので、そのときに動かす
// - 書体はコンテナの Noto Sans CJK JP（Debian の fonts-noto-cjk。SIL OFL。ライセンスは site/public/fonts/NotoSansCJK-OFL.txt）。
//   TTC（日中韓の書体をまとめたファイル）の0番目が JP。subset-font は TTC を読めないので、0番目の書体を取り出して渡す
// - 書体に無い字（CO₂ の ₂ など）は、切り出すと黙って落ちるので、先に確かめて止める（lib/card.ts の fold で、書体にある字に置き換える）
import { readFile, writeFile } from 'node:fs/promises';
import { Blob, Face } from 'harfbuzzjs';
import subsetFont from 'subset-font';

const SRC = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';
const OUT = 'src/fonts/card-bold.woff';
const CHARS = 'src/fonts/card-chars.txt';

// site/src/lib はデータとスタイルを site/ からの相対パスで読むので、site/ に移ってから読み込む
process.chdir('site');
const { cardChars } = await import('../../site/src/lib/card.ts');

// TTC から index 番目の書体を、1つの OpenType のファイル（sfnt）にして取り出す
function fromCollection(ttc: Buffer, index: number): Buffer {
  if (ttc.toString('ascii', 0, 4) !== 'ttcf') return ttc;
  const at = ttc.readUInt32BE(12 + 4 * index);
  const n = ttc.readUInt16BE(at + 4);
  const head = Buffer.alloc(12 + 16 * n);
  ttc.copy(head, 0, at, at + 12);
  const bodies: Buffer[] = [];
  let offset = head.length;
  for (let i = 0; i < n; i++) {
    const rec = at + 12 + 16 * i;
    const [from, length] = [ttc.readUInt32BE(rec + 8), ttc.readUInt32BE(rec + 12)];
    ttc.copy(head, 12 + 16 * i, rec, rec + 8); // 表の名前とチェックサム
    head.writeUInt32BE(offset, 12 + 16 * i + 8);
    head.writeUInt32BE(length, 12 + 16 * i + 12);
    const padded = Buffer.alloc((length + 3) & ~3);
    ttc.copy(padded, 0, from, from + length);
    bodies.push(padded);
    offset += padded.length;
  }
  return Buffer.concat([head, ...bodies]);
}

const chars = cardChars();
const src = fromCollection(await readFile(SRC), 0);
const have = new Set(new Face(new Blob(src), 0).collectUnicodes());
const missing = [...chars].filter((c) => !have.has(c.codePointAt(0)!));
if (missing.length) throw new Error(`Noto Sans CJK JP に無い字がある: ${missing.join(' ')}（site/src/lib/card.ts の fold で、書体にある字に置き換える）`);
const font = await subsetFont(src, chars, { targetFormat: 'woff', noHinting: true });
await writeFile(OUT, font);
await writeFile(CHARS, `${chars}\n`);
console.log(`site/${OUT}: ${[...chars].length}字・${Math.round(font.length / 1024)}KB`);
