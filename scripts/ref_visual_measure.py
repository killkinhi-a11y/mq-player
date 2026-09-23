#!/usr/bin/env python3
"""Visual (not just geometric) measurements of the reference:
typography metrics (stroke/cap/advance/position), surface luminance,
preview band contrast, artwork band character, negative space."""
import numpy as np
from PIL import Image

SRC = "/home/z/my-project/download/ref-analysis/reference.jpg"
im = Image.open(SRC).convert("RGB")
W, H = im.size
g = np.asarray(im).astype(float).mean(axis=2)

def zone(y0, y1, x0, x1):
    return g[y0:y1, x0:x1]

def text_mask(z, thr=30):
    bg = np.median(z)
    return z > bg + thr

def vertical_text_metrics(y0, y1, x0, x1, label):
    """For a rotated (bottom-up) single-line text block."""
    z = zone(y0, y1, x0, x1)
    m = text_mask(z)
    if not m.any():
        print(f"{label}: NO TEXT"); return
    ys, xs = np.where(m)
    run = ys.max() - ys.min() + 1          # along reading direction
    thick = xs.max() - xs.min() + 1        # line-height direction
    # stroke thickness: horizontal bright run-lengths
    runs = []
    for row in m:
        d = np.diff(np.concatenate(([0], row.astype(int), [0])))
        starts = np.where(d == 1)[0]; ends = np.where(d == -1)[0]
        runs.extend((ends - starts).tolist())
    runs = [r for r in runs if r > 0]
    stroke = float(np.median(runs)) if runs else 0
    # glyph advance: bright-pixel count per row, find peaks (glyph centers)
    rowsum = m.sum(axis=1)
    peaks = []
    in_p = False
    for i, v in enumerate(rowsum):
        if v > 0 and not in_p: start = i; in_p = True
        elif v == 0 and in_p:
            peaks.append((start + i) / 2); in_p = False
    if in_p: peaks.append((start + len(rowsum) - 1) / 2)
    adv = float(np.median(np.diff(peaks))) if len(peaks) >= 3 else 0
    cov = m.mean()
    print(f"{label}: run={run}px thick={thick}px stroke={stroke:.1f}px "
          f"advance={adv:.1f}px glyphs={len(peaks)} coverage={cov*100:.0f}% "
          f"est_font(adv/0.56)={adv/0.56:.1f}px est_font(thick/1.2)={thick/1.2:.1f}px "
          f"stroke/em={stroke/(thick/1.2):.2f}")

print("=== REFERENCE VERTICAL TYPOGRAPHY ===")
# Card 1 title "Live Pricing" — card x 222-688, title zone x 240-330 (left-anchored), y 364-600
vertical_text_metrics(370, 620, 235, 345, "card1 'Live Pricing' (11 chars)")
# Strip 1 "Analyst estimates" — card x 716-827, centered, y from top
vertical_text_metrics(370, 640, 700, 845, "strip1 'Analyst estimates' (17 ch)")
# Strip 4 "Historical earnings" — card x 1104-1212
vertical_text_metrics(370, 640, 1090, 1230, "strip4 'Historical earnings' (18 ch)")
# Strip 5 "Insider transactions" — card x 1232-1340
vertical_text_metrics(370, 640, 1220, 1352, "strip5 'Insider transactions' (20 ch)")

print("\n=== HEADLINE (horizontal) ===")
hz = zone(130, 280, 560, 1180)
hm = text_mask(hz, 25)
if hm.any():
    ys, xs = np.where(hm)
    rows_with = np.where(hm.any(axis=1))[0]
    # split headline vs subtext by row gaps
    gaps = np.where(np.diff(rows_with) > 6)[0]
    bands = []
    start = rows_with[0]
    for gi in gaps:
        bands.append((start, rows_with[gi])); start = rows_with[gi + 1]
    bands.append((start, rows_with[-1]))
    for bi, (a, b) in enumerate(bands):
        band = hm[a:b + 1]
        bx = np.where(band.any(axis=0))[0]
        hpx = b - a + 1
        # stroke
        runs = []
        for col in band.T:
            d = np.diff(np.concatenate(([0], col.astype(int), [0])))
            st = np.where(d == 1)[0]; en = np.where(d == -1)[0]
            runs.extend((en - st).tolist())
        stroke = float(np.median([r for r in runs if r > 0])) if runs else 0
        print(f"band{bi}: y={130+a}-{130+b} h={hpx}px width={bx.max()-bx.min()+1}px "
              f"stroke={stroke:.1f}px stroke/em~{stroke/(hpx/0.72):.2f} est_font~{hpx/1.05:.0f}px")
    print(f"(bands: {len(bands)}; gaps between: {[bands[i+1][0]-bands[i][1] for i in range(len(bands)-1)]}px)")

print("\n=== SURFACE LUMINANCE (0-255) ===")
regions = {
    "page bg (left margin)": (400, 900, 10, 200),
    "page bg (top area)": (60, 120, 300, 1400),
    "card1 surface (empty middle)": (560, 700, 260, 620),
    "strip4 surface": (400, 540, 1120, 1200),
    "strip5 surface": (400, 540, 1250, 1330),
    "card1 preview band": (790, 870, 240, 620),
    "strip1 bottom light block": (800, 870, 725, 820),
    "artwork band (y950-1050)": (950, 1050, 100, 1600),
    "artwork band (y1050-1219)": (1050, 1218, 100, 1600),
    "artwork brightest rows (y930-990)": (930, 990, 100, 1600),
}
for name, (y0, y1, x0, x1) in regions.items():
    z = zone(y0, y1, x0, x1)
    print(f"  {name:36s} mean={z.mean():6.1f} std={z.std():5.1f} p95={np.percentile(z,95):6.1f} max={z.max():.0f}")

print("\n=== ARTWORK BAND horizontal brightness profile ( brightest region ) ===")
band = g[940:1210, :]
prof = band.mean(axis=0)
# smooth
k = 25
sm = np.convolve(prof, np.ones(k) / k, mode="same")
best = int(np.argmax(sm))
print(f"  brightest x = {best}px ({best/W*100:.1f}% of width), value={sm[best]:.1f}")
for xp in range(0, W, 170):
    print(f"  x {xp:4d} ({xp/W*100:4.1f}%): {sm[min(xp,W-1)]:5.1f} " + "#" * int(sm[min(xp, W-1)] / 2))

print("\n=== ARTWORK FADE-IN from top ===")
colprof = g[:, 400:1300].mean(axis=1)
for y in range(880, 1010, 10):
    print(f"  y={y} ({y/H*100:4.1f}%): {colprof[y]:5.1f} " + "#" * int(colprof[y] / 2))

print("\n=== NEGATIVE SPACE ===")
print(f"  headline bottom -> row top: y 256 -> 364 = 108px = {108/H*100:.1f}% of canvas H")
print(f"  row bottom -> artwork fade start: y 884 -> ~935 = ~51px = {51/H*100:.1f}% of canvas H")

print("\n=== STRIP ICON (bottom, strip4) ===")
iz = zone(800, 880, 1100, 1215)
im_mask = iz > np.median(iz) + 20
print(f"  icon pixels: {im_mask.sum()}, mean lum of icon zone: {iz.mean():.1f}, p95: {np.percentile(iz, 95):.1f}")

# Save 4x crops for eyeball verification
for name, (a, b, c, d) in {
    "m-card1-title.png": (222, 360, 688, 620),
    "m-strip4-title.png": (1090, 360, 1230, 660),
    "m-card1-bottom.png": (222, 700, 688, 890),
    "m-band.png": (0, 900, W, H),
}.items():
    c_img = im.crop((a, b, c, d))
    c_img = c_img.resize((c_img.width * 2, c_img.height * 2), Image.LANCZOS)
    c_img.save(f"/home/z/my-project/download/ref-analysis/{name}")
print("\nsaved measurement crops x2")
