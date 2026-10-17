// 計画の目次（/mokuji/）が読み込むデータ。ビルド時に JSON として書き出す（pages/mokuji/ の data-[hash].json.ts と、控えの data.json.ts）。
// 目次は約2,500行あり、HTML に書くと 750KB ほどになって、ブラウザのスクリプトが動くまで（読み終えるまで）に時間がかかり、
// 戻る・進むで読み直したときに、絞り込む前の目次と空の欄が見えてから描き直していた。名前とリンクだけを JSON で配り、スクリプトが描く（scripts/tree.ts）。
// ファイルの名前に中身のハッシュを入れ（/mokuji/data-<ハッシュ>.json）、ブラウザにずっとキャッシュさせる（public/_headers）。中身が変われば名前も変わる。
// ビルドの中でだけ使う（Node の機能を使う。ブラウザのスクリプトは型だけを読む）
import { createHash } from 'node:crypto';
import { LATEST, budgetOf, commonShisakuCount, getPlanTree } from './data.ts';

// JSON の形（ブラウザのスクリプト scripts/tree.ts もこの型で読む）。木の並び・中身は lib/data.ts の getPlanTree と同じ
export type TreeLink = [name: string, href: string];
// 取組の act は活動指標の名前（取組のページの頭と同じく、総括報告書の欄、無ければ部局の検証票。どちらにも無ければ ''）。
// common は最新の年度にこの取組が載っている施策の数（複数の施策に共通の取組だけ。ほかは 0。lib/data.ts の commonShisakuCount）
export interface TreeShisaku { id: string; no: string; name: string; seika: TreeLink[]; torikumi: [no: number, name: string, href: string, act: string, common: number][] }
export interface TreeTenkai { id: string; no: string; name: string; shisaku: TreeShisaku[] }
export interface TreeKihon { id: string; no: string; name: string; shuyou: TreeLink[]; tenkai: TreeTenkai[] }
export interface TreeVision { id: number; name: string; kihon: TreeKihon[] }
export interface TreeData { visions: TreeVision[] }

// その階層の中の番号（1-(2)-イ-③ → ③、1-(2)-イ → イ、1-(2) → (2)）。目次では通しの番号ではなく、これを名前の頭に置く
export const localNo = (code: string) => code.split('-').at(-1) ?? code;

function build(): TreeData {
  return {
    visions: getPlanTree().map(({ vision, kihon }) => ({
      id: vision.id,
      name: vision.name,
      kihon: kihon.map((k) => ({
        id: k.kihon.id,
        no: localNo(k.kihon.code),
        name: k.kihon.name,
        shuyou: k.shuyou.map((r) => [r.name, r.href]),
        tenkai: k.tenkai.map((t) => ({
          id: t.id,
          no: localNo(t.code),
          name: t.name,
          shisaku: t.shisaku.map((s) => ({
            id: s.shisaku.id,
            no: localNo(s.shisaku.code),
            name: s.shisaku.name,
            seika: s.seika.map((g) => [g.name, g.href]),
            torikumi: s.torikumi.map((g) => [g.latest.no, g.latest.name, g.href, g.latest.indicator || budgetOf(g.latest.year, g.shisaku.id, g.key)?.indicator_name || '', commonShisakuCount(g, LATEST)]),
          })),
        })),
      })),
    })),
  };
}

// 書き出す JSON（1回のビルドで1度だけ作る）
let json: string | undefined;
export const treeDataJson = () => (json ??= JSON.stringify(build()));
// 書き出す場所。名前は中身の SHA-256 の先頭8桁（取組をさがすのデータ lib/search-data.ts と同じ）
export const treeDataHash = () => createHash('sha256').update(treeDataJson()).digest('hex').slice(0, 8);
export const treeDataPath = () => `/mokuji/data-${treeDataHash()}.json`;
// 名前の変わらない控え。公開し直した直後に、キャッシュした前のページ（5分）から開くと、前のハッシュのファイルはもう無いので、こちらを読む
export const TREE_DATA_FALLBACK = '/mokuji/data.json';
