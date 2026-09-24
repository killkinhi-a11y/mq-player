#!/usr/bin/env python3
"""Build v4 comparison artifacts: fair-scale band duel, full side-by-side, abstract."""
from PIL import Image, ImageFilter, ImageDraw

BASE = "/home/z/my-project/download/playlist-ref-qa/"
REF = "/home/z/my-project/download/ref-analysis/reference.jpg"
MQ  = BASE + "desktop-final-v4.png"

ref = Image.open(REF).convert("RGB")          # 1702x1219
mq  = Image.open(MQ).convert("RGB")           # 1440x900

# ── 1. FAIR-SCALE BAND DUEL (same height 160, native-ish) ──────────────
mq_band = mq.crop((156, 628, 1284, 788))                      # 1128x160
ref_band_full = ref.crop((0, 860, 1702, 1219))                # 1702x359
ref_band = ref_band_full.resize((762, 160), Image.LANCZOS)    # same height
W = mq_band.width + ref_band.width + 6
duel = Image.new("RGB", (W, 164), (10, 10, 12))
duel.paste(ref_band, (2, 2))
duel.paste(mq_band, (ref_band.width + 4, 2))
d = ImageDraw.Draw(duel)
d.text((8, 146), "REFERENCE", fill=(200, 200, 205))
d.text((ref_band.width + 12, 146), "MQ v4", fill=(200, 200, 205))
duel.save(BASE + "band-duel-v4.png")
print("band-duel-v4.png", duel.size)

# ── 2. FULL SIDE-BY-SIDE (section vs pin, matched height) ─────────────
H = 768
ref_s = ref.resize((int(1702 * H / 1219), H), Image.LANCZOS)  # 1072x768
mq_sec = mq.crop((140, 88, 1300, 800))                        # 1160x712 section+band
mq_s = mq_sec.resize((int(1160 * H / 712), H), Image.LANCZOS) # 1252x768
W2 = ref_s.width + mq_s.width + 8
sbs = Image.new("RGB", (W2, H), (8, 8, 10))
sbs.paste(ref_s, (0, 0))
sbs.paste(mq_s, (ref_s.width + 8, 0))
dd = ImageDraw.Draw(sbs)
dd.rectangle([ref_s.width, 0, ref_s.width + 7, H], fill=(40, 40, 46))
dd.text((12, 12), "REFERENCE (Pinterest)", fill=(220, 220, 225))
dd.text((ref_s.width + 20, 12), "MQ PLAYER v4", fill=(220, 220, 225))
sbs.save(BASE + "side-by-side-final-v4.png")
print("side-by-side-final-v4.png", sbs.size)

# ── 3. ABSTRACT (blur 10px both — same physical-system test) ──────────
def abstract(im):
    return im.filter(ImageFilter.GaussianBlur(10))
abs_img = Image.new("RGB", (W2, H), (8, 8, 10))
abs_img.paste(abstract(ref_s), (0, 0))
abs_img.paste(abstract(mq_s), (ref_s.width + 8, 0))
abs_img.save(BASE + "side-by-side-abstract-v4.png")
print("side-by-side-abstract-v4.png", abs_img.size)
