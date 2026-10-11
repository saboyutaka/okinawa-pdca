"""総括報告書の読み取りで使う、施策コード・数・名前の正規化（extract_soukatsu.py）。"""
import unittest

from extract_soukatsu import (
    circled, clean, dept_of, judge_of, kihon_id, name_key, parse_code, parse_num, shisaku_code, shisaku_id,
    split_section, tenkai_id, uncid,
)


class ParseCodeTest(unittest.TestCase):
    def test_full_width(self):
        """全角の数字・括弧・ハイフンと丸数字の施策コードを分解する。"""
        self.assertEqual(parse_code("１－（１）－ア－①"), {"shouraizou": 1, "kihon": 1, "kana": "ア", "num": 1})

    def test_dashes_and_spaces(self):
        """いろいろなダッシュと、途中の空白を許す。"""
        for s in ("3‐(10)‐イ‐⑫", "3―(10)―イ―⑫", "3 - (10) - イ - 12"):
            self.assertEqual(parse_code(s), {"shouraizou": 3, "kihon": 10, "kana": "イ", "num": 12}, s)

    def test_partial(self):
        """施策展開・基本施策までのコード。"""
        self.assertEqual(parse_code("1-(2)-ウ"), {"shouraizou": 1, "kihon": 2, "kana": "ウ", "num": None})
        self.assertEqual(parse_code("1-(2)"), {"shouraizou": 1, "kihon": 2, "kana": None, "num": None})

    def test_not_code(self):
        self.assertIsNone(parse_code("施策"))
        self.assertIsNone(parse_code(""))

    def test_ids(self):
        """施策 ID はア→a・イ→b… にする（1-(1)-ア-① → 1-1-a-1）。"""
        c = parse_code("5-(5)-イ-①")
        self.assertEqual(kihon_id(c), "5-5")
        self.assertEqual(tenkai_id(c), "5-5-b")
        self.assertEqual(shisaku_id(c), "5-5-b-1")
        self.assertEqual(shisaku_id(parse_code("1-(1)-ア-⑩")), "1-1-a-10")

    def test_display_code(self):
        """表示用のコードは報告書の書き方に戻す。"""
        self.assertEqual(shisaku_code(parse_code("5-(5)-イ-①")), "5-(5)-イ-①")
        self.assertEqual(circled(20), "⑳")
        self.assertEqual(circled(21), "(21)")


class TextTest(unittest.TestCase):
    def test_uncid_and_clean(self):
        """変換できなかったグリフ（cid）を除き、セルの改行と空白を詰める。"""
        self.assertEqual(uncid("a(cid:10)b"), "ab")
        self.assertEqual(uncid(None), "")
        self.assertEqual(clean(" 観光の\n 振興 (cid:3)"), "観光の振興")

    def test_parse_num(self):
        self.assertEqual(parse_num("1,234"), 1234.0)
        self.assertEqual(parse_num("△5.2"), -5.2)
        self.assertEqual(parse_num("85.3%"), 85.3)
        self.assertEqual(parse_num("１２．５"), 12.5)
        for s in ("", None, "－", "########", "調査中"):
            self.assertIsNone(parse_num(s), s)

    def test_name_key(self):
        """年度をまたいだ取組の照合に使う key（サイトの nameKey と同じ規則）。"""
        self.assertEqual(name_key("ＩＴ（情報技術）・人材 育成。"), "IT情報技術人材育成")
        self.assertEqual(name_key("「しまくとぅば」の普及、継承"), "しまくとぅばの普及継承")

    def test_split_section(self):
        """「取組名(所管部課)」の最後の括弧を所管部課にする。"""
        self.assertEqual(split_section("観光振興事業（観光政策課）"), ("観光振興事業", "観光政策課"))
        self.assertEqual(split_section("（仮称）新事業(文化観光スポーツ部観光政策課)"), ("（仮称）新事業", "文化観光スポーツ部観光政策課"))
        self.assertEqual(split_section("括弧の無い名前"), ("括弧の無い名前", ""))

    def test_dept_of(self):
        self.assertEqual(dept_of("商工労働部産業政策課"), "商工労働部")
        self.assertEqual(dept_of("知事公室防災危機管理課"), "知事公室")
        self.assertEqual(dept_of("教育庁総務課"), "教育庁")
        self.assertEqual(dept_of("所管なし"), "")


class JudgeOfTest(unittest.TestCase):
    def test_labels(self):
        """施策総括表の推進状況の文言を A〜G にする。"""
        cases = {
            "順調": "A",
            "概ね順調": "B",
            "取組は順調だが、成果は遅れている": "C",
            "取組は概ね順調だが、成果は遅れている": "D",
            "成果は順調だが、取組は遅れている": "E",
            "成果は概ね順調だが、取組は遅れている": "F",
            "大幅遅れ": "G",
        }
        for label, key in cases.items():
            self.assertEqual(judge_of(label), key, label)

    def test_variants(self):
        """空白・句読点・語尾の揺れ。"""
        self.assertEqual(judge_of(" 順 調 "), "A")
        self.assertEqual(judge_of("取組は順調だが\n成果は遅れている"), "C")
        self.assertEqual(judge_of("取組は概ね順調だが、成果が遅れている"), "D")
        self.assertEqual(judge_of("成果は順調だが、取組が遅れている"), "E")

    def test_other(self):
        self.assertIsNone(judge_of(""))
        self.assertEqual(judge_of("評価対象外"), "その他")


if __name__ == "__main__":
    unittest.main()
