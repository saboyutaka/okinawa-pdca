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

## 3. 配信のキャッシュ

Cloudflare の静的アセットは、何も書かなければ `Cache-Control: public, max-age=0, must-revalidate` で配られ、ブラウザは開くたびに ETag で変わっていないかを確かめる（変わっていなければ 304 で中身は送らない）。[site/public/_headers](../site/public/_headers) で次のように変えている。

| 対象 | Cache-Control | 理由 |
|---|---|---|
| `/_astro/*` | 1年・immutable | ファイル名に中身のハッシュが付く（CSS・JS。数字のフォントは CSS に埋め込んでいる） |
| ページ（`/` と末尾が `/` の URL） | 5分 | HTML にだけ ETag が付かず、304 で済ませられないため（開くたびに全部を取り直していた） |
| ほか（`/torikumi/data.json`・favicon など） | 既定のまま | ETag が付くので、変わっていなければ 304 |

- HTML に ETag が付かないのは、workers.dev でも独自ドメイン（okinawa-miraima.com）でも同じ（2026-10-12 に確かめた。HTML の中身は書き換わっていない）。わけはまだ分からない。ゾーンの HTML 向けの機能（Email Address Obfuscation・Automatic HTTPS Rewrites など）が有効だと Cloudflare は ETag を外すので（[ETag headers](https://developers.cloudflare.com/cache/reference/etag-headers/)）、それらを切って ETag が付けば、ページの5分のキャッシュは外してよい（このサイトにはメールアドレスが無く、外のサイトへの `http://` のリンクは数件だけなので、切っても見え方は変わらない）。
- ページを5分キャッシュするので、公開し直してから5分までは、前に開いたページが古いまま見えることがある（再読み込みで新しくなる）。
- `_headers` は同じヘッダーを2つのルールで付けると値をコンマでつなぐ。Cache-Control のルールは対象が重ならないように書く。
- 確かめ方: `curl -sI https://okinawa-miraima.com/shihyou/ | grep -iE 'cache-control|etag'`
