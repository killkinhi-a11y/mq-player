#!/usr/bin/env python3
"""Detect card gutters in reference video frames via dark channels."""
from PIL import Image
import numpy as np
import os

VID_DIR = "/home/z/my-project/download/ref-analysis/refvid"
files = sorted(f for f in os.listdir(VID_DIR) if f.endswith(".png"))

def gutters(path):
    im = np.asarray(Image.open(path).convert("L"), dtype=np.float32)
    h, w = im.shape
    y0, y1 = int(0.36 * h), int(0.88 * h)
    band = im[y0:y1, :]
    colmax = band.max(axis=0)
    # gutters: columns whose max brightness is low (dark full-height channel)
    dark = colmax < 28
    # group consecutive dark columns
    groups = []
    x = 0
    while x < w:
        if dark[x]:
            x2 = x
            while x2 + 1 < w and dark[x2 + 1]:
                x2 += 1
            groups.append((x, x2))
            x = x2 + 1
        else:
            x += 1
    return groups, w

print(f"{'frame':>10} {'t(s)':>5}  gutter-groups  ->  card spans (x0..x1, width)")
for f in files:
    idx = int(f.split("-")[1].split(".")[0])
    t = idx / 3.0
    groups, w = gutters(os.path.join(VID_DIR, f))
    # filter tiny groups (noise) — gutters should be >=4px wide at 1428 scale? frames are 1428x1020
    gg = [(a, b) for a, b in groups if b - a >= 3]
    spans = []
    prev_end = 0
    for a, b in gg:
        if a - prev_end > 40:  # card wider than 40px
            spans.append((prev_end, a, a - prev_end))
        prev_end = b + 1
    if w - prev_end > 40:
        spans.append((prev_end, w, w - prev_end))
    widths = [s[2] for s in spans]
    print(f"{f:>10} {t:>5.1f}  n={len(spans):>2}  widths={widths}  spans={[(s[0],s[1]) for s in spans]}")
