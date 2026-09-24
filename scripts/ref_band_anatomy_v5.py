#!/usr/bin/env python3
"""Reference band deep anatomy for v5 synthetic streak design:
horizontal brightness profile (where clusters sit), vertical profile,
column run-widths at several x positions."""
import numpy as np
from PIL import Image

ref = np.asarray(Image.open("/home/z/my-project/download/ref-analysis/reference.jpg").convert("RGB")).astype(float).mean(axis=2)
band = ref[860:1219, :]  # 359 x 1702

H, W = band.shape
print(f"band {W}x{H}")

# ── horizontal profile (20 columns) ──
print("\n=== HORIZONTAL PROFILE (x-tenths, mean | px>150 %%) ===")
for k in range(10):
    z = band[:, int(k*W/10):int((k+1)*W/10)]
    print(f"  x{k*10:>3}-{(k+1)*10:<3} mean={z.mean():5.1f}  px>150={(z>150).mean()*100:4.1f}%  px>180={(z>180).mean()*100:4.1f}%  max={z.max():.0f}")

# ── vertical profile ──
print("\n=== VERTICAL PROFILE (y-tenths, mean) ===")
for k in range(10):
    z = band[int(k*H/10):int((k+1)*H/10), :]
    print(f"  y{k*10:>3}-{(k+1)*10:<3} mean={z.mean():5.1f}  px>150={(z>150).mean()*100:4.1f}%")

# ── column runs: at several x positions, find vertical runs of bright px ──
print("\n=== BRIGHT RUNS per column (px>120 runs >2px, y-offset from band top) ===")
for x in range(80, W, 160):
    col = band[:, x]
    runs, start = [], None
    for y, v in enumerate(col):
        if v > 120 and start is None:
            start = y
        elif v <= 120 and start is not None:
            if y - start > 2: runs.append((start, y - start, int(col[start:y].max())))
            start = None
    if start is not None and H - start > 2:
        runs.append((start, H - start, int(col[start:H].max())))
    print(f"  x={x:>4}: " + (" | ".join(f"y{r[0]}:{r[1]}px@{r[2]}" for r in runs) if runs else "dark"))

# ── overall stats for the record ──
print("\n=== OVERALL ===")
z = band
print(f"mean={z.mean():.1f} std={z.std():.1f} p50={np.percentile(z,50):.0f} p75={np.percentile(z,75):.0f} "
      f"p95={np.percentile(z,95):.0f} p99={np.percentile(z,99):.0f} max={z.max():.0f}")
print(f"px>150={(z>150).mean()*100:.2f}%  px>180={(z>180).mean()*100:.2f}%  px>220={(z>220).mean()*100:.2f}%")
