# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## このリポジトリ

沖縄県PDCA（新・沖縄21世紀ビジョン実施計画の施策・主な取組の進捗評価）を、県が公開している報告書の PDF から構造化し、県民向けの静的サイト（Astro）で見せる非公式のシビックテック。Code for Okinawa のプロジェクトとして saboyutaka が管理している（ヘッダーの「by Code for Okinawa」と `/code-for-okinawa/`。団体と管理者の URL は `site/src/lib/links.js` の `PROJECT`）。対象は令和4〜7年度。README・docs・コードのコメント・コミットはすべて日本語。

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

- `data/raw` は県から取ったまま（手で編集しない）。PDF・zip は git に入れず、台帳の `manifest.jsonl`・`pages.jsonl` だけコミットする。別の PC へは zip にして移す（`docs/new-pc.md`。台帳とそろったかは `python3 scripts/check_raw.py`）。フォルダの年度は**対象年度**（`2025-r07` = 令和7年度対象、2026年8月公表）。
- `data/extracted/*.json` はコミットする。**サイトはこれだけを読んでビルドする**ので、PDF が無くてもサイトは作れる。抽出結果は必ず出典（manifest の `file_url` と PDF のページ）を持つ。
- `data/reference/` は人が用意した参照データ: `finance.json`（国・県の財政の数字、出典つき）、`themes.json`（くらしのテーマの定義）。
- 施策 ID は報告書のコードを正規化したもの（`1-(1)-ア-①` → `1-1-a-1`、ア→a・イ→b…）。年度をまたいだ同じ取組・成果指標は、同じ施策の中で正規化した名前（`key`）が同じものとみなす。
- 年度による違いに注意する: R4〜R6 は前期実施計画、R7 からは中期（基準値・目標値・計画値が変わるので、達成率は計画期間をまたいで比べない）。R5 に部局の再編（部局の集計は取組の最新年度の所管部局に寄せる）。成果指標の実績値は前の年度の値のことが多い（`actual_ref_year`）。
- 施策の判定（A〜G）は施策総括表に印字されたものをそのまま使う（区分表で計算し直すと合わない施策がある）。
- 抽出の規則・年度の差・公表値とのずれの理由は `docs/data.md`、欠けと誤りの疑いは `docs/issues.md`。新しい年度を足すときは `scripts/check_extracted.py` の `EXPECTED` に公表値を足し、中期実施計画の計画値の列の位置（`plan_index`）がずれることに注意する。

## サイトの作り（site/）

- 全ページをビルド時に静的 HTML として書き出す（`output: 'static'`、`trailingSlash: 'always'`）。`src/lib/data.js` が `data/extracted` を読み、施策の索引・年度をまたいだ取組のまとまり（`getTorikumiGroups`）・部局票との結び付け（`budgetOf`）・予算の重複除去（`amountEntries`）などページ用の形にする。取組の4年間の様子（4年とも遅れ・3年以上遅れ・R5からR7まで続けて遅れ・遅れから順調に など）の数え方は `PATTERNS` に1か所で決め、取組のまとまりの `patterns` に入れる。トップ・将来像・テーマ・部局の数と、取組をさがすの絞り込み（`/torikumi/data.json` の `patterns`）は、どれもこれを使う（ページごとに書くと、数とリンク先の件数がずれる）。ブラウザにデータ全体は配らない。例外は取組の検索で、ビルド時に書き出した `/torikumi/data.json` をブラウザで読む。
- 外のサイトへのリンク（県のページ・報告書の PDF・外部のサービス）は、すべて `components/ExtLink.astro` で書く（別のタブで開き、外部リンクの印と、読み上げ用の「別のタブで開きます」を付ける。`class` などの属性もそのまま渡せる）。素の `<a>` はサイトの中のリンクだけに使う。
- 意見: `/iken/` に県民意見募集（パブリックコメント）の受付の状態・いつでも使える県の窓口・X で話す方法をまとめる。募集の期間と県のページは `lib/iken.js` の `BOSHU`（新しい募集が出たら書き換える。受付中・終了は**ビルドした日**で決まる）。X の投稿画面（Web Intent）は `components/XPost.astro` で開き、ハッシュタグは `#okinawa_pdca`。施策・基本施策・取組のページは出典の前に `components/IkenBox.astro` を置き、名前とページの URL（ブラウザで付ける）を入れて X に書けるようにする。X に書いても県には届かないことを必ず添える。
- ほかの lib: `themes.js`（くらしのテーマ）、`icons.js`（状態の形・判定 A〜G の形と短い言い方・テーマのアイコン）、`terms.js`（用語の説明）、`text.js`（PDF の改行の整形・県の分析の小見出し分け）。
- ページ: トップ、`/theme/`（くらしのテーマ）、`/future/`（将来像の一覧と将来像1〜5）、`/kihon/<id>/`（基本施策）、`/shisaku/`（一覧と施策339）、`/torikumi/`（検索と取組。URL は `key` の SHA-1 の先頭8桁。4年のうち3年以上遅れた取組などは「4年間の様子」の絞り込みで見る（`?pat=delay3` など）。前にあった `/okure/` はこれと重なるので消した）、`/shihyou/`、`/bukyoku/`、`/yosan/`、`/about/`、`/code-for-okinawa/`（作っている団体と問い合わせ先）、`/iken/`（意見を伝えたい人へ。トップの最後とフッターから入る）。前の `/kihon/`（一覧）は `/future/` へ転送する（`astro.config.mjs` の `redirects`）。パンくずは計画の体系「トップ › 将来像N › 基本施策 › 施策」「トップ › 将来像N › 施策 › 取組」（`components/Crumbs.astro`。スマホでは、すぐ下の見出しと同じいまのページの名前を見せない）。
- ブラウザのスクリプト（`src/scripts/`）:
  - `charts.js`: `[data-chart]` の中の JSON から、表示幅に合わせて SVG の図を描く（`trend`・`seika`）。固定幅の SVG を縮めるとスマホで文字が小さくなりすぎるため。
  - `list-filter.js`: `form[data-filter]` の入力の name と、一覧の `[data-item]` の `data-<name>` を比べて絞り込む。条件は URL のクエリに残し、`data-summary` の場所に「× で外せる」条件を並べる。キーワード以外の条件は `components/FilterMore.astro` で畳み（初めは閉じる。最初の画面に一覧が入るように）、初めの選択から変えた条件の数をボタンに出す（スクリプトがフォームの `data-filter-n` と `filters:change` で知らせる。取組の検索も同じ）。
  - `disclosure.js`（すべて開く・# の行き先が閉じた details の中なら開く。最新の年度の県のふりかえり・活動と検証は途中で切らずに全部出す）、`tooltip.js` / `tip.js`、`terms.js`、`theme.js`。
  - `scroll-hint.js`: 横にすべらせる帯（`[data-scroll-hint]`。ヘッダーのナビと、施策・取組のページの目次のリンクの並び `.toc-links`）の、続きがある側の端をぼかす。

## デザインの決まり（ユーザーと決めたこと）

- 太い線と硬い影の「ステッカー」を並べるポップな見た目。色はすべて `styles/global.css` のトークンで参照する。はじめは端末の設定に関係なくライトで表示し、ダークはヘッダーのボタンで選んだとき（`data-theme="dark"`）だけ。
- ステッカーの強さは3段階にして、全部を同じ強さにしない（どこから見ればいいか分からなくなるため）。太い線と大きな影（`.sticker.lift`）はページの頭とトップのヒーローだけ。並ぶカード・図・絞り込みは `.sticker`（細めの線と小さな影）。ステッカーの中の箱は線も影も付けず地の色だけ（`.inset`）にし、中の吹き出しやステッカーにも影を付けない。
- 一覧（施策・成果指標・遅れている取組・取組の検索）は1件ずつをステッカーにせず、1つの箱の中に細い線で区切った行で並べる（`.row-list`）。1件は2〜3行に収め、一覧の見出しにあること（将来像・基本施策）は行に書かない。部局・くらしのテーマは絞り込み（`data-*`）と詳しいページに任せる。施策の行は `components/ShisakuItem.astro`、成果指標の行は `components/SeikaRow.astro`、取組の行は `.t-row`（styles/global.css。取組をさがすはブラウザで同じ形を描く）を使う（部局のページの一覧も同じ）。
- 状態（順調〜大幅遅れ、判定 A〜G）は青信号系の色に加えて、形（● ◆ ▲ ■、判定 E・F は ▼ と斜線）と文字で出す。色だけで伝えない。形は `lib/icons.js` を通して出す（`Icon`・`Chip`）。
- 施策と主な取組を見た目で取り違えないようにする。大きな丸いハンコは施策の判定（A〜G）だけに使い（一覧の行と親の施策の札では小さな丸いハンコ `.jstamp`）、取組の進捗状況は横長の札と線でつないだ4年分のスタンプで出す。取組のページの頭は、親の施策の札の下にカギ形の線でぶら下げる。
- 報告書の施策の番号（`1-(1)-ア-①`・基本施策の `1-(1)`）は名前より目立たせない。ページの頭のステッカーと一覧のカードでは右上の隅に、カードの無い一覧のリンクや見出しでは名前の後ろに、小さく薄い字で置く（`styles/global.css` の `.code-no`・`.code-corner`・`.name-row`）。パンくずとページの題名は名前だけにする。施策・基本施策・取組のページの最後の「出典」の節に「県の報告書での番号」として説明を置く（報告書の PDF をこの番号で探せる）。検索の文字（`data-text`・`/torikumi/data.json`）にも番号を入れ、番号でも探せるようにする。
- 将来像の色は基本計画パンフレットの色（`--sz-1`〜`--sz-5`）。番号の印と見出しの帯だけに使い、状態の色（棒・印）とは混ぜない。
- くらしのテーマは**このサイト独自の分類**で、県の計画の分類ではない。画面では必ずそうと分かるように出す（「このサイト独自の分類」の印・ピンクのラベル `ThemeTags`）。どの施策もいずれかのテーマに入るように `themes.json` を保つ（入らない施策があるとビルドで警告する）。主な取組・成果指標は、施策のテーマに加えて名前に当たるテーマにも入る。
- サイトの中のリンクは3種類に分ける。名前のリンク（一覧の行の名前・カードの見出し・図の行の名前）は `.name-link`（黒の角ゴシックの太字に薄い下線。見出しの丸ゴシックは太さが1つしかなく太字にならないので使わない）。補足の行の部局・施策の名前は `.sub-link`（灰色に薄い下線）。文章の中のリンクと「すべて見る」のような行き先を示すリンクは青に下線のまま（黒の太字にすると強調と見分けがつかないため）。名前のリンクと補足のリンクは、カーソルを乗せても青にせず、下線を黒く太くして反応させる（色が変わると別の種類の文字に見え、一覧ではちらつくため）。例外として、トップのヒーローの文章の数字（遅れている取組の数など）は、数字を目立たせるために黒の大きな数字に青の太い下線を付ける。
- 情報は減らさず「ひとめで → くわしく → 表と原文は畳む（`details`）」の順にする。図には必ず「表で見る」を付ける。棒の区間ごとにタブで止めない。用語は `Term` で説明を出す。
- 節の頭の説明は、その図や表を読むのに要る1文だけにする。用語の意味は `Term` に任せて本文で繰り返さない。データの注意書き（重複・出典の事情など）は図や表の後ろに置く。同じ区分の図をいくつも並べるページでは、凡例はページに1回だけ出す（`StatusChart` に `legend={false}`）。
- 日本語のウェブフォントは読み込まない。数字だけ丸い英字フォント Fredoka の部分集合（`public/fonts/`、SIL OFL）を使う。
- ヘッダーのナビはサブメニューを使わず項目を並べる（開くと本文がずれるため）。トップにナビと重複する「くわしく見る」は置かない。スマホのヘッダーは「タイトル＋配色のボタン（その下に小さく（非公式）by Code for Okinawa）」と「ナビ」の2段に収める。

## 公開

Cloudflare Workers の静的アセットとして `site/dist` を置く（`site/wrangler.jsonc`。GitHub 連携で main に push すると、ビルドしてから `wrangler deploy` される。main 以外のブランチ（PR）は `npx wrangler preview` でブランチごとのプレビューになり、`wrangler.jsonc` に `previews` の枠が要る）。配信時のヘッダーは `site/public/_headers`。いまは公開前（ステルス）なので検索エンジンに載せない設定（`Base.astro` の `NOINDEX` と `_headers` の `X-Robots-Tag: noindex, nofollow`）。robots.txt では止めない（止めると noindex が読まれず、URL だけ検索結果に出ることがある）。
