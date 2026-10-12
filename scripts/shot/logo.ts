// ロゴの絵（site/public/favicon.svg）を、favicon 以外の画像（icons.ts・og-image.ts）でも使うための関数
import { readFile } from 'node:fs/promises';

export const LOGO_SRC = 'site/public/favicon.svg';

export const readLogo = () => readFile(LOGO_SRC, 'utf8');

// 地の四角（id="tile"）の色
export function tileColor(svg: string): string {
  const tile = svg.match(/id="tile"[^>]*fill="([^"]+)"/)?.[1];
  if (!tile) throw new Error(`${LOGO_SRC} に id="tile" の地の四角が見つからない`);
  return tile;
}

// 縁（id="edge"）の内側だけを描き、縁と四角の角の丸み（rect の rx）を消す（丘が下の角まで続くように。ellipse の rx は残す）。
// 角を丸めて縁を付けるのは、描く側（端末・CSS）に任せる
export const fullBleed = (svg: string) =>
  svg
    .replace(/viewBox="[^"]*"/, 'viewBox="1.2 1.2 33.6 33.6"')
    .replace(/<rect id="edge"[^>]*\/>/, '')
    .replace(/(<rect[^>]*?)\srx="[^"]*"/g, '$1');
