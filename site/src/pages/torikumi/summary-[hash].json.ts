// 取組をさがすの「やったこと」（中身は lib/search-data.ts）。キーワードで探すときだけ読む。名前に中身のハッシュを入れて書き出し、ずっとキャッシュさせる（public/_headers）
import { jsonResponse, searchSummaryHash, searchSummaryJson } from '../../lib/search-data.ts';

export const getStaticPaths = () => [{ params: { hash: searchSummaryHash() } }];

export const GET = () => jsonResponse(searchSummaryJson());
