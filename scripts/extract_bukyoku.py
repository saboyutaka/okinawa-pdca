#!/usr/bin/env python3
"""部局別の「主な取組」検証票（様式1）から、取組ごとの予算と検証の記載を取り出す。

使い方（解析用コンテナ内で実行する）:
  docker compose run --rm tools python scripts/extract_bukyoku.py
  docker compose run --rm tools python scripts/extract_bukyoku.py --year 2025 --source kikaku

入力: data/raw/<部局>/<年度>/ の PDF（総括 soukatsu 以外）。ページの中身で様式1かどうかを見分ける。
出力: data/extracted/bukyoku/
  torikumi.json         年度×取組。施策コード・取組名、予算事業ごとの金額、概要（実施主体・年度別計画）、
                        状況（活動内容・判定の根拠・前年度の改善案の反映状況）、検証（Check）、改善案（Action）
  files.json            読んだファイル（県のURL・リンク文言）と、見つけた取組の数（取得漏れ・読み取り漏れの確認用）。
                        中身が別の年度の票のファイル（県の掲載ミス）は取組を取り込まず、content_year と note に理由を残す

様式1 の「２ 取組の状況（Do）」の表は、左に「前年度の決算額・当年度の決算見込額」、右に「翌年度の当初予算額」が
並ぶ（R7の報告なら R6決算額・R7決算見込額・R8当初予算額）。1つの取組に予算事業が複数あることも、1つの予算事業に財源の行が複数あることもある。金額は千円単位。
予算の表がページの終わりで切れ、金額の行が次のページに続く票がある（次のページの頭の文字を、前のページの見出しの列の位置で読む）。
総括報告書の取組とは、施策コード（施策展開＋施策の番号）と取組名で結び付ける（サイトのビルド時）。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import pdfplumber
import pymupdf

sys.path.insert(0, str(Path(__file__).parent))
from fetch_pdca import RELATED_SLUGS  # noqa: E402
from extract_soukatsu import FIRST_YEAR, clean, name_key, parse_code, parse_num, shisaku_id, uncid, write_json  # noqa: E402

YEAR_DIR = re.compile(r"^(\d{4})-")
# 桁の誤記の疑い: 同じ行の3つの金額のうち1つが、0でない他の金額の最大値の SUSPECT_RATIO 倍以上・SUSPECT_MIN 以上。
# 事業の終了・開始の年は他の金額が0になるので、0は比べない（比べられる金額が無ければ判定しない）。
# さらに、同じ予算事業・同じ年度の金額が他の年度の報告にあり（例: R6の決算見込額とR7の報告のR6決算額）、
# CONFIRM_RATIO 倍以内なら裏付けがあるとして疑いを外す（confirm_suspects）
SUSPECT_MIN = 1_000_000  # 千円（10億円）
SUSPECT_RATIO = 50
CONFIRM_RATIO = 10
AMOUNTS = ("settled", "estimate", "initial")
OFFSET = {"settled": -1, "estimate": 0, "initial": 1}  # 報告年度からみた金額の年度
# 予算の表の1行の欄（左: 前年度決算額・決算見込額、右: 翌年度当初予算額）
ROW_FIELDS = ("source", "method", "settled", "estimate", "source_next", "method_next", "initial")
RAW_FIELD = {"settled": "settled_raw", "estimate": "estimate_raw", "initial": "initial_raw"}

RADICALS = re.compile(r"[⺀-⻿⼀-⿟]")


def unradical(s: str) -> str:
    """康熙部首（U+2F00〜）・CJK部首補助（U+2E80〜）の字を NFKC で普通の漢字に直す（見た目が同じ別の文字）。"""
    return RADICALS.sub(lambda m: unicodedata.normalize("NFKC", m.group()), s)


def unradical_all(obj):
    """出力の1行の文字の欄すべてに unradical をかける。"""
    if isinstance(obj, str):
        return unradical(obj)
    if isinstance(obj, list):
        return [unradical_all(x) for x in obj]
    if isinstance(obj, dict):
        return {k: unradical_all(v) for k, v in obj.items()}
    return obj


def norm(s: str | None) -> str:
    """見出しの比べ方: NFKC にして空白を詰める。"""
    return re.sub(r"\s", "", unicodedata.normalize("NFKC", s or ""))


PAGE_NO = re.compile(r"[-－‐−]\d{1,3}[-－‐−]$")


def strip_page_no(s: str) -> str:
    """表の欄に重なったページ番号（「28.6%-17-」の「-17-」）を取り除く。"""
    t = PAGE_NO.sub("", s)
    return t if t else s


def content_year(texts: list[str]) -> int | None:
    """票の中身の年度（報告の対象年度）。「令和X年度活動内容」と、予算の表の「RX年度 決算見込額」の見出しで多いもの。
    県のページに前の年度の票が掲載されていることがあるので、フォルダの年度と比べる。"""
    cnt = Counter()
    for t in texts:
        s = norm(t)
        for m in re.findall(r"令和(\d+)年度活動内容", s) + re.findall(r"R(\d+)年度決算見込額", s):
            cnt[int(m) + 2018] += 1
    return cnt.most_common(1)[0][0] if cnt else None


def text_lines(chars: list[dict]) -> str:
    """文字（pdfplumber の chars）を行ごとに左から並べ、行は改行でつなぐ。"""
    lines: list[list[dict]] = []
    for ch in sorted(chars, key=lambda c: (c["top"], c["x0"])):
        if lines and abs(ch["top"] - lines[-1][0]["top"]) < 3:
            lines[-1].append(ch)
        else:
            lines.append([ch])
    return "\n".join("".join(c["text"] for c in sorted(line, key=lambda c: c["x0"])) for line in lines)


def text_runs(page) -> list[dict]:
    """ページの文字を、行ごとに間の空いたところで区切った塊（x0・x1・top・bottom・text）。見出しの位置を探すのに使う。"""
    lines: list[list[dict]] = []
    for ch in sorted(page.chars, key=lambda c: (round(c["top"], 1), c["x0"])):
        if lines and abs(ch["top"] - lines[-1][0]["top"]) < 2.5:
            lines[-1].append(ch)
        else:
            lines.append([ch])
    runs = []
    for line in lines:
        cur = []
        for ch in sorted(line, key=lambda c: c["x0"]):
            if cur and ch["x0"] - cur[-1]["x1"] > 3:
                runs.append(cur)
                cur = []
            cur.append(ch)
        if cur:
            runs.append(cur)
    return [{"x0": min(c["x0"] for c in r), "x1": max(c["x1"] for c in r), "top": min(c["top"] for c in r),
             "bottom": max(c["bottom"] for c in r), "text": norm("".join(c["text"] for c in r))} for r in runs]


def head_key(t: str) -> str | None:
    """予算の表の見出しの文字 → 欄（主な財源・実施方法は左右を区別しない）。"""
    t = norm(t)
    if not t:
        return None
    if "見込" in t and t.endswith("額"):
        return "estimate"
    if "当初" in t and t.endswith("額"):
        return "initial"
    if t.endswith("決算額"):
        return "settled"
    return {"主な財源": "source", "実施方法": "method"}.get(t)


def suspect_kinds(row: dict) -> list[str]:
    vals = {k: row[k] for k in AMOUNTS if row[k] is not None}
    out = []
    for k, v in vals.items():
        others = [x for kk, x in vals.items() if kk != k and x]
        if v >= SUSPECT_MIN and others and v >= SUSPECT_RATIO * max(others):
            out.append(k)
    return out


def budget_key(name: str) -> str:
    return re.sub(r"\s", "", unicodedata.normalize("NFKC", name or ""))


def confirm_suspects(rows: list[dict]) -> None:
    """疑いのある金額を、他の年度の報告にある同じ予算事業・同じ年度の金額と照らし合わせる。"""
    seen = {}  # (予算事業名, 金額の年度) → [(報告年度, 金額)]
    for b in rows:
        for blk in b["budgets"]:
            for r in blk["rows"]:
                for k in AMOUNTS:
                    name = budget_key(blk["name_next"] or blk["name"]) if k == "initial" else budget_key(blk["name"])
                    if r[k] and name not in ("", "ー", "―", "-", "－"):
                        seen.setdefault((name, b["year"] + OFFSET[k]), []).append((b["year"], r[k]))
    for b in rows:
        for blk in b["budgets"]:
            for r in blk["rows"]:
                kept = []
                for k in r["suspect"]:
                    name = budget_key(blk["name_next"] or blk["name"]) if k == "initial" else budget_key(blk["name"])
                    v = r[k]
                    others = [x for y, x in seen.get((name, b["year"] + OFFSET[k]), []) if y != b["year"]]
                    if any(v / CONFIRM_RATIO <= x <= v * CONFIRM_RATIO for x in others):
                        r.setdefault("suspect_cleared", []).append(k)
                    else:
                        kept.append(k)
                r["suspect"] = kept


def is_overview(rows) -> bool:
    return any(clean(x) == "施策展開" for r in rows[:3] for x in r)


def read_overview(rows) -> dict | None:
    """1ページ目の見出しの表（施策展開・施策・主な取組・対応する成果指標）。
    セルの結合のされ方がファイルによって違い、見出しと値が別の行に入ることがあるので、値の形で探す。"""
    cells = [[clean(x) for x in r] for r in rows[:6]]
    flat = [x for r in cells for x in r if x]
    tenkai = next((c for c in map(parse_code, flat) if c and c.get("kana") and c.get("num") is None), None)
    shisaku = next((x for x in flat if re.match(r"^[①-⑳]", x)), "")
    name = seika = ""
    for r in cells:
        for i, v in enumerate(r):
            if v == "主な取組" and not name:
                name = next((x for x in r[i + 1:] if x and x not in ("対応する成果指標",)), "")
            if v == "対応する成果指標" and not seika:
                seika = next((x for x in r[i + 1:] if x), "")
    if not tenkai or not shisaku or not name:
        return None
    code = {**tenkai, "num": int(unicodedata.normalize("NFKC", shisaku[0]))}
    return {"shisaku_id": shisaku_id(code), "name": name, "key": name_key(name),
            "shisaku_name": shisaku[1:], "seika_name": seika}


def cell_box(tb, i: int, j: int):
    """表の i 行目 j 列目のセルの位置（x0, top, x1, bottom）。表が無い・結合されたセルなら None。"""
    if tb is None or i >= len(tb.rows):
        return None
    cells = tb.rows[i].cells
    return cells[j] if j < len(cells) else None


def read_budget(rows, tb=None, width: float | None = None) -> list[dict]:
    """「予算事業名」から始まる塊を読む。財源の文字が折り返して次の行に続くことがある（「一括交付金」「（ソフト）」）。
    tb（pdfplumber の表）を渡すと、予算事業名のラベルの位置（_y・_x0）と見出しの列の位置（_cols）も残す。
    左右が別の表のファイルで右の表を左の表と組にする（merge_right_only）のと、金額の行が次のページに続くときに
    次のページの文字を同じ列の位置で読む（read_continuation）のに使う。_ で始まる欄は出力しない。"""
    blocks = []
    i = 0
    while i < len(rows):
        c = [clean(x) for x in rows[i]]
        if not c or c[0] != "予算事業名":
            i += 1
            continue
        right = next((j for j in range(1, len(c)) if c[j] == "予算事業名"), None)
        block = {"name": c[1], "name_next": c[right + 1] if right is not None and right + 1 < len(c) else "", "rows": []}
        lab = cell_box(tb, i, 0)
        if lab:
            block["_y"], block["_x0"] = lab[1], lab[0]
        rlab = cell_box(tb, i, right) if right is not None else None
        xr = rlab[0] if rlab else None
        heads = []  # (見出しの欄, x0, x1)。セルの位置が分かるもの
        labels = set()  # 見出しの欄（位置が分からなくても）

        def add_heads(i, c):
            for j, x in enumerate(c):
                k = head_key(x)
                if k:
                    labels.add(k)
                box = cell_box(tb, i, j) if k else None
                if box:
                    heads.append((k, box[0], box[2]))

        cols = {}
        i += 1
        while i < len(rows):
            c = [clean(x) for x in rows[i]]
            if not any(c):
                i += 1
                if block["rows"]:
                    break
                continue
            if c[0] == "予算事業名" or c[0].startswith("令和") or c[0].startswith("活動指標"):
                break
            if any(x in ("決算額", "決算見込額", "当初予算額") for x in c):
                for j, x in enumerate(c):
                    if x in ("決算額", "決算見込額", "当初予算額"):
                        cols[x] = j
                    if x == "主な財源":
                        cols.setdefault("財源右", j) if j > 1 else None
                    if x == "実施方法" and j > 1:
                        cols.setdefault("方法右", j)
                add_heads(i, c)
                i += 1
                continue
            if any(re.match(r"^R\d+年度$", unicodedata.normalize("NFKC", x)) for x in c):
                add_heads(i, c)
                i += 1
                continue
            if c[0] == "主な財源":
                add_heads(i, c)
                i += 1
                continue
            if "決算額" not in cols and "当初予算額" not in cols:
                i += 1
                continue
            nums = {k: c[j] if j < len(c) else "" for k, j in cols.items() if k in ("決算額", "決算見込額", "当初予算額")}
            if "決算額" in cols:
                src_l, meth_l = c[0], c[1] if len(c) > 1 else ""
                src_r = c[cols["財源右"]] if "財源右" in cols and cols["財源右"] < len(c) else ""
                meth_r = c[cols["方法右"]] if "方法右" in cols and cols["方法右"] < len(c) else ""
            else:
                # 翌年度の当初予算額だけの表（左右が別の表になっているファイル。merge_right_only で左の表に合わせる）
                block["right_only"] = True
                src_l, meth_l, src_r, meth_r = "", "", c[0], c[1] if len(c) > 1 else ""
            # 金額の無い行は、前の行の財源の続き（折り返し）
            if block["rows"] and not any(nums.values()) and not meth_l and not meth_r:
                prev = block["rows"][-1]
                prev["source"] += src_l
                prev["source_next"] += src_r
                i += 1
                continue
            block["rows"].append({
                "source": src_l, "method": meth_l, "source_next": src_r, "method_next": meth_r,
                "settled_raw": nums.get("決算額", ""), "estimate_raw": nums.get("決算見込額", ""), "initial_raw": nums.get("当初予算額", ""),
            })
            i += 1
        # 右だけの表: 前年度の決算額の見出しが無く、当初予算額の見出しがあるか、ページの右側にある
        # （金額の見出しが次のページに続いていて、この表には「R7年度」しか無いことがある）
        if not labels & {"settled", "estimate"} and ("initial" in labels or (width and block.get("_x0", 0) > width * 0.4)):
            block["right_only"] = True
        xs = {}
        for k, x0, x1 in heads:
            if k in ("source", "method") and (block.get("right_only") or (xr is not None and x0 >= xr - 2)):
                k += "_next"
            xs.setdefault(k, (x0, x1))
        block["_cols"] = xs
        if xr is not None:
            block["_xr"] = xr
        elif block.get("right_only") and "_x0" in block:
            block["_xr"] = block["_x0"]
        for r in block["rows"]:
            r["settled"] = parse_num(r["settled_raw"])
            r["estimate"] = parse_num(r["estimate_raw"])
            r["initial"] = parse_num(r["initial_raw"])
            r["suspect"] = suspect_kinds(r)
        blocks.append(block)
    return blocks


def merge_right_only(budgets: list[dict], blk: dict) -> bool:
    """翌年度の当初予算額だけの表を、左の表（前年度決算額・決算見込額）に合わせる。合わせられたら True。
    同じページの同じ高さにある左の表を先に探し（右の予算事業名が左と違う書き方のことがある）、無ければ同じ予算事業名の左の表。"""
    def free(b):
        return not b.get("right_only") and not any(r["initial_raw"] for r in b["rows"])

    prev = None
    if blk.get("_y") is not None:
        prev = next((b for b in reversed(budgets) if free(b) and b.get("page") == blk.get("page") and b.get("_y") is not None
                     and abs(b["_y"] - blk["_y"]) < 4 and b.get("_x0", 0) < blk.get("_x0", 0)), None)
    if prev is None:
        prev = next((b for b in reversed(budgets) if free(b) and budget_key(b["name"]) == budget_key(blk["name"])), None)
    if prev is None:
        return False
    prev["name_next"] = blk["name"]
    for k, v in blk.get("_cols", {}).items():
        prev.setdefault("_cols", {}).setdefault(k, v)
    if "_x0" in blk:
        prev["_xr"] = blk["_x0"]
    for i, r in enumerate(blk["rows"]):
        if i < len(prev["rows"]):
            t = prev["rows"][i]
            t.update(source_next=r["source_next"], method_next=r["method_next"], initial_raw=r["initial_raw"], initial=r["initial"])
        else:
            prev["rows"].append(r)
    for r in prev["rows"]:
        r["suspect"] = suspect_kinds(r)
    return True


# 次のページの頭で、予算の行の続きが終わるところの見出し
CONT_STOP = re.compile(r"^(令和\d+年度|予算事業名|活動指標名|進捗状況|\(2\)|[1-4]取組|施策展開|「主な取組」)")


def open_block(page, cur: dict | None, pageno: int) -> dict | None:
    """このページの最後の予算事業が、金額の行の前でページが終わっているか（その下に「令和X年度活動内容」が無い）。
    終わっていればその予算事業を返す（次のページの頭を read_continuation で読む）。"""
    if not cur or not cur["budgets"]:
        return None
    blk = cur["budgets"][-1]
    if blk.get("page") != pageno or blk.get("_y") is None:
        return None
    if any(r["top"] > blk["_y"] and re.match(r"^令和\d+年度活動(内容|計画)", r["text"]) for r in text_runs(page)):
        return None
    return blk


def read_continuation(page, blk: dict) -> dict | None:
    """前のページの終わりで切れた予算の表の、金額の行の続き（このページの頭、最初の見出しより上）を読む。
    列は、前のページの見出しのセルの位置と、このページの頭に続いている見出し（主な財源・決算額など）の位置で決める。
    行がページの境目で上下に切れた票は、同じ行の文字が両方のページに入っているので、このページの文字だけで読める。"""
    runs = text_runs(page)
    start = max((r["bottom"] for r in runs if r["text"].startswith("様式") and r["top"] < 60), default=0)
    stop = min((r["top"] for r in runs if r["top"] > start and CONT_STOP.match(r["text"])), default=page.height)
    xr = blk.get("_xr")
    cols = dict(blk.get("_cols", {}))
    labels = [r for r in runs if r["top"] >= start and r["bottom"] <= stop + 1
              and (head_key(r["text"]) or re.fullmatch(r"R\d+年度", r["text"]))]
    for r in labels:
        k = head_key(r["text"])
        if k in ("source", "method") and xr is not None and r["x0"] >= xr - 2:
            k += "_next"
        if k:
            cols.setdefault(k, (r["x0"], r["x1"]))
    top = max((r["bottom"] for r in labels), default=start)
    chars = [c for c in page.chars if top < (c["top"] + c["bottom"]) / 2 < stop]
    if not chars or len(cols) < 2:
        return None
    centers = sorted(((x0 + x1) / 2, k) for k, (x0, x1) in cols.items())
    got = {}
    for n, (cx, k) in enumerate(centers):
        lo = (centers[n - 1][0] + cx) / 2 if n else cx - (centers[1][0] - cx) / 2
        hi = (cx + centers[n + 1][0]) / 2 if n + 1 < len(centers) else cx + (cx - centers[n - 1][0]) / 2
        cs = [c for c in chars if lo <= (c["x0"] + c["x1"]) / 2 < hi]
        if cs:
            got[k] = clean(text_lines(cs))
    return got if any(got.get(k) for k in ("settled", "estimate", "initial", "source", "source_next")) else None


def fill_continuation(blk: dict, got: dict) -> None:
    """read_continuation で読んだ値を、予算事業の金額の行に入れる。前のページで読めた値は、続きの値がそれを含むときだけ置き換える
    （「一括交付金」→「一括交付金（ソフト）」）。"""
    if not blk["rows"]:
        blk["rows"].append({"source": "", "method": "", "source_next": "", "method_next": "",
                            "settled_raw": "", "estimate_raw": "", "initial_raw": ""})
    row = blk["rows"][-1]
    for k in ROW_FIELDS:
        f = RAW_FIELD.get(k, k)
        v = got.get(k, "")
        if v and (not row[f] or row[f] in v):
            row[f] = v
    for k in AMOUNTS:
        row[k] = parse_num(row[RAW_FIELD[k]])
    row["suspect"] = suspect_kinds(row)


def para(s: str | None) -> str:
    """表のセルの文章。PDF の折り返しの改行を戻し、「○」「・」「①」などで始まる行の前だけ改行を残す。"""
    out = ""
    for x in (uncid(s).replace("\r", "")).split("\n"):
        x = x.strip()
        if not x:
            continue
        out += ("\n" + x) if out and re.match(r"^[○・●◯〇①-⑳※\[［【]", x) else x
    return out.strip()


def split_by_years(page, tb, years_row: int, j: int, n: int) -> list[str] | None:
    """年度別計画の値の行（j 行目）を、年度の見出し（「R4」「R5」「R6」）の位置で年度ごとに分けて読む。
    年度の間の点線が表の線として取れず、3年分が1つのセルに混ざって取れることがあるため。分けられなければ None。"""
    if tb is None or years_row >= len(tb.rows) or j >= len(tb.rows):
        return None
    _, ytop, _, ybot = tb.rows[years_row].bbox
    cents = sorted((c["x0"] + c["x1"]) / 2 for c in text_runs(page)
                   if ytop - 1 <= (c["top"] + c["bottom"]) / 2 <= ybot + 1 and re.fullmatch(r"R\d+", c["text"]))
    if len(cents) != n or n < 2:
        return None
    _, top, _, bottom = tb.rows[j].bbox
    chars = [c for c in page.chars if top <= (c["top"] + c["bottom"]) / 2 <= bottom]
    out = []
    for k, cx in enumerate(cents):
        lo = (cents[k - 1] + cx) / 2 if k else cx - (cents[1] - cx) / 2
        hi = (cx + cents[k + 1]) / 2 if k + 1 < n else cx + (cx - cents[k - 1]) / 2
        out.append(para(text_lines([c for c in chars if lo <= (c["x0"] + c["x1"]) / 2 < hi])))
    return out if any(out) else None


def read_plan(rows, page=None, tb=None) -> dict:
    """１ 取組の概要（Plan）: 取組の説明、実施主体、年度別計画（活動指標と3年分の目標）、関連URL。
    年度の見出しが1つのセル（「R7 R8 R9」）のファイルと、別々のセルのファイルがある。
    3年分の値が1つのセルに混ざって取れたときは、page と tb があれば年度の見出しの位置で分ける（split_by_years）。"""
    out = {"activity": "", "actor": "", "plan": [], "plan_years": [], "url": ""}
    seq = []
    started = False
    years_row = None
    for j, r in enumerate(rows):
        c = [clean(x) for x in r]
        if not any(c):
            continue
        if c[0].startswith("担当部課"):
            if "関連URL" in c:
                k = c.index("関連URL")
                out["url"] = next((x for x in c[k + 1:] if x), "")
            continue
        joined = unicodedata.normalize("NFKC", " ".join(c))
        if not started:
            years = re.findall(r"R\d+", joined)
            if years and not c[0]:
                out["plan_years"] = years
                years_row = j
                continue
            # 見出しの行（「１ 取組の概要（Plan）」「主な取組（アクティビティ）」）。取組の説明が「１ 県公用車を…」のように
            # 数字で始まることがあるので、「１」だけでは見出しと決めない
            if c[0] and not norm(c[0]).startswith(("1取組", "主な取組")):
                out["activity"] = para(r[0])
                out["actor"] = c[2] if len(c) > 2 else ""
                started = True
            continue
        if not c[0] and len(c) > 3 and any(c[3:]):
            vals = [para(x) for x in r[3:] if clean(x)]
            seq.append((j, vals))
    # 取組の行のあとは「活動指標名」と「目標値の並び」が交互に続く
    n = len(out["plan_years"])
    for (_, name), (j, vals) in zip(seq[0::2], seq[1::2]):
        values = vals
        if len(vals) == 1 and n > 1:
            parts = vals[0].split()
            if len(parts) == n:
                values = parts
        if len(values) != n and years_row is not None and page is not None:
            values = split_by_years(page, tb, years_row, j, n) or values
        out["plan"].append({"indicator": " ".join(name), "values": values})
    return out


def cell_text(page, tb, j: int, x0: float | None = None, x1: float | None = None) -> str | None:
    """表の j 行目の先頭のセルの文字を、横の範囲（x0〜x1）で切り出して読む。
    「活動内容」と「活動計画」のように、2列の文章が1つのセルとして取れてしまう表のため。"""
    if j >= len(tb.rows) or not tb.rows[j].cells or not tb.rows[j].cells[0]:
        return None
    cx0, top, cx1, bottom = tb.rows[j].cells[0]
    cx1 = max(c[2] for c in tb.rows[j].cells if c)
    box = (max(cx0, x0 or cx0), top, min(cx1, x1 or cx1), bottom)
    if box[2] <= box[0]:
        return ""
    return page.within_bbox(box).extract_text() or ""


NEW_ITEM = re.compile(r"^[○・●◯〇①-⑳※]")


def read_activity(page, tb, rows, j: int, k: int | None, split: float | None, cur: dict) -> None:
    """「活動内容」と「活動計画」の文章の行（j 行目）。2列が1つのセルとして取れることがあるので、見出しの列の位置で左右に切る。
    予算事業が複数ある取組は、予算事業ごとにこの欄があるのでつなげる。"""
    r = rows[j]
    left = cell_text(page, tb, j, x1=split) if split else None
    right = cell_text(page, tb, j, x0=split) if split else None
    done = para(left if left is not None else r[0])
    plan = para(right) if right is not None else para(r[k]) if k is not None and k < len(r) else ""
    for key, v in (("activity_done", done), ("activity_next", plan)):
        if v and v not in cur[key]:
            cur[key] += ("\n" if cur[key] else "") + v


def section_heads(page) -> list[tuple[float, float, str]]:
    """ページ内の「３ 取組の検証」「４ 取組の改善案」の見出しの位置（上端・左端）。
    見出しが表の外の文字になっているファイルや、Check と Action の表が左右に並ぶファイルがある。"""
    heads = [(m["top"], m["x0"], "check") for m in page.search("取組の検証")]
    heads += [(m["top"], m["x0"], "action") for m in page.search("取組の改善案")]
    return sorted(heads)


def read_indicator_values(ind: dict, hdr: list[str] | None, val: list[str]) -> bool:
    """活動指標の表の、年度の見出しの行（hdr）と実績値の行（val）から、過去2年の実績と達成割合を ind に入れる。
    「実績値」の見出しが値の行にあるファイルと、年度の見出しの行にあるファイルがある。"""
    if not val or not hdr or not (val[0] == "実績値" or (hdr[0] == "実績値" and not val[0])):
        return False
    ind["past"] = [{"year": y, "value": strip_page_no(val[i])} for i, y in enumerate(hdr)
                   if re.match(r"^R\d+年度$", y) and i < len(val)]
    ai = next((i for i, y in enumerate(hdr) if y.startswith("達成割合")), None)
    if ai is not None and ai < len(val):
        ind["achievement"] = strip_page_no(val[ai])
    return True


def read_status(page, tb, rows, cur: dict, state: dict | None, heads: list[tuple[float, float, str]]) -> dict | None:
    """２ 取組の状況（Do）の予算以外と、３ 取組の検証（Check）・４ 取組の改善案（Action）。
    活動内容・翌年度の活動計画・活動指標の過去の実績・判定の根拠・前年度の改善案の反映状況・類型と内容。
    表がページをまたぐと、続きは見出しの無い表になる。state は前の表から続いている欄（戻り値で次の表へ渡す）。"""
    xs = (state or {}).get("x", {})
    if state and state["sec"] in ("check", "action") and len(xs) == 2 and abs(xs["check"] - xs["action"]) > 50:
        # Check と Action の表が左右に並んだまま次のページに続くときは、表の横の位置でどちらの続きかを決める
        state = {**state, "sec": min(xs, key=lambda k: abs(xs[k] - tb.bbox[0]))}

    def typed(sec):
        return {"sec": sec, "x": {**(state or {}).get("x", {}), sec: tb.bbox[0]}}

    for j, r in enumerate(rows):
        c = [clean(x) for x in r]
        if not c or not any(c):
            continue
        h = unicodedata.normalize("NFKC", c[0])
        if re.match(r"^令和\d+年度活動内容$", c[0]):
            k = next((i for i, x in enumerate(c) if x.endswith("年度活動計画")), None)
            cells = tb.rows[j].cells if j < len(tb.rows) else []
            split = cells[k][0] if k is not None and k < len(cells) and cells[k] else None
            if j + 1 < len(rows):
                read_activity(page, tb, rows, j + 1, k, split, cur)
                state = {"sec": "skip", "row": j + 1, "tb": id(tb)}  # 次の行（文章）は読んだ
            else:
                state = {"sec": "activity", "k": k, "split": split}  # 文章は次のページの表の1行目
            continue
        if state and state["sec"] == "activity":
            read_activity(page, tb, rows, j, state["k"], state["split"], cur)
            state = None
            continue
        if re.match(r"^令和\d+年度活動計画$", c[0]):
            # 当初予算額の表と一緒に、活動計画だけが別の表になっているファイル
            v = para(rows[j + 1][0]) if j + 1 < len(rows) else ""
            if v and v not in cur["activity_next"]:
                cur["activity_next"] += ("\n" if cur["activity_next"] else "") + v
            state = {"sec": "skip", "row": j + 1, "tb": id(tb)}
            continue
        if state and state["sec"] == "skip":
            # 読んだ文章の行だけを飛ばす。文章の欄が空のときは、その次の行（活動指標名など）を飛ばさない
            skip = state.get("tb") == id(tb) and state.get("row") == j
            state = None
            if skip:
                continue
        if state and state["sec"] == "indicator":
            # 前のページの終わりで切れた活動指標の表の続き（年度の見出しの行、または実績値の行）。違う行ならそのまま読む
            ind, hdr = state["ind"], state["hdr"]
            if state.get("tb") == id(tb) and j <= state["row"]:
                continue  # 同じ表の年度の見出しの行（読んだ）
            nh = [unicodedata.normalize("NFKC", x) for x in c]
            if hdr is None and any(re.match(r"^R\d+年度$", y) for y in nh):
                state["hdr"] = nh
                continue
            state = None
            if hdr is not None and read_indicator_values(ind, hdr, c):
                continue
        if c[0] == "活動指標名":
            # 活動指標の表が2つ以上ある取組がある（印字の順に _indicators にためて、read_file で最初の表を代表にする）
            ind = {"name": c[1] if len(c) > 1 else "", "past": [], "achievement": ""}
            cur["_indicators"].append(ind)
            hdr = [unicodedata.normalize("NFKC", clean(x)) for x in rows[j + 1]] if j + 1 < len(rows) else None
            if j + 2 < len(rows) and read_indicator_values(ind, hdr, [clean(x) for x in rows[j + 2]]):
                state = None
            elif not any(clean(x) for r2 in rows[j + 2:] for x in r2):
                state = {"sec": "indicator", "ind": ind, "hdr": hdr, "tb": id(tb), "row": j + 1}  # 値の行は次のページの表の頭
            else:
                state = None
            continue
        if c[0].startswith("進捗状況の判定根拠"):
            state = {"sec": "basis"}
            continue
        if re.match(r"^\(2\)", h) or h.startswith(("2取組の状況", "(1)取組の進捗状況")):
            state = None
            continue
        if re.match(r"^令和\d+年度の取組改善案$", c[0]):
            k = next((i for i, x in enumerate(c) if x == "反映状況"), None)
            state = {"sec": "improvements", "k": k if k is not None else len(c) - 1}
            continue
        if h.startswith("3取組の検証"):
            state = typed("check")
            cur["check_page"] = page.page_number
            continue
        if h.startswith("4取組の改善案"):
            state = typed("action")
            continue
        if c[0] == "類型":
            # 「類型・内容」の表の見出し。Check か Action かは、表の上にある一番近い見出しで決める（左右に並ぶ表は同じ列の見出し）
            top = tb.rows[j].bbox[1] if j < len(tb.rows) else tb.bbox[1]
            above = [sec for y, x, sec in heads if y < top and tb.bbox[0] - 20 <= x <= tb.bbox[2]]
            if above:
                state = typed(above[-1])
            elif not (state and state["sec"] in ("check", "action")):
                state = typed("action" if cur["check"] else "check")
            if state["sec"] == "check" and not cur.get("check_page"):
                cur["check_page"] = page.page_number
            continue
        if state is None:
            continue
        sec = state["sec"]
        if sec == "basis":
            t = para(r[0])
            cur["basis"] += ("\n" if cur["basis"] and NEW_ITEM.match(t) else "") + t
        elif sec == "improvements":
            k = state["k"] if state["k"] < len(r) else len(r) - 1
            plan, result = para(r[0]), para(r[k]) if k > 0 else ""
            items = cur["improvements"]
            if not (plan or result):
                continue
            # ページをまたいで1つの欄が切れたときは、続きの行が「○」などで始まらない
            if items and not NEW_ITEM.match(plan or "○") and not NEW_ITEM.match(result or "○"):
                items[-1]["plan"] += plan
                items[-1]["result"] += result
            else:
                items.append({"plan": plan, "result": result})
        elif sec in ("check", "action"):
            if len(c) < 2:
                continue
            items = cur[sec]
            if not c[0] and items:
                items[-1]["text"] += para(r[1])
            elif c[0] or c[1]:
                items.append({"type": c[0], "text": para(r[1])})
    return state


def section_of(rows) -> str:
    for r in rows:
        c = [clean(x) for x in r]
        if c and c[0].startswith("担当部課"):
            v = next((x for x in c[1:] if x), "")
            return re.sub(r"【.*$", "", v)
    return ""


def finish(rec: dict) -> dict:
    """1取組の読み終わり: 活動指標の表（印字の順）の最初の表を indicator_name・past・achievement に入れ、
    2つ以上あれば indicators に全部を残す。予算事業の作業用の欄（_ で始まるもの・right_only）を消す。"""
    inds = rec.pop("_indicators", [])
    if inds:
        rec["indicator_name"], rec["past"], rec["achievement"] = inds[0]["name"], inds[0]["past"], inds[0]["achievement"]
    if len(inds) > 1:
        rec["indicators"] = inds
    for blk in rec["budgets"]:
        for k in [k for k in blk if k.startswith("_") or k == "right_only"]:
            del blk[k]
    return unradical_all(rec)


def read_file(args: tuple[str, str, int, str]) -> tuple[dict, list[dict]]:
    path, source, year, rel = args
    out = []
    info = {"id": rel, "source": source, "year": year, "pages": 0, "torikumi": 0, "with_budget": 0,
            "overview_failed": 0, "error": ""}
    try:
        doc = pymupdf.open(path)
        info["pages"] = doc.page_count
        texts = [pg.get_text() for pg in doc]
        cy = content_year(texts)
        if cy and cy != year:
            # 県のページに別の年度の票が掲載されている（同じファイルの再掲など）。その年度の票としては取り込まない
            info["content_year"] = cy
            info["note"] = (f"県のページに{'前' if cy < year else '別'}の年度（R{cy - 2018}）の票が掲載されている"
                            f"（予算の表の年度の見出しと「令和{cy - 2018}年度活動内容」）。この年度の票としては取り込まない。")
            return info, out
        cur = None
        state = None  # 前の表から続いている欄（ページをまたぐ表のため）
        carried = []
        pending = None  # 前のページの終わりで金額の行の前に切れた予算事業（次のページの頭に続きがある）
        with pdfplumber.open(path) as pdf:
            for i, page in enumerate(pdf.pages):
                t = texts[i]
                if pending is not None:
                    got = read_continuation(page, pending)
                    if got:
                        fill_continuation(pending, got)
                    pending = None
                if not any(k in t for k in ("施策展開", "予算事業名", "活動内容", "活動計画", "判定根拠", "改善案", "取組の検証")) and state is None:
                    continue
                # 前のページの一番下に見出しだけがあり、表が次のページから始まることがある（見出しを持ち越す）
                heads = carried + section_heads(page)
                tables = page.find_tables()
                bottom = max((tb.bbox[3] for tb in tables), default=0)
                carried = [(-1, x, sec) for y, x, sec in heads if y > bottom]
                for tb in tables:
                    rows = tb.extract()
                    if not rows:
                        continue
                    first = clean(rows[0][0])
                    if is_overview(rows):
                        state = None
                        ov = read_overview(rows)
                        if ov:
                            cur = {"year": year, "dept_source": source, **ov, "section": "", "budgets": [],
                                   "activity": "", "actor": "", "plan": [], "plan_years": [], "url": "",
                                   "activity_done": "", "activity_next": "", "indicator_name": "", "past": [],
                                   "achievement": "", "basis": "", "improvements": [], "check": [], "action": [],
                                   "source": rel, "page": i + 1, "_indicators": []}
                            out.append(cur)
                        else:
                            # 見出しを読めなかった取組。前の取組のままにすると、この取組の予算が前の取組に付いてしまう
                            cur = None
                            info["overview_failed"] += 1
                    if cur is None:
                        continue
                    if not cur["section"]:
                        cur["section"] = section_of(rows)
                    if first.startswith("１取組の概要"):
                        cur.update(read_plan(rows, page, tb))
                        continue
                    if any(clean(r[0]) == "予算事業名" for r in rows if r):
                        for blk in read_budget(rows, tb, page.width):
                            blk["page"] = i + 1  # 予算の表があるページ（取組の見出しのページとは別のことがある）
                            if blk.get("right_only") and merge_right_only(cur["budgets"], blk):
                                continue
                            cur["budgets"].append(blk)
                        cur["do_page"] = i + 1
                    state = read_status(page, tb, rows, cur, state, heads)
                pending = open_block(page, cur, i + 1)
    except Exception as e:  # 壊れたPDFなど。件数の確認で分かるように記録して続ける
        info["error"] = f"{type(e).__name__}: {e}"
    out = [finish(r) for r in out]
    info["torikumi"] = len(out)
    info["with_budget"] = sum(1 for r in out if r["budgets"])
    info["with_check"] = sum(1 for r in out if r["check"])
    return info, out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", default="data/raw")
    ap.add_argument("--out", default="data/extracted/bukyoku")
    ap.add_argument("--year", type=int, action="append")
    ap.add_argument("--source", action="append")
    ap.add_argument("--jobs", type=int, default=4)
    args = ap.parse_args()

    raw = Path(args.raw)
    tasks = []
    # 総括報告書と、沖縄県PDCA 以外の評価（観光ロードマップ・一括交付金の事後評価・評価検証報告書）は部局票ではない
    for d in sorted(p for p in raw.iterdir() if p.is_dir() and p.name not in {"soukatsu", *RELATED_SLUGS}):
        if args.source and d.name not in args.source:
            continue
        for ydir in sorted(d.iterdir()):
            m = YEAR_DIR.match(ydir.name)
            if not m or int(m.group(1)) < FIRST_YEAR or (args.year and int(m.group(1)) not in args.year):
                continue
            for pdf in sorted(ydir.glob("*.pdf")):
                tasks.append((str(pdf), d.name, int(m.group(1)), str(pdf.relative_to(raw))))

    manifest = {}
    by_sha = {}  # 中身（SHA-256）→ 取得したファイル（別の年度のページに同じファイルが掲載されているのを見つける）
    with open(raw / "manifest.jsonl", encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            manifest[r["local_path"]] = r
            if r.get("sha256"):
                by_sha.setdefault(r["sha256"], []).append(r["local_path"])

    files, rows = [], []
    with ProcessPoolExecutor(max_workers=args.jobs) as ex:
        for info, out in ex.map(read_file, tasks):
            m = manifest.get(info["id"], {})
            ref = (m.get("referrers") or [{}])[0]
            info.update(file_url=m.get("file_url"), link_text=ref.get("link_text"),
                        page_url=ref.get("page_url"), page_title=ref.get("page_title"))
            if info.get("note"):
                same = [x for x in by_sha.get(m.get("sha256"), []) if x != info["id"] and (raw / x).exists()]
                if same:
                    info["note"] += "".join(f"data/raw/{x} と同じファイル。" for x in sorted(same))
            files.append(info)
            rows.extend(out)
            print(f"{info['year']} {info['source']:16s} {info['torikumi']:3d}取組 {info['with_budget']:3d}予算 {info['id']}"
                  + (f"  ! {info['error']}" if info["error"] else "") + (f"  ! {info['note']}" if info.get("note") else ""),
                  file=sys.stderr)

    out = Path(args.out)
    # --year・--source で絞ったときは、出力ファイルにある他の年度・取得元の行を残して差し替える
    if args.year or args.source:
        def keep(r):
            return not ((not args.year or r["year"] in args.year)
                        and (not args.source or (r.get("dept_source") or r.get("source")) in args.source))
        if (out / "torikumi.json").exists():
            rows += [r for r in json.loads((out / "torikumi.json").read_text(encoding="utf-8")) if keep(r)]
        if (out / "files.json").exists():
            files += [f for f in json.loads((out / "files.json").read_text(encoding="utf-8")) if keep(f)]
    confirm_suspects(rows)
    rows.sort(key=lambda r: (r["year"], r["shisaku_id"], r["source"], r["page"]))
    files.sort(key=lambda f: (f["year"], f["id"]))
    write_json(out / "torikumi.json", rows)
    write_json(out / "files.json", files)
    by_year = {}
    for r in rows:
        by_year.setdefault(r["year"], [0, 0])
        by_year[r["year"]][0] += 1
        by_year[r["year"]][1] += bool(r["budgets"])
    for y, (n, b) in sorted(by_year.items()):
        print(f"{y}: 取組 {n}（予算の表あり {b}）", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
