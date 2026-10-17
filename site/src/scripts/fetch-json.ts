// ビルドで書き出した JSON（lib/hashed.ts）を読む。名前にハッシュの付いたファイル（ずっとキャッシュされる）を読み、
// 読めなければ名前の変わらない控えを読む（公開し直した直後に、キャッシュした前のページから開くと、前のハッシュのファイルはもう無いため）
export async function getJson<T>(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as T;
}
export const getJsonOr = <T>(src: string, fallback: string) => getJson<T>(src).catch(() => getJson<T>(fallback));
