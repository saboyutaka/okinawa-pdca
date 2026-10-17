// ビルドで書き出すファイルのうち、名前に中身のハッシュを入れるもの（取組をさがす・計画の目次・指標のマップの JSON、年を西暦で表示するときのスクリプト）。
// ブラウザにずっとキャッシュさせ（public/_headers）、中身が変われば名前も変わる。ビルドの中でだけ使う（Node の機能を使う）
import { createHash } from 'node:crypto';

// 中身の SHA-256 の先頭8桁（取組のページの URL と同じ長さ）
export const sha8 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 8);

export const jsonResponse = (body: string) => new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
