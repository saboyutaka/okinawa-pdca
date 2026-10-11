# 公開

サイト（`site/dist`）を Cloudflare Workers の静的アセットとして公開する手順と設定。

## 1. 検索エンジンに載せない設定

**いまは公開前（ステルス）のため、検索エンジンに載せない設定にしている。** 全ページの `<meta name="robots" content="noindex, nofollow">`（`site/src/layouts/Base.astro` の `NOINDEX`）と、配信時の `X-Robots-Tag: noindex, nofollow`（`site/public/_headers`）。検索に載せてよくなったら両方を外す。`robots.txt` で巡回を止めると noindex が読まれず URL だけ検索結果に出ることがあるので、`robots.txt` では止めない。`robots.txt`（`site/src/pages/robots.txt.ts`）には sitemap の場所だけを書いている。

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

## 3. 守りのヘッダーと CSP

| 何を | どこで | ねらい |
|---|---|---|
| CSP（`default-src 'self'` と、スクリプト・`<style>` のハッシュ） | 各ページの `<meta>`。`site/astro.config.ts` の `security.csp` で Astro が書き出す | このサイトのファイルと、ビルドで書き出したスクリプトしか動かさない。データに何か混ざっても、スクリプトとしては動かない |
| `frame-ancestors 'none'`・`X-Frame-Options: DENY` | `site/public/_headers` | ほかのサイトの枠（iframe）の中に表示させない。`frame-ancestors` は `<meta>` では効かないのでヘッダーで出す |
| `X-Content-Type-Options`・`Referrer-Policy`・`Permissions-Policy` | `site/public/_headers` | ファイルの種類の決めつけをさせない、県などへのリンクでは、どのページから来たかを送らずサイトのドメインだけを送る、カメラなどを使わせない |

- ページの作り方の決まり（`<script is:inline>` のハッシュなど）は [site.md](site.md) の 3章。
- `_headers` を変えたら、`wrangler dev` で返るヘッダーを確かめられる（Alpine の `site` コンテナでは動かないので `node:24-slim` で動かす。`site/.wrangler/` に作業用のファイルができる）。
- 依存パッケージを入れるときのスクリプトは `site/.npmrc` の `ignore-scripts=true` で動かさない。ルートディレクトリ（`site`）に置いているので、Cloudflare のビルドで依存を入れるときと `npx wrangler deploy` にも効く（2026-10-12 に wrangler 4.149.0 の `deploy --dry-run` が通ることを確かめた）。
- 独自ドメインを付けたら、Cloudflare のダッシュボードで「Always Use HTTPS」と HSTS を有効にする（`workers.dev` は `.dev` なのでブラウザが初めから HTTPS にする）。

## 4. ドメイン

本番は https://okinawa-miraima.com/（Cloudflare のカスタムドメイン）。ドメインを変えるときは `site/src/lib/links.ts` の `SITE.url` を直す（`canonical`・`og:url`・sitemap・構造化データ・シェアの URL がここから作られる。[site.md](site.md) の6章）。

Cloudflare の管理用の robots.txt（AI 向けの content signals）を有効にしていると、Cloudflare が `robots.txt` の頭に自分の文を書き足す。

## 5. 配信のキャッシュ

Cloudflare の静的アセットは、何も書かなければ `Cache-Control: public, max-age=0, must-revalidate` で配られ、ブラウザは開くたびに ETag で変わっていないかを確かめる（変わっていなければ 304 で中身は送らない）。[site/public/_headers](../site/public/_headers) で次のように変えている。

| 対象 | Cache-Control | 理由 |
|---|---|---|
| `/_astro/*` | 1年・immutable | ファイル名に中身のハッシュが付く（CSS・JS・数字のフォント） |
| ページ（`/` と末尾が `/` の URL） | 5分 | HTML にだけ ETag が付かず、304 で済ませられないため（開くたびに全部を取り直していた） |
| ほか（`/torikumi/data.json`・favicon など） | 既定のまま | ETag が付くので、変わっていなければ 304 |

- HTML に ETag が付かないのは、workers.dev でも独自ドメイン（okinawa-miraima.com）でも同じ。Cloudflare の配信の途中で外れていて、ゾーンの設定では直らない（2026-10-12 に確かめた）。
  - 静的アセットを返す Cloudflare のプログラム（workers-sdk の `asset-worker`）は、HTML にも ETag を付け、`If-None-Match` には 304 を返す作りになっている。その手前の `router-worker` も ETag を外さない。外しているのはその後ろ（ソースは公開されていない）。
  - 本番では HTML だけが、圧縮しない（identity）ときも ETag と Content-Length が無い（HTTP/1.1 では chunked）。CSS・JSON・SVG・txt・woff2 は付く。中身は書き換わっていないが、HTML だけ別の処理を通っている。ほかの人の workers.dev のサイトも同じ。
  - [ETag headers](https://developers.cloudflare.com/cache/reference/etag-headers/) が ETag を外す機能に挙げる Replace insecure JavaScript libraries・Email Address Obfuscation・Automatic HTTPS Rewrites を、okinawa-miraima.com のゾーンで全部切っても付かなかった（Bot Fight Mode・AI Labyrinth も切ってある）。
- なので、ページの5分のキャッシュは外さない。上の3つは切ったままにしておく。このサイトには要らないうえ（外のスクリプトを読み込まない・メールアドレスが無い・`http://` で読み込むものが無い）、Email Address Obfuscation が足すスクリプトと Replace insecure JavaScript libraries が書き換えるスクリプトは、各ページの `<meta>` の CSP と合わない。
- ページを5分キャッシュするので、公開し直してから5分までは、前に開いたページが古いまま見えることがある（再読み込みで新しくなる）。
- `_headers` は同じヘッダーを2つのルールで付けると値をコンマでつなぐ。Cache-Control のルールは対象が重ならないように書く。
- 確かめ方: `curl -sI https://okinawa-miraima.com/shihyou/ | grep -iE 'cache-control|etag'`
