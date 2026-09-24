#!/usr/bin/env python3
"""Anatomy of reference video: per-frame card boundaries + widths."""
from PIL import Image
import numpy as np
import os, sys

VID_DIR = "/home/z/my-project/download/ref-analysis/refvid"
files = sorted(f for f in os.listdir(VID_DIR) if f.endswith(".png"))

def analyze(path):
    im = np.asarray(Image.open(path).convert("L"), dtype=np.float32)
    h, w = im.shape
    # Card row region: cards occupy middle band of the frame.
    # Detect rows that contain the card row: rows with bright pixels (cards lighter than bg?) Not reliable.
    # Use fixed band based on known layout: cards vertical middle. Try y from 0.30h to 0.92h
    y0, y1 = int(0.34 * h), int(0.90 * h)
    band = im[y0:y1, :]
    col = band.mean(axis=0)
    # smooth
    k = np.ones(5) / 5
    cs = np.convolve(col, k, mode="same")
    # Gaps = local minima darker than surroundings. Cards on dark bg: bg dark, cards also dark-ish.
    # Better: detect edges via gradient magnitude
    grad = np.abs(np.diff(cs))
    # Candidate edges: peaks in grad
    thresh = np.percentile(grad, 85)
    peaks = []
    for x in range(2, len(grad) - 2):
        if grad[x] > thresh and grad[x] == grad[x - 2:x + 3].max():
            if not peaks or x - peaks[-1] > 12:
                peaks.append(x)
    return w, peaks, cs

print(f"{'frame':>6} {'t(s)':>6}  edges")
for f in files:
    t = (int(f[2:4].split('.')[0])) / 3.0
    w, peaks, cs = analyze(os.path.join(VID_DIR, f))
    # widths between consecutive edges
    edges = [p for p in peaks]
    print(f"{f:>6} {t:>6.1f}  edges={edges}")
