// 計画の目次のデータの、名前の変わらない控え（lib/tree-data.ts の TREE_DATA_FALLBACK）。
// ふだんは名前にハッシュの付いた data-<ハッシュ>.json を読む。公開し直した直後に、前のページから開いたときだけこちらを読む
import { jsonResponse } from '../../lib/hashed.ts';
import { treeDataJson } from '../../lib/tree-data.ts';

export const GET = () => jsonResponse(treeDataJson());
