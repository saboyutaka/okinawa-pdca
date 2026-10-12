// SNS のカードの画像を PNG にする（lib/card.ts の要素の木 → satori で SVG → resvg で PNG）。ビルドで pages/og/[...card].png.ts が使う。
// 字の形は src/fonts/card-bold.woff（カードで使う字だけを切り出した Noto Sans CJK JP の Bold。make card-font）。
// 中身が前のビルドと同じ画像は描き直さず、キャッシュのものを使う（lib/card-cache.ts）
import fs from 'node:fs';
import path from 'node:path';
import satori from 'satori';
import { renderAsync } from '@resvg/resvg-js';
import { CARD_FONT, CARD_SIZE, type El } from './card.ts';
import { cacheFile, readCache, writeCache } from './card-cache.ts';

let font: Buffer | undefined;

export async function renderCard(node: El): Promise<Buffer> {
  const file = cacheFile(JSON.stringify(node));
  const cached = readCache(file);
  if (cached) return cached;
  font ??= fs.readFileSync(path.resolve(process.cwd(), 'src/fonts/card-bold.woff'));
  // satori は React の要素を受け取る形で書かれているが、同じ形のただのオブジェクトでよい（React は入れない）
  const svg = await satori(node as unknown as Parameters<typeof satori>[0], {
    ...CARD_SIZE,
    fonts: [{ name: CARD_FONT, data: font, weight: 700, style: 'normal' }],
    // フォントに無い字があると、satori はほかの書体を取りに来る。字が欠けた画像を書き出さないよう、ここで止める
    loadAdditionalAsset: async (_code, segment) => {
      throw new Error(`カードの画像のフォントに無い字がある（「${segment}」）。make card-font で切り出し直す`);
    },
  });
  // 描くのは時間がかかる（1枚50ms ほど）ので、メインのスレッドを止めない renderAsync で描き、
  // ビルドでページを並べて書き出すとき（astro.config.ts の build.concurrency）に何枚かを同時に描けるようにする
  const png = (await renderAsync(svg, { fitTo: { mode: 'original' } })).asPng();
  writeCache(file, png);
  return png;
}
