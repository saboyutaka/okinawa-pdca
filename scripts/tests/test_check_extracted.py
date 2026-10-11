"""成果指標の計画値・達成率を、概要版の式で計算し直す（check_extracted.py）。"""
import unittest

from check_extracted import expected_plans, expected_rate, plan_index, plan_matches, rate_matches


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


if __name__ == "__main__":
    unittest.main()
