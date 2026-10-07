#!/usr/bin/env python3
"""FINAL DESIGN COMPLETION — composites for VLM audit + user-facing proof.
Builds: theme-normal-grid (6 themes), theme-wave-grid (6), before/after search
pairs (desktop + mobile), search states strip."""
from PIL import Image
import os

L = "/home/z/my-project/download/qa-final-design/local"
P = "/home/z/my-project/download/qa-final-design/prod"
C = "/home/z/my-project/download/qa-final-design/compare"
os.makedirs(C, exist_ok=True)

def load(p, w=None):
    im = Image.open(p)
    if w and im.width != w:
        im = im.resize((w, int(im.height * w / im.width)), Image.LANCZOS)
    return im

def grid(paths, cols, out, label_h=0, w=None):
    ims = [load(p, w) for p in paths]
    cw = min(i.width for i in ims)
    ims = [im.resize((cw, int(im.height * cw / im.width)), Image.LANCZOS) for im in ims]
    ch = ims[0].height
    rows = (len(ims) + cols - 1) // cols
    canvas = Image.new("RGB", (cw * cols + 8 * (cols + 1), ch * rows + 8 * (rows + 1)), (10, 10, 12))
    for idx, im in enumerate(ims):
        r, c = divmod(idx, cols)
        canvas.paste(im, (8 + c * (cw + 8), 8 + r * (ch + 8)))
    canvas.save(out, quality=88)
    print("built", out, canvas.size)

themes = ["obsidian", "abyss", "borealis", "phantom", "ember", "daylight"]
grid([f"{L}/theme-{t}-normal-home.png" for t in themes], 3, f"{C}/theme-normal-grid.jpg", w=900)
grid([f"{L}/theme-{t}-wave-home.png" for t in themes], 3, f"{C}/theme-wave-grid.jpg", w=900)

def pair(a, b, out, labels=("BEFORE", "AFTER")):
    ia, ib = load(a, 1000), load(b, 1000)
    h = max(ia.height, ib.height)
    canvas = Image.new("RGB", (1000 * 2 + 24, h + 16), (10, 10, 12))
    canvas.paste(ia, (8, 8))
    canvas.paste(ib, (1016, 8))
    canvas.save(out, quality=88)
    print("built", out, canvas.size)

pair(f"{P}/before-d-search-results.png", f"{L}/search-d-results-kino.png", f"{C}/search-d-before-after.jpg")
pair(f"{P}/before-d-search-empty.png", f"{L}/search-d-discovery.png", f"{C}/search-d-empty-before-after.jpg")
pair(f"{P}/before-m-search-results.png", f"{L}/search-m-results-kino.png", f"{C}/search-m-before-after.jpg")
pair(f"{P}/before-m-search-empty.png", f"{L}/search-m-discovery.png", f"{C}/search-m-empty-before-after.jpg")

# tabs strip (desktop)
tabs = ["home", "search", "library", "playlists", "chats", "settings", "queue", "wave", "fullplayer", "contextmenu", "playerbar"]
grid([f"{L}/d-{t}.png" for t in tabs if os.path.exists(f"{L}/d-{t}.png")], 3, f"{C}/tabs-desktop-grid.jpg", w=760)

# mobile strip
mt = ["home", "search", "library", "settings", "wave", "fullplayer"]
grid([f"{L}/m-{t}.png" for t in mt if os.path.exists(f"{L}/m-{t}.png")], 3, f"{C}/tabs-mobile-grid.jpg", w=460)
print("done")
