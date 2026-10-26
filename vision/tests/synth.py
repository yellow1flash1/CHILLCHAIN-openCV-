"""Synthetic produce photos for tests: fruit-like discs with skin texture, seeds, highlights,
bruises and mould on a textured background. Real-photo accuracy is measured with eval/evaluate.py."""
from __future__ import annotations
import cv2
import numpy as np

RED = (40, 35, 200)      # BGR strawberry red
GREEN = (60, 170, 90)
BG = (185, 190, 196)     # light grey tarp


def scene(n=9, colour=RED, bad=(), mould=(), bg=BG, size=(720, 960), radius=70, seed=1, cols=None):
    rng = np.random.default_rng(seed)
    h, w = size
    img = np.full((h, w, 3), bg, np.uint8)
    img = cv2.add(img, rng.normal(0, 4, img.shape).astype(np.int16).clip(-12, 12).astype(np.uint8) * 0)
    noise = rng.normal(0, 5, img.shape)
    img = np.clip(img.astype(float) + noise, 0, 255).astype(np.uint8)
    cols = cols or int(np.ceil(np.sqrt(n * w / h)))
    rows = int(np.ceil(n / cols))
    k = 0
    for r in range(rows):
        for c in range(cols):
            if k >= n:
                break
            cx = int((c + 0.5) * w / cols + rng.integers(-8, 8))
            cy = int((r + 0.5) * h / rows + rng.integers(-8, 8))
            rr = int(radius * rng.uniform(0.9, 1.1))
            col = colour[k] if isinstance(colour, list) else colour
            cv2.circle(img, (cx, cy), rr, col, -1, cv2.LINE_AA)
            # skin texture + seeds + highlight
            m = np.zeros((h, w), np.uint8); cv2.circle(m, (cx, cy), rr, 255, -1)
            tex = rng.normal(0, 8, img.shape)
            img = np.where(m[..., None] > 0, np.clip(img + tex, 0, 255), img).astype(np.uint8)
            for _ in range(25):
                a = rng.uniform(0, 2 * np.pi); d = rng.uniform(0, rr * 0.8)
                cv2.circle(img, (int(cx + d * np.cos(a)), int(cy + d * np.sin(a))), 2, (60, 150, 190), -1)
            cv2.circle(img, (cx - rr // 3, cy - rr // 3), rr // 7, (225, 225, 245), -1, cv2.LINE_AA)
            if k in bad:  # bruise: a dark brown patch ~15% of the fruit
                cv2.circle(img, (cx + rr // 4, cy + rr // 5), int(rr * 0.42), (25, 45, 70), -1, cv2.LINE_AA)
            if k in mould:  # grey fuzz
                pm = np.zeros((h, w), np.uint8); cv2.circle(pm, (cx + rr // 5, cy), int(rr * 0.35), 255, -1)
                fuzz = np.clip(rng.normal(175, 28, img.shape), 0, 255)
                fuzz[..., :] = fuzz[..., :1]
                img = np.where(pm[..., None] > 0, fuzz, img).astype(np.uint8)
            k += 1
    return cv2.GaussianBlur(img, (3, 3), 0)
