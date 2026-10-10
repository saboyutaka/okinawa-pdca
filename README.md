# okinawa-pdca

沖縄県PDCA（新・沖縄21世紀ビジョン実施計画などの「主な取組」の進捗評価）を構造化し、分野・部局・進捗で絞り込めるようにするシビックテックプロジェクト。

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
| soukatsu | 沖縄県PDCA実施結果（総括報告書） | pref.okinawa.jp …/1014252/1014253/ |
| kikaku, doboku, hoken-iryo, kodomo-seikatsu, kodomo-mirai, kankyo, shoko, somu, chiji-koshitsu, norin, bunka-kanko | 知事部局の成果指標検証票・主な取組検証票 | pref.okinawa.jp …/1014252/<部局ID>/ |
| kyoiku | 教育庁 | pref.okinawa.lg.jp …/kyoiku/edu/1008438/1022404/ |
| keisatsu | 警察本部 | police.pref.okinawa.jp /category/bunya/shokai/pdca/ |
| kigyo | 企業局 | eb.pref.okinawa.jp /torikumi/115/137 |
| byoin | 病院事業局 | byoinjigyokyoku.pref.okinawa.jp /data/pdca/ |

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

ホストに Python のPDFライブラリは入れず、解析用コンテナ（`docker/tools`）で動かす。

```sh
make extract   # zip展開 → 抽出 → 公表値との突き合わせ
make check     # 突き合わせだけ（ホストの python3）
```

- 入力は総括報告書（soukatsu）の「将来像1〜5」と「付属資料」。どのファイルかは manifest のリンク文言で判定する。
- 出力は `data/extracted/soukatsu/` の JSON（将来像・基本施策・施策・主な取組・成果指標・主要指標・出典）。サイトはこれを読んでビルドするのでコミットする。
- 施策・主な取組・成果指標・基本施策の件数は、4年度とも概要版の公表値と一致することを `scripts/check_extracted.py` で確認している。進捗の内訳・施策の判定の数件の差は、報告書の欄が空欄・「-」のものと、県が集計で「その他」に回す施策によるもの（サイトの「データについて」に明記）。

## データの作り方の詳細

抽出の規則、年度による計り方・計算方法の違い、部局名の変更、公表値との突き合わせは [docs/data.md](docs/data.md) にまとめている。
取れていないデータ（取得できないファイル、空欄など）と誤りの疑いがあるデータ（金額の誤記、式と合わない達成率など）は [docs/issues.md](docs/issues.md) に一覧している（`make issues` で抽出データから作り直す）。

## 公開サイト（site/）

Astro で全ページを静的HTMLとして書き出す（トップ、施策一覧と施策339・基本施策36、取組の検索、遅れが続いている取組、指標の一覧、部局一覧と部局15、予算と財源、予算の財源のしくみ、データについて）。取組の検索だけは、ビルド時に書き出した `/torikumi/data.json` をブラウザで読む。ブラウザでデータベースは動かさず、ビルド時に `data/extracted` を読んでページにする。

```sh
make site-install  # 初回のみ
make dev           # http://localhost:4321/
make build         # site/dist に書き出し
```

Cloudflare Pages の設定（Git 連携の場合）:

| 項目 | 値 |
|---|---|
| ルートディレクトリ | `site` |
| ビルドコマンド | `npm run build` |
| 出力ディレクトリ | `dist` |
| Node | `site/.node-version`（24） |

ビルドは `../data/extracted` を読むので、リポジトリ全体がチェックアウトされている必要がある。
