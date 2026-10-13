// 検索エンジンと SNS に向けた URL・sitemap・robots.txt・構造化データ（JSON-LD）。本番のドメインは lib/links.ts の SITE.url
import { LINKS, PROJECT, SITE } from './links.ts';

// サイトの中のパス（/shisaku/1-1-a-1/・/#themes）を本番の完全な URL にする
export const absUrl = (path: string) => new URL(path, SITE.url).href;

// SNS のカードの画像（og:image）。どのページも同じ1枚（site/public/og-image.png）。
// 画像は scripts/shot/og-image.ts が、ここの大きさとサイトの名前（lib/links.ts の SITE・PROJECT）で書き出す（make og-image）。名前を変えたら作り直す
export const OG_IMAGE = {
  path: '/og-image.png',
  width: 1200,
  height: 630,
  alt: `${SITE.name}（${SITE.tagline}）by ${PROJECT.org}`,
};

// sitemap.xml に入れるページのパス。Astro の astro:build:done が渡す pathname（先頭の / が無く、トップは ''）を / で始まる形にそろえ、
// ページでないもの（/torikumi/data.json・/robots.txt のようにファイルの名前で終わるもの）と 404 を除く
export function sitemapPaths(pathnames: string[]): string[] {
  const paths = pathnames.map((p) => `/${p.replace(/^\/+/, '')}`).filter((p) => p.endsWith('/') && p !== '/404/');
  return [...new Set(paths)].sort();
}

// 書き出したページの HTML から、題名・説明文がほかのページと同じものを探す（検索結果で見分けにくく、検索エンジンに重複とみなされやすいため）。
// pages は sitemap に入れるページ（404 は除く）。見つかったものを、同じ題名・説明文ごとにページの URL を並べて返す
export function duplicateHeads(pages: { path: string; html: string }[]) {
  const kinds = { 題名: /<title>([^<]*)<\/title>/, 説明文: /<meta name="description" content="([^"]*)"/ };
  return Object.entries(kinds).flatMap(([kind, re]) => {
    const byText = new Map<string, string[]>();
    for (const p of pages) {
      const text = p.html.match(re)?.[1];
      if (text) byText.set(text, [...(byText.get(text) || []), p.path]);
    }
    return [...byText].filter(([, paths]) => paths.length > 1).map(([text, paths]) => ({ kind, text, paths }));
  });
}

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const sitemapXml = (paths: string[]) =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...paths.map((p) => `  <url><loc>${xmlEsc(absUrl(p))}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');

// 巡回は止めず、sitemap の場所だけを書く（noindex のページの巡回を止めると noindex が読まれず、URL だけ検索結果に出ることがあるため。docs/deploy.md の4章）
export const robotsTxt = () => ['User-agent: *', 'Allow: /', '', `Sitemap: ${absUrl('/sitemap.xml')}`, ''].join('\n');

// <script type="application/ld+json"> に入れる文字列。名前に </script> のような文字が入っても閉じないように < を逃がす
// （データで、動くスクリプトではないので、CSP のハッシュは要らない。docs/site.md の6章）
export const ldJson = (data: object) => JSON.stringify(data).replace(/</g, '\\u003c');

// 作っているのは Code for Okinawa で、県ではない。県の資料は isBasedOn（このサイトがもとにしたもの）として、作り手を県にして書く
const ORG = { '@type': 'Organization', name: PROJECT.org, url: PROJECT.orgUrl };
const PREF = { '@type': 'GovernmentOrganization', name: '沖縄県' };
// 読み取った県の資料（このサイトについての「出典」と同じ）
const SOURCES = [
  { name: '沖縄県PDCA実施結果', url: LINKS.kekka },
  { name: '沖縄県PDCA（各部局の「主な取組」検証票）', url: LINKS.pdca },
  { name: '沖縄観光推進ロードマップPDCA実施報告書', url: LINKS.kankoRm },
  { name: '沖縄振興特別推進交付金の事後評価', url: LINKS.ikkatsu },
  { name: '新・沖縄21世紀ビジョン基本計画 評価検証報告書', url: LINKS.hyoka },
];

// トップに置く。Google の検索結果に出るサイトの名前は、この name・alternateName から取られる
export const websiteLd = (description: string) => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE.name,
  alternateName: SITE.short,
  url: absUrl('/'),
  description,
  inLanguage: 'ja',
  publisher: ORG,
  isBasedOn: SOURCES.map((s) => ({ '@type': 'CreativeWork', ...s, author: PREF })),
});

// パンくず（components/Crumbs.astro）。href の無い項目（いまのページ）は here の URL にする
export const breadcrumbLd = (items: { href?: string; label: string }[], here: string) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.label, item: absUrl(it.href ?? here) })),
});
