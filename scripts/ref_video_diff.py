#!/usr/bin/env python3
"""Where does the video change? Column-wise diff energy between key frames."""
from PIL import Image
import numpy as np
import os

VID = "/home/z/my-project/download/ref-analysis/refvid"
def load(n):
    return np.asarray(Image.open(os.path.join(VID, f"f-{n:03d}.png")).convert("L"), dtype=np.float32)

pairs = [(1, 4), (1, 12), (12, 24), (24, 35), (1, 35)]
W = None
for a, b in pairs:
    A, B = load(a), load(b)
    D = np.abs(A - B)
    col = D.mean(axis=0)
    # find changed x-regions (diff > threshold)
    th = col.max() * 0.35
    regions = []
    x = 0
    while x < len(col):
        if col[x] > th:
            x2 = x
            while x2 + 1 < len(col) and col[x2 + 1] > th * 0.6:
                x2 += 1
            regions.append((x, x2))
            x = x2 + 1
        else:
            x += 1
    # merge close regions
    merged = []
    for r in regions:
        if merged and r[0] - merged[-1][1] < 25:
            merged[-1] = (merged[-1][0], r[1])
        else:
            merged.append(list(r) if isinstance(r, tuple) else r)
    print(f"f{a:03d}->f{b:03d}  changed-x-regions: {[(int(a_),int(b_)) for a_,b_ in merged]}  maxdiff={col.max():.1f}")

# Also: row-wise diff to see vertical extent of change
A, B = load(1), load(12)
D = np.abs(A - B)
row = D.mean(axis=1)
th = row.max() * 0.3
ys = np.where(row > th)[0]
print(f"f001->f012 changed-y-range: {ys.min() if len(ys) else '-'}..{ys.max() if len(ys) else '-'} (frame h={A.shape[0]})")
