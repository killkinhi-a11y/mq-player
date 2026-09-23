#!/usr/bin/env python3
"""Pass 2: precise card boundaries in the card row (y 330-900) of the reference."""
import numpy as np
from PIL import Image, ImageDraw

SRC = "/home/z/my-project/download/ref-analysis/reference.jpg"
OUT = "/home/z/my-project/download/ref-analysis"
im = Image.open(SRC).convert("RGB")
W, H = im.size
rgb = np.asarray(im).astype(float)
gray = rgb.mean(axis=2)

# ---- Card row band: find precise vertical edges (x) ----
# cards have hairline borders + slightly-elevated bg. Scan y=340..880.
y0, y1 = 340, 880
band = gray[y0:y1, :]
colmean = band.mean(axis=0)

# border score per column: max abs diff to neighbor +-2..4 within band rows
diff = np.zeros(W)
for x in range(3, W - 3):
    d = np.abs(band[:, x] - (band[:, x - 3] + band[:, x + 3]) / 2)
    diff[x] = (d > 5).sum()

# columns where many rows show a thin light line (border)
cand = [(x, diff[x]) for x in range(3, W - 3) if diff[x] > (y1 - y0) * 0.45]
merged = []
for x, s in cand:
    if merged and x - merged[-1][0] <= 4:
        merged[-1] = ((merged[-1][0] + x) // 2, max(merged[-1][1], s))
    else:
        merged.append((x, s))
print("=== CARD-ROW vertical borders (x, %W, score) ===")
for x, s in merged:
    print(f"  x={x:4d} ({x/W*100:5.1f}%) score={s}")

# ---- Card row band: horizontal edges (y) ----
rowband = gray[:, 200:1500]
rowdiff = np.zeros(H)
for y in range(3, H - 3):
    d = np.abs(rowband[y, :] - (rowband[y - 3, :] + rowband[y + 3, :]) / 2)
    rowdiff[y] = (d > 5).sum()
candh = [(y, rowdiff[y]) for y in range(3, H - 3) if rowdiff[y] > 1300 * 0.35]
mergedh = []
for y, s in candh:
    if mergedh and y - mergedh[-1][0] <= 4:
        mergedh[-1] = ((mergedh[-1][0] + y) // 2, max(mergedh[-1][1], s))
    else:
        mergedh.append((y, s))
print("=== CARD-ROW horizontal borders (y, %H, score) ===")
for y, s in mergedh:
    print(f"  y={y:4d} ({y/H*100:5.1f}%) score={s}")

# ---- Card background vs page bg: column brightness steps ----
# average brightness of x-slices in band (to see elevated card bg)
print("=== column brightness profile (y340-880, per 16px) ===")
prof = []
for x in range(0, W - 16, 16):
    v = band[:, x:x + 16].mean()
    prof.append((x, v))
line = "  " + " ".join(f"{x}:{v:.0f}" for x, v in prof)
print(line)

# ---- light blocks (brightness > 70 areas) bounding boxes ----
light = gray > 70
# clean noise: require 8x8 solid
from scipy import ndimage  # noqa
lab, n = ndimage.label(light)
print("=== LIGHT regions > 3000px2 ===")
for i in range(1, n + 1):
    ys, xs = np.where(lab == i)
    if len(ys) < 3000:
        continue
    print(f"  bbox x:{xs.min()}-{xs.max()} ({xs.min()/W*100:.1f}-{xs.max()/W*100:.1f}%) "
          f"y:{ys.min()}-{ys.max()} ({ys.min()/H*100:.1f}-{ys.max()/H*100:.1f}%) area={len(ys)}")

# ---- crops for VLM zoom passes ----
crops = {
    "z-card1.png":   (140, 330, 720, 900),    # expanded card zone
    "z-strips.png":  (680, 330, 1520, 900),   # strip cards zone
    "z-headline.png": (300, 60, 1400, 330),   # headline zone
    "z-bottom.png":  (0, 860, W, H),          # bottom artwork
}
for name, (a, b, c, d) in crops.items():
    im.crop((a, b, c, d)).save(f"{OUT}/{name}")
    print("saved", name, (a, b, c, d))

# annotated version: draw detected borders on image copy
an = im.copy()
dr = ImageDraw.Draw(an)
for x, s in merged:
    dr.line([(x, y0), (x, y1)], fill=(0, 255, 120), width=2)
    dr.text((x + 3, y0 + 6), str(x), fill=(0, 255, 120))
for y, s in mergedh:
    dr.line([(150, y), (1550, y)], fill=(0, 200, 255), width=2)
    dr.text((1555, y - 10), f"y{y}", fill=(0, 200, 255))
an.save(f"{OUT}/ref-borders.png")
print("saved ref-borders.png")
