// 押せる四角（components/StatusBar.astro の pop）の中身の HTML。四角と同じ並びで <template> に書き、押したときにブラウザ（scripts/cell-pop.ts）が吹き出しに写す。
// 一覧のページでは数が多いので、Astro が範囲をしぼるための属性を付けず、短く書くため文字列にする（見た目は styles/global.css の .cellpop）
import type { CellItem } from './data.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const body = (x: CellItem) => [
  `<div><p class="cp-name"><a class="name-link" href="${esc(x.href)}">${esc(x.name)}</a></p>`,
  x.sub ? `<p class="cp-sub small secondary">${esc(x.sub.label)} <a class="sub-link" href="${esc(x.sub.href)}">${esc(x.sub.name)}</a> <span class="code-no">${esc(x.sub.code)}</span></p>` : '',
  x.vals?.length ? `<dl class="cp-vals">${x.vals.map(([l, v]) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : '',
  '</div>',
].join('');
export const cellPopHtml = (items: CellItem[]) => items.map(body).join('');
