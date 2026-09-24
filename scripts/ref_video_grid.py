#!/usr/bin/env python3
"""Overlay labeled measurement grid on card-row crops for reliable VLM reading."""
from PIL import Image, ImageDraw, ImageFont
import os

VID = "/home/z/my-project/download/ref-analysis/refvid"
OUT = "/home/z/my-project/download/ref-analysis"

KEYS = [1, 6, 12, 18, 24, 30]
crops = []
for n in KEYS:
    im = Image.open(os.path.join(VID, f"f-{n:03d}.png"))
    w, h = im.size
    row = im.crop((0, int(0.24 * h), w, int(0.78 * h))).resize((w * 2, int(0.54 * h) * 2), Image.LANCZOS)
    crops.append((n, (n - 1) / 3.0, row))

try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 26)
except Exception:
    font = ImageFont.load_default()

cw, ch = crops[0][2].size
LABEL_H = 44
sheet = Image.new("RGB", (cw, len(crops) * (ch + LABEL_H + 8)), (0, 90, 0))
d = ImageDraw.Draw(sheet)
y = 0
for n, t, c in crops:
    # label
    d.text((10, y + 8), f"frame {n}  t={t:.1f}s", fill=(255, 255, 0), font=font)
    y += LABEL_H
    sheet.paste(c, (0, y))
    # grid every 5% with labels every 10%
    for pct in range(0, 101, 5):
        gx = int(pct / 100 * cw)
        major = pct % 10 == 0
        d.line([(gx, y), (gx, y + ch)], fill=(255, 0, 255) if major else (120, 0, 160), width=3 if major else 1)
        if major:
            d.text((gx + 4, y + 4), f"{pct}", fill=(255, 120, 255), font=font)
    y += ch + 8
sheet.save(os.path.join(OUT, "ref-video-grid.png"))
print("saved", sheet.size)
