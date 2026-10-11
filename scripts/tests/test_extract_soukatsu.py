"""総括報告書の読み取りで使う、施策コード・数・名前の正規化（extract_soukatsu.py）。"""
import unittest

from extract_soukatsu import (
    circled, clean, dept_of, fix_chars, fix_strings, is_visible, join_cell_lines, join_lines, judge_of, kihon_id,
    name_key, parse_code, parse_num, read_mezasu, shisaku_code, shisaku_id, split_section, tenkai_id, uncid,
    with_lines,
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


class FixCharsTest(unittest.TestCase):
    def test_radicals(self):
        """康熙部首・CJK部首補助の文字だけを普通の漢字に直す（R4 3-(11)-ウ-① の「⽀援」「⼤学」）。"""
        self.assertEqual(fix_chars("総合的⽀援や、⼤学等"), "総合的支援や、大学等")
        self.assertEqual(fix_chars("\u2E9F"), "母")  # CJK部首補助の「⺟」
        self.assertEqual(fix_chars("\u2EDD"), "\u2EDD")  # NFKC で写す先の無い CJK部首補助の文字はそのまま

    def test_keep_others(self):
        """全角英数・丸数字・記号には NFKC をかけない。印字が米偏の「𥹥」もそのまま。"""
        for s in ("ＩＣＴ（１２３）", "①計画通りの進捗", "1,032万ｔ-CO₂", "中国第一歴史𥹥案館", "㎡"):
            self.assertEqual(fix_chars(s), s)

    def test_fix_strings(self):
        """入れ子の dict・list の文字列すべてに効き、数値などはそのまま。"""
        rec = {"a": "⼤", "b": [{"c": "⽀"}], "n": 1.5, "x": None}
        self.assertEqual(fix_strings(rec), {"a": "大", "b": [{"c": "支"}], "n": 1.5, "x": None})


class JoinCellLinesTest(unittest.TestCase):
    def test_one_line(self):
        self.assertEqual(join_cell_lines("商工労働部産業政策課"), "商工労働部産業政策課")
        self.assertEqual(join_cell_lines(""), "")
        self.assertEqual(join_cell_lines(None), "")

    def test_lines(self):
        """行ごとに別の部・課なら「、」でつなぐ。"""
        self.assertEqual(join_cell_lines("企業局\n土木建築部"), "企業局、土木建築部")
        self.assertEqual(join_cell_lines("商工労働部 土木建築部"), "商工労働部、土木建築部")  # 欄の中の改行が空白になったもの
        self.assertEqual(join_cell_lines("文化観光スポーツ部観光政策課 \n観光振興課"), "文化観光スポーツ部観光政策課、観光振興課")
        self.assertEqual(join_cell_lines("商工労働部グローバルマーケット戦略課\n土木建築部港湾課"),
                         "商工労働部グローバルマーケット戦略課、土木建築部港湾課")

    def test_dept_and_section_columns(self):
        """「部」の列と「課」の列をつないだ印字は、上から順に組にする（R4 3-(4)-ア-③、4-(3)-ア-②）。"""
        self.assertEqual(join_cell_lines("商工労働部\n土木建築部アジア経済戦略課\n港湾課"),
                         "商工労働部アジア経済戦略課、土木建築部港湾課")
        self.assertEqual(join_cell_lines("企業局\n(cid:10)\n土木建築部総務企画課\n(cid:10)\n土木総務課"),
                         "企業局総務企画課、土木建築部土木総務課")

    def test_wrapped_name(self):
        """名前の途中で折り返した行は、区切りを入れずにつなぐ。"""
        self.assertEqual(join_cell_lines("文化観光スポーツ部観光政\n策課"), "文化観光スポーツ部観光政策課")


class MezasuTest(unittest.TestCase):
    def test_one_line(self):
        self.assertEqual(read_mezasu("基本施策\n１－（１）\n名前\n目指す姿\n…の形成を目指す。\n主要指標名"), "…の形成を目指す。")

    def test_wrapped(self):
        """「目」「指す。」と行が分かれていても読む（2-(4)・2-(5)）。"""
        text = "目指す姿\n地域の安全に…安全・安心な島づくりを目\n指す。\n主要指標名"
        self.assertEqual(read_mezasu(text), "地域の安全に…安全・安心な島づくりを目指す。")
        self.assertEqual(read_mezasu("目指す姿\n…の実現を目指\nす。"), "…の実現を目指す。")

    def test_none(self):
        self.assertEqual(read_mezasu("基本施策のページではない"), "")


class JoinLinesTest(unittest.TestCase):
    def test_fixed_right_edge(self):
        """(x0, x1, text) の行: 前の行が右端（right_edge − 12）まで来ていれば折り返しとしてつなぐ。"""
        lines = [(60, 555, "・あいう"), (60, 300, "えお。"), (60, 200, "かき"), (60, 555, "・くけ"), (60, 100, "こ")]
        self.assertEqual(join_lines(lines, 556), "・あいうえお。\nかき\n・くけこ")

    def test_box_edges(self):
        """(x0, x1, text, wrap_at, near_at, indent_at) の行: 幅の広いページでは箱から決めた位置で見分ける（R4 の 773pt）。"""
        e = (703.0, 670.0, 86.0)
        lines = [(82, 718, "・…必要があ", *e), (82, 300, "る。", *e), (82, 718, "・…求められ", *e),
                 (82, 690, "る。", *e), (92, 170, "外部環境の分析", *e), (82, 200, "④社会・経済情勢の変化", *e)]
        self.assertEqual(join_lines(lines), "・…必要がある。\n・…求められる。\n外部環境の分析\n④社会・経済情勢の変化")

    def test_indent_after_full_line(self):
        """前の行が右端まで来ていても、字下げした行（小見出し）は改行する。"""
        e = (544.0, 519.0, 64.0)
        lines = [(60, 556, "・…必要がある。", *e), (68.7, 130, "改善余地の検証等", *e), (60, 120, "⑦その他", *e)]
        self.assertEqual(join_lines(lines), "・…必要がある。\n改善余地の検証等\n⑦その他")

    def test_near_right_edge(self):
        """句点で終わらない行は、右端の少し手前（near_at）までで折り返したものとみなす。句点で終わる行は改行。"""
        e = (544.0, 519.0, 64.0)
        lines = [(60, 530, "・設置率は43.9％で、全国の", *e), (60, 300, "82.9％と比較し低い。", *e),
                 (60, 530, "・…を実施した。", *e), (60, 300, "また、…", *e)]
        self.assertEqual(join_lines(lines), "・設置率は43.9％で、全国の82.9％と比較し低い。\n・…を実施した。\nまた、…")

    def test_ascii_space(self):
        """英数字どうしをつなぐときは空白を入れる。"""
        e = (544.0, 519.0, 64.0)
        lines = [(60, 550, "・…へ「EATS", *e), (60, 300, "OKINAWA」の登録", *e)]
        self.assertEqual(join_lines(lines), "・…へ「EATS OKINAWA」の登録")


class VisibleTest(unittest.TestCase):
    def test_is_visible(self):
        """描かれる文字が1つでも重なる行は見えている。クリップで隠れた行（重なる文字が無い）は見えていない。"""
        pts = {100: [(70.0, 100.4), (200.0, 100.4)], 120: [(65.0, 120.0)]}
        self.assertTrue(is_visible({"top": 96.0, "bottom": 104.0, "x0": 60.0, "x1": 300.0}, pts))
        self.assertTrue(is_visible({"top": 116.0, "bottom": 124.0, "x0": 60.0, "x1": 300.0}, pts))
        self.assertFalse(is_visible({"top": 200.0, "bottom": 208.0, "x0": 60.0, "x1": 300.0}, pts))
        self.assertFalse(is_visible({"top": 96.0, "bottom": 104.0, "x0": 400.0, "x1": 500.0}, pts))


class WithLinesTest(unittest.TestCase):
    def test_with_lines(self):
        """目標・実績が複数行の取組: lines を actual の直後に置き、target・actual は空でない値を改行でつなぐ。"""
        rec = {"no": 3, "target": "300件・12回", "actual": "", "status": "順調"}
        lines = [{"target": "300件・12回", "actual": ""}, {"target": "300件", "actual": "325件"},
                 {"target": "12回", "actual": "12回"}]
        out = with_lines(rec, lines)
        self.assertEqual(list(out), ["no", "target", "actual", "lines", "status"])
        self.assertEqual(out["target"], "300件・12回\n300件\n12回")
        self.assertEqual(out["actual"], "325件\n12回")
        self.assertEqual(out["lines"], lines)


if __name__ == "__main__":
    unittest.main()
