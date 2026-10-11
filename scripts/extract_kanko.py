#!/usr/bin/env python3
"""沖縄観光推進ロードマップPDCA の実施報告書（PDF）から、施策・主な取組・成果指標を表として取り出す。

使い方（解析用コンテナ内で実行する）:
  docker compose run --rm tools python scripts/extract_kanko.py

入力: data/raw/kanko-rm/<年度>/ の「実施報告書」（manifest.jsonl のリンク文言で見分ける）
出力: data/extracted/kanko/
  kihon.json     基本施策（6）。目次から取る
  shisaku.json   施策（年度×85）。施策展開の名前、施策の方向、関係部等、分析（Check）、推進戦略案（Action）
  torikumi.json  主な取組（年度×約290）。沖縄県PDCAの主な取組と同じものには pdca に施策IDと取組の key を付ける
  seika.json     成果指標（年度×100）。沖縄県PDCAの成果指標と同じ名前のものには pdca を付ける
  years.json     年度ごとの読み取り状況（R4 の本編は文字に変換できないフォントで、表を読めない）
  sources.json   出典（ファイルID → 県のURL・リンク文言）
すべての行に出典（source: ファイルID, page: PDFのページ番号）を付ける。

施策のコードは報告書の「1-ア-①」を「1-a-1」に、施策展開「1-ア」を「1-a」にする（ア→a・イ→b…）。
基本施策5だけは施策展開に「ア・イ」の段が無い（「5」「5-①」）。
沖縄県PDCA（data/extracted/soukatsu）を先に作っておく（照合に使う）。
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
import unicodedata
from pathlib import Path

import pdfplumber

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_soukatsu import (  # noqa: E402
    KANA, STATUSES, clean, dept_of, load_manifest, name_key, parse_num, uncid, write_json,
)

SOURCE = "kanko-rm"
JUDGEMENTS = ("前進", "横ばい", "後退", "その他")
# 県の概要版の件数（scripts/check_extracted.py でも使う）。R4 は本編を読めないので概要版の数だけ
EXPECTED = {
    2022: {"torikumi": 282, "status": {"順調": 224, "概ね順調": 34, "やや遅れ": 9, "大幅遅れ": 14, "未着手": 1}, "seika": 100, "zenshin": 69},
    2023: {"torikumi": 291, "status": {"順調": 236, "概ね順調": 21, "やや遅れ": 6, "大幅遅れ": 21, "未着手": 4}, "seika": 100, "zenshin": 77},
    2024: {"torikumi": 291, "status": {"順調": 228, "概ね順調": 17, "やや遅れ": 16, "大幅遅れ": 13, "未着手": 16}, "seika": 100, "zenshin": 78},
}
NONE_VALUES = ("", "―", "-", "－", "ー", "_")


def nfkc(s: str | None) -> str:
    return unicodedata.normalize("NFKC", uncid(s))


def parse_rm_code(s: str) -> dict | None:
    """「1-ア-①」「(1)-ア-②」「5-①」「1-ア」などを分解する。"""
    t = re.sub(r"[‐－―−–—]", "-", nfkc(s))
    t = re.sub(r"\s", "", t)
    m = re.match(r"^\(?(\d)\)?(?:-([ア-ン]))?(?:-(\d+))?$", t)
    if not m:
        return None
    k, kana, n = m.groups()
    return {"kihon": int(k), "kana": kana, "num": int(n) if n else None}


def tenkai_id(c: dict) -> str:
    return f"{c['kihon']}-{chr(ord('a') + KANA.index(c['kana']))}" if c["kana"] else str(c["kihon"])


def rm_code(c: dict) -> str:
    """表示用のコード（例: 1-ア-①、5-①）。"""
    head = f"{c['kihon']}-{c['kana']}" if c["kana"] else str(c["kihon"])
    return f"{head}-{chr(0x2460 + c['num'] - 1)}" if c["num"] else head


def compact(row: list) -> list[str]:
    """表の行から結合セルの None を除く（年度で列の数が違っても同じように読めるように）。"""
    return [c for c in row if c is not None]


def fix_radicals(s: str) -> str:
    """康熙部首（U+2F00〜）・CJK部首補助（U+2E80〜）の字を普通の漢字にする。見た目は同じでも別の文字で、検索や照合で合わない。"""
    return "".join(unicodedata.normalize("NFKC", c) if 0x2E80 <= ord(c) <= 0x2FDF else c for c in s)


def fix_radicals_all(obj):
    """出力のすべての文字列に fix_radicals をかける。"""
    if isinstance(obj, str):
        return fix_radicals(obj)
    if isinstance(obj, list):
        return [fix_radicals_all(x) for x in obj]
    if isinstance(obj, dict):
        return {k: fix_radicals_all(v) for k, v in obj.items()}
    return obj


def paren_depth(s: str) -> int:
    return len(re.findall(r"[(（]", s)) - len(re.findall(r"[)）]", s))


def cell_lines(s: str | None) -> str:
    """セルの文字の改行を整える。PDF の折り返しは詰め、別の値が改行で並んでいるときだけ "\\n" を残す。
    別の値とみなすのは、括弧の外で次の行が数字・丸数字で始まるとき（「10件(20件)⏎45件(90件)」「316,411⏎113,189」）、
    閉じ括弧で終わった次の行が括弧で始まらないとき（「北部15項目⏎(30項目)⏎西表11項目⏎(22項目)」）、
    「名前:値」が並ぶとき（「北部:B⏎西表島:B」）、「・」の箇条が並ぶとき。
    括弧だけの行（「(20件)」「（補助事業）」「(R5年度)」）は前の行に付ける。前の行が「、」「・」「:」で終わるときは折り返し。"""
    lines = [x for x in (re.sub(r"\s+", "", ln) for ln in uncid(s).split("\n")) if x]
    if not lines:
        return ""
    bullets = lines[0].startswith("・")
    out, depth = lines[0], paren_depth(lines[0])
    for prev, x in zip(lines, lines[1:]):
        brk = depth == 0 and not re.match(r"^[(（]", x) and not re.search(r"[、，,・:：]$", prev) and bool(
            re.match(r"^[0-9０-９①-⑳]", x)
            or re.search(r"[)）]$", prev)
            or (re.match(r"^[^:：\d０-９]{1,6}[:：]", x) and re.search(r"[:：]", prev))
            or (bullets and x.startswith("・")))
        out += ("\n" if brk else "") + x
        depth += paren_depth(x)
    return out


def num_of(s: str) -> float | None:
    """値の数。後ろのかっこ書き（「3,681(177,191)」の収容人員、「―(R8導入)」）は除く。"""
    head = re.split(r"[(（]", s, maxsplit=1)[0] if not re.match(r"^[(（]", s) else s
    return parse_num(head) if head not in NONE_VALUES else None


def budget_of(raw: str) -> float | None:
    """決算見込額（千円）。値が1つのときだけ数にする。改行で2つ以上の値が並ぶとき（「316,411⏎113,189」
    「0（補助事業）⏎1,925（単独事業）」）は、どう合わせるか報告書に書かれていないので None。
    ただし「①29,429⏎②20,066⏎③31,900⏎81,395」のように丸数字の内訳の後に合計が続き、内訳の和が合計と一致するときは合計。"""
    lines = raw.split("\n")
    if len(lines) == 1:
        return parse_num(raw)
    *items, last = lines
    if all(re.match(r"^[①-⑳]", x) for x in items) and not re.match(r"^[①-⑳]", last):
        vals = [parse_num(x[1:]) for x in items]
        total = parse_num(last)
        if total is not None and None not in vals and abs(sum(vals) - total) < 0.5:
            return total
    return None


def top_level_groups(t: str) -> list[tuple[int, int]]:
    """いちばん外側の括弧のまとまり（開き・閉じの位置）。全角・半角の括弧を同じに扱う。"""
    out, depth, start = [], 0, None
    for i, ch in enumerate(t):
        if ch in "(（":
            if depth == 0:
                start = i
            depth += 1
        elif ch in ")）" and depth > 0:
            depth -= 1
            if depth == 0:
                out.append((start, i))
    return out


DEPT_HINT = re.compile(r"(部|課|局|庁|室|委員会)")


def split_name_section(raw: str) -> tuple[str, str, str]:
    """主な取組の欄の「取組名（所管部課）」を、名前・所管部課・後ろの注記に分ける。
    所管部課の括弧は入れ子のことがある（「クルーズ船の受入体制の構築（土木建築部港湾課（那覇港管理組合））」）。
    所管部課の後ろに小事業の一覧が続くことがある（R5 3-d-2「MICE施設の管理・運営（文化観光スポーツ部MICE推進課）①OCC保全修繕②…」）。"""
    t = clean(raw)
    for start, end in reversed(top_level_groups(t)):
        inner, rest = t[start + 1:end], t[end + 1:]
        if start > 0 and (not rest or (re.match(r"^[①-⑳]", rest) and DEPT_HINT.search(inner))):
            return t[:start], inner, re.sub(r"(?<=.)(?=[①-⑳])", "\n", rest)
        break
    return t, "", ""


def is_unreadable(pdf) -> bool:
    """文字に変換できないフォント（ToUnicode の無い埋め込みフォント）で書かれたページが半分以上か。"""
    bad = sum(1 for p in pdf.pages if (p.extract_text() or "").count("(cid:") > 20)
    return bad * 2 > len(pdf.pages)


class Parser:
    def __init__(self, year: int, src: dict):
        self.year, self.src = year, src
        self.kihon: dict[int, dict] = {}
        self.shisaku: dict[str, dict] = {}
        self.torikumi: list[dict] = []
        self.seika: list[dict] = []
        self.cur: dict | None = None
        self.tenkai: tuple[str, str] | None = None
        self.group = None
        self.pending = None
        self.seika_cols: dict | None = None
        self.section = None

    def ref(self, page_no: int) -> dict:
        return {"source": self.src["id"], "page": page_no}

    def run(self) -> None:
        with pdfplumber.open(self.src["path"]) as pdf:
            for i, page in enumerate(pdf.pages):
                raw_text = uncid(page.extract_text() or "")
                if re.search(r"\.{8,}\s*\d+\s*$", nfkc(raw_text), re.M):
                    self.read_toc(raw_text, i + 1)
                    continue
                tables = page.find_tables()
                for t in tables:
                    for row in t.extract():
                        self.read_row(row, i + 1)
                self.read_lines(page, [t.bbox for t in tables])
        self.finish()

    # -- 目次: 基本施策の名前。施策の行は丸数字（①）なので、正規化する前の数字（１）で見分ける
    def read_toc(self, text: str, page_no: int) -> None:
        for line in text.splitlines():
            if m := re.match(r"^([１-６1-6])\s+(.+?)\s*\.{4,}\s*\d+$", line.strip()):
                k = int(nfkc(m.group(1)))
                self.kihon.setdefault(k, {"id": str(k), "code": str(k), "name": nfkc(m.group(2)).strip(), **self.ref(page_no)})

    # -- 表の1行
    def read_row(self, row: list, page_no: int) -> None:
        cells = compact(row)
        if not cells:
            return
        c0 = clean(cells[0])
        if c0 == "施策展開" and len(cells) >= 3:
            code = parse_rm_code(cells[1])
            if code:
                self.tenkai = (tenkai_id(code), clean(cells[2]) if len(cells) > 2 else "")
            return
        if c0 == "施策" and len(cells) >= 3 and (code := parse_rm_code(cells[1])) and code["num"]:
            self.start_shisaku(code, clean(cells[2]), page_no)
            return
        cur = self.cur
        if not cur:
            return
        if c0 == "施策の方向" and len(cells) >= 2:
            cur["houkou"] = re.sub(r"\s*\n\s*", "", uncid(cells[1])).strip()
            return
        if c0 == "関係部等" and len(cells) >= 2:
            cur["kankei"] = clean(cells[1])
            return
        if c0 == "成果指標名":
            self.start_seika(row)
            return
        if c0 == "担当部課名":
            dept = next((clean(x) for x in cells[1:] if clean(x)), "")
            for s in self.seika:
                if s["shisaku_id"] == cur["id"] and s["year"] == self.year and "dept" not in s:
                    s["dept"] = dept
            self.seika_cols = None
            return
        if c0 == "達成状況の説明":
            self.section = "explanation"
            return
        if self.section == "explanation":
            expl = uncid(cells[0]).strip()
            for s in self.seika:
                if s["shisaku_id"] == cur["id"] and s["year"] == self.year and "explanation" not in s:
                    s["explanation"] = expl
            self.section = None
            return
        if self.seika_cols is not None:
            self.read_seika_row(row, page_no)
            return
        if c0.startswith("○"):
            self.group = c0[1:]
            return
        if re.fullmatch(r"\d+", c0) and len(cells) >= 4:
            name, section, note = split_name_section(cells[1])
            budget_raw = cell_lines(cells[2])
            self.pending = {
                "year": self.year,
                "shisaku_id": cur["id"],
                "no": int(c0),
                "name": name,
                "key": name_key(name),
                "section": section,
                "dept": dept_of(section),
                "group": self.group,
                # 改行で2つ以上の値が並ぶときは "\n" でつなぐ（budget は None。budget_of）
                "budget_raw": budget_raw,
                "budget": budget_of(budget_raw),
                "indicator": cell_lines(cells[3]),
                # 所管部課の後ろの小事業の一覧（R5 3-d-2 No.2 だけ）
                **({"name_note": note} if note else {}),
                "summary": re.sub(r"\s*\n\s*", "", uncid(cells[4])).strip() if len(cells) > 4 else "",
                **self.ref(page_no),
            }
            return
        # 取組の次の行に目標・実績・進捗状況がある
        p = self.pending
        if p and len(cells) in (3, 4) and not c0.startswith(("令和", "主な取組")):
            vals = [cell_lines(x) for x in cells]
            status = clean(cells[2])
            p.update(target=vals[0], actual=vals[1], status=status if status in STATUSES else "", status_raw=status)
            self.torikumi.append(p)
            self.pending = None

    def start_shisaku(self, code: dict, name: str, page_no: int) -> None:
        sid = f"{tenkai_id(code)}-{code['num']}"
        tid, tname = self.tenkai if self.tenkai and sid.startswith(self.tenkai[0] + "-") else (tenkai_id(code), "")
        self.cur = self.shisaku.setdefault(sid, {
            "year": self.year, "id": sid, "code": rm_code(code), "name": name,
            "kihon_id": str(code["kihon"]), "tenkai_id": tid, "tenkai_code": rm_code({**code, "num": None}),
            "tenkai_name": tname, "houkou": "", "kankei": "", **self.ref(page_no),
        })
        self.group = None
        self.pending = None
        self.seika_cols = None
        self.section = None

    # -- 成果指標の表。値の行・参照年の行・「計画値」の行・計画値の行で1組。目標値・達成率・達成状況は結合セルで、どの行に出るかが年度で違う
    def start_seika(self, header: list) -> None:
        h = [clean(x) for x in header]
        idx = {k: i for i, k in enumerate(h) if k}
        act = idx.get("実績値")
        self.seika_cols = {
            "unit": idx.get("単位"), "base": idx.get("基準値"), "act": act,
            "target": next((i for k, i in idx.items() if k.endswith("目標値")), None),
            "rate": next((i for k, i in idx.items() if k.endswith("達成率")), None),
            "judge": next((i for k, i in idx.items() if k.endswith("達成状況")), None),
        }
        self.seika_years = None

    def read_seika_row(self, row: list, page_no: int) -> None:
        c = self.seika_cols
        # 2つの値が改行で並ぶセル（「北部:B⏎西表島:B」）は "\n" を残す（cell_lines）
        cells = [cell_lines(x) if x is not None else None for x in row]
        act = c["act"]
        if act is None:
            return
        # 年度の見出し（Ｒ４ Ｒ５ Ｒ６）
        if not cells[0] and all(re.fullmatch(r"R\d+", nfkc(x or "")) for x in cells[act:act + 3]):
            self.seika_years = [nfkc(x) for x in cells[act:act + 3]]
            return
        same = self.seika and self.seika[-1]["shisaku_id"] == self.cur["id"]
        if cells[0] and same and "計画値" in (cells[act] or ""):
            # 名前が長い指標は2行目に名前の続き・単位・基準値が来る（R5 の基本施策5）
            s = self.seika[-1]
            s["name"] += re.sub(r"\s*\n\s*", "", uncid(row[0])).strip()
            s["key"] = name_key(s["name"])
            for k, col in (("unit", "unit"), ("base_raw", "base")):
                if c[col] is not None and not s[k]:
                    s[k] = cells[c[col]] or ""
            s["_plan_next"] = True
            self.fill_merged(cells)
            return
        if cells[0]:  # 新しい指標の値の行
            name = re.sub(r"\s*\n\s*", "", uncid(row[0])).strip()
            self.seika.append({
                "year": self.year, "shisaku_id": self.cur["id"], "name": name, "key": name_key(name),
                "unit": cells[c["unit"]] if c["unit"] is not None else "",
                "base_raw": cells[c["base"]] if c["base"] is not None else "",
                "years": self.seika_years or [],
                "actual_raw": [x or "" for x in cells[act:act + 3]],
                "ref_years": ["", "", ""], "plan_raw": [], "target_raw": "", "rate_raw": "", "judgement": "",
                "_plan_next": False, **self.ref(page_no),
            })
            self.fill_merged(cells)
            return
        if not self.seika or self.seika[-1]["shisaku_id"] != self.cur["id"]:
            return
        s = self.seika[-1]
        vals = [x or "" for x in cells[act:act + 3]]
        if s["_plan_next"]:
            s["plan_raw"] = vals
            s["_plan_next"] = False
        elif "計画値" in vals[0]:
            s["_plan_next"] = True
        elif not s["plan_raw"] and any(vals):
            # 実績値の下の行: 参照年（「(R5年度)」）か、実績値の続きのかっこ書き（R6 の「(177,191)」「(R8導入)」）
            for j, v in enumerate(vals):
                if re.match(r"^\(?(R|H)\d+年", nfkc(v)):
                    s["ref_years"][j] = nfkc(v).strip("()（）")
                elif re.fullmatch(r"[(（].+[)）]", v) and s["actual_raw"][j]:
                    s["actual_raw"][j] += v
        self.fill_merged(cells)

    def fill_merged(self, cells: list) -> None:
        c, s = self.seika_cols, self.seika[-1]
        # 目標値・達成率は複数の行にまたがる結合セルで、文字が行ごとに分かれて出てくる（「年間入域観」「光客数33万人以内」）ので、つなぐ
        for k, col in (("target_raw", "target"), ("rate_raw", "rate")):
            i = c[col]
            if i is not None and i < len(cells) and cells[i] and cells[i] not in ("計画値",):
                s[k] += cells[i]
        i = c["judge"]
        if i is not None and i < len(cells) and cells[i] in JUDGEMENTS and not s["judgement"]:
            s["judgement"] = cells[i]

    # -- 表の外の文章: Ⅲ 施策の推進状況の分析（Check）・Ⅳ 施策の推進戦略案（Action）
    def read_lines(self, page, bboxes) -> None:
        if not self.cur:
            return
        lines = page.extract_text_lines()
        edge = max((ln["x1"] for ln in lines), default=0)
        for ln in lines:
            cy = (ln["top"] + ln["bottom"]) / 2
            if any(b[0] - 2 <= ln["x0"] and ln["x1"] <= b[2] + 2 and b[1] - 2 <= cy <= b[3] + 2 for b in bboxes):
                continue
            text = nfkc(ln["text"]).strip()
            if re.fullmatch(r"-\s*\d+\s*-", text) or text.startswith("沖縄観光推進ロードマップPDCA"):
                continue
            # 見出しのローマ数字（Ⅲ）は NFKC で「III」になる
            if m := re.match(r"^(IV|III|II|I)\s*(?=施策|主な取組|成果指標)", text):
                self.section = {"III": "check", "IV": "action"}.get(m.group(1))
                continue
            if self.section in ("check", "action"):
                self.cur.setdefault("_lines", {}).setdefault(self.section, []).append((ln["x1"], edge, text))

    def finish(self) -> None:
        if self.pending:
            print(f"警告: 目標・実績の行が無い取組 {self.pending['name']} p{self.pending['page']}", file=sys.stderr)
        for rec in self.shisaku.values():
            lines = rec.pop("_lines", {})
            rec["check"] = join_lines(lines.get("check", []))
            rec["action"] = join_lines(lines.get("action", []))
        for s in self.seika:
            s.pop("_plan_next", None)
            # 実績値の欄に参照年が付いていることがある（「6(R4年度)」）。参照年の行（R6）と同じ形にそろえる
            for j, v in enumerate(s["actual_raw"]):
                if m := re.match(r"^(.*?)\(((?:R|H)\d+年度?)\)$", nfkc(v)):
                    s["actual_raw"][j] = m.group(1)
                    s["ref_years"][j] = s["ref_years"][j] or m.group(2)
            s.setdefault("dept", "")
            s.setdefault("explanation", "")
            # 数はかっこ書きの前の値（「3,681(177,191)」→ 3681）
            s["actual"] = [num_of(x) for x in s["actual_raw"]]
            s["plan"] = [num_of(x) for x in s["plan_raw"]]
            s["base"] = num_of(s["base_raw"])
            s["target"] = num_of(s["target_raw"])
            s["rate"] = parse_num(s["rate_raw"]) if s["rate_raw"].endswith("%") else None


def join_lines(lines: list[tuple[float, float, str]]) -> str:
    """PDFの折り返しを戻す。前の行が右端まで来ていれば続きとみなす。見出し（【】）は [ ] にそろえる（沖縄県PDCAと同じ）。"""
    out = ""
    prev_x1 = prev_edge = None
    for x1, edge, text in lines:
        if m := re.fullmatch(r"【(.+?)】", text):
            text = f"[{m.group(1)}]"
        head = re.match(r"^[・\[●○①-⑳※]", text)
        if out and prev_x1 is not None and prev_x1 >= prev_edge - 12 and not head:
            out += text
        else:
            out += ("\n" if out else "") + text
        prev_x1, prev_edge = x1, edge
    return out.strip()


# ---------------------------------------------------------------- 沖縄県PDCA との照合


def load_pdca(extracted: Path):
    tori = json.loads((extracted / "soukatsu" / "torikumi.json").read_text(encoding="utf-8"))
    seika = json.loads((extracted / "soukatsu" / "seika.json").read_text(encoding="utf-8"))
    return tori, seika


def match_pdca(rows: list[dict], tori: list[dict], seika: list[dict]) -> None:
    """同じ年度の沖縄県PDCAの主な取組・成果指標と名前で突き合わせる。
    取組は名前（key）が同じもの。無ければ名前がよく似ていて（0.85以上）決算見込額も同じもの。成果指標は名前が同じものだけ。"""
    by_year: dict[int, dict[str, list[dict]]] = {}
    for t in tori:
        by_year.setdefault(t["year"], {}).setdefault(t["key"], []).append(t)
    seika_by: dict[tuple, list[dict]] = {}
    for s in seika:
        seika_by.setdefault((s["year"], name_key(s["name"])), []).append(s)
    for r in rows:
        if "no" in r:  # 取組
            ys = by_year.get(r["year"], {})
            hits, how = ys.get(r["key"], []), "name"
            if not hits and r["budget"]:
                for k in difflib.get_close_matches(r["key"], list(ys), n=3, cutoff=0.85):
                    same = [t for t in ys[k] if t.get("budget") == r["budget"]]
                    if same:
                        hits, how = same, "similar"
                        break
            uniq = list({(t["shisaku_id"], t["key"]): t for t in hits}.values())
            r["pdca"] = [{"shisaku_id": t["shisaku_id"], "key": t["key"], "status": t.get("status", "")} for t in uniq]
            r["pdca_match"] = how if uniq else None
        else:  # 成果指標
            hits = seika_by.get((r["year"], r["key"]), [])
            r["pdca"] = [{"shisaku_id": s["shisaku_id"], "name": s["name"]} for s in hits]


# ---------------------------------------------------------------- 入出力


def find_inputs(raw: Path, manifest: dict) -> dict[int, dict]:
    out = {}
    for local_path, r in sorted(manifest.items()):
        if r.get("source") != SOURCE or not local_path.endswith(".pdf") or not r.get("referrers"):
            continue
        ref = r["referrers"][0]
        if "実施報告書" not in ref["link_text"]:
            continue
        out[r["fiscal_year"]] = {"id": local_path, "path": raw / local_path, "file_url": r["file_url"],
                                 "link_text": ref["link_text"], "page_url": ref["page_url"],
                                 "page_title": ref["page_title"], "year": r["fiscal_year"]}
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", default="data/raw")
    ap.add_argument("--extracted", default="data/extracted")
    args = ap.parse_args()
    raw, extracted = Path(args.raw), Path(args.extracted)
    out = extracted / "kanko"
    inputs = find_inputs(raw, load_manifest(raw))
    if not inputs:
        print("警告: 観光ロードマップPDCAの実施報告書が見つからない（先に make fetch）", file=sys.stderr)
        return 1

    kihon, shisaku, torikumi, seika, years, sources = {}, [], [], [], [], []
    for year, src in sorted(inputs.items()):
        sources.append({k: src[k] for k in ("id", "file_url", "link_text", "page_url", "page_title", "year")})
        with pdfplumber.open(src["path"]) as pdf:
            unreadable = is_unreadable(pdf)
        info = {"year": year, "source": src["id"], "readable": not unreadable, **EXPECTED.get(year, {})}
        if unreadable:
            info["reason"] = "本編のPDFが文字に変換できないフォントで書かれていて、表を読めない"
            print(f"{year} 本編を読めない（文字に変換できないフォント）: {src['id']}", file=sys.stderr)
            years.append(info)
            continue
        p = Parser(year, src)
        p.run()
        for k, v in p.kihon.items():
            kihon.setdefault(k, v)
        shisaku.extend(p.shisaku.values())
        torikumi.extend(p.torikumi)
        seika.extend(p.seika)
        years.append(info)
        print(f"{year} 施策 {len(p.shisaku)} / 取組 {len(p.torikumi)} / 成果指標 {len(p.seika)}", file=sys.stderr)

    tori_pdca, seika_pdca = load_pdca(extracted)
    match_pdca(torikumi, tori_pdca, seika_pdca)
    match_pdca(seika, tori_pdca, seika_pdca)

    order = lambda sid: [int(x) if x.isdigit() else x for x in sid.split("-")]
    shisaku.sort(key=lambda s: (s["year"], order(s["id"])))
    torikumi.sort(key=lambda t: (t["year"], order(t["shisaku_id"]), t["no"]))
    seika.sort(key=lambda s: (s["year"], order(s["shisaku_id"])))
    write_json(out / "kihon.json", fix_radicals_all([kihon[k] for k in sorted(kihon)]))
    write_json(out / "shisaku.json", fix_radicals_all(shisaku))
    write_json(out / "torikumi.json", fix_radicals_all(torikumi))
    write_json(out / "seika.json", fix_radicals_all(seika))
    write_json(out / "years.json", years)
    write_json(out / "sources.json", sources)
    for y in sorted({t["year"] for t in torikumi}):
        ts = [t for t in torikumi if t["year"] == y]
        matched = sum(1 for t in ts if t["pdca"])
        print(f"{y} 沖縄県PDCAと同じ取組 {matched}/{len(ts)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
