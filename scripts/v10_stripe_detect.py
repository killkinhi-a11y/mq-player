#!/usr/bin/env python3
"""v10 task 2 — detect artificial stripes on Spatial artwork.

Compares the artwork AS RENDERED in the player screenshot vs the RAW image:
1. Crop the center-card artwork rect from the screenshot.
2. Download the raw cover (same URL the <img> uses).
3. Detect horizontal/vertical line anomalies in the rendered crop that are
   NOT present in the raw image (row/col difference spikes).
"""
import sys, urllib.request, io
from PIL import Image
import numpy as np

shot_path = "/home/z/my-project/download/qa-v10/03-spatial-open.png"
cover_url = open("/tmp/v10-cover-url.txt").read().strip().strip('"')

# center card artwork rect from DOM: x=504 y=148 w=432 h=432 (artwork part)
# card is 432x520, artwork = top 432px
shot = Image.open(shot_path).convert("RGB")
card_x, card_y, card_w, card_h = 504, 148, 432, 520
art = shot.crop((card_x, card_y, card_x + card_w, card_y + card_w))  # artwork square only
art.save("/home/z/my-project/download/qa-v10/03a-center-artwork.png")

req = urllib.request.Request(cover_url, headers={"User-Agent": "Mozilla/5.0"})
raw = Image.open(io.BytesIO(urllib.request.urlopen(req).read())).convert("RGB")
raw.save("/home/z/my-project/download/qa-v10/03b-raw-cover.png")
raw_resized = raw.resize((card_w, card_w), Image.LANCZOS)

a = np.asarray(art).astype(np.int16)
b = np.asarray(raw_resized).astype(np.int16)

# Row-wise mean brightness profile
def row_profile(x):
    return x.mean(axis=(1, 2))

def col_profile(x):
    return x.mean(axis=(0, 2))

ra, rb = row_profile(a), row_profile(b)
ca, cb = col_profile(a), col_profile(b)

# difference spikes: rendered profile minus raw profile, find rows where the
# rendered image has a sudden step that the raw doesn't
da = np.abs(np.diff(ra)); db = np.abs(np.diff(rb))
stripes_rows = np.where((da - db) > 6)[0]  # rows with extra sudden change
dc_a = np.abs(np.diff(ca)); dc_b = np.abs(np.diff(cb))
stripes_cols = np.where((dc_a - dc_b) > 6)[0]

print("rendered artwork size:", art.size)
print("row-profile extra-step rows (candidate horizontal stripes):", stripes_rows[:40])
print("col-profile extra-step cols (candidate vertical stripes):", stripes_cols[:40])

# Also detect near-uniform thin rows that differ strongly from neighbours
med = np.median(ra)
row_delta = np.abs(np.diff(ra))
sus = np.where(row_delta > 4)[0]
print("rendered: rows with brightness jump >4:", sus[:40])
row_delta_raw = np.abs(np.diff(rb))
sus_raw = np.where(row_delta_raw > 4)[0]
print("raw:      rows with brightness jump >4:", sus_raw[:40])

# vertical: uniform columns
col_delta = np.abs(np.diff(ca))
print("rendered: cols with jump >4:", np.where(col_delta > 4)[0][:40])
print("max |rendered-raw| per-row mean diff:", float(np.abs(ra - rb).max()))

# Check the glass strip area too (below artwork, inside card): y 432..520
strip = shot.crop((card_x, card_y + card_w, card_x + card_w, card_y + card_h))
strip.save("/home/z/my-project/download/qa-v10/03c-strip.png")
sa = np.asarray(strip).astype(np.int16)
sra = sa.mean(axis=(1, 2))
print("strip row profile:", np.round(sra, 1))
