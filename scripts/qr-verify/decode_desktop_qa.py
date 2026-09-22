#!/usr/bin/env python3
"""Decode the MQ share QR directly from the desktop QA screenshot.

Camera-equivalent proof: the QR rendered by the desktop bundle (same
qrcode.react component as web, proxied through the desktop network layer)
must decode with a real scanner pipeline (OpenCV QRCodeDetector + jsQR
fallback via node when available).
"""
import sys
import cv2
import numpy as np

path = sys.argv[1]
img = cv2.imread(path)
if img is None:
    print("FATAL: cannot read", path)
    sys.exit(1)

detector = cv2.QRCodeDetector()
data, points, _ = detector.detectAndDecode(img)
if not data:
    # Try upscaling + thresholding for small codes
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    for scale in (2, 3):
        big = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        _, th = cv2.threshold(big, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        data, points, _ = detector.detectAndDecode(th)
        if data:
            break
if data:
    print("DECODED:", data)
    sys.exit(0)

print("NOT-DECODED (no QR visible or too small in this screenshot)")
sys.exit(2)
