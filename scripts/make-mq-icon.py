#!/usr/bin/env python3
"""Extract the white 'mq' glyph from the canonical web icon (resources/icon.png)
and generate Android adaptive-icon layers + notification/splash bitmaps.

Canonical web mark: near-black square tile (#060807) + white 'mq' wordmark.
Outputs (into /tmp/my-project/icon-out/):
  fg_<dpi>.png       adaptive foreground layers (glyph inside 66dp safe zone)
  mono_<dpi>.png      monochrome layer (same glyph)
  notif_<dpi>.png     24dp alpha-only notification small icon
  splash_<dpi>.png    splash glyph bitmap
"""
from PIL import Image, ImageDraw, ImageOps

SRC = "/home/z/my-project/resources/icon.png"
OUT = "/tmp/my-project/icon-out"
import os
os.makedirs(OUT, exist_ok=True)

img = Image.open(SRC).convert("RGBA")
W, H = img.size
print("source:", img.size)

px = img.load()

# 1) Glyph extraction: the favicon draws a white ROUNDED-RECT BORDER (stroke
#    centerline: edges at 131px from each side, corner radius ~90) plus the
#    white 'mq' wordmark inside. The adaptive-icon foreground wants ONLY the
#    wordmark (the launcher mask provides the tile shape). Frame test = signed
#    distance to the rounded-rect outline: |d| <= 16 -> border stroke.
import math
CX = CY = 512.0
B = 381.0   # half-extent of the edge centerline (512 - 131)
R = 90.0    # corner radius

def on_frame(x: int, y: int) -> bool:
    ax, ay = abs(x - CX), abs(y - CY)
    qx, qy = ax - B + R, ay - B + R
    mx, my = max(qx, 0.0), max(qy, 0.0)
    d = math.hypot(mx, my) + min(max(qx, qy), 0.0) - R
    return abs(d) <= 16.0

bright = [[False] * W for _ in range(H)]
for y in range(H):
    for x in range(W):
        r, g, b, a = px[x, y]
        if r > 120 and g > 120 and b > 120 and not on_frame(x, y):
            bright[y][x] = True

# Largest connected component (drops stray corner/dust fragments)
seen = [[False] * W for _ in range(H)]
best = []
for sy in range(H):
    for sx in range(W):
        if bright[sy][sx] and not seen[sy][sx]:
            stack = [(sx, sy)]
            seen[sy][sx] = True
            comp = []
            while stack:
                x, y = stack.pop()
                comp.append((x, y))
                for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
                    if 0 <= nx < W and 0 <= ny < H and bright[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if len(comp) > len(best):
                best = comp
minx = min(p[0] for p in best); maxx = max(p[0] for p in best)
miny = min(p[1] for p in best); maxy = max(p[1] for p in best)
keep = set(best)
print("glyph bbox:", (minx, miny, maxx, maxy), "size:", maxx - minx + 1, "x", maxy - miny + 1,
      "pixels:", len(best))

gw, gh = maxx - minx + 1, maxy - miny + 1

# 2) Alpha mask from the kept component (+ 1px dilation to keep the
#    anti-aliased edge pixels, alpha = their real luminance).
mask = Image.new("L", (gw, gh), 0)
mp = mask.load()
for (x, y) in keep:
    mp[x - minx, y - miny] = 255
for (x, y) in keep:
    for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1),(x-1,y-1),(x+1,y-1),(x-1,y+1),(x+1,y+1)):
        if minx <= nx <= maxx and miny <= ny <= maxy and (nx, ny) not in keep:
            r, g, b, _ = px[nx, ny]
            lum = int(0.299 * r + 0.587 * g + 0.114 * b)
            if lum > 40:
                a = mp[nx - minx, ny - miny]
                mp[nx - minx, ny - miny] = max(a, min(255, lum * 2))

def paste_on(canvas_size, mask_src, bg=None):
    """Scale glyph mask to fit (canvas_size * fit) and center; white RGBA or
    black-on-transparent when bg given -> return RGBA image."""
    fit = 0.60  # glyph occupies 60% of the layer -> inside the 66% safe zone
    target = int(canvas_size * fit)
    ratio = target / mask_src.size[0]
    m = mask_src.resize((target, max(1, int(mask_src.size[1] * ratio))), Image.LANCZOS)
    # if the glyph is too tall, scale by height instead
    if m.size[1] > int(canvas_size * fit):
        ratio = int(canvas_size * fit) / mask_src.size[1]
        m = mask_src.resize((max(1, int(mask_src.size[0] * ratio)), int(canvas_size * fit)), Image.LANCZOS)
    out = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    if bg:
        draw = ImageDraw.Draw(out)
        draw.rectangle([0, 0, canvas_size, canvas_size], fill=bg)
    white = Image.new("RGBA", m.size, (255, 255, 255, 255))
    out.paste(white, ((canvas_size - m.size[0]) // 2, (canvas_size - m.size[1]) // 2), m)
    return out

# 3) Adaptive foreground layers (108dp layer; glyph in safe zone)
DENSITIES = {  # dpi -> px for 108dp layer
    "mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432,
}
for dpi, size in DENSITIES.items():
    paste_on(size, mask).save(f"{OUT}/fg_{dpi}.png")
    # monochrome = same glyph (system tints by alpha)
    paste_on(size, mask).save(f"{OUT}/mono_{dpi}.png")

# 4) Notification small icon: 24dp alpha-only (system applies tint)
NOTIF = {"mdpi": 24, "hdpi": 36, "xhdpi": 48, "xxhdpi": 72, "xxxhdpi": 96}
for dpi, size in NOTIF.items():
    fit = 0.82  # fill more of the 24dp canvas
    target = int(size * fit)
    ratio = target / mask.size[0]
    m = mask.resize((target, max(1, int(mask.size[1] * ratio))), Image.LANCZOS)
    if m.size[1] > int(size * fit):
        ratio = int(size * fit) / mask.size[1]
        m = mask.resize((max(1, int(mask.size[0] * ratio)), int(size * fit)), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    white = Image.new("RGBA", m.size, (255, 255, 255, 255))
    out.paste(white, ((size - m.size[0]) // 2, (size - m.size[1]) // 2), m)
    out.save(f"{OUT}/notif_{dpi}.png")

# 5) Splash glyph (draws on mq_launch_bg #0E0E10)
SPLASH = {"mdpi": 96, "hdpi": 144, "xhdpi": 192, "xxhdpi": 288, "xxxhdpi": 384}
for dpi, size in SPLASH.items():
    paste_on(size, mask).save(f"{OUT}/splash_{dpi}.png")

# 6) Also save a preview tile: black bg + glyph = full canonical mark
preview = paste_on(512, mask, bg=(6, 8, 7, 255))
preview.save(f"{OUT}/preview_512.png")
print("done ->", OUT)
