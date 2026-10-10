# 別の PC で開発するとき（data/raw の移し方）

県から取った PDF・zip（`data/raw`）は git に入れていないので、別の PC で PDF を読み直す（`make extract`）ときは、元の PC から zip にして移す。
サイトの開発だけなら何も移さなくてよい（サイトは git に入っている `data/extracted` だけを読む）。

## 1. 何を移すか

| 場所 | 中身 | 新しい PC へ |
|---|---|---|
| `data/extracted`・`data/reference`・`data/raw/manifest.jsonl`・`data/raw/pages.jsonl` | 抽出結果・参照データ・取得台帳 | git で移る（clone・pull） |
| `data/raw/<取得元>/` | 県から取った PDF・zip・巡回したページの HTML（約 2.4GB・約 4,100 ファイル。2026年10月時点） | **zip で移す**（この手順） |
| `data/interim` | `data/raw` の zip を展開したもの | 移さない（`make extract` が作り直す） |
| `site/node_modules`・`site/dist` | サイトの依存・書き出したサイト | 移さない（`make site-install`・`make build`） |

- `data/raw` は新しい PC で `make fetch` して県サイトから取り直すこともできるが、移すほうがよい。取り直すと、1秒間隔で数千件を取るので時間がかかり、県企業局（kigyo）はブラウザで手でダウンロードし直すことになり、県が差し替えたり消したりしたファイルは手元にあった版を取り直せない。
- `data/raw` のファイル名は英数字だけなので、zip で移しても名前は化けない（日本語の名前は `data/interim` の中にだけある）。

## 2. 元の PC で

1. 台帳（`manifest.jsonl`・`pages.jsonl`）をコミットして push し、台帳とファイルがそろっていることを確かめる。新しい PC では、git で届いた台帳と zip で届いたファイルを照らし合わせるため。

   ```sh
   git status data/raw            # 何も出なければよい。台帳が変わっていればコミットして push
   python3 scripts/check_raw.py   # 最後に「OK data/raw は台帳とそろっている」
   ```

2. リポジトリの一番上で zip にする。台帳は git で移るので入れない（入れると、新しい PC で git の版を古い版で上書きすることがある）。

   ```sh
   zip -r -X ~/Desktop/okinawa-pdca-raw.zip data/raw -x 'data/raw/manifest.jsonl' 'data/raw/pages.jsonl' '*.DS_Store'
   ```

   - 2026年10月時点で約 2.0GB、1分ほどかかる。
   - Finder の「圧縮」では作らない（台帳を外せず、`__MACOSX` などが混ざる）。

3. AirDrop・外付けディスク・クラウドストレージなどで新しい PC へ送る。

## 3. 新しい PC で

前提は git・Docker・python3（標準ライブラリだけで動く）。Docker が colima のときは、既定ではホームの下しかコンテナから見えないので、リポジトリはホームの下に置く。

1. clone して（すでにあれば pull して）、元の PC と同じコミットにする。

   ```sh
   git clone https://github.com/saboyutaka/okinawa-pdca.git
   cd okinawa-pdca
   git log -1 --oneline   # 元の PC の git log -1 と同じか
   ```

2. リポジトリの一番上で展開する（zip の中は `data/raw/...` から始まる）。worktree（`.claude/worktrees/`）ではなく、main のチェックアウトに展開する。

   ```sh
   unzip -q ~/Downloads/okinawa-pdca-raw.zip
   ```

   Finder でダブルクリックすると zip の隣に別のフォルダができるので、コマンドで展開する。

3. 台帳とそろったかを確かめる。

   ```sh
   python3 scripts/check_raw.py   # 最後に「OK data/raw は台帳とそろっている」
   git status                     # 何も出なければよい（展開したものは git の対象外）
   ```

   - 「無い」「中身が違う」が出たら、元の PC とコミットが違う（台帳が合っていない）か、zip に入っていない。
   - 「取得していない記録」は、robots.txt で取れない県企業局の古い年度など、元の PC にも無いもの。件数が元の PC と同じならよい。

4. 抽出し直して確かめる（任意。7〜8分）。

   ```sh
   make extract   # data/interim を作り直して抽出し、公表値と突き合わせる
   git status     # 変わるのは docs/issues.md だけ
   ```

   `data/extracted` に差分が出なければ、元の PC と同じ PDF から同じ結果が出ている。`docs/issues.md` は作成日の1行が変わる（同じ日なら変わらない）ので、`git restore docs/issues.md` で戻す。

5. サイトは `make site-install` のあと `make dev`。

## 4. 移したあと

- 県の報告書の取得（`make fetch`）は片方の PC だけで行い、台帳をコミットして push する。両方の PC で取ると、台帳（`manifest.jsonl`）が別々に書き換わって git でぶつかる。
- もう片方の PC へは、pull したあとこの手順でもう一度移す。展開は `unzip -q -o`（手元にあるファイルも zip の中身で上書きする。県が差し替えたファイルは、取った PC の版が台帳と合っている）。そろったかは `python3 scripts/check_raw.py` で分かる。
