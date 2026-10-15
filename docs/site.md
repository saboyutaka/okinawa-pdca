# サイトの作り

`site/`（Astro）の作り。見た目と見せ方の決まりは [design.md](design.md)、開発の手順（コンテナ・テスト・画面の確認・worktree）は [dev.md](dev.md)、データの作り方は [data.md](data.md)。

## 1. データの読み込みと数え方

- 全ページをビルド時に静的 HTML として書き出す（`output: 'static'`、`trailingSlash: 'always'`）。`src/lib/data.ts` が `data/extracted` を読んでページ用の形にする（取組の年度をまたいだまとまり `getTorikumiGroups`、部局票との結び付け `budgetOf`、予算の重複除去 `amountEntries` など）。
- ブラウザにデータ全体は配らない。例外は取組の検索で、ビルド時に書き出した `/torikumi/data-<ハッシュ>.json`（一覧と絞り込み）と `/torikumi/summary-<ハッシュ>.json`（キーワードで探すときだけ使う「やったこと」。7章）をブラウザで読む（中身は `lib/search-data.ts`）。名前に中身のハッシュが付くのでずっとキャッシュさせ（`public/_headers`）、名前の変わらない控えの `/torikumi/data.json`・`summary.json` は、公開し直した直後に前のページから開いたとき（前のハッシュのファイルはもう無い）だけ読む。計画の目次（`/mokuji/`）も同じく、目次の木（名前とリンクだけ。中身は `lib/tree-data.ts`）を `/mokuji/data-<ハッシュ>.json`（控えは `/mokuji/data.json`）から描く（7章）。指標のマップ（`/map/`）のマスを押したときの中身（名前・ページ・年度ごとの値。中身は `lib/map-data.ts`）も、指標ごとの `/map/<指標>-<ハッシュ>.json`（控えは `/map/<指標>.json`）を押したときに読み、キーワードで探す文字は `/map/search-<ハッシュ>.json`（控えは `/map/search.json`）をキーワードの欄に入ったときに読む（7章）。
- 数え方は `lib/data.ts` に1か所で決め、どのページもそれを使う（ページごとに書くと、数とリンク先の件数がずれる）。
  - `PATTERNS`: 取組の4年間の様子（4年とも遅れ・3年以上遅れ・遅れから順調に など）。部局の「前の年度からの変化」（`components/Moves.astro`）と取組をさがすの絞り込みが使う。
  - `JUDGE_TRENDS`: 施策の判定の移り変わり（上がった・下がった・3年続けて遅れ）。A → B → C〜F → G の順で比べ、C〜F の中での入れ替わりは数えない。施策をさがすの絞り込み（`?trend=`）と、部局の「前の年度からの変化」が使う。
  - `JUDGE_CELLS`: 判定の区分表（[data.md](data.md) の 6.3）。判定のマス目（`components/JudgeMatrix.astro`）と、印字された判定が区分表どおりかを確かめるテストが使う。
  - `shisakuDepts`: 部局がかかわる施策（関係部等に名前がある施策と、その部局の取組がある施策）。
  - `SHUYOU_BINS`・`shuyouBin`: 主要指標の達成状況の区分（概要版の達成率の印字で決める。`scripts/check_extracted.py` の `shuyou_bin` と同じ）。区分の色と形（`tone`）は成果指標の達成率の区分（`RATE_BINS`）にそろえる。`getShuyouStatus` が最新の年度の概要版の行に、区分と基本施策ページのその指標のカードへのリンクを付ける。トップと将来像のページの頭の3つの段（`components/Ladder.astro`。区分の内訳の棒1本）、トップの将来像の行（`components/Tiers.astro`。主要指標の1指標1マスのマス目の棒と主な取組の棒の2本。`SHUYOU_CATS`・`shuyouCounts` は3つの段と同じ数え方）、5つの将来像のページの基本施策の行（名前の後ろに、区分の言葉 `word` と達成率の数の札を報告書の順に並べる `components/ShuyouTags.astro`）、将来像ページの基本施策の行（`components/KihonRow.astro`。指標の名前の後ろに同じ札と、スタート → いま → ゴールの値。年・年度は `eraRef` で「R3」の形にそろえる）が使う。主要指標だけの一覧のページは置かない（[design.md](design.md) の1章）。
  - `getShouraizou`: 将来像の名前は語尾の「を目指して」を外して出す（`shouraizouName`。総括報告書の付属資料は章の見出しの形「〜島を目指して」で印字しているが、基本計画の概念図などでは将来像そのものを「〜島」と呼ぶため。`data/extracted` は印字のまま）。
  - `countJudges`: 施策の最新の年度の判定の内訳（A〜G と判定なし）。判定のマス目（トップ・将来像・部局・テーマ）と、ページの説明文（6章）が使う。
  - `lib/heads.ts`: ページの頭に出す最新の年度の数（施策・基本施策・将来像・くらしのテーマ・部局ごとの、施策の判定・主な取組の進捗状況・成果指標の達成率の内訳）。ページの説明文と SNS のカードの画像（6章）が使い、ページの判定のマス目も同じ数を出す。
  - `seikaOfTorikumi`・`torikumiOfSeika`: 主な取組と成果指標の結び付き（部局票の「対応する成果指標」を、同じ施策のその年度の成果指標の名前と比べる。`seikaNameMatches`）。部局票は複数の指標をまとめた名前（「交通事故重傷者数及び死者数」「〜と考えている児童生徒の割合」など）で書くことがあるので、空白・記号の違いを無視して、含む・含まれるか、指標の名前の字が部局票の名前に同じ順で出てくれば当たりとする（指標の名前の末尾の「（小学校）」のような内訳の括弧は外しても比べる）。取組のページ・施策ページの取組のカードの「対応する成果指標」は、部局票がある最新の年度のもの。県は「対応する成果指標」に施策の成果指標をまとめて書いていて（R4〜R7 のどの部局票も、その施策のその年度の成果指標すべてに当たる。`test/integrity.test.ts`）、取組ごとには分かれていないので、成果指標のページの取組（`torikumiOfSeika`）は名前で結ばず、指標の最新の報告と同じ年度の施策の取組をまとめて出す。

## 2. TypeScript

- Astro の `strict`。`npm run build` は `astro check` で型を確かめてから書き出すので、型の誤りがあると Cloudflare のビルドも止まる。`astro check` が TypeScript 7 に対応していないので、TypeScript は 6。
- 抽出結果の JSON の形は `src/lib/types.ts`（`load(name)` の戻り値）。抽出の出力の欄を変えたらここも直す。
- ページ用の形（`Shisaku`・`TorikumiGroup`・`SeikaGroup`・`KankoShisaku` など）は `lib/data.ts`・`lib/plans.ts` が出す。コンポーネントの `Props` はこれを使い、`any` にしない。状態の色と形は `lib/icons.ts` の `Tone`・`Shape`。
- 動的なページは `getStaticPaths` の `props` でデータを渡し、`InferGetStaticPropsType` で型を付ける（`Astro.params` から探し直さない）。`getStaticPaths` はページに書かず、`lib/routes.ts` の `ROUTES` に書く（8章）。
- ブラウザに渡す JSON は、書き出す側と読む側で同じ型を使う（図は `scripts/charts.ts` の `SeikaData`・`TrendData`・`KatsudouData`、取組の検索は `lib/search-data.ts` の `SearchData`）。
- 外のサイトへのリンクは、すべて `components/ExtLink.astro` で書く（別のタブで開き、外部リンクの印と読み上げ用の「別のタブで開きます」を付ける）。素の `<a>` はサイトの中のリンクだけ。「別のタブで開きます」はリンクの中の文字にせず、`layouts/Base.astro` に1つだけ置いた隠した文を `aria-describedby` で指す（文をコピーしたときに付いてこないように）。リンクのすぐ後ろに「」」「）」が続くときは `after="」"` で渡す（印の後ろで折り返して、閉じかっこが行の頭に来ないように）。

## 3. lib とスクリプト

- `src/lib/`: `data.ts`（読み込みとページ用の形・数え方）、`describe.ts`（ページの説明文。6章）、`plans.ts`（観光ロードマップ・一括交付金・評価検証報告書）、`themes.ts`（くらしのテーマ）、`icons.ts`（状態と判定の形）、`terms.ts`（用語の説明）、`text.ts`（PDF の改行の整形）、`search.ts`（表記ゆれをそろえる・検索の比べ方・当たった所。ブラウザでも読み込む）、`search-data.ts`・`tree-data.ts`（取組をさがす・計画の目次がブラウザで読む JSON）、`map-data.ts`（指標のマップのマスと、押したときに読む JSON）・`map-label.ts`（指標のマップのマス目の読み上げ。ブラウザでも読み込む）、`format.ts`（数の書き方）、`links.ts`（サイトの名前と外部の URL）、`era.ts`（年を西暦で表示するときの書き換え。下の `era.ts` と7章）、`routes.ts`（動的なページの URL と、公開した URL の一覧の確かめ。8章）、`iken.ts`・`share.ts`・`like.ts`（意見募集とシェアといいね）。
- `worker/api.ts`（Cloudflare の Worker）: `/api/` を受ける。いまは、いいねの `POST /api/like?page=<ページのパス>` に 204 を返すだけ。サイトで Worker が動くのはここだけ（[deploy.md](deploy.md) の1章）。
- `scripts/urls.ts`（node。`make urls`）: 公開した URL の一覧（`urls.txt`）を書き直す（8章）。
- `src/scripts/`（ブラウザ）: 入口は `site.ts` の1つだけで、どのページも `layouts/Base.astro` の `<head>` でこれを読み込む（7章）。スクリプトを足すときは、ページや部品に `<script>` を書かず、`src/scripts/` のファイルにして `site.ts` から import する。どのページでも動くので、自分の部品が無いページでは何もしないように書く（`for (... of document.querySelectorAll(...))` か、要素が無ければ戻る）。動く順は `site.ts` の import の順。例外は、年を西暦で表示するときに読む `/era-<ハッシュ>.js`（`lib/era.ts` の `ERA_JS`。7章）。
  - `charts.ts`: `[data-chart]` の JSON から表示幅に合わせて SVG の図を描く（固定幅の SVG を縮めるとスマホで文字が小さくなりすぎるため）。一覧の行の小さな図 `components/SeikaSpark.astro` は文字が無いのでビルド時に SVG にする。
  - `list-filter.ts`: `form[data-filter]` の入力の name と、一覧の `[data-item]` の `data-<name>` を比べて絞り込む。条件は URL のクエリに残す。キーワード以外の条件は `components/FilterMore.astro` で畳む（開け閉めは `filter-more.ts`）。
  - `torikumi-search.ts`: 取組をさがす（`#tf`）の検索と一覧。検索用のデータを読んで一覧を描く（7章）。`shisaku-trend.ts`: 施策の一覧の頭の「判定の移り変わり」のリンクで絞り込みを変える。`like.ts`: いいねのボタン（`components/Like.astro`）。`tree.ts`: 計画の目次（`/mokuji/`）の木を JSON から描き、「開く深さ」のボタン（押した階層まで木を開く）と、キーワード（施策・取組・成果指標の名前を部分一致でさがし、当たった行とその親だけを残して開き、当たった字に `<mark>` を付ける。言葉は URL の `q` に残す。当たった所は `lib/search.ts` の `matchRanges`）。
  - `indicator-map.ts`: 指標のマップ（`/map/`）の年度の切り替え・キーワードと絞り込み・マスを押したときの中身。
  - `show-more.ts`: `ul[data-more="N"]` の N 件より後を隠し、「さらに表示」で出す（スクリプトが動かないときは全部見える。残りが2件以下なら畳まない）。
  - `disclosure.ts`（# の行き先の details を開く・押して開いたときの動き）、`print.ts`（印刷の直前に details を開き、ダークをライトにし、`html.printing` でページを紙の幅にそろえる。印刷が終わったら戻す。`charts.ts` より前に読み込み、図は印刷の前後に描き直す）、`scroll-hint.ts`（横にすべらせる帯の端をぼかす）、`table-scroll.ts`（横にすべらせる表の箱 `.table-wrap` を、表が入りきらないときだけ Tab で止まる名前つきの region にする）、`toc.ts`（ページ内の目次 `components/Toc.astro` で、いま読んでいる節に印を付ける。目次が上に貼り付いたら、何のページかの1行を出す。貼り付いたかは、目次の前の目印 `.toc-mark` が画面の上から出たかをスクロールのたびに見る。IntersectionObserver は # のリンクで画面の下から上へ一度に跳ぶと知らせないため）、`tooltip.ts`・`tip.ts`・`terms.ts`・`theme.ts`。
  - `era.ts`: 年の書き方（和暦・西暦）の切り替えボタン（フッター）。書き換えは `lib/era.ts` の `ERA_JS`（別のファイル）が受け持ち、`window.era` を置く。和暦のままの人が押したときは、ここでそのファイルを読み込んでから切り替える。図（`charts.ts`）は描く文字を `window.era.text` で西暦にしてから幅を測り（入れたあとで書き換わると札が重なる）、切り替えたら描き直す。吹き出し（`tip.ts`・`terms.ts`）は中身を入れたら `window.era.fix` で書き換えてから大きさを測る。
  - `motion.ts`: 動き（[design.md](design.md) の8章）のうち、スクリプトから動かすもの（件数のはね・押して出した行）と、端末で動きを減らす設定かどうか。動きの見た目は `styles/global.css` の「動き」にまとめる。
- CSP（`astro.config.ts` の `security.csp` で各ページの `<meta>` に出す）で、ブラウザが動かすのはこのサイトのファイルと、Astro が書き出したスクリプトだけ（ほかは Cloudflare が配信のときに差し込むアクセス解析のスクリプトだけ）。CSS は `/_astro/` のファイルだけで、ページに `<style>` は書き出さない（7章）。外のサイトのスクリプト・フォント・画像は読み込めず、`onclick` のような属性に書いたスクリプト・`javascript:` のリンク・`eval` は動かない（style 属性は許している）。
  - `<script is:inline>` は Astro がハッシュを足さないので、`layouts/Base.astro` のように中身を文字列にして `set:html` で出し、同じ文字列のハッシュを `Astro.csp.insertScriptHash` で足す。
  - 違反はブラウザのエラーになり、`make shot` で `NG` と出る。

## 4. ページ

トップ、`/theme/`（くらしのテーマの一覧とテーマ）、`/future/`（将来像）、`/kihon/<id>/`（基本施策）、`/shisaku/`（施策）、`/torikumi/`（取組の検索と取組。URL は `key` の SHA-1 の先頭8桁）、`/shihyou/`（成果指標の一覧と成果指標。URL は取組と同じく `/shihyou/<施策ID>/<key の SHA-1 の先頭8桁>/`。`lib/data.ts` の `keySlug`・`seikaHref`）、`/bukyoku/`（部局）、`/mokuji/`（計画の目次。将来像 → 基本施策 → 施策展開 → 施策 → 主な取組（最新の年度）を、開け閉めできる `details` の入れ子で並べ（木は HTML に書かず、`scripts/tree.ts` が JSON から描く。7章）、基本施策には主要指標、施策には成果指標を付ける（PC の幅では名前の横に、スマホでは開いた中の行に。同じ指標を2か所に書き、幅で片方だけを出す）。木の中身は `lib/data.ts` の `getPlanTree`。名前のリンクは `summary` の外に置き、`summary` は ▶ の丸だけにする（`summary` の中にリンクを置くと、押せるものが入れ子になる）。入口はいまはフッターだけ）、`/keikaku/`（個別計画。観光ロードマップ）、`/yosan/`（予算と財源、`zaigen/`・`ikkatsu/`）、`/about/`、`/code-for-okinawa/`、`/iken/`、`/map/`（指標のマップ。主要指標・成果指標・活動指標を1マス＝1指標で将来像ごとに並べ、年度ごとの県の区分で色分けする。入口はいまはフッターだけ）。公開した URL は変えない（8章）。

## 5. くらしのテーマの定義

施策名・施策展開・基本施策の名前に当たる言葉と、人が直すための追加・除外は [data/reference/themes.json](../data/reference/themes.json)。基本施策の名前は広いので、短い言葉だと関係のない施策まで入る（「働きやすい環境づくり」の「環境」、「亜熱帯海洋性気候」の「海洋」など）。言葉は長めにし、先読み・後読み（`海洋(?!性気候)`）や exclude で外す。入らない施策があるとビルドで警告し、`make test` で落ちる。

## 6. 検索エンジンと SNS 向け

本番のドメインは `lib/links.ts` の `SITE.url`（https://okinawa-miraima.com/）に1か所で決め、`astro.config.ts` の `site` もこれを使う。URL・sitemap・robots.txt・構造化データを作る関数は `lib/seo.ts`。

- 全ページの head に `canonical` と `og:url`（本番のドメインでのそのページの URL。クエリは付けない）を出す。プレビューと版ごとの URL（workers.dev。[deploy.md](deploy.md) の3章）・絞り込みのクエリ付きの URL も、本番のそのページとして扱ってもらうため。どの URL にも出る 404 のページだけは出さない（`Base` の `canonical={false}`）。
- `sitemap.xml` は、`astro.config.ts` の小さな統合が、書き出した全ページ（404 と、`/torikumi/data.json` のようなファイルを除く）から作る。依存を足さないため `@astrojs/sitemap` は使わない。`robots.txt` は `pages/robots.txt.ts` で、巡回は止めずに sitemap の場所だけを書く（[deploy.md](deploy.md) の4章）。
- 構造化データ（JSON-LD）は、トップに `WebSite`（サイトの名前と略称・作り手の Code for Okinawa・もとにした県の資料）、ページの階層のあるページに `BreadcrumbList`（`components/Hierarchy.astro`。画面の階層に無いいまのページを最後に足し、ページの無い段の施策展開は入れない）を出す。県を作り手として書かない（県は `isBasedOn` に並べた資料の作り手として書く）。`<script type="application/ld+json">` はデータで、動くスクリプトではないので、3章の CSP のハッシュは要らない。
- SNS のカードは、全ページの head に `og:image`（大きさと説明の文も `og:image:width`・`og:image:height`・`og:image:alt` で書く）・`twitter:card`（`summary_large_image`）・`og:locale`（`ja_JP`）を出す。カードの題名と説明の文は、ページの題名と説明文（下の `lib/describe.ts`）をそのまま `og:title`・`og:description` に出す。
- カードの画像は、施策・基本施策・将来像・くらしのテーマ・部局・主な取組・成果指標のページ（約2,600）はページごとの画像、ほかのページはサイト共通の画像（`layouts/Base.astro` がページの URL で選ぶ。`lib/card.ts` の `cardMeta`）。
  - ページごとの画像は `/og/<ページの URL の末尾の / を .png にしたもの>`（`/og/shisaku/1-1-a-1.png`）。ビルドで `pages/og/[...card].png.ts` が書き出す。中身（satori に渡す要素の木）は `lib/card.ts`、PNG にするのは `lib/card-render.ts`（satori で SVG にし、resvg で PNG にする）。`og:image` の URL には中身のハッシュを `?v=` で付け、中身が変わったら SNS が取り直すようにする（Cloudflare はクエリを見ずに同じ画像を返す）。
  - 中身はページの頭と同じ: 名前と、施策は県の判定のハンコと主な取組の進捗状況・成果指標の達成率の内訳、基本施策・将来像・くらしのテーマ・部局は施策の判定と主な取組の進捗状況の内訳（数は `lib/heads.ts`。ページの説明文と同じ）、主な取組は親の施策の札と4年分のスタンプ、成果指標は親の施策の札と計画値に届いたか・スタート → いま → ゴールの数字・道のりの図（ページの図 `scripts/charts.ts` の seika と同じ形。図を描けない指標は数字だけ）。内訳は区分の並びのまま、0でない区分を全部同じ大きさで並べ、状態は形と文字でも出す（[design.md](design.md) の1・2章）。下の帯にサイトの名前・（非公式）・by Code for Okinawa を入れる。色は `styles/global.css` の `:root`（ライト）を読んで使う。
  - 名前は、satori に文節の折り返しが無いので、単語の区切り（`Intl.Segmenter`）のうち、ひらがな・句読点の後ろで次がひらがなでないところで文節に分け（`phrases`）、文節の箱を折り返して並べる。文字の大きさは、カードの種類ごとに名前に使える高さに収まる一番大きなものにする（入らなければ … で切る。全文は `og:title` にある）。
  - 日本語の字の形は、カードで使う字だけを Noto Sans CJK JP の Bold から切り出したフォント（`src/fonts/card-bold.woff` と字の一覧 `card-chars.txt`。`make card-font`。[dev.md](dev.md) の3章）。データや画面の言葉が変わって新しい字が出ると、`make test`（`test/card.test.ts`）とビルドが止まるので、`make card-font` で切り出し直してコミットする。書体に無い字（CO₂ の ₂ など）は `lib/card.ts` の `fold` で、ある字に置き換える。ライセンスは `public/fonts/NotoSansCJK-OFL.txt`（SIL OFL）。
  - 1枚50ms ほどかかり、全部で約2,600枚あるので、描くのはメインのスレッドの外（resvg の `renderAsync`）にし、ページを4つ並べて書き出す（`astro.config.ts` の `build.concurrency`）。全部を描くとビルドは手元で約1分半（画像なしで約20秒）。Workers Builds の時間の上限（20分）には十分収まる。
  - 描いた画像は Astro のキャッシュのフォルダ（`node_modules/.astro/cards`）に、中身（要素の木）と描き方（フォント・`lib/card-render.ts`・`package-lock.json`）のハッシュの名前で置き、同じ画像は次のビルドで描き直さない（`lib/card-cache.ts`。手元では2回目から約25秒）。ビルドの終わりに、使った数・描いた数をログに出し、そのビルドで使わなかった画像を消す（`astro.config.ts` の `cardCache`）。Workers Builds ではビルドキャッシュを有効にしておく（[deploy.md](deploy.md) の2章）。
  - サイト共通の画像は `public/og-image.png`（パス・大きさ・説明の文は `lib/seo.ts` の `OG_IMAGE`）。`scripts/shot/og-image.ts` が HTML から書き出す（`make og-image`。サイトの名前・説明・作り手は `lib/links.ts` から、ロゴの絵は `src/assets/favicon.svg` から入れるので、名前やロゴを変えたら作り直す。書き出した PNG はコミットする）。
- `og:type` は、1つのもの（施策・取組・成果指標・基本施策・将来像・くらしのテーマ・部局・観光ロードマップ）を見せるページを `article`、一覧・トップ・サイトの説明を `website` にする（`Base` の `ogType`）。
- SNS のシェアの URL も、ビルド時に本番のドメインで入れる（`components/Share.astro`）。
- ページの説明文（`description`・`og:description`）は `lib/describe.ts` で作る。検索結果で切れても意味が通るように、最新の年度の中身（施策は判定と主な取組・成果指標の数、取組は4年分の進捗状況・最新の報告の「やったこと」・所管課、成果指標は実績値・達成率・目標値、将来像・基本施策・部局・テーマは施策の判定と取組・成果指標の内訳）を先に、何のページかを後ろに書く。取組の説明文の終わりには活動指標の名前も入れる（同じ施策で所管課・進捗状況が同じ取組でも、説明文が同じにならないように。県が複数の取組に同じ活動概要を書いていることもある）。数はページが表示している数（頭の札・ドーナツ・判定のマス目）をそのまま渡し、`describe.ts` では数えない（1章）。内訳は県の区分の並びのまま、0でない区分を全部同じ重みで並べる（遅れだけを書く・遅れを先に書く、はしない）。くらしのテーマは、切れてもこのサイト独自の分類だと分かるように頭に書く。
- 施策・基本施策・主な取組・成果指標・部局のページの題名には「沖縄県」を入れる（「〇〇（沖縄県の主な取組）」「沖縄県土木建築部の取組」）。サイトの名前はひらがなで、取組・指標・部局の名前だけではほかの県のものと見分けにくく、「沖縄県 〇〇」で探す人にも当たるようにするため。県の計画の項目だと書くだけで、サイトが県を名乗るのではない。くらしのテーマはこのサイト独自の分類なので入れない。
- 題名と説明文は、ページごとに違うものにする（同じだと検索結果で見分けにくく、検索エンジンに重複とみなされやすい）。同じ取組が複数の施策に載っている（再掲）と施策ごとにページがあるので、その取組の題名だけ後ろに施策の番号を足す（「〇〇（沖縄県の主な取組・施策 1-(2)-イ-①）」。`describe.ts` の `torikumiTitle`）。成果指標で、同じ施策の同じ年度に内訳の名前が無く同じ名前で並んでいるものは、内訳の名前で出す（`lib/data.ts` の `SEIKA_ALIASES`。[data.md](data.md) の「年度をまたいだ同じ成果指標」）。取組・成果指標のページの題名と説明文は `make test`（`test/describe.test.ts`）で、ほかのページと同じでないかを確かめる。ほかのページも、ビルドの終わりに書き出した全ページ（404 を除く）を数え、同じものがあれば警告する（`astro.config.ts`、`lib/seo.ts` の `duplicateHeads`）。

## 7. 表示の速さ

- 一覧の行（`.row-list > li`）は `content-visibility: auto` で、画面の外の行を描かない（`styles/global.css`）。成果指標・施策・一括交付金などの一覧は数百行あり、全部を描くとスマホで読み込みと絞り込みが重いため（スマホ幅でレイアウトのやり直しが 200ms 台から 10〜30ms に減った）。行の中身は行の外へはみ出せないので、吹き出しなどは body に付ける。`make shot` は画面の外まで撮るので、これを外して撮る。
- ページの先読みは Speculation Rules（`layouts/Base.astro` の `SPECULATION`）。サイトの中のリンクにマウスを乗せる・押し始めると行き先の HTML を先に取る（いまは Chrome・Edge だけ）。スクリプトは使わない。`<script type="speculationrules">` も CSP のハッシュが要るので、3章の `<script is:inline>` と同じように足す。
- 動き（[design.md](design.md) の8章）は見た目だけを動かし（transform・opacity などで、レイアウトのやり直しをしない）、読み込んだときの動き（ドーナツ・スタンプ）は CSS だけで動かす（スクリプトの読み込みを待たず、止まっても必ず終わる）。外のライブラリは使わない。足したとき（2026-10）は、CPU を4倍遅くしたスマホ幅と PC 幅で、トップ・施策・将来像・成果指標をさがす・取組をさがすの CLS・LCP・長いタスク・50ms を超えたコマの数を前と比べ、測るたびのぶれの中で変わらないことを確かめた（CLS はどれも 0〜0.012 のまま）。
- ページから `<head>` に足すものは `<link slot="head" ...>` で渡す（取組をさがすの検索用データ `data-<ハッシュ>.json`・計画の目次のデータの preload）。
- 指標のマップ（`/map/`）は、約2,000のマス（色と年度ごとの区分の番号、絞り込みの部局・テーマ）だけを HTML に書き（約230KB、gzip で約18KB）、名前と値は指標ごとの JSON にして、マス目にマウスを乗せた・押した・フォーカスしたときに読む（gzip で主要指標 約6KB・成果指標 約59KB・活動指標 約154KB。2026-10-15）。キーワードで探す文字は gzip で約77KB。中身を全部 HTML に書くと1MB を超えるため。
- 計画の目次（`/mokuji/`）は約2,500行あり、HTML に書くと 750KB（gzip で約87KB）になった。ブラウザのスクリプトはページを読み終えてから動くので、戻る・進むで読み直したとき（bfcache を使わないとき）に、絞り込む前の目次と空の言葉の欄がしばらく見えてから描き直していた。いまは HTML（約12KB）には目次を書かず、名前とリンクだけの JSON（約225KB、gzip で約63KB。`lib/tree-data.ts`）を preload して `scripts/tree.ts` が描く。
  - URL に `q` があれば、さがしてから一度で描く。データが届くまでは目次の場所を画面の高さぶん取り（取組をさがすと同じ）、言葉の欄は URL の `q` で先に埋める。
  - 描き直しで開き方とスクロールの位置が失われないよう、離れるとき（`pagehide`）に `history.state` の `tree` に残し、描いたあとに戻す（データのファイルが変わったら使わない）。
  - スクリプトが動かないときは目次を出さず、施策をさがす・5つの将来像へのリンクを出す（`<noscript>`）。
- 取組をさがすの検索用データは、一覧と絞り込みに使う `data`（gzip で約105KB）と、キーワードで探すときだけ使う「やったこと」の `summary`（約96KB）の2つのファイルに分ける（`lib/search-data.ts`）。1つだったとき（約200KB）は、Slow 4G で読むだけで約1秒かかり、そのあいだ最初の一覧が出なかった。
  - `summary` はキーワードの欄に入ったとき（クエリに `q` があるときは初めから `data` と一緒に）読む。最初の一覧は `summary` を待たない。届くまではキーワードで探さず、件数を「読み込み中…」にする（一覧はそのまま）。読めなかったときは名前などだけで探し、件数の横にそう書く。
  - 片方だけを控え（`data.json`・`summary.json`）から読むと、公開し直した直後に、前の版と新しい版が混ざることがある。行の並びで対応させているので、`data` に同じビルドの `summary` の `hash` を持たせ、合わなければ両方を控えから読み直す。
  - 行の URL（`href`）は施策の番号と重なるが、短くしても gzip で約4KB しか減らない（残りはハッシュの8桁で、縮まない）ので、URL の作り方をブラウザに持たせず、そのまま渡す。
- ブラウザのスクリプトは `scripts/site.ts` を入口にした1つのファイル（約37KB、gzip で約12KB）にし、`layouts/Base.astro` の `<head>` で読み込む（`type="module"` なので、動くのはページを読み終えてから）。ずっとキャッシュされ、2ページ目からは読まない。
  - 前はページや部品ごとに `<script>` を書いていて、Astro はそれぞれを別のファイルにし、共通の部分（`motion.ts`・`tip.ts`）もまた別のファイルにしていた（トップで9ファイル）。ブラウザは入口のファイルを読み終えてから共通の部分を取りに行くので、往復が1回ぶん増えていた（本番で約170ms。トップは入口 → `show-more` → `motion` と2回）。
  - `<body>` の終わりに置いていたときは、CSS が届くまでスクリプトを取りに行かなかった（Chrome は優先度の低い読み込みを後回しにする）。`<head>` に置くと、CSS と並んで取りに行く。
  - 前後の書き出しを手元で HTTP/2 で配り、スマホ幅で往復 150ms を足して測ると（各5回の中央値。2026-10-13）、スクリプトが動き終わる（DOMContentLoaded）までが、トップで 777→470ms、施策のページで 767→473ms、施策の一覧で 1060→569ms、取組をさがすで 816→502ms になった。最初の描画は変わらない（+10ms 前後で、測るたびのぶれの中）。どのページも全部のスクリプトを読むので、初めて開くページの JS は増えるが（施策のページで gzip 約5KB）、2ページ目からは読まない。
- CSS はページの `<style>` に埋め込まず（`astro.config.ts` の `build.inlineStylesheets: 'never'`）、全ページで1つのファイル（`vite.build.cssCodeSplit: false`。gzip で約18KB）にして `/_astro/` に書き出す（ずっとキャッシュされる）。
  - 埋め込んでいたときは、ページごとの CSS（中央値 3.2KB）をページを移るたびに送り直していた。また Astro は、ビルド全体の `<style>` のハッシュ（約40個）をどのページの CSP にも入れる（約2KB。ハッシュは圧縮が効かない）。やめると、HTML（gzip）の中央値が 13.7KB から 11.1KB に、CSP が約3KB から約1KB になった（2026-10-12）。
  - CSS のファイルを分けたまま（Astro の既定）だと、ページの種類ごとに初めて開くときに読む CSS が増え（部局のページで15個）、HTML のあとに CSS をもう1往復待つ。手元で HTTP/2・brotli で配り、スマホ幅・Slow 4G・CPU 4倍で測ると（2026-10-12）、1つにしたときは、最初に開くページの LCP が約50ms 遅く（CSS が大きくなるため）、トップから施策・取組のページに移ったときは約1.3秒から約0.65秒になった（CSS をキャッシュから読むため。埋め込んでいたときも、施策・取組のページは別の CSS のファイルを読んでいた）。
  - CSS が1つなので、部品やページの `<style>` もどのページにも届く。Astro の `<style>` は部品ごとに範囲をしぼる（scoped）ので混ざらないが、`:global()` を単独で書くと全ページに効く。`.x :global(.y)` のように、範囲をしぼった要素の中に書く。
- 数字のフォント（約4KB）は `/_astro/` にハッシュ付きの名前で書き出し（`astro.config.ts` の `vite.build.assetsInlineLimit`）、ずっとキャッシュさせる。CSS に埋め込むと CSP の `default-src 'self'` に止められる（`data:` のフォントになるため）。配信のキャッシュの決まりは `public/_headers`。
- ページを移ったあとに見た目が変わらないようにする（ずれ・ちらつき）。ヘッダーはどのページにもあるので特に気をつける。
  - スクリプトでしか動かないものを、読み込んだあとに `hidden` を外して出すと、そのぶんずれる（配色のボタンを出すとヘッダーが 6px 伸び、ページ全体が下にずれていた）。`<head>` のインラインスクリプトが `html` に `js` を付けるので、`:root:not(.js)` で隠し、最初の描画から出す。中身もいまの状態に合わせて CSS で選ぶ（配色のボタンの ☾ ダーク／☀ ライト、年の書き方のボタンの 西暦で表示／令和で表示）。
  - 年を西暦で表示するとき（[design.md](design.md) の2章）は、書き換えのスクリプト（`lib/era.ts` の `ERA_JS`、`/era-<ハッシュ>.js`）を `<head>` のインラインスクリプトが `document.write` で読み込み、読み終えるまでページを読み進めない。そのスクリプトがページを読みながら（MutationObserver）書き換えるので、最初の描画から西暦で出る（`site.ts` で読み終えてから書き換えると、和暦が一瞬見え、文字の幅のぶんずれる。ページを移るときの View Transition にも和暦が写る）。ページに埋め込むと、どのページの HTML も gzip で約1.5KB 増える（中央値 11KB の1割強。2026-10-15）ので、別のファイルにして西暦を選んだ人だけが読む（名前に中身のハッシュが付き、ずっとキャッシュされる）。和暦のままの人は読まない。
  - ナビの横の位置は、前のページの位置を引き継ぐ（`layouts/Base.astro` の `NAV_SCROLL`。sessionStorage の `nav-x`）。端のぼかしもそこで付ける。
  - 取組をさがすの一覧は、検索用のデータが届いてからスクリプトで描く。届くまでは一覧（`#results` の `aria-busy`）が画面の高さぶんの場所を取っておく。空のままだと下の注記が最初の画面に見え、届いて行を描くと押し出されて、ページが大きくずれていた（CLS が PC 幅で 0.33、スマホ幅で 0.27。0.1 以下が「良い」）。絞り込み中の札も、URL の条件からデータを待たずに出す。
  - クエリ付きの URL で当たりが0件のときは、取っておいた場所が無くなって注記が画面に入るので、そのぶんずれる（CLS 約0.2）。1件以上なら 0.1 未満。
  - 確かめ方: Chrome の開発者ツールの Performance（Layout shifts）か Lighthouse。手元の `make build` ではデータがすぐ届くので、回線を絞るか、データの読み込みを遅らせて測る。

## 8. URL を変えない

SNS で共有されたリンクや検索エンジンの評価が切れないように、公開したページの URL は変えない。取組・成果指標の URL は名前の key のハッシュ（4章）なので、抽出を直して名前が変わると URL も変わる。取組は最新の年度の名前の key を使うので、新しい年度の報告で名前の書き方が変わったとき（表記ゆれでまとめた名前も）にも変わる。施策・基本施策・将来像・部局・くらしのテーマのページも、ID や slug が変わると URL が変わる。

- 動的なページ（`src/pages` の `[..]` の付いたファイル）の `getStaticPaths` は、`lib/routes.ts` の `ROUTES` に1か所で書く（ページは `export const getStaticPaths = ROUTES['shisaku/[id]']`）。動的なページを足したら `ROUTES` にも足す（合わないと `make test` が落ちる）。
- 全ページの URL は `pagePaths`（`src/pages` の `.astro` と `ROUTES` から作る。404 は除き、sitemap.xml と同じ）。テストは書き出さずにこれを使うので、ビルドの終わりに書き出したページと同じかを確かめる（`astro.config.ts`。違うとビルドが止まる）。
- 公開した URL の一覧は `site/urls.txt`（1行に1つ）。一覧のどれかの URL のページが無くなり、`site/public/_redirects` の転送も無いと、`make test`（`test/routes.test.ts`）が落ちる。ページが増えるのはよい（一覧に無いページの数を出す）。
- ページを足したとき・データを入れ直したときは、`make urls` で一覧に足してコミットする（消えた URL は残す）。

URL を変えるとき（テストが落ちたとき）:

1. 公開前（[deploy.md](deploy.md) の4章の noindex を外す前）は、転送は要らない。`make urls PRUNE=1` で、ページも転送も無くなった URL を一覧から消す。
2. 公開した後は、テストが挙げた古い URL ごとに、`site/public/_redirects` に「古い URL 新しい URL 301」の行を足す（Cloudflare の [_redirects](https://developers.cloudflare.com/workers/static-assets/redirects/)）。古い URL は一覧に残し、`make urls` で新しい URL を足す。`PRUNE=1` は使わない。
   - 新しい URL は、同じ取組・指標などの新しいページ。行き先の無くなったページ（取組の終了など）も、近いページ（施策のページなど）へ転送する。
   - `make test` は、状態コードが 301 であること（書かないと 302 になり、検索エンジンが新しい URL に評価を移さない）・新しい URL のページがあること・古い URL にページが無いこと（Cloudflare は転送をページより先に効かせるので、そのページが見えなくなる）も確かめる。`*` や `:name` は使わず、完全なパスで書く。
   - Cloudflare の `_redirects` に書ける転送は 2,000 行まで。データの入れ直しで何百もの URL が変わるときは、転送を足す前に URL の決め方を見直す。
   - 確かめ方: `make build` のあと、`site` で `npx wrangler dev` を動かし（[deploy.md](deploy.md) の5章と同じく `node:24-slim` で）、古い URL が 301 と新しい URL の `Location` を返すか。2026-10-12 に wrangler 4.149.0 で、転送が効くことと `_redirects` そのものは配られないことを確かめた。
