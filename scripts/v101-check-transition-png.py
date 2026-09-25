#!/usr/bin/env python3
"""v10.1 §17 shot 12 verification — pixel-region analysis of the
mobile player-transition frame. The slide-up freeze at 20% (of 250ms,
ease 0.32/0.72/0/1) leaves the player translated down ~290px:
- top ~290px = the page BEHIND (search results)
- bottom ~554px = the player's own content over its solid bg
If the whole frame is the background page, the freeze missed."""
import sys
from PIL import Image

def region_stats(im, box):
    px = im.crop(box)
    small = px.resize((24, 24))
    data = list(small.convert("L").getdata())
    mean = sum(data) / len(data)
    # variance-ish: how text/list-like the region is
    var = sum((d - mean) ** 2 for d in data) / len(data)
    colors = px.resize((12, 12)).convert("RGB").getdata()
    uniq = len(set(colors))
    return mean, var, uniq

def main(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    print(f"size: {w}x{h}")
    bands = [
        ("top 0-25% (behind page)", (0, 0, w, h // 4)),
        ("upper-mid 25-45%", (0, h // 4, w, int(h * 0.45))),
        ("lower-mid 45-70% (player zone)", (0, int(h * 0.45), w, int(h * 0.70))),
        ("bottom 70-100% (player controls)", (0, int(h * 0.70), w, h)),
    ]
    prev_mean = None
    for name, box in bands:
        m, v, u = region_stats(im, box)
        print(f"{name:34} mean={m:6.1f} var={v:7.1f} uniqColors={u}")

if __name__ == "__main__":
    main(sys.argv[1])
