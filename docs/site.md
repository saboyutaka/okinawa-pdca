# サイトの作り

`site/`（Astro）の作り。見た目と見せ方の決まりは [design.md](design.md)、開発の手順（コンテナ・テスト・画面の確認・worktree）は [dev.md](dev.md)、データの作り方は [data.md](data.md)。

## 1. データの読み込みと数え方

- 全ページをビルド時に静的 HTML として書き出す（`output: 'static'`、`trailingSlash: 'always'`）。`src/lib/data.ts` が `data/extracted` を読んでページ用の形にする（取組の年度をまたいだまとまり `getTorikumiGroups`、部局票との結び付け `budgetOf`、予算の重複除去 `amountEntries` など）。
- ブラウザにデータ全体は配らない。例外は取組の検索で、ビルド時に書き出した `/torikumi/data.json` をブラウザで読む。
- 数え方は `lib/data.ts` に1か所で決め、どのページもそれを使う（ページごとに書くと、数とリンク先の件数がずれる）。
  - `PATTERNS`: 取組の4年間の様子（4年とも遅れ・3年以上遅れ・遅れから順調に など）。将来像・部局の「前の年度からの変化」（`components/Moves.astro`）と取組をさがすの絞り込みが使う。
  - `JUDGE_TRENDS`: 施策の判定の移り変わり（上がった・下がった・3年続けて遅れ）。A → B → C〜F → G の順で比べ、C〜F の中での入れ替わりは数えない。施策をさがすの絞り込み（`?trend=`）と、将来像・部局の「前の年度からの変化」が使う。
  - `JUDGE_CELLS`: 判定の区分表（[data.md](data.md) の 6.3）。判定のマス目（`components/JudgeMatrix.astro`）と、印字された判定が区分表どおりかを確かめるテストが使う。
  - `shisakuDepts`: 部局がかかわる施策（関係部等に名前がある施策と、その部局の取組がある施策）。
  - `seikaOfTorikumi`・`torikumiOfSeika`: 主な取組と成果指標の結び付き（部局票の「対応する成果指標」を、同じ施策のその年度の成果指標の名前と比べる。`seikaNameMatches`）。取組のページ・施策ページの取組のカードは部局票がある最新の年度のもの、成果指標のページの「かかわる主な取組」はどれかの年度で結び付いた取組（最新の年度だけだと、R6 で終わった指標に取組が付かない）。

## 2. TypeScript

- Astro の `strict`。`npm run build` は `astro check` で型を確かめてから書き出すので、型の誤りがあると Cloudflare のビルドも止まる。`astro check` が TypeScript 7 に対応していないので、TypeScript は 6。
- 抽出結果の JSON の形は `src/lib/types.ts`（`load(name)` の戻り値）。抽出の出力の欄を変えたらここも直す。
- ページ用の形（`Shisaku`・`TorikumiGroup`・`SeikaGroup`・`KankoShisaku` など）は `lib/data.ts`・`lib/plans.ts` が出す。コンポーネントの `Props` はこれを使い、`any` にしない。状態の色と形は `lib/icons.ts` の `Tone`・`Shape`。
- 動的なページは `getStaticPaths` の `props` でデータを渡し、`InferGetStaticPropsType` で型を付ける（`Astro.params` から探し直さない）。
- ブラウザに渡す JSON は、書き出す側と読む側で同じ型を使う（図は `scripts/charts.ts` の `SeikaData`・`TrendData`・`KatsudouData`、取組の検索は `pages/torikumi/data.json.ts` の `SearchData`）。
- 外のサイトへのリンクは、すべて `components/ExtLink.astro` で書く（別のタブで開き、外部リンクの印と読み上げ用の「別のタブで開きます」を付ける）。素の `<a>` はサイトの中のリンクだけ。

## 3. lib とスクリプト

- `src/lib/`: `data.ts`（読み込みとページ用の形・数え方）、`plans.ts`（観光ロードマップ・一括交付金・評価検証報告書）、`themes.ts`（くらしのテーマ）、`icons.ts`（状態と判定の形）、`terms.ts`（用語の説明）、`text.ts`（PDF の改行の整形）、`format.ts`（数の書き方）、`links.ts`（サイトの名前と外部の URL）、`iken.ts`・`share.ts`（意見募集とシェア）。
- `src/scripts/`（ブラウザ）:
  - `charts.ts`: `[data-chart]` の JSON から表示幅に合わせて SVG の図を描く（固定幅の SVG を縮めるとスマホで文字が小さくなりすぎるため）。一覧の行の小さな図 `components/SeikaSpark.astro` は文字が無いのでビルド時に SVG にする。
  - `list-filter.ts`: `form[data-filter]` の入力の name と、一覧の `[data-item]` の `data-<name>` を比べて絞り込む。条件は URL のクエリに残す。キーワード以外の条件は `components/FilterMore.astro` で畳む。
  - `show-more.ts`: `ul[data-more="N"]` の N 件より後を隠し、「さらに表示」で出す（スクリプトが動かないときは全部見える。残りが2件以下なら畳まない）。
  - `disclosure.ts`（すべて開く・# の行き先の details を開く）、`scroll-hint.ts`（横にすべらせる帯の端をぼかす）、`tooltip.ts`・`tip.ts`・`terms.ts`・`theme.ts`。
- CSP（[deploy.md](deploy.md) の 3章）で、ブラウザが動かすのはこのサイトのファイルと、Astro が書き出したスクリプト・`<style>` だけ。外のサイトのスクリプト・フォント・画像は読み込めず、`onclick` のような属性に書いたスクリプト・`javascript:` のリンク・`eval` は動かない（style 属性は許している）。
  - `<script is:inline>` は Astro がハッシュを足さないので、`layouts/Base.astro` のように中身を文字列にして `set:html` で出し、同じ文字列のハッシュを `Astro.csp.insertScriptHash` で足す。
  - 違反はブラウザのエラーになり、`make shot` で `NG` と出る。

## 4. ページ

トップ、`/theme/<id>/`（くらしのテーマ）、`/future/`（将来像）、`/kihon/<id>/`（基本施策）、`/shisaku/`（施策）、`/torikumi/`（取組の検索と取組。URL は `key` の SHA-1 の先頭8桁）、`/shihyou/`（成果指標の一覧と成果指標。URL は取組と同じく `/shihyou/<施策ID>/<key の SHA-1 の先頭8桁>/`。`lib/data.ts` の `keySlug`・`seikaHref`）、`/bukyoku/`（部局）、`/keikaku/`（個別計画。観光ロードマップ）、`/yosan/`（予算と財源、`zaigen/`・`ikkatsu/`）、`/about/`、`/code-for-okinawa/`、`/iken/`。ページごとの並びは [design.md](design.md) の 11章。

## 5. くらしのテーマの定義

施策名・施策展開・基本施策の名前に当たる言葉と、人が直すための追加・除外は [data/reference/themes.json](../data/reference/themes.json)。基本施策の名前は広いので、短い言葉だと関係のない施策まで入る（「働きやすい環境づくり」の「環境」、「亜熱帯海洋性気候」の「海洋」など）。言葉は長めにし、先読み・後読み（`海洋(?!性気候)`）や exclude で外す。入らない施策があるとビルドで警告し、`make test` で落ちる。

## 6. 検索エンジンと SNS 向け

本番のドメインは `lib/links.ts` の `SITE.url`（https://okinawa-miraima.com/）に1か所で決め、`astro.config.ts` の `site` もこれを使う。URL・sitemap・robots.txt・構造化データを作る関数は `lib/seo.ts`。

- 全ページの head に `canonical` と `og:url`（本番のドメインでのそのページの URL。クエリは付けない）を出す。workers.dev・プレビュー・絞り込みのクエリ付きの URL も、本番のそのページとして扱ってもらうため。どの URL にも出る 404 のページだけは出さない（`Base` の `canonical={false}`）。
- `sitemap.xml` は、`astro.config.ts` の小さな統合が、書き出した全ページ（404 と、`/torikumi/data.json` のようなファイルを除く）から作る。依存を足さないため `@astrojs/sitemap` は使わない。`robots.txt` は `pages/robots.txt.ts` で、巡回は止めずに sitemap の場所だけを書く（[deploy.md](deploy.md) の1章）。
- 構造化データ（JSON-LD）は、トップに `WebSite`（サイトの名前と略称・作り手の Code for Okinawa・もとにした県の資料）、パンくずのあるページに `BreadcrumbList`（`components/Crumbs.astro`）を出す。県を作り手として書かない（県は `isBasedOn` に並べた資料の作り手として書く）。`<script type="application/ld+json">` はデータで、動くスクリプトではないので、3章の CSP のハッシュは要らない。
- SNS のシェアの URL も、ビルド時に本番のドメインで入れる（`components/Share.astro`）。

## 7. 表示の速さ

- 一覧の行（`.row-list > li`）は `content-visibility: auto` で、画面の外の行を描かない（`styles/global.css`）。成果指標・施策・一括交付金などの一覧は数百行あり、全部を描くとスマホで読み込みと絞り込みが重いため（スマホ幅でレイアウトのやり直しが 200ms 台から 10〜30ms に減った）。行の中身は行の外へはみ出せないので、吹き出しなどは body に付ける。`make shot` は画面の外まで撮るので、これを外して撮る。
- ページの先読みは Speculation Rules（`layouts/Base.astro` の `SPECULATION`）。サイトの中のリンクにマウスを乗せる・押し始めると行き先の HTML を先に取る（いまは Chrome・Edge だけ）。スクリプトは使わない。`<script type="speculationrules">` も CSP のハッシュが要るので、3章の `<script is:inline>` と同じように足す。
- ページから `<head>` に足すものは `<link slot="head" ...>` で渡す（取組をさがすの `data.json` の preload）。
- 数字のフォント（約4KB）は `/_astro/` にハッシュ付きの名前で書き出し（`astro.config.ts` の `vite.build.assetsInlineLimit`）、ずっとキャッシュさせる。CSS に埋め込むと CSP の `default-src 'self'` に止められる（`data:` のフォントになるため）。配信のキャッシュの決まりは [deploy.md](deploy.md) の 5章。
