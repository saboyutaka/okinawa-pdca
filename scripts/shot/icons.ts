// site/src/assets/favicon.svg から、SVG の favicon を読まないところ向けの画像を書き出す（ロゴを変えたら make icons）。
//
//   site/src/assets/favicon.ico          … 16・32・48px（古いブラウザ・ブックマーク・Windows のショートカット）
//   site/src/assets/apple-touch-icon.png … 180px（iPhone のホーム画面）。角は端末が丸めるので、縁（#edge）を消し、
//                                          四角の角の丸み（rect の rx）を外して、絵を四隅まで広げる
//   site/src/assets/sns-icon.png         … 1024px（X などの SNS のアカウントの画像）。丸く切り抜かれるので、地を広げて絵の周りを空ける
//
// コンテナ shot の Chromium で SVG を描いて撮る（ホストに画像のツールを入れないため）
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { LOGO_SRC, fullBleed, readLogo, roundSafe, tileColor } from './logo.ts';

const svg = await readLogo();
const tile = tileColor(svg);

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

// 縁の内側だけを 180px に広げる
await writeFile('site/src/assets/apple-touch-icon.png', await png(180, fullBleed(svg), tile));
await writeFile('site/src/assets/sns-icon.png', await png(1024, roundSafe(svg), tile));

await browser.close();
console.log(`favicon.ico（${sizes.join('・')}px）・apple-touch-icon.png（180px）・sns-icon.png（1024px）を ${LOGO_SRC} から書き出した`);
