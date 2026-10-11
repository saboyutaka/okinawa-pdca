"""沖縄県PDCA 以外の評価の読み取り（extract_kanko.py・extract_ikkatsu.py・extract_hyoka.py）。"""
import unittest

import extract_hyoka
import extract_ikkatsu
import extract_kanko


class KankoCodeTest(unittest.TestCase):
    def test_parse_rm_code(self):
        """観光ロードマップの施策コード（1-ア-①、(1)-ア-②、5-①、1-ア）。"""
        parse = extract_kanko.parse_rm_code
        self.assertEqual(parse("1-ア-①"), {"kihon": 1, "kana": "ア", "num": 1})
        self.assertEqual(parse("(1)-ア-②"), {"kihon": 1, "kana": "ア", "num": 2})
        self.assertEqual(parse("１－イ－③"), {"kihon": 1, "kana": "イ", "num": 3})
        self.assertEqual(parse("5-①"), {"kihon": 5, "kana": None, "num": 1})
        self.assertEqual(parse("1-ア"), {"kihon": 1, "kana": "ア", "num": None})
        self.assertIsNone(parse("1-ア-①追加"))
        self.assertIsNone(parse("施策"))

    def test_ids(self):
        self.assertEqual(extract_kanko.tenkai_id({"kihon": 1, "kana": "イ"}), "1-b")
        self.assertEqual(extract_kanko.tenkai_id({"kihon": 5, "kana": None}), "5")
        self.assertEqual(extract_kanko.rm_code({"kihon": 1, "kana": "ア", "num": 1}), "1-ア-①")
        self.assertEqual(extract_kanko.rm_code({"kihon": 5, "kana": None, "num": 2}), "5-②")
        self.assertEqual(extract_kanko.rm_code({"kihon": 1, "kana": "ア", "num": None}), "1-ア")


SHISAKU = {
    "1-1-a-1": {"tenkai_id": "1-1-a", "name": "観光の振興"},
    "1-1-a-2": {"tenkai_id": "1-1-a", "name": "人材の育成"},
    "3-7-a-1": {"tenkai_id": "3-7-a", "name": "離島の交通の確保"},
    "3-7-a-2": {"tenkai_id": "3-7-a", "name": "離島の医療"},
}


class IkkatsuTest(unittest.TestCase):
    def codes(self, *lines):
        # 検証シートの行は NFKC をかけてから渡される（read_sheets）
        return extract_ikkatsu.sheet_codes([extract_ikkatsu.nfkc(x) for x in lines], SHISAKU)

    def test_sheet_codes(self):
        """検証シートのいろいろな書き方の施策コードを施策 ID にする。"""
        self.assertEqual(self.codes("1-⑴-ｱ-①"), ["1-1-a-1"])
        self.assertEqual(self.codes("第4章-1-(1)-ア-②"), ["1-1-a-2"])
        self.assertEqual(self.codes("1-(1)-アー2"), ["1-1-a-2"])
        self.assertEqual(self.codes("1-(1)-ア-➀"), ["1-1-a-1"])  # NFKC で数字にならない丸数字

    def test_sheet_codes_order_and_unknown(self):
        """出てきた順に1回ずつ。施策の一覧に無いコードは捨てる。"""
        self.assertEqual(self.codes("1-(1)-ア-②", "1-(1)-ア-①", "1-(1)-ア-②", "9-(9)-ア-①"), ["1-1-a-2", "1-1-a-1"])

    def test_sheet_codes_tenkai_only(self):
        """施策展開までしか無いときは、シートに書かれた施策名で決める。"""
        self.assertEqual(self.codes("第4章-3-(7)-ア", "基本計画該当箇所 離島の医療"), ["3-7-a-2"])
        self.assertEqual(self.codes("第4章-3-(7)-ア"), [])

    def test_split_circled(self):
        self.assertEqual(extract_ikkatsu.split_circled("①目標A②目標B"), ["目標A", "目標B"])
        self.assertEqual(extract_ikkatsu.split_circled("目標A"), ["目標A"])
        self.assertEqual(extract_ikkatsu.split_circled(""), [])


class HyokaTest(unittest.TestCase):
    def test_bullet(self):
        """成果の箇条は「➢」、課題は記号フォントの私用領域の文字。"""
        for line in ("➢成果", "・成果", "課題"):
            self.assertTrue(extract_hyoka.is_bullet(line), line)
        for line in ("", "本文"):
            self.assertFalse(extract_hyoka.is_bullet(line), line)
        self.assertEqual(extract_hyoka.unbullet("➢ 成果の文"), "成果の文")
        self.assertEqual(extract_hyoka.unbullet("本文"), "本文")


if __name__ == "__main__":
    unittest.main()
