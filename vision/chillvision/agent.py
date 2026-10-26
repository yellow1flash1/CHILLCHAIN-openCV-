"""The ChillChain grading agent: a perception → decision → action loop over OpenCV 5 tools.

The agent does not grade in one shot. It looks at the photo, decides which tool to run next from
what it has seen so far, and ends with one action for the grower:

    retake          the photo cannot be graded (blur, dark, glare, no produce, wrong crop),
                    with the exact fix to make
    confirm         the grade is uncertain, so the grower confirms it (human in the loop)
    sort_and_rescan a few bad pieces drag the whole lot down: pull the outlined pieces out,
                    sell them to a processor, and rescan the rest for a better grade
    accept          the grade is saved and the app's sell-by clock and route take over

Every tool call and decision is written to `trace`, so judges and growers can see why.
The policy is plain rules on measured values, which keeps it fast, cheap, offline-capable and
explainable; nothing here calls an LLM.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import cv2
import numpy as np

from . import tools
from .profiles import profile_for
from .tools import Thresholds

MAX_STEPS = 10


@dataclass
class Trace:
    steps: list[dict] = field(default_factory=list)
    _t0: float = field(default_factory=time.perf_counter)

    def add(self, tool: str, observed: dict[str, Any], decision: str, started: float) -> None:
        self.steps.append(
            {
                "step": len(self.steps) + 1,
                "tool": tool,
                "observed": observed,
                "decision": decision,
                "ms": round((time.perf_counter() - started) * 1000, 1),
            }
        )

    @property
    def total_ms(self) -> float:
        return round((time.perf_counter() - self._t0) * 1000, 1)


def _retake(code: str, hint: str) -> dict:
    return {"type": "retake", "code": code, "hint": hint}


def grade_image(img_bgr: np.ndarray, crop: str, t: Thresholds | None = None) -> dict:
    """Run the agent on one photo. Returns the result dict described in vision/README.md."""
    t = t or Thresholds()
    profile = profile_for(crop)
    trace = Trace()
    img = tools.to_work_size(img_bgr)

    def done(action: dict, **extra: Any) -> dict:
        return {
            "ok": action["type"] in ("accept", "sort_and_rescan", "confirm"),
            "crop": crop,
            "next_action": action,
            "trace": trace.steps,
            "total_ms": trace.total_ms,
            "opencv_version": cv2.__version__,
            "thresholds": t.__dict__,
            **extra,
        }

    # ---- step: is the photo good enough to grade at all?
    s0 = time.perf_counter()
    cap = tools.assess_capture(img)
    obs = cap.__dict__
    if cap.brightness < t.dark_retake:
        trace.add("assess_capture", obs, "too dark to grade → retake", s0)
        return done(_retake("dark", "The photo is too dark. Move into daylight or turn on a light, and try again."))
    if cap.glare > t.glare_retake:
        trace.add("assess_capture", obs, "too much glare → retake", s0)
        return done(_retake("glare", "Strong glare hides the skin. Tilt the phone or move out of direct sun, and try again."))
    if cap.sharpness < t.blur_retake:
        trace.add("assess_capture", obs, "too blurry to grade → retake", s0)
        return done(_retake("blur", "The photo is blurry. Hold the phone still for a second, tap to focus, and try again."))
    dim = cap.brightness < t.dim
    cast = cap.colour_cast > 0.18
    trace.add(
        "assess_capture",
        obs,
        "usable; " + ("enhance first (" + ", ".join(x for x, y in (("dim", dim), ("colour cast", cast)) if y) + ")" if dim or cast else "grade as is"),
        s0,
    )

    # ---- step: fix lighting before measuring colour
    if dim or cast:
        s0 = time.perf_counter()
        img = tools.enhance(img, white_balance=cast, brighten=dim)
        after = tools.assess_capture(img)
        trace.add("enhance", {"white_balance": cast, "clahe": dim, "brightness_after": after.brightness,
                              "colour_cast_after": after.colour_cast}, "lighting corrected → segment", s0)

    # ---- step: find the produce, switching method when one fails
    seg = None
    tried: list[str] = []
    plan = ["background"] + (["colour_prior"] if profile.expected else []) + ["grabcut"]
    for method in plan:
        if len(trace.steps) >= MAX_STEPS:
            break
        s0 = time.perf_counter()
        if method == "background":
            cand = tools.segment_background(img, t, profile)
        elif method == "colour_prior":
            cand = tools.segment_colour_prior(img, profile, t)
        else:
            seed = seg.mask if seg is not None and np.any(seg.mask) else _rough_seed(img)
            cand = tools.segment_grabcut(img, seed, t)
        tried.append(method)
        nxt = plan[plan.index(method) + 1] if plan.index(method) + 1 < len(plan) else None
        if cand.ok:
            trace.add(f"segment[{method}]", cand.summary(), "produce found → split into pieces", s0)
            seg = cand
            break
        trace.add(f"segment[{method}]", cand.summary(),
                  f"{cand.why} → try {nxt}" if nxt else f"{cand.why} → no method left", s0)
        seg = cand if seg is None or cand.coverage > seg.coverage else seg
    if seg is None or not seg.ok:
        return done(_retake("no_produce", "Couldn't find the produce. Move closer so the fruit fills most of the frame, on a plain surface if you can."))

    # ---- step: separate touching pieces
    s0 = time.perf_counter()
    masks = tools.split_pieces(img, seg.mask)
    if not masks:
        trace.add("split_pieces", {"pieces": 0}, "nothing large enough → retake", s0)
        return done(_retake("no_produce", "The pieces are too small in the photo. Move closer and try again."))
    trace.add("split_pieces", {"pieces": len(masks), "method": "distance transform + watershed"},
              "measure each piece", s0)

    # ---- step: measure colour and defects on every piece
    s0 = time.perf_counter()
    pieces = [tools.analyse_piece(img, m, profile, t) for m in masks]
    total = sum(p.area for p in pieces)
    match = sum(p.match_frac * p.area for p in pieces) / total
    defect = sum(p.defect_frac * p.area for p in pieces) / total
    counts = {g: sum(p.grade == g for p in pieces) for g in tools.GRADES}
    trace.add("analyse_pieces", {"grades": counts, "colour_match": round(match, 3),
                                 "defect_share": round(defect, 4)}, "decide", s0)

    if profile.has_colour_model and match < 0.25:
        trace.add("decide", {"colour_match": round(match, 3)}, f"colours don't match {crop} → retake", time.perf_counter())
        return done(_retake("not_crop", f"This doesn't look like {crop.replace('_', ' ')}. Check the crop you picked, fill the frame with it, and try again."))

    grades = [p.grade for p in pieces]
    grade = tools.lot_grade(grades)
    ripe = tools.ripeness_stage(pieces, profile)
    uni = tools.uniformity(pieces)

    # ---- confidence: photo quality, segmentation, colour match, how close the call was
    conf = 1.0
    conf *= 0.6 + 0.4 * min(1.0, cap.sharpness / t.blur_soft)
    if seg.method != "background":
        conf *= 0.92
    if profile.has_colour_model:
        conf *= min(1.0, max(0.3, (match - 0.25) / 0.45))
    worst = sorted(pieces, key=lambda p: -p.defect_frac)[max(0, -(-len(pieces) // 10) - 1)]
    d = worst.defect_frac
    margin = min(abs(d - t.b_defect) / t.b_defect, abs(d - t.c_defect) / t.c_defect)
    conf *= 0.75 + 0.25 * min(1.0, 2 * margin)
    if len(pieces) == 1 and profile.small:
        conf *= 0.8
    conf = round(conf, 2)

    defects = _defect_phrases(pieces)
    reason = _reason(grade, counts, defect, ripe, profile.full_colour_for_a, pieces)
    result = {
        "is_crop": True,
        "grade": grade,
        "confidence": conf,
        "ripeness": ripe,
        "uniformity": uni,
        "pieces": len(pieces),
        "piece_grades": counts,
        "defect_share": round(defect, 4),
        "colour_match": round(match, 3),
        "segmentation": seg.method,
        "defects": defects,
        "reason": reason,
    }

    # ---- decide the action
    remove: set[int] = set()
    s0 = time.perf_counter()
    if conf < t.min_confidence:
        action = {"type": "confirm", "suggested_grade": grade,
                  "hint": f"Not fully sure from this photo (confidence {int(conf * 100)}%). It looks like grade {grade}: confirm or change it."}
        trace.add("decide", {"confidence": conf, "min": t.min_confidence}, "uncertain → ask the grower to confirm", s0)
    else:
        sorted_idx = sorted(range(len(pieces)), key=lambda i: tools.GRADES.index(pieces[i].grade), reverse=True)
        action = {"type": "accept"}
        for k in range(1, max(1, int(0.3 * len(pieces))) + 1):
            if len(pieces) < 4:
                break
            keep = [pieces[i].grade for i in sorted_idx[k:]]
            better = tools.lot_grade(keep)
            if tools.GRADES.index(better) < tools.GRADES.index(grade) and pieces[sorted_idx[k - 1]].grade != better:
                # remove every piece worse than the improved grade
                remove = {i for i in sorted_idx if tools.GRADES.index(pieces[i].grade) > tools.GRADES.index(better)}
                if len(remove) <= 0.3 * len(pieces):
                    action = {"type": "sort_and_rescan", "remove": len(remove), "grade_if_sorted": better,
                              "hint": f"{len(remove)} of {len(pieces)} pieces (outlined thick) pull this lot down to grade {grade}. "
                                      f"Take them out for a processor and scan the rest again: it should grade {better}."}
                break
        if action["type"] == "accept":
            bad = [i for i in range(len(pieces)) if pieces[i].grade == "C" and grade != "C"]
            if bad:
                remove = set(bad)
                action = {"type": "accept", "flagged": len(bad),
                          "hint": f"Saved as grade {grade}. {len(bad)} piece(s) outlined thick look spoiled: pull them out before packing."}
        if action["type"] == "sort_and_rescan":
            trace.add("decide", {"lot_grade": grade, "if_sorted": action["grade_if_sorted"], "remove": action["remove"]},
                      "a few bad pieces set the grade → sort and rescan", s0)
        else:
            trace.add("decide", {"lot_grade": grade, "confidence": conf, "flagged": action.get("flagged", 0)},
                      "confident → save grade; sell-by clock and route follow"
                      + ("; flag spoiled pieces to pull out" if action.get("flagged") else ""), s0)

    header = f"Lot {grade} | {len(pieces)} pcs | defects {defect * 100:.1f}% | conf {int(conf * 100)}% | OpenCV {cv2.__version__}"
    annotated = tools.annotate(img, pieces, masks, header, remove)
    return done(action, result=result, annotated=annotated, pieces_detail=[p.summary() for p in pieces[:50]])


def _rough_seed(img: np.ndarray) -> np.ndarray:
    """Centre-weighted seed for GrabCut when nothing else found the produce."""
    h, w = img.shape[:2]
    m = np.zeros((h, w), np.uint8)
    cv2.ellipse(m, (w // 2, h // 2), (int(w * 0.35), int(h * 0.35)), 0, 0, 360, 255, -1)
    return m


def _defect_phrases(pieces: list[tools.Piece]) -> list[str]:
    n = len(pieces)
    out = []
    for key, label in (("dark_frac", "dark spots or bruises"), ("brown_frac", "browning or rot"),
                       ("mould_frac", "possible mould")):
        k = sum(getattr(p, key) > 0.01 for p in pieces)
        if k:
            out.append(f"{label} on {k} of {n} pieces")
    c = sum(p.grade == "C" for p in pieces)
    if c:
        out.append(f"{c} of {n} pieces at processing grade")
    return out[:5]


def _reason(grade: str, counts: dict, defect: float, ripe: int | None, full: float | None,
            pieces: list[tools.Piece]) -> str:
    n = sum(counts.values())
    if grade == "A":
        return f"All {n} pieces look clean and even; defects cover {defect * 100:.1f}% of the skin."
    if grade == "B" and full is not None and all(p.defect_frac < 0.025 for p in pieces if p.grade == "B"):
        return "Clean, but some pieces are not fully coloured, so this is grade B for local retail."
    worst = counts["C"] if grade == "C" else counts["B"] + counts["C"]
    return (f"{worst} of {n} pieces show defects (about {defect * 100:.1f}% of the skin overall); "
            f"buyers grade a lot by its worst pieces, so this is grade {grade}.")
