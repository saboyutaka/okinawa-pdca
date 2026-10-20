#!/usr/bin/env python3
"""抽出データのうち「取れていないもの」と「誤りの疑いがあるもの」を一覧にして docs/issues.md に書き出す。

使い方:
  python3 scripts/report_issues.py            # make extract の最後でも実行される

data/extracted を読んで毎回作り直すので、docs/issues.md は手で編集しない。
原因を人が調べたものは、下の NOTES・KNOWN_GAPS・BUDGET_NOTES に確認日つきで書く（一覧の各行に表示される）。
data/raw に県のファイルが無い環境（台帳だけがある worktree や、PDF を移していない PC）では「取得できなかったファイル」の節を省く。標準ライブラリのみで動作。
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from check_extracted import EXPECTED, STATUSES, expected_plans, expected_rate, plan_index, plan_matches, rate_matches  # noqa: E402

JST = dt.timezone(dt.timedelta(hours=9))
AMOUNT_LABEL = {"settled": "前年度決算額", "estimate": "決算見込額", "initial": "翌年度当初予算額"}

# 部局票（予算）が無い理由のうち、部局・年度・施策の範囲で分かっているもの（2026-10-10 確認）。
# (部局, 年度（None はすべて）, 施策IDの先頭（"" はすべて）, 理由)
KNOWN_GAPS = [
    ("企業局", 2023, "2-8-b", "[県企業局のサイト](https://www.eb.pref.okinawa.jp/torikumi/115/137)は robots.txt で自動取得が禁止されているため手動でダウンロードしているが、R5 の r05_torikumi_2-8-i-1_02.pdf がまだ無い。"),
    ("病院事業局", None, "", "[病院事業局のページ](https://byoinjigyokyoku.pref.okinawa.jp/data/pdca/)の R6・R7 の検証票は、表の文字が1字ずつ別のセルに分かれていて読み取れていない。R4 はリンク切れ（HTTP 404）、R5 は公開ページに見当たらない。"),
    ("県警本部", 2024, "", "R6 の検証票の公開ページが[県警のサイト](https://www.police.pref.okinawa.jp/category/bunya/shokai/pdca/)に見当たらない（R4・R5・R7 はある）。"),
    ("文化観光スポーツ部", 2025, "3-2-c", "施策展開 3-(2)-ウ の公開ファイルに、18取組のうち4取組しか載っていない（県の公開ファイルそのもの）。"),
    # 県のページに前の年度の票が掲載されているもの（2026-10-11 確認）。中身の年度は予算の表の年度の見出しと「令和X年度活動内容」で
    # extract_bukyoku.py が見分けて取り込まない（bukyoku/files.json の content_year・note）
    ("企画部", 2023, "3-12-b", "R5 の企画部のページの「イ.世界最高水準を見据えた拠点空港等の整備」のリンク先が R4 の検証票（omonatorikumi17.pdf。R4 のページのファイルと同じ）で、R5 の票が無い。"),
    ("商工労働部", 2023, "3-11-d", "R5 の商工労働部のページの「エ 女性が活躍できる環境づくり」のリンク先が R4 の検証票（r4_torikumi3-11e.pdf。R4 のページのファイルと同じ）で、R5 の票が無い。"),
    ("商工労働部", 2024, "3-11-d", "R6 の商工労働部のページの「エ 女性が活躍できる環境づくり」のリンク先が R5 の検証票（r5_omonatorikumi3-11-e.pdf）で、R6 の票が無い。"),
    ("商工労働部", 2024, "4-3-a", "R6 の商工労働部のページの「ア 多様な分野における国際協力・貢献活動の推進」のリンク先が R5 の検証票（r5_omonatorikumi4-3-a.pdf。R5 のページのファイルと同じ）で、R6 の票が無い。"),
    ("商工労働部", 2025, "5-4-a", "R7 の商工労働部のページの「ア 多様な職業能力の育成・開発」のリンク先が R4 の検証票（r4_torikumi5-4a.pdf。R4 のページのファイルと同じ）で、R7 の票が無い。"),
]
# 取得できなかったファイルの理由（取得元, 年度（None はすべて））
FILE_REASONS = {
    ("kigyo", None): "県企業局のサイトの robots.txt が自動取得を禁止している。手動でダウンロードして scripts/import_manual.py で取り込む（このファイルはまだ）。",
    ("byoin", 2022): "リンク切れ（HTTP 404）。",
}


def gap_reason(t: dict) -> str | None:
    for dept, year, prefix, why in KNOWN_GAPS:
        if t["dept"] == dept and year in (None, t["year"]) and t["shisaku_id"].startswith(prefix):
            return why
    return None


# 個別に調べた結果（2026-10-10、部局票 PDF の全文から取組名を検索）。キーは (年度, 施策ID, 取組名の先頭)
NOTES = {
    (2022, "2-3-e-6", "動物適正飼養"): "環境部の成果指標検証票にだけ名前があり、主な取組検証票に無い。",
    (2022, "2-7-a-3", "海底ケーブル"): "どの部局票にも名前が無い。",
    (2022, "2-7-a-3", "県内産出エネルギー"): "商工労働部の成果指標検証票にだけ名前がある。",
    (2022, "4-3-a-4", "衛生環境研究所"): "保健医療部の成果指標検証票にだけ名前がある。",
    (2023, "1-1-b-1", "食品リサイクル法"): "環境部の成果指標検証票にだけ名前がある（所管は農林水産部）。",
    (2023, "5-4-a-1", "県立職業能力開発校運営費"): "部局票には「県立職業能力開発校運営費（在職者訓練の実施）」（5-(4)-ア-③）と「県立職業能力開発校整備事業」（①）だけがあり、①の「県立職業能力開発校運営費」が無い。",
    (2025, "3-4-c-2", "展示会"): "文化観光スポーツ部の R7 の部局票に施策展開 3-(4)-ウ のファイルが無い（同じ施策展開の商工労働部のファイルには、この取組が無い）。",
    (2023, "2-9-b-1", ""): "知事公室の「イ 残された戦後処理問題の解決」のリンク先が「ア 米軍基地から派生する諸問題の解決に向けた対応」と同じファイル（県の掲載ミスとみられる。下の「同じファイルが別の名前でリンクされている」）。",
}


# 予算の金額で、人が出典（部局票の印字）を画像で確かめたもの（2026-10-11）。データは印字どおりのまま、B1・B2 の節に記録だけする。
# (節, 報告年度, 施策ID, 予算事業名, 出典の部局票, ページ, 内容)
BUDGET_NOTES = [
    ("B1", 2025, "3-7-f-4", "地すべり対策事業費", "norin/2025-r07/r737ka.pdf", 42,
     "決算見込額 8,731,000千円・翌年度当初予算額 29,229,000千円と印字されている（総括報告書の決算見込額も 8,731,000）。"
     "R4〜R6 の報告の同じ予算事業の金額は 24,000〜145,365千円で、円の単位で書いた（千円の桁の誤記）疑いが強い。"
     "同じ行の2つの金額がどちらも大きく、前年度決算額が0なので B1 の判定に掛からず、合計に約87億円（R7決算見込）・約292億円（R8当初）が入っている。"),
    ("B2", 2022, "2-7-b-1", "公営住宅整備事業", "doboku/2022-r04/r4-2-7-i.pdf", 2,
     "施策 2-(5)-ウ-④ の同じ予算事業（doboku/2022-r04/r4-2-5-u.pdf p.2）と金額が同じ（前年度決算額 5,269,117・決算見込額 5,491,033・"
     "翌年度当初予算額 8,851,676千円）なのに、財源が「各省計上」ではなく「一括交付金（ハード）」と印字されている。"
     "合計では予算事業名・財源・金額が同じものを1回だけ数えるので、財源の書き方が違うこの分は2回数えられている（R4 の報告の3つの金額とも）。"),
]


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def rlabel(year: int) -> str:
    return f"R{year - 2018}"


def md(s) -> str:
    """表のセルに入れる文字列（| と改行を逃がす）。"""
    return str(s if s is not None else "").replace("|", "｜").replace("\n", " ")


class Report:
    def __init__(self, root: Path):
        ex = root / "data" / "extracted"
        self.raw = root / "data" / "raw"
        s = ex / "soukatsu"
        self.shisaku = load(s / "shisaku.json")
        self.torikumi = load(s / "torikumi.json")
        self.seika = load(s / "seika.json")
        self.kihon = load(s / "kihon.json")
        self.sources = {x["id"]: x for x in load(s / "sources.json")}
        b = ex / "bukyoku"
        budget = load(b / "torikumi.json") if (b / "torikumi.json").exists() else []
        # 同じ取組が複数の部局のファイルに載っているときは最初の1件だけ使う（サイトの data.ts と同じ）
        seen = set()
        self.budget = []
        for r in budget:
            k = (r["year"], r["shisaku_id"], r["key"])
            if k not in seen:
                seen.add(k)
                self.budget.append(r)
        self.files = {x["id"]: x for x in load(b / "files.json")} if (b / "files.json").exists() else {}
        self.shisaku_name = {(x["year"], x["id"]): f"{x['code']} {x['name']}" for x in self.shisaku}
        self.out: list[str] = []
        self.summary: list[tuple[str, str, Counter, str]] = []

    # ------------------------------------------------------------ 出力の部品

    def link(self, source: str, page: int | None) -> str:
        src = self.sources.get(source) or self.files.get(source)
        if not src or not src.get("file_url"):
            return md(source)
        text = (src.get("link_text") or source).split("（")[0].strip() or source
        if src.get("zip_member"):
            return f"[{md(text)}（zip内 {md(src['zip_member'])} p.{page}）]({src['file_url']})"
        return f"[{md(text)} p.{page}]({src['file_url']}#page={page})"

    def h(self, level: int, text: str):
        self.out += ["", "#" * level + " " + text, ""]

    def p(self, text: str):
        self.out += [text, ""]

    def table(self, header: list[str], rows: list[list], fold_over: int = 12):
        if not rows:
            self.p("（該当なし）")
            return
        lines = ["| " + " | ".join(header) + " |", "|" + "---|" * len(header)]
        lines += ["| " + " | ".join(md(c) for c in r) + " |" for r in rows]
        if len(rows) > fold_over:
            self.out += [f"<details><summary>{len(rows)}件を表示</summary>", "", *lines, "", "</details>", ""]
        else:
            self.out += lines + [""]

    def count(self, cid: str, title: str, years: Counter, handling: str):
        self.summary.append((cid, title, years, handling))

    # ------------------------------------------------------------ 取れていないデータ

    def budget_gaps(self):
        self.h(3, "A1. 部局の検証票（予算）が無い取組")
        self.p("総括報告書にある取組のうち、部局別の「主な取組」検証票から予算の記載を読めなかったもの。"
               "「予算と財源」ページの合計には入らない（施策ページでは総括報告書の決算見込額を表示する）。")
        exact = {(b["year"], b["shisaku_id"], b["key"]) for b in self.budget}
        by_name = Counter((b["year"], b["key"]) for b in self.budget)
        rows, renamed = [], []
        years = Counter()
        for t in self.torikumi:
            if (t["year"], t["shisaku_id"], t["key"]) in exact:
                continue
            if by_name[(t["year"], t["key"])] == 1:
                renamed.append(t)
                continue
            years[t["year"]] += 1
            reason = gap_reason(t)
            if not reason:
                reason = next((v for (y, sid, head), v in NOTES.items()
                               if y == t["year"] and sid == t["shisaku_id"] and t["name"].startswith(head)),
                              "部局の主な取組検証票から見つからない（原因未調査）。")
            rows.append([rlabel(t["year"]), t["dept"], self.shisaku_name.get((t["year"], t["shisaku_id"]), t["shisaku_id"]),
                         t["name"], reason])
        self.count("A1", "部局の検証票（予算）が無い取組", years, "予算の合計に入らない")
        reasons = Counter((r[1], r[4]) for r in rows)
        self.table(["部局", "件数", "理由"], [[d, n, why] for (d, why), n in reasons.most_common()], fold_over=99)
        self.table(["報告", "所管部", "施策", "取組", "理由"], rows)

        self.h(3, "A2. 部局の検証票では別の施策に載っている取組（名前で結び付けたもの）")
        self.p("総括報告書では別の施策にも再掲されている取組が、部局票では元の施策にしか載っていないもの。"
               "同じ年度に同じ名前の取組が部局票に1件だけなので、名前で結び付けて予算を表示している。")
        rec_by_name = {(b["year"], b["key"]): b for b in self.budget}
        self.count("A2", "部局票では別の施策に載っている取組（名前で補完）", Counter(t["year"] for t in renamed), "名前で結び付けて表示")
        self.table(["報告", "総括報告書の施策", "取組", "部局票での施策"],
                   [[rlabel(t["year"]), self.shisaku_name.get((t["year"], t["shisaku_id"])), t["name"],
                     self.shisaku_name.get((t["year"], rec_by_name[(t["year"], t["key"])]["shisaku_id"]),
                                           rec_by_name[(t["year"], t["key"])]["shisaku_id"])] for t in renamed])

    def file_gaps(self):
        manifest_path = self.raw / "manifest.jsonl"
        if not manifest_path.exists():
            return
        manifest = [json.loads(line) for line in manifest_path.read_text(encoding="utf-8").splitlines() if line.strip()]
        recent = [r for r in manifest if (r.get("fiscal_year") or 0) >= 2022]
        # 台帳は git に入っているので、ファイルが1つも無ければ、取れていないのではなく PDF の無い環境とみなして A3 を省く
        if any((self.raw / r["local_path"]).exists() for r in recent):
            self.h(3, "A3. 取得できなかったファイル")
            self.p("取得台帳（data/raw/manifest.jsonl）に載っているのに、手元にファイルが無いもの。")
            # 県サイトは .jp と .lg.jp の両方で同じファイルを配っていて、台帳に別名ホストの記録が残っていることがある。
            # 同じファイルを取得済みなら欠けではない
            canon = lambda u: u.replace("://pref.okinawa", "://www.pref.okinawa").replace("pref.okinawa.lg.jp", "pref.okinawa.jp")
            have = {canon(r["file_url"]) for r in recent if (self.raw / r["local_path"]).exists()}
            missing = [r for r in recent if not (self.raw / r["local_path"]).exists() and canon(r["file_url"]) not in have]
            self.count("A3", "取得できなかったファイル", Counter(r["fiscal_year"] for r in missing), "—")
            self.table(["報告", "取得元", "リンク文言", "理由"],
                       [[rlabel(r["fiscal_year"]), r["source"], r["referrers"][0]["link_text"],
                         FILE_REASONS.get((r["source"], r["fiscal_year"])) or FILE_REASONS.get((r["source"], None), "未調査")]
                        for r in missing])
            self.p("このほか、県警本部の R6 の検証票と、病院事業局の R5 の検証票は公開ページ自体が見当たらない（台帳に載っていない）。")

        self.h(3, "A4. 同じファイルが別の名前でリンクされている")
        self.p("県のページで、リンク文言が違うのに中身（SHA-256）が同じファイル。どちらかが掲載ミスで、本来のファイルが手に入らない。")
        groups = defaultdict(list)
        for r in recent:
            if r.get("sha256"):
                groups[(r["fiscal_year"], r["sha256"])].append(r)
        dup = [g for g in groups.values() if len({x["referrers"][0]["link_text"] for x in g}) > 1]
        self.count("A4", "同じファイルが別の名前でリンクされている", Counter(g[0]["fiscal_year"] for g in dup), "その取組の部局票が無い（A1）")
        self.table(["報告", "取得元", "リンク文言（同じ中身）"],
                   [[rlabel(g[0]["fiscal_year"]), g[0]["source"], " ／ ".join(x["referrers"][0]["link_text"] for x in g)] for g in dup])

    def blank_fields(self):
        self.h(3, "A5. 主な取組の進捗状況が空欄・「-」")
        self.p("総括報告書の進捗状況の欄が空欄か「-」のもの。サイトでは「記載なし」と表示する。県の集計（概要版）では「順調」「未着手」などに数えられている。")
        rows = [t for t in self.torikumi if not t["status"]]
        self.count("A5", "主な取組の進捗状況が空欄・「-」", Counter(t["year"] for t in rows), "「記載なし」と表示")
        self.table(["報告", "施策", "取組", "欄の表記", "目標", "実績", "出典"],
                   [[rlabel(t["year"]), self.shisaku_name.get((t["year"], t["shisaku_id"])), t["name"], t["status_raw"] or "（空欄）",
                     t["target"], t["actual"], self.link(t["source"], t["page"])] for t in rows])

        self.h(3, "A6. 成果指標の達成率が数値でない")
        self.p("達成率の欄が「-%」など数値でも「達成」「未達成」でもないもの。統計がまだ出ていない指標など。サイトでは「達成率なし」。")
        rows = [s for s in self.seika if s["rate"] is None and s["rate_raw"] not in ("達成", "未達成")]
        self.count("A6", "成果指標の達成率が数値でない", Counter(s["year"] for s in rows), "「達成率なし」と表示")
        self.table(["報告", "施策", "成果指標", "達成率の欄", "実績値", "出典"],
                   [[rlabel(s["year"]), self.shisaku_name.get((s["year"], s["shisaku_id"])), s["name"], s["rate_raw"] or "（空欄）",
                     s["actual_raw"] or "（空欄）", self.link(s["source"], s["page"])] for s in rows])

        self.h(3, "A7. 基本施策の「目指す姿」を読み取れなかった年度")
        rows = [k for k in self.kihon if not k.get("mezasu")]
        self.count("A7", "基本施策の「目指す姿」を読み取れない", Counter(k["year"] for k in rows), "他の年度の記載で補う")
        self.p("サイトでは他の年度の記載で補っている（基本計画で固定の文章）。")
        self.table(["報告", "基本施策", "出典"], [[rlabel(k["year"]), f"{k['code']} {k['name']}", self.link(k["source"], k["page"])] for k in rows])

        self.h(3, "A8. 施策の推進状況（A〜G）が無い")
        rows = [s for s in self.shisaku if not s.get("judge")]
        self.count("A8", "施策の推進状況（A〜G）が無い", Counter(s["year"] for s in rows), "「判定なし」「未公表」と表示")
        self.p(f"R4 は施策ごとの判定が公表されていない（施策総括表が無い）ため全{sum(1 for s in rows if s['year'] == 2022)}施策が該当。"
               f"R5 以降で該当するのは {sum(1 for s in rows if s['year'] > 2022)} 施策。")

        self.h(3, "A9. 部局票の欄が空、または読み取れなかった取組")
        self.p("部局の主な取組検証票（様式1）から取組のページに出している欄のうち、空になっているもの。"
               "取組のページでは欄ごと出さない。元の票でも空欄のものと、表の形が崩れていて読めなかったものが混ざっている。"
               "金額の行が無い予算事業は「予算と財源」の合計に入らない。")
        fields = {"activity_done": "活動内容", "basis": "判定の根拠", "improvements": "改善案の反映状況", "check": "検証（Check）", "action": "改善案（Action）"}
        rows, years = [], Counter()
        for b in self.budget:
            miss = [label for k, label in fields.items() if not b.get(k)]
            miss += [f"予算事業「{blk['name']}」の金額" for blk in b["budgets"] if not blk["rows"]]
            if miss:
                years[b["year"]] += 1
                rows.append([rlabel(b["year"]), b["section"] or b["dept_source"], self.shisaku_name.get((b["year"], b["shisaku_id"]), b["shisaku_id"]),
                             b["name"], "、".join(dict.fromkeys(miss)), self.link(b["source"], b.get("do_page") or b["page"])])
        self.count("A9", "部局票の欄が空・読み取れない", years, "その欄を出さない")
        self.table(["報告", "担当", "施策", "取組", "空の欄", "出典"], rows)
        nxt = Counter(b["year"] for b in self.budget if not b.get("activity_next"))
        self.p("このほか、翌年度の「活動計画」が空の取組が " + "、".join(f"{rlabel(y)} {n}件" for y, n in sorted(nxt.items()))
               + " ある。多くは事業が終わった取組（活動内容の欄に「事業終了」などとある）で、元の票でも空欄。")

    # ------------------------------------------------------------ 誤りの疑い

    def budget_suspects(self):
        self.h(3, "B1. 予算の金額の桁の誤記の疑い")
        self.p("部局票の同じ行の3つの金額（前年度決算額・決算見込額・翌年度当初予算額）のうち1つが、0でない他の金額の50倍以上かつ10億円以上で、"
               "他の年度の報告にある同じ予算事業・同じ年度の金額でも裏付けられない（10倍以内の値が無い）もの。「予算と財源」の合計から除いている。")
        cleared = [(b, blk, r, k) for b in self.budget for blk in b["budgets"] for r in blk["rows"] for k in r.get("suspect_cleared", [])]
        if cleared:
            self.p("次の金額は、同じ行の他の金額と大きく違うが、他の年度の報告で裏付けられたので合計に入れている: "
                   + "、".join(f"{rlabel(b['year'])} {blk['name']}（{AMOUNT_LABEL[k]} {r[k + '_raw']}千円）" for b, blk, r, k in cleared) + "。")
        rows = []
        for b in self.budget:
            for blk in b["budgets"]:
                for r in blk["rows"]:
                    for k in r.get("suspect", []):
                        others = "、".join(f"{AMOUNT_LABEL[x]} {r[x + '_raw']}" for x in AMOUNT_LABEL if x != k and r[x] is not None)
                        rows.append([rlabel(b["year"]), blk["name"], b["name"], AMOUNT_LABEL[k], f"{r[k + '_raw']}千円", others,
                                     self.link(b["source"], blk.get("page") or b["page"])])
        self.count("B1", "予算の金額の桁の誤記の疑い", Counter(int(r[0][1:]) + 2018 for r in rows), "合計から除外")
        self.table(["報告", "予算事業", "取組", "種類", "記載の金額", "同じ行の他の金額", "出典"], rows)
        self.budget_notes("B1", "このほか、上の判定には掛からないが、出典を確かめて誤記の疑いがあるもの（データは印字どおりで、合計に入っている）:")

        self.h(3, "B2. 同じ予算事業・財源なのに、取組ごとに金額がわずかに違う")
        self.p("同じ報告・同じ予算事業名・同じ財源で、取組によって金額が1%未満だけ違うもの（例: 7,978 と 7,987）。転記の誤りの疑いがある。"
               "サイトの合計では、同じ金額とみなして1回だけ数えている（docs/data.md の 9.3）。")
        groups = defaultdict(lambda: defaultdict(set))
        where = defaultdict(list)
        for b in self.budget:
            for blk in b["budgets"]:
                name = "".join(blk["name"].split())
                if name in ("", "ー", "―", "-", "－"):
                    continue
                for r in blk["rows"]:
                    for k in AMOUNT_LABEL:
                        if r[k]:
                            groups[(b["year"], name, "".join(r["source"].split()))][k].add(r[k])
                            where[(b["year"], name, "".join(r["source"].split()), k, r[k])].append({**b, "page": blk.get("page") or b["page"]})
        rows = []
        for (year, name, source), kinds in groups.items():
            for k, vals in kinds.items():
                vs = sorted(vals)
                for a, c in zip(vs, vs[1:]):
                    if c - a <= c * 0.01:
                        refs = where[(year, name, source, k, a)][:1] + where[(year, name, source, k, c)][:1]
                        rows.append([rlabel(year), name, source, AMOUNT_LABEL[k], f"{a:,.0f} / {c:,.0f}千円",
                                     " ／ ".join(self.link(x["source"], x["page"]) for x in refs)])
        self.count("B2", "同じ予算事業で金額がわずかに違う", Counter(int(r[0][1:]) + 2018 for r in rows), "1回だけ数える")
        self.table(["報告", "予算事業", "財源", "種類", "金額", "出典"], rows)
        self.budget_notes("B2", "このほか、同じ予算事業・同じ金額なのに財源の書き方が違うもの（データは印字どおりで、合計では別々に足している）:")

    def budget_notes(self, section: str, lead: str):
        """BUDGET_NOTES のうちその節のもの（人が出典を確かめた記録）。"""
        rows = [[rlabel(y), name, self.shisaku_name.get((y, sid), sid), text, self.link(src, page)]
                for sec, y, sid, name, src, page, text in BUDGET_NOTES if sec == section]
        if rows:
            self.p(lead)
            self.table(["報告", "予算事業", "施策", "内容", "出典"], rows)

    def formula_mismatches(self):
        self.h(3, "B3. 成果指標の達成率が、概要版の式と合わない")
        self.p("達成率 =（実績値 − 基準値）/（その年度の計画値 − 基準値）× 100 で計算し直した値と、報告書の値が 0.15 ポイントより大きく違うもの。"
               "サイトは報告書の値をそのまま表示する。R5 は実績値 ÷ 目標値で計算したと見られるもの（例: さとうきび生産量）などがまとまって出る。")
        rows = [s for s in self.seika if rate_matches(s) is False]
        self.count("B3", "成果指標の達成率が式と合わない", Counter(s["year"] for s in rows), "報告書の値のまま")
        self.table(["報告", "施策", "成果指標", "基準値", "実績値", "計画値", "報告書の達成率", "式での値", "出典"],
                   [[rlabel(s["year"]), self.shisaku_name.get((s["year"], s["shisaku_id"])), s["name"], s["base_raw"], s["actual_raw"],
                     s["plan_raw"][plan_index(s["year"])] if s["plan_raw"] else "",
                     s["rate_raw"], f"{expected_rate(s):.1f}%", self.link(s["source"], s["page"])] for s in rows])

        self.h(3, "B4. 計画値が、概要版の式と合わない")
        self.p("計画値 = 目標値 −（目標値 − 基準値）× 残年数 / N（R4〜R6: N=3、R7〜: N=6）で計算し直した値と、報告書の計画値が合わないもの。"
               "段階的な目標や累計の指標など、式どおりにしていないものも含むので誤りとは限らない。サイトは報告書の値を使う。")
        rows = [s for s in self.seika if plan_matches(s) is False]
        self.count("B4", "計画値が式と合わない", Counter(s["year"] for s in rows), "報告書の値のまま")
        self.table(["報告", "施策", "成果指標", "基準値", "目標値", "報告書の計画値（3年分）", "式での計画値", "出典"],
                   [[rlabel(s["year"]), self.shisaku_name.get((s["year"], s["shisaku_id"])), s["name"], s["base_raw"], s["target_raw"],
                     " / ".join(s["plan_raw"]), " / ".join(f"{x:,.1f}" for x in expected_plans(s)), self.link(s["source"], s["page"])]
                    for s in rows])

    def aggregate_diffs(self):
        self.h(3, "B5. 概要版の集計と、施策ごとの記載が合わない")
        self.p("件数（施策・取組・成果指標・基本施策）は4年度とも概要版と一致する。内訳が合わないのは次のとおり（scripts/check_extracted.py）。")
        rows = []
        for year, exp in EXPECTED.items():
            st = Counter(t["status_raw"] for t in self.torikumi if t["year"] == year)
            got = tuple(st[s] for s in STATUSES)
            if got != exp["status"]:
                rows.append([rlabel(year), "主な取組の進捗の内訳", " / ".join(map(str, got)), " / ".join(map(str, exp["status"])),
                             "進捗状況が空欄・「-」の取組（A5）を、県は「順調」「未着手」などに数えている"])
            if "judge" in exp:
                j = Counter(s["judge"] or "なし" for s in self.shisaku if s["year"] == year)
                diff = {k: (j.get(k, 0), v) for k, v in exp["judge"].items() if j.get(k, 0) != v}
                if diff:
                    rows.append([rlabel(year), "施策の推進状況（A〜G）", "、".join(f"{k}:{a}" for k, (a, _) in diff.items()),
                                 "、".join(f"{k}:{b}" for k, (_, b) in diff.items()),
                                 "施策総括表の印字は、どの施策も区分表どおり（取組の内訳と成果指標の達成率の平均から計算した判定と一致する。サイトの test/integrity.test.ts）。"
                                 "概要版の件数は、成果指標が2つ以上ある施策の達成率を100%で頭打ちにしてから平均し、一部の施策を「その他」に回して数えたものとみられる"
                                 "（R7 はそう計算すると「その他」の3件の分を除いて一致する。docs/data.md 6.3）"])
        self.table(["報告", "項目", "このデータ（順調/概ね/やや/大幅/未着手）", "概要版", "理由"], rows, fold_over=99)

    # ------------------------------------------------------------ 全体

    def build(self) -> str:
        self.budget_gaps()
        self.file_gaps()
        self.blank_fields()
        body_a = self.out
        self.out = []
        self.budget_suspects()
        self.formula_mismatches()
        self.aggregate_diffs()
        body_b = self.out

        years = list(EXPECTED)
        head = [
            "# データの欠け・誤りの一覧",
            "",
            f"`python3 scripts/report_issues.py` で data/extracted から自動で作っている（{dt.datetime.now(JST):%Y-%m-%d} 作成）。手で編集しない。"
            "原因を人が調べたものは scripts/report_issues.py の NOTES・KNOWN_GAPS・BUDGET_NOTES に書く。作り方の全体は [data.md](data.md)。",
            "",
            "元の報告書: [沖縄県PDCA実施結果（年度別）](https://www.pref.okinawa.jp/kensei/shisaku/1014252/1014253/index.html)（総括報告書）、"
            "[沖縄県PDCA](https://www.pref.okinawa.jp/kensei/shisaku/1014252/index.html)の各部局のページ（主な取組検証票・成果指標検証票）。",
            "",
            "- **A. 取れていないデータ**: 元のファイルが手に入らない、読み取れていない、報告書の欄が空欄のもの。",
            "- **B. 誤りの疑いがあるデータ**: 報告書の値が、同じ報告の他の箇所や、概要版に書かれた計算式と合わないもの。県の報告書の誤記か、"
            "このプロジェクトの読み取りの誤りかは個別に確認が要る。どちらも元の報告書（各行の出典）で確かめること。",
            "",
            "## 件数",
            "",
            "| | 内容 | " + " | ".join(rlabel(y) for y in years) + " | サイトでの扱い |",
            "|---|---|" + "---|" * len(years) + "---|",
        ]
        for cid, title, cnt, handling in self.summary:
            head.append(f"| {cid} | {title} | " + " | ".join(str(cnt.get(y, 0)) for y in years) + f" | {handling} |")
        fixed = [
            "",
            "## C. 読み取りで補正したもの",
            "",
            "抽出スクリプトで補正しているので、データには反映済み。",
            "",
            "| 内容 | 補正 |",
            "|---|---|",
            "| R5 の施策 3-(9)-ア-① で、「施策の方向」の続きが「関係部等」の欄に食い込んで読める | 句点までを施策の方向に戻す（extract_soukatsu.py） |",
            "| R4 の基本施策総括のページが回転していて、表として読むと文字が逆順になる | PyMuPDF のテキストから読む（extract_soukatsu.py） |",
            "| R5〜R7 の 5-(5)-イ-① の成果指標の基準値が、列の幅が足りず「########」と印字されている | 文化観光スポーツ部の「成果指標」検証票の値で補う（extract_soukatsu.py の BASE_FIXES） |",
            "| 部局票の見出しの表で、見出しと値が別の行に入るファイルがある | 値の形（施策コード、①で始まる施策名）で探す（extract_bukyoku.py） |",
            "| R5 は組織再編の年で、12取組が2つの部局のファイルに載っている | 最初の1件だけ使う（サイトの data.ts） |",
            "| 同じ施策の同じ年度に、内訳の名前が無く同じ名前で載っている成果指標がある（R7 の新規学卒者の就職内定率、R4〜R6 の大型eスポーツイベント参加者数など4組） | 内訳の名前で載っているほかの報告書（基準値・目標値が同じもの）の名前で出し、その名前の年度とまとめる（サイトの data.ts の SEIKA_ALIASES。ページの画像で確かめた） |",
            "",
        ]
        return "\n".join(head + ["", "## A. 取れていないデータ"] + body_a + ["## B. 誤りの疑いがあるデータ"] + body_b + fixed)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=".")
    ap.add_argument("--out", default="docs/issues.md")
    args = ap.parse_args()
    text = Report(Path(args.root)).build()
    Path(args.out).write_text(text, encoding="utf-8")
    print(f"{args.out} を書き出しました", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
