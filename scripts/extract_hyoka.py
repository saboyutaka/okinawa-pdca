#!/usr/bin/env python3
"""新・沖縄21世紀ビジョン基本計画 評価検証報告書（R4〜R6）の本文から、基本施策ごとの成果と課題の文章を取り出す。

使い方（解析用コンテナ内で実行する）:
  docker compose run --rm tools python scripts/extract_hyoka.py

入力: data/raw/hyoka/ の「評価検証報告書【本文】」
出力: data/extracted/hyoka/
  kihon.json    基本施策（36）。前置きの文（intro）、主な施策の成果（results: 箇条）、主要指標の達成状況（shuyou: 文）、
                主な課題（issues: 小見出しと箇条）
  sources.json  出典
第2章「基本施策の推進による成果と課題」だけを読む。成果指標・主要指標の表とグラフは読まない（数字は沖縄県PDCAの抽出結果にある）。
基本施策のIDは沖縄県PDCAと同じ（1-1 …）。見出しの名前は沖縄県PDCAの基本施策の名前で確かめる。
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
from extract_soukatsu import load_manifest, name_key, uncid, write_json  # noqa: E402

SOURCE = "hyoka"


def is_bullet(line: str) -> bool:
    """箇条の頭。成果は「➢」、課題は記号フォントの文字（私用領域の U+F09F など）。"""
    return bool(line) and (line[0] in "➢・" or 0xE000 <= ord(line[0]) <= 0xF8FF)


def unbullet(t: str) -> str:
    return t[1:].strip() if is_bullet(t) else t


def nfkc(s: str) -> str:
    return unicodedata.normalize("NFKC", uncid(s))


def read(src: dict, kihon_names: dict[str, str]) -> list[dict]:
    lines: list[tuple[int, str]] = []
    with pdfplumber.open(src["path"]) as pdf:
        started = False
        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            if not started:
                # 目次にも同じ見出しがあるので、本文の章の書き出し（「新・基本計画では」）で見分ける
                if "第２章 基本施策の推進による成果と課題" in text and "新・基本計画では" in text:
                    started = True
                else:
                    continue
            if re.search(r"^第３章", text, re.M):
                text = text[: re.search(r"^第３章", text, re.M).start()]
                lines += [(i + 1, ln) for ln in text.splitlines()]
                break
            lines += [(i + 1, ln) for ln in text.splitlines()]

    out: list[dict] = []
    cur = None
    shouraizou = None
    mode = None
    for page_no, raw in lines:
        line = raw.strip()
        t = nfkc(line)
        if not line or re.fullmatch(r"-\s*\d+\s*-", t) or t.startswith("図表"):
            continue
        if m := re.match(r"^([1-5])\s+(.+を目指して)$", t):
            shouraizou = int(m.group(1))
            continue
        if shouraizou and (m := re.match(r"^\((\d+)\)\s*(.+)$", t)):
            kid = f"{shouraizou}-{int(m.group(1))}"
            known = kihon_names.get(kid, "")
            if known and name_key(m.group(2))[:6] == name_key(known)[:6]:
                cur = {"id": kid, "name": known, "intro": [], "results": [], "shuyou": [], "issues": [],
                       "source": src["id"], "page": page_no, "page_end": page_no}
                out.append(cur)
                mode = "intro"
                continue
        if not cur:
            continue
        cur["page_end"] = page_no
        if t == "主な施策の成果":
            mode = "results"
            continue
        if t.startswith("<主な施策に紐づく成果指標>"):
            mode = "skip"
            continue
        if t == "主要指標の達成状況":
            mode = "shuyou"
            continue
        if t.startswith("主要指標名"):
            mode = "skip"  # 主要指標の表とグラフ
            continue
        if t == "主な課題":
            mode = "issues"
            continue
        if mode in ("intro", "shuyou"):
            cur[mode].append(t)
        elif mode == "results":
            if is_bullet(line):
                cur["results"].append(unbullet(t))
            elif cur["results"]:
                cur["results"][-1] += t
            else:
                cur["intro"].append(t)
        elif mode == "issues":
            if re.fullmatch(r"\(.+\)", t):
                cur["issues"].append({"head": t[1:-1], "items": []})
            elif is_bullet(line):
                if not cur["issues"]:
                    cur["issues"].append({"head": "", "items": []})
                cur["issues"][-1]["items"].append(unbullet(t))
            elif cur["issues"] and cur["issues"][-1]["items"]:
                cur["issues"][-1]["items"][-1] += t
    for k in out:
        k["intro"] = "".join(k["intro"])
        k["shuyou"] = "".join(k["shuyou"])
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", default="data/raw")
    ap.add_argument("--extracted", default="data/extracted")
    args = ap.parse_args()
    raw, extracted = Path(args.raw), Path(args.extracted)
    kihon_names = {}
    for k in json.loads((extracted / "soukatsu" / "kihon.json").read_text(encoding="utf-8")):
        kihon_names[k["id"]] = k["name"]

    sources, rows = [], []
    for local_path, r in sorted(load_manifest(raw).items()):
        if r.get("source") != SOURCE or not r.get("referrers"):
            continue
        ref = r["referrers"][0]
        src = {"id": local_path, "path": raw / local_path, "file_url": r["file_url"], "link_text": ref["link_text"],
               "page_url": ref["page_url"], "page_title": ref["page_title"],
               "kind": "honbun" if "本文" in ref["link_text"] else "gaiyou"}
        sources.append({k: v for k, v in src.items() if k != "path"})
        if src["kind"] == "honbun":
            rows = read(src, kihon_names)
    if not rows:
        print("警告: 評価検証報告書の本文が見つからない・読めない（先に make fetch）", file=sys.stderr)
        return 1
    missing = sorted(set(kihon_names) - {k["id"] for k in rows})
    print(f"基本施策 {len(rows)}（読めなかったもの: {', '.join(missing) or 'なし'}）", file=sys.stderr)
    for k in rows:
        if not (k["results"] and k["issues"]):
            print(f"  警告: {k['id']} 成果 {len(k['results'])} / 課題 {len(k['issues'])}", file=sys.stderr)
    write_json(extracted / "hyoka" / "kihon.json", rows)
    write_json(extracted / "hyoka" / "sources.json", sources)
    return 0


if __name__ == "__main__":
    sys.exit(main())
