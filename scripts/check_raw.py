#!/usr/bin/env python3
"""data/raw のファイルが取得台帳（manifest.jsonl・pages.jsonl）の記録とそろっているかを確かめる。

使い方:
  python3 scripts/check_raw.py

別の PC へ data/raw を移したあと（docs/new-pc.md）に使う。
- manifest.jsonl で取得済みの記録（sha256 があるもの）は、local_path にファイルがあり、中身の sha256 が同じこと
- 県が差し替えた旧版（history の moved_to）も同じように確かめる
- pages.jsonl の snapshot（巡回したページの HTML）があること
- 取得していない記録（robots.txt で取れない・取得に失敗したもの）と、台帳に無いファイルは数だけ出す

無いファイル・中身が違うファイルが1件でもあれば失敗（終了コード1）。
標準ライブラリのみで動作。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

IGNORE = {".DS_Store"}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", default="data/raw")
    args = ap.parse_args()
    raw = Path(args.raw)

    files: dict[str, str] = {}  # local_path → 記録の sha256
    not_fetched: Counter = Counter()
    for line in (raw / "manifest.jsonl").read_text(encoding="utf-8").splitlines():
        rec = json.loads(line)
        if rec.get("sha256"):
            files[rec["local_path"]] = rec["sha256"]
        else:
            not_fetched[rec["source"]] += 1
        for old in rec.get("history", []):
            files[old["moved_to"]] = old["sha256"]
    pages = [json.loads(line)["snapshot"]
             for line in (raw / "pages.jsonl").read_text(encoding="utf-8").splitlines()]

    missing, changed = [], []
    for rel, digest in sorted(files.items()):
        path = raw / rel
        if not path.exists():
            missing.append(rel)
        elif sha256_file(path) != digest:
            changed.append(rel)
    missing_pages = [rel for rel in pages if not (raw / rel).exists()]

    known = set(files) | set(pages)
    extra = sorted(p.relative_to(raw).as_posix() for p in raw.glob("*/**/*")
                   if p.is_file() and p.name not in IGNORE and p.relative_to(raw).as_posix() not in known)

    print(f"取得したファイル {len(files)} 件: 無い {len(missing)}・中身が違う {len(changed)}")
    print(f"巡回したページの HTML {len(pages)} 件: 無い {len(missing_pages)}")
    print(f"参考 取得していない記録 {sum(not_fetched.values())} 件（robots.txt で取れない・取得に失敗）: {dict(not_fetched)}")
    print(f"参考 台帳に無いファイル {len(extra)} 件")
    for label, rels in (("無い", missing + missing_pages), ("中身が違う", changed), ("台帳に無い", extra)):
        for rel in rels[:20]:
            print(f"  {label}: {rel}")
        if len(rels) > 20:
            print(f"  {label}: ほか {len(rels) - 20} 件")

    if missing or changed or missing_pages:
        print("NG data/raw が台帳とそろっていない")
        return 1
    print("OK data/raw は台帳とそろっている")
    return 0


if __name__ == "__main__":
    sys.exit(main())
