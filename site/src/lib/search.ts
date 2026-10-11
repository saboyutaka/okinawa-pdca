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
