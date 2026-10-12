# 開発の手順

コンテナ・テスト・画面の確認・worktree での開発。コマンドの一覧は `make help`。サイトの作りは [site.md](site.md)。

## 1. コンテナ

ホストに node や Python のライブラリは入れず、`compose.yaml` のコンテナで動かす（`tools` = Python 3.13 + pdfplumber / PyMuPDF / openpyxl、`site` = node:24-alpine、`shot` = Playwright と Chromium・日本語フォント Noto Sans CJK。どれもリポジトリを `/work` にマウントする）。開発サーバーは http://localhost:4321/（`SITE_PORT=4400 make dev` で変えられる）。

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
make shot PAGES="/torikumi/ --top"                         # 最初の画面だけ
make shot PAGES="/shisaku/1-1-a-1/ --selector .scard"     # 最初に当たる要素だけ
```

- 読み込みの失敗とブラウザのスクリプトのエラーは `NG`。ページ全体の画像は縦に長いので、読ませるときは `--top` や `--selector` でしぼる。
- 一覧の行は画面の外を描かない（`content-visibility`。[site.md](site.md) の 7章）ので、撮るときはそれを外している。画面の外の行が空に写ることはないが、スクロールしたときの見え方はこの画像では確かめられない。
- 中身は `scripts/shot/shot.ts`。Node が型を取り除いて動かすので `erasableSyntaxOnly` の書き方に限り、変えたら `make shot-typecheck`。TypeScript と `@types/node` の版はサイトにそろえ、Playwright の版は `docker/shot/Dockerfile` の FROM と `package.json` をそろえる。

## 4. git worktree での開発

`.claude/worktrees/<名前>` の中では、Makefile が `compose.worktree.yaml` を重ねて、コンテナと node_modules のボリュームを worktree ごとに分け（`okinawa-pdca-<名前>`）、開発サーバーのポートを名前から決める（4322〜4921。番号は `make help`）。node_modules は初めて動かすときに自動で入る。PDF（`data/raw`・`data/interim`）は worktree には無いので、`make extract` は main で行う。消す前に `make down`。
