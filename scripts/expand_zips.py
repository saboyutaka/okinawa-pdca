#!/usr/bin/env python3
"""data/raw の zip を data/interim に展開する（中の PDF だけ）。

使い方:
  python3 scripts/expand_zips.py                    # 全取得元
  python3 scripts/expand_zips.py --source soukatsu  # 取得元を絞る

展開先: data/interim/<取得元>/<対象年度>/<zip名>/<中のファイル名>
  例: data/raw/soukatsu/2022-r04/syouraizou1.zip → data/interim/soukatsu/2022-r04/syouraizou1/syouraizou1.pdf
  展開先のパスから元の zip が分かるので、出典（manifest の file_url）はそこから引く。

標準ライブラリのみで動作。展開済みで中身（CRC）が同じファイルはスキップし、zip から無くなったファイルは消す。
"""
from __future__ import annotations

import argparse
import sys
import zipfile
import zlib
from collections import Counter
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


def crc32_of(path: Path) -> int:
    crc = 0
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20):
            crc = zlib.crc32(chunk, crc)
    return crc


def expand(zip_path: Path, out_dir: Path) -> list[Path]:
    """zip の中の PDF を out_dir に展開する。県が zip を差し替えたときに古いファイルが残らないよう、
    中身（CRC）が違うものは書き直し、zip から無くなったファイルは消す。"""
    written = []
    with zipfile.ZipFile(zip_path) as z:
        members = [i for i in z.infolist() if not i.is_dir()]
        names = {i: Path(member_name(i).replace("\\", "/")) for i in members}
        pdfs = [i for i in members if names[i].name.lower().endswith(".pdf") and not names[i].name.startswith(".")]
        # 中のフォルダ構成は捨てて名前だけ使う（../ などで展開先の外に書かないため）。
        # 別のフォルダに同じ名前のファイルがあるときだけ、フォルダ名をつないだ名前にする
        base_count = Counter(names[i].name for i in pdfs)
        wanted = {}
        for i in pdfs:
            n = names[i]
            if base_count[n.name] > 1:
                parts = [x for x in n.parts if x not in ("", ".", "..")]
                wanted["__".join(parts)] = i
            else:
                wanted[n.name] = i
        for name, info in wanted.items():
            dest = out_dir / name
            if dest.exists() and dest.stat().st_size == info.file_size and crc32_of(dest) == info.CRC:
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as src, open(dest, "wb") as dst:
                while chunk := src.read(1 << 20):
                    dst.write(chunk)
            written.append(dest)
    if out_dir.exists():
        for old in out_dir.glob("*.pdf"):
            if old.name not in wanted:
                print(f"zip に無くなったので削除: {old}", file=sys.stderr)
                old.unlink()
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
