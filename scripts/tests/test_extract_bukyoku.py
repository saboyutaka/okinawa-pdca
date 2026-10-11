"""部局票の予算の金額の、桁の誤記の疑い（extract_bukyoku.py）。"""
import unittest

from extract_bukyoku import budget_key, confirm_suspects, suspect_kinds


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


if __name__ == "__main__":
    unittest.main()
