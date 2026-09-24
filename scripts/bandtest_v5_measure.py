#!/usr/bin/env python3
"""Measure v5 bandtest prototype bands vs reference (native crop).
Bands are at known y offsets in bandtest-v5.png (labels 12px + band 159px + 14px margin)."""
import numpy as np
from PIL import Image

img = np.asarray(Image.open("/home/z/my-project/scripts/bandtest/bandtest-v5.png").convert("RGB")).astype(float).mean(axis=2)
print("shot shape:", img.shape)

REF = np.asarray(Image.open("/home/z/my-project/download/ref-analysis/reference.jpg").convert("RGB")).astype(float).mean(axis=2)
ref_band = REF[860:1219, :]

def stats(name, z):
    p = {q: np.percentile(z, q) for q in (50, 75, 95, 99)}
    print(f"  {name:<34} mean={z.mean():5.1f} std={z.std():5.1f} p50={p[50]:5.1f} p75={p[75]:5.1f} "
          f"p95={p[95]:5.0f} p99={p[99]:5.0f} max={z.max():5.0f} "
          f">150={(z>150).mean()*100:4.2f}% >180={(z>180).mean()*100:4.2f}% >220={(z>220).mean()*100:4.2f}%")

def thirds(z):
    h = z.shape[0] // 3
    return f"thirds top={z[:h].mean():.0f} mid={z[h:2*h].mean():.0f} low={z[2*h:].mean():.0f}"

def xtenths(z):
    W = z.shape[1]
    return " ".join(f"{z[:, int(k*W/10):int((k+1)*W/10)].mean():.0f}" for k in range(10))

print("=== REFERENCE (native 1702x359) ===")
stats("ref", ref_band); print("   ", thirds(ref_band)); print("    x-deciles:", xtenths(ref_band))

# band y offsets: row = label(~21px incl padding) + band 159 + margin 14
# Find band rows automatically: rows of height 159 separated by dark gaps — locate by scanning
# Simpler: use fixed layout math. body starts at 0; label line-height ~ 12px font -> about 21px tall.
# Let's detect: find contiguous row-ranges where row-mean > 6 (bands have glow) — risky.
# Fallback: hardcode after inspecting once.
# Layout: for each row: lbl(21) + band(159) + margin(14) => period 194; band starts at 21.
for i in range(5):
    y0 = 21 + i * 194
    z = img[y0:y0 + 159, :1128]
    if z.shape[0] < 159:
        print(f"band {i+1}: y{y0} out of range"); continue
    stats(f"band {i+1} @y{y0}", z)
    print("   ", thirds(z)); print("    x-deciles:", xtenths(z))
