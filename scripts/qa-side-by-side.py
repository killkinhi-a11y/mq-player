#!/usr/bin/env python3
"""Build side-by-side comparison: reference | MQ desktop section."""
from PIL import Image, ImageDraw

REF = "/home/z/my-project/download/ref-analysis/reference.jpg"
MQ = "/home/z/my-project/download/playlist-ref-qa/desktop-section.png"
OUT = "/home/z/my-project/download/playlist-ref-qa/side-by-side.png"

ref = Image.open(REF).convert("RGB")
mq = Image.open(MQ).convert("RGB")

# crop the MQ section: secLeft=156, width=1128, top≈100 (scroll), height=684
# add a little breathing room
crop = mq.crop((146, 88, 1294, 800))
# scale both to the same height (712)
H = 712
ref_s = ref.resize((int(ref.width * H / ref.height), H), Image.LANCZOS)
mq_s = crop.resize((int(crop.width * H / crop.height), H), Image.LANCZOS)

GAP = 24
W = ref_s.width + GAP + mq_s.width
canvas = Image.new("RGB", (W, H + 56), (10, 10, 11))
canvas.paste(ref_s, (0, 56))
canvas.paste(mq_s, (ref_s.width + GAP, 56))
d = ImageDraw.Draw(canvas)
d.text((8, 18), "REFERENCE (Fey)", fill=(160, 160, 165))
d.text((ref_s.width + GAP + 8, 18), "MQ PLAYLISTS", fill=(224, 49, 49))
canvas.save(OUT)
print("saved", OUT, canvas.size)
