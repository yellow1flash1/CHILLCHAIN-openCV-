"""Measure the grading agent on real, labelled photos, and optionally fit its thresholds.

Photo folders follow ml/README.md (one folder per label; `other` = not this crop / unusable):

    photos/strawberry/A/*.jpg   photos/strawberry/B/*.jpg   photos/strawberry/C/*.jpg   photos/strawberry/other/*.jpg
    (or photos/strawberry/test/A/... if you keep a separate test split)

Run locally, or against the deployed AWS endpoint to include network time:

    python eval/evaluate.py --data photos/strawberry --crop strawberry
    python eval/evaluate.py --data photos/strawberry --crop strawberry --endpoint https://xxx.execute-api.ap-south-1.amazonaws.com --key $VISION_API_KEY
    python eval/evaluate.py --data photos/strawberry/train --crop strawberry --calibrate   # fit, then evaluate on test/

Writes eval-out/report.md, report.json, per_image.csv and annotated copies of every mistake.
Report the numbers it prints, and only those: they are what judges will ask about.
"""

from __future__ import annotations

import argparse
import base64
import csv
import itertools
import json
import statistics
import sys
import time
import urllib.request
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from chillvision.agent import grade_image  # noqa: E402
from chillvision.tools import GRADES, Thresholds, lot_grade  # noqa: E402

LABELS = ("A", "B", "C", "other")
EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def images(root: Path):
    base = root / "test" if (root / "test").is_dir() and not (root / "A").is_dir() else root
    for label in LABELS:
        for p in sorted((base / label).glob("*")) if (base / label).is_dir() else []:
            if p.suffix.lower() in EXTS:
                yield label, p


def run_local(path: Path, crop: str, t: Thresholds) -> dict:
    img = cv2.imread(str(path))
    if img is None:
        raise ValueError(f"unreadable: {path}")
    return grade_image(img, crop, t)


def run_remote(path: Path, crop: str, url: str, key: str) -> dict:
    body = json.dumps({"image": base64.b64encode(path.read_bytes()).decode(), "crop": crop}).encode()
    req = urllib.request.Request(f"{url.rstrip('/')}/grade", body,
                                 {"content-type": "application/json", "x-chillchain-key": key})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def predicted(out: dict) -> str:
    """The grade the app would save or suggest; 'retake' when it asks for a new photo."""
    a = out["next_action"]
    if a["type"] == "retake":
        return "retake"
    return (out.get("result") or {}).get("grade") or a.get("suggested_grade") or "retake"


def regrade(out: dict, t: Thresholds) -> str:
    """Re-grade from stored per-piece measurements with other thresholds (for calibration)."""
    if out["next_action"]["type"] == "retake":
        return "retake"
    gs = []
    for p in out.get("pieces_detail", []):
        if p["defect_frac"] >= t.c_defect or p["mould_frac"] >= t.c_mould:
            gs.append("C")
        elif p["defect_frac"] >= t.b_defect or (p["grade"] == "B" and p["defect_frac"] < Thresholds().b_defect):
            gs.append("B")  # keeps "not fully coloured" B decisions, which don't depend on these thresholds
        else:
            gs.append("A")
    return lot_grade(gs)


def score(rows: list[tuple[str, str]]) -> dict:
    graded = [(y, p) for y, p in rows if y in GRADES]
    conf = {y: {p: 0 for p in (*GRADES, "retake")} for y in GRADES}
    for y, p in graded:
        conf[y][p] += 1
    answered = [(y, p) for y, p in graded if p != "retake"]
    acc = sum(y == p for y, p in answered) / len(answered) if answered else 0.0
    within1 = sum(abs(GRADES.index(y) - GRADES.index(p)) <= 1 for y, p in answered) / len(answered) if answered else 0.0
    f1s = []
    for g in GRADES:
        tp = sum(y == g and p == g for y, p in answered)
        fp = sum(y != g and p == g for y, p in answered)
        fn = sum(y == g and p != g for y, p in answered)
        f1s.append(2 * tp / (2 * tp + fp + fn) if tp else 0.0)
    other = [p for y, p in rows if y == "other"]
    return {
        "photos": len(rows),
        "graded_photos": len(graded),
        "retake_rate_on_produce": round(sum(p == "retake" for _, p in graded) / len(graded), 3) if graded else None,
        "accuracy_when_graded": round(acc, 3),
        "within_one_grade": round(within1, 3),
        "macro_f1": round(sum(f1s) / 3, 3),
        "other_rejected": round(sum(p == "retake" for p in other) / len(other), 3) if other else None,
        "confusion": conf,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, type=Path)
    ap.add_argument("--crop", required=True)
    ap.add_argument("--endpoint")
    ap.add_argument("--key", default="")
    ap.add_argument("--calibrate", action="store_true", help="fit b_defect/c_defect and write thresholds.json")
    ap.add_argument("--out", type=Path, default=Path("eval-out"))
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    t = Thresholds()

    rows, outs, lat = [], [], []
    for label, path in images(a.data):
        t0 = time.perf_counter()
        out = run_remote(path, a.crop, a.endpoint, a.key) if a.endpoint else run_local(path, a.crop, t)
        lat.append((time.perf_counter() - t0) * 1000)
        p = predicted(out)
        rows.append((label, p))
        outs.append((label, path, out))
        if a.endpoint is None and p != (label if label in GRADES else "retake") and "annotated" in out:
            cv2.imwrite(str(a.out / f"miss_{label}_as_{p}_{path.stem}.jpg"), out["annotated"])
    if not rows:
        sys.exit(f"No photos found under {a.data} (expected A/ B/ C/ other/ folders)")

    report = {"crop": a.crop, "where": a.endpoint or "local", **score(rows),
              "latency_ms": {"p50": round(statistics.median(lat), 1),
                             "p95": round(sorted(lat)[max(0, int(0.95 * len(lat)) - 1)], 1)}}

    if a.calibrate:
        best = None
        for b, c in itertools.product([0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.06],
                                      [0.05, 0.07, 0.10, 0.13, 0.16, 0.20]):
            if c <= b:
                continue
            tt = Thresholds(b_defect=b, c_defect=c)
            f1 = score([(y, regrade(o, tt)) for y, _, o in outs])["macro_f1"]
            if best is None or f1 > best[0]:
                best = (f1, b, c)
        f1, b, c = best
        target = Path(__file__).resolve().parents[1] / "chillvision" / "thresholds.json"
        target.write_text(json.dumps({"b_defect": b, "c_defect": c}, indent=2))
        report["calibrated"] = {"b_defect": b, "c_defect": c, "macro_f1_on_these_photos": f1,
                                "written_to": str(target),
                                "note": "Fitted on these photos: re-run on a separate test set for an honest score."}

    with open(a.out / "per_image.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["file", "label", "predicted", "action", "confidence", "pieces", "ms"])
        for (label, path, out) in outs:
            r = out.get("result") or {}
            w.writerow([path.name, label, predicted(out), out["next_action"]["type"], r.get("confidence"),
                        r.get("pieces"), out.get("total_ms")])
    (a.out / "report.json").write_text(json.dumps(report, indent=2))
    c = report["confusion"]
    md = [f"# ChillChain Vision evaluation: {a.crop}", "",
          f"- Photos: {report['photos']} ({report['graded_photos']} labelled A/B/C)",
          f"- Accuracy when graded: **{report['accuracy_when_graded'] * 100:.1f}%** · within one grade: {report['within_one_grade'] * 100:.1f}% · macro-F1: {report['macro_f1']}",
          f"- Retake requests on real produce: {report['retake_rate_on_produce']}",
          f"- 'other' photos correctly rejected: {report['other_rejected']}",
          f"- Latency ({report['where']}): p50 {report['latency_ms']['p50']} ms, p95 {report['latency_ms']['p95']} ms", "",
          "| true \\ predicted | A | B | C | retake |", "|---|---|---|---|---|"]
    md += [f"| {y} | {c[y]['A']} | {c[y]['B']} | {c[y]['C']} | {c[y]['retake']} |" for y in GRADES]
    if "calibrated" in report:
        md += ["", f"Calibrated thresholds: {report['calibrated']}"]
    (a.out / "report.md").write_text("\n".join(md) + "\n")
    print("\n".join(md))


if __name__ == "__main__":
    main()
