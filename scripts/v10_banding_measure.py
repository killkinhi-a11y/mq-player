#!/usr/bin/env python3
"""v10 — measure background banding: quantization steps in the blurred env.

Crops a horizontal line through the background (no UI), walks along it and
counts quantization "staircases" (runs of equal value followed by a jump) —
the signature of 8-bit color banding from blur(72px) + dark overlay.
"""
from PIL import Image
import numpy as np

BASE = "/home/z/my-project/download/qa-v10"
shot = np.asarray(Image.open(f"{BASE}/03-spatial-open.png").convert("RGB")).astype(np.int16)

# Background regions free of cards/UI:
#  - y=95..100 (below header, above deck top which starts ~148) full width
#  - y=640..660 between deck bottom (668? card bottom = 148+520=668) — use 690..700? controls start later
regions = {
  "top_bg (y=100)": shot[98:104, 60:1380],
  "left_bg (x<480, y 300..500)": shot[300:500, 60:470],
  "right_bg (x>950, y 300..500)": shot[300:500, 950:1390],
}

for name, crop in regions.items():
    # average over the crop's height → smooth 1-D profile per channel
    prof = crop.mean(axis=0)  # (width, 3)
    lum = prof.mean(axis=1)
    d = np.diff(lum)
    # staircase runs: consecutive near-zero diffs (|d|<0.06) then a jump
    flat = np.abs(d) < 0.06
    # count transitions flat->jump
    runs = 0
    in_flat = False
    for f in flat:
        if f and not in_flat:
            in_flat = True
        elif not f and in_flat:
            runs += 1
            in_flat = False
    jumps = int((np.abs(d) >= 0.06).sum())
    print(f"{name}: lum range {lum.min():.1f}..{lum.max():.1f} | flat->jump staircases={runs} | jump count={jumps} | max jump={np.abs(d).max():.3f}")

# Check the same for a SINGLE row to see pure quantization (no averaging):
row = shot[100, 60:1380].astype(np.int16).mean(axis=1)
d2 = np.diff(row)
q = np.abs(d2)
# 8-bit quantization: consecutive pixels with identical value
same = int((q == 0).sum())
print(f"single row y=100: identical-neighbour pixels={same}/1320, small steps (<1)={int(((q>0)&(q<1)).sum())}, steps>=1: {int((q>=1).sum())}")
print("row sample:", np.round(row[:60], 1))
