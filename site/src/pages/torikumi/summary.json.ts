// 取組をさがすの「やったこと」の、名前の変わらない控え（lib/search-data.ts の SEARCH_SUMMARY_FALLBACK）。
// ふだんは名前にハッシュの付いた summary-<ハッシュ>.json を読む。公開し直した直後に、前のページから開いたときだけこちらを読む
import { jsonResponse, searchSummaryJson } from '../../lib/search-data.ts';

export const GET = () => jsonResponse(searchSummaryJson());
