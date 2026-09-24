#!/usr/bin/env python3
"""v4 measurement — DOM-exact zones from telemetry (desktop @ scrollY 864):
sec x156-1284 y103.8-787.8 | hero x367.6-629.1 y308.3-600.3 (261.5x292)
strip1 x644.5-704.8 y308.3-600.3 | band y628.4-787.8 x156-1284
preview = hero bottom 21%: y539.0-600.3 x371-626
Compares v4 vs v3 (same metric definitions; v3 zones from its own telemetry)."""
import numpy as np
from PIL import Image

BASE = "/home/z/my-project/download/playlist-ref-qa/"

def zones(path):
    g = np.asarray(Image.open(path).convert("RGB")).astype(float).mean(axis=2)
    return g

def stats(z):
    return (f"mean={z.mean():6.1f} std={z.std():5.1f} p50={np.percentile(z,50):5.1f} "
            f"p95={np.percentile(z,95):6.1f} p99={np.percentile(z,99):6.1f} max={z.max():5.0f}")

print("=== ARTWORK BAND  (REF: mean 22 std 45-47 p95 124-164 max 255) ===")
for tag, path, y0, y1 in [("v3-BEFORE", BASE+"desktop-final-v3.png", 579, 737),
                          ("v4-AFTER ", BASE+"desktop-final-v4.png", 629, 787)]:
    g = zones(path)
    z = g[y0:y1, 160:1280]
    ps = {p: np.percentile(z, p) for p in (5, 25, 50, 75, 90)}
    print(f"  {tag} {stats(z)}")
    print(f"      percentiles: " + " ".join(f"p{p}={v:.0f}" for p, v in ps.items()))
    print(f"      px>60/90/120/150/180: {[(t, int((z>t).sum())) for t in (60,90,120,150,180)]}")

print("\n=== BAND THIRDS (fade profile) ===")
for tag, path, y0 in [("v3", BASE+"desktop-final-v3.png", 579), ("v4", BASE+"desktop-final-v4.png", 629)]:
    g = zones(path)
    h = (737-579) if tag=="v3" else (787-629)
    t = h/3
    prof = [g[int(y0+k*t):int(y0+(k+1)*t), 160:1280].mean() for k in range(3)]
    print(f"  {tag}: top={prof[0]:.0f} mid={prof[1]:.0f} low={prof[2]:.0f}")

print("\n=== CARD 1 PREVIEW (REF mean 91 p95 149) ===")
for tag, path, y0, y1 in [("v3", BASE+"desktop-final-v3.png", 492, 549),
                          ("v4", BASE+"desktop-final-v4.png", 540, 599)]:
    g = zones(path)
    z = g[y0:y1, 371:626]
    print(f"  {tag} {stats(z)}")

print("\n=== UNCHANGED CHECKS (surfaces / icon / title) ===")
g3, g4 = zones(BASE+"desktop-final-v3.png"), zones(BASE+"desktop-final-v4.png")
for name, z3, z4 in [
    ("card1 surface ", g3[420:480, 420:580], g4[470:530, 420:580]),
    ("strip1 surface", g3[420:480, 660:700], g4[470:530, 660:700]),
    ("strip1 icon   ", g3[520:548, 646:703], g4[570:598, 646:703]),
]:
    print(f"  {name} v3 mean={z3.mean():5.1f} p95={np.percentile(z3,95):5.1f} | v4 mean={z4.mean():5.1f} p95={np.percentile(z4,95):5.1f}")

print("\n=== MOBILE (390x844) band: bottom 110px ===")
for tag, path in [("v3", BASE+"mobile-final-v3.png"), ("v4", BASE+"mobile-final-v4.png")]:
    g = zones(path)
    # band = last 110px of viewport IF section bottom aligned; find brightest 110-row window bottom
    z = g[698:807, 0:390]
    print(f"  {tag} {stats(z)}")
