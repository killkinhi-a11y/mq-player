#!/usr/bin/env python3
"""Locate bright text rows/bands in a screenshot via pixel analysis.
Usage: find_text.py <in.png> [y_min] [y_max]
Prints, for each row band with bright pixels: y-range, x-extent, centroid.
"""
import sys
from PIL import Image

def main():
    src = sys.argv[1]
    y0 = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    y1 = int(sys.argv[3]) if len(sys.argv) > 3 else 10**9
    im = Image.open(src).convert('RGB')
    w, h = im.size
    y1 = min(y1, h)
    px = im.load()
    # per-row: count of pixels with luminance > threshold
    TH = 140
    rows = []
    for y in range(y0, y1):
        cnt = 0
        xs = []
        for x in range(w):
            r, g, b = px[x, y]
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if lum > TH:
                cnt += 1
                xs.append(x)
        rows.append((y, cnt, xs))
    # group consecutive rows with cnt>2 into bands
    bands = []
    cur = None
    for y, cnt, xs in rows:
        if cnt >= 2:
            if cur is None:
                cur = [y, y, xs]
            else:
                cur[1] = y
                cur[2].extend(xs)
        else:
            if cur is not None:
                bands.append(cur)
                cur = None
    if cur is not None:
        bands.append(cur)
    for b in bands:
        y_a, y_b, xs = b
        if len(xs) == 0:
            continue
        # cluster xs by gaps > 30px
        xs = sorted(set(xs))
        clusters = [[xs[0]]]
        for x in xs[1:]:
            if x - clusters[-1][-1] > 30:
                clusters.append([x])
            else:
                clusters[-1].append(x)
        parts = []
        for c in clusters:
            cx = (c[0] + c[-1]) / 2
            parts.append(f"x[{c[0]}..{c[-1]}] cx={cx:.0f}")
        print(f"y[{y_a}..{y_b}] h={y_b-y_a+1}: {'  '.join(parts)}")

if __name__ == '__main__':
    sys.exit(main())
