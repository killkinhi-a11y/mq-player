#!/usr/bin/env python3
"""v10 — periodicity check: GPU-blur banding = REGULAR staircase period
(~4-8px). A healthy smooth gradient = no dominant period."""
from PIL import Image
import numpy as np

BASE = "/home/z/my-project/download/qa-v10"

def periodicity(path, tag):
    shot = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
    print(f"== {tag} ==")
    for name, (y0, y1, x0, x1) in {
        "top_bg": (98, 104, 60, 1380),
        "left_bg": (300, 500, 60, 470),
    }.items():
        prof = shot[y0:y1, x0:x1].mean(axis=0).mean(axis=1)
        d = np.diff(prof)
        d = d - d.mean()
        if np.abs(d).max() < 1e-9:
            print(f"  {name}: FLAT")
            continue
        f = np.abs(np.fft.rfft(d))
        # dominant frequency among k=2..20 (period 66..6.6px over 1320 samples)
        band = f[2:21]
        k = int(np.argmax(band)) + 2
        ratio = float(f[k] / (f.sum() + 1e-9))
        # neighbour-balance: how much of the spectrum is the peak+harmonics
        print(f"  {name}: dominant period={len(d)/k:.1f}px ratio={ratio:.3f}")
    # also single row (pure pixel-level quantization view)
    row = shot[100, 60:1380].mean(axis=1)
    q = np.diff(row)
    same = int((np.abs(q) < 0.51).sum())
    print(f"  single row: {same}/1320 near-identical neighbours ({same/1320*100:.0f}%)")

periodicity(f"{BASE}/03-spatial-open.png", "BEFORE v9 blur(72px)")
periodicity(f"{BASE}/12-spatial-normal.png", "AFTER v10 canvas")
