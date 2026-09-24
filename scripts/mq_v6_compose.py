#!/usr/bin/env python3
"""v6 visual comparison composites: REFERENCE | MQ (initial + expanded, desktop + mobile)."""
from PIL import Image, ImageDraw, ImageFont
import os

QA = "/home/z/my-project/download/playlist-ref-qa"
RA = "/home/z/my-project/download/ref-analysis"

font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 30)
font_s = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)

def label(d, x, y, text, fill=(255, 255, 0)):
    d.text((x + 8, y + 6), text, fill=fill, font=font)

def crop_ref_no_band(img, frac=0.755):
    """Crop the reference to the composition area (headline + card row),
    excluding the pin's bottom artwork band (not part of the final design)."""
    w, h = img.size
    return img.crop((0, 0, w, int(h * frac)))

def hstack(pairs, out, target_h=760):
    """pairs: [(label, Image)] -> labeled horizontal stack."""
    imgs = []
    for lab, im in pairs:
        ratio = target_h / im.height
        im2 = im.resize((int(im.width * ratio), target_h), Image.LANCZOS)
        imgs.append((lab, im2))
    W = sum(im.width for _, im in imgs) + 24 * (len(imgs) + 1)
    H = target_h + 64
    sheet = Image.new("RGB", (W, H), (12, 12, 14))
    d = ImageDraw.Draw(sheet)
    x = 24
    for lab, im in imgs:
        label(d, x, 0, lab)
        sheet.paste(im, (x, 56))
        x += im.width + 24
    sheet.save(out)
    print("saved", out, sheet.size)

# 1) INITIAL — reference static pin (band cropped) vs MQ desktop initial
ref = Image.open(f"{RA}/reference.jpg")
mq_init = Image.open(f"{QA}/desktop-initial-v6.png")
hstack(
    [("REFERENCE (pin, initial state)", crop_ref_no_band(ref)), ("MQ (initial state)", mq_init)],
    f"{QA}/side-by-side-initial-v6.png",
)

# 2) EXPANDED — reference video frame t=3.7s (hero moved right) vs MQ expanded-right
ref_exp = Image.open(f"{RA}/refvid/f-012.png")  # 1428x1020 @2x of 714x510
mq_exp = Image.open(f"{QA}/desktop-expanded-right-v6.png")
hstack(
    [("REFERENCE video t=3.7s (expanded moved)", crop_ref_no_band(ref_exp, 0.755)), ("MQ (last card expanded)", mq_exp)],
    f"{QA}/side-by-side-expanded-v6.png",
)

# 3) MOBILE — MQ mobile initial | expanded (no mobile reference exists)
mob_init = Image.open(f"{QA}/mobile-initial-v6.png")
mob_exp = Image.open(f"{QA}/mobile-expanded-v6.png")
hstack(
    [("MQ mobile (initial)", mob_init), ("MQ mobile (after tap)", mob_exp)],
    f"{QA}/side-by-side-mobile-v6.png",
    target_h=844,
)

# 4) Animation states strip: initial -> mid -> expanded -> collapsed -> reopen (desktop)
states = [
    ("initial", f"{QA}/desktop-initial-v6.png"),
    ("expanded (hover strip 2)", f"{QA}/desktop-expanded-v6.png"),
    ("collapsed (leave)", f"{QA}/desktop-collapsed-v6.png"),
    ("re-open (strip 3)", f"{QA}/desktop-reopen-v6.png"),
]
imgs = []
for lab, p in states:
    if os.path.exists(p):
        im = Image.open(p)
        ratio = 560 / im.height
        imgs.append((lab, im.resize((int(im.width * ratio), 560), Image.LANCZOS)))
W = sum(im.width for _, im in imgs) + 20 * (len(imgs) + 1)
sheet = Image.new("RGB", (W, 560 + 64), (12, 12, 14))
d = ImageDraw.Draw(sheet)
x = 20
for lab, im in imgs:
    label(d, x, 0, lab, fill=(120, 220, 255))
    sheet.paste(im, (x, 56))
    x += im.width + 20
sheet.save(f"{QA}/animation-states-v6.png")
print("saved", f"{QA}/animation-states-v6.png", sheet.size)
