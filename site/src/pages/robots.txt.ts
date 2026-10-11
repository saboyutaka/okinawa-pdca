// robots.txt。巡回は止めず、sitemap の場所だけを書く（中身は lib/seo.ts）。Cloudflare の管理用の robots.txt を有効にしていると、Cloudflare がこの頭に書き足す
import { robotsTxt } from '../lib/seo.ts';

export const GET = () => new Response(robotsTxt(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
