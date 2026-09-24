#!/usr/bin/env python3
"""Stack card-row crops of key frames for visual comparison."""
from PIL import Image, ImageDraw
import os

VID = "/home/z/my-project/download/ref-analysis/refvid"
KEYS = [1, 6, 12, 18, 24, 28, 30, 35]  # ~0.3,2,4,6,8,9.3,10,11.7s
crops = []
for n in KEYS:
    im = Image.open(os.path.join(VID, f"f-{n:03d}.png"))
    w, h = im.size
    row = im.crop((0, int(0.30 * h), w, int(0.95 * h)))  # card row area
    crops.append((n, (n - 1) / 3.0, row))

cw = max(c.size[0] for _, _, c in crops)
ch = max(c.size[1] for _, _, c in crops)
sheet = Image.new("RGB", (cw, len(crops) * (ch + 26)), (8, 8, 8))
d = ImageDraw.Draw(sheet)
y = 0
for n, t, c in crops:
    d.text((6, y + 4), f"frame {n}  t={t:.1f}s", fill=(255, 255, 0))
    sheet.paste(c, (0, y + 26))
    y += ch + 26
sheet.save("/home/z/my-project/download/ref-analysis/ref-video-rows.png")
print("saved", sheet.size)

# Also save individual full frames at 2x for closer look
for n in [1, 12, 24, 28, 30, 35]:
    im = Image.open(os.path.join(VID, f"f-{n:03d}.png"))
    im.save(f"/home/z/my-project/download/ref-analysis/ref-video-rows-f{n:03d}.png")
print("done")
