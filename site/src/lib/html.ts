// 文字列で組む HTML に入れる文字のエスケープ。ビルド（lib・部品）とブラウザのスクリプトの両方で読み込むので、ほかのファイルを import しない
export const esc = (s: string | number) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
// <script type="application/json"> や <script type="application/ld+json"> に入れる JSON。中の文字に </script> があっても閉じないように < を逃がす
// （データで、動くスクリプトではないので、CSP のハッシュは要らない。docs/site.md の6章）
export const scriptJson = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');
