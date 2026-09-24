#!/usr/bin/env python3
"""ASCII visualization of column brightness for precise card boundaries."""
from PIL import Image
import numpy as np
import os, sys

VID = "/home/z/my-project/download/ref-analysis/refvid"

def show(n):
    im = np.asarray(Image.open(os.path.join(VID, f"f-{n:03d}.png")).convert("L"), dtype=np.float32)
    h, w = im.shape
    band = im[int(0.32 * h):int(0.70 * h), :]
    # gutter detection: a column is "gap" if BOTH neighbors at some x-range are dark for the full height
    colmax = band.max(axis=0)
    # downsample to ~100 chars
    step = max(1, w // 178)
    chars = []
    for x in range(0, w, step):
        seg = colmax[x:x + step]
        v = seg.mean()
        if v < 20: c = " "        # very dark gap
        elif v < 40: c = "."      # dark
        elif v < 70: c = "-"      # dim content
        elif v < 110: c = "+"     # content
        elif v < 160: c = "*"     # bright
        else: c = "#"             # very bright
        chars.append(c)
    print(f"f-{n:03d} (t={(n-1)/3.0:4.1f}s): |{''.join(chars)}|")

for n in [1, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 35]:
    show(n)
