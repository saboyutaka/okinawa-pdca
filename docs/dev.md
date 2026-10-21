# 開発の手順

コンテナ・テスト・画面の確認・worktree での開発。コマンドの一覧は `make help`。サイトの作りは [site.md](site.md)。

## 1. コンテナ

ホストに node や Python のライブラリは入れず、`compose.yaml` のコンテナで動かす（`tools` = Python と pdfplumber・PyMuPDF・openpyxl、`site` = Node、`shot` = Playwright と Chromium・日本語フォント Noto Sans CJK。どれもリポジトリを `/work` にマウントし、Docker の既定の bridge に載せるので compose はネットワークを作らない）。開発サーバーは http://localhost:4321/（`SITE_PORT=4400 make dev` で変えられる）。

依存パッケージのインストール時のスクリプト（postinstall など）は動かさない（`site/.npmrc`・`scripts/shot/.npmrc` の `ignore-scripts=true`）。コンテナはリポジトリ全体（main では `.git` も）を書き込める形でマウントしているので、悪意のあるパッケージが入っても `.git/hooks` などを書き換えさせないため。いまの依存はスクリプトが無くても動く。スクリプトが要るパッケージを足すときは、要る理由を確かめてから `npm rebuild <名前> --ignore-scripts=false` でそのパッケージだけ動かす。

## 2. テスト

`make test` で `make test-py`（`scripts/tests/`。抽出の関数を作った値で確かめる。PDF は読まない）と `make test-site`（`site/test/`。lib の関数）の両方。

- `site/test/routes.test.ts` は、公開した URL の一覧（`site/urls.txt`）の URL がどれもページか転送で開けるかを確かめる（[site.md](site.md) の 8章）。
- `site/test/integrity.test.ts` はコミットした `data/extracted` を読み、サイトが前提にしていること（抽出側の `name_key` とサイトの `nameKey` が同じ・どの行も出典にたどれる・取組の URL が重複しない・どの施策もテーマに入る・部局のページがある など）を確かめる。
- 依存は増やさない（Python は標準の `unittest`、サイトは Node の `node:test`）。`.ts` は Node が型を取り除いて動かすので、enum のような取り除くだけでは動かない書き方は使わない。テストの型も `astro check` で確かめる。

## 3. 画面の確認（make shot）

開発サーバーは Vite がコンテナ間のホスト名を断るので撮れない。書き出した `site/dist` を撮る。

```sh
make build && make shot                                    # PC 幅（1280px）とスマホ幅（390px）で撮って tmp/shots に
make shot PAGES="/ /shisaku/1-1-a-1/ --dark"               # ページとオプションを選ぶ
make shot PAGES="/shisaku/1-1-a-1/ --seireki"             # 年を西暦で表示して撮る
make shot PAGES="/torikumi/ --top"                         # 最初の画面だけ
make shot PAGES="/shisaku/1-1-a-1/ --selector .scard"     # 最初に当たる要素だけ
make shot PAGES="/shisaku/1-1-a-1/ --at '#check'"         # その要素まで # で跳んだときの画面（上に貼り付いた目次を見る）
make shot PAGES="/shisaku/1-1-a-1/ --click .like-btn --top"   # 押してから撮る（いいねのお礼のポップアップなど。押した要素が見える位置で撮る）
```

- 読み込みの失敗とブラウザのスクリプトのエラーは `NG`。`--base https://okinawa-miraima.com` で本番を撮るときも同じ（Cloudflare が配信のときに差し込んだスクリプトが CSP に止められたエラーも NG）。ページ全体の画像は縦に長いので、読ませるときは `--top` や `--selector` でしぼる。
- 端末で動きを減らす設定（`prefers-reduced-motion: reduce`）にして開くので、動き（[design.md](design.md) の8章）の途中ではなく、動き終わった形が写る。動きそのものはこの画像では確かめられない。
- 一覧の行は画面の外を描かない（`content-visibility`。[site.md](site.md) の 7章）ので、撮るときはそれを外している。画面の外の行が空に写ることはないが、スクロールしたときの見え方はこの画像では確かめられない。
- 中身は `scripts/shot/shot.ts`。Node が型を取り除いて動かすので `erasableSyntaxOnly` の書き方に限り、変えたら `make shot-typecheck`。TypeScript と `@types/node` の版はサイトにそろえ、Playwright の版は `docker/shot/Dockerfile` の FROM と `package.json` をそろえる。
- `make icons` も同じコンテナの Chromium で、`site/src/assets/favicon.svg` から同じフォルダに `favicon.ico`（16・32・48px）と `apple-touch-icon.png`（180px）、X などの SNS のアカウントの画像 `sns-icon.png`（1024px。サイトでは使わない）を書き出す（`scripts/shot/icons.ts`）。ロゴを変えたら動かしてコミットする。
- SNS のカードの画像（`site/public/og-image.png`）も同じコンテナで HTML から書き出す（`make og-image`。中身は `scripts/shot/og-image.ts` で、`make shot-typecheck` で一緒に型を確かめる。[site.md](site.md) の6章）。ロゴの絵は、`make icons` と同じく `site/src/assets/favicon.svg` から読む（`scripts/shot/logo.ts`）。
- ページごとの SNS のカードの画像（ビルドで書き出す。[site.md](site.md) の6章）で使う字だけを、このコンテナの Noto Sans CJK JP の Bold から切り出すのも同じコンテナ（`make card-font`。中身は `scripts/shot/card-font.ts`）。字はカードの中身（`site/src/lib/card.ts`）から集め、`site/src/fonts/card-bold.woff` と字の一覧 `card-chars.txt` に書き出す（どちらもコミットする）。データや画面の言葉が変わって新しい字が出ると `make test` が落ちるので、そのときに動かす。書体に無い字があると止まるので、`card.ts` の `fold` で置き換える。
- `make build` は、描いたカードの画像を node_modules のボリュームの `.astro/cards` に残し、中身が同じ画像は次から描き直さない（[site.md](site.md) の6章）。`make site-install`（`npm ci`）と worktree の `make down` で node_modules ごと消えるので、その次のビルドは全部を描く。

## 4. git worktree での開発

`.claude/worktrees/<名前>` の中では、Makefile が `compose.worktree.yaml` を重ねて、コンテナと node_modules のボリュームを worktree ごとに分け（`okinawa-pdca-<名前>`）、開発サーバーのポートを名前から決める（4322〜4921。番号は `make help`）。node_modules は初めて動かすときに自動で入る。PDF（`data/raw`・`data/interim`）は worktree には無いので、PDF を読む `make extract`・`make cross-read`・`make issues` は main で行う。消す前に `make down`。
