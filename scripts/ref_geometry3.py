#!/usr/bin/env python3
"""Pass 3: fine-grained resolution of strip gaps + card vertical extent + tight text crops."""
import numpy as np
from PIL import Image

SRC = "/home/z/my-project/download/ref-analysis/reference.jpg"
OUT = "/home/z/my-project/download/ref-analysis"
im = Image.open(SRC).convert("RGB")
W, H = im.size
gray = np.asarray(im).astype(float).mean(axis=2)

print("=== fine scan x=1060..1500 (4px), brightness in y340-880 band ===")
band = gray[340:880, :]
for x in range(1060, 1500, 4):
    v = band[:, x:x+4].mean()
    print(f"  x={x} ({x/W*100:5.1f}%): {v:5.1f} " + "#" * int(v/2))

print("\n=== fine scan x=680..870 (4px) ===")
for x in range(680, 870, 4):
    v = band[:, x:x+4].mean()
    print(f"  x={x} ({x/W*100:5.1f}%): {v:5.1f} " + "#" * int(v/2))

print("\n=== vertical extent: row brightness for strip1 x730..820 ===")
for y in range(300, 940, 8):
    v = gray[y, 730:820].mean()
    print(f"  y={y} ({y/H*100:5.1f}%): {v:5.1f} " + "#" * int(v/2))

print("\n=== vertical extent: row brightness for card1 x300..400 ===")
for y in range(300, 940, 8):
    v = gray[y, 300:400].mean()
    print(f"  y={y} ({y/H*100:5.1f}%): {v:5.1f} " + "#" * int(v/2))

print("\n=== vertical extent: row brightness for strip5 x1150..1250 ===")
for y in range(300, 940, 8):
    v = gray[y, 1150:1250].mean()
    print(f"  y={y} ({y/H*100:5.1f}%): {v:5.1f} " + "#" * int(v/2))

# tight crops for text orientation check (zoomed 3x)
def zoom3(box, name):
    c = im.crop(box)
    c = c.resize((c.width * 3, c.height * 3), Image.LANCZOS)
    c.save(f"{OUT}/{name}")

zoom3((690, 380, 850, 620), "t-strip1-text.png")    # strip 1 vertical title
zoom3((950, 380, 1090, 620), "t-strip3-text.png")   # strip 3 vertical title
zoom3((200, 370, 700, 560), "t-card1-text.png")     # card 1 vertical title zone
zoom3((200, 640, 700, 900), "t-card1-bottom.png")   # card 1 bottom (desc + CTA + preview)
print("saved tight crops")
