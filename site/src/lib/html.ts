// 文字列で組む HTML に入れる文字のエスケープ。ビルド（lib）とブラウザのスクリプトの両方で読み込むので、ほかのファイルを import しない
export const esc = (s: string | number) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
