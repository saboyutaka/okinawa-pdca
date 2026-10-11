"""沖縄県PDCA 以外の評価の読み取り（extract_kanko.py・extract_ikkatsu.py・extract_hyoka.py）。"""
import unittest

import extract_hyoka
import extract_ikkatsu
import extract_kanko
import extract_soukatsu


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

    def test_cell_lines(self):
        """セルの改行: 折り返しは詰め、別の値が並ぶときだけ改行を残す。かっこ書きの行は前の行に付ける。"""
        f = extract_kanko.cell_lines
        self.assertEqual(f("１回\n(２回)"), "１回(２回)")
        self.assertEqual(f("関係機関\n調整"), "関係機関調整")
        self.assertEqual(f("10件(20件)\n45件(90件)"), "10件(20件)\n45件(90件)")
        self.assertEqual(f("10件\n(20件)\n900kW\n(1,800kW)"), "10件(20件)\n900kW(1,800kW)")
        self.assertEqual(f("北部15項目\n(30項目)\n西表11項目\n(22項目)"), "北部15項目(30項目)\n西表11項目(22項目)")
        self.assertEqual(f("北部:B\n西表島:B"), "北部:B\n西表島:B")
        self.assertEqual(f("1,000人\n以上\n80%以上"), "1,000人以上\n80%以上")
        self.assertEqual(f("32件\n(55件)\n(R5年度)"), "32件(55件)(R5年度)")
        # 括弧の中の折り返しは数字で始まっても続き
        self.assertEqual(f("９空港\n（新規１\n空港、継\n続８空\n港、累計\n11空港）"), "９空港（新規１空港、継続８空港、累計11空港）")
        # 「・」の箇条（1行目が「・」で始まるときだけ）
        self.assertEqual(f("・件数A\n・件数B"), "・件数A\n・件数B")
        self.assertEqual(f("訓練参加団体\n・事業者数"), "訓練参加団体・事業者数")
        self.assertEqual(f("0\n（補助事業）\n1,925\n（単独事業）"), "0（補助事業）\n1,925（単独事業）")
        self.assertEqual(f(None), "")

    def test_budget_of(self):
        """決算見込額は値が1つのときだけ数。内訳の後に合計が続き、和が合うときは合計。"""
        f = extract_kanko.budget_of
        self.assertEqual(f("56,275"), 56275)
        self.assertIsNone(f("316,411\n113,189"))
        self.assertIsNone(f("0（補助事業）\n1,925（単独事業）"))
        self.assertIsNone(f("7,576の一部"))
        self.assertEqual(f("①29,429\n②20,066\n③31,900\n81,395"), 81395)
        self.assertIsNone(f("①1\n②2\n9"))

    def test_num_of(self):
        """成果指標の数はかっこ書きの前の値。"""
        f = extract_kanko.num_of
        self.assertEqual(f("3,681(177,191)"), 3681)
        self.assertEqual(f("91.8"), 91.8)
        self.assertIsNone(f("―(R8導入)"))
        self.assertIsNone(f("―"))
        self.assertIsNone(f(""))

    def test_split_name_section(self):
        """主な取組の欄を名前・所管部課・注記に分ける（入れ子の括弧、所管部課の後ろの小事業の一覧）。"""
        f = extract_kanko.split_name_section
        self.assertEqual(f("「安全・安心の島沖\n縄」に関する調査\n（文化観光スポーツ\n部観光政策課）"),
                         ("「安全・安心の島沖縄」に関する調査", "文化観光スポーツ部観光政策課", ""))
        self.assertEqual(f("クルーズ船の受入体\n制の構築\n（土木建築部港湾課\n（那覇港管理組合））"),
                         ("クルーズ船の受入体制の構築", "土木建築部港湾課（那覇港管理組合）", ""))
        self.assertEqual(f("旅行者検査実施支援\n事業(令和5年度名称\n変更：旅行者専用発\n熱等相談)\n（文化観光スポーツ\n部観光振興課）")[1],
                         "文化観光スポーツ部観光振興課")
        self.assertEqual(f("MICE施設の管理・運営\n（文化観光スポーツ部\nMICE推進課）\n①OCC保全修繕\n②万国保全修繕"),
                         ("MICE施設の管理・運営", "文化観光スポーツ部MICE推進課", "①OCC保全修繕\n②万国保全修繕"))
        self.assertEqual(f("所管の無い取組"), ("所管の無い取組", "", ""))

    def test_fix_radicals(self):
        """康熙部首・CJK部首補助の字を普通の漢字にする。"""
        self.assertEqual(extract_kanko.fix_radicals("⼤⽀⾼い"), "大支高い")
        self.assertEqual(extract_kanko.fix_radicals_all({"a": ["⼤"], "b": 1}), {"a": ["大"], "b": 1})


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
        self.assertEqual(self.codes("第4章-3ー⑺ーアー2"), ["3-7-a-2"])  # 区切りが長音記号（R4 No.112 など）

    def test_sheet_codes_order_and_unknown(self):
        """出てきた順に1回ずつ。施策の一覧に無いコードは捨てる。"""
        self.assertEqual(self.codes("1-(1)-ア-②", "1-(1)-ア-①", "1-(1)-ア-②", "9-(9)-ア-①"), ["1-1-a-2", "1-1-a-1"])

    def test_sheet_codes_tenkai_only(self):
        """施策展開までしか無いときは、シートに書かれた施策名で決める。"""
        self.assertEqual(self.codes("第4章-3-(7)-ア", "基本計画該当箇所 離島の医療"), ["3-7-a-2"])
        self.assertEqual(self.codes("第4章-3-(7)-ア"), [])

    def test_nfkc_keep_circled(self):
        """方針の文章は丸数字を残して NFKC（「①②戦争体験者」が「12戦争体験者」にならない）。"""
        f = extract_ikkatsu.nfkc_keep_circled
        self.assertEqual(f("①②戦争体験者　ＡＢＣ－１（２）"), "①②戦争体験者 ABC-1(2)")
        self.assertEqual(extract_ikkatsu.nfkc("①②"), "12")
        self.assertEqual(extract_ikkatsu.fix_radicals("⼤"), "大")

    def test_dept(self):
        """担当部課名: 見出しのセルを値にしない。県の誤記（効果発現年度の欄の文字）は出さない。"""
        self.assertEqual(extract_ikkatsu.dept_cell(["文化観光スポーツ部観光振興課", "事業実施（予定）年度"]), "文化観光スポーツ部観光振興課")
        self.assertEqual(extract_ikkatsu.dept_cell(["事業実施（予定）年度", "沖縄振興基本方針該当箇所"]), "")
        self.assertEqual(extract_ikkatsu.dept_cell([]), "")
        self.assertEqual(extract_ikkatsu.drop_misprinted_dept("■当年度 □後年度（ 年度）"), "")
        self.assertEqual(extract_ikkatsu.drop_misprinted_dept("企画部 交通政策課"), "企画部 交通政策課")

    def test_merge_repeated(self):
        """同じ事業番号: 中身が同じ再掲は1件に、印字し直した続きは成果目標と事業概要を足す。"""
        def j(no, targets, overview, grade=""):
            return {"no": no, "targets": [{"name": n, "target": "", "actual": a} for n, a in targets],
                    "overview": overview, "grade": grade, "grade_label": "", "rate_raw": "", "rate": None, "_last": []}
        rows = extract_ikkatsu.merge_repeated([
            j(4, [("目標①", "実績①")], ["概要①"], "△"), j(4, [("目標④", "実績④")], ["概要④"]),
            j(138, [("目標", "実績")], ["概要"]), j(138, [("目標", "実績")], ["概要"]),
        ])
        self.assertEqual([r["no"] for r in rows], [4, 138])
        self.assertEqual([t["name"] for t in rows[0]["targets"]], ["目標①", "目標④"])
        self.assertEqual(rows[0]["overview"], "概要①\n概要④")
        self.assertEqual(rows[0]["grade"], "△")
        self.assertEqual(len(rows[1]["targets"]), 1)
        self.assertNotIn("_last", rows[1])

    def test_sheet_fixes(self):
        """画像だけの検証シートから目で読んだ値: 施策コードと施策IDが合い、執行率が「執行済額÷計」と合う。"""
        for (year, no), fix in extract_ikkatsu.SHEET_FIXES.items():
            c = extract_soukatsu.parse_code(fix["printed"])
            self.assertEqual(extract_soukatsu.shisaku_id(c), fix["shisaku"], (year, no))
            self.assertTrue(fix["source"].startswith(f"ikkatsu/{year}-") and fix["page"] >= 1, (year, no))
            self.assertRegex(fix["dept"], r"^\S+(部|庁) \S+課$", (year, no))
            b = extract_ikkatsu.sheet_fix_budget(fix["budget"])
            self.assertAlmostEqual(round(b["spent"] / b["total"] * 100, 1), b["rate"], places=6, msg=(year, no))
            self.assertLessEqual(b["kofukin"], b["spent"], (year, no))

    def test_dept_lines(self):
        """担当部課名のセル: 課で終わった行の次の別の課は「、」で区切る。折り返しとかっこ書きはつなぐ。"""
        f = extract_ikkatsu.dept_lines
        self.assertEqual(f("商工労働部 ITイノベーション推進課\n商工労働部 企業立地支援課"),
                         "商工労働部 ITイノベーション推進課、商工労働部 企業立地支援課")
        self.assertEqual(f("商工労働部 労働政策課\n雇用政策課"), "商工労働部 労働政策課、雇用政策課")
        self.assertEqual(f("こども未来部 女性力・ダイバーシティ推\n進課"), "こども未来部 女性力・ダイバーシティ推進課")
        self.assertEqual(f("農林水産部農林水産総務課\n（農業研究センター）"), "農林水産部農林水産総務課（農業研究センター）")
        self.assertEqual(f("文化観光スポーツ部 MICE推進課、\n商工労働部 グローバルマーケット戦略課"),
                         "文化観光スポーツ部 MICE推進課、商工労働部 グローバルマーケット戦略課")
        self.assertEqual(f("商工労働部\nマーケティング戦略推進課"), "商工労働部マーケティング戦略推進課")

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
