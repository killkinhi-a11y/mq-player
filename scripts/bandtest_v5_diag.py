#!/usr/bin/env python3
"""Diagnose band 5 bright structure vs ref: per-column runs + row profile."""
import numpy as np
from PIL import Image

img = np.asarray(Image.open("/home/z/my-project/scripts/bandtest/bandtest-v5.png").convert("RGB")).astype(float).mean(axis=2)

# auto-locate bands: find rows with mean > 6 (bands glow); bands are 159 tall
rowm = img[:, :1128].mean(axis=1)
bands, start = [], None
for y in range(len(rowm)):
    if rowm[y] > 6 and start is None: start = y
    elif rowm[y] <= 6 and start is not None:
        if y - start > 100: bands.append((start, y))
        start = None
print("detected bands:", bands)

REF = np.asarray(Image.open("/home/z/my-project/download/ref-analysis/reference.jpg").convert("RGB")).astype(float).mean(axis=2)
ref_band = REF[860:1219, :]

def runs(z, x):
    col = z[:, x]; H = z.shape[0]
    out, s = [], None
    for y, v in enumerate(col):
        if v > 120 and s is None: s = y
        elif v <= 120 and s is not None:
            if y - s > 1: out.append((s, y - s, int(col[s:y].max())))
            s = None
    if s is not None and H - s > 1: out.append((s, H - s, int(col[s:H].max())))
    return out

z5 = img[bands[-1][0]:bands[-1][0]+159, :1128] if bands else img[797:956, :1128]
print("\n=== MQ band5 runs (>120) at x = 80,240,400,470,560,720,880 ===")
for x in (80, 240, 400, 470, 560, 720, 880):
    print(f"  x={x:>4}: " + (" | ".join(f"y{r[0]}:{r[1]}px@{r[2]}" for r in runs(z5, x)) or "dark"))

print("\n=== REF runs (>120) at x = 80,240,400,560,720,880,1040 (native 1702x359) ===")
for x in (80, 240, 400, 560, 720, 880, 1040):
    print(f"  x={x:>4}: " + (" | ".join(f"y{r[0]}:{r[1]}px@{r[2]}" for r in runs(ref_band, x)) or "dark"))

print("\n=== MQ band5 row profile (deciles) ===")
h = z5.shape[0]
for k in range(10):
    z = z5[int(k*h/10):int((k+1)*h/10), :]
    print(f"  y{k*10}-{(k+1)*10}%: mean={z.mean():5.1f} px>150={(z>150).mean()*100:4.1f}%")

# bright pixel totals in the >120 / >140 / >150 / >180 / >220 bands
print("\n=== MQ band5 threshold areas ===")
for t in (120, 140, 150, 180, 220):
    print(f"  >{t}: {(z5>t).sum():6d} px = {(z5>t).mean()*100:.2f}%")

# save crops for eyeballing
Image.fromarray(img[bands[-1][0]:bands[-1][0]+159, :1128].astype(np.uint8)).save("/tmp/mq-band5-crop.png")
ref_s = Image.open("/home/z/my-project/download/ref-analysis/reference.jpg").convert("RGB").crop((0, 860, 1702, 1219)).resize((762, 160))
ref_s.save("/tmp/ref-band-crop.png")
print("\ncrops saved: /tmp/mq-band5-crop.png /tmp/ref-band-crop.png")
