"""抽出とは別の読み方（PyMuPDF）で読み直した値との比べ方（cross_read.py）。PDF は使わず、作った値で確かめる。"""
import unittest

from cross_read import (
    compare_seika, compare_torikumi, expected_torikumi, format_diff, is_form2, joined, lines_key, parse_seika_group,
    shisaku_id_of, split_known, split_name, ws,
)


def seika(**kw):
    """抽出の成果指標の1行（必要な欄だけ）。"""
    r = {"year": 2025, "shisaku_id": "1-1-a-1", "name": "再生可能エネルギー電源比率", "unit": "％", "base_raw": "8.2",
         "actual_series": [{"year": "R7", "raw": "11.1", "ref_year": "R6年度"}, {"year": "R8", "raw": "―", "ref_year": ""},
                           {"year": "R9", "raw": "―", "ref_year": ""}],
         "plan_raw": ["9.5", "10.8", "12.1"], "target_raw": "12.1", "rate_raw": "223.1%", "judgement": "目標達成の見込み",
         "source": "soukatsu/2025-r07/a.pdf", "page": 7}
    r.update(kw)
    return r


def torikumi(no=1, lines=None, **kw):
    """読み直しの主な取組の1件。lines は（目標, 実績, 進捗状況）の並び。"""
    r = {"year": 2025, "shisaku_id": "1-1-a-1", "no": no, "name": "取組", "budget_raw": "1,688",
         "lines": [{"target": t, "actual": a, "status": s} for t, a, s in (lines or [("10件", "28件", "順調")])],
         "source": "soukatsu/2025-r07/a.pdf", "page": 6}
    r.update(kw)
    return r


def extracted_torikumi(no=1, **kw):
    """抽出の主な取組の1件（目標・実績が1行のもの）。"""
    r = {"year": 2025, "shisaku_id": "1-1-a-1", "no": no, "name": "取組", "budget_raw": "1,688",
         "target": "10件", "actual": "28件", "status_raw": "順調", "source": "soukatsu/2025-r07/a.pdf", "page": 6}
    r.update(kw)
    return r


class TextTest(unittest.TestCase):
    def test_ws(self):
        """空白・改行と「(cid:N)」を除いて比べる（抽出はセルの空白と改行を詰めている）。"""
        self.assertEqual(ws("目標達成の\n見込み"), "目標達成の見込み")
        self.assertEqual(ws(" 1, 234 (cid:10)"), "1,234")
        self.assertEqual(ws(None), "")

    def test_shisaku_id_of(self):
        self.assertEqual(shisaku_id_of("１－（１）－ア－①"), "1-1-a-1")
        self.assertEqual(shisaku_id_of("３－（１０）－ウ－⑫"), "3-10-c-12")
        self.assertIsNone(shisaku_id_of("施策"))

    def test_split_name(self):
        """末尾の括弧の組を、入れ子を数えて取る（取組名にも所管部課にも括弧がありうる）。"""
        self.assertEqual(split_name("離島観光活性化促進事業（プロモーション）(文化観光スポーツ部観光振興課)"),
                         ("離島観光活性化促進事業（プロモーション）", "文化観光スポーツ部観光振興課"))
        self.assertEqual(split_name("スマート農業(農林水産部農林水産総務課（研究企画班）)"),
                         ("スマート農業", "農林水産部農林水産総務課（研究企画班）"))
        self.assertEqual(split_name("括弧の無い取組"), ("括弧の無い取組", ""))

    def test_joined(self):
        """2行以上の目標・実績は、空でない値を改行でつなぐ。"""
        self.assertEqual(joined(["19地点", "", "１海域"]), "19地点\n１海域")

    def test_is_form2(self):
        self.assertTrue(is_form2("様式２（施策）\n「施策」総括表"))
        self.assertTrue(is_form2("Ⅱ 成果指標の達成状況\n成果指標名"))
        self.assertFalse(is_form2("主な取組数\n順調の割合\n成果指標名"))  # 施策総括表
        self.assertFalse(is_form2("付属資料"))


class ParseSeikaTest(unittest.TestCase):
    # PyMuPDF の表の読み取りの形（結合されたセルは None）。R4〜R6 の10列の表
    ROWS = [
        ["成果指標名", None, "単位", "基準値", "実績値", None, None, "目標値\nR6年度", "達成率", "達成状況"],
        [None, None, None, None, "R4", "R5", "R6", None, None, None],
        ["野菜・果樹・花き類の生産量（園芸\n品目）", None, "トン", "52,387", "51,686", "―", "―", "57,423", "-41.8%",
         "達成に努め\nる"],
        [None, None, None, None, "R2年度", "", "", None, None, None],
        [None, None, None, None, "計画値", None, None, None, None, None],
        [None, None, None, None, "54,064", "55,746", "57,423", None, None, None],
    ]

    def test_parse(self):
        g = parse_seika_group(self.ROWS, 0)
        self.assertEqual(g["name"], "野菜・果樹・花き類の生産量（園芸品目）")
        self.assertEqual((g["unit"], g["base_raw"], g["target_raw"], g["rate_raw"], g["judgement"]),
                         ("トン", "52,387", "57,423", "-41.8%", "達成に努める"))
        self.assertEqual([s["raw"] for s in g["actual_series"]], ["51,686", "―", "―"])
        self.assertEqual([s["ref_year"] for s in g["actual_series"]], ["R2年度", "", ""])
        self.assertEqual([s["year"] for s in g["actual_series"]], ["R4", "R5", "R6"])
        self.assertEqual(g["plan_label"], "計画値")
        self.assertEqual(g["plan_raw"], ["54,064", "55,746", "57,423"])

    def test_not_header(self):
        self.assertIsNone(parse_seika_group([["成果指標名", "単位"], ["a", "b"]], 0))


class CompareSeikaTest(unittest.TestCase):
    def test_same(self):
        """空白・改行だけの違いは食い違いにしない。"""
        self.assertEqual(compare_seika([seika()], [seika(judgement="目標達成の\n見込み")]), [])

    def test_field(self):
        d = compare_seika([seika()], [seika(rate_raw="22.3%")])
        self.assertEqual([(x["field"], x["extracted"], x["reread"]) for x in d], [("rate_raw", "223.1%", "22.3%")])
        self.assertEqual((d[0]["source"], d[0]["page"]), ("soukatsu/2025-r07/a.pdf", 7))

    def test_series(self):
        s = seika()
        r = seika(actual_series=[{**s["actual_series"][0], "ref_year": "R5年度"}] + s["actual_series"][1:])
        self.assertEqual([x["field"] for x in compare_seika([s], [r])], ["actual_series[0].ref_year"])

    def test_base_fix(self):
        """基準値を部局票で補った行は、総括報告書の印字（base_fix.printed）と比べる。"""
        e = seika(base_raw="3,129,946", base_fix={"printed": "########", "source": "x.pdf", "page": 1})
        self.assertEqual(compare_seika([e], [seika(base_raw="########")]), [])

    def test_count(self):
        """施策ごとの指標の数が違えば、数の食い違いだけ出す（並び順の突き合わせがずれるため）。"""
        d = compare_seika([seika()], [seika(), seika(name="別の指標")])
        self.assertEqual([(x["field"], x["extracted"], x["reread"]) for x in d], [("成果指標の数", 1, 2)])


class CompareTorikumiTest(unittest.TestCase):
    def test_expected_one_line(self):
        self.assertEqual(expected_torikumi([{"target": "10件", "actual": "28件", "status": "順調"}]),
                         {"target": "10件", "actual": "28件", "status_raw": "順調", "lines": None})

    def test_expected_lines(self):
        """2行以上: target / actual は空でない値を改行でつなぎ、進捗状況は1行目。"""
        e = expected_torikumi([{"target": "19地点", "actual": "", "status": "概ね順調"},
                               {"target": "１海域", "actual": "11地点", "status": ""}])
        self.assertEqual((e["target"], e["actual"], e["status_raw"]), ("19地点\n１海域", "11地点", "概ね順調"))
        self.assertEqual(e["lines"], [{"target": "19地点", "actual": ""}, {"target": "１海域", "actual": "11地点"}])

    def test_lines_key(self):
        """目標・実績とも空の行は比べない。"""
        self.assertEqual(lines_key([{"target": "a", "actual": ""}, {"target": "", "actual": ""}]), [("a", "")])
        self.assertEqual(lines_key(None), [])

    def test_same(self):
        self.assertEqual(compare_torikumi([extracted_torikumi()], [torikumi()]), [])

    def test_fields(self):
        d = compare_torikumi([extracted_torikumi(budget_raw="1,668", status_raw="")], [torikumi()])
        self.assertEqual([x["field"] for x in d], ["budget_raw", "status_raw"])

    def test_missing(self):
        d = compare_torikumi([extracted_torikumi()], [torikumi(), torikumi(no=2)])
        self.assertEqual([(x["field"], x["extracted"], x["reread"]) for x in d], [("取組", "なし", "あり")])

    def test_lines_not_extracted(self):
        """目標・実績が2行あるのに抽出に lines が無ければ、lines の食い違い1件にまとめる。"""
        r = torikumi(lines=[("宮古５件", "18件", "順調"), ("八重山５件", "14件", "")])
        d = compare_torikumi([extracted_torikumi(target="宮古５件", actual="18件")], [r])
        self.assertEqual([x["field"] for x in d], ["lines"])
        self.assertEqual(d[0]["reread"], [{"target": "宮古５件", "actual": "18件"}, {"target": "八重山５件", "actual": "14件"}])

    def test_lines_extracted(self):
        """抽出が lines を持っていれば、target / actual（改行でつないだもの）と各行を比べる。"""
        r = torikumi(lines=[("宮古５件", "18件", "順調"), ("八重山５件", "14件", "")])
        e = extracted_torikumi(target="宮古５件\n八重山５件", actual="18件\n14件",
                               lines=[{"target": "宮古５件", "actual": "18件"}, {"target": "八重山５件", "actual": "14件"}])
        self.assertEqual(compare_torikumi([e], [r]), [])
        e2 = {**e, "lines": [{"target": "宮古５件", "actual": "18件"}, {"target": "八重山５件", "actual": "41件"}]}
        self.assertEqual([x["field"] for x in compare_torikumi([e2], [r])], ["lines"])


class KnownTest(unittest.TestCase):
    def test_split_known(self):
        """ファイル・ページ・欄が既知の表にある食い違いは「既知」に回す。"""
        a = {"source": "a.pdf", "page": 3, "field": "actual_series[2].ref_year"}
        b = {"source": "a.pdf", "page": 3, "field": "rate_raw"}
        rest, hit = split_known([a, b], {("a.pdf", 3, "actual_series[2].ref_year"): "理由"})
        self.assertEqual((rest, hit), ([b], [a]))

    def test_format(self):
        d = compare_seika([seika()], [seika(rate_raw="22.3%")])[0]
        line = format_diff(d)
        for part in ("R7", "1-1-a-1", "rate_raw", "「223.1%」", "「22.3%」", "soukatsu/2025-r07/a.pdf p7"):
            self.assertIn(part, line)


if __name__ == "__main__":
    unittest.main()
