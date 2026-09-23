#!/usr/bin/env python3
"""Measure the CURRENT MQ implementation screenshot with the same metrics.
Geometry (from DOM telemetry): section x156-1284, canvas x243-1197 (954w),
canvas y100-784, row y304-596 (x368-1069), expanded card x368-629,
aurora y625-784."""
import numpy as np
from PIL import Image

MQ = "/home/z/my-project/download/playlist-ref-qa/desktop-section.png"
im = Image.open(MQ).convert("RGB")
g = np.asarray(im).astype(float).mean(axis=2)

def zone(y0, y1, x0, x1):
    return g[y0:y1, x0:x1]

print("=== MQ SURFACE LUMINANCE ===")
regions = {
    "page bg (left of section, x0-140)": (150, 750, 0, 140),
    "expanded card surface (middle)": (420, 480, 420, 580),
    "strip1 surface (upper)": (420, 480, 660, 700),
    "expanded preview band (y535-590)": (540, 590, 372, 625),
    "aurora band (y640-700)": (640, 700, 200, 1240),
    "aurora band (y700-780)": (700, 780, 200, 1240),
}
for name, (y0, y1, x0, x1) in regions.items():
    z = zone(y0, y1, x0, x1)
    print(f"  {name:38s} mean={z.mean():6.1f} std={z.std():5.1f} p95={np.percentile(z,95):6.1f} max={z.max():.0f}")

print("\n=== MQ strip icon visibility ===")
# strip1 bottom center: strip1 x 655-715, bottom ~y570; icon at bottom-[5.5%]
iz = zone(560, 594, 655, 715)
print(f"  icon zone mean={iz.mean():.1f} p95={np.percentile(iz, 95):.1f} max={iz.max():.0f}")

print("\n=== MQ aurora horizontal profile (y700-780) ===")
band = g[700:780, 160:1290]
prof = band.mean(axis=0)
k = 25
sm = np.convolve(prof, np.ones(k) / k, mode="same")
for i in range(0, len(sm), 100):
    print(f"  x {160+i:4d}: {sm[i]:5.1f} " + "#" * int(sm[i] / 2))

print("\n=== MQ vertical title band thickness (strip1, x655-715 y310-450) ===")
z = zone(310, 460, 640, 730)
m = z > np.median(z) + 30
if m.any():
    ys, xs = np.where(m)
    print(f"  text run={ys.max()-ys.min()+1}px thick={xs.max()-xs.min()+1}px (13px font, leading-none)")
else:
    print("  no text detected")

print("\n=== MQ headline band (y ~180-260, x 600-840) ===")
z = zone(160, 280, 560, 880)
m = z > np.median(z) + 25
if m.any():
    ys, xs = np.where(m)
    rows_with = np.where(m.any(axis=1))[0]
    print(f"  headline text rows y={160+rows_with.min()}-{160+rows_with.max()} "
          f"h={rows_with.max()-rows_with.min()+1}px width={xs.max()-xs.min()+1}px")
