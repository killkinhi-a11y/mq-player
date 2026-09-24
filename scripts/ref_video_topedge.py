#!/usr/bin/env python3
"""Find card top-edge row, then read card boundaries along it."""
from PIL import Image
import numpy as np
import os

VID = "/home/z/my-project/download/ref-analysis/refvid"

def analyze(n):
    im = np.asarray(Image.open(os.path.join(VID, f"f-{n:03d}.png")).convert("L"), dtype=np.float32)
    h, w = im.shape
    # Card row top edge: find row y in [0.30h, 0.50h] with max horizontal continuity of non-black pixels
    best_y, best_score = None, -1
    for y in range(int(0.28 * h), int(0.55 * h)):
        row = im[y]
        nz = (row > 14).sum()
        # score: long runs
        runs, cur = [], 0
        for v in row:
            if v > 14: cur += 1
            elif cur: runs.append(cur); cur = 0
        if cur: runs.append(cur)
        long_runs = sum(r for r in runs if r > 30)
        score = long_runs
        if score > best_score:
            best_score, best_y = score, y
    # profile along top edge (avg of 3 rows)
    band = im[best_y - 1:best_y + 2, :].mean(axis=0)
    # cards = runs of >14 separated by gaps
    cards = []
    x = 0
    while x < w:
        if band[x] > 14:
            x2 = x
            gap = 0
            while x2 < w:
                if band[x2] > 14:
                    gap = 0
                else:
                    gap += 1
                    if gap > 5: break
                x2 += 1
            end = x2 - gap + 1
            if end - x > 25:
                cards.append((x, end, end - x))
            x = end + 1
        else:
            x += 1
    return best_y, cards, w

print("top-edge row card boundaries (frame 1428px wide, left margin ~184, right ~1320):")
for n in [1, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 35]:
    y, cards, w = analyze(n)
    inner = [(a, b, wd) for a, b, wd in cards if 100 < a < 1400]
    print(f"f-{n:03d} t={(n-1)/3.0:4.1f}s y={y:4d}  n={len(inner)}  {inner}")
