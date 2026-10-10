#!/usr/bin/env python3
"""部局別の「主な取組」検証票（様式1）から、取組ごとの予算事業・財源・決算額・当初予算額を取り出す。

使い方（解析用コンテナ内で実行する）:
  docker compose run --rm tools python scripts/extract_bukyoku.py
  docker compose run --rm tools python scripts/extract_bukyoku.py --year 2025 --source kikaku

入力: data/raw/<部局>/<年度>/ の PDF（総括 soukatsu 以外）。ページの中身で様式1かどうかを見分ける。
出力: data/extracted/bukyoku/
  torikumi_budget.json  年度×取組。施策コード・取組名と、予算事業ごとの金額の行
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
from extract_soukatsu import FIRST_YEAR, clean, name_key, parse_code, parse_num, shisaku_id, write_json  # noqa: E402

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
            if "決算額" not in cols:
                i += 1
                continue
            nums = {k: c[j] if j < len(c) else "" for k, j in cols.items() if k in ("決算額", "決算見込額", "当初予算額")}
            src_r = c[cols["財源右"]] if "財源右" in cols and cols["財源右"] < len(c) else ""
            meth_r = c[cols["方法右"]] if "方法右" in cols and cols["方法右"] < len(c) else ""
            # 金額の無い行は、前の行の財源の続き（折り返し）
            if block["rows"] and not any(nums.values()) and not c[1] and not meth_r:
                prev = block["rows"][-1]
                prev["source"] += c[0]
                prev["source_next"] += src_r
                i += 1
                continue
            block["rows"].append({
                "source": c[0], "method": c[1], "source_next": src_r, "method_next": meth_r,
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
        with pdfplumber.open(path) as pdf:
            for i, page in enumerate(pdf.pages):
                t = texts[i]
                if "施策展開" not in t and "予算事業名" not in t:
                    continue
                for rows in page.extract_tables():
                    if not rows:
                        continue
                    if is_overview(rows):
                        ov = read_overview(rows)
                        if ov:
                            cur = {"year": year, "dept_source": source, **ov, "section": "", "budgets": [],
                                   "source": rel, "page": i + 1}
                            out.append(cur)
                        else:
                            # 見出しを読めなかった取組。前の取組のままにすると、この取組の予算が前の取組に付いてしまう
                            cur = None
                            info["overview_failed"] += 1
                    if cur is not None:
                        if not cur["section"]:
                            cur["section"] = section_of(rows)
                        if any(clean(r[0]) == "予算事業名" for r in rows if r):
                            for blk in read_budget(rows):
                                blk["page"] = i + 1  # 予算の表があるページ（取組の見出しのページとは別のことがある）
                                cur["budgets"].append(blk)
    except Exception as e:  # 壊れたPDFなど。件数の確認で分かるように記録して続ける
        info["error"] = f"{type(e).__name__}: {e}"
    info["torikumi"] = len(out)
    info["with_budget"] = sum(1 for r in out if r["budgets"])
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
    for d in sorted(p for p in raw.iterdir() if p.is_dir() and p.name != "soukatsu"):
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
        if (out / "torikumi_budget.json").exists():
            rows += [r for r in json.loads((out / "torikumi_budget.json").read_text(encoding="utf-8")) if keep(r)]
        if (out / "files.json").exists():
            files += [f for f in json.loads((out / "files.json").read_text(encoding="utf-8")) if keep(f)]
    confirm_suspects(rows)
    rows.sort(key=lambda r: (r["year"], r["shisaku_id"], r["source"], r["page"]))
    files.sort(key=lambda f: (f["year"], f["id"]))
    write_json(out / "torikumi_budget.json", rows)
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
