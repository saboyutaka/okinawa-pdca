// site/src/assets/favicon.svg から、SVG の favicon を読まないところ向けの画像を書き出す（ロゴを変えたら make icons）。
//
//   site/src/assets/favicon.ico          … 16・32・48px（古いブラウザ・ブックマーク・Windows のショートカット）
//   site/src/assets/apple-touch-icon.png … 180px（iPhone のホーム画面）。角は端末が丸めるので、縁（#edge）を消し、
//                                          四角の角の丸み（rect の rx）を外して、絵を四隅まで広げる
//
// コンテナ shot の Chromium で SVG を描いて撮る（ホストに画像のツールを入れないため）
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const SRC = 'site/src/assets/favicon.svg';
const svg = await readFile(SRC, 'utf8');
const tile = svg.match(/id="tile"[^>]*fill="([^"]+)"/)?.[1];
if (!tile) throw new Error(`${SRC} に id="tile" の地の四角が見つからない`);

const browser = await chromium.launch();
const page = await browser.newPage();

// size px 四方で撮る。bg が無ければ地を透かす
async function png(size: number, markup: string, bg?: string): Promise<Buffer> {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:${bg ?? 'transparent'}}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`);
  return page.screenshot({ omitBackground: !bg });
}

// ICO の中には PNG をそのまま入れる（いまのブラウザと Windows はどれも読める）
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2); // 種類: アイコン
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size, e);
    head.writeUInt8(size, e + 1);
    head.writeUInt16LE(1, e + 4); // 色の面
    head.writeUInt16LE(32, e + 6); // 1画素のビット数
    head.writeUInt32LE(data.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...images.map((im) => im.data)]);
}

const sizes = [16, 32, 48];
const images = [];
for (const size of sizes) images.push({ size, data: await png(size, svg) });
await writeFile('site/src/assets/favicon.ico', ico(images));

// 縁の内側だけを 180px に広げ、縁と四角の角の丸みを消す（丘が下の角まで続くように。ellipse の rx は残す）
const touch = svg
  .replace(/viewBox="[^"]*"/, 'viewBox="1.2 1.2 33.6 33.6"')
  .replace(/<rect id="edge"[^>]*\/>/, '')
  .replace(/(<rect[^>]*?)\srx="[^"]*"/g, '$1');
await writeFile('site/src/assets/apple-touch-icon.png', await png(180, touch, tile));

await browser.close();
console.log(`favicon.ico（${sizes.join('・')}px）と apple-touch-icon.png（180px）を ${SRC} から書き出した`);
