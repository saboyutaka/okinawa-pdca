// subset-font（card-font.ts）には型が付いていないので、使う形だけを書く
declare module 'subset-font' {
  export default function subsetFont(
    font: Buffer,
    text: string,
    options?: { targetFormat?: 'sfnt' | 'truetype' | 'woff' | 'woff2'; noHinting?: boolean },
  ): Promise<Buffer>;
}
