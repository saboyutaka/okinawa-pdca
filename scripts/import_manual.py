#!/usr/bin/env python3
"""手動でダウンロードしたファイルを data/raw に取り込み、取得台帳（manifest.jsonl）に記録する。

使い方:
  python3 scripts/import_manual.py ~/Downloads/県企業局 --source kigyo --since 2022

robots.txt で自動取得が禁止されているサイト（県企業局など）のファイルは fetch_pdca.py では取れない。
台帳には fetch_pdca.py がリンクを見つけた記録（file_url・local_path・リンク文言）だけが残るので、
ブラウザで手動ダウンロードしたファイルを、その local_path の場所にコピーして記録を埋める。

- 台帳に記録があり、手元にまだファイルが無いものだけを対象にする（ファイル名で照合）
- 記録に bytes・sha256・fetched_at を書き、fetched_by に "manual" を入れる
- 台帳に無いファイルや、名前が合わないファイルは取り込まず一覧で知らせる

標準ライブラリのみで動作。
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import shutil
import sys
from pathlib import Path

JST = dt.timezone(dt.timedelta(hours=9))
NOTE = "robots.txt が自動取得を禁止しているため、ブラウザで手動ダウンロードしたものを置いた"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src", help="手動でダウンロードしたファイルのあるフォルダ")
    ap.add_argument("--source", required=True, help="取得元の保存名（例: kigyo）")
    ap.add_argument("--since", type=int, help="対象年度（西暦）の下限")
    ap.add_argument("--raw", default="data/raw")
    args = ap.parse_args()

    src, raw = Path(args.src).expanduser(), Path(args.raw)
    manifest = raw / "manifest.jsonl"
    lines = manifest.read_text(encoding="utf-8").splitlines()
    files = {p.name: p for p in src.iterdir() if p.is_file()}
    used, imported, not_found, already = set(), [], [], set()
    out = []
    for line in lines:
        r = json.loads(line)
        dest = raw / r["local_path"]
        target = r.get("source") == args.source and (not args.since or (r.get("fiscal_year") or 0) >= args.since)
        if target and dest.exists():
            already.add(Path(r["local_path"]).name)
        elif target:
            f = files.get(Path(r["local_path"]).name)
            if f:
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(f, dest)
                data = dest.read_bytes()
                r.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
                         fetched_at=dt.datetime.now(JST).isoformat(timespec="seconds"), fetched_by="manual", note=NOTE)
                used.add(f.name)
                imported.append(r["local_path"])
            else:
                not_found.append(r["local_path"])
        out.append(json.dumps(r, ensure_ascii=False))
    manifest.write_text("\n".join(out) + "\n", encoding="utf-8")

    for p in imported:
        print(f"取り込み: {p}")
    for p in not_found:
        print(f"まだ無い（ダウンロードが必要）: {p}", file=sys.stderr)
    for name in sorted(set(files) - used - already):
        print(f"取り込まなかった（台帳に記録が無い、または同じ名前の重複）: {name}", file=sys.stderr)
    print(f"{len(imported)} ファイルを取り込み（取り込み済み {len(already)}）、{len(not_found)} ファイルはまだ無い", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
