// SNS のカードの画像（og:image。どのページも同じ1枚）を、HTML から PNG に書き出す。
//
// 使い方（コンテナ shot の中で動かす）: make og-image
//
// - 書き出し先・大きさは site/src/lib/seo.ts の OG_IMAGE（site/public/og-image.png。1200×630）。この画像は git に入れる
// - 文字はサイトの名前・説明・作り手（site/src/lib/links.ts の SITE・PROJECT）から入れる。名前を変えたら作り直す
// - ロゴの絵は site/public/favicon.svg を読んで使う（絵を写さない。ロゴを変えたら make icons と一緒に作り直す）。
//   ヘッダーと同じく、ロゴを名前の前に小さく置いて1行に並べる（説明は名前の頭にそろえる）。ヘッダーの印（styles/global.css の .site-title .mark）と同じく、
//   角の丸い四角に太い線と硬い影を付けて -4° 傾ける
// - 名前と説明の下に、サイトの成果指標の図（site/src/scripts/charts.ts の seika）と同じ形の線を絵として入れる（データではない）。
//   点線の計画の道すじと白い丸がゴールへ向かい、青い実績の線と点の最新に「いまここ」の札。順調・遅れのどちらかに見えないよう、
//   実績の点は計画の線の上と下に交互に置き、いまここは計画の線の上に置く（docs/design.md の1章）
// - 地はトップのヒーローに合わせる（空色のステッカー、角にピンクと薄紫の丸。docs/design.md の2章）。
//   色は site/src/styles/global.css の :root と同じ値。SNS では小さく出るので、線と影はページより太くする
// - 日本語の書体はコンテナの Noto Sans CJK JP（サイトは日本語のウェブフォントを読み込まず端末の書体で出すので、丸ゴシックではない）
import { chromium } from 'playwright';
import { SITE, PROJECT } from '../../site/src/lib/links.ts';
import { OG_IMAGE } from '../../site/src/lib/seo.ts';
import { fullBleed, readLogo, tileColor } from './logo.ts';

const OUT = `site/public${OG_IMAGE.path}`;
const { width, height } = OG_IMAGE;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const logo = await readLogo();

// 図（絵）。横は6つの年度の枠、縦は小さいほど上。数は見た目だけで決めたもので、データではない
type Pt = [x: number, y: number];
const G = { w: 962, h: 176 };
const slot = (i: number) => 90 + i * 156;
const start: Pt = [24, 152];
const plan: Pt[] = [144, 124, 104, 84, 62, 38].map((y, i) => [slot(i), y]);
const actual: Pt[] = [120, 148, 80, 84].map((y, i) => [slot(i), y]);
const now = actual[actual.length - 1];
const d = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
const graph = `<svg class="graph" viewBox="0 0 ${G.w} ${G.h}" width="${G.w}" height="${G.h}">
  ${[24, 88, 152].map((y) => `<line x1="0" x2="${G.w}" y1="${y}" y2="${y}" stroke="var(--grid)" stroke-width="2" />`).join('')}
  <path d="${d([start, ...plan])}" fill="none" stroke="var(--ink-2)" stroke-width="4" stroke-dasharray="12 9" stroke-linejoin="round" />
  <circle cx="${start[0]}" cy="${start[1]}" r="6" fill="var(--ink-2)" />
  ${plan.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === plan.length - 1 ? 13 : 10}" fill="var(--paper)" stroke="var(--ink-2)" stroke-width="4" />`).join('')}
  <path d="${d(actual)}" fill="none" stroke="var(--pop)" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" />
  ${actual.slice(0, -1).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="var(--pop)" stroke="var(--line)" stroke-width="3.5" />`).join('')}
  <circle cx="${now[0]}" cy="${now[1]}" r="16" fill="var(--pop)" stroke="var(--line)" stroke-width="4.5" />
  <rect x="${now[0] + 26}" y="${now[1] + 12}" width="150" height="46" rx="23" fill="var(--paper)" stroke="var(--line)" stroke-width="4" />
  <text x="${now[0] + 101}" y="${now[1] + 45}" text-anchor="middle" font-size="26" font-weight="700" fill="var(--ink)">いまここ</text>
</svg>`;

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<style>
  :root { --bg: #eef3ff; --paper: #ffffff; --ink: #151a3d; --ink-2: #464c74; --line: #151a3d; --sky: #d6e4ff; --lilac: #e8defc; --pink: #ffe0ef; --pop: #3355ff; --grid: #c4c9e6; --logo-sky: ${tileColor(logo)}; }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${width}px; height: ${height}px; }
  body { background: var(--bg); color: var(--ink); font-family: "Noto Sans CJK JP", sans-serif; padding: 44px 56px 56px 44px; }
  .card {
    position: relative; overflow: hidden; display: flex; flex-direction: column; height: 100%; padding: 44px 64px 40px;
    background: var(--sky); border: 5px solid var(--line); border-radius: 40px; box-shadow: 12px 12px 0 var(--line);
  }
  .card::before, .card::after { content: ""; position: absolute; border-radius: 50%; border: 5px solid var(--line); }
  .card::before { width: 150px; height: 150px; right: -60px; top: -80px; background: var(--pink); } /* 線が名前にかからない大きさ */
  .card::after { width: 140px; height: 140px; left: -60px; bottom: -60px; background: var(--lilac); }
  .card > * { position: relative; z-index: 1; }
  .main { --logo-w: 104px; --logo-gap: 28px; }
  .head { display: flex; align-items: center; gap: var(--logo-gap); }
  .logo {
    flex: none; width: var(--logo-w); height: var(--logo-w); border-radius: 30%; overflow: hidden; transform: rotate(-4deg);
    background: var(--logo-sky); border: 5px solid var(--line); box-shadow: 5px 5px 0 var(--line);
  }
  .logo svg { display: block; width: 100%; height: 100%; }
  h1 { font-size: 72px; font-weight: 700; line-height: 1.2; white-space: nowrap; }
  .tagline { margin: 14px 0 0 calc(var(--logo-w) + var(--logo-gap)); font-size: 40px; font-weight: 700; line-height: 1.3; }
  /* 図は説明と by の行のあいだの残りの高さの真ん中に置く */
  .graph-box { flex: 1; display: flex; align-items: center; }
  .graph { display: block; font-family: inherit; }
  .foot { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
  .by { background: var(--paper); border: 4px solid var(--line); border-radius: 999px; padding: 4px 28px 6px; font-size: 32px; font-weight: 700; }
  .by small { margin-right: 10px; font-size: 26px; font-weight: 400; color: var(--ink-2); }
  .host { font-size: 28px; font-weight: 700; color: var(--ink-2); }
</style>
</head>
<body>
  <div class="card">
    <div class="main">
      <div class="head">
        <div class="logo">${fullBleed(logo)}</div>
        <h1>${esc(SITE.name)}</h1>
      </div>
      <p class="tagline">${esc(SITE.tagline)}</p>
    </div>
    <div class="graph-box">${graph}</div>
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
