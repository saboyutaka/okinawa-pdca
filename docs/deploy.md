# 公開

サイト（`site/dist`）を Cloudflare Workers の静的アセットとして公開する手順と設定。

## 1. 検索エンジンに載せない設定

**いまは公開前（ステルス）のため、検索エンジンに載せない設定にしている。** 全ページの `<meta name="robots" content="noindex, nofollow">`（`site/src/layouts/Base.astro` の `NOINDEX`）と、配信時の `X-Robots-Tag: noindex, nofollow`（`site/public/_headers`）。検索に載せてよくなったら両方を外す。`robots.txt` で巡回を止めると noindex が読まれず URL だけ検索結果に出ることがあるので、`robots.txt` では止めない。

## 2. Cloudflare の設定

[Cloudflare Workers の静的アセット](https://developers.cloudflare.com/workers/static-assets/)として置く（Worker のコードは無く、`site/dist` をそのまま配る）。設定は [site/wrangler.jsonc](../site/wrangler.jsonc)、配るときのヘッダーは [site/public/_headers](../site/public/_headers)。GitHub 連携（[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)）で、main に push するたびに Cloudflare 側でビルドして公開する。

ダッシュボードの「Workers & Pages」→「Create application」→「Import a repository」で `saboyutaka/okinawa-pdca` を選び、次のように設定する:

| 項目 | 値 |
|---|---|
| プロジェクト名 | `okinawa-pdca`（`site/wrangler.jsonc` の `name` と同じにする） |
| 本番ブランチ | `main` |
| ルートディレクトリ | `site` |
| ビルドコマンド | `npm run build`（`astro check` で型を確かめてから書き出す。型の誤りがあると止まる） |
| デプロイコマンド | `npx wrangler deploy` |
| Node | `site/.node-version`（24）。読まれないときは環境変数 `NODE_VERSION=24` |

ビルドは `../data/extracted` と `../data/reference` を読むので、リポジトリ全体がチェックアウトされている必要がある（Workers Builds はリポジトリ全体を取得する）。

main 以外のブランチ（PR）は `npx wrangler preview` でブランチごとのプレビューになる（`site/wrangler.jsonc` の `previews` の枠が要る）。
