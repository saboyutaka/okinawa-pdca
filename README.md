# okinawa-pdca

[沖縄県PDCA](https://www.pref.okinawa.jp/kensei/shisaku/1014252/index.html)（[新・沖縄21世紀ビジョン実施計画](https://www.pref.okinawa.jp/kensei/shisaku/1014211/1014230/index.html)などの「主な取組」の進捗評価）を構造化し、分野・部局・進捗で絞り込めるようにするシビックテックプロジェクト。

### 関連する県のページ

| ページ | 内容 |
|---|---|
| [沖縄県PDCA](https://www.pref.okinawa.jp/kensei/shisaku/1014252/index.html) | 県の PDCA の入口（総括と部局別の検証票へのリンク） |
| [沖縄県PDCAの概要](https://www.pref.okinawa.jp/kensei/shisaku/1014252/1014253/1023439.html) | PDCA の仕組みの説明 |
| [沖縄県PDCA実施結果（年度別）](https://www.pref.okinawa.jp/kensei/shisaku/1014252/1014253/index.html) | 総括報告書（概要版・将来像1〜5・付属資料）の掲載ページ。R7 は[令和7年度対象](https://www.pref.okinawa.jp/kensei/shisaku/1014252/1014253/1041342.html) |
| [新・沖縄21世紀ビジョン基本計画](https://www.pref.okinawa.jp/kensei/shisaku/1014211/1014223/1014250/index.html) | 将来像・基本施策を定めた沖縄振興計画（R4〜R13） |
| [新・沖縄21世紀ビジョン実施計画（前期: R4〜R6）](https://www.pref.okinawa.jp/kensei/shisaku/1014211/1014230/1014251.html) | 施策・主な取組・成果指標と目標値（R4〜R6 の PDCA の対象） |
| [新・沖縄21世紀ビジョン実施計画（中期: R7〜R9）](https://www.pref.okinawa.jp/kensei/shisaku/1014211/1014230/1034436.html) | 同上（R7 からの PDCA の対象。基準値・目標値が見直されている） |

## データ取得

```sh
python3 scripts/fetch_pdca.py                  # 全取得元・全年度（H24〜）。取得済みはスキップ
python3 scripts/fetch_pdca.py --refresh        # 取得済みも県側の差し替えを確認（定期実行向け）
python3 scripts/fetch_pdca.py --since 2022     # 対象年度（西暦）で絞る
python3 scripts/fetch_pdca.py --source kikaku  # 取得元を絞る（--list-sources で一覧）
```

- 標準ライブラリのみ。robots.txt に従い、リクエスト間隔は1秒。
- 途中で止めても、同じコマンドを再実行すれば続きから取得する。

### 取得元

| 保存名 | 内容 | 起点 |
|---|---|---|
| soukatsu | 沖縄県PDCA実施結果（総括報告書） | [pref.okinawa.jp …/1014252/1014253/](https://www.pref.okinawa.jp/kensei/shisaku/1014252/1014253/index.html) |
| kikaku, doboku, hoken-iryo, kodomo-seikatsu, kodomo-mirai, kankyo, shoko, somu, chiji-koshitsu, norin, bunka-kanko | 知事部局の成果指標検証票・主な取組検証票 | [pref.okinawa.jp …/1014252/](https://www.pref.okinawa.jp/kensei/shisaku/1014252/index.html) の各部局のページ（…/1014252/<部局ID>/） |
| kyoiku | 教育庁 | [pref.okinawa.jp …/kyoiku/edu/1008438/1022404/](https://www.pref.okinawa.jp/kyoiku/edu/1008438/1022404/index.html) |
| keisatsu | 警察本部 | [police.pref.okinawa.jp /category/bunya/shokai/pdca/](https://www.police.pref.okinawa.jp/category/bunya/shokai/pdca/) |
| kigyo | 企業局 | [eb.pref.okinawa.jp /torikumi/115/137](https://www.eb.pref.okinawa.jp/torikumi/115/137) |
| byoin | 病院事業局 | [byoinjigyokyoku.pref.okinawa.jp /data/pdca/](https://byoinjigyokyoku.pref.okinawa.jp/data/pdca/) |

- 県企業局のサイトは robots.txt で自動取得が禁止されているため、PDF はブラウザで手動ダウンロードし、`python3 scripts/import_manual.py <フォルダ> --source kigyo --since 2022` で取り込む（台帳に `fetched_by: manual` と記録される）。
- 知事部局は一覧ページから自動検出する。保存名は県のページIDで固定しているため、部局名が変わってもフォルダは分かれない（環境部は新旧2ページとも kankyo）。未登録のIDは `dept-<ID>` で保存し警告を出す。

## ディレクトリ構成

```
data/
├── raw/                         ① 県サイトから取ったまま（手で編集しない）
│   ├── manifest.jsonl           ファイル台帳（元URL・参照元ページとリンク文言・対象年度とその判定根拠・sha256・取得日時）
│   ├── pages.jsonl              巡回したページの台帳
│   └── <取得元>/
│       ├── _pages/              巡回したページのHTML保存コピー
│       ├── 2025-r07/            対象年度（西暦-和暦）。ファイル名は県のまま
│       │   └── _history/YYYY-MM-DD/   県が差し替えた場合の旧版
│       └── _unknown/            対象年度を判定できなかったもの
├── interim/                     ② zip展開・ページ単位テキストなどの機械的な中間物
├── extracted/                   ③ ルール／AI抽出結果（未確認を含む）
└── published/                   ④ 人が確認した公開用データ
```

- **フォルダ名の年度は「対象年度」（西暦の年度）**。公表年ではない（例: 令和7年度対象の報告書は2026年8月公表 → `2025-r07`）。
- 対象年度は「リンク文言 → ページタイトル → 親ページ」の順に判定し、根拠を manifest の `fiscal_year_from` に記録する。
- 同じフォルダに同名の別ファイルがある場合は `名前__<URLハッシュ6桁>.pdf` にする。

## 方針

- `raw/` は不変。抽出結果は必ず `manifest.jsonl` の `file_url`（＋PDFページ番号）を出典として持つ。
- PDF・zip・HTMLはリポジトリに含めない（`.gitignore`）。`manifest.jsonl`・`pages.jsonl` はコミットする。

## 抽出（総括報告書 R4〜R7）

ホストに Python のPDFライブラリは入れず、解析用コンテナ（`docker/tools`。[pdfplumber](https://github.com/jsvine/pdfplumber) と [PyMuPDF](https://pymupdf.readthedocs.io/)）で動かす。

```sh
make extract   # zip展開 → 抽出 → 公表値との突き合わせ
make check     # 突き合わせだけ（ホストの python3）
```

- 入力は総括報告書（soukatsu）の「将来像1〜5」と「付属資料」。どのファイルかは manifest のリンク文言で判定する。
- 出力は `data/extracted/soukatsu/` の JSON（将来像・基本施策・施策・主な取組・成果指標・主要指標・出典）。サイトはこれを読んでビルドするのでコミットする。
- 部局別の「主な取組」検証票（様式1）からは、予算事業と金額、取組ごとの Plan・Do・Check・Action の記載を `data/extracted/bukyoku/torikumi.json` に取り出す（`scripts/extract_bukyoku.py`。[docs/data.md](docs/data.md) の 11章）。
- 施策・主な取組・成果指標・基本施策の件数は、4年度とも概要版の公表値と一致することを `scripts/check_extracted.py` で確認している。進捗の内訳の数件の差は、報告書の欄が空欄・「-」のものによる。施策の判定（A〜G）の数件の差は原因が特定できていない（[docs/data.md](docs/data.md) の 6.3）。

## データの作り方の詳細

抽出の規則、年度による計り方・計算方法の違い、部局名の変更、公表値との突き合わせは [docs/data.md](docs/data.md) にまとめている。
取れていないデータ（取得できないファイル、空欄など）と誤りの疑いがあるデータ（金額の誤記、式と合わない達成率など）は [docs/issues.md](docs/issues.md) に一覧している（`make issues` で抽出データから作り直す）。

## 公開サイト（site/）

[Astro](https://astro.build/) で全ページを静的HTMLとして書き出す（トップ、施策一覧と施策339、基本施策の一覧（主要指標を含む）と基本施策36、取組の検索と取組1,727（4年分の進捗・予算・活動内容・県の検証と改善案）、成果指標の検索、遅れが続いている取組、部局一覧と部局15、予算と財源、予算の財源のしくみ、データについて、404）。部局と成果指標は各ページから相互にリンクしている（成果指標の行き先は施策ページ内の `#seika-番号`）。ヘッダーでライト／ダークを切り替えられる（選んだ配色はブラウザに記憶）。取組の検索だけは、ビルド時に書き出した `/torikumi/data.json` をブラウザで読む。ブラウザでデータベースは動かさず、ビルド時に `data/extracted` を読んでページにする。

```sh
make site-install  # 初回のみ
make dev           # http://localhost:4321/
make build         # site/dist に書き出し
```

### Cloudflare での公開

[Cloudflare Workers の静的アセット](https://developers.cloudflare.com/workers/static-assets/)として置く（Worker のコードは無く、`site/dist` をそのまま配る）。設定は [site/wrangler.jsonc](site/wrangler.jsonc)、配るときのヘッダーは [site/public/_headers](site/public/_headers)。GitHub 連携（[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)）で、main に push するたびに Cloudflare 側でビルドして公開する。

ダッシュボードの「Workers & Pages」→「Create application」→「Import a repository」で `saboyutaka/okinawa-pdca` を選び、次のように設定する:

| 項目 | 値 |
|---|---|
| プロジェクト名 | `okinawa-pdca`（`site/wrangler.jsonc` の `name` と同じにする） |
| 本番ブランチ | `main` |
| ルートディレクトリ | `site` |
| ビルドコマンド | `npm run build` |
| デプロイコマンド | `npx wrangler deploy` |
| Node | `site/.node-version`（24）。読まれないときは環境変数 `NODE_VERSION=24` |

ビルドは `../data/extracted` と `../data/reference` を読むので、リポジトリ全体がチェックアウトされている必要がある（Workers Builds はリポジトリ全体を取得する）。
