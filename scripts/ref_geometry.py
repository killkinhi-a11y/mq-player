#!/usr/bin/env python3
"""Factual geometry analysis of the Pinterest reference image.
Detects structural hairlines, block boundaries, activity regions.
Outputs: percentages + ASCII density map + grid overlay for VLM.
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFont

SRC = "/home/z/my-project/download/ref-analysis/reference.jpg"
OUT_DIR = "/home/z/my-project/download/ref-analysis"

im = Image.open(SRC).convert("RGB")
W, H = im.size
rgb = np.asarray(im).astype(float)
gray = rgb.mean(axis=2)
sat = (rgb.max(axis=2) - rgb.min(axis=2))

# ---------- 1. Structural line detection (long thin runs) ----------
def vertical_lines(gray, min_run, edge_thr=6.0):
    """Columns containing a long vertical light/dark line."""
    H_, W_ = gray.shape
    # difference between column and neighbors 3px away
    left = np.roll(gray, 3, axis=1)
    right = np.roll(gray, -3, axis=1)
    d = np.zeros_like(gray)
    d[:, 3:-3] = gray[:, 3:-3] - (left[:, 3:-3] + right[:, 3:-3]) / 2
    hits = []
    for x in range(3, W_ - 3):
        col = np.abs(d[:, x])
        # contiguous run above threshold
        m = col > edge_thr
        if not m.any():
            continue
        best = cur = 0
        for v in m:
            cur = cur + 1 if v else 0
            best = max(best, cur)
        if best >= min_run:
            hits.append((x, best))
    # merge adjacent columns (line 1-3px wide)
    merged = []
    for x, run in hits:
        if merged and x - merged[-1][0] <= 3:
            merged[-1] = ((merged[-1][0] + x) // 2, max(merged[-1][1], run))
        else:
            merged.append((x, run))
    return merged

def horizontal_lines(gray, min_run, edge_thr=6.0):
    H_, W_ = gray.shape
    up = np.roll(gray, 3, axis=0)
    dn = np.roll(gray, -3, axis=0)
    d = np.zeros_like(gray)
    d[3:-3, :] = gray[3:-3, :] - (up[3:-3, :] + dn[3:-3, :]) / 2
    hits = []
    for y in range(3, H_ - 3):
        row = np.abs(d[y, :])
        m = row > edge_thr
        if not m.any():
            continue
        best = cur = 0
        for v in m:
            cur = cur + 1 if v else 0
            best = max(best, cur)
        if best >= min_run:
            hits.append((y, best))
    merged = []
    for y, run in hits:
        if merged and y - merged[-1][0] <= 3:
            merged[-1] = ((merged[-1][0] + y) // 2, max(merged[-1][1], run))
        else:
            merged.append((y, run))
    return merged

vlines = vertical_lines(gray, min_run=int(H * 0.15))
hlines = horizontal_lines(gray, min_run=int(W * 0.10))

print("=== VERTICAL structural lines (x, run%%) ===")
for x, run in vlines:
    print(f"  x={x:4d} ({x / W * 100:5.1f}%)  run={run}px ({run / H * 100:4.1f}% of H)")
print("=== HORIZONTAL structural lines (y, run%%) ===")
for y, run in hlines:
    print(f"  y={y:4d} ({y / H * 100:5.1f}%)  run={run}px ({run / W * 100:4.1f}% of W)")

# ---------- 2. Activity / block map ----------
# local std in 16px cells -> classify: flat bg vs content
cell = 16
gh, gw = H // cell, W // cell
act = np.zeros((gh, gw))
satm = np.zeros((gh, gw))
brt = np.zeros((gh, gw))
for gy in range(gh):
    for gx in range(gw):
        blk = gray[gy * cell:(gy + 1) * cell, gx * cell:(gx + 1) * cell]
        sblk = sat[gy * cell:(gy + 1) * cell, gx * cell:(gx + 1) * cell]
        act[gy, gx] = blk.std()
        satm[gy, gx] = sblk.mean()
        brt[gy, gx] = blk.mean()

# ASCII map: '#' strong structure/artwork, '+' medium, '.' flat
print("\n=== ACTIVITY MAP (each char = %dpx; %d cols x %d rows) ===" % (cell, gw, gh))
header = "     " + "".join(str((i // 10) % 10) if i % 5 == 0 else " " for i in range(gw))
print(header)
for gy in range(gh):
    row = ""
    for gx in range(gw):
        a, s = act[gy, gx], satm[gy, gx]
        if a > 40 or s > 60:
            row += "#"
        elif a > 18 or s > 25:
            row += "+"
        elif brt[gy, gx] > 60:
            row += "-"   # light flat area (light bg region)
        else:
            row += "."
    print(f"{gy * cell:4d} {row}")

# column occupancy of "content" (activity or saturation)
content = (act > 18) | (satm > 25)
col_occ = content.mean(axis=0)
row_occ = content.mean(axis=1)

print("\n=== COLUMN content-occupancy (per 32px col-band, % width: % cells active) ===")
band = 2
for gx in range(0, gw, band):
    v = col_occ[gx:gx + band].mean() * 100
    bar = "#" * int(v / 4)
    print(f"  x {gx * cell:4d}-{(gx + band) * cell:4d} ({gx * cell / W * 100:4.1f}-{min((gx + band) * cell, W) / W * 100:4.1f}%): {v:5.1f}% {bar}")

print("\n=== ROW content-occupancy ===")
for gy in range(0, gh, band):
    v = row_occ[gy:gy + band].mean() * 100
    bar = "#" * int(v / 4)
    print(f"  y {gy * cell:4d}-{(gy + band) * cell:4d} ({gy * cell / H * 100:4.1f}-{min((gy + band) * cell, H) / H * 100:4.1f}%): {v:5.1f}% {bar}")

# ---------- 3. Grid overlay for VLM ----------
ov = im.copy()
dr = ImageDraw.Draw(ov)
step = 10  # percent
for i in range(1, 10):
    x = int(W * i / 10)
    y = int(H * i / 10)
    dr.line([(x, 0), (x, H)], fill=(255, 40, 40), width=2)
    dr.line([(0, y), (W, y)], fill=(255, 40, 40), width=2)
    dr.text((x + 4, 4), str(i * 10), fill=(255, 215, 0))
    dr.text((4, y + 4), str(i * 10), fill=(255, 215, 0))
dr.text((W - 80, H - 24), "10% grid", fill=(255, 215, 0))
ov.save(f"{OUT_DIR}/ref-grid.png")

# big crops for VLM detail passes (halves + quarters)
im.crop((0, 0, W // 2, H)).save(f"{OUT_DIR}/crop-left-half.png")
im.crop((W // 2, 0, W, H)).save(f"{OUT_DIR}/crop-right-half.png")
im.crop((0, 0, W, H // 2)).save(f"{OUT_DIR}/crop-top-half.png")
im.crop((0, H // 2, W, H)).save(f"{OUT_DIR}/crop-bottom-half.png")
print("\nSaved: ref-grid.png, crop halves. Done.")
