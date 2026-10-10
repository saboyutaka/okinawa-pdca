#!/usr/bin/env python3
"""data/raw の zip を data/interim に展開する（中の PDF だけ）。

使い方:
  python3 scripts/expand_zips.py                    # 全取得元
  python3 scripts/expand_zips.py --source soukatsu  # 取得元を絞る

展開先: data/interim/<取得元>/<対象年度>/<zip名>/<中のファイル名>
  例: data/raw/soukatsu/2022-r04/syouraizou1.zip → data/interim/soukatsu/2022-r04/syouraizou1/syouraizou1.pdf
  展開先のパスから元の zip が分かるので、出典（manifest の file_url）はそこから引く。

標準ライブラリのみで動作。展開済み（同サイズ）のファイルはスキップする。
"""
from __future__ import annotations

import argparse
import sys
import zipfile
from pathlib import Path


def member_name(info: zipfile.ZipInfo) -> str:
    # 県の zip は Windows で作られており、UTF-8 フラグが無い名前は CP932
    name = info.filename
    if not info.flag_bits & 0x800:
        try:
            name = name.encode("cp437").decode("cp932")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return name


def expand(zip_path: Path, out_dir: Path) -> list[Path]:
    written = []
    with zipfile.ZipFile(zip_path) as z:
        for info in z.infolist():
            if info.is_dir():
                continue
            # 中のフォルダ構成は捨てて名前だけ使う（../ などで展開先の外に書かないため）
            name = Path(member_name(info).replace("\\", "/")).name
            if not name.lower().endswith(".pdf") or name.startswith("."):
                continue
            dest = out_dir / name
            if dest.exists() and dest.stat().st_size == info.file_size:
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as src, open(dest, "wb") as dst:
                while chunk := src.read(1 << 20):
                    dst.write(chunk)
            written.append(dest)
    return written


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", default="data/raw", help="原本の置き場（既定: data/raw）")
    ap.add_argument("--out", default="data/interim", help="展開先（既定: data/interim）")
    ap.add_argument("--source", action="append", help="取得元を絞る（保存名で指定、複数可）")
    args = ap.parse_args()

    raw, out = Path(args.raw), Path(args.out)
    sources = args.source or sorted(p.name for p in raw.iterdir() if p.is_dir())
    total = 0
    for source in sources:
        for zip_path in sorted((raw / source).glob("*/*.zip")):
            rel = zip_path.relative_to(raw).with_suffix("")
            written = expand(zip_path, out / rel)
            for w in written:
                print(f"展開: {w}")
            total += len(written)
    print(f"{total} ファイルを展開", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
