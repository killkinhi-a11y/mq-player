#!/usr/bin/env python3
"""v5 measurement + comparison artifacts.
Zones from DOM telemetry (desktop @ scrollY 864): band y628.4-787.8 x156-1284;
hero x367.6-629.1 y308.3-600.3; preview = hero bottom 21%: y539-600 x371-626."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

BASE = "/home/z/my-project/download/playlist-ref-qa/"
REF = "/home/z/my-project/download/ref-analysis/reference.jpg"
mq = Image.open(BASE + "desktop-final-v5.png").convert("RGB")   # 1440x900
ref = Image.open(REF).convert("RGB")                            # 1702x1219

REFG = np.asarray(ref).astype(float).mean(axis=2)
ref_band = REFG[860:1219, :]
mqg = np.asarray(mq).astype(float).mean(axis=2)
band = mqg[629:788, 157:1284]

def stats(z):
    return (f"mean={z.mean():5.1f} std={z.std():5.1f} p50={np.percentile(z,50):5.1f} p75={np.percentile(z,75):5.1f} "
            f"p95={np.percentile(z,95):6.1f} p99={np.percentile(z,99):6.1f} max={z.max():5.0f}")

print("=== DESKTOP BAND 1128x159 (REF native: mean 19.9 std 47.6 p50 2 p95 140 p99 242 max 255) ===")
print("  REF ", stats(ref_band))
print("  MQ  ", stats(band))
for t in (120, 150, 180, 220):
    print(f"  px>{t}: ref {(ref_band>t).mean()*100:5.2f}%  mq {(band>t).mean()*100:5.2f}%")

t = band.shape[0] // 3
print(f"  thirds   ref {ref_band[:119].mean():.0f}/{ref_band[119:239].mean():.0f}/{ref_band[239:].mean():.0f}  mq {band[:t].mean():.0f}/{band[t:2*t].mean():.0f}/{band[2*t:].mean():.0f}")
W = band.shape[1]
print("  x-dec    ref " + " ".join(f"{ref_band[:, int(k*1702/10):int((k+1)*1702/10)].mean():.0f}" for k in range(10)))
print("           mq  " + " ".join(f"{band[:, int(k*W/10):int((k+1)*W/10)].mean():.0f}" for k in range(10)))
H = band.shape[0]
print("  y-dec    ref " + " ".join(f"{ref_band[int(k*359/10):int((k+1)*359/10), :].mean():.0f}" for k in range(10)))
print("           mq  " + " ".join(f"{band[int(k*H/10):int((k+1)*H/10), :].mean():.0f}" for k in range(10)))

print("\n=== PREVIEW (hero bottom 21%) + UNCHANGED CHECKS (v4 baselines: preview 88.1, card1 31.4, strip 25.2, icon 25.9) ===")
prev = mqg[540:599, 371:626]
print(f"  preview: {stats(prev)}")
print(f"  card1 surface {mqg[470:530, 420:580].mean():.1f} | strip1 surface {mqg[470:530, 660:700].mean():.1f} | strip1 icon p95 {np.percentile(mqg[570:598, 646:703], 95):.1f}")

print("\n=== MOBILE BAND 390x110 (v4: mean 25.3 std 32.8 p95 116 max 155) ===")
mob = Image.open(BASE + "mobile-final-v5.png").convert("RGB")
mz = np.asarray(mob).astype(float).mean(axis=2)[697:807, 0:390]
print("  MQ mobile:", stats(mz))

# ── ARTIFACTS ──────────────────────────────────────────────────────────
mq_band = mq.crop((156, 628, 1284, 788))                       # 1128x160
ref_band_img = ref.crop((0, 860, 1702, 1219)).resize((762, 160), Image.LANCZOS)

# 1. band-duel-v5.png (fair scale, native widths)
Wd = mq_band.width + ref_band_img.width + 6
duel = Image.new("RGB", (Wd, 184), (10, 10, 12))
duel.paste(ref_band_img, (2, 2)); duel.paste(mq_band, (ref_band_img.width + 4, 2))
d = ImageDraw.Draw(duel)
d.text((8, 168), "REFERENCE", fill=(200, 200, 205))
d.text((ref_band_img.width + 12, 168), "MQ v5", fill=(200, 200, 205))
duel.save(BASE + "band-duel-v5.png")
print("\nband-duel-v5.png", duel.size)

# 2. band-duel-v5-2x.png — ONLY REF BAND | MQ BAND, 2x zoom (the critical material test)
rb2 = ref_band_img.resize((ref_band_img.width * 2, 320), Image.LANCZOS)
mb2 = mq_band.resize((mq_band.width * 2, 320), Image.LANCZOS)
W2 = rb2.width + mb2.width + 10
duel2 = Image.new("RGB", (W2, 328), (10, 10, 12))
duel2.paste(rb2, (2, 2)); duel2.paste(mb2, (rb2.width + 8, 2))
dd = ImageDraw.Draw(duel2)
dd.text((10, 4), "REFERENCE", fill=(150, 150, 158))
dd.text((rb2.width + 16, 4), "MQ v5", fill=(150, 150, 158))
duel2.save(BASE + "band-duel-v5-2x.png")
print("band-duel-v5-2x.png", duel2.size)

# 3. side-by-side-final-v5.png (section vs pin, matched height, v4 format)
Hs = 768
ref_s = ref.resize((int(1702 * Hs / 1219), Hs), Image.LANCZOS)
mq_sec = mq.crop((140, 88, 1300, 800))
mq_s = mq_sec.resize((int(mq_sec.width * Hs / mq_sec.height), Hs), Image.LANCZOS)
W3 = ref_s.width + mq_s.width + 8
sbs = Image.new("RGB", (W3, Hs), (8, 8, 10))
sbs.paste(ref_s, (0, 0)); sbs.paste(mq_s, (ref_s.width + 8, 0))
dd = ImageDraw.Draw(sbs)
dd.rectangle([ref_s.width, 0, ref_s.width + 7, Hs], fill=(40, 40, 46))
dd.text((12, 12), "REFERENCE (Pinterest)", fill=(220, 220, 225))
dd.text((ref_s.width + 20, 12), "MQ PLAYER v5", fill=(220, 220, 225))
sbs.save(BASE + "side-by-side-final-v5.png")
print("side-by-side-final-v5.png", sbs.size)

# 4. section-duel-v5.png (section-level duel, v4 format ~2227x768)
sec = mq.crop((156, 88, 1284, 800))                             # canvas+band area
sec_s = sec.resize((int(sec.width * Hs / sec.height), Hs), Image.LANCZOS)
W4 = ref_s.width + sec_s.width + 8
sd = Image.new("RGB", (W4, Hs), (8, 8, 10))
sd.paste(ref_s, (0, 0)); sd.paste(sec_s, (ref_s.width + 8, 0))
dd = ImageDraw.Draw(sd)
dd.rectangle([ref_s.width, 0, ref_s.width + 7, Hs], fill=(40, 40, 46))
dd.text((12, 12), "REFERENCE", fill=(220, 220, 225))
dd.text((ref_s.width + 20, 12), "MQ PLAYER v5 — section", fill=(220, 220, 225))
sd.save(BASE + "section-duel-v5.png")
print("section-duel-v5.png", sd.size)

# 5. section-abstract-v5.png (blur 10 both — same-physical-system test)
def abstract(im):
    return im.filter(ImageFilter.GaussianBlur(10))
ab = Image.new("RGB", (W4, Hs), (8, 8, 10))
ab.paste(abstract(ref_s), (0, 0)); ab.paste(abstract(sec_s), (ref_s.width + 8, 0))
ab.save(BASE + "section-abstract-v5.png")
print("section-abstract-v5.png", ab.size)
