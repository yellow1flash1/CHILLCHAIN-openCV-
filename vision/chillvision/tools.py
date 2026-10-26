"""OpenCV 5 tools the grading agent calls.

Every function here is a plain, deterministic image operation with a small, inspectable result,
so the agent (agent.py) can decide what to call next from what it sees, and every step can be
written to the trace that judges and growers can read.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field

import cv2
import numpy as np

from .profiles import CropProfile, HueRange

WORK_SIDE = 800  # longest side used for analysis
GRADES = ("A", "B", "C")


# --------------------------------------------------------------------------- thresholds
@dataclass
class Thresholds:
    """Grading cut-offs. Defaults are starting values; `eval/evaluate.py --calibrate` fits them
    to the team's labelled photos and writes thresholds.json, which the service loads."""

    b_defect: float = 0.025  # share of a piece's skin with defects that makes it B
    c_defect: float = 0.10  # ... that makes it C
    c_mould: float = 0.02  # any visible mould above this makes it C
    blur_retake: float = 20.0  # p99 |Laplacian| below this: too blurry to grade
    blur_soft: float = 50.0  # below this: graded, but with lower confidence
    dark_retake: float = 40.0  # mean brightness (V) below this: too dark
    dim: float = 85.0  # below this: brighten (CLAHE) before grading
    glare_retake: float = 0.20  # share of blown-out pixels above this: retake
    min_coverage: float = 0.02  # produce must fill at least this share of the frame
    min_confidence: float = 0.6  # below this the grower confirms the grade (human in the loop)

    @classmethod
    def from_dict(cls, d: dict) -> "Thresholds":
        known = {k: float(v) for k, v in d.items() if k in cls.__dataclass_fields__}
        return cls(**known)


# --------------------------------------------------------------------------- image I/O
def decode(data: bytes) -> np.ndarray:
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("The file is not a readable image")
    return img


def to_work_size(img: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    s = WORK_SIDE / max(h, w)
    if s >= 1:
        return img
    return cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)


def encode_jpeg(img: np.ndarray, side: int = 640, quality: int = 80) -> bytes:
    h, w = img.shape[:2]
    s = min(1.0, side / max(h, w))
    if s < 1:
        img = cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError("JPEG encoding failed")
    return buf.tobytes()


# --------------------------------------------------------------------------- tool 1: capture check
@dataclass
class Capture:
    sharpness: float  # p99 of |Laplacian| on a 640 px grey image
    brightness: float  # mean V
    glare: float  # share of blown-out, colourless pixels
    colour_cast: float  # tint of near-grey pixels: largest relative deviation of a channel from grey
    width: int
    height: int


def assess_capture(img: np.ndarray) -> Capture:
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = g.shape
    s = 640 / max(h, w)
    if s < 1:
        g = cv2.resize(g, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA)
    lap = np.abs(cv2.Laplacian(g, cv2.CV_32F, ksize=3))
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    glare = float(np.mean((hsv[..., 2] >= 250) & (hsv[..., 1] <= 25)))
    means = _neutral_means(img, hsv)
    cast = 0.0 if means is None else float(np.max(np.abs(means / max(1e-6, means.mean()) - 1)))
    return Capture(
        sharpness=round(float(np.percentile(lap, 99)), 1),
        brightness=round(float(hsv[..., 2].mean()), 1),
        glare=round(glare, 4),
        colour_cast=round(cast, 3),
        width=img.shape[1],
        height=img.shape[0],
    )


def _neutral_means(img: np.ndarray, hsv: np.ndarray) -> np.ndarray | None:
    """Mean BGR of near-grey pixels (tarp, crate, table). The light's tint shows there, not on the
    fruit, so a frame full of red berries is not mistaken for a red cast. None if too few."""
    m = (hsv[..., 1] < 60) & (hsv[..., 2] > 50) & (hsv[..., 2] < 245)
    if np.mean(m) < 0.05:
        return None
    return img[m].reshape(-1, 3).astype(np.float64).mean(axis=0)


# --------------------------------------------------------------------------- tool 2: enhance
def enhance(img: np.ndarray, white_balance: bool, brighten: bool) -> np.ndarray:
    """White balance from neutral pixels and/or CLAHE on lightness, for dim or tinted photos."""
    out = img.astype(np.float32)
    means = _neutral_means(img, cv2.cvtColor(img, cv2.COLOR_BGR2HSV)) if white_balance else None
    if means is not None:
        out *= means.mean() / np.maximum(means, 1e-6)
    out = np.clip(out, 0, 255).astype(np.uint8)
    if brighten:
        lab = cv2.cvtColor(out, cv2.COLOR_BGR2LAB)
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        lab[..., 0] = clahe.apply(lab[..., 0])
        out = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    return out


# --------------------------------------------------------------------------- tool 3: segmentation
@dataclass
class Segmentation:
    method: str
    mask: np.ndarray = field(repr=False)
    coverage: float = 0.0
    border_touch: float = 0.0  # share of the image border covered by the mask
    separation: float = 0.0  # how clearly produce differs from the background (LAB units)
    ok: bool = False
    why: str = ""

    def summary(self) -> dict:
        return {
            "method": self.method,
            "coverage": round(self.coverage, 3),
            "border_touch": round(self.border_touch, 3),
            "separation": round(self.separation, 1),
            "ok": self.ok,
            "why": self.why,
        }


def _hue_mask(hsv: np.ndarray, ranges: list[HueRange], s_min: int = 45, v_min: int = 35) -> np.ndarray:
    m = np.zeros(hsv.shape[:2], np.uint8)
    for lo, hi in ranges:
        m |= cv2.inRange(hsv, (lo, s_min, v_min), (hi, 255, 255))
    return m


def _clean(mask: np.ndarray, close: int, min_area: int, value: np.ndarray | None = None) -> np.ndarray:
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close, close))
    m = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    # Fill small holes only (seeds, spots, highlights belong to the fruit); large holes are the gaps
    # between fruit in a crate and must stay open so pieces can be separated.
    contours, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    out = np.zeros_like(m)
    if hier is None:
        return out
    for i, c in enumerate(contours):
        if hier[0][i][3] < 0 and cv2.contourArea(c) >= min_area:
            cv2.drawContours(out, contours, i, 255, thickness=cv2.FILLED)
    tiny, big = 0.0008 * m.size, 0.012 * m.size
    for i, c in enumerate(contours):
        parent = hier[0][i][3]
        if parent < 0 or cv2.contourArea(contours[parent]) < min_area:
            continue
        a = cv2.contourArea(c)
        if a <= tiny:
            continue
        hull = cv2.contourArea(cv2.convexHull(c))
        solidity = a / hull if hull > 0 else 1.0
        shadow = False
        if value is not None:
            hm = np.zeros_like(m)
            cv2.drawContours(hm, contours, i, 255, thickness=cv2.FILLED)
            shadow = float(cv2.mean(value, mask=hm)[0]) < 55
        # Seeds, highlights and bruises are holes that stay part of the fruit. Large holes, very
        # dark ones (the shadowed gaps between touching fruit) and ragged ones are re-opened.
        if a > big or shadow or solidity < 0.7:
            cv2.drawContours(out, contours, i, 0, thickness=cv2.FILLED)
    return out


def _finish(method: str, mask: np.ndarray, separation: float, t: Thresholds) -> Segmentation:
    h, w = mask.shape
    coverage = float(np.count_nonzero(mask)) / (h * w)
    border = np.concatenate([mask[0], mask[-1], mask[:, 0], mask[:, -1]])
    touch = float(np.count_nonzero(border)) / border.size
    seg = Segmentation(method, mask, coverage, touch, separation)
    if coverage < t.min_coverage:
        seg.why = "too little produce found"
    elif method == "background" and touch > 0.55:
        seg.why = "produce fills the edges, so the edge is not background"
    elif method == "background" and separation < 14:
        seg.why = "produce and background look alike"
    elif coverage > 0.985 and method != "colour_prior":
        seg.why = "everything was selected"
    else:
        seg.ok = True
    return seg


def segment_background(img: np.ndarray, t: Thresholds, profile: CropProfile | None = None) -> Segmentation:
    """Assume the image border is background (tarp, table, crate floor) and keep what differs from it."""
    h, w = img.shape[:2]
    if profile is not None and profile.expected:
        # If the border itself is mostly this crop's colour, the produce fills the frame and the
        # border is not background: give up so the agent switches method.
        r0 = max(4, int(0.04 * min(h, w)))
        hsv0 = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        cm = _hue_mask(hsv0, profile.expected, 60, 60)
        ring0 = np.concatenate([cm[:r0].ravel(), cm[-r0:].ravel(), cm[:, :r0].ravel(), cm[:, -r0:].ravel()])
        if np.mean(ring0 > 0) > 0.4:
            seg = Segmentation("background", np.zeros((h, w), np.uint8))
            seg.why = "the photo's edges are produce, so there is no background to subtract"
            return seg
    lab = cv2.cvtColor(cv2.GaussianBlur(img, (5, 5), 0), cv2.COLOR_BGR2LAB).astype(np.float32)
    r = max(4, int(0.04 * min(h, w)))
    ring = np.concatenate(
        [lab[:r].reshape(-1, 3), lab[-r:].reshape(-1, 3), lab[:, :r].reshape(-1, 3), lab[:, -r:].reshape(-1, 3)]
    )
    bg = np.median(ring, axis=0)
    dist = np.linalg.norm(lab - bg, axis=2)
    d8 = cv2.normalize(dist, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    thr, m = cv2.threshold(d8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    fg, bgd = dist[m > 0], dist[m == 0]
    separation = float(fg.mean() - bgd.mean()) if fg.size and bgd.size else 0.0
    mask = _clean(m, 9, int(0.003 * h * w), cv2.cvtColor(img, cv2.COLOR_BGR2HSV)[..., 2])
    return _finish("background", mask, separation, t)


def segment_colour_prior(img: np.ndarray, profile: CropProfile, t: Thresholds) -> Segmentation:
    """Keep pixels with this crop's expected colours. Works for close-ups and full crates with no
    background in view."""
    h, w = img.shape[:2]
    hsv = cv2.cvtColor(cv2.GaussianBlur(img, (5, 5), 0), cv2.COLOR_BGR2HSV)
    m = _hue_mask(hsv, profile.expected, 60, 60)
    if profile.ripe_is_dark or profile.dark_ok:
        m |= cv2.inRange(hsv, (0, 40, 25), (179, 255, 90))
    mask = _clean(m, 7, int(0.003 * h * w), hsv[..., 2])
    return _finish("colour_prior", mask, 0.0, t)


def segment_grabcut(img: np.ndarray, seed: np.ndarray, t: Thresholds) -> Segmentation:
    """Refine a rough mask with GrabCut (graph cut on colour models), border as sure background."""
    h, w = img.shape[:2]
    s = 400 / max(h, w)
    small = cv2.resize(img, (round(w * s), round(h * s)), interpolation=cv2.INTER_AREA) if s < 1 else img
    sh, sw = small.shape[:2]
    sm = cv2.resize(seed, (sw, sh), interpolation=cv2.INTER_NEAREST)
    gc = np.where(sm > 0, cv2.GC_PR_FGD, cv2.GC_PR_BGD).astype(np.uint8)
    core = cv2.erode(sm, np.ones((9, 9), np.uint8))
    gc[core > 0] = cv2.GC_FGD
    r = max(3, int(0.03 * min(sh, sw)))
    gc[:r], gc[-r:], gc[:, :r], gc[:, -r:] = cv2.GC_BGD, cv2.GC_BGD, cv2.GC_BGD, cv2.GC_BGD
    if not np.any(gc == cv2.GC_FGD) and not np.any(gc == cv2.GC_PR_FGD):
        return _finish("grabcut", np.zeros((h, w), np.uint8), 0.0, t)
    bgm, fgm = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(small, gc, None, bgm, fgm, 4, cv2.GC_INIT_WITH_MASK)
    except cv2.error:
        return _finish("grabcut", np.zeros((h, w), np.uint8), 0.0, t)
    m = np.where((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    m = cv2.resize(m, (w, h), interpolation=cv2.INTER_NEAREST)
    return _finish("grabcut", _clean(m, 9, int(0.003 * h * w)), 0.0, t)


# --------------------------------------------------------------------------- tool 4: split into pieces
def split_pieces(img: np.ndarray, mask: np.ndarray, max_pieces: int = 300) -> list[np.ndarray]:
    """Separate touching fruit: peaks of the distance transform become seeds, and a watershed on the
    distance map (not on colour, since touching berries share a colour) draws the boundaries."""
    h, w = mask.shape
    min_area = max(150, int(0.0015 * h * w))
    dist = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
    n, comp = cv2.connectedComponents(mask)
    if n <= 1:
        return []
    comp_max = [float(dist[comp == i].max()) for i in range(1, n)]
    r = float(np.median([c for c in comp_max if c > 0] or [1.0]))
    k = max(5, int(1.2 * r)) | 1
    peaks = (dist >= cv2.dilate(dist, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))) & (dist > 0.45 * r)
    # Merge plateau pixels and near-duplicate peaks into one seed each.
    seeds = cv2.dilate(peaks.astype(np.uint8) * 255, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    seeds &= mask
    # Small blobs with no peak (a lone small fruit) still get one seed at their centre.
    for i, cm in enumerate(comp_max, start=1):
        region = comp == i
        if not np.any(seeds[region]):
            yx = np.unravel_index(np.argmax(np.where(region, dist, -1)), dist.shape)
            cv2.circle(seeds, (int(yx[1]), int(yx[0])), 2, 255, -1)
    _, markers = cv2.connectedComponents(seeds)
    markers = markers + 1
    markers[(mask > 0) & (seeds == 0)] = 0
    relief = cv2.normalize(-dist, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    markers = cv2.watershed(cv2.cvtColor(relief, cv2.COLOR_GRAY2BGR), markers.astype(np.int32))
    pieces: list[tuple[int, np.ndarray]] = []
    for label in np.unique(markers):
        if label <= 1:
            continue
        pm = ((markers == label) & (mask > 0)).astype(np.uint8) * 255
        a = int(np.count_nonzero(pm))
        if a >= min_area:
            pieces.append((a, pm))
    pieces.sort(key=lambda x: -x[0])
    return [p for _, p in pieces[:max_pieces]]


# --------------------------------------------------------------------------- tool 5: analyse pieces
@dataclass
class Piece:
    area: int
    centroid: tuple[int, int]
    ripe_frac: float
    unripe_frac: float
    match_frac: float  # share of skin in this crop's expected colours
    dark_frac: float
    brown_frac: float
    mould_frac: float
    defect_frac: float
    grade: str
    defect_mask: np.ndarray = field(repr=False, compare=False)

    def summary(self) -> dict:
        d = asdict(self)
        d.pop("defect_mask")
        return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in d.items()}


def _remove_small(m: np.ndarray, min_px: int) -> np.ndarray:
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    keep = np.zeros(n, bool)
    keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= min_px
    return np.where(keep[lab], 255, 0).astype(np.uint8)


def analyse_piece(img: np.ndarray, pmask: np.ndarray, profile: CropProfile, t: Thresholds) -> Piece:
    area = int(np.count_nonzero(pmask))
    diam = 2 * math.sqrt(area / math.pi)
    # Drop the rim: shadows and reflections at the edge of a fruit are not defects.
    er = max(1, int(0.06 * diam))
    inner = cv2.erode(pmask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * er + 1, 2 * er + 1)))
    if np.count_nonzero(inner) < 0.3 * area:
        inner = pmask
    inn = inner > 0
    n_in = max(1, int(np.count_nonzero(inn)))

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    L = lab[..., 0]
    V = hsv[..., 2]
    S = hsv[..., 1]
    medL = float(np.median(L[inn]))
    medV = float(np.median(V[inn]))

    # Colour shares (ripeness and "is this the right crop").
    if profile.ripe_is_dark:
        ripe = (V < 80) & (S > 25)
    else:
        ripe = _hue_mask(hsv, profile.ripe, 60, 40) > 0 if profile.ripe else np.zeros_like(inn)
    unripe = _hue_mask(hsv, profile.unripe, 50, 40) > 0 if profile.unripe else np.zeros_like(inn)
    if profile.key == "strawberry":  # white or pale-pink shoulders are unripe skin, not background
        unripe |= (S < 70) & (V > 150)
    expected = _hue_mask(hsv, profile.expected, 40, 30) > 0 if profile.expected else np.ones_like(inn)
    if profile.dark_ok or profile.ripe_is_dark:
        expected |= V < 90
    if profile.white_ok:
        expected |= S < 60

    # Dark spots and bruises: black-hat on lightness finds patches darker than their surroundings.
    # Highlights and seeds are clipped to the skin's usual lightness first, and everything outside the
    # piece is set to it, so only real depressions below normal skin count.
    k = max(7, int(0.3 * diam)) | 1
    Lc = np.where(pmask > 0, np.minimum(L, medL + 8), medL).astype(np.uint8)
    bh = cv2.morphologyEx(Lc, cv2.MORPH_BLACKHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    depth = max(40 if profile.dark_ok else 28, 0.25 * medL)
    dark = (bh > depth) & inn
    if not profile.dark_ok:
        dark |= (L < 0.5 * medL) & inn
    # Browning and rot: brown hues clearly darker than this fruit's own skin.
    brown = (hsv[..., 0] >= 5) & (hsv[..., 0] <= 25) & (S >= 50) & (V < 0.62 * medV) & inn
    # Mould: pale, grey and fuzzy (textured) patches on coloured skin. Smooth highlights are glare.
    if profile.white_ok:
        mould = np.zeros_like(inn)
    else:
        Lf = L.astype(np.float32)
        mu = cv2.blur(Lf, (7, 7))
        sd = np.sqrt(np.maximum(cv2.blur(Lf * Lf, (7, 7)) - mu * mu, 0))
        pale = (S < 45) & (V > 110) & (V < 245)
        mould = pale & (sd > 9) & inn

    min_px = max(12, int(0.0015 * area))
    dark_m = _remove_small(dark.astype(np.uint8) * 255, min_px)
    brown_m = _remove_small(brown.astype(np.uint8) * 255, min_px)
    mould_m = _remove_small(mould.astype(np.uint8) * 255, max(min_px, int(0.004 * area)))
    defect = cv2.bitwise_or(cv2.bitwise_or(dark_m, brown_m), mould_m)

    f = lambda m: float(np.count_nonzero(m & inn if m.dtype == bool else (m > 0) & inn)) / n_in  # noqa: E731
    dark_f, brown_f, mould_f, defect_f = f(dark_m), f(brown_m), f(mould_m), f(defect)
    ripe_f, unripe_f, match_f = f(ripe & inn), f(unripe & inn), f(expected & inn)

    if defect_f >= t.c_defect or mould_f >= t.c_mould:
        grade = "C"
    elif defect_f >= t.b_defect or (
        profile.full_colour_for_a is not None and ripe_f < profile.full_colour_for_a
    ):
        grade = "B"
    else:
        grade = "A"

    m = cv2.moments(pmask, binaryImage=True)
    c = (int(m["m10"] / m["m00"]), int(m["m01"] / m["m00"])) if m["m00"] else (0, 0)
    return Piece(area, c, ripe_f, unripe_f, match_f, dark_f, brown_f, mould_f, defect_f, grade, defect)


# --------------------------------------------------------------------------- lot-level summary
def lot_grade(grades: list[str]) -> str:
    """Grade a lot by its worst 10% of pieces, as buyers do."""
    if not grades:
        return "C"
    worst = sorted(grades, key=GRADES.index, reverse=True)
    return worst[max(0, math.ceil(0.1 * len(worst)) - 1)]


def ripeness_stage(pieces: list[Piece], profile: CropProfile) -> int | None:
    """1 unripe … 5 overripe, from colour (and darkening/browning for over-ripeness)."""
    if not profile.has_colour_model or not pieces:
        return None
    a = np.array([p.area for p in pieces], float)
    w = a / a.sum()
    rf = float(np.dot(w, [p.ripe_frac for p in pieces]))
    decay = float(np.dot(w, [p.brown_frac + 0.5 * p.dark_frac for p in pieces]))
    if decay > 0.08:
        return 5
    if rf < 0.2:
        return 1
    if rf < 0.55:
        return 2
    if decay > 0.03:
        return 4
    return 3


def uniformity(pieces: list[Piece]) -> int:
    if len(pieces) < 2:
        return 90
    a = np.array([p.area for p in pieces], float)
    cv_area = float(a.std() / a.mean())
    sd_colour = float(np.std([p.ripe_frac for p in pieces]))
    return int(round(max(0, min(100, 100 - 60 * min(1, cv_area) - 40 * min(1, 2 * sd_colour)))))


# --------------------------------------------------------------------------- annotation
TONE = {"A": (80, 175, 76), "B": (0, 170, 255), "C": (60, 60, 230)}  # BGR: green, amber, red


def annotate(img: np.ndarray, pieces: list[Piece], piece_masks: list[np.ndarray], header: str,
             remove: set[int] | None = None) -> np.ndarray:
    out = img.copy()
    overlay = out.copy()
    for p in pieces:
        overlay[p.defect_mask > 0] = (40, 40, 255)
    out = cv2.addWeighted(overlay, 0.55, out, 0.45, 0)
    thick = max(2, round(max(img.shape[:2]) / 300))
    for i, (p, pm) in enumerate(zip(pieces, piece_masks)):
        cs, _ = cv2.findContours(pm, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(out, cs, -1, TONE[p.grade], thick + (2 if remove and i in remove else 0))
        cv2.putText(out, p.grade, (p.centroid[0] - 8, p.centroid[1] + 8), cv2.FONT_HERSHEY_SIMPLEX,
                    0.8, (255, 255, 255), 3, cv2.LINE_AA)
        cv2.putText(out, p.grade, (p.centroid[0] - 8, p.centroid[1] + 8), cv2.FONT_HERSHEY_SIMPLEX,
                    0.8, TONE[p.grade], 2, cv2.LINE_AA)
    bar = np.full((34, out.shape[1], 3), 24, np.uint8)
    cv2.putText(bar, header[:90], (10, 23), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (240, 240, 240), 1, cv2.LINE_AA)
    return np.vstack([bar, out])
