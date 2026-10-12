#!/usr/bin/env python3
"""総括報告書（沖縄県PDCA実施結果）の PDF から、施策・主な取組・成果指標・主要指標を表として取り出す。

使い方（解析用コンテナ内で実行する。ホストには pdfplumber が無い）:
  docker compose run --rm tools python scripts/extract_soukatsu.py
  docker compose run --rm tools python scripts/extract_soukatsu.py --year 2025   # R7 だけ読み直して差し替える

入力: data/raw/soukatsu/<年度>/ の PDF と、data/interim/soukatsu/<年度>/ に展開した zip 内の PDF
  （先に scripts/expand_zips.py を実行しておく）。どのファイルが「将来像」「付属資料」「概要版」かは
  manifest.jsonl のリンク文言で判定する。
出力: data/extracted/soukatsu/
  shouraizou.json 将来像（年度×5）
  kihon.json     基本施策（年度×36）
  shisaku.json   施策（年度×339）。推進状況（A〜G）は施策総括表があるR5以降のみ
  torikumi.json  主な取組（年度×約1,535）
  seika.json     成果指標（年度×約390）
  shuyou.json    主要指標（付属資料の主要指標一覧。1行に複数の指標を含むことがある）
  shuyou_gaiyou.json 主要指標の達成率（概要版の「主要指標の達成状況2」の表。1指標1行。R5 は表が画像なので無い）
  sources.json   出典（ファイルID → 県のURL・リンク文言）
すべての行に出典（source: ファイルID, page: PDFのページ番号）を付ける。

対象は新・沖縄21世紀ビジョン実施計画の期間（R4〜）。それ以前は様式が違うので扱わない。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

import pdfplumber
import pymupdf

FIRST_YEAR = 2022  # 新・実施計画の初年度（R4）
STATUSES = ("順調", "概ね順調", "やや遅れ", "大幅遅れ", "未着手")
KANA = "アイウエオカキクケコサシスセソタチツテト"
# 施策総括表の「推進状況」の文言 → 県の判定区分（A〜G）。概要版「施策評価の判定基準」区分表による
JUDGE_LABELS = {
    "A": "順調",
    "B": "概ね順調",
    "C": "取組は順調だが、成果は遅れている",
    "D": "取組は概ね順調だが、成果は遅れている",
    "E": "成果は順調だが、取組は遅れている",
    "F": "成果は概ね順調だが、取組は遅れている",
    "G": "大幅遅れ",
}
SECTION_RE = re.compile(r"^(Ⅰ|Ⅱ|Ⅲ|Ⅳ)\s*")
# pdfplumber は文字に変換できないグリフ（改行やタブの記号など）を「(cid:10)」のように出す。データには残さない
CID_RE = re.compile(r"\(cid:\d+\)")
DEPT_RE = re.compile(r"^(知事公室|県警本部|警察本部|教育庁|企業局|病院事業局|.+?部)")
# 総括報告書で列幅が足りず「########」と印字された成果指標の基準値。担当部局の「成果指標」検証票には数字が印字されている
# （報告年度, 施策ID, 成果指標名）→（値, 部局票のファイルID, ページ）
BASE_FIXES = {
    (2023, "5-5-b-1", "宿泊事業者（正規雇用者）一人当たりの平均年収"):
        ("3,129,946", "bunka-kanko/2023-r05/r5seikashihyoubunsupo.pdf", 141),
    (2024, "5-5-b-1", "宿泊事業者（正規雇用者）一人当たりの平均年収"):
        ("3,129,946", "bunka-kanko/2024-r06/r6seikashihyoubunsupo.pdf", 155),
    (2025, "5-5-b-1", "宿泊事業者（正規雇用者）一人当たりの平均年収"):
        ("3,129,946", "bunka-kanko/2025-r07/r7seikashihyoubunsupo.pdf", 162),
}


# ---------------------------------------------------------------- 文字列の正規化


def uncid(s: str | None) -> str:
    """「(cid:10)」などの変換できなかったグリフを取り除く。"""
    return CID_RE.sub("", s or "")


def clean(s: str | None) -> str:
    """表のセル: 改行や空白を詰める（PDFの折り返しで入ったもの）。"""
    return re.sub(r"\s+", "", uncid(s))


# 見た目は普通の漢字だが、別の文字として PDF に入っているもの（康熙部首 U+2F00〜U+2FDF、CJK部首補助 U+2E80〜U+2EFF）。
# 例: R4 3-(11)-ウ-① の推進戦略案の「⽀援」「⼤学」（フォントが違うだけで、印字は「支援」「大学」）。
# この範囲の文字だけを NFKC で普通の漢字に直す。全角英数など他の文字は印字のまま残す（文章全体には NFKC をかけない）。
# CJK部首補助のうち NFKC で写す先の無い文字は、そのまま残る。
# なお 1-(4)-ア-⑤ の「中国第一歴史𥹥案館」の「𥹥」（U+25E65、米偏に当）は、拡大すると印字も米偏なので直さない
# （正しくは「档」（木偏）と思われるが、報告書の誤記として印字のまま持つ）。
RADICAL_RE = re.compile(r"[\u2E80-\u2EFF\u2F00-\u2FDF]")


def fix_chars(s: str) -> str:
    """康熙部首・CJK部首補助の文字を、同じ形の普通の漢字に直す。"""
    return RADICAL_RE.sub(lambda m: unicodedata.normalize("NFKC", m.group(0)), s)


def fix_strings(v):
    """出力する値（入れ子の dict・list を含む）の文字列すべてに fix_chars をかける。"""
    if isinstance(v, str):
        return fix_chars(v)
    if isinstance(v, list):
        return [fix_strings(x) for x in v]
    if isinstance(v, dict):
        return {k: fix_strings(x) for k, x in v.items()}
    return v


# 部局・課の名前の終わり
ORG_SUFFIX_RE = re.compile(r"(課|部|局|庁|室|所|センター|班|館|院|会)$")


def join_cell_lines(raw: str | None) -> str:
    """欄の中で行を分けて印字された部局・課の名前を「、」でつなぐ（関係部等・担当部課名）。

    PDF の行をそのままつなぐと「企業局土木建築部」のように区切りが消える。欄の中の改行は、PDF の文字では
    改行のほか空白になっていることがある（関係部等「企業局 土木建築部」。R4 は改行の記号が「□」で印字されている）。
    空白・改行で分けた前の部分が部局・課の名前の終わり（課・部・局…）なら「、」を入れ、そうでなければ
    欄の中での折り返しとみなしてそのままつなぐ。
    県の表では「部」の列と「課」の列を1つの欄に続けて書いたものがある
    （R4 3-(4)-ア-③ の担当部課名の印字「商工労働部／土木建築部アジア経済戦略課／港湾課」は、
    「商工労働部／土木建築部」と「アジア経済戦略課／港湾課」をつないだもの）。
    行が「部だけの行…、部＋課の行、課だけの行…」で、部と課の数が同じときは、上から順に組にする
    （→「商工労働部アジア経済戦略課、土木建築部港湾課」。同じ施策の主な取組の所管部課と一致する）。
    """
    lines = [x for x in re.split(r"\s+", uncid(raw)) if x]
    if len(lines) <= 1:
        return "".join(lines)
    # 部の列と課の列をつないだもの
    bare = 0
    while bare < len(lines) and (m := DEPT_RE.match(lines[bare])) and m.group(1) == lines[bare]:
        bare += 1
    if 0 < bare < len(lines) - 1 and (m := DEPT_RE.match(lines[bare])) and m.group(1) != lines[bare]:
        depts = lines[:bare] + [m.group(1)]
        sections = [lines[bare][len(m.group(1)):]] + lines[bare + 1:]
        if len(depts) == len(sections) and not any(DEPT_RE.match(s) for s in sections):
            return "、".join(d + s for d, s in zip(depts, sections))
    out = lines[0]
    for prev, line in zip(lines, lines[1:]):
        out += ("、" if ORG_SUFFIX_RE.search(prev) else "") + line
    return out


def parse_code(s: str) -> dict | None:
    """「１－（１）－ア－①」「1-(1)-ア」などの施策コードを分解する。"""
    t = unicodedata.normalize("NFKC", s)  # 全角数字・丸数字（①→1）・全角括弧を半角に
    t = re.sub(r"[‐－―−–—]", "-", t)
    t = re.sub(r"\s", "", t)
    m = re.match(r"^(\d)-\((\d+)\)(?:-([ア-ン]))?(?:-(\d+))?", t)
    if not m:
        return None
    s_, k, kana, n = m.groups()
    return {"shouraizou": int(s_), "kihon": int(k), "kana": kana, "num": int(n) if n else None}


def kihon_id(c: dict) -> str:
    return f"{c['shouraizou']}-{c['kihon']}"


def tenkai_id(c: dict) -> str:
    return f"{kihon_id(c)}-{chr(ord('a') + KANA.index(c['kana']))}"


def shisaku_id(c: dict) -> str:
    return f"{tenkai_id(c)}-{c['num']}"


def circled(n: int) -> str:
    return chr(0x2460 + n - 1) if 1 <= n <= 20 else f"({n})"


def shisaku_code(c: dict) -> str:
    """表示用のコード（例: 1-(1)-ア-①）。"""
    return f"{c['shouraizou']}-({c['kihon']})-{c['kana']}-{circled(c['num'])}"


def parse_num(s: str) -> float | None:
    t = unicodedata.normalize("NFKC", s or "").replace(",", "").replace("△", "-").strip()
    t = t.rstrip("%")
    try:
        return float(t)
    except ValueError:
        return None


def name_key(s: str) -> str:
    """年度をまたいで同じ取組かを見るための名前のキー（表記ゆれを少し吸収）。"""
    t = unicodedata.normalize("NFKC", s)
    return re.sub(r"[\s・･、，,。.（）()「」『』〔〕]", "", t)


def split_section(raw: str) -> tuple[str, str]:
    """「取組名(所管部課)」を名前と所管部課に分ける。名前自体に括弧を含むことがあるので最後の括弧を使う。"""
    m = re.match(r"^(.*)[(（]([^()（）]+)[)）]$", raw)
    if not m:
        return raw, ""
    return m.group(1), m.group(2)


def dept_of(section: str) -> str:
    m = DEPT_RE.match(section)
    return m.group(1) if m else ""


def judge_of(label: str) -> str | None:
    t = re.sub(r"[\s、，,。]", "", label)
    if not t:
        return None
    for k, v in JUDGE_LABELS.items():
        if t == re.sub(r"[、，,]", "", v):
            return k
    # 「成果が遅れている」など語尾の揺れ
    if t.startswith("取組は") and "成果" in t:
        return "D" if "概ね" in t else "C"
    if t.startswith("成果は") and "取組" in t:
        return "F" if "概ね" in t else "E"
    return "その他"


# ---------------------------------------------------------------- 入力ファイル


def load_manifest(raw: Path) -> dict[str, dict]:
    recs = {}
    with open(raw / "manifest.jsonl", encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            recs[r["local_path"]] = r
    return recs


def classify(link_text: str) -> str | None:
    if "将来像" in link_text:
        return "body"
    if "付属資料" in link_text or "附属資料" in link_text:
        return "fuzoku"
    if link_text.startswith("概要版"):
        return "gaiyou"
    return None


def find_inputs(raw: Path, interim: Path, manifest: dict, year: int) -> list[dict]:
    """その年度の総括報告書の本文（将来像）と付属資料を、出典情報つきで返す。"""
    out = []
    for local_path, r in sorted(manifest.items()):
        if r.get("source") != "soukatsu" or r.get("fiscal_year") != year:
            continue
        kind = classify(r["referrers"][0]["link_text"]) if r.get("referrers") else None
        if not kind:
            continue
        ref = r["referrers"][0]
        base = {"kind": kind, "file_url": r["file_url"], "link_text": ref["link_text"],
                "page_url": ref["page_url"], "page_title": ref["page_title"]}
        if local_path.endswith(".pdf"):
            out.append({**base, "id": local_path, "path": raw / local_path})
        elif local_path.endswith(".zip"):
            for pdf in sorted((interim / local_path[:-4]).glob("*.pdf")):
                out.append({**base, "id": f"{local_path}!{pdf.name}", "path": pdf, "zip_member": pdf.name})
    return out


# ---------------------------------------------------------------- 本文（将来像）


def visible_points(mpage) -> dict[int, list[tuple[float, float]]]:
    """PyMuPDF で描かれる文字の中心（y を整数に丸めた値ごと）。

    TEXT_CLIP を付けると、クリップ（Excel の箱の外）で隠れて印字されない文字は返らない。
    pdfplumber はクリップを見ないので、隠れた文字も読んでしまう
    （R5 1-(2)-ア-② の分析は、p53 の箱の下に隠れた約400字と、p54 に見えている同じ文章の両方を読んでいた）。
    """
    flags = getattr(pymupdf, "TEXT_CLIP", pymupdf.TEXT_MEDIABOX_CLIP)
    pts: dict[int, list[tuple[float, float]]] = defaultdict(list)
    for b in mpage.get_text("rawdict", flags=flags)["blocks"]:
        for ln in b.get("lines", []):
            for sp in ln["spans"]:
                for ch in sp["chars"]:
                    if ch["c"].strip():
                        x0, y0, x1, y1 = ch["bbox"]
                        pts[round((y0 + y1) / 2)].append(((x0 + x1) / 2, (y0 + y1) / 2))
    return pts


def is_visible(ln: dict, pts: dict[int, list[tuple[float, float]]]) -> bool:
    """pdfplumber の行に、描かれる文字が1つでも重なるか。下の端が箱で切れて半分だけ見える行は見えているとする。"""
    for y in range(int(ln["top"]) - 2, int(ln["bottom"]) + 3):
        for px, py in pts.get(y, ()):
            if ln["x0"] - 1 <= px <= ln["x1"] + 1 and ln["top"] - 2 <= py <= ln["bottom"] + 2:
                return True
    return False


def box_edges(page) -> tuple[float, float, float]:
    """本文の箱（Ⅲ・Ⅳの枠）から、折り返しと字下げを見分ける位置を返す（wrap_at, near_at, indent_at）。

    wrap_at: 行の右端がここまで来ていれば、箱の右端まで書いて折り返した行。
    near_at: 句点などで終わらない行は、ここまで来ていれば折り返した行とみなす（wrap_at の3文字ぶん手前）。
      英数字の続きや括弧は行をまたいで分けないので、行が右端の1〜2文字手前で折り返すことがある
      （「…全国の」「82.9％と比較…」、「…他の媒体」「（YouTube…」）。
    indent_at: 行の左端がここより右なら、全角空白で字下げした行（段落・小見出しの頭）。
    ページの幅は年度・ファイルで違う（A4 の 595pt のほか 754pt・773pt）ので、箱の縦の線から決める。
    線が見つからなければページの幅から決める。A4 では wrap_at が 544 前後になる（前は 556 − 12 に固定していて、
    幅の広いページでは段落の終わりの行も折り返しとみなし、小見出しが前の段落につながっていた）。
    """
    scale = page.width / 595.2
    xs = [e["x0"] for e in page.edges if e["orientation"] == "v" and e["bottom"] - e["top"] >= 20]
    left, right = (min(xs), max(xs)) if xs else (59 * scale, 564 * scale)
    wrap_at = right - 20 * scale
    return wrap_at, wrap_at - 3 * 8.3 * scale, left + 5 * scale


def section_lines(page, tables_bboxes, pts=None) -> list[tuple[float, float, float, str]]:
    """表の外にある本文の行（top, x0, x1, text）。ページ上端の様式名と下端のページ番号は除く。

    pts（visible_points）を渡すと、クリップで隠れて印字されない行を除く。
    """
    lines = []
    for ln in page.extract_text_lines():
        top, bottom = ln["top"], ln["bottom"]
        if top < 30 or top > page.height - 40:
            continue
        cy = (top + bottom) / 2
        if any(b[0] - 2 <= ln["x0"] and ln["x1"] <= b[2] + 2 and b[1] - 2 <= cy <= b[3] + 2 for b in tables_bboxes):
            continue
        if pts and not is_visible(ln, pts):
            continue
        lines.append((top, ln["x0"], ln["x1"], uncid(ln["text"])))
    return lines


def join_lines(lines: list[tuple], right_edge: float = 556.0) -> str:
    """PDFの折り返しを戻す。前の行が右端まで来ていれば折り返し、そうでなければ改行とみなす。

    行は (x0, x1, text) か (x0, x1, text, wrap_at, near_at, indent_at)（box_edges の値をページごとに付けたもの）。
    3つ組のときは right_edge − 12 を wrap_at にし、near_at と字下げは見ない。
    行頭が「・」「[」「【」「○」「①〜⑳」「※」の行と、字下げした行（「　外部環境の分析」などの小見出し）は必ず改行する。
    英数字どうしをつなぐときは空白を入れる（「EATS」「OKINAWA」→「EATS OKINAWA」）。
    """
    out = ""
    prev_wrapped = False
    for ln in lines:
        x0, x1, text = ln[:3]
        if len(ln) >= 6:
            wrap_at, near_at, indent_at = ln[3:6]
        else:
            wrap_at = near_at = right_edge - 12
            indent_at = None
        text = text.strip()
        if not text:
            continue
        indented = indent_at is not None and x0 >= indent_at
        if out and prev_wrapped and not indented and not re.match(r"^[・\[［【○①-⑳※]", text):
            out += (" " if re.search(r"[A-Za-z0-9]$", out) and re.match(r"[A-Za-z0-9]", text) else "") + text
        else:
            out += ("\n" if out else "") + text
        prev_wrapped = x1 >= wrap_at or (x1 >= near_at and not re.search(r"[。」）)】]$", text))
    return out.strip()


MEZASU_RE = re.compile(r"目指す姿\s*\n(.*?目\s*指\s*す\s*。)", re.S)


def read_mezasu(text: str) -> str:
    """基本施策の「目指す姿」の文章（ページのテキストから、見出しの後ろ「〜目指す。」まで）。

    文が「…島づくりを目」「指す。」のように行の途中で折り返していても読む（2-(4)・2-(5) は4年度とも、
    5-(1) は R6 がこの形で、前は読めていなかった）。
    """
    m = MEZASU_RE.search(text)
    return re.sub(r"\s+", "", m.group(1)) if m else ""


class BodyParser:
    """将来像ごとの PDF 1本を読む。施策は「様式２（施策）」のページ、推進状況は施策総括表のページから取る。"""

    def __init__(self, year: int, src: dict):
        self.year, self.src = year, src
        self.shisaku: dict[str, dict] = {}
        self.torikumi: list[dict] = []
        self.seika: list[dict] = []
        self.kihon: dict[str, dict] = {}
        self.judges: dict[str, dict] = {}

    def ref(self, page_no: int) -> dict:
        return {"source": self.src["id"], "page": page_no}

    def run(self) -> None:
        doc = pymupdf.open(self.src["path"])
        texts = [pg.get_text() for pg in doc]
        with pdfplumber.open(self.src["path"]) as pdf:
            state = {"shisaku": None, "group": None, "pending": None, "last": None, "section": None, "tenkai": None,
                     "tail": []}
            for i, page in enumerate(pdf.pages):
                if "様式２（施策）" in texts[i][:300]:
                    self.read_form2(page, i + 1, state, doc[i])
                # 施策総括表。前ページから続くページには【施策展開】の見出しが無いので、取組数の欄で見分ける
                elif "順調の割合" in texts[i] and "主な取組数" in texts[i]:
                    self.read_summary(page, i + 1, state)
                self.read_kihon(page, i + 1, texts[i])

    # -- 基本施策（基本施策総括・施策総括表の見出しにある）
    def read_kihon(self, page, page_no: int, text: str) -> None:
        found = []
        for t in page.extract_tables():
            for r in t[:1]:
                c = [clean(x) for x in r]
                if len(c) >= 3 and c[0] == "基本施策" and (code := parse_code(c[1])):
                    found.append((code, c[2]))
        # R4 は基本施策総括のページが回転していて表として読めない。テキストなら正しい順で読める
        for m in re.finditer(r"基本施策\s*\n\s*([0-9０-９]－（[0-9０-９]+）)\s*\n\s*(.+?)\s*\n\s*目指す姿", text):
            if code := parse_code(m.group(1)):
                found.append((code, m.group(2).strip()))
        mezasu = read_mezasu(text)
        for code, name in found:
            kid = kihon_id(code)
            rec = self.kihon.setdefault(kid, {"year": self.year, "id": kid, "shouraizou": code["shouraizou"],
                                              "code": f"{code['shouraizou']}-({code['kihon']})", "name": name,
                                              "mezasu": "", **self.ref(page_no)})
            if mezasu and not rec["mezasu"]:
                rec["mezasu"] = mezasu

    # -- 施策総括表（R5〜）: 推進状況の文言と、施策ごとの取組数の内訳
    def read_summary(self, page, page_no: int, state: dict) -> None:
        tables = page.find_tables()
        boxes = [(t.bbox, t.extract()) for t in tables]
        lines = page.extract_text_lines()
        tenkai_marks = []  # (top, 施策展開コード)
        for ln in lines:
            if m := re.match(r"^([0-9０-９]－（[0-9０-９]+）－[ア-ン])", ln["text"].replace(" ", "")):
                tenkai_marks.append((ln["top"], parse_code(m.group(1))))
        words = page.extract_words()
        for bbox, rows in boxes:
            if clean(rows[0][0]) != "主な取組数":
                continue
            x0, top, x1, bottom = bbox
            # 同じ段にある成果指標の表（左隣）
            left = [b for b, _ in boxes if b[2] <= x0 and b[1] < bottom and b[3] > top]
            lx = max((b[2] for b in left), default=x0 - 50)
            ind_x0 = min((b[0] for b in left), default=lx)
            label = "".join(uncid(w["text"]) for w in sorted(words, key=lambda w: (round(w["top"]), w["x0"]))
                            if lx - 2 <= w["x0"] and w["x1"] <= x0 + 2 and top - 4 <= w["top"] <= bottom + 4)
            num_words = [w["text"] for w in words if w["x1"] <= ind_x0 + 2 and top - 4 <= w["top"] <= bottom + 4]
            num = next((parse_code(f"1-(1)-ア-{w[0]}") for w in num_words if re.match(r"^[①-⑳]", w)), None)
            above = [c for t_, c in tenkai_marks if t_ < top]
            if above:
                state["tenkai"] = above[-1]
            if not (num and state["tenkai"]):
                continue
            code = {**state["tenkai"], "num": num["num"]}
            counts = {}
            if len(rows) >= 3:
                vals = [clean(x) for x in rows[2] if clean(x) != ""]
                if len(vals) == 5:
                    counts = dict(zip(STATUSES, (int(v) if v.isdigit() else None for v in vals)))
            self.judges[shisaku_id(code)] = {"label": label, "judge": judge_of(label), "counts": counts, **self.ref(page_no)}

    # -- 様式２（施策）
    def read_form2(self, page, page_no: int, state: dict, mpage=None) -> None:
        tables = page.find_tables()
        bboxes = [t.bbox for t in tables]
        # 見出し（Ⅰ〜Ⅳ）の位置で本文を区切る。クリップで隠れて印字されない行は読まない
        lines = section_lines(page, bboxes, visible_points(mpage) if mpage is not None else None)
        edges = box_edges(page)
        marks = []
        for top, x0, x1, text in lines:
            if m := SECTION_RE.match(text):
                marks.append((top, m.group(1)))
        for t in tables:
            rows = t.extract()
            first = clean(rows[0][0]) if rows and rows[0] else ""
            if first == "施策展開":
                self.start_shisaku(rows, page_no, state)
            elif first == "成果指標名":
                self.read_seika(rows, page_no, state)
            else:
                self.read_torikumi(rows, page_no, state)
            if any(clean(r[0]) in ("担当部課名", "達成状況の説明") for r in rows if r):
                self.read_seika_tail(rows, state)
        # Ⅲ・Ⅳの本文
        cur = state["shisaku"]
        if not cur:
            return
        for top, x0, x1, text in lines:
            sec = state["section"]
            hit = [s for t_, s in marks if abs(t_ - top) < 0.5]
            if hit:
                state["section"] = hit[0]
                continue
            if sec in ("Ⅲ", "Ⅳ"):
                cur.setdefault("_lines", {}).setdefault(sec, []).append((x0, x1, text, *edges))

    def start_shisaku(self, rows, page_no: int, state: dict) -> None:
        cells = {clean(r[0]): [clean(x) for x in r[1:]] for r in rows if r and r[0]}
        code = parse_code(cells.get("施策", [""])[0])
        if not code or code["num"] is None:
            print(f"警告: 施策コードを読めない {self.src['id']} p{page_no}: {cells.get('施策')}", file=sys.stderr)
            # 前の施策のままにすると、この施策の取組・成果指標・本文が前の施策に付いてしまう
            state.update(shisaku=None, group=None, pending=None, last=None, section=None, tail=[])
            return
        sid = shisaku_id(code)
        houkou = uncid(next((r[1] for r in rows if r and clean(r[0]) == "施策の方向"), "") or "")
        kankei = uncid(next((r[1] for r in rows if r and clean(r[0]) == "関係部等"), "") or "")
        # 施策の方向が長いと、続きが関係部等の欄に食い込んで読める（R5 の 3-(9)-ア-①）。句点までは施策の方向に戻す
        if "。" in kankei:
            head, kankei = kankei.rsplit("。", 1)
            houkou = houkou.rstrip() + clean(head) + "。"
        # 複数の部が欄の中で行を分けて印字されていると、つないだときに区切りが消える（R5 4-(3)-ア-②「企業局／土木建築部」）
        kankei = join_cell_lines(kankei)
        rec = {
            "year": self.year,
            "id": sid,
            "code": shisaku_code(code),
            "name": cells["施策"][1] if len(cells["施策"]) > 1 else "",
            "kihon_id": kihon_id(code),
            "tenkai_id": tenkai_id(code),
            "tenkai_name": (cells.get("施策展開") or ["", ""])[1],
            "shouraizou": code["shouraizou"],
            "kankei": kankei,
            "houkou": houkou.strip(),
            **self.ref(page_no),
        }
        self.shisaku[sid] = rec
        state.update(shisaku=rec, group=None, pending=None, last=None, section="Ⅰ", tail=[])

    def read_torikumi(self, rows, page_no: int, state: dict) -> None:
        cur = state["shisaku"]
        if not cur:
            return
        for r in rows:
            c = [clean(x) for x in r]
            if not any(c):
                continue
            if c[0].startswith("○"):
                state["group"] = c[0][1:]
                state["last"] = None
                continue
            m = re.match(r"^(\d+)(.*)$", c[0])
            if m and len(c) >= 7 and (c[1] or m.group(2)):
                name, section = split_section(m.group(2) + c[1])
                state["pending"] = {
                    "year": self.year,
                    "shisaku_id": cur["id"],
                    "no": int(m.group(1)),
                    "name": name,
                    "key": name_key(name),
                    "section": section,
                    "dept": dept_of(section),
                    "group": state["group"],
                    "budget_raw": c[2],
                    "budget": parse_num(c[2]),
                    "indicator": c[3],
                    "summary": uncid(r[6]).replace("\n", "").strip(),
                    **self.ref(page_no),
                }
                state["last"] = None
                continue
            # 取組の次の行に目標・実績・進捗状況がある。事業廃止などで進捗状況が空欄のこともある
            p = state["pending"]
            if p and len(c) >= 6 and not c[0] and (c[5] in STATUSES or c[3] or c[4]):
                p.update(target=c[3], actual=c[4], status=c[5] if c[5] in STATUSES else "", status_raw=c[5])
                self.torikumi.append(p)
                state["pending"] = None
                state["last"] = p
                continue
            # 目標・実績のセルが2行以上に分かれている取組（R4 3-(8)-ウ-① の3: 「300件・12回／空」「300件／325件」「12回／12回」）。
            # 続きの行は番号・取組名・決算見込額・進捗状況・活動概要の欄が空（上の行と結合）で、目標・実績だけがある
            last = state["last"]
            if last and len(c) >= 7 and not any(c[:3]) and not c[6] and (c[3] or c[4]) \
                    and c[5] not in STATUSES and c[5] != "進捗状況" and c[3] != "目標":
                last.setdefault("_lines", [{"target": last["target"], "actual": last["actual"]}]).append(
                    {"target": c[3], "actual": c[4]})

    def read_seika(self, rows, page_no: int, state: dict) -> None:
        """成果指標の表。見出し行・年度行・値・参照年・「計画値」・計画値の6行で1組。1施策に複数組あることがある。"""
        cur = state["shisaku"]
        if not cur:
            return
        for h, r in enumerate(rows):
            c = [clean(x) for x in r]
            if c[0] != "成果指標名" or h + 2 >= len(rows):
                continue
            idx = {k: i for i, k in enumerate(c) if k}
            col_unit, col_base = idx.get("単位"), idx.get("基準値")
            col_act = idx.get("実績値")
            col_tgt = next((i for k, i in idx.items() if k.startswith("目標値")), None)
            col_rate, col_judge = idx.get("達成率"), idx.get("達成状況")
            if None in (col_base, col_act, col_tgt):
                continue
            target_year = c[col_tgt].replace("目標値", "")
            years = [clean(x) for x in rows[h + 1][col_act:col_act + 3]]
            v = [clean(x) for x in rows[h + 2]]
            refs = [clean(x) for x in rows[h + 3][col_act:col_act + 3]] if h + 3 < len(rows) else []
            plan = [clean(x) for x in rows[h + 5][col_act:col_act + 3]] if h + 5 < len(rows) and "計画値" in clean(rows[h + 4][col_act]) else []
            # 実績値は計画期間の年度ごとに3列（R4〜R6 または R7〜R9）。まだ来ていない年度は「―」
            series = [{"year": y, "raw": a, "value": parse_num(a), "ref_year": refs[j] if j < len(refs) else ""}
                      for j, (y, a) in enumerate(zip(years, v[col_act:col_act + 3]))]
            filled = [x for x in series if x["raw"] not in ("", "―", "-", "－", "ー")]
            latest = filled[-1] if filled else {"raw": "", "value": None, "ref_year": "", "year": ""}
            base_raw, base_fix = v[col_base], {}
            if re.fullmatch(r"#+", base_raw):
                if fix := BASE_FIXES.get((self.year, cur["id"], v[0])):
                    base_fix = {"base_fix": {"printed": base_raw, "source": fix[1], "page": fix[2]}}
                    base_raw = fix[0]
                else:
                    print(f"警告: 基準値が「{base_raw}」と印字されている {self.src['id']} p{page_no}: {v[0]}", file=sys.stderr)
            self.seika.append({
                "year": self.year,
                "shisaku_id": cur["id"],
                "name": v[0],
                "unit": v[col_unit] if col_unit is not None else "",
                "base_raw": base_raw,
                "base": parse_num(base_raw),
                # 総括報告書の印字が欠けていて、部局票の値で補ったときだけ（印字・出典）
                **base_fix,
                # 実績値は「その時点の最新値」。統計の都合で前年度の値のことがあり、その場合は ref_year（例: R6年度）
                "actual_raw": latest["raw"],
                "actual": latest["value"],
                "actual_year": latest["year"],
                "actual_ref_year": latest["ref_year"],
                "actual_series": series,
                "plan_raw": plan,
                "plan": [parse_num(x) for x in plan],
                "target_raw": v[col_tgt],
                "target": parse_num(v[col_tgt]),
                "target_year": target_year,
                "rate_raw": v[col_rate] if col_rate is not None else "",
                "rate": parse_num(v[col_rate]) if col_rate is not None and v[col_rate].endswith("%") else None,
                "judgement": v[col_judge] if col_judge is not None else "",
                **self.ref(page_no),
            })

    def read_seika_tail(self, rows, state: dict) -> None:
        """成果指標の表の後ろの「担当部課名」と「達成状況の説明」。

        見出し「達成状況の説明」と本文が次のページの頭に移ることがある（R5 1-(1)-ウ-④ p44→p45 など）。
        そのときは担当部課名を読んだ成果指標を state["tail"] に残しておき、次の表で説明を付ける。
        """
        cur = state["shisaku"]
        if not cur:
            return
        dept, expl = None, None
        for j, r in enumerate(rows):
            c0 = clean(r[0])
            if c0 == "担当部課名":
                dept = join_cell_lines(next((x for x in r[1:] if clean(x)), ""))
            if c0 == "達成状況の説明" and j + 1 < len(rows):
                expl = uncid(rows[j + 1][0]).strip()
        if dept is not None:
            state["tail"] = []
            for s in self.seika:
                if s["shisaku_id"] == cur["id"] and "dept" not in s:
                    s["dept"], s["explanation"] = dept, expl or ""
                    if expl is None:
                        state["tail"].append(s)
        elif expl is not None:
            for s in state["tail"]:
                if s["shisaku_id"] == cur["id"] and not s["explanation"]:
                    s["explanation"] = expl
            state["tail"] = []

    def finish(self) -> None:
        for rec in self.shisaku.values():
            lines = rec.pop("_lines", {})
            rec["check"] = join_lines(lines.get("Ⅲ", []))
            rec["action"] = join_lines(lines.get("Ⅳ", []))
        for i, t in enumerate(self.torikumi):
            if lines := t.pop("_lines", None):
                self.torikumi[i] = with_lines(t, lines)


def with_lines(rec: dict, lines: list[dict]) -> dict:
    """目標・実績が2行以上の取組: 印字の各行を lines に入れ（空のセルは ""）、
    target・actual は空でない値を改行でつないだものにする。lines は actual の直後に置く。"""
    out = {}
    for k, v in rec.items():
        if k == "target":
            v = "\n".join(x["target"] for x in lines if x["target"])
        elif k == "actual":
            v = "\n".join(x["actual"] for x in lines if x["actual"])
        out[k] = v
        if k == "actual":
            out["lines"] = lines
    return out


# ---------------------------------------------------------------- 付属資料（主要指標一覧）


def read_fuzoku(year: int, src: dict) -> tuple[list[dict], list[dict]]:
    """主要指標一覧の行と、将来像（5つ）の名前を返す。"""
    out, names = [], []
    with pdfplumber.open(src["path"]) as pdf:
        cols = None
        shouraizou = None
        for i, page in enumerate(pdf.pages):
            for t in page.extract_tables():
                for r in t:
                    c = [clean(x) for x in r]
                    if not c or not any(c):
                        continue
                    if c[0] == "主要指標名":
                        cols = {"base": c.index("基準値"),
                                "actual": next(j for j, x in enumerate(c) if x.endswith("実績値")),
                                "target": next(j for j, x in enumerate(c) if x.endswith("目標値")),
                                "judge": next(j for j, x in enumerate(c) if x.endswith("達成状況"))}
                        continue
                    if c[0] == "成果指標名":
                        cols = None  # ここから先は成果指標一覧（本文から取るので使わない）
                        continue
                    if cols is None:
                        continue
                    if m := re.match(r"^【将来像】将来像(\S)", c[0]):
                        shouraizou = int(unicodedata.normalize("NFKC", m.group(1)))
                        name = next((x for x in c[1:] if x), "")
                        if name and shouraizou not in {n["id"] for n in names}:
                            names.append({"year": year, "id": shouraizou, "name": name, "source": src["id"], "page": i + 1})
                        continue
                    if c[0].isdigit() and shouraizou:
                        n = int(c[0])
                        out.append({
                            "year": year,
                            "kihon_id": f"{shouraizou}-{n}",
                            "name": c[1],
                            "base_raw": uncid(r[cols["base"]]).strip(),
                            "actual_raw": uncid(r[cols["actual"]]).strip(),
                            "target_raw": uncid(r[cols["target"]]).strip(),
                            "judgement": uncid(r[cols["judge"]]).strip(),
                            "source": src["id"],
                            "page": i + 1,
                        })
    return out, names


# ---------------------------------------------------------------- 概要版（主要指標の達成状況）

# 表の見出しの文字（行の目印の番号に近くても、指標の行に入れない）
GAIYOU_HEADERS = {"基本", "施策", "基本施策", "主要指標", "主要指標名", "直近の", "実績値", "直近の実績値", "目標値に", "対する", "達成率"}
DASHES = "-‐－―−–—ー"
# 達成率の欄の文字（「84%」「△21%」「100%以上」「達成」「後退」、比べられないものは「-」）
RATE_TEXT_RE = re.compile(rf"^(?:[{DASHES}△▲]?\d+(?:\.\d+)?%(?:以上)?|達成|後退|[{DASHES}])$")
# 欄の文字に付いた括弧の注（「1,042万t-CO₂（令和5年度）」の「令和5年度」）。括弧は全角・半角が混ざる
REF_RE = re.compile(r"^(.*?)\s*[（(]([^（()）]*)[)）]$")
# 1行に収まる文字の中心の距離（pt）。番号からこれより離れた文字は、指標の行の外（見出し・検証結果の枠など）
ROW_REACH = 32


def kihon_code(text: str) -> dict | None:
    """欄の文字全体が基本施策の番号（「２－（３）」「3-(10)」）なら分解した番号。"""
    c = parse_code(text)
    if not c or c["kana"] is not None:
        return None
    t = re.sub(r"\s", "", unicodedata.normalize("NFKC", text))
    t = re.sub(rf"[{DASHES}]", "-", t)
    return c if re.fullmatch(r"\d-\(\d+\)", t) else None


def split_ref(text: str) -> tuple[str, str | None]:
    """「1,032万ｔ-CO₂（R3年度）」→（「1,032万ｔ-CO₂」, 「R3年度」）。括弧の注が無ければ（文字, None）。"""
    t = text.strip()
    m = REF_RE.match(t)
    return (m.group(1).strip(), m.group(2).strip()) if m else (t, None)


def parse_rate(text: str) -> float | None:
    """達成率の印字を数にする（「-6%」→ -6、「△21%」→ -21）。「100%以上」「達成」「後退」「-」は None。"""
    t = unicodedata.normalize("NFKC", text).strip()
    m = re.fullmatch(rf"([{DASHES}△▲]?)(\d+(?:\.\d+)?)%", t)
    if not m:
        return None
    return -float(m.group(2)) if m.group(1) else float(m.group(2))


def gaiyou_rows(lines: list[dict]) -> list[dict]:
    """概要版の「主要指標の達成状況2」の1ページの文字の行（x0・y0・x1・y1・size・text）から、主要指標の行を読む。

    表は左右に並び、列は「基本施策の番号 | 主要指標の名前と（基準値→目標値）| 直近の実績値 | 目標値に対する達成率」。
    罫線や地の色の付け方が年度・表ごとに違い、表として取り出すと行が欠けたりくっついたりするので、文字の位置で読む:
    - 基本施策の番号（1-(1) など。1つの指標に1つずつある）を行の目印にし、ほかの文字は縦の中心がいちばん近い番号の行に入れる。
      番号から ROW_REACH より離れた文字・番号より左の文字（将来像の見出し・検証結果の枠）・表の見出しは使わない。
    - 列は、番号の右の文字を、達成率（右端。印字が RATE_TEXT_RE のもの）・直近の実績値（「（令和7年度）」のような
      括弧だけの行がある列）・名前の欄（それより左）に分ける。名前の欄は、名前の後ろに小さい字（R4 は同じ大きさで「→」を含む行）で
      「基準値（年度）→目標値（年度）」が続く。
    返す行は表の順（左の表から、上から順）。
    """
    def cx(l): return (l["x0"] + l["x1"]) / 2
    def cy(l): return (l["y0"] + l["y1"]) / 2

    codes = [(l, c) for l in lines if (c := kihon_code(l["text"]))]
    if not codes:
        return []
    # 番号の列（左右の表）ごとに分ける
    codes.sort(key=lambda lc: lc[0]["x0"])
    groups: list[list[tuple[dict, dict]]] = []
    for lc in codes:
        if groups and lc[0]["x0"] - groups[-1][-1][0]["x0"] < 100:
            groups[-1].append(lc)
        else:
            groups.append([lc])
    lefts = [min(l["x0"] for l, _ in g) - 5 for g in groups] + [float("inf")]

    out = []
    for gi, group in enumerate(groups):
        code_x1 = max(l["x1"] for l, _ in group)
        # 表の幅に収まる文字だけ（右の表の左にある検証結果の枠の文字は、右へはみ出すので入れない）
        cells = [l for l in lines
                 if code_x1 - 1 <= l["x0"] and l["x1"] <= lefts[gi + 1] + 2 and not kihon_code(l["text"])
                 and re.sub(r"\s", "", l["text"]) not in GAIYOU_HEADERS and not l["text"].lstrip().startswith(("（基準値", "(基準値"))]
        rate_like = [l for l in cells if RATE_TEXT_RE.match(unicodedata.normalize("NFKC", l["text"]).strip())]
        refs = [l for l in cells if re.match(r"^[（(][^→]*[)）]$", l["text"].strip())]
        if not rate_like or not refs:
            continue
        rate_cx = sorted(cx(l) for l in rate_like)[len(rate_like) // 2]
        actual_cx = sorted(cx(l) for l in refs)[len(refs) // 2]
        rows = {id(l): {"code": l, "c": c, "name": [], "actual": [], "rate": [], "mark": False} for l, c in group}
        for l in cells:
            near = min(group, key=lambda lc: abs(cy(lc[0]) - cy(l)))[0]
            if abs(cy(near) - cy(l)) > ROW_REACH:
                continue
            # 「※」だけの行は基準値・目標値の肩の小さな印（R4。統計の基準改定に基づいて試算し直した値）。文字には入れず印として持つ
            if re.fullmatch(r"\s*※+\s*", l["text"]):
                rows[id(near)]["mark"] = True
                continue
            if l in rate_like and abs(cx(l) - rate_cx) <= 25:
                col = "rate"
            elif abs(cx(l) - actual_cx) <= 30:
                col = "actual"
            else:
                col = "name"
            rows[id(near)][col].append(l)
        for r in sorted(rows.values(), key=lambda r: cy(r["code"])):
            name_lines = sorted(r["name"], key=lambda l: l["y0"])
            first = name_lines[0]["size"] if name_lines else 0
            # 名前の後ろの「基準値（年度）→目標値（年度）」は、名前より小さい字か「→」を含む行から。
            # 「→」が行の頭にあるとき（4-(4) の「△70人（R2年10月～R３年９月）」「→増加（…）」）は、その前の行の基準値から
            i = next((k for k, l in enumerate(name_lines) if "→" in l["text"] or l["size"] < first - 0.4), len(name_lines))
            if 1 < i < len(name_lines) and name_lines[i]["text"].lstrip().startswith("→") and name_lines[i]["size"] >= first - 0.4:
                i -= 1
            span = "".join(l["text"].strip() for l in name_lines[i:])
            base, _, target = span.partition("→")
            # 直近の実績値は値の行と、括弧の注の行（2行に折り返すことがある。R4 4-(4) の「(R３年10月」「～R４年９月)」）
            actual = [l["text"].strip() for l in sorted(r["actual"], key=lambda l: l["y0"])]
            k = next((j for j, t in enumerate(actual) if t.startswith(("（", "("))), len(actual))
            c = r["c"]
            out.append({
                "kihon_id": kihon_id(c),
                "code": f"{c['shouraizou']}-({c['kihon']})",
                "name": re.sub(r"\s*※+$", "", (name := "".join(l["text"].strip() for l in name_lines[:i]))),
                "revised": r["mark"] or "※" in name,
                "range": span,
                "base": split_ref(base),
                "target": split_ref(target),
                "actual_raw": "".join(actual[:k]),
                "actual_ref": split_ref("".join(actual[k:]))[1] if k < len(actual) else None,
                "rate_raw": "".join(l["text"].strip() for l in sorted(r["rate"], key=lambda l: l["y0"])),
            })
    return out


def page_lines(page) -> list[dict]:
    """PyMuPDF のページの文字の行（位置と字の大きさつき）。"""
    out = []
    for b in page.get_text("dict")["blocks"]:
        for ln in b.get("lines", []):
            text = "".join(s["text"] for s in ln["spans"])
            if text.strip():
                x0, y0, x1, y1 = ln["bbox"]
                out.append({"x0": x0, "y0": y0, "x1": x1, "y1": y1, "size": max(s["size"] for s in ln["spans"]), "text": text})
    return out


def read_gaiyou(year: int, src: dict) -> list[dict]:
    """概要版の「主要指標の達成状況2」の表から、主要指標ごとの基準値・目標値・直近の実績値・達成率を読む。

    付属資料の主要指標一覧（shuyou.json）は1行に男女別などの複数の指標をまとめていて達成率が無い。概要版は1指標1行（49指標）で、
    県がこの表の達成率で「前進・横ばい・後退・その他」を数えている。R5 の表は画像で文字が無いので、行は返らない。
    値は印字のまま持つ（rate だけ数にする）。revised は「※」の印のあるもの（統計の基準改定に基づいて試算し直した基準値・目標値。
    付属資料の基準値・目標値と違うことがある）。
    """
    out = []
    with pymupdf.open(src["path"]) as doc:
        for i, page in enumerate(doc):
            head = re.sub(r"\s", "", unicodedata.normalize("NFKC", page.get_text()))
            if "主要指標の達成状況2" not in head:
                continue
            for r in gaiyou_rows(page_lines(page)):
                if not (r["name"] and r["actual_raw"] and r["rate_raw"] and "→" in r["range"]):
                    print(f"警告: {year} 概要版 {i + 1}ページ {r['code']} の行を読み切れない: {r}", file=sys.stderr)
                out.append({
                    "year": year,
                    "no": len(out) + 1,
                    "kihon_id": r["kihon_id"],
                    "code": r["code"],
                    "name": r["name"],
                    "base_raw": r["base"][0],
                    "base_ref": r["base"][1],
                    "target_raw": r["target"][0],
                    "target_ref": r["target"][1],
                    "actual_raw": r["actual_raw"],
                    "actual_ref": r["actual_ref"],
                    "rate_raw": r["rate_raw"],
                    "rate": parse_rate(r["rate_raw"]),
                    "revised": r["revised"],
                    "source": src["id"],
                    "page": i + 1,
                })
    return out


# ---------------------------------------------------------------- 出力


def write_json(path: Path, rows: list[dict]) -> None:
    """1行1レコードの JSON 配列（差分が読みやすいように）。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("[\n")
        f.write(",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rows))
        f.write("\n]\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", default="data/raw")
    ap.add_argument("--interim", default="data/interim")
    ap.add_argument("--out", default="data/extracted/soukatsu")
    ap.add_argument("--year", type=int, action="append", help="対象年度（西暦）。省略時はR4以降の全年度")
    args = ap.parse_args()

    raw, interim, out = Path(args.raw), Path(args.interim), Path(args.out)
    manifest = load_manifest(raw)
    years = args.year or sorted({r["fiscal_year"] for r in manifest.values()
                                 if r.get("source") == "soukatsu" and (r.get("fiscal_year") or 0) >= FIRST_YEAR})

    result = defaultdict(list)
    sources = []
    for year in years:
        # 施策総括表（推進状況）と様式２（施策）が別ファイルのことがあるので、年度単位で突き合わせる
        judges: dict[str, dict] = {}
        year_shisaku: list[dict] = []
        inputs = find_inputs(raw, interim, manifest, year)
        if not inputs:
            print(f"警告: {year}年度の総括報告書が見つからない", file=sys.stderr)
            continue
        for src in inputs:
            print(f"{year} {src['kind']:6s} {src['id']}", file=sys.stderr)
            sources.append({k: src[k] for k in ("id", "file_url", "link_text", "page_url", "page_title", "kind")}
                           | {"year": year, "zip_member": src.get("zip_member")})
            if src["kind"] == "fuzoku":
                rows, names = read_fuzoku(year, src)
                result["shuyou"].extend(rows)
                result["shouraizou"].extend(names)
                continue
            if src["kind"] == "gaiyou":
                result["shuyou_gaiyou"].extend(read_gaiyou(year, src))
                continue
            p = BodyParser(year, src)
            p.run()
            p.finish()
            judges.update(p.judges)
            year_shisaku.extend(p.shisaku.values())
            result["torikumi"].extend(p.torikumi)
            result["seika"].extend(p.seika)
            result["kihon"].extend(p.kihon.values())
        for rec in year_shisaku:
            j = judges.get(rec["id"])
            rec["judge"] = j["judge"] if j else None
            rec["judge_label"] = j["label"] if j else None
            rec["summary_counts"] = j["counts"] if j else None
            rec["summary_ref"] = {"source": j["source"], "page": j["page"]} if j else None
        result["shisaku"].extend(year_shisaku)

    # 基本施策は複数のページ・ファイルに出てくるので年度×IDで1件に
    kihon = {(k["year"], k["id"]): k for k in reversed(result["kihon"])}
    result["kihon"] = sorted(kihon.values(), key=lambda k: (k["year"], k["shouraizou"], int(k["id"].split("-")[1])))
    order = lambda sid: [int(x) if x.isdigit() else x for x in sid.split("-")]
    result["shisaku"].sort(key=lambda s: (s["year"], order(s["id"])))
    result["torikumi"].sort(key=lambda t: (t["year"], order(t["shisaku_id"]), t["no"]))
    result["seika"].sort(key=lambda s: (s["year"], order(s["shisaku_id"])))

    # --year で絞ったときは、出力ファイルにある他の年度の行を残して、その年度だけ差し替える
    def merged(name: str, rows: list[dict]) -> list[dict]:
        path = out / f"{name}.json"
        if not args.year or not path.exists():
            return rows
        keep = [r for r in json.loads(path.read_text(encoding="utf-8")) if r["year"] not in years]
        return sorted(keep + rows, key=lambda r: r["year"])  # 年度内の並びは保つ（sort は安定）

    for name in ("shouraizou", "kihon", "shisaku", "torikumi", "seika", "shuyou", "shuyou_gaiyou"):
        # 康熙部首などの見た目が同じ別の文字を、普通の漢字に直す（fix_chars）
        result[name] = [fix_strings(r) for r in merged(name, result[name])]
        write_json(out / f"{name}.json", result[name])
    write_json(out / "sources.json", merged("sources", sources))
    for name in ("kihon", "shisaku", "torikumi", "seika", "shuyou", "shuyou_gaiyou"):
        counts = defaultdict(int)
        for r in result[name]:
            counts[r["year"]] += 1
        print(f"{name:9s} " + " ".join(f"{y}:{n}" for y, n in sorted(counts.items())), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
