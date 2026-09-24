#!/usr/bin/env python3
"""v10 — verify the banding FIX: same background regions as the BEFORE
measurement (v10_banding_measure.py), now on the canvas backdrop build."""
from PIL import Image
import numpy as np

BASE = "/home/z/my-project/download/qa-v10"

def measure(path, tag):
    shot = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
    regions = {
      "top_bg (y=100)": shot[98:104, 60:1380],
      "left_bg": shot[300:500, 60:470],
      "right_bg": shot[300:500, 950:1390],
    }
    print(f"== {tag} ==")
    for name, crop in regions.items():
        prof = crop.mean(axis=0)
        lum = prof.mean(axis=1)
        d = np.diff(lum)
        flat = np.abs(d) < 0.06
        runs = 0
        in_flat = False
        for f in flat:
            if f and not in_flat: in_flat = True
            elif not f and in_flat: runs += 1; in_flat = False
        jumps = int((np.abs(d) >= 0.06).sum())
        print(f"  {name}: lum {lum.min():.1f}..{lum.max():.1f} staircases={runs} jumps={jumps} maxjump={np.abs(d).max():.3f}")

measure(f"{BASE}/03-spatial-open.png", "BEFORE (v9: img filter blur(72px))")
measure(f"{BASE}/12-spatial-normal.png", "AFTER (v10: canvas backdrop)")
