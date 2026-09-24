#!/usr/bin/env python3
"""Final QA: luminance verification + side-by-side composites
(normal + abstracted) — reference vs MQ final."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

REF = "/home/z/my-project/download/ref-analysis/reference.jpg"
MQ = "/home/z/my-project/download/playlist-ref-qa/desktop-final-v3.png"
OUT = "/home/z/my-project/download/playlist-ref-qa"

g = np.asarray(Image.open(MQ).convert("RGB")).astype(float).mean(axis=2)
def zone(y0, y1, x0, x1): return g[y0:y1, x0:x1]

print("=== FINAL luminance vs reference targets ===")
for name, y0, y1, x0, x1, ref in [
    ("expanded surface", 340, 420, 400, 600, "ref 12.2 (delta 10.5)"),
    ("preview band", 540, 594, 372, 625, "ref 91"),
    ("aurora y630-700", 630, 700, 200, 1240, "ref mean22 std45 p95_124"),
    ("aurora y700-780", 700, 780, 200, 1240, "ref mean17 std45 p95_135"),
]:
    z = zone(y0, y1, x0, x1)
    print(f"  {name:22s} mean={z.mean():6.1f} std={z.std():5.1f} p95={np.percentile(z,95):6.1f}  [{ref}]")

# ── composites ──
ref = Image.open(REF).convert("RGB")
mq = Image.open(MQ).convert("RGB")
crop = mq.crop((146, 88, 1294, 800))  # the section

H = 712
ref_s = ref.resize((int(ref.width * H / ref.height), H), Image.LANCZOS)
mq_s = crop.resize((int(crop.width * H / crop.height), H), Image.LANCZOS)
GAP = 24

def compose(a, b, path, suffix=""):
    W = a.width + GAP + b.width
    canvas = Image.new("RGB", (W, H + 56), (10, 10, 11))
    canvas.paste(a, (0, 56)); canvas.paste(b, (a.width + GAP, 56))
    d = ImageDraw.Draw(canvas)
    d.text((8, 18), "REFERENCE (Fey)", fill=(160, 160, 165))
    d.text((a.width + GAP + 8, 18), "MQ PLAYLISTS" + suffix, fill=(224, 49, 49))
    canvas.save(path)
    print("saved", path, canvas.size)

compose(ref_s, mq_s, f"{OUT}/side-by-side-final-v3.png")

# abstracted: grayscale + blur(10) — content removed, pure composition/design-system
ref_a = ref_s.convert("L").filter(ImageFilter.GaussianBlur(10)).convert("RGB")
mq_a = mq_s.convert("L").filter(ImageFilter.GaussianBlur(10)).convert("RGB")
compose(ref_a, mq_a, f"{OUT}/side-by-side-abstract-v3.png", " (blurred: pure composition)")
