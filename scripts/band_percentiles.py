#!/usr/bin/env python3
"""Band base-darkness comparison: full percentile distribution of the
reference band vs MQ v3 band (same geometry zones)."""
import numpy as np
from PIL import Image

REF = "/home/z/my-project/download/ref-analysis/reference.jpg"
MQ = "/home/z/my-project/download/playlist-ref-qa/desktop-final-v3.png"

def band_of(path, y0, y1, x0, x1, label):
    im = Image.open(path).convert("RGB")
    g = np.asarray(im).astype(float).mean(axis=2)
    z = g[y0:y1, x0:x1]
    ps = [1, 5, 10, 25, 50, 75, 90, 95, 99]
    vals = {p: np.percentile(z, p) for p in ps}
    print(f"{label}: mean={z.mean():.1f} std={z.std():.1f} max={z.max():.0f}")
    print("  " + "  ".join(f"p{p}={v:.0f}" for p, v in vals.items()))

# Reference: pin image 1200x?; the band is the bottom artwork strip.
# ref-analysis measured the reference band previously; recompute from
# the bottom 23.3% of the reference image, central width.
ref = Image.open(REF)
rw, rh = ref.size
band_h = int(rh * 0.233)
band_of(REF, rh - band_h, rh - int(rh*0.02), int(rw*0.09), int(rw*0.91), "REF band (bottom 23.3%)")

# MQ v3: y632-786, x160-1280 (viewport coords)
band_of(MQ, 632, 786, 160, 1280, "MQ v3 band")

# BEFORE for comparison
MQB = "/home/z/my-project/download/playlist-ref-qa/desktop-final.png"
band_of(MQB, 632, 786, 160, 1280, "MQ v2 band (BEFORE)")
