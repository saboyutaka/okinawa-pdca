# よく使うコマンド。Python の抽出も Astro もコンテナの中で動かす（ホストに入れない）
.PHONY: help fetch extract check site-install dev build preview

help:
	@echo "make fetch         県サイトから報告書を取得（ホストの python3、標準ライブラリのみ）"
	@echo "make extract       総括報告書と部局別の検証票から抽出して公表値と突き合わせ"
	@echo "make check         抽出結果を公表値と突き合わせるだけ"
	@echo "make site-install  サイトの依存パッケージを入れる"
	@echo "make dev           サイトの開発サーバー（http://localhost:4321/）"
	@echo "make build         サイトを site/dist に書き出す"
	@echo "make preview       書き出したサイトを確認（http://localhost:4321/）"

fetch:
	python3 scripts/fetch_pdca.py

extract:
	docker compose run --rm tools python scripts/expand_zips.py --source soukatsu
	docker compose run --rm tools python scripts/extract_soukatsu.py
	docker compose run --rm tools python scripts/extract_bukyoku.py
	python3 scripts/check_extracted.py

check:
	python3 scripts/check_extracted.py

site-install:
	docker compose run --rm site npm ci

dev:
	docker compose up site

build:
	docker compose run --rm site npm run build

preview:
	docker compose run --rm --service-ports site npm run preview -- --host 0.0.0.0
