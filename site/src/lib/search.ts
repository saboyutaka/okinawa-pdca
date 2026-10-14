// 表記ゆれをそろえる。年度をまたいだ名前の照合（lib/data.ts の sameKey）と、一覧の検索（scripts/list-filter.ts・取組をさがす）で使う。
// ブラウザでも読み込むので、Node の機能は使わない

// 同じ言葉の書き方の違い。R7で県の書き方が「子供」「子ども」から「こども」に変わり、同じ取組・成果指標が年度で別の名前になっている
const VARIANTS: [from: RegExp, to: string][] = [
  [/子供|子ども/g, 'こども'],
  [/障がい|障碍/g, '障害'],
];
export const foldVariants = (s: string) => VARIANTS.reduce((t, [from, to]) => t.replace(from, to), s);

// 検索の比べ方: 全角・半角をそろえ（NFKC）、英字を小文字にする
const norm = (s: string) => s.normalize('NFKC').toLowerCase();

// 検索される側の文字。書かれたままの形と、表記ゆれをそろえた形の両方を持つ
// （そろえた形だけにすると「子」で「子ども」が見つからなくなるため）
export const searchText = (s: string) => {
  const n = norm(s);
  const f = foldVariants(n);
  return f === n ? n : `${n}\n${f}`;
};

// 検索の言葉（空白で区切ったそれぞれ）。書かれたままの形と、表記ゆれをそろえた形
export type SearchWord = [raw: string, folded: string];
export const searchWords = (q: string): SearchWord[] => norm(q).split(/\s+/).filter(Boolean).map((w) => [w, foldVariants(w)]);

// すべての言葉が含まれるか（どの言葉も、書かれたままの形か、表記ゆれをそろえた形で含まれればよい）
export const matchesAll = (text: string, words: SearchWord[]) => words.every(([w, f]) => text.includes(w) || text.includes(f));

// 検索の言葉が、書かれたままの文字のどこに当たるか（印を付ける範囲。[始まり, 終わり) の text の中の位置で、重なりはまとめる）。
// 1字ずつ比べ方をそろえた形で探し、元の字の位置に戻す（NFKC で字の数が変わっても、元の字ごと印を付けられるように）。
// 言葉は、書かれたままの形と表記ゆれをそろえた形の両方で探す（「子ども」で探して「こども」に当たったときも印を付ける）
export function matchRanges(text: string, words: SearchWord[]): [number, number][] {
  const chars = [...text];
  const at: number[] = []; // 元の字の text の中の位置（最後に text の長さ）
  const from: number[] = []; // そろえた形の各位置が、何番目の元の字から来たか
  let flat = '';
  let pos = 0;
  chars.forEach((c, i) => {
    at.push(pos);
    pos += c.length;
    const n = norm(c);
    flat += n;
    for (let j = 0; j < n.length; j++) from.push(i);
  });
  at.push(pos);
  const ranges: [number, number][] = [];
  for (const w of new Set(words.flat())) {
    for (let i = flat.indexOf(w); i >= 0; i = flat.indexOf(w, i + 1)) ranges.push([at[from[i]], at[from[i + w.length - 1] + 1]]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [a, b] of ranges) {
    const last = out.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}
