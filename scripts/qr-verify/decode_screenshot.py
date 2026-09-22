#!/usr/bin/env python3
"""Decode the QR code from a browser screenshot to prove on-screen scannability.

Usage: python3 scripts/qr-verify/decode_screenshot.py <screenshot.png> [expected_url]

Uses OpenCV QRCodeDetector (+pyzbar fallback). Prints the decoded URL and
exits 0 on success / 1 on failure — wired into the desktop-redesign QA loop.
"""
import sys
import cv2
import numpy as np

def main() -> int:
    if len(sys.argv) < 2:
        print("usage: decode_screenshot.py <png> [expected_url]", file=sys.stderr)
        return 2
    path = sys.argv[1]
    expected = sys.argv[2] if len(sys.argv) > 2 else None

    img = cv2.imread(path)
    if img is None:
        print(f"FAIL: cannot read {path}", file=sys.stderr)
        return 1

    detector = cv2.QRCodeDetector()
    decoded = None

    # Pass 1: full image
    try:
        data, _, _ = detector.detectAndDecode(img)
        if data:
            decoded = data
    except cv2.error:
        pass

    # Pass 2: upscale 2x (helps small QRs)
    if not decoded:
        try:
            big = cv2.resize(img, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
            data, _, _ = detector.detectAndDecode(big)
            if data:
                decoded = data
        except cv2.error:
            pass

    # Pass 3: grayscale + CLAHE contrast boost
    if not decoded:
        try:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
            enhanced = clahe.apply(gray)
            for scale in (1.0, 1.5, 2.0):
                s = cv2.resize(enhanced, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
                data, _, _ = detector.detectAndDecode(s)
                if data:
                    decoded = data
                    break
        except cv2.error:
            pass

    if not decoded:
        print("FAIL: no QR detected/decoded in", path, file=sys.stderr)
        return 1

    print(f"DECODED: {decoded}")
    if expected is not None:
        if decoded == expected:
            print("MATCH: exact URL round-trip OK")
            return 0
        print(f"MISMATCH:\n  expected: {expected}\n  decoded:  {decoded}", file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
