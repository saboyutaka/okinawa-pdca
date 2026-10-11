"""県サイトの取得で使う、年度の判定と URL の正規化（fetch_pdca.py）。"""
import unittest

from fetch_pdca import clean_url, fy_label, infer_fy, is_attachment, is_page


class InferFyTest(unittest.TestCase):
    def test_target_year(self):
        self.assertEqual(infer_fy("沖縄県PDCA実施結果（対象年度：令和7年度）"), 2025)
        self.assertEqual(infer_fy("対象年度：令和７年度"), 2025)

    def test_target_year_first(self):
        """公表の年度より「対象年度」を先に見る。"""
        self.assertEqual(infer_fy("令和8年度公表（対象年度：令和7年度）"), 2025)

    def test_eras(self):
        self.assertEqual(infer_fy("令和元年度"), 2019)
        self.assertEqual(infer_fy("平成30年度"), 2018)
        self.assertEqual(infer_fy("2024年度 報告"), 2024)
        self.assertIsNone(infer_fy("年度の無い文字"))

    def test_era_omitted(self):
        """「対象年度：30年度」のように元号が無ければ、20以上は平成・それより小さければ令和。"""
        self.assertEqual(infer_fy("対象年度：30年度"), 2018)
        self.assertEqual(infer_fy("対象年度：5年度"), 2023)

    def test_fy_label(self):
        """data/raw のフォルダ名。"""
        self.assertEqual(fy_label(2025), "2025-r07")
        self.assertEqual(fy_label(2019), "2019-r01")
        self.assertEqual(fy_label(2018), "2018-h30")
        self.assertEqual(fy_label(None), "_unknown")


class UrlTest(unittest.TestCase):
    def test_clean_url(self):
        """別名のホストを正規のホスト（https）に寄せ、クエリとフラグメントを落とす。"""
        want = "https://www.pref.okinawa.jp/kensei/a.html"
        for url in (
            "http://www.pref.okinawa.lg.jp/kensei/a.html",
            "https://pref.okinawa.jp/kensei/a.html?x=1#top",
            "http://WWW.PREF.OKINAWA.JP/kensei/a.html",
        ):
            self.assertEqual(clean_url(url), want, url)
        self.assertEqual(clean_url("http://example.jp/a?b=1"), "http://example.jp/a")

    def test_kinds(self):
        self.assertTrue(is_attachment("https://www.pref.okinawa.jp/a/b.PDF?x=1"))
        self.assertTrue(is_attachment("https://www.pref.okinawa.jp/a/b.zip"))
        self.assertFalse(is_attachment("https://www.pref.okinawa.jp/a/b.html"))
        self.assertTrue(is_page("https://www.pref.okinawa.jp/a/"))
        self.assertTrue(is_page("https://www.pref.okinawa.jp/a/b.html"))
        self.assertFalse(is_page("https://www.pref.okinawa.jp/a/b.pdf"))


if __name__ == "__main__":
    unittest.main()
