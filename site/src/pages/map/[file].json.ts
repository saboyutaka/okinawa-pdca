// 指標のマップのマスの中身（中身は lib/map-data.ts）。指標ごとに、名前に中身のハッシュを入れたもの（/map/seika-<ハッシュ>.json。ずっとキャッシュさせる。public/_headers）と、
// 名前の変わらない控え（/map/seika.json。公開し直した直後に、前のページから開いたときだけ読む）を書き出す
import { jsonResponse } from '../../lib/search-data.ts';
import { MAP_KINDS, mapDataHash, mapDataJson, type MapKind } from '../../lib/map-data.ts';

export const getStaticPaths = () =>
  MAP_KINDS.flatMap(({ kind }) => [
    { params: { file: `${kind}-${mapDataHash(kind)}` }, props: { kind } },
    { params: { file: kind }, props: { kind } },
  ]);

export const GET = ({ props }: { props: { kind: MapKind } }) => jsonResponse(mapDataJson(props.kind));
