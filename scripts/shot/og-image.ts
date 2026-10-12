// SNS のカードの画像（og:image。どのページも同じ1枚）を、HTML から PNG に書き出す。
//
// 使い方（コンテナ shot の中で動かす）: make og-image
//
// - 書き出し先・大きさは site/src/lib/seo.ts の OG_IMAGE（site/public/og-image.png。1200×630）。この画像は git に入れる
// - 文字はサイトの名前・説明・作り手（site/src/lib/links.ts の SITE・PROJECT）から入れる。名前を変えたら作り直す
// - 見た目はトップのヒーローに合わせる（空色の地に太い線と硬い影のステッカー、角にピンクと薄紫の丸。docs/design.md の2章）。
//   色は site/src/styles/global.css の :root と同じ値。SNS では小さく出るので、線と影はページより太くする
// - 日本語の書体はコンテナの Noto Sans CJK JP（サイトは日本語のウェブフォントを読み込まず端末の書体で出すので、丸ゴシックではない）
import { chromium } from 'playwright';
import { SITE, PROJECT } from '../../site/src/lib/links.ts';
import { OG_IMAGE } from '../../site/src/lib/seo.ts';

const OUT = `site/public${OG_IMAGE.path}`;
const { width, height } = OG_IMAGE;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<style>
  :root { --bg: #eef3ff; --paper: #ffffff; --ink: #151a3d; --ink-2: #464c74; --line: #151a3d; --pop: #3355ff; --pop-ink: #ffffff; --sky: #d6e4ff; --lilac: #e8defc; --pink: #ffe0ef; }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${width}px; height: ${height}px; }
  body { background: var(--bg); color: var(--ink); font-family: "Noto Sans CJK JP", sans-serif; padding: 44px 56px 56px 44px; }
  .card {
    position: relative; overflow: hidden; display: flex; flex-direction: column; height: 100%; padding: 52px 64px 48px;
    background: var(--sky); border: 5px solid var(--line); border-radius: 40px; box-shadow: 12px 12px 0 var(--line);
  }
  .card::before, .card::after { content: ""; position: absolute; border-radius: 50%; border: 5px solid var(--line); }
  .card::before { width: 300px; height: 300px; right: -96px; top: -120px; background: var(--pink); }
  .card::after { width: 140px; height: 140px; left: -60px; bottom: -60px; background: var(--lilac); }
  .card > * { position: relative; z-index: 1; }
  .mark {
    display: grid; place-items: center; width: 136px; height: 70px; border-radius: 999px; transform: rotate(-4deg);
    background: var(--pop); color: var(--pop-ink); border: 5px solid var(--line); box-shadow: 5px 5px 0 var(--line);
    font-weight: 700; font-size: 29px; letter-spacing: 0.04em;
  }
  h1 { margin-top: 40px; font-size: 84px; font-weight: 700; line-height: 1.2; }
  .tagline { margin-top: 18px; font-size: 44px; font-weight: 700; line-height: 1.3; }
  .foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
  .by { background: var(--paper); border: 4px solid var(--line); border-radius: 999px; padding: 4px 28px 6px; font-size: 32px; font-weight: 700; }
  .by small { margin-right: 10px; font-size: 26px; font-weight: 400; color: var(--ink-2); }
  .host { font-size: 28px; font-weight: 700; color: var(--ink-2); }
</style>
</head>
<body>
  <div class="card">
    <div class="mark">PDCA</div>
    <h1>${esc(SITE.name)}</h1>
    <p class="tagline">${esc(SITE.tagline)}</p>
    <div class="foot">
      <span class="by"><small>by</small>${esc(PROJECT.org)}</span>
      <span class="host">${esc(new URL(SITE.url).host)}</span>
    </div>
  </div>
</body>
</html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'ja-JP' });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.screenshot({ path: OUT });
  console.log(OUT);
} finally {
  await browser.close();
}
