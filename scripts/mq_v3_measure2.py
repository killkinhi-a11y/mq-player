#!/usr/bin/env python3
"""v3 measurement with DOM-exact zones (screenshot @ scrollY 1392):
sec y55-739 x156-1284, card1 y259-551 x368-629, strip1 y259-551 x644-705,
preview y490-551, aurora y579-739."""
import numpy as np
from PIL import Image

MQ = "/home/z/my-project/download/playlist-ref-qa/desktop-final-v3.png"
g = np.asarray(Image.open(MQ).convert("RGB")).astype(float).mean(axis=2)
def zone(y0, y1, x0, x1): return g[y0:y1, x0:x1]

print("=== 1. VERTICAL TITLE (strip1) ===")
z = zone(261, 410, 646, 703)
base = np.median(zone(250, 545, 644, 705))
m = z > base + 22
if m.any():
    ys, xs = np.where(m)
    print(f"  thickness={xs.max()-xs.min()+1}px run={ys.max()-ys.min()+1}px strip_w=61px")
    print(f"  DOM: font 9px / 60.3px = 14.9%  [REF 14.8%]")

print("\n=== 2. CARD 1 PREVIEW (ref mean 91 p95 149; BEFORE 83.6/145.7) ===")
z = zone(492, 549, 371, 626)
print(f"  mean={z.mean():6.1f} std={z.std():5.1f} p95={np.percentile(z,95):6.1f} max={z.max():.0f}")

print("\n=== 3. ARTWORK BAND (ref mean 22 std 45 p95 124-164 max 255) ===")
for nm, y0, y1 in [("upper third", 579, 632), ("mid third", 632, 686), ("lower third", 686, 739), ("whole", 579, 737)]:
    z = zone(y0, y1, 160, 1280)
    print(f"  {nm:12s} mean={z.mean():6.1f} std={z.std():5.1f} p95={np.percentile(z,95):6.1f} p99={np.percentile(z,99):6.1f} max={z.max():5.0f}")
a = zone(579, 737, 160, 1280)
ps = {p: np.percentile(a, p) for p in (5, 25, 50, 75, 90, 95, 99)}
print("  percentiles: " + " ".join(f"p{p}={v:.0f}" for p, v in ps.items()))
print("  px> 60/90/120/150/180:", [(t, int((a > t).sum())) for t in (60, 90, 120, 150, 180)])

print("\n=== 4. UNCHANGED CHECKS ===")
z = zone(280, 400, 400, 620); print(f"  card1 surface   mean={z.mean():5.1f}  [~25-29]")
z = zone(420, 500, 646, 703); print(f"  strip1 surface  mean={z.mean():5.1f}  [~25]")
z = zone(520, 548, 646, 703); print(f"  strip1 icon     mean={z.mean():5.1f} p95={np.percentile(z,95):5.1f}  [~24 lum]")

print("\n=== 5. BAND VERTICAL PROFILE ===")
prof = zone(570, 740, 200, 1240).mean(axis=1)
print("  " + " ".join(f"{prof[i]:.0f}" for i in range(0, len(prof), 6)))
