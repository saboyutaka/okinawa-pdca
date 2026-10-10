# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## このリポジトリ

沖縄県PDCA（新・沖縄21世紀ビジョン実施計画の施策・主な取組の進捗評価）を、県が公開している報告書の PDF から構造化し、県民向けの静的サイト（Astro）で見せる非公式のシビックテック。対象は令和4〜7年度。README・docs・コードのコメント・コミットはすべて日本語。

## コマンド

ホストに node や Python のライブラリは入れない。PDF の解析と Astro は `compose.yaml` のコンテナで動かす（`tools` = Python 3.13 + pdfplumber / PyMuPDF / openpyxl、`site` = node:24-alpine。どちらもリポジトリを `/work` にマウントする）。

| コマンド | 内容 |
|---|---|
| `make fetch` | 県サイトから報告書を取得（ホストの python3・標準ライブラリのみ。robots.txt に従い1秒間隔。`--refresh` で県の差し替えを確認、`--since 2022`・`--source kikaku` で絞る） |
| `make extract` | zip 展開 → 総括報告書と部局別の検証票の抽出 → 公表値との突き合わせ → `docs/issues.md` の作り直し |
| `make check` | 抽出結果を概要版の公表値と突き合わせるだけ（ホストの python3）。`NG` は件数の不一致 |
| `make issues` | 取れていないデータ・誤りの疑いの一覧（`docs/issues.md`）を作り直す |
| `make site-install` / `make dev` / `make build` / `make preview` | サイトの依存の導入・開発サーバー（http://localhost:4321/。`SITE_PORT=4400 make dev` で変えられる）・`site/dist` への書き出し・書き出したものの確認 |
| `make down` | コンテナを止めて消す（worktree ではその worktree の node_modules のボリュームも消す） |

- 一部だけ読み直す: `docker compose run --rm tools python scripts/extract_soukatsu.py --year 2025`、部局票は `scripts/extract_bukyoku.py --source kigyo --year 2025` のように絞る（出力の他の年度・取得元の行は残る）。
- 県企業局は robots.txt で自動取得できないので、ブラウザでダウンロードして `python3 scripts/import_manual.py <フォルダ> --source kigyo --since 2022` で取り込む。
- git worktree（`.claude/worktrees/<名前>`）の中では、Makefile が `compose.worktree.yaml` を重ねて、コンテナと node_modules のボリュームを worktree ごとに分け（`okinawa-pdca-<名前>`）、開発サーバーのポートを名前から決める（4322〜4921。番号は `make help` に出る）。コマンドは main と同じで、node_modules は初めて動かすときに自動で入る。片付ける前に `make down`。PDF（`data/raw`・`data/interim`）は git に入れていないので worktree には無く、`make extract` は main で行う。
- テストはない。データを変えたら `make check`、サイトを変えたら `make build` を通す。見た目の変更は、書き出した `site/dist` をローカルで配信して PC 幅とスマホ幅（390px）で確かめる。

## データの流れ

```
県サイト ─fetch_pdca.py─▶ data/raw ─expand_zips.py─▶ data/interim ─extract_soukatsu.py / extract_bukyoku.py─▶ data/extracted ─Astro─▶ site/dist
                                                                     └ check_extracted.py（公表値との突き合わせ）
```

- `data/raw` は県から取ったまま（手で編集しない）。PDF・zip は git に入れず、台帳の `manifest.jsonl`・`pages.jsonl` だけコミットする。フォルダの年度は**対象年度**（`2025-r07` = 令和7年度対象、2026年8月公表）。
- `data/extracted/*.json` はコミットする。**サイトはこれだけを読んでビルドする**ので、PDF が無くてもサイトは作れる。抽出結果は必ず出典（manifest の `file_url` と PDF のページ）を持つ。
- `data/reference/` は人が用意した参照データ: `finance.json`（国・県の財政の数字、出典つき）、`themes.json`（くらしのテーマの定義）。
- 施策 ID は報告書のコードを正規化したもの（`1-(1)-ア-①` → `1-1-a-1`、ア→a・イ→b…）。年度をまたいだ同じ取組・成果指標は、同じ施策の中で正規化した名前（`key`）が同じものとみなす。
- 年度による違いに注意する: R4〜R6 は前期実施計画、R7 からは中期（基準値・目標値・計画値が変わるので、達成率は計画期間をまたいで比べない）。R5 に部局の再編（部局の集計は取組の最新年度の所管部局に寄せる）。成果指標の実績値は前の年度の値のことが多い（`actual_ref_year`）。
- 施策の判定（A〜G）は施策総括表に印字されたものをそのまま使う（区分表で計算し直すと合わない施策がある）。
- 抽出の規則・年度の差・公表値とのずれの理由は `docs/data.md`、欠けと誤りの疑いは `docs/issues.md`。新しい年度を足すときは `scripts/check_extracted.py` の `EXPECTED` に公表値を足し、中期実施計画の計画値の列の位置（`plan_index`）がずれることに注意する。

## サイトの作り（site/）

- 全ページをビルド時に静的 HTML として書き出す（`output: 'static'`、`trailingSlash: 'always'`）。`src/lib/data.js` が `data/extracted` を読み、施策の索引・年度をまたいだ取組のまとまり（`getTorikumiGroups`）・部局票との結び付け（`budgetOf`）・予算の重複除去（`amountEntries`）などページ用の形にする。ブラウザにデータ全体は配らない。例外は取組の検索で、ビルド時に書き出した `/torikumi/data.json` をブラウザで読む。
- ほかの lib: `themes.js`（くらしのテーマ）、`icons.js`（状態の形・判定 A〜G の形と短い言い方・テーマのアイコン）、`terms.js`（用語の説明）、`text.js`（PDF の改行の整形・県の分析の小見出し分け）。
- ページ: トップ、`/theme/`（くらしのテーマ）、`/future/`（将来像の一覧と将来像1〜5）、`/kihon/<id>/`（基本施策）、`/shisaku/`（一覧と施策339）、`/torikumi/`（検索と取組。URL は `key` の SHA-1 の先頭8桁）、`/shihyou/`、`/okure/`、`/bukyoku/`、`/yosan/`、`/about/`。前の `/kihon/`（一覧）は `/future/` へ転送する（`astro.config.mjs` の `redirects`）。パンくずは計画の体系「トップ › 将来像N › 施策 › 取組」（`components/Crumbs.astro`）。
- ブラウザのスクリプト（`src/scripts/`）:
  - `charts.js`: `[data-chart]` の中の JSON から、表示幅に合わせて SVG の図を描く（`trend`・`seika`）。固定幅の SVG を縮めるとスマホで文字が小さくなりすぎるため。
  - `list-filter.js`: `form[data-filter]` の入力の name と、一覧の `[data-item]` の `data-<name>` を比べて絞り込む。条件は URL のクエリに残し、`data-summary` の場所に「× で外せる」条件を並べる。
  - `disclosure.js`（すべて開く・`[data-clamp]` の続きを読む・# の行き先が閉じた details の中なら開く）、`tooltip.js` / `tip.js`、`terms.js`、`theme.js`。

## デザインの決まり（ユーザーと決めたこと）

- 太い線と硬い影の「ステッカー」を並べるポップな見た目。色はすべて `styles/global.css` のトークンで参照する。はじめは端末の設定に関係なくライトで表示し、ダークはヘッダーのボタンで選んだとき（`data-theme="dark"`）だけ。
- 状態（順調〜大幅遅れ、判定 A〜G）は青信号系の色に加えて、形（● ◆ ▲ ■、判定 E・F は ▼ と斜線）と文字で出す。色だけで伝えない。形は `lib/icons.js` を通して出す（`Icon`・`Chip`）。
- 施策と主な取組を見た目で取り違えないようにする。大きな丸いハンコは施策の判定（A〜G）だけに使い、取組の進捗状況は横長の札と線でつないだ4年分のスタンプで出す。取組のページの頭は、親の施策の札の下にカギ形の線でぶら下げる。
- 報告書の施策の番号（`1-(1)-ア-①`・基本施策の `1-(1)`）は、施策と取組のページの頭（パンくず・見出しの上・親の施策の札）には出さない。気にする人向けに、ページの最後の「出典」の節に「県の報告書での番号」として置く（報告書の PDF をこの番号で探せる）。
- 将来像の色は基本計画パンフレットの色（`--sz-1`〜`--sz-5`）。番号の印と見出しの帯だけに使い、状態の色（棒・印）とは混ぜない。
- くらしのテーマは**このサイト独自の分類**で、県の計画の分類ではない。画面では必ずそうと分かるように出す（「このサイト独自の分類」の印・ピンクのラベル `ThemeTags`）。どの施策もいずれかのテーマに入るように `themes.json` を保つ（入らない施策があるとビルドで警告する）。主な取組・成果指標は、施策のテーマに加えて名前に当たるテーマにも入る。
- 情報は減らさず「ひとめで → くわしく → 表と原文は畳む（`details`）」の順にする。図には必ず「表で見る」を付ける。棒の区間ごとにタブで止めない。用語は `Term` で説明を出す。
- 日本語のウェブフォントは読み込まない。数字だけ丸い英字フォント Fredoka の部分集合（`public/fonts/`、SIL OFL）を使う。
- ヘッダーのナビはサブメニューを使わず項目を並べる（開くと本文がずれるため）。トップにナビと重複する「くわしく見る」は置かない。

## git

- このリポジトリでは**作業ブランチを切らず、main に直接コミットする**（ユーザーの指定。ホームの CLAUDE.md の「main ではブランチを切る」より優先）。push はユーザーが頼んだときだけ。

## 公開

Cloudflare Workers の静的アセットとして `site/dist` を置く（`site/wrangler.jsonc`。GitHub 連携で main に push すると、ビルドしてから `wrangler deploy` される）。配信時のヘッダーは `site/public/_headers`。いまは公開前（ステルス）なので検索エンジンに載せない設定（`Base.astro` の `NOINDEX` と `_headers` の `X-Robots-Tag: noindex, nofollow`）。robots.txt では止めない（止めると noindex が読まれず、URL だけ検索結果に出ることがある）。
