#!/usr/bin/env python3
"""V10.3.1 — pixel-level translucency check of the volume popup.

Samples the popup region and the same backdrop region from a paired
screenshot WITHOUT the popup, then measures how much the backdrop
shows through (delta), plus internal variance (blur spreads detail).
"""
from PIL import Image
import sys

def stats(img, box):
    px = img.crop(box).convert("RGB")
    w, h = px.size
    data = list(px.getdata())
    n = len(data)
    mean = tuple(sum(c[i] for c in data) / n for i in range(3))
    var = sum((c[0] - mean[0]) ** 2 + (c[1] - mean[1]) ** 2 + (c[2] - mean[2]) ** 2 for c in data) / n
    return mean, var

if __name__ == "__main__":
    path = sys.argv[1]
    l, t, r, b = map(int, sys.argv[2:6])
    img = Image.open(path)
    box = (l, t, r, b)
    mean, var = stats(img, box)
    print(f"popup region {box}: mean RGB = ({mean[0]:.1f}, {mean[1]:.1f}, {mean[2]:.1f}) variance = {var:.1f}")
    # also sample a ring just OUTSIDE the popup (the backdrop near it)
    ring = (max(0, l - 60), t, max(0, l - 10), b)
    rm, rv = stats(img, ring)
    print(f"backdrop left of popup {ring}: mean RGB = ({rm[0]:.1f}, {rm[1]:.1f}, {rm[2]:.1f}) variance = {rv:.1f}")
    ring2 = (min(img.width, r + 10), t, min(img.width, r + 60), b)
    rm2, rv2 = stats(img, ring2)
    print(f"backdrop right of popup {ring2}: mean RGB = ({rm2[0]:.1f}, {rm2[1]:.1f}, {rm2[2]:.1f}) variance = {rv2:.1f}")
