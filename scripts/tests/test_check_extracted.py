"""成果指標の計画値・達成率を概要版の式で計算し直すことと、紛らわしい文字の検査（check_extracted.py）。"""
import json
import tempfile
import unittest
from pathlib import Path

from check_extracted import (
    check_chars, expected_plans, expected_rate, plan_index, plan_matches, rate_matches, record_label, suspicious_char,
    suspicious_in, walk_strings,
)


def seika(year, base, target, plan=None, actual=None, rate=None):
    return {"year": year, "base": base, "target": target, "plan": plan or [], "actual": actual, "rate": rate}


class PlanTest(unittest.TestCase):
    def test_plan_index(self):
        """前期は R4 から、中期は R7 から数える（サイトの planIndex と同じ）。"""
        self.assertEqual([plan_index(y) for y in range(2022, 2028)], [0, 1, 2, 0, 1, 2])

    def test_expected_plans_first_period(self):
        """前期（R4〜R6）: 基準値から目標値まで3年で等分。"""
        self.assertEqual(expected_plans(seika(2023, 10, 40)), [20, 30, 40])

    def test_expected_plans_mid_period(self):
        """中期（R7〜R9）: 6年で等分した後半の3年分。"""
        self.assertEqual(expected_plans(seika(2025, 0, 60)), [40, 50, 60])

    def test_expected_plans_unknown(self):
        self.assertIsNone(expected_plans(seika(2023, None, 40)))
        self.assertIsNone(expected_plans(seika(2023, 10, None)))

    def test_plan_matches(self):
        """報告書の計画値は1%（小さい値は0.051）までの差を丸めとみなす。"""
        self.assertTrue(plan_matches(seika(2023, 10, 40, plan=[20, 30.2, 40])))
        self.assertFalse(plan_matches(seika(2023, 10, 40, plan=[20, 31, 40])))
        self.assertIsNone(plan_matches(seika(2023, 10, 40)))
        self.assertIsNone(plan_matches(seika(2023, 10, 40, plan=[20, None, 40])))


class RateTest(unittest.TestCase):
    def test_expected_rate(self):
        """達成率 = (実績値 - 基準値) / (その年度の計画値 - 基準値) × 100。"""
        self.assertEqual(expected_rate(seika(2023, 10, 40, plan=[20, 30, 40], actual=25)), 75.0)
        self.assertEqual(expected_rate(seika(2025, 0, 60, plan=[40, 50, 60], actual=20)), 50.0)

    def test_expected_rate_unknown(self):
        self.assertIsNone(expected_rate(seika(2023, 10, 40, plan=[20, 10, 40], actual=25)))  # 計画値が基準値と同じ
        self.assertIsNone(expected_rate(seika(2023, 10, 40, plan=[20], actual=25)))  # その年度の計画値が無い
        self.assertIsNone(expected_rate(seika(2023, 10, 40, plan=[20, 30, 40])))

    def test_rate_matches(self):
        """0.15ポイントまでの差は丸めとみなす。"""
        s = seika(2023, 10, 40, plan=[20, 30, 40], actual=25)
        self.assertTrue(rate_matches({**s, "rate": 75.1}))
        self.assertFalse(rate_matches({**s, "rate": 75.2}))
        self.assertIsNone(rate_matches({**s, "rate": None}))


class SuspiciousCharTest(unittest.TestCase):
    def test_kinds(self):
        """康熙部首・CJK部首補助・私用領域・置換文字・制御文字を見分ける。"""
        self.assertEqual(suspicious_char("\u2f40"), "康熙部首")  # ⽀（「支」に見える）
        self.assertEqual(suspicious_char("\u2e9f"), "CJK部首補助")  # ⺟
        self.assertEqual(suspicious_char("\ue000"), "私用領域")
        self.assertEqual(suspicious_char("\ufffd"), "置換文字")
        self.assertEqual(suspicious_char("\x0c"), "制御文字")
        self.assertEqual(suspicious_char("\r"), "制御文字")

    def test_normal(self):
        """普通の漢字・かな・全角記号と、改行・タブは対象外。"""
        for ch in "支大沖縄（）①％\n\t ":
            self.assertIsNone(suspicious_char(ch), repr(ch))

    def test_suspicious_in(self):
        """同じ文字は1回だけ出す。「(cid:」も対象。"""
        self.assertEqual(suspicious_in("\u2f40援と\u2f40援"), ["U+2F40 \u2f40（康熙部首）"])
        self.assertEqual(suspicious_in("取組(cid:10)"), ["「(cid:」（読めなかった字の名残）"])
        self.assertEqual(suspicious_in("改行\nとタブ\tは良い"), [])

    def test_walk_strings(self):
        rec = {"name": "a", "lines": [{"target": "b"}], "budget": 10, "rows": [["c"]]}
        self.assertEqual(list(walk_strings(rec)), [("name", "a"), ("lines[0].target", "b"), ("rows[0][0]", "c")])

    def test_record_label(self):
        self.assertEqual(record_label({"year": 2022, "id": "3-11-c-1", "name": "若年者の就業・定着の促進", "no": None}),
                         "year=2022 id=3-11-c-1 若年者の就業・定着の促進")

    def test_check_chars(self):
        """data/extracted の下のすべての JSON を読み、ファイル・レコード・欄・文字を出す。"""
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "soukatsu").mkdir()
            rows = [{"year": 2022, "id": "1-1-a-1", "action": "就労\u2f40援"}, {"year": 2022, "id": "1-1-a-2", "action": "支援"}]
            (Path(d) / "soukatsu" / "shisaku.json").write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
            (Path(d) / "years.json").write_text(json.dumps({"note": "\ufffd"}), encoding="utf-8")
            self.assertEqual(check_chars(Path(d)), [
                ("soukatsu/shisaku.json", "[0] year=2022 id=1-1-a-1", "action", "U+2F40 \u2f40（康熙部首）"),
                ("years.json", "[0]", "note", "U+FFFD \ufffd（置換文字）"),
            ])


if __name__ == "__main__":
    unittest.main()
