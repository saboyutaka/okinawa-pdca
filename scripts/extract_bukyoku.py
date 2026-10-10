#!/usr/bin/env python3
"""部局別の「主な取組」検証票（様式1）から、取組ごとの予算と検証の記載を取り出す。

使い方（解析用コンテナ内で実行する）:
  docker compose run --rm tools python scripts/extract_bukyoku.py
  docker compose run --rm tools python scripts/extract_bukyoku.py --year 2025 --source kikaku

入力: data/raw/<部局>/<年度>/ の PDF（総括 soukatsu 以外）。ページの中身で様式1かどうかを見分ける。
出力: data/extracted/bukyoku/
  torikumi.json         年度×取組。施策コード・取組名、予算事業ごとの金額、概要（実施主体・年度別計画）、
                        状況（活動内容・判定の根拠・前年度の改善案の反映状況）、検証（Check）、改善案（Action）
  files.json            読んだファイル（県のURL・リンク文言）と、見つけた取組の数（取得漏れ・読み取り漏れの確認用）

様式1 の「２ 取組の状況（Do）」の表は、左に「前年度の決算額・当年度の決算見込額」、右に「翌年度の当初予算額」が
並ぶ（R7の報告なら R6決算額・R7決算見込額・R8当初予算額）。1つの取組に予算事業が複数あることも、1つの予算事業に財源の行が複数あることもある。金額は千円単位。
総括報告書の取組とは、施策コード（施策展開＋施策の番号）と取組名で結び付ける（サイトのビルド時）。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
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


def read_budget(rows) -> list[dict]:
    """「予算事業名」から始まる塊を読む。財源の文字が折り返して次の行に続くことがある（「一括交付金」「（ソフト）」）。"""
    blocks = []
    i = 0
    while i < len(rows):
        c = [clean(x) for x in rows[i]]
        if not c or c[0] != "予算事業名":
            i += 1
            continue
        right = next((j for j in range(1, len(c)) if c[j] == "予算事業名"), None)
        block = {"name": c[1], "name_next": c[right + 1] if right is not None and right + 1 < len(c) else "", "rows": []}
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
                i += 1
                continue
            if any(re.match(r"^R\d+年度$", unicodedata.normalize("NFKC", x)) for x in c):
                i += 1
                continue
            if c[0] == "主な財源":
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
        for r in block["rows"]:
            r["settled"] = parse_num(r["settled_raw"])
            r["estimate"] = parse_num(r["estimate_raw"])
            r["initial"] = parse_num(r["initial_raw"])
            r["suspect"] = suspect_kinds(r)
        blocks.append(block)
    return blocks


def merge_right_only(budgets: list[dict], blk: dict) -> bool:
    """翌年度の当初予算額だけの表を、同じ予算事業名の左の表（前年度決算額・決算見込額）に合わせる。合わせられたら True。"""
    prev = next((b for b in reversed(budgets) if not b.get("right_only") and budget_key(b["name"]) == budget_key(blk["name"])
                 and not any(r["initial_raw"] for r in b["rows"])), None)
    if prev is None:
        return False
    prev["name_next"] = blk["name"]
    for i, r in enumerate(blk["rows"]):
        if i < len(prev["rows"]):
            t = prev["rows"][i]
            t.update(source_next=r["source_next"], method_next=r["method_next"], initial_raw=r["initial_raw"], initial=r["initial"])
        else:
            prev["rows"].append(r)
    for r in prev["rows"]:
        r["suspect"] = suspect_kinds(r)
    return True


def para(s: str | None) -> str:
    """表のセルの文章。PDF の折り返しの改行を戻し、「○」「・」「①」などで始まる行の前だけ改行を残す。"""
    out = ""
    for x in (uncid(s).replace("\r", "")).split("\n"):
        x = x.strip()
        if not x:
            continue
        out += ("\n" + x) if out and re.match(r"^[○・●◯〇①-⑳※\[［【]", x) else x
    return out.strip()


def read_plan(rows) -> dict:
    """１ 取組の概要（Plan）: 取組の説明、実施主体、年度別計画（活動指標と3年分の目標）、関連URL。
    年度の見出しが1つのセル（「R7 R8 R9」）のファイルと、別々のセルのファイルがある。"""
    out = {"activity": "", "actor": "", "plan": [], "plan_years": [], "url": ""}
    seq = []
    started = False
    for r in rows:
        c = [clean(x) for x in r]
        if not any(c):
            continue
        if c[0].startswith("担当部課"):
            if "関連URL" in c:
                j = c.index("関連URL")
                out["url"] = next((x for x in c[j + 1:] if x), "")
            continue
        joined = unicodedata.normalize("NFKC", " ".join(c))
        if not started:
            years = re.findall(r"R\d+", joined)
            if years and not c[0]:
                out["plan_years"] = years
                continue
            if c[0] and not c[0].startswith(("１", "主な取組")):
                out["activity"] = para(r[0])
                out["actor"] = c[2] if len(c) > 2 else ""
                started = True
            continue
        if not c[0] and len(c) > 3 and any(c[3:]):
            vals = [para(x) for x in r[3:] if clean(x)]
            seq.append(vals)
    # 取組の行のあとは「活動指標名」と「目標値の並び」が交互に続く
    for name, vals in zip(seq[0::2], seq[1::2]):
        values = vals
        if len(vals) == 1 and len(out["plan_years"]) > 1:
            parts = vals[0].split()
            if len(parts) == len(out["plan_years"]):
                values = parts
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
                state = {"sec": "skip"}  # 次の行（文章）は読んだ
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
            state = {"sec": "skip"}
            continue
        if state and state["sec"] == "skip":
            state = None
            continue
        if c[0] == "活動指標名":
            cur["indicator_name"] = c[1] if len(c) > 1 else ""
            if j + 2 < len(rows):
                hdr = [unicodedata.normalize("NFKC", clean(x)) for x in rows[j + 1]]
                val = [clean(x) for x in rows[j + 2]]
                if val and val[0] == "実績値":
                    cur["past"] = [{"year": y, "value": val[i]} for i, y in enumerate(hdr)
                                   if re.match(r"^R\d+年度$", y) and i < len(val)]
                    ai = next((i for i, y in enumerate(hdr) if y.startswith("達成割合")), None)
                    if ai is not None and ai < len(val):
                        cur["achievement"] = val[ai]
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


def read_file(args: tuple[str, str, int, str]) -> tuple[dict, list[dict]]:
    path, source, year, rel = args
    out = []
    info = {"id": rel, "source": source, "year": year, "pages": 0, "torikumi": 0, "with_budget": 0,
            "overview_failed": 0, "error": ""}
    try:
        doc = pymupdf.open(path)
        info["pages"] = doc.page_count
        texts = [pg.get_text() for pg in doc]
        cur = None
        state = None  # 前の表から続いている欄（ページをまたぐ表のため）
        carried = []
        with pdfplumber.open(path) as pdf:
            for i, page in enumerate(pdf.pages):
                t = texts[i]
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
                                   "source": rel, "page": i + 1}
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
                        cur.update(read_plan(rows))
                        continue
                    if any(clean(r[0]) == "予算事業名" for r in rows if r):
                        for blk in read_budget(rows):
                            blk["page"] = i + 1  # 予算の表があるページ（取組の見出しのページとは別のことがある）
                            if blk.pop("right_only", False) and merge_right_only(cur["budgets"], blk):
                                continue
                            cur["budgets"].append(blk)
                        cur["do_page"] = i + 1
                    state = read_status(page, tb, rows, cur, state, heads)
    except Exception as e:  # 壊れたPDFなど。件数の確認で分かるように記録して続ける
        info["error"] = f"{type(e).__name__}: {e}"
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
    with open(raw / "manifest.jsonl", encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            manifest[r["local_path"]] = r

    files, rows = [], []
    with ProcessPoolExecutor(max_workers=args.jobs) as ex:
        for info, out in ex.map(read_file, tasks):
            m = manifest.get(info["id"], {})
            ref = (m.get("referrers") or [{}])[0]
            info.update(file_url=m.get("file_url"), link_text=ref.get("link_text"),
                        page_url=ref.get("page_url"), page_title=ref.get("page_title"))
            files.append(info)
            rows.extend(out)
            print(f"{info['year']} {info['source']:16s} {info['torikumi']:3d}取組 {info['with_budget']:3d}予算 {info['id']}"
                  + (f"  ! {info['error']}" if info["error"] else ""), file=sys.stderr)

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
