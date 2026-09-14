#!/usr/bin/env python3
"""Overlay a labeled coordinate grid on a screenshot for VLM coordinate reading.
Grid lines every 40px; labels at intersections (x,y in original screen px).
Usage: grid_overlay.py <in.png> <out.png>
"""
import sys
from PIL import Image, ImageDraw, ImageFont

def main():
    src, dst = sys.argv[1], sys.argv[2]
    im = Image.open(src).convert('RGB')
    w, h = im.size
    SC = 2  # upscale for readability
    out = im.resize((w * SC, h * SC), Image.NEAREST)
    d = ImageDraw.Draw(out)
    step = 40
    for x in range(0, w, step):
        d.line([(x * SC, 0), (x * SC, h * SC)], fill=(255, 0, 0), width=1)
    for y in range(0, h, step):
        d.line([(0, y * SC), (w * SC, y * SC)], fill=(255, 0, 0), width=1)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
    except Exception:
        font = ImageFont.load_default()
    for x in range(0, w, step):
        for y in range(0, h, step):
            d.text((x * SC + 2, y * SC + 2), f"{x},{y}", fill=(255, 255, 0), font=font)
    out.save(dst)
    print(f"grid saved: {dst} ({w}x{h} -> {w*SC}x{h*SC})")

if __name__ == '__main__':
    sys.exit(main())
