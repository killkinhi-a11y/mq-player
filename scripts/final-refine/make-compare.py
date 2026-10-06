#!/usr/bin/env python3
"""Final refinement — BEFORE/AFTER side-by-side composites + section pairs."""
from PIL import Image, ImageDraw, ImageFont
import os

BASE = "/home/z/my-project/download/qa-final-refine"
OUT = f"{BASE}/compare"
os.makedirs(OUT, exist_ok=True)

PAIRS = [
    # (before, after, label) — the screens the FINAL spec calls out
    ("d1440-home.png", "d1440-home.png", "HOME · desktop 1440"),
    ("d1440-wave.png", "d1440-wave.png", "WAVE · desktop 1440"),
    ("d1440-library.png", "d1440-library.png", "LIBRARY · desktop 1440"),
    ("d1440-search.png", "d1440-search.png", "SEARCH · desktop 1440"),
    ("d1440-settings.png", "d1440-settings.png", "SETTINGS · desktop 1440"),
    ("m390-home.png", "m390-home.png", "MOBILE HOME · 390"),
    ("m390-wave.png", "m390-wave.png", "MOBILE WAVE · 390"),
    ("d1440-fullplayer.png", "d1440-fullplayer.png", "FULL PLAYER · desktop"),
]

font = None
for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]:
    try:
        font = ImageFont.truetype(p, 22)
        break
    except Exception:
        pass

for bfile, afile, label in PAIRS:
    bp, ap = f"{BASE}/before/{bfile}", f"{BASE}/after/{afile}"
    if not (os.path.exists(bp) and os.path.exists(ap)):
        print("skip", label)
        continue
    b, a = Image.open(bp), Image.open(ap)
    # scale to same height (mobile shots are tall — cap composite height)
    H = min(b.height, a.height, 900)
    def fit(img):
        if img.height != H:
            img = img.resize((int(img.width * H / img.height), H))
        return img
    b, a = fit(b), fit(a)
    gap = 8
    W = b.width + a.width + gap
    canvas = Image.new("RGB", (W, H + 44), (10, 10, 12))
    canvas.paste(b, (0, 44))
    canvas.paste(a, (b.width + gap, 44))
    d = ImageDraw.Draw(canvas)
    if font:
        d.text((12, 8), f"BEFORE — {label}", fill=(200, 200, 205), font=font)
        d.text((b.width + gap + 12, 8), "AFTER", fill=(160, 210, 255), font=font)
    name = label.split(" ")[0].lower() + ("-m" if "MOBILE" in label else "") + "-compare.png"
    if "MOBILE" in label:
        name = "mobile-" + label.split(" ")[1].lower() + "-compare.png"
    canvas.save(f"{OUT}/{name}")
    print("ok", name, canvas.size)
