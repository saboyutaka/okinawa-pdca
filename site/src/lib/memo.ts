// ビルドの中で1度だけ作って取っておくもの（データの読み込みとページ用の形。何千ものページから何度も呼ばれる）。
// 返したものは、ほかのページにも同じものを返すので、呼ぶ側で書き換えない
export function once<T>(build: () => T): () => T {
  let made: { value: T } | undefined;
  return () => (made ??= { value: build() }).value;
}
// 引数ごとに1度だけ作る（引数は Map のキーとして比べる。オブジェクトなら同じものか）
export function onceBy<K, T>(build: (key: K) => T): (key: K) => T {
  const made = new Map<K, T>();
  return (key) => {
    if (!made.has(key)) made.set(key, build(key));
    return made.get(key) as T;
  };
}
