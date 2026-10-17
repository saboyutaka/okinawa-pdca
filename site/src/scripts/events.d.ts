// ブラウザのスクリプトどうしで送るイベントの型
interface HTMLElementEventMap {
  // 一覧の絞り込みで入っている条件の数（キーワードを除く）。絞り込む側（list-filter.ts・torikumi-search.ts・indicator-map.ts）がフォームに送り、
  // 「条件で絞り込む」のボタン（filter-more.ts）に出す
  'filters:change': CustomEvent<{ n: number }>;
}
