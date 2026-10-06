#!/usr/bin/env python3
"""FINAL CORRECTION PASS — BEFORE/AFTER composites for the 8 required screens."""
from PIL import Image, ImageDraw
import os

BEFORE = "/home/z/my-project/download/qa-final-pass/before"
AFTER = "/home/z/my-project/download/qa-final-pass/prod-after"
OUT = "/home/z/my-project/download/qa-final-pass/compare"
os.makedirs(OUT, exist_ok=True)

# (name, before file, after file)
PAIRS = [
    ("home",       "d1440-01-home.png",     "d1440-01-home.png"),
    ("wave",       "d1440-02-wave.png",     "d1440-02-wave.png"),
    ("search",     "d1440-03-search.png",   "d1440-06-search.png"),
    ("library",    "d1440-04-library.png",  "d1440-06-library.png"),
    ("chats",      "d1440-05-chats.png",    "d1440-06-chats.png"),
    ("settings",   "d1440-06-settings.png", "d1440-06-settings.png"),
    ("mobile-home","m390-01-home.png",      "m390-01-home.png"),
    ("mobile-wave","m390-02-wave.png",      "m390-02-wave.png"),
]

LABEL_H = 56
GAP = 8

for name, bf, af in PAIRS:
    b = Image.open(os.path.join(BEFORE, bf)).convert("RGB")
    a = Image.open(os.path.join(AFTER, af)).convert("RGB")
    # normalize heights (mobile 3x shots may differ slightly)
    h = min(b.height, a.height)
    if b.height != h: b = b.crop((0, 0, b.width, h))
    if a.height != h: a = a.crop((0, 0, a.width, h))
    # scale mobile composites down to fit side-by-side nicely
    max_side_w = 1100
    if b.width + a.width + GAP > max_side_w:
        scale = (max_side_w - GAP) / (b.width + a.width)
        b = b.resize((int(b.width * scale), int(b.height * scale)), Image.LANCZOS)
        a = a.resize((int(a.width * scale), int(a.height * scale)), Image.LANCZOS)
    W = b.width + GAP + a.width
    H = LABEL_H + max(b.height, a.height)
    canvas = Image.new("RGB", (W, H), (10, 10, 12))
    d = ImageDraw.Draw(canvas)
    d.text((16, 18), "BEFORE", fill=(255, 120, 120))
    d.text((b.width + GAP + 16, 18), "AFTER", fill=(120, 255, 160))
    canvas.paste(b, (0, LABEL_H))
    canvas.paste(a, (b.width + GAP, LABEL_H))
    out = os.path.join(OUT, f"compare-{name}.png")
    canvas.save(out, optimize=True)
    print("built", out, canvas.size)
print("DONE")
