# 公開

サイト（`site/dist`）を Cloudflare Workers の静的アセットとして公開する手順と設定。

## 1. 検索エンジンに載せない設定

**いまは公開前（ステルス）のため、検索エンジンに載せない設定にしている。** 全ページの `<meta name="robots" content="noindex, nofollow">`（`site/src/lib/links.ts` の `STEALTH`）と、配信時の `X-Robots-Tag: noindex, nofollow`（`site/public/_headers`）。`STEALTH` はヘッダーの上のベータ版の帯（[design.md](design.md) の 7章）も出す（SNS のシェアボタンは、このあいだも出す）。検索に載せてよくなったら、`STEALTH` を `false` にし、`X-Robots-Tag` の行を外す（本番の workers.dev の URL は先に止めてあり、本番を開けるのは okinawa-miraima.com だけ。2章）。`robots.txt` で巡回を止めると noindex が読まれず URL だけ検索結果に出ることがあるので、`robots.txt` では止めない。`robots.txt`（`site/src/pages/robots.txt.ts`）には sitemap の場所だけを書いている。

## 2. Cloudflare の設定

[Cloudflare Workers の静的アセット](https://developers.cloudflare.com/workers/static-assets/)として置き、`site/dist` をそのまま配る。Worker のコードは、`/api/` を受ける `site/worker/api.ts` だけ（いまは、いいねだけ。7章）。設定は [site/wrangler.jsonc](../site/wrangler.jsonc)、配るときのヘッダーは [site/public/_headers](../site/public/_headers)、公開した後に変えた URL の転送は [site/public/_redirects](../site/public/_redirects)（[site.md](site.md) の 8章）。GitHub 連携（[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)）で、main に push するたびに Cloudflare 側でビルドして公開する。

ダッシュボードの「Workers & Pages」→「Create application」→「Import a repository」で `saboyutaka/okinawa-pdca` を選び、次のように設定する:

| 項目 | 値 |
|---|---|
| プロジェクト名 | `okinawa-pdca`（`site/wrangler.jsonc` の `name` と同じにする） |
| 本番ブランチ | `main` |
| ルートディレクトリ | `site` |
| ビルドコマンド | `npm run build`（`astro check` で型を確かめてから書き出す。型の誤りがあると止まる） |
| デプロイコマンド | `npx wrangler deploy` |
| Node | `site/.node-version`（24）。読まれないときは環境変数 `NODE_VERSION=24` |
| ビルドキャッシュ | 有効（プロジェクトの Settings → Build → Build cache。下を参照） |

ビルドは `../data/extracted` と `../data/reference` を読むので、リポジトリ全体がチェックアウトされている必要がある（Workers Builds はリポジトリ全体を取得する）。

ビルドでは、ページごとの SNS のカードの画像（約2,600枚。[site.md](site.md) の6章）も描く。全部を描くと手元で約1分半かかるので、描いた画像を Astro のキャッシュのフォルダ（`site/node_modules/.astro/cards`）に置き、中身が前のビルドと同じ画像は描き直さない（`site/src/lib/card-cache.ts`。手元では2回目から約25秒）。[Workers Builds のビルドキャッシュ](https://developers.cloudflare.com/workers/ci-cd/builds/build-caching/)は、Astro のプロジェクトなら `node_modules/.astro` を次のビルドに残すので、有効にしておく。効いているかはビルドのログの `[card-cache]` の行（「前のビルドの画像を N 枚使い、M 枚を描いた」）で分かる。キャッシュは最後に読まれてから7日で消える（その次のビルドは全部を描く）。データ・カードの見た目・フォント・依存の版が変わった画像は描き直す。

workers.dev の URL（`okinawa-pdca.<アカウント>.workers.dev`）は `site/wrangler.jsonc` の `workers_dev: false` で止めてあり、本番は okinawa-miraima.com（4章）でだけ開く。検索に載せたときに、同じページが別の URL で読まれないようにするため。ダッシュボード（Settings → Domains & Routes）で切っても、次の `npx wrangler deploy` で `wrangler.jsonc` の値（書かなければ有効）に戻るので、`wrangler.jsonc` で決める。カスタムドメインはダッシュボードで付けていて `wrangler.jsonc` には書いていないので、デプロイのログに `No targets deployed for okinawa-pdca` と出ても、公開はされている。

main 以外のブランチ（PR）は `npx wrangler preview` でブランチごとのプレビューになる（`site/wrangler.jsonc` の `previews` の枠が要る）。プレビューの URL は workers.dev の `<ブランチ>-okinawa-pdca.<アカウント>.workers.dev`（Cloudflare が PR にコメントで書く）で、`site/wrangler.jsonc` の `preview_urls: true` で有効にしている。書かないと `workers_dev` に合わせて止まることがある（wrangler 4.149.0 は、プレビューに URL が無いとき `preview_urls = true` を足すよう案内する）。`preview_urls` は、本番の版ごとの URL（`<版の ID の頭8文字>-okinawa-pdca.<アカウント>.workers.dev`）も開けるようにする。プレビューと版ごとの URL には Cloudflare が `X-Robots-Tag: noindex` を付けるので、検索には載らない（2026-10-12 に版ごとの URL で確かめた）。

## 3. 守りのヘッダーと CSP

| 何を | どこで | ねらい |
|---|---|---|
| CSP（`default-src 'self'` と、スクリプトのハッシュ） | 各ページの `<meta>`。`site/astro.config.ts` の `security.csp` で Astro が書き出す | このサイトのファイルと、ビルドで書き出したスクリプト（とアクセス解析のスクリプト。6章）しか動かさない。データに何か混ざっても、スクリプトとしては動かない |
| `frame-ancestors 'none'`・`X-Frame-Options: DENY` | `site/public/_headers` | ほかのサイトの枠（iframe）の中に表示させない。`frame-ancestors` は `<meta>` では効かないのでヘッダーで出す |
| `X-Content-Type-Options`・`Referrer-Policy`・`Permissions-Policy` | `site/public/_headers` | ファイルの種類の決めつけをさせない、県などへのリンクでは、どのページから来たかを送らずサイトのドメインだけを送る、カメラなどを使わせない |
| HSTS（`Strict-Transport-Security: max-age=31536000`） | `site/public/_headers` | 一度 https で開いたブラウザに、この先1年は http で開かせない。http のリンクから来たときなどに、https に移る前の1回目のやりとりを書き換えられないように |

- ページの作り方の決まり（`<script is:inline>` のハッシュなど）は [site.md](site.md) の 3章。
- CSS は `/_astro/` のファイル（`'self'`）だけで、ページに `<style>` を書き出さない（[site.md](site.md) の 7章）。Astro は、ビルドのどこかに `<style>` があると、ビルド全体の `<style>` のハッシュをどのページの CSP にも入れるので、ページが重くなる（2026-10-12 までは約40個・約2KB）。いま残る `style-src-elem` のハッシュ1つは空の文字列のもの（`sha256-47DEQ…`）で、中身の無い `<style>` にしか当たらない。
- `_headers` を変えたら、`wrangler dev` で返るヘッダーを確かめられる（Alpine の `site` コンテナでは動かないので `node:24-slim` で動かす。`site/.wrangler/` に作業用のファイルができる）。
- 依存パッケージを入れるときのスクリプトは `site/.npmrc` の `ignore-scripts=true` で動かさない。ルートディレクトリ（`site`）に置いているので、Cloudflare のビルドで依存を入れるときと `npx wrangler deploy` にも効く（2026-10-12 に wrangler 4.149.0 の `deploy --dry-run` が通ることを確かめた）。
- http から https への転送（301）は、Cloudflare のダッシュボードの「Always Use HTTPS」で有効にしてある。HSTS は git で追えて `wrangler dev` で確かめられるように `_headers` で出し、ダッシュボードの HSTS（SSL/TLS → Edge Certificates）は切ったままにする（片方だけにする）。プレビューの `workers.dev` は `.dev` なので、ブラウザが初めから https にする。
- HSTS に `includeSubDomains`・`preload` は付けない。サブドメインを使っていないうえ、`preload` はブラウザに組み込まれる一覧に載り、すぐには外せないため。そのぶん、初めて http で開いたときの1回目のやりとりは守れない。確かめ方: `curl -sI https://okinawa-miraima.com/ | grep -i strict-transport`

### Cloudflare が配信のときに差し込むスクリプトと CSP

Cloudflare は、配信のときに各ページの `</body>` の前へスクリプトを足す。サイトのコードには無く、手元（`make dev`・`make build`・`make shot`）でも入らないので、本番で確かめる。

| 何を | CSP では | 理由 |
|---|---|---|
| アクセス解析（Web Analytics）の `<script src="https://static.cloudflareinsights.com/…">`（6章） | 許す（`script-src` にホストを足してある） | 外のファイルを読むだけなので、ホストで許せる |
| ボット検出（[JavaScript detections](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/)）のインラインの `<script>`。隠した iframe を作り、`/cdn-cgi/challenge-platform/scripts/jsd/main.js` を読み込む | 止まる | 中身にリクエストごとの値（`window.__CF$cv$params={r:'…',t:'…'}`）が入るので、ハッシュでは許せない。Cloudflare は CSP の nonce をレスポンスヘッダーからしか読まず、`<meta>` の CSP には対応していない |

- ボット検出のスクリプトが止まると、ブラウザのコンソールに `Executing inline script violates the following Content Security Policy directive 'script-src …'` が出る。ボット検出が動かないだけで、ページの表示や動きには影響しない。
- Cloudflare の docs では、JS detections を切れるのは Super Bot Fight Mode（Pro 以上）と Enterprise の Bot Management で、Bot Fight Mode では常に有効で切れない。このゾーンは Free で、Bot Fight Mode を切ってあっても差し込まれている（2026-10-12 に確かめた。ブラウザでなくても、`curl -s https://okinawa-miraima.com/ | grep -c challenge-platform` が 1）。
- 許すために `'unsafe-inline'` は足さない（ハッシュがあると無視されるうえ、データに混ざったスクリプトも動いてしまう）。nonce を使うには、ページを Worker で配ってリクエストごとに CSP のヘッダーを作ることになるので、そこまではしない。
- `make shot` で `--base` を付けて本番を撮るとこのエラーが出るので、差し込まれたスクリプトのハッシュを名指しした CSP のエラーだけは NG に数えない（`scripts/shot/shot.ts`）。ほかの CSP のエラーは NG のまま。

## 4. ドメイン

本番は https://okinawa-miraima.com/（Cloudflare のカスタムドメイン。ダッシュボードの Settings → Domains & Routes で付けている）。workers.dev の URL は止めてある（2章）。ドメインを変えるときは `site/src/lib/links.ts` の `SITE.url` を直す（`canonical`・`og:url`・`og:image`・sitemap・構造化データ・シェアの URL がここから作られる。[site.md](site.md) の6章）。SNS のカードの画像にもドメインを書いているので、`make og-image` で作り直す。

Cloudflare の管理用の robots.txt（AI 向けの content signals）を有効にしていると、Cloudflare が `robots.txt` の頭に自分の文を書き足す。

## 5. 配信のキャッシュ

Cloudflare の静的アセットは、何も書かなければ `Cache-Control: public, max-age=0, must-revalidate` で配られ、ブラウザは開くたびに ETag で変わっていないかを確かめる（変わっていなければ 304 で中身は送らない）。[site/public/_headers](../site/public/_headers) で次のように変えている。

| 対象 | Cache-Control | 理由 |
|---|---|---|
| `/_astro/*` | 1年・immutable | ファイル名に中身のハッシュが付く（CSS・JS・数字のフォント・favicon） |
| `/torikumi/data-*.json`・`/torikumi/summary-*.json` | 1年・immutable | 取組をさがすの検索用データとやったこと。ファイル名に中身のハッシュが付く（`lib/search-data.ts`） |
| ページ（`/` と末尾が `/` の URL） | 5分。過ぎても1日までは手元のページをすぐ出し、裏で取り直す（`stale-while-revalidate`） | HTML にだけ ETag が付かず、304 で済ませられないため（開くたびに全部を取り直していた） |
| ほか（検索用データの控えの `/torikumi/data.json`・`summary.json`、根元の `/favicon.ico` など） | 既定のまま | ETag が付くので、変わっていなければ 304 |

- HTML に ETag が付かないのは、workers.dev でも独自ドメイン（okinawa-miraima.com）でも同じ。Cloudflare の配信の途中で外れていて、ゾーンの設定では直らない（2026-10-12 に確かめた。本番の workers.dev の URL はその後に止めたので、workers.dev で確かめ直すときはプレビューか版ごとの URL を使う。2章）。
  - 静的アセットを返す Cloudflare のプログラム（workers-sdk の `asset-worker`）は、HTML にも ETag を付け、`If-None-Match` には 304 を返す作りになっている。その手前の `router-worker` も ETag を外さない。外しているのはその後ろ（ソースは公開されていない）。
  - 本番では HTML だけが、圧縮しない（identity）ときも ETag と Content-Length が無い（HTTP/1.1 では chunked）。CSS・JSON・SVG・txt・woff2 は付く。中身は書き換わっていないが、HTML だけ別の処理を通っている。ほかの人の workers.dev のサイトも同じ。
  - [ETag headers](https://developers.cloudflare.com/cache/reference/etag-headers/) が ETag を外す機能に挙げる Replace insecure JavaScript libraries・Email Address Obfuscation・Automatic HTTPS Rewrites を、okinawa-miraima.com のゾーンで全部切っても付かなかった（Bot Fight Mode・AI Labyrinth も切ってある）。
- なので、ページの5分のキャッシュは外さない。上の3つは切ったままにしておく。このサイトには要らないうえ（外のライブラリを読み込まない・メールアドレスが無い・`http://` で読み込むものが無い）、Email Address Obfuscation が足すスクリプトと Replace insecure JavaScript libraries が書き換えるスクリプトは、各ページの `<meta>` の CSP と合わない。
- ページを5分キャッシュするので、公開し直してから5分までは、前に開いたページが古いまま見えることがある（再読み込みで新しくなる）。5分を過ぎても1日までは、手元のページを1回出してから裏で取り直す（`stale-while-revalidate`。Chrome・Firefox が読み、Safari は読まずに取り直す）ので、前に開いたページを開き直すとすぐに出るかわりに、公開し直したあとの1回は古いまま見えることがある。ブラウザのキャッシュはサイトの側から消せないので、ページを長くキャッシュさせることはしない。
- Cloudflare の配信の拠点のキャッシュ（`cf-cache-status`）は、`_headers` の Cache-Control には従っていない（`max-age=0` の `sitemap.xml`・`/torikumi/data.json` も HIT になる。2026-10-13 に確かめた）。静的アセットのキャッシュは Cloudflare が持ち、長さもこちらでは決められない。OCN の回線などからは、リクエストのたびに海外の拠点（SJC・LHR・MIA・AMS など）が変わり、拠点ごとにキャッシュが無い（MISS）ことが多い。MISS のときは配信に 160〜280ms、HIT のときは 25〜40ms かかっていた（`server-timing` の `cfEdge`）。
- ページの Cache-Control のルールには、ビルドで CSS と数字のフォントの `Link: <…>; rel=preload` を書き足す（`site/astro.config.ts` の `earlyHints`。ファイル名がビルドごとに変わるため）。Cloudflare の [Early Hints](https://developers.cloudflare.com/cache/advanced-configuration/early-hints/)（ダッシュボードの Speed → Settings → Content Optimization で有効にする）は、このヘッダーを覚えておき、次からは HTML を用意しているあいだに 103 で先に送る。ブラウザは HTML を待たずに CSS とフォントを取りに行ける。HTML がすぐ返せる（拠点にキャッシュがある）ときは 103 を送らないので、効くのは上の MISS のとき。無料プランでも使える（HTTP/2・HTTP/3 のときだけ）。
  - 同じパスのルールを `_headers` の後ろにもう1つ書くと、前のルールの Cache-Control が効かなくなった（wrangler 4.149.0 の `wrangler dev` で確かめた）。なので、もとの `/`・`/*/` のルールの中に書き足す。
  - 確かめ方: `curl -sI https://okinawa-miraima.com/ | grep -i '^link'` でヘッダーが付いているか。103 が返るかは `curl -sv --http2 https://okinawa-miraima.com/ -o /dev/null 2>&1 | grep -E '< HTTP|< link'` を2回（1回目で Cloudflare が覚える）。
- `_headers` は同じヘッダーを2つのルールで付けると値をコンマでつなぐ。Cache-Control のルールは対象が重ならないように書く。
- 確かめ方: `curl -sI https://okinawa-miraima.com/shihyou/ | grep -iE 'cache-control|etag'`

## 6. アクセス解析

ページの閲覧数（PV）・訪問・よく見られるページ・どこから来たかは、[Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/)（無料・Cookie を使わない）で見る。ダッシュボードの「Web Analytics」で okinawa-miraima.com を自動で差し込む設定（automatic setup）にしてあり、Cloudflare が配信のときに各ページの `</body>` の前へ計測のスクリプト（`https://static.cloudflareinsights.com/beacon.min.js/v…`）を足す。サイトのコードには入れていない。

- CSP の `script-src` に `https://static.cloudflareinsights.com` を足してある（`site/astro.config.ts`）。差し込まれる URL は版で変わるので、ホストで許す。計測の送り先は同じドメインの `/cdn-cgi/rum` なので、`default-src 'self'` で足りる。
- 同じところに、ボット検出のインラインのスクリプトも差し込まれる。こちらは CSP に止められ、コンソールにエラーが出る（3章）。計測には関わらない。
- 差し込まれるのは `Accept: text/html` を付けたリクエスト（ブラウザ）のときだけ。`curl` の既定（`Accept: */*`）では入らない。手元（`make dev`・`make build`）でも入らないので、計測されない。
- ゾーンの「Analytics & Logs」→「HTTP Traffic」の数（リクエスト・Unique Visitors）は CSS・JS・ボットも含み、Unique Visitors は IP で数えるので多めに出る。人がどのページを見たかは Web Analytics で見る。
- 確かめ方: `curl -s -H 'Accept: text/html' https://okinawa-miraima.com/ | grep -c cloudflareinsights` が 1。ブラウザの開発者ツールでは、コンソールに CSP の違反が出ず、ネットワークに `/cdn-cgi/rum` への送信があること。

## 7. いいねの数

ページの終わりのいいねのボタン（`site/src/components/Like.astro`。[design.md](design.md) の 9章）は、押すと `POST /api/like?page=<ページのパス>`（`/shisaku/1-1-a-1/` なら `/api/like?page=/shisaku/1-1-a-1/`）を1回送る。受けるのは `site/worker/api.ts` で、204 を返すだけで何も記録しない。データベースも、数を返す API も無い。件数は画面に出さず、運営が Cloudflare のダッシュボードで見るだけ。

- `site/wrangler.jsonc` の `main` が Worker、`assets.run_worker_first: ["/api/*"]` で `/api/` だけ Worker を先に通す。ほかは今までどおり静的なファイルを先に探す。ビルドとデプロイの手順（2章）は変わらない（`npx wrangler deploy` が Worker のコードをまとめて `dist` と一緒に上げる。PR のプレビューにも入る）。
- 無いファイルへの、ページの移動でないリクエスト（`fetch`・画像など）も Worker に来る（ページの移動は来ない。`compatibility_date` が 2025-04-01 より後のため）。Worker は `/api/like` でなければ静的なファイルの側（`assets.binding` の `ASSETS`）に戻し、今までと同じ 404 のページを返す。
- 件数の見方: ダッシュボードの「Workers & Pages」→ `okinawa-pdca` →「Observability」のログ（Workers Logs。`wrangler.jsonc` の `observability`）で、URL が `/api/like` のものを数える。どのページかは URL の `page` で分かる。無料プランでは**3日分しか残らない**（1日20万件まで）ので、数日おきに見る。
- 「Metrics」の Requests の数は3か月見られるが、上の無いファイルへのリクエスト（ボットの探索など）も入るので、いいねの数にはならない。
- 何度でも送れる（ログインも記録も無いので、同じ人かどうか分からない）。`curl` などでいくらでも増やせるので、数は目安として見る。押せるのはボタンを1回表示したうち1回だけ（開き直せばまた押せる）。
- クローラーがたどったり先読みしたりしても数に入らないように、`POST` だけを受ける（ほかは 405）。
- 無料プランの Worker の1日の上限（10万回）を超えると、その日は Worker に来るリクエストだけが 429 になる。静的なファイルの配信は数えられず、上限も無いので、サイトのページは止まらない。
- 手元（`make dev`・`make shot`）には Worker が無い。`make dev` ではボタンの送信が失敗するが、お礼は送れたかどうかに関係なく出す。`make shot` は Worker の代わりに `/api/like` への POST に 204 を返す（`--click .like-btn` で押してから撮れる。[dev.md](dev.md) の 3章）。Worker を動かして確かめるときは、`make build` のあと `site` で `npx wrangler dev`（3章と同じく `node:24-slim` で）。2026-10-12 に wrangler 4.149.0 で、`POST /api/like` が 204、`GET /api/like` が 405、ページが 200、無いページと無いファイルが 404 のページになることを確かめた。
