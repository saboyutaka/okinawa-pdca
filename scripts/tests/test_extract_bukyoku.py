"""部局票（extract_bukyoku.py）: 予算の金額の桁の誤記の疑い、ページをまたぐ予算の行・活動指標の表、年度別計画の分け方、
中身が別の年度の票の見分け方など。PDF の代わりに、表の行と文字の位置を作って確かめる。"""
import unittest
from types import SimpleNamespace

from extract_bukyoku import (budget_key, confirm_suspects, content_year, fill_continuation, finish, head_key, merge_right_only,
                             open_block, read_budget, read_continuation, read_plan, read_status, split_by_years, strip_page_no,
                             suspect_kinds, unradical, unradical_all)


def amounts(settled, estimate, initial):
    return {"settled": settled, "estimate": estimate, "initial": initial}


class SuspectKindsTest(unittest.TestCase):
    def test_suspect(self):
        """1つだけが他の50倍以上で10億円（1,000,000千円）以上なら疑う。"""
        self.assertEqual(suspect_kinds(amounts(2_000_000, 30_000, 30_000)), ["settled"])
        self.assertEqual(suspect_kinds(amounts(0, 2_000_000, 10_000)), ["estimate"])

    def test_not_suspect(self):
        # 10億円に届かない
        self.assertEqual(suspect_kinds(amounts(900_000, 1_000, 1_000)), [])
        # 50倍に届かない
        self.assertEqual(suspect_kinds(amounts(2_000_000, 50_000, 0)), [])

    def test_zero_is_not_compared(self):
        """事業の終了・開始の年は他の金額が0になるので、比べられる金額が無ければ判定しない。"""
        self.assertEqual(suspect_kinds(amounts(2_000_000, 0, None)), [])
        self.assertEqual(suspect_kinds(amounts(None, None, None)), [])


def record(year, name, row, name_next=""):
    return {"year": year, "budgets": [{"name": name, "name_next": name_next, "rows": [{"suspect": suspect_kinds(row), **row}]}]}


class ConfirmSuspectsTest(unittest.TestCase):
    def test_confirmed_by_other_report(self):
        """R7 の報告の R6 決算額を、R6 の報告の R6 決算見込額が裏付けるなら疑いを外す。"""
        r7 = record(2025, "Ａ事業", amounts(2_000_000, 30_000, 30_000))
        r6 = record(2024, "A事業", amounts(20_000, 1_900_000, 30_000))
        self.assertEqual(r7["budgets"][0]["rows"][0]["suspect"], ["settled"])
        confirm_suspects([r7, r6])
        row = r7["budgets"][0]["rows"][0]
        self.assertEqual(row["suspect"], [])
        self.assertEqual(row["suspect_cleared"], ["settled"])

    def test_not_confirmed(self):
        """他の年度の報告の金額が10倍より離れていれば、疑いのまま。"""
        r7 = record(2025, "A事業", amounts(2_000_000, 30_000, 30_000))
        r6 = record(2024, "A事業", amounts(20_000, 30_000, 30_000))
        confirm_suspects([r7, r6])
        self.assertEqual(r7["budgets"][0]["rows"][0]["suspect"], ["settled"])

    def test_same_report_does_not_confirm(self):
        """同じ報告の中の金額では裏付けにしない。"""
        r7 = record(2025, "A事業", amounts(2_000_000, 30_000, 30_000))
        confirm_suspects([r7])
        self.assertEqual(r7["budgets"][0]["rows"][0]["suspect"], ["settled"])

    def test_budget_key(self):
        self.assertEqual(budget_key("　Ａ事業 推進\n費"), "A事業推進費")
        self.assertEqual(budget_key(None), "")


def chars(text: str, x0: float, top: float, w: float = 10, h: float = 10) -> list[dict]:
    """1行の文字（pdfplumber の chars の形）。"""
    return [{"text": t, "x0": x0 + i * w, "x1": x0 + (i + 1) * w, "top": top, "bottom": top + h} for i, t in enumerate(text)]


def fake_table(rows, bboxes=None):
    """read_status・split_by_years が使う pdfplumber の表の代わり（行のセルは無し、行の位置だけ）。"""
    n = max(len(r) for r in rows)
    return SimpleNamespace(bbox=(0, 0, 800, 600),
                           rows=[SimpleNamespace(cells=[None] * n, bbox=(bboxes or {}).get(i, (0, 0, 800, 0))) for i in range(len(rows))])


class SmallFunctionsTest(unittest.TestCase):
    def test_strip_page_no(self):
        """表に重なったページ番号（「- 17 -」）を取り除く。値そのものは残す。"""
        self.assertEqual(strip_page_no("28.6%-17-"), "28.6%")
        self.assertEqual(strip_page_no("74.0%－83－"), "74.0%")
        self.assertEqual(strip_page_no("100.0%"), "100.0%")
        self.assertEqual(strip_page_no("-件"), "-件")
        self.assertEqual(strip_page_no("-17-"), "-17-")

    def test_content_year(self):
        """票の中身の年度は「令和X年度活動内容」と「RX年度 決算見込額」の見出しで決める（多い方）。"""
        self.assertEqual(content_year(["令和4年度活動内容", "R3年度\n決算額 R4年度\n決算見込額"]), 2022)
        self.assertEqual(content_year(["令和７年度活動内容", "令和7年度活動内容", "令和６年度活動内容"]), 2025)
        self.assertIsNone(content_year(["成果指標検証票"]))

    def test_unradical(self):
        """康熙部首（⾦ U+2FA6）は普通の漢字に直す。CJK部首補助で NFKC の対応が無い字はそのまま。"""
        self.assertEqual(unradical("⾦融⼀括"), "金融一括")
        self.assertEqual(unradical("⺠"), "⺠")
        self.assertEqual(unradical_all({"a": ["⼀"], "b": 1, "c": {"d": "⾦"}}), {"a": ["一"], "b": 1, "c": {"d": "金"}})

    def test_head_key(self):
        self.assertEqual(head_key("R6年度\n決算見込額"), "estimate")
        self.assertEqual(head_key("R5年度決算額"), "settled")
        self.assertEqual(head_key("当初予算額"), "initial")
        self.assertEqual(head_key("主な財源"), "source")
        self.assertIsNone(head_key("R7年度"))


class BudgetTest(unittest.TestCase):
    def test_right_only_by_header(self):
        """金額の行が無くても、当初予算額の見出しだけの表は右の表（翌年度）とみなす。"""
        rows = [["予算事業名", "A事業", None], ["R7年度", None, None], ["主な財源", "実施方法", "当初予算額"]]
        blk = read_budget(rows)[0]
        self.assertTrue(blk.get("right_only"))
        self.assertEqual(blk["rows"], [])

    def test_merge_right_only_by_position(self):
        """左右が別の表で、右の予算事業名の書き方が左と違っても、同じページの同じ高さなら組にする。"""
        left = {"name": "A活動費", "name_next": "", "rows": [], "page": 37, "_y": 544.0, "_x0": 36, "_cols": {"settled": (200, 260)}}
        right = {"name": "B推進事業費", "name_next": "", "rows": [], "page": 37, "_y": 544.2, "_x0": 461, "right_only": True,
                 "_cols": {"initial": (630, 690)}}
        budgets = [left]
        self.assertTrue(merge_right_only(budgets, right))
        self.assertEqual(left["name_next"], "B推進事業費")
        self.assertEqual(left["_cols"], {"settled": (200, 260), "initial": (630, 690)})
        self.assertEqual(left["_xr"], 461)
        # 高さも名前も違えば組にしない
        other = {**right, "_y": 300.0}
        self.assertFalse(merge_right_only([{**left, "name_next": "", "_cols": {}}], other))

    def continued(self):
        """前のページの終わりで、見出しまでで切れた予算事業と、次のページの頭（続きの行と、その下の活動内容の見出し）。"""
        blk = {"name": "A事業", "name_next": "A事業", "rows": [], "page": 34, "_y": 544.0, "_xr": 461,
               "_cols": {"source": (36, 116), "method": (116, 196), "settled": (196, 276), "estimate": (276, 356),
                         "source_next": (461, 541), "method_next": (541, 621), "initial": (621, 701)}}
        page = SimpleNamespace(height=633, chars=(
            chars("様式１（主な取組）", 31, 28) + chars("各省計上", 50, 74) + chars("直接実施", 130, 74) + chars("3,608", 220, 74, w=7)
            + chars("24,000", 300, 74, w=7) + chars("各省計上", 475, 74) + chars("直接実施", 555, 74) + chars("24,000", 640, 74, w=7)
            + chars("令和6年度活動内容", 34, 95)))
        return blk, page

    def test_read_continuation(self):
        """次のページの頭の文字を、前のページの見出しの列の位置で読む。"""
        blk, page = self.continued()
        got = read_continuation(page, blk)
        self.assertEqual(got, {"source": "各省計上", "method": "直接実施", "settled": "3,608", "estimate": "24,000",
                               "source_next": "各省計上", "method_next": "直接実施", "initial": "24,000"})
        fill_continuation(blk, got)
        row = blk["rows"][0]
        self.assertEqual((row["settled"], row["estimate"], row["initial"]), (3608.0, 24000.0, 24000.0))
        self.assertEqual(row["suspect"], [])

    def test_read_continuation_headers_on_next_page(self):
        """金額の見出し（決算額・当初予算額）も次のページに続いているときは、その位置も使う。"""
        blk, page = self.continued()
        blk["_cols"] = {"source": (36, 116), "method": (116, 196)}
        page.chars = (chars("様式１（主な取組）", 31, 28) + chars("決算額", 220, 50) + chars("決算見込額", 290, 50)
                      + chars("主な財源", 480, 50) + chars("実施方法", 560, 50) + chars("当初予算額", 630, 50) + page.chars[9:])
        got = read_continuation(page, blk)
        self.assertEqual((got["settled"], got["estimate"], got["source_next"], got["initial"]), ("3,608", "24,000", "各省計上", "24,000"))

    def test_fill_continuation_keeps_known(self):
        """前のページで読めた値は、続きの値がそれを含むときだけ置き換える（「一括交付金」→「一括交付金（ソフト）」）。"""
        blk = {"rows": [{"source": "", "method": "", "source_next": "一括交付金", "method_next": "直接実施",
                         "settled_raw": "", "estimate_raw": "14,289", "initial_raw": "15,085"}]}
        fill_continuation(blk, {"source": "一括交付金（ソフト）", "settled": "6,205", "estimate": "99", "source_next": "一括交付金（ソフト）"})
        row = blk["rows"][0]
        self.assertEqual((row["source"], row["settled_raw"], row["estimate_raw"], row["source_next"]),
                         ("一括交付金（ソフト）", "6,205", "14,289", "一括交付金（ソフト）"))

    def test_open_block(self):
        """ページの最後の予算事業の下に「令和X年度活動内容」が無ければ、金額の行は次のページに続く。"""
        blk, page = self.continued()
        cur = {"budgets": [blk]}
        last = SimpleNamespace(chars=chars("予算事業名", 50, 544))
        self.assertIs(open_block(last, cur, 34), blk)
        closed = SimpleNamespace(chars=chars("予算事業名", 50, 544) + chars("令和6年度活動内容", 34, 600))
        self.assertIsNone(open_block(closed, cur, 34))
        self.assertIsNone(open_block(last, cur, 35))


class PlanTest(unittest.TestCase):
    def test_split_by_years(self):
        """3年分の値が1つのセルに混ざって取れたときは、年度の見出しの位置で分ける。"""
        page = SimpleNamespace(chars=chars("R4", 640, 100) + chars("R5", 840, 100) + chars("R6", 1040, 100)
                               + chars("15種（新規6種、", 560, 130) + chars("15種（継続15種）", 760, 135) + chars("15種（継続15種）", 960, 135)
                               + chars("累計15種）", 560, 142))
        tb = fake_table([[None]] * 3, {0: (550, 98, 1150, 112), 2: (550, 128, 1150, 156)})
        self.assertEqual(split_by_years(page, tb, 0, 2, 3), ["15種（新規6種、累計15種）", "15種（継続15種）", "15種（継続15種）"])
        self.assertIsNone(split_by_years(page, tb, 0, 2, 2))

    def test_activity_starts_with_number(self):
        """取組の説明が「１ 県公用車を…」のように数字で始まっても、見出しの行とまちがえない。"""
        rows = [["１ 取組の概要（Plan）", None, None, None, None, None, None],
                [None, None, None, "R4", None, "R5", "R6"],
                ["１ 県公用車を率先して電動車に転換する。", None, "県", "電動車の普及促進", None, None, None],
                [None, None, None, "電動車導入率", None, None, None],
                [None, None, None, "15％", None, "20％", "32％"]]
        out = read_plan(rows)
        self.assertEqual(out["activity"], "１ 県公用車を率先して電動車に転換する。")
        self.assertEqual(out["plan"], [{"indicator": "電動車導入率", "values": ["15％", "20％", "32％"]}])


class StatusTest(unittest.TestCase):
    def cur(self):
        return {"activity_done": "", "activity_next": "", "indicator_name": "", "past": [], "achievement": "", "basis": "",
                "improvements": [], "check": [], "action": [], "budgets": [], "_indicators": []}

    def test_indicators_in_print_order(self):
        """活動指標の表が2つあれば両方を残し、代表は印字で最初の表。「実績値」の見出しの位置が違う形も読む。"""
        rows = [["活動指標名", "A件数", None, "R6年度", None, None],
                ["", "R4年度", "R5年度", "実績値(A)", "目標値(B)", "達成割合\nA/B"],
                ["実績値", "1回", "2回", "3回", "3回", "100.0%-5-"],
                ["活動指標名", "B件数", None, "R6年度", None, None],
                ["実績値", "R4年度", "R5年度", "実績値(A)", "目標値(B)", "達成割合\nA/B"],
                ["", "4件", "5件", "6件", "12件", "50.0%"]]
        cur = self.cur()
        read_status(None, fake_table(rows), rows, cur, None, [])
        rec = finish(cur)
        self.assertEqual((rec["indicator_name"], rec["achievement"]), ("A件数", "100.0%"))
        self.assertEqual(rec["past"], [{"year": "R4年度", "value": "1回"}, {"year": "R5年度", "value": "2回"}])
        self.assertEqual([i["name"] for i in rec["indicators"]], ["A件数", "B件数"])
        self.assertEqual(rec["indicators"][1]["past"], [{"year": "R4年度", "value": "4件"}, {"year": "R5年度", "value": "5件"}])
        self.assertEqual(rec["indicators"][1]["achievement"], "50.0%")
        # 表が1つなら indicators は付けない
        one = self.cur()
        read_status(None, fake_table(rows[:3]), rows[:3], one, None, [])
        self.assertNotIn("indicators", finish(one))

    def test_empty_activity_does_not_swallow_indicator(self):
        """活動内容の文章の欄が空でも、その次の「活動指標名」の行を飛ばさない。"""
        rows = [["令和4年度活動内容", None, "令和5年度活動計画"], ["", None, None],
                ["活動指標名", "会議数", None, None, None, None],
                ["", "R2年度", "R3年度", "実績値(A)", "目標値(B)", "達成割合\nA/B"],
                ["実績値", "1回", "1回", "1回", "1回", "100.0%"]]
        cur = self.cur()
        read_status(None, fake_table(rows), rows, cur, None, [])
        rec = finish(cur)
        self.assertEqual((rec["indicator_name"], rec["achievement"]), ("会議数", "100.0%"))

    def test_indicator_values_on_next_page(self):
        """活動指標の表の値の行が次のページの表の頭に続くとき。"""
        rows1 = [["活動指標名", "クラス数", None, "R6年度"], ["", "R4年度", "R5年度", "実績値(A)", "目標値(B)", "達成割合\n- 26 -\nA/B"]]
        rows2 = [["実績値", "―", "16クラス", "1", "18", "5.6%"]]
        cur = self.cur()
        # read_status は前の表を id(tb) で覚えるので、前のページの表は持ったままにする（read_file でも残っている）。
        # その場で捨てると、次の表が同じ番地に作られて同じ id になり、値の行を読んだ行として飛ばすことがある
        tb1, tb2 = fake_table(rows1), fake_table(rows2)
        state = read_status(None, tb1, rows1, cur, None, [])
        read_status(None, tb2, rows2, cur, state, [])
        rec = finish(cur)
        self.assertEqual(rec["past"], [{"year": "R4年度", "value": "―"}, {"year": "R5年度", "value": "16クラス"}])
        self.assertEqual(rec["achievement"], "5.6%")


if __name__ == "__main__":
    unittest.main()
