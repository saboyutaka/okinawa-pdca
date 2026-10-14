// 年を西暦で表示するときに読む、書き換えのスクリプト（中身は lib/era.ts）。名前に中身のハッシュを入れて書き出し、ずっとキャッシュさせる（public/_headers）
import { ERA_JS, ERA_JS_PATH } from '../lib/era.ts';

export const getStaticPaths = () => [{ params: { hash: ERA_JS_PATH.slice('/era-'.length, -'.js'.length) } }];

export const GET = () => new Response(ERA_JS, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } });
