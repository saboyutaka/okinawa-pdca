// 取組をさがすの検索用データ（中身は lib/search-data.ts）。名前に中身のハッシュを入れて書き出し、ずっとキャッシュさせる（public/_headers）
import { jsonResponse, searchDataHash, searchDataJson } from '../../lib/search-data.ts';

export const getStaticPaths = () => [{ params: { hash: searchDataHash() } }];

export const GET = () => jsonResponse(searchDataJson());
