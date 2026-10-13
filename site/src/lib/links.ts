// 県の公式ページ（説明文の用語のリンク先）。URL は 2026-10-10 に開けることを確認した
export const LINKS = {
  pdca: 'https://www.pref.okinawa.jp/kensei/shisaku/1014252/index.html', // 沖縄県PDCA（入口）
  pdcaGaiyou: 'https://www.pref.okinawa.jp/kensei/shisaku/1014252/1014253/1023439.html', // 沖縄県PDCAの概要
  kekka: 'https://www.pref.okinawa.jp/kensei/shisaku/1014252/1014253/index.html', // 沖縄県PDCA実施結果（年度別）
  kihonKeikaku: 'https://www.pref.okinawa.jp/kensei/shisaku/1014211/1014223/1014250/index.html', // 新・沖縄21世紀ビジョン基本計画
  jisshiKeikaku: 'https://www.pref.okinawa.jp/kensei/shisaku/1014211/1014230/index.html', // 沖縄21世紀ビジョン実施計画（一覧）
  zenki: 'https://www.pref.okinawa.jp/kensei/shisaku/1014211/1014230/1014251.html', // 実施計画（前期: R4〜R6）
  chuki: 'https://www.pref.okinawa.jp/kensei/shisaku/1014211/1014230/1034436.html', // 実施計画（中期: R7〜R9）
  kikakuChousei: 'https://enq.pref.okinawa.lg.jp/cgi-bin/contacts/G030010010', // 企画部企画調整課（沖縄県PDCAの担当）の問い合わせフォーム
  kankoRm: 'https://www.pref.okinawa.jp/shigoto/kankotokusan/1011671/1011741/1011810.html', // 沖縄観光推進ロードマップ（年度別の PDCA へのリンクがある）
  kankoPlan: 'https://www.pref.okinawa.jp/shigoto/kankotokusan/1011671/1011741/1011762/index.html', // 沖縄県観光振興基本計画
  ikkatsu: 'https://www.pref.okinawa.jp/kensei/yosan/1015205/1015216/index.html', // 沖縄振興特別推進交付金の事後評価（年度別）
  hyoka: 'https://www.pref.okinawa.jp/kensei/shisaku/1014211/1014223/1039989.html', // 新・沖縄21世紀ビジョン基本計画 評価検証報告書
};

// このサイトの名前。計画が描いた沖縄のみらいが、いまどこまで来たかを見る。口で言うときは縮めて「みらいま」（SNS のハッシュタグは lib/iken.ts の HASHTAG）。
// 「沖縄県PDCA」で探す人に見つけてもらうため、トップのページの題名とヒーローの頭には tagline も付ける。
// url は本番のトップの URL（astro.config.ts の site・canonical・シェアの URL・sitemap・構造化データがここから作る。lib/seo.ts）
export const SITE = {
  name: 'おきなわ、みらい、いま',
  short: 'みらいま',
  tagline: '沖縄県PDCAを読みとく非公式サイト',
  url: 'https://okinawa-miraima.com/',
};

// まだ公開前（ステルス）。県への問い合わせが済むまでは、検索エンジンに載せず（noindex）、全ページのヘッダーの上にベータ版の帯を出して
// そのことを伝える（layouts/Base.astro）。SNS のシェアボタンは、このあいだも出す。
// 公開してよくなったら false にし、public/_headers の X-Robots-Tag も外す
export const STEALTH = true;

// このサイトを作っている団体と管理者、制作に協力してくれた人
export const PROJECT = {
  org: 'Code for Okinawa',
  orgUrl: 'https://code4okinawa.org/',
  orgGithub: 'https://github.com/CodeforOkinawa',
  brigades: 'https://www.code4japan.org/brigade', // Code for Japan のブリゲード（地域のコミュニティ）の一覧
  maintainerName: '立花 豊',
  maintainer: 'saboyutaka',
  maintainerX: 'https://x.com/saboyutaka',
  collaborators: ['石垣綾音', '日髙春奈'], // 制作協力（/code-for-okinawa/ の運営の欄）
  miraiTeian: 'https://thinkokinawa.studio.site', // 沖縄未来提案プロジェクト（2021年に新・沖縄21世紀ビジョン基本計画の骨子案を読んだ会。このサイトのなりたち）
};
