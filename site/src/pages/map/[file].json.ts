// 指標のマップのマスの中身と、キーワードで探す文字（中身は lib/map-data.ts）。名前に中身のハッシュを入れたもの（/map/seika-<ハッシュ>.json・/map/search-<ハッシュ>.json。
// ずっとキャッシュさせる。public/_headers）と、名前の変わらない控え（/map/seika.json・/map/search.json。公開し直した直後に、前のページから開いたときだけ読む）を書き出す
import { jsonResponse } from '../../lib/hashed.ts';
import { MAP_KINDS, MAP_SEARCH_FALLBACK, mapDataHash, mapDataJson, mapSearchJson, mapSearchPath, type MapKind } from '../../lib/map-data.ts';

type Of = MapKind | 'search';
const file = (path: string) => path.replace(/^\/map\/|\.json$/g, '');
export const getStaticPaths = () => [
  ...MAP_KINDS.flatMap(({ kind }) => [
    { params: { file: `${kind}-${mapDataHash(kind)}` }, props: { of: kind as Of } },
    { params: { file: kind }, props: { of: kind as Of } },
  ]),
  { params: { file: file(mapSearchPath()) }, props: { of: 'search' as Of } },
  { params: { file: file(MAP_SEARCH_FALLBACK) }, props: { of: 'search' as Of } },
];

export const GET = ({ props }: { props: { of: Of } }) => jsonResponse(props.of === 'search' ? mapSearchJson() : mapDataJson(props.of));
