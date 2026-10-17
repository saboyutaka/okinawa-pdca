// SNS のカードの画像のキャッシュ。描くのは1枚50ms ほどかかり、ページの数だけあるので、中身が前のビルドと同じ画像は描き直さない。
// 置き場は Astro のキャッシュのフォルダ（node_modules/.astro。astro.config.ts で cacheDir を変えていないときの場所）。
// Workers Builds のビルドキャッシュ（ダッシュボードで有効にする。docs/deploy.md の2章）は、Astro のプロジェクトならこのフォルダを次のビルドに残す。
// ファイルの名前は、中身（lib/card.ts の要素の木）と描き方（フォント・lib/card-render.ts・依存の版）のハッシュ。どれかが変われば別の名前になり、描き直す。
// 使った画像は atime を新しくしておき、ビルドの終わりに、そのビルドで使わなかった画像を消す（astro.config.ts の cardCache）
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const CARD_CACHE_DIR = path.resolve(process.cwd(), 'node_modules/.astro/cards');
// 描き方が変わったら描き直すためのファイル（package-lock.json は satori・resvg の版）
const RECIPE = ['src/fonts/card-bold.woff', 'src/lib/card-render.ts', 'package-lock.json'];

const sha1 = (...xs: (string | Buffer)[]) => {
  const h = crypto.createHash('sha1');
  for (const x of xs) h.update(x);
  return h.digest('hex');
};
let recipe: string | undefined;

// 中身 content（要素の木の JSON）の画像のキャッシュのファイル
export function cacheFile(content: string) {
  recipe ??= sha1(...RECIPE.map((f) => fs.readFileSync(path.resolve(process.cwd(), f))));
  return path.join(CARD_CACHE_DIR, `${sha1(recipe, content)}.png`);
}

// キャッシュにあれば、その PNG（使ったしるしに atime を新しくする。描いた時刻の mtime は変えない）。無ければ null
export function readCache(file: string): Buffer | null {
  try {
    const png = fs.readFileSync(file);
    fs.utimesSync(file, new Date(), fs.statSync(file).mtime);
    return png;
  } catch {
    return null;
  }
}

export function writeCache(file: string, png: Buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
}

// ビルドの終わりに、ビルドを始めた時刻 since より後に、前のビルドから残っていた画像を使った数（reused）と描いた数（drawn）を数え、
// 使わなかった画像を消す（removed。キャッシュが増え続けないように）
export function pruneCardCache(since: number, dir = CARD_CACHE_DIR) {
  const n = { reused: 0, drawn: 0, removed: 0 };
  if (!fs.existsSync(dir)) return n;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    const { atimeMs, mtimeMs } = fs.statSync(file);
    if (mtimeMs >= since) n.drawn++;
    else if (atimeMs >= since) n.reused++;
    else {
      fs.rmSync(file);
      n.removed++;
    }
  }
  return n;
}
