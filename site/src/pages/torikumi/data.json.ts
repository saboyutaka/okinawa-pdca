// 取組をさがすの検索用データの、名前の変わらない控え（lib/search-data.ts の SEARCH_DATA_FALLBACK）。
// ふだんは名前にハッシュの付いた data-<ハッシュ>.json を読む。公開し直した直後に、前のページから開いたときだけこちらを読む
import { jsonResponse, searchDataJson } from '../../lib/search-data.ts';

export const GET = () => jsonResponse(searchDataJson());
