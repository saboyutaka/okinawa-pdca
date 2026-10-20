// 予算事業をさがすの検索用データ（中身は lib/jigyo-data.ts）。名前に中身のハッシュを入れて書き出し、ずっとキャッシュさせる（public/_headers）
import { jsonResponse } from '../../../lib/hashed.ts';
import { jigyoDataHash, jigyoDataJson } from '../../../lib/jigyo-data.ts';

export const getStaticPaths = () => [{ params: { hash: jigyoDataHash() } }];

export const GET = () => jsonResponse(jigyoDataJson());
