# CLAUDE.md

沖縄県PDCA（新・沖縄21世紀ビジョン実施計画の施策・主な取組の進捗評価、令和4〜7年度）を県の報告書の PDF から構造化し、県民向けの静的サイト（Astro）「おきなわ、みらい、いま」で見せる非公式のシビックテック（Code for Okinawa）。README・docs・コメント・コミットはすべて日本語。

## 先に読む docs

くわしい決まりは docs にある。作業に当たるものを、手を付ける前に読む。

| 作業 | 読むもの |
|---|---|
| 画面の見た目・見せ方 | `docs/design.md`（ユーザーと決めたデザインの決まり） |
| ページ・lib・スクリプト・型 | `docs/site.md` |
| コンテナ・テスト・`make shot`・worktree | `docs/dev.md` |
| 報告書の取得・フォルダ | `docs/fetch.md` |
| 公開（Cloudflare） | `docs/deploy.md` |
| 抽出の規則・年度の差・公表値とのずれ | `docs/data.md`（欠けと誤りの疑いは `docs/issues.md`） |

## コマンドと確かめ方

ホストに node や Python のライブラリは入れず、`make` でコンテナを動かす（一覧は `make help`）。

- データを変えたら `make check`・`make cross-read`・`make test`。`cross_read.py` の `KNOWN` には、ページの画像で確かめたものだけを理由と日付つきで足す。
- サイトを変えたら `make test` と `make build`（`astro check` で型も確かめる）。lib の関数や数え方を変えたらテストも足す・直す。
- 見た目を変えたら `make build && make shot` の PC 幅とスマホ幅の画像を見る（`PAGES="/shisaku/1-1-a-1/ --top"` などでしぼる）。
- worktree には PDF（`data/raw`・`data/interim`）が無いので、`make extract` は main で行う。片付ける前に `make down`。

## データ

- `data/raw` は県から取ったまま（手で編集しない。PDF は git に入れない）。フォルダの年度は**対象年度**（`2025-r07` = 令和7年度対象）。
- サイトはコミットした `data/extracted` だけを読む。抽出結果は必ず出典（manifest の `file_url` と PDF のページ）を持つ。
- R4〜R6 は前期、R7 からは中期実施計画（基準値・目標値が変わるので達成率は期間をまたいで比べない）。施策の判定（A〜G）は印字のまま使う。

## サイト

- 数え方は1か所で決めてどのページもそれを使う（`lib/data.ts` の `PATTERNS`・`JUDGE_TRENDS`・`JUDGE_CELLS`・`shisakuDepts`、ページの頭の数は `lib/heads.ts`。ページの説明文と SNS のカードの画像も同じ数を使う）。
- TypeScript strict。JSON の形は `lib/types.ts`、ページ用の形は `lib/data.ts`・`lib/plans.ts` の型を使い、`any` にしない。
- 外のサイトへのリンクは `components/ExtLink.astro`。ブラウザにデータ全体は配らない。
- 公開したページの URL は変えない。一覧（`site/urls.txt`）の URL が無くなると `make test` が落ちる。ページを足したら `make urls`、URL を変えるときは `docs/site.md` の 8章。

## デザインの大原則

- **県を批判するためではなく、状況を公平に確かめるためのサイト。** 順調・遅れのどちらかだけを目立たせず（遅れの件数を大きく並べる・悪い順に並べる、はしない）、全体の内訳を同じ重みで見せる。遅れ・後退は一覧の絞り込みで見られるようにし、変化は良くなったものと悪くなったものを対にする。状態の言葉は県の区分のまま。
- 状態は色だけで伝えず形と文字でも出す。くらしのテーマはこのサイト独自の分類と分かるように出す。観光ロードマップ・一括交付金の事後評価は沖縄県PDCAと混ぜない。
