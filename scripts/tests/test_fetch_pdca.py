"""県サイトの取得で使う、年度の判定と URL の正規化・保存先の名前・リダイレクト（fetch_pdca.py）。"""
import unittest
import urllib.error
import urllib.request

from fetch_pdca import PrefRedirect, clean_url, file_name, fy_label, infer_fy, is_attachment, is_page, is_pref_host


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


class SafetyTest(unittest.TestCase):
    def test_file_name(self):
        """保存するファイル名は URL の最後の部分（%xx は戻す）。"""
        self.assertEqual(file_name("https://www.pref.okinawa.jp/a/%E7%B7%8F%E6%8B%AC.pdf"), "総括.pdf")
        self.assertEqual(file_name("https://www.pref.okinawa.jp/a/b.pdf?x=1"), "b.pdf")

    def test_file_name_outside(self):
        """%2F・%5C を戻すと ../ になる名前や、. で始まる名前は data/raw の外や隠しファイルになるので断る。"""
        for url in (
            "https://www.pref.okinawa.jp/a/..%2F..%2F..%2F..%2Fevil.pdf",
            "https://www.pref.okinawa.jp/a/..%5C..%5Cevil.pdf",
            "https://www.pref.okinawa.jp/a/%2E%2E",
            "https://www.pref.okinawa.jp/a/.hidden.pdf",
            "https://www.pref.okinawa.jp/a/b%00.pdf",
            "https://www.pref.okinawa.jp/a/",
        ):
            with self.assertRaises(ValueError, msg=url):
                file_name(url)

    def test_pref_host(self):
        for host in ("www.pref.okinawa.jp", "www.pref.okinawa.lg.jp", "pref.okinawa.jp",
                     "www.police.pref.okinawa.jp", "byoinjigyokyoku.pref.okinawa.jp", "WWW.EB.PREF.OKINAWA.JP"):
            self.assertTrue(is_pref_host(host), host)
        for host in ("example.jp", "pref.okinawa.jp.example.com", "evilpref.okinawa.jp", "", None):
            self.assertFalse(is_pref_host(host), host)

    def test_redirect(self):
        """県のドメインの中へのリダイレクトにはついていき、外へは行かない。"""
        req = urllib.request.Request("https://www.pref.okinawa.lg.jp/a/b.pdf")
        new = PrefRedirect().redirect_request(req, None, 301, "Moved", {}, "https://www.pref.okinawa.jp/a/b.pdf")
        self.assertEqual(new.full_url, "https://www.pref.okinawa.jp/a/b.pdf")
        with self.assertRaises(urllib.error.HTTPError):
            PrefRedirect().redirect_request(req, None, 302, "Found", {}, "https://example.com/b.pdf")


if __name__ == "__main__":
    unittest.main()
