#!/usr/bin/env python3
"""v10 — batch stripe analysis over multiple track screenshots."""
import urllib.request, io, json
from PIL import Image
import numpy as np

BASE = "/home/z/my-project/download/qa-v10"
# center card artwork rect is stable: x=504 y=148 w=432 (art square)
CARD_X, CARD_Y, CARD_W = 504, 148, 432

def analyze(tag):
    shot = Image.open(f"{BASE}/04-track{tag}.png").convert("RGB")
    url = open(f"/tmp/v10-cover-{tag}.txt").read().strip().strip('"')
    art = shot.crop((CARD_X, CARD_Y, CARD_X + CARD_W, CARD_Y + CARD_W))
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    raw = Image.open(io.BytesIO(urllib.request.urlopen(req).read())).convert("RGB")
    raw = raw.resize((CARD_W, CARD_W), Image.LANCZOS)
    a = np.asarray(art).astype(np.int16)
    b = np.asarray(raw).astype(np.int16)
    ra, rb = a.mean(axis=(1, 2)), b.mean(axis=(1, 2))
    da, db = np.abs(np.diff(ra)), np.abs(np.diff(rb))
    extra = np.where((da - db) > 6)[0]
    # structural similarity quick check: mean abs pixel diff
    pixdiff = float(np.abs(a - b).mean())
    print(f"track{tag}: extra-step rows={list(extra[:15])} meanPixDiff={pixdiff:.2f} maxRowDiff={float(np.abs(ra-rb).max()):.2f}")
    # also save crops for VLM
    art.save(f"{BASE}/04-track{tag}-art.png")

for t in ["1", "2", "3", "4"]:
    try:
        analyze(t)
    except Exception as e:
        print(f"track{t}: ERROR {e}")
