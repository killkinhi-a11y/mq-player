#!/usr/bin/env python3
"""v2 visual measurement vs reference targets."""
import numpy as np
from PIL import Image

MQ = "/home/z/my-project/download/playlist-ref-qa/desktop-section-v2.png"
g = np.asarray(Image.open(MQ).convert("RGB")).astype(float).mean(axis=2)

def zone(y0, y1, x0, x1):
    return g[y0:y1, x0:x1]

print("=== MQ v2 vs REFERENCE (target) ===")
checks = [
    # name, y0,y1,x0,x1, ref-value, verdict-threshold
    ("expanded surface (mid, y340-420)", 340, 420, 400, 600, "ref 12.2 / bg-delta 10.5"),
    ("strip1 surface (below title, y450-540)", 450, 540, 648, 700, "ref 11-20"),
    ("expanded preview band (y540-594)", 540, 594, 372, 625, "ref mean 91"),
    ("strip1 icon (y560-592 x646-702)", 560, 592, 646, 702, "ref ~24 lum"),
    ("aurora y630-700", 630, 700, 200, 1240, "ref mean 22 std 45 p95 124"),
    ("aurora y700-780", 700, 780, 200, 1240, "ref mean 17 std 45 p95 135"),
]
for name, y0, y1, x0, x1, ref in checks:
    z = zone(y0, y1, x0, x1)
    print(f"  {name:40s} mean={z.mean():6.1f} std={z.std():5.1f} p95={np.percentile(z,95):6.1f} max={z.max():5.0f}   [{ref}]")

print("\n=== aurora contrast check (bright streaks?) ===")
a = zone(650, 780, 200, 1240)
print(f"  p99={np.percentile(a,99):.0f} (ref max 255, p95 124-164 — need bright streaks)")
hist = [(int(t), int((a > t).sum())) for t in (60, 90, 120, 150)]
print(f"  pixels>60/90/120/150: {hist}")

print("\n=== negative space: headline->row, row->aurora ===")
# column profile at x 400-600 (empty area of expanded card zone above row? no — between headline and row, x any)
col = g[150:330, 400:1000].mean(axis=1)
print("  y150-330 profile (should be bg-flat until ~305):", " ".join(f"{col[i]:.0f}" for i in range(0, len(col), 20)))
row_bot = 597
aur = g[600:650, 300:1100].mean(axis=1)
print("  y600-650 (row bottom -> aurora):", " ".join(f"{aur[i]:.0f}" for i in range(0, len(aur), 6)))
