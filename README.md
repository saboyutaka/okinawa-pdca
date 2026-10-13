# okinawa-pdca

[沖縄県PDCA](https://www.pref.okinawa.jp/kensei/shisaku/1014252/index.html)（[新・沖縄21世紀ビジョン実施計画](https://www.pref.okinawa.jp/kensei/shisaku/1014211/1014230/index.html)などの「主な取組」の進捗評価）を構造化し、分野・部局・進捗で絞り込めるようにするシビックテックプロジェクト。

サイトの名前は「おきなわ、みらい、いま」（縮めて「みらいま」、SNS のハッシュタグは `#okinawa_miraima`）。2021年に新・沖縄21世紀ビジョン基本計画の骨子案を読んだ「[沖縄未来提案プロジェクト](https://thinkokinawa.studio.site)」の続きとして、その計画のいまを振り返るために作っている。

[Code for Okinawa](https://code4okinawa.org/) のプロジェクトとして、[saboyutaka](https://x.com/saboyutaka) が管理している。沖縄県の公式のものではない。

### 関連する県のページ

| ページ | 内容 |
|---|---|
| [沖縄県PDCA](https://www.pref.okinawa.jp/kensei/shisaku/1014252/index.html) | 県の PDCA の入口（総括と部局別の検証票へのリンク） |
| [沖縄県PDCAの概要](https://www.pref.okinawa.jp/kensei/shisaku/1014252/1014253/1023439.html) | PDCA の仕組みの説明 |
| [沖縄県PDCA実施結果（年度別）](https://www.pref.okinawa.jp/kensei/shisaku/1014252/1014253/index.html) | 総括報告書（概要版・将来像1〜5・付属資料）の掲載ページ。R7 は[令和7年度対象](https://www.pref.okinawa.jp/kensei/shisaku/1014252/1014253/1041342.html) |
| [新・沖縄21世紀ビジョン基本計画](https://www.pref.okinawa.jp/kensei/shisaku/1014211/1014223/1014250/index.html) | 将来像・基本施策を定めた沖縄振興計画（R4〜R13） |
| [新・沖縄21世紀ビジョン実施計画（前期: R4〜R6）](https://www.pref.okinawa.jp/kensei/shisaku/1014211/1014230/1014251.html) | 施策・主な取組・成果指標と目標値（R4〜R6 の PDCA の対象） |
| [新・沖縄21世紀ビジョン実施計画（中期: R7〜R9）](https://www.pref.okinawa.jp/kensei/shisaku/1014211/1014230/1034436.html) | 同上（R7 からの PDCA の対象。基準値・目標値が見直されている） |

## 中身

県の報告書の PDF を読んで JSON にし（`data/extracted`）、それを読んで静的サイトを書き出す。

```
県サイト ─fetch_pdca.py─▶ data/raw ─expand_zips.py─▶ data/interim ─extract_*.py─▶ data/extracted ─Astro─▶ site/dist
```

- `data/raw`（県から取った PDF・zip）は git に入れず、取得の台帳だけをコミットしている。`data/extracted` はコミットしているので、**サイトの開発だけなら PDF は要らない**。
- 抽出結果は必ず出典（報告書の URL と PDF のページ）を持つ。施策・主な取組・成果指標・基本施策の件数は、4年度とも概要版の公表値と一致することを確かめている。
- サイトは全ページを静的 HTML として書き出す（[Astro](https://astro.build/)）。ブラウザでデータベースは動かさない。

## 動かし方

Docker と python3（標準ライブラリだけ）があればよい。PDF の解析・サイトのビルド・画面の確認はコンテナで動かす。`make help` でコマンドの一覧が出る。

```sh
make site-install  # 初回のみ
make dev           # http://localhost:4321/（SITE_PORT=4400 make dev でポートを変えられる）
make build         # 型を確かめて（astro check）から site/dist に書き出し
make test          # 抽出スクリプトとサイトの lib のテスト

make fetch         # 県サイトから報告書を取得（robots.txt に従い1秒間隔）
make extract       # PDF を読んで data/extracted を作り直し、公表値と突き合わせる
```

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/fetch.md](docs/fetch.md) | 報告書の取り方・取得元の一覧・`data/` のフォルダ |
| [docs/data.md](docs/data.md) | 抽出の規則、年度による計り方・計算方法の違い、部局名の変更、公表値との突き合わせ |
| [docs/issues.md](docs/issues.md) | 取れていないデータと誤りの疑いがあるデータの一覧（`make issues` で作り直す） |
| [docs/site.md](docs/site.md) | サイトの作り（データの読み込みと数え方・型・lib・ブラウザのスクリプト・ページ・表示の速さ） |
| [docs/dev.md](docs/dev.md) | 開発の手順（コンテナ・テスト・画面の確認・worktree） |
| [docs/design.md](docs/design.md) | サイトの見た目と見せ方の決まり |
| [docs/deploy.md](docs/deploy.md) | Cloudflare への公開の手順 |
| [docs/new-pc.md](docs/new-pc.md) | 別の PC で開発するときの `data/raw` の移し方 |

## 公開

公開先は https://okinawa-miraima.com/ 。main に push すると Cloudflare Workers でビルドして公開される（[docs/deploy.md](docs/deploy.md)）。
