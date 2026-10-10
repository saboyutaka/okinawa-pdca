#!/usr/bin/env python3
"""抽出結果（data/extracted/soukatsu）を、県が概要版で公表した集計値と突き合わせる。

使い方:
  python3 scripts/check_extracted.py

件数（施策・主な取組・成果指標・基本施策）が公表値と違えば失敗（終了コード1）。
進捗状況の内訳・施策の推進状況（A〜G）の差は警告にとどめる。PDF の個別の欄と県の集計が
もともと一致しないものがあるため（進捗状況が空欄・「-」の取組、集計で「その他」に回る施策など）。
成果指標の計画値・達成率は、概要版に書かれた式で計算し直して報告書の値と比べ、件数を参考として出す。

標準ライブラリのみで動作。
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

STATUSES = ("順調", "概ね順調", "やや遅れ", "大幅遅れ", "未着手")

# 公表値。出典は各年度の概要版（R4: r4pdcazissikekka.pdf, R5: r5gaiyouban.pdf, R6: r6_pdcagaiyou.pdf, R7: r7_soukatu_gaiyou.pdf）
EXPECTED = {
    2022: {"kihon": 36, "shisaku": 339, "seika": 393, "torikumi": 1539, "status": (1239, 115, 74, 96, 15)},
    2023: {"kihon": 36, "shisaku": 339, "seika": 393, "torikumi": 1539, "status": (1185, 150, 91, 94, 19),
           "judge": {"A": 186, "B": 36, "G": 6, "その他": 11}},
    2024: {"kihon": 36, "shisaku": 339, "seika": 393, "torikumi": 1539, "status": (1163, 129, 83, 119, 45),
           "judge": {"A": 194, "B": 45, "C": 36, "D": 40, "E": 12, "F": 3, "G": 6, "その他": 3}},
    2025: {"kihon": 36, "shisaku": 339, "seika": 391, "torikumi": 1534, "status": (1272, 108, 46, 84, 24),
           "judge": {"A": 194, "B": 50, "C": 53, "D": 28, "E": 8, "F": 0, "G": 3, "その他": 3}},
}


def plan_index(year: int) -> int:
    """計画値の欄は計画期間の3年分が並ぶ。その年度の計画値が何番目か。"""
    return year - 2022 if year <= 2024 else year - 2025


def verify_formulas(seika: list[dict], year: int) -> tuple[Counter, Counter]:
    """概要版に書かれた式で、計画値と達成率を計算し直して報告書の値と比べる。

    計画値 = 目標値 - (目標値 - 基準値) × 残年数 / N   （R4〜R6: N=3・目標年度R6、R7〜: N=6・目標年度R9）
    達成率 = (実績値 - 基準値) / (その年度の計画値 - 基準値) × 100
    """
    n, end = (3, 2024) if year <= 2024 else (6, 2027)
    start = 2022 if year <= 2024 else 2025
    plan_ok, rate_ok = Counter(), Counter()
    for s in seika:
        base, target, plans = s["base"], s["target"], s["plan"]
        if base is not None and target is not None and plans and None not in plans:
            ok = all(abs(target - (target - base) * (end - (start + j)) / n - p) <= max(0.051, abs(p) * 0.01)
                     for j, p in enumerate(plans))
            plan_ok["式どおり" if ok else "式と違う"] += 1
        else:
            plan_ok["計算できない"] += 1
        i = plan_index(year)
        plan = plans[i] if plans and len(plans) > i else None
        if None in (s["rate"], base, s["actual"], plan) or plan == base:
            rate_ok["計算できない"] += 1
            continue
        r = (s["actual"] - base) / (plan - base) * 100
        rate_ok["式どおり" if abs(r - s["rate"]) <= 0.15 else "式と違う"] += 1
    return plan_ok, rate_ok


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", default="data/extracted/soukatsu")
    args = ap.parse_args()
    d = Path(args.dir)
    data = {name: json.loads((d / f"{name}.json").read_text(encoding="utf-8"))
            for name in ("kihon", "shisaku", "torikumi", "seika")}

    failed = False
    for year, exp in EXPECTED.items():
        rows = {name: [r for r in recs if r["year"] == year] for name, recs in data.items()}
        print(f"== R{year - 2018}（{year}年度）")
        for name in ("kihon", "shisaku", "seika", "torikumi"):
            got = len(rows[name])
            ok = got == exp[name]
            failed |= not ok
            print(f"  {'OK ' if ok else 'NG '} {name:9s} {got:5d}（公表 {exp[name]}）")

        status = Counter(t["status_raw"] for t in rows["torikumi"])
        got = tuple(status[s] for s in STATUSES)
        odd = {k: v for k, v in status.items() if k not in STATUSES}
        mark = "OK " if got == exp["status"] else "警告"
        print(f"  {mark} 進捗内訳 {got}（公表 {exp['status']}）" + (f" 欄の表記がそれ以外: {odd}" if odd else ""))

        plan_ok, rate_ok = verify_formulas(rows["seika"], year)
        print(f"  参考 計画値を式で再計算: {dict(plan_ok)}")
        print(f"  参考 達成率を式で再計算: {dict(rate_ok)}")

        if "judge" in exp:
            judge = Counter(s["judge"] or "なし" for s in rows["shisaku"])
            diff = {k: f"{judge.get(k, 0)}/{v}" for k, v in exp["judge"].items() if judge.get(k, 0) != v}
            print(f"  {'OK ' if not diff else '警告'} 施策の推進状況 " + (f"差（抽出/公表）: {diff}" if diff else "一致"))

    # 部局別の検証票（予算）が総括報告書のどの取組に結び付いたか（参考）
    budget_path = d.parent / "bukyoku" / "torikumi_budget.json"
    if budget_path.exists():
        budget = json.loads(budget_path.read_text(encoding="utf-8"))
        print("== 部局別の検証票（予算）")
        for year in EXPECTED:
            keys = {(t["shisaku_id"], t["key"]) for t in data["torikumi"] if t["year"] == year}
            found = {(b["shisaku_id"], b["key"]) for b in budget if b["year"] == year}
            orphan = len(found - keys)
            print(f"  R{year - 2018}: 総括の取組 {len(keys)} のうち部局票あり {len(keys & found)}"
                  + (f"、総括に無い取組 {orphan}" if orphan else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
