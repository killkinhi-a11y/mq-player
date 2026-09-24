#!/usr/bin/env python3
"""v10 — analyze mid-transition + side cards + background banding."""
from PIL import Image
import numpy as np

BASE = "/home/z/my-project/download/qa-v10"

def band_score(arr, axis):
    """Detect periodic horizontal/vertical bands: high auto-correlation of
    row-diff profile at small lags with a strong periodic component."""
    prof = arr.mean(axis=(1, 2)) if axis == "row" else arr.mean(axis=(0, 2))
    d = np.diff(prof)
    d = d - d.mean()
    if np.abs(d).max() < 1e-6:
        return 0.0, 0
    # FFT-based periodicity: peak magnitude ratio at freq>2
    f = np.abs(np.fft.rfft(d))
    total = f[3:].sum()
    if total <= 0:
        return 0.0, 0
    peak_idx = int(np.argmax(f[3:]) + 3)
    ratio = float(f[peak_idx] / (f.sum() + 1e-9))
    return ratio, peak_idx

mid = Image.open(f"{BASE}/05-midtransition.png").convert("RGB")
after = Image.open(f"{BASE}/05b-after-transition.png").convert("RGB")

# 1) Background banding (around the deck): crop full width strips
for name, img in [("mid", mid), ("after", after)]:
    a = np.asarray(img).astype(np.int16)
    # top strip above cards (y 40..140)
    top = a[40:140, :]
    side = a[300:500, 0:480]
    r_top, k_top = band_score(top, "row")
    r_side, k_side = band_score(side, "row")
    print(f"{name}: top band ratio={r_top:.3f} (peak k={k_top}) | left-of-deck ratio={r_side:.3f} (k={k_side})")

# 2) Side card regions on the mid-transition shot: look for stripes inside
#    card areas (they are rotated, so we test both row & col periodicity)
sc = np.asarray(mid).astype(np.int16)
left_card = sc[228:610, 360:682]   # -1 card approx
right_card = sc[228:610, 758:1080] # +1 card approx
for nm, crop in [("left-1", left_card), ("right+1", right_card)]:
    rr, kr = band_score(crop, "row")
    rc, kc = band_score(crop, "col")
    print(f"mid {nm}: row-periodicity={rr:.3f}(k={kr}) col-periodicity={rc:.3f}(k={kc})")

# 3) mid-transition center: strong horizontal edges?
cc = sc[148:580, 504:936]
rr, kr = band_score(cc, "row")
print(f"mid center: row-periodicity={rr:.3f} (k={kr})")

# save crops for VLM review
Image.fromarray(left_card.astype(np.uint8)).save(f"{BASE}/05-mid-left-card.png")
Image.fromarray(right_card.astype(np.uint8)).save(f"{BASE}/05-mid-right-card.png")
Image.fromarray(cc.astype(np.uint8)).save(f"{BASE}/05-mid-center.png")
mid.save(f"{BASE}/05-midtransition.png")
print("saved crops")
