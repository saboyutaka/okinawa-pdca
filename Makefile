# よく使うコマンド。Python の抽出も Astro もコンテナの中で動かす（ホストに入れない）
.PHONY: help fetch extract check issues test test-py test-site site-install site-check dev build preview shot shot-typecheck down

# git worktree（.claude/worktrees/<名前>）の中では compose.worktree.yaml を重ね、
# コンテナ・node_modules・開発サーバーのポートを worktree ごとに分ける。
# ポートは worktree の名前から 4322〜4921 に決める（同じ worktree ならいつも同じ番号）。
# main でも worktree でも SITE_PORT=4400 make dev のように変えられる
ifeq ($(shell git rev-parse --git-dir),$(shell git rev-parse --git-common-dir))
COMPOSE := docker compose
ifndef SITE_PORT
SITE_PORT := 4321
endif
else
WORKTREE_NAME := $(shell printf '%s' '$(notdir $(CURDIR))' | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9_-' '-')
COMPOSE := docker compose -f compose.yaml -f compose.worktree.yaml
ifndef SITE_PORT
SITE_PORT := $(shell printf '%s' '$(WORKTREE_NAME)' | cksum | awk '{print 4322 + $$1 % 600}')
endif
export WORKTREE_NAME
endif
export SITE_PORT

help:
	@echo "make fetch         県サイトから報告書を取得（ホストの python3、標準ライブラリのみ）"
	@echo "make extract       総括報告書・部局別の検証票・個別計画などから抽出して公表値と突き合わせ"
	@echo "make check         抽出結果を公表値と突き合わせるだけ"
	@echo "make issues        取れていないデータ・誤りの疑いの一覧（docs/issues.md）を作り直す"
	@echo "make test          テスト（抽出スクリプトの test-py とサイトの test-site の両方）"
	@echo "make site-install  サイトの依存パッケージを入れる"
	@echo "make site-check    サイトの型を確かめるだけ（astro check。make build でも書き出しの前に行う）"
	@echo "make dev           サイトの開発サーバー（http://localhost:$(SITE_PORT)/）"
	@echo "make build         サイトの型を確かめてから site/dist に書き出す"
	@echo "make preview       書き出したサイトを確認（http://localhost:$(SITE_PORT)/）"
	@echo "make shot          書き出したサイトを PC 幅とスマホ幅で撮って tmp/shots に（PAGES=\"/ /shisaku/ --dark\"）"
	@echo "make shot-typecheck  scripts/shot（TypeScript）の型を確かめる"
	@echo "make down          コンテナを止めて消す（worktree では node_modules のボリュームも消す）"
	$(if $(WORKTREE_NAME),@echo "（worktree $(WORKTREE_NAME): compose.worktree.yaml を重ねて okinawa-pdca-$(WORKTREE_NAME) として動かす）")

fetch:
	python3 scripts/fetch_pdca.py

extract:
	$(COMPOSE) run --rm tools python scripts/expand_zips.py --source soukatsu
	$(COMPOSE) run --rm tools python scripts/extract_soukatsu.py
	$(COMPOSE) run --rm tools python scripts/extract_bukyoku.py
	$(COMPOSE) run --rm tools python scripts/extract_kanko.py
	$(COMPOSE) run --rm tools python scripts/extract_ikkatsu.py
	$(COMPOSE) run --rm tools python scripts/extract_hyoka.py
	python3 scripts/check_extracted.py
	python3 scripts/report_issues.py

check:
	python3 scripts/check_extracted.py

issues:
	python3 scripts/report_issues.py

test: test-py test-site

# 抽出スクリプトの関数のテスト（unittest）。extract_*.py が pdfplumber を読み込むのでコンテナで動かす
test-py:
	$(COMPOSE) run --rm tools python -m unittest discover -s scripts/tests -t scripts

# サイトの lib のテスト（node --test。Node が型を取り除いて .ts をそのまま動かす）。data/extracted を読むテストもある
test-site:
	$(COMPOSE) run --rm site npm test

site-install:
	$(COMPOSE) run --rm site npm ci

# 型を確かめるだけ（npm run build も書き出しの前に同じことをする）
site-check:
	$(COMPOSE) run --rm site npm run check

dev:
	$(COMPOSE) up site

build:
	$(COMPOSE) run --rm site npm run build

# --ignore-lock は dev と同じ理由（compose.yaml の site を参照）
preview:
	$(COMPOSE) run --rm --service-ports site npm run preview -- --host 0.0.0.0 --port $(SITE_PORT) --ignore-lock

# 書き出したサイトのスクリーンショット（PAGES にページのパスと scripts/shot/shot.ts のオプションを並べる。初めはトップ）
shot:
	$(COMPOSE) run --rm shot node scripts/shot/shot.ts $(PAGES)

# scripts/shot の TypeScript の型を確かめる（node は型を取り除いて動かすだけで、型の誤りでは止まらないため）
shot-typecheck:
	$(COMPOSE) run --rm shot npm --prefix scripts/shot run typecheck

# worktree を片付ける前に使う。main では node_modules のボリュームは残す
down:
	$(COMPOSE) down --remove-orphans $(if $(WORKTREE_NAME),--volumes)
