#!/usr/bin/env python3
"""沖縄振興特別推進交付金（ソフトの一括交付金）の事後評価から、事業ごとの成果目標の達成状況と予算の執行を取り出す。

使い方（解析用コンテナ内で実行する）:
  docker compose run --rm tools python scripts/extract_ikkatsu.py

入力: data/raw/ikkatsu/<年度>/
  総括表（「総括表」のリンク）: 事業ごとの成果目標（目標・実績）、評価（◎○△未）、達成率、計画期間、事業概要
  検証シート（基本施策ごとのファイル）: 新・沖縄21世紀ビジョン基本計画の施策コード、担当部課、予算・執行額、今後の取り組み方針
  繰越事業・事業完了後の検証（後年度効果発現事業）のファイルは読まない（docs/data.md 12章）
出力: data/extracted/ikkatsu/
  jigyo.json    事業（年度×約180）。総括表と検証シートを年度と事業番号で結び付ける
  sources.json  出典（ファイルID → 県のURL・リンク文言）
すべての行に出典（source・page: 総括表、sheet_source・sheet_page: 検証シート）を付ける。

施策コードは検証シートの「1-⑴-ｱ-①」「第４章－１－（１）－ア－①」を、沖縄県PDCA と同じ施策ID（1-1-a-1）にする。
金額は千円。予算は評価の年度の列（「R6年度」。繰越の列ではない）の値。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

import pdfplumber

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_soukatsu import KANA, load_manifest, name_key, parse_code, parse_num, shisaku_id, uncid, write_json  # noqa: E402

SOURCE = "ikkatsu"
GRADES = {"◎": "達成", "○": "概ね達成", "△": "一部達成", "未": "未達成"}


def nfkc(s: str | None) -> str:
    t = unicodedata.normalize("NFKC", uncid(s))
    return re.sub(r"[‐－―−–—]", "-", t)


def flat(s: str | None) -> str:
    """セルの中の改行（PDFの折り返し）を詰める。"""
    return re.sub(r"\s*\n\s*", "", uncid(s)).strip()


def wareki(year: int) -> str:
    return f"R{year - 2018}"


# ---------------------------------------------------------------- 総括表（個別事業の一覧）


def header_cols(row: list) -> dict | None:
    """総括表の見出しの行から列の位置を決める。R4 は成果目標と成果実績が文で1列ずつ、R5〜 は成果目標・目標・実績の3列。"""
    cells = [flat(x) for x in row]
    no = next((i for i, x in enumerate(cells) if x == "事業番号"), None)
    if no is None:
        return None
    find = lambda f: next((i for i, x in enumerate(cells) if f(x)), None)
    return {
        "no": no, "name": find(lambda x: x.endswith("名称")), "period": find(lambda x: x == "計画期間"),
        "overview": find(lambda x: x.startswith("事業概要")), "target_name": find(lambda x: "成果目標" in x),
        "target": None, "actual": find(lambda x: "成果実績" in x),
        "grade": find(lambda x: x == "評価"), "rate": find(lambda x: x == "達成率"),
    }


def split_circled(s: str) -> list[str]:
    """「①A②B」を [A, B] に分ける。丸数字が無ければそのまま。"""
    parts = [x for x in re.split(r"[①-⑳]", s) if x.strip()]
    return parts if re.search(r"[①-⑳]", s) else ([s] if s else [])


def read_soukatsu(year: int, src: dict) -> list[dict]:
    """「令和N年度事業評価結果個別事業」の表。事業番号のある行から次の事業番号までが1事業（成果目標が複数行）。
    評価・達成率は結合セルで、事業の最後の行に出ることがある（R4）。前年度の繰越事業・事業完了後の検証の章に入ったら終わる。"""
    out: list[dict] = []
    cur = None
    cols = None
    started = False
    heading = re.compile(r"令和\s*(\d+|元)\s*年度事業の評価結果について")
    with pdfplumber.open(src["path"]) as pdf:
        for i, page in enumerate(pdf.pages):
            text = nfkc(page.extract_text() or "")
            if started:
                m = heading.search(text)
                if (m and int(m.group(1)) + 2018 != year) or "事業完了後" in text[:200]:
                    break
            for t in page.extract_tables():
                for row in t:
                    if h := header_cols(row):
                        cols = h
                        continue
                    cells = [flat(x) for x in row]
                    if cols is None:
                        continue
                    # R5〜 は見出しの下に「成果目標（指標）・目標・実績」の行がある
                    if "目標" in cells and "実績" in cells:
                        cols["target"], cols["actual"] = cells.index("目標"), cells.index("実績")
                        continue
                    get = lambda k: cells[cols[k]] if cols.get(k) is not None and cols[k] < len(cells) else ""
                    no = get("no")
                    if no.isdigit():
                        started = True
                        name = get("name")
                        parts = re.split(r"(?=[①-⑳])", name)
                        cur = {
                            "year": year, "no": int(no), "name": parts[0], "key": name_key(parts[0]),
                            "period": get("period"), "overview": get("overview"), "targets": [],
                            "grade": "", "grade_label": "", "rate_raw": "", "rate": None,
                            "source": src["id"], "page": i + 1,
                        }
                        out.append(cur)
                        part = parts[1] if len(parts) > 1 else ""
                    elif cur:
                        part = get("name") if re.match(r"^[①-⑳]", get("name")) else ""
                    else:
                        continue
                    part = re.sub(r"^[①-⑳]", "", part)
                    names, actuals = split_circled(get("target_name")), split_circled(get("actual"))
                    if len(names) > 1 and len(names) == len(actuals) and not get("target"):
                        # R4 は1つのセルに「①…：21件②…：20」と複数の目標が入っていることがある
                        for n, a_ in zip(names, actuals):
                            cur["targets"].append({"part": part, "name": n, "target": "", "actual": a_})
                    elif get("target_name") or get("actual"):
                        cur["targets"].append({"part": part, "name": re.sub(r"^[①-⑳]", "", get("target_name")),
                                               "target": get("target"), "actual": get("actual")})
                    if get("grade") in GRADES and not cur["grade"]:
                        cur["grade"], cur["grade_label"] = get("grade"), GRADES[get("grade")]
                    if get("rate") and not cur["rate_raw"]:
                        cur["rate_raw"], cur["rate"] = get("rate"), parse_num(get("rate"))
    # 2つの基本施策に再掲された事業は1件にまとめる（同じ事業番号）
    uniq: dict[int, dict] = {}
    for j in out:
        uniq.setdefault(j["no"], j)
    return list(uniq.values())


# ---------------------------------------------------------------- 検証シート

CODE_RE = re.compile(r"(\d)-\((\d+)\)-([ア-ン])(?:[-ー]?(\d{1,2}))?")
DINGBATS = {chr(0x2780 + i): str(i + 1) for i in range(10)}  # ➀〜➉（NFKC で数字にならない丸数字）


def sheet_codes(lines: list[str], shisaku: dict[str, dict]) -> list[str]:
    """施策コード（1-⑴-ｱ-①、第4章-1-(1)-ア-①、アー1、ア1）を施策IDにする。NFKC で ⑴→(1)、ｱ→ア、①→1 になる。
    施策展開までしか書かれていない（第4章-3-(7)-ア）ときは、シートの「基本計画該当箇所」の施策名と同じ名前の施策にする。"""
    ids = []
    joined = name_key("".join(lines))
    for line in lines:
        t = re.sub(r"[ \t]", "", "".join(DINGBATS.get(ch, ch) for ch in line))
        for m in CODE_RE.finditer(t):
            c = parse_code(f"{m.group(1)}-({m.group(2)})-{m.group(3)}" + (f"-{m.group(4)}" if m.group(4) else ""))
            if not c:
                continue
            if c["num"]:
                found = [shisaku_id(c)] if shisaku_id(c) in shisaku else []
            else:
                tid = f"{c['shouraizou']}-{c['kihon']}-{chr(ord('a') + KANA.index(c['kana']))}"
                found = [sid for sid, x in shisaku.items() if x["tenkai_id"] == tid and name_key(x["name"]) in joined]
            for sid in found:
                if sid not in ids:
                    ids.append(sid)
    return ids


def line_words(words: list[dict], label: str) -> list[dict] | None:
    """ラベル（「予算現額」など）と同じ高さにある語。"""
    hit = next((w for w in words if label in nfkc(w["text"])), None)
    if not hit:
        return None
    mid = (hit["top"] + hit["bottom"]) / 2
    return [w for w in words if abs((w["top"] + w["bottom"]) / 2 - mid) < 4 and w["x0"] > hit["x1"]]


def column_value(words: list[dict], label: str, lo: float, hi: float) -> str:
    """ラベルの行のうち、列の範囲（lo〜hi）にある値。数字は右寄せのことがあるので、隣の列の見出しとの中間で区切る。"""
    ws = [w for w in line_words(words, label) or [] if lo <= (w["x0"] + w["x1"]) / 2 < hi]
    return nfkc(ws[-1]["text"]) if ws else ""


def read_sheets(year: int, src: dict, shisaku: dict[str, dict]) -> list[dict]:
    """検証シート。1事業は2〜3ページで、1ページ目の頭に「R6-No.36」がある。"""
    out: list[dict] = []
    cur = None
    with pdfplumber.open(src["path"]) as pdf:
        for i, page in enumerate(pdf.pages):
            text = nfkc(page.extract_text() or "")
            head = re.match(r"^\s*R\d+-No\.?\s*(\d+)", text)
            if head and "検証シート" in text[:200]:
                lines = text.splitlines()
                name = ""
                for ln in lines[:12]:
                    if m := re.search(rf"(?:^|\s){head.group(1)}\s+(.+?)\s+新沖縄21世紀ビジョン", ln):
                        name = m.group(1).strip()
                        break
                dept = ""
                # 担当部課名はセルの中で折り返すことがあるので、表として読めるときは表のセルから取る
                for t in page.extract_tables():
                    for row in t:
                        cells = [flat(x) for x in row if x is not None]
                        if cells and cells[0] == "担当部課名":
                            dept = next((x for x in cells[1:] if x), "")
                if not dept and (m := re.search(r"担当部課名\s*(.+?)(?:\s*\(予定\)|\s+(?:事業実施|[HR]\d+\s*[~～]|H\d+|R\d+))", text)):
                    dept = m.group(1).strip()
                words = page.extract_words(keep_blank_chars=False, use_text_flow=False)
                col = next((w for w in words if nfkc(w["text"]) == f"{wareki(year)}年度"), None)
                budget = {}
                if col:
                    # 同じ高さの列見出し（R4年度・R4年度（繰越）…）の中心で列の範囲を決める
                    centers = sorted((w["x0"] + w["x1"]) / 2 for w in words
                                     if abs(w["top"] - col["top"]) < 3 and re.match(r"^R\d+年度", nfkc(w["text"])))
                    x = (col["x0"] + col["x1"]) / 2
                    k_ = centers.index(x)
                    lo = (centers[k_ - 1] + x) / 2 if k_ > 0 else x - 40
                    hi = (centers[k_ + 1] + x) / 2 if k_ + 1 < len(centers) else page.width
                    for k, label in (("total", "計(b+d)"), ("spent", "執行済額"), ("kofukin", "うち交付金充当額"),
                                     ("rate", "執行率")):
                        budget[f"{k}_raw"] = column_value(words, label, lo, hi)
                    for k in ("total", "spent", "kofukin", "rate"):
                        budget[k] = parse_num(budget[f"{k}_raw"])
                cur = {
                    "year": year, "no": int(head.group(1)), "name": name,
                    "shisaku_ids": sheet_codes(lines[:10], shisaku),
                    "dept": dept, "budget": budget, "policy": "",
                    "sheet_source": src["id"], "sheet_page": i + 1,
                }
                out.append(cur)
            if cur and "今後の取り組み方針" in text:
                m = re.search(r"今後の取り組み方針\s*\n(.*?)(?:\n\s*資金の流れ|$)", text, re.S)
                if m and not cur["policy"]:
                    cur["policy"] = m.group(1).strip()
    return out


# ---------------------------------------------------------------- 入出力


def find_inputs(raw: Path, manifest: dict) -> dict[int, dict]:
    out: dict[int, dict] = {}
    for local_path, r in sorted(manifest.items()):
        if r.get("source") != SOURCE or not local_path.endswith(".pdf") or not r.get("referrers") or not r.get("sha256"):
            continue
        ref = r["referrers"][0]
        fy = r["fiscal_year"]
        # 年度別のページの年度（リンク文言の年度で別のフォルダに入るファイルがあるため）
        page_fy = int(m.group(1)) + 2018 if (m := re.search(r"令和\s*(\d+)\s*年度", nfkc(ref["page_title"]))) else fy
        info = {"id": local_path, "path": raw / local_path, "file_url": r["file_url"], "link_text": ref["link_text"],
                "page_url": ref["page_url"], "page_title": ref["page_title"], "year": page_fy}
        bucket = out.setdefault(page_fy, {"soukatsu": None, "sheets": []})
        lt = ref["link_text"]
        if "総括表" in lt:
            bucket["soukatsu"] = info
        elif re.search(r"繰越|事業完了後|後年度", lt):
            continue
        else:
            bucket["sheets"].append(info)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", default="data/raw")
    ap.add_argument("--out", default="data/extracted/ikkatsu")
    ap.add_argument("--extracted", default="data/extracted")
    ap.add_argument("--since", type=int, default=2022)
    args = ap.parse_args()
    raw, out = Path(args.raw), Path(args.out)
    inputs = find_inputs(raw, load_manifest(raw))

    # 施策コードの確かめと、施策展開までしか書かれていないときの施策名の照合に使う（沖縄県PDCAの施策。どの年度かに載っているもの）
    shisaku = {}
    for x in json.loads((Path(args.extracted) / "soukatsu" / "shisaku.json").read_text(encoding="utf-8")):
        shisaku.setdefault(x["id"], x)
    rows, sources = [], []
    for year, b in sorted(inputs.items()):
        if year < args.since or not b["soukatsu"]:
            continue
        for src in [b["soukatsu"], *b["sheets"]]:
            sources.append({k: src[k] for k in ("id", "file_url", "link_text", "page_url", "page_title", "year")})
        summary = read_soukatsu(year, b["soukatsu"])
        sheets = [s for src in b["sheets"] for s in read_sheets(year, src, shisaku)]
        by_no = {s["no"]: s for s in sheets}
        unmatched = []
        for j in summary:
            s = by_no.pop(j["no"], None)
            if s is None:
                unmatched.append(j)
                j.update(shisaku_ids=[], dept="", budget={}, policy="", sheet_source=None, sheet_page=None)
                continue
            j.update({k: s[k] for k in ("shisaku_ids", "dept", "budget", "policy", "sheet_source", "sheet_page")})
            if name_key(s["name"]) != j["key"] and s["name"]:
                j["sheet_name"] = s["name"]
        rows.extend(summary)
        grades = {g: sum(1 for j in summary if j["grade_label"] == g) for g in GRADES.values()}
        print(f"{year} 総括表 {len(summary)}事業 {grades} / 検証シート {len(sheets)} / 結び付かない 総括表 {len(unmatched)}・シート {len(by_no)}"
              f" / 施策コード無し {sum(1 for j in summary if not j['shisaku_ids'])} / 予算無し {sum(1 for j in summary if j['budget'].get('total') is None)}",
              file=sys.stderr)
        for j in unmatched[:5]:
            print(f"  総括表だけ: No.{j['no']} {j['name']}", file=sys.stderr)
        for s in list(by_no.values())[:5]:
            print(f"  シートだけ: No.{s['no']} {s['name']} {s['sheet_source']} p{s['sheet_page']}", file=sys.stderr)

    # 検証シートが画像で読めない・施策コードが無い事業は、別の年度の同じ名前の事業の施策を使う（shisaku_from に年度）
    known = {}
    for j in sorted(rows, key=lambda j: -j["year"]):
        if j["shisaku_ids"]:
            known.setdefault(j["key"], (j["year"], j["shisaku_ids"]))
    for j in rows:
        if not j["shisaku_ids"] and j["key"] in known:
            j["shisaku_from"], j["shisaku_ids"] = known[j["key"]]
    left = [j for j in rows if not j["shisaku_ids"]]
    print(f"施策が決まらない事業 {len(left)}: " + "、".join(f"{wareki(j['year'])} No.{j['no']} {j['name']}" for j in left), file=sys.stderr)

    rows.sort(key=lambda j: (j["year"], j["no"]))
    write_json(out / "jigyo.json", rows)
    write_json(out / "sources.json", sources)
    return 0


if __name__ == "__main__":
    sys.exit(main())
