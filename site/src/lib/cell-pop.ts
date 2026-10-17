// 押せる四角（components/StatusBar.astro の pop）と指標のマップのマスを押したときの吹き出し（styles/global.css の .cellpop）の HTML。
// 押せる四角の中身は、四角と同じ並びで <template> に書き、押したときにブラウザ（scripts/cell-pop.ts）が吹き出しに写す。
// 一覧のページでは数が多いので、Astro が範囲をしぼるための属性を付けず、短く書くため文字列にする。
// 吹き出しの頭と値の並びは、ブラウザ（scripts/cell-pop.ts・indicator-map.ts）も読み込む（ほかのファイルは型だけを読む）
import type { CellItem } from './data.ts';
import { esc } from './html.ts';

// 頭（何の指標・取組か、区分の札、年度）。mark は区分の札の印（状態の形か、主要指標はマスと同じ色の四角）
export const popHead = (term: string, mark: string, label: string, year: string) =>
  `<p class="cp-head"><span class="cp-term">${esc(term)}</span><span class="chip">${mark}<span>${esc(label)}</span></span><span class="cp-year">${esc(year)}</span></p>`;
// 閉じるボタン。attr は押したのを見分ける data-* の属性
export const popClose = (attr: string) => `<button type="button" class="cp-close" ${attr} aria-label="閉じる">×</button>`;
// 値の並び（「基準値 45.2%」の組）
export const popVals = (vals: [label: string, value: string][]) => `<dl class="cp-vals">${vals.map(([l, v]) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;

const body = (x: CellItem) => [
  `<div><p class="cp-name"><a class="name-link" href="${esc(x.href)}">${esc(x.name)}</a></p>`,
  x.sub ? `<p class="cp-sub small secondary">${esc(x.sub.label)} <a class="sub-link" href="${esc(x.sub.href)}">${esc(x.sub.name)}</a> <span class="code-no">${esc(x.sub.code)}</span></p>` : '',
  x.vals?.length ? popVals(x.vals) : '',
  '</div>',
].join('');
export const cellPopHtml = (items: CellItem[]) => items.map(body).join('');
