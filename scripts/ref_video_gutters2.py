#!/usr/bin/env python3
"""Numeric gutter detection: local minima in smoothed column brightness."""
from PIL import Image
import numpy as np
import os, sys

VID = "/home/z/my-project/download/ref-analysis/refvid"

def profile(path_or_img, y0f=0.32, y1f=0.70):
    if isinstance(path_or_img, str):
        im = np.asarray(Image.open(path_or_img).convert("L"), dtype=np.float32)
    else:
        im = path_or_img
    h, w = im.shape
    band = im[int(y0f * h):int(y1f * h), :]
    col = band.mean(axis=0)
    k = np.ones(9) / 9
    return np.convolve(col, k, mode="same"), w

def find_gutters(col, w, rel_th=0.55, min_gap_w=4):
    """Gutter = local minimum where col < rel_th * local plateau on both sides."""
    gutters = []
    n = len(col)
    win = int(w * 0.05)
    for x in range(10, n - 10):
        v = col[x]
        left = col[max(0, x - win):x - 3].max() if x > win else col[:x].max()
        right = col[x + 3:min(n, x + win)].max()
        if v < rel_th * min(left, right) and v < 14:
            if gutters and x - gutters[-1][-1] < 8:
                gutters[-1].append(x)
            else:
                gutters.append([x])
    out = []
    for g in gutters:
        c = sum(g) // len(g)
        out.append(c)
    # merge too-close gutters (<min_gap_w px at frame scale) keep first
    merged = []
    for c in out:
        if merged and c - merged[-1] < min_gap_w * 4:
            continue
        merged.append(c)
    return merged

def spans(guts, w, min_card=30):
    s = []
    prev = 0
    for g in guts:
        if g - prev > min_card:
            s.append((prev, g, g - prev))
        prev = g
    if w - prev > min_card:
        s.append((prev, w, w - prev))
    return s

for n in [1, 6, 12, 18, 24, 30, 35]:
    p = os.path.join(VID, f"f-{n:03d}.png")
    col, w = profile(p)
    g = find_gutters(col, w)
    sp = spans(g, w)
    print(f"f-{n:03d} t={(n-1)/3.0:4.1f}s  gutters={g}")
    print(f"        cards={[(a,b) for a,b,_ in sp]}  widths={[wd for _,_,wd in sp]}")

col, w = profile("/home/z/my-project/download/ref-analysis/reference.jpg")
g = find_gutters(col, w)
sp = spans(g, w)
print(f"STATIC  gutters={g}")
print(f"        cards={[(a,b) for a,b,_ in sp]}  widths={[wd for _,_,wd in sp]} (ref 1702w)")
