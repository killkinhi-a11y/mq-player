#!/usr/bin/env python3
"""Generate evdev MT type-B gesture blob SEQUENCES (one file per phase).
The kernel re-stamps event times at write, so real gesture timing must come
from host-side sleeps BETWEEN phase files. Each phase = one .bin file.

Usage:
  evdev_blobs.py tap   <prefix> <x> <y>          -> prefix-p0.bin (down) + prefix-p1.bin (up)
  evdev_blobs.py swipe <prefix> <x> <y1> <y2> [steps]
                                                  -> prefix-p0.bin (down), prefix-p1..N (moves),
                                                     prefix-pZ.bin (up)

Screen 320x640 -> touchscreen 0..32767.
Write each file to the device with ~20ms (moves) / ~80ms (tap down-up) gaps.
"""
import struct
import sys


def ev(t, code, value):
    return struct.pack('<qqHHi', 0, t, 3, code, value)


def evk(t, code, value):
    return struct.pack('<qqHHi', 0, t, 1, code, value)


def syn(t):
    return struct.pack('<qqHHi', 0, t, 0, 0, 0)


def raw(x, y):
    return x * 32767 // 320, y * 32767 // 640


def down(x, y):
    tx, ty = raw(x, y)
    return (ev(0, 47, 0) + ev(0, 57, 1) + ev(0, 53, tx) + ev(0, 54, ty) +
            ev(0, 58, 60) + ev(0, 48, 10) + evk(0, 330, 1) + syn(0))


def move(x, y):
    tx, ty = raw(x, y)
    return ev(0, 47, 0) + ev(0, 53, tx) + ev(0, 54, ty) + syn(0)


def up():
    return ev(0, 47, 0) + ev(0, 57, -1) + evk(0, 330, 0) + syn(0)


def write(prefix, idx, blob):
    path = f"{prefix}-p{idx}.bin"
    with open(path, 'wb') as f:
        f.write(blob)
    return path


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
    mode, prefix = sys.argv[1], sys.argv[2]
    files = []
    if mode == 'tap':
        x, y = int(sys.argv[3]), int(sys.argv[4])
        files.append(write(prefix, 0, down(x, y)))
        files.append(write(prefix, 1, up()))
    elif mode == 'swipe':
        x, y1, y2 = int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
        steps = int(sys.argv[6]) if len(sys.argv) > 6 else 6
        files.append(write(prefix, 0, down(x, y1)))
        for i in range(1, steps + 1):
            yy = y1 + (y2 - y1) * i // steps
            files.append(write(prefix, i, move(x, yy)))
        files.append(write(prefix, steps + 1, up()))
    else:
        print(f"unknown mode {mode}")
        return 2
    for p in files:
        print(p)
    return 0


if __name__ == '__main__':
    sys.exit(main())
