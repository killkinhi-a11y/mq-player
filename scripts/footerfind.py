#!/usr/bin/env python3
"""Find the LoginScreen footer row ("Демo-режим" left | "Регистрация" right)
in a screenshot's y 420-640 zone using find_text.py band output.

Reads footer band file (argv[1]) produced by find_text.py.
Prints "<x> <y>" = centroid of the LEFT cluster of the BOTTOM-MOST
row that has both a left cluster (cx<120) and a right cluster (cx>200).
The legal links row below merges into one centered cluster -> excluded.
"""
import re
import sys


def main():
    best = None
    try:
        for ln in open(sys.argv[1]):
            m = re.match(r'y\[(\d+)\.\.(\d+)\] h=\d+: (.*)', ln.strip())
            if not m:
                continue
            y1, y2, rest = int(m.group(1)), int(m.group(2)), m.group(3)
            cxs = [float(x) for x in re.findall(r'cx=(\d+)', rest)]
            if not cxs:
                continue
            left = [c for c in cxs if c < 120]
            right = [c for c in cxs if c > 200]
            if left and right:
                cy = (y1 + y2) // 2
                cx = int(sum(left) / len(left))
                if best is None or cy > best[1]:
                    best = (cx, cy)
    except FileNotFoundError:
        pass
    if best:
        print(f'{best[0]} {best[1]}')


if __name__ == '__main__':
    sys.exit(main())
