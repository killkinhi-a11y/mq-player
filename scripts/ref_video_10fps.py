#!/usr/bin/env python3
"""ASCII per-frame at 10fps to watch the transition choreography (t=0.1..2.6s)."""
from PIL import Image
import numpy as np
import os

VID = "/home/z/my-project/download/ref-analysis/refvid10"
files = sorted(f for f in os.listdir(VID) if f.endswith(".png"))

def show(path, t):
    im = np.asarray(Image.open(path).convert("L"), dtype=np.float32)
    h, w = im.shape
    band = im[int(0.32 * h):int(0.70 * h), :]
    colmax = band.max(axis=0)
    step = max(1, w // 178)
    chars = []
    for x in range(0, w, step):
        v = colmax[x:x + step].mean()
        if v < 20: c = " "
        elif v < 40: c = "."
        elif v < 70: c = "-"
        elif v < 110: c = "+"
        elif v < 160: c = "*"
        else: c = "#"
        chars.append(c)
    return "".join(chars)

lines = []
for i, f in enumerate(files):
    t = (i + 1) / 10.0
    line = show(os.path.join(VID, f), t)
    lines.append((t, line))

# print only middle-left region chars 20..100 (card zone) to focus
print("t      |<-------------------- cards region (x 11%..57% of frame) -------------------->|")
for t, line in lines:
    print(f"{t:4.1f}s  |{line[20:100]}|")
