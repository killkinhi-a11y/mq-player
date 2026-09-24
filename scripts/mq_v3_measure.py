#!/usr/bin/env python3
"""v3 micro-pass measurement: title ratio + preview mean/p95 + band
mean/std/p95/max, vs reference targets. Viewport coords (1440x900),
section y104-788, card1 x368-629 y308-600, strip1 x644-705 y308-600,
preview y538-599, aurora y629-788 x156-1284."""
import numpy as np
from PIL import Image

MQ = "/home/z/my-project/download/playlist-ref-qa/desktop-final-v3.png"
im = Image.open(MQ).convert("RGB")
g = np.asarray(im).astype(float).mean(axis=2)

def zone(y0, y1, x0, x1):
    return g[y0:y1, x0:x1]

print("=== 1. VERTICAL TITLE (strip1, visual) ===")
# strip1 x644-705; title column is centered ~ x674.5 +/- 10
z = zone(310, 470, 646, 703)
thr = np.median(zone(300, 600, 644, 705)) + 22
m = z > thr
if m.any():
    ys, xs = np.where(m)
    thick = xs.max() - xs.min() + 1
    run = ys.max() - ys.min() + 1
    strip_w = 705 - 644
    print(f"  text col thickness={thick}px  run={run}px  strip_w={strip_w}px")
    print(f"  visual mass ratio (thick/strip_w) = {thick/strip_w*100:.1f}%   [REF 14.8%]")
    print(f"  font 9px => 9/60.3 = {9/60.3*100:.1f}% (DOM-verified)")
else:
    print("  no text detected!")

print("\n=== 2. CARD 1 PREVIEW BAND (ref mean 91, p95 149) ===")
z = zone(540, 598, 371, 626)
print(f"  mean={z.mean():6.1f}  std={z.std():5.1f}  p95={np.percentile(z,95):6.1f}  max={z.max():.0f}   [ref mean~91 p95~149]")

print("\n=== 3. ARTWORK BAND (ref mean 22, std 45, p95 124-164, max 255) ===")
for name, y0, y1 in [("upper (y635-700)", 635, 700), ("lower (y700-780)", 700, 780), ("whole (y632-786)", 632, 786)]:
    z = zone(y0, y1, 160, 1280)
    print(f"  {name:20s} mean={z.mean():6.1f} std={z.std():5.1f} p95={np.percentile(z,95):6.1f} p99={np.percentile(z,99):6.1f} max={z.max():5.0f}")

print("\n=== 3b. band histogram (bright streak pixels) ===")
a = zone(635, 785, 160, 1280)
print("  pixels> 60/90/120/150/180:", [(t, int((a > t).sum())) for t in (60, 90, 120, 150, 180)])

print("\n=== 4. UNCHANGED CHECKS ===")
z = zone(340, 420, 400, 600); print(f"  card1 surface      mean={z.mean():5.1f}  [ref 12.2, delta ~10]")
z = zone(460, 540, 646, 703); print(f"  strip1 surface     mean={z.mean():5.1f}  [ref 11-20]")
z = zone(562, 592, 646, 703); print(f"  strip1 icon zone   mean={z.mean():5.1f} p95={np.percentile(z,95):5.1f}  [icon ~24 lum]")
z = zone(150, 750, 0, 140);   print(f"  page bg            mean={z.mean():5.1f}  [ref 1.7]")

print("\n=== 5. BAND VERTICAL PROFILE (fade shape) ===")
col = zone(620, 790, 200, 1240).mean(axis=1)
print("  " + " ".join(f"{col[i]:.0f}" for i in range(0, len(col), 8)))
