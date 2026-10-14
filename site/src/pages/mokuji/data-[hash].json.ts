// 計画の目次のデータ（中身は lib/tree-data.ts）。名前に中身のハッシュを入れて書き出し、ずっとキャッシュさせる（public/_headers）
import { jsonResponse } from '../../lib/search-data.ts';
import { treeDataHash, treeDataJson } from '../../lib/tree-data.ts';

export const getStaticPaths = () => [{ params: { hash: treeDataHash() } }];

export const GET = () => jsonResponse(treeDataJson());
