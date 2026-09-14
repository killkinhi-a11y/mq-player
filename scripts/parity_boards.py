#!/usr/bin/env python3
"""Compose WEB vs ANDROID parity boards (375×844 pairs side by side)."""
from PIL import Image, ImageDraw, ImageFont
import os

BASE = "/home/z/my-project/download/screens/parity"
OUT = os.path.join(BASE, "boards")
os.makedirs(OUT, exist_ok=True)

PAIRS = [
    ("auth", "Auth"),
    ("home", "Home"),
    ("search", "Search"),
    ("library", "Library"),
    ("chats", "Chats"),
    ("profile", "Profile"),
    ("settings", "Settings"),
    ("fullplayer", "Full Player"),
    ("mixer", "Mixer / Эквалайзер"),
    ("contextmenu", "Context Menu"),
]

W, H, GAP, HEAD = 375, 844, 16, 56

try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
    small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
except Exception:
    font = small = ImageFont.load_default()

for key, label in PAIRS:
    web = os.path.join(BASE, f"web-{key}-375.png")
    android = os.path.join(BASE, f"android-{key}-375.png")
    if not (os.path.exists(web) and os.path.exists(android)):
        print(f"skip {key}: missing shot")
        continue
    w = Image.open(web).convert("RGB").resize((W, H))
    a = Image.open(android).convert("RGB").resize((W, H))
    board = Image.new("RGB", (W * 2 + GAP * 3, H + HEAD + GAP * 2), (10, 10, 10))
    draw = ImageDraw.Draw(board)
    draw.text((GAP + 4, 14), f"MQ Player — {label}: WEB  |  ANDROID", font=font, fill=(245, 245, 245))
    board.paste(w, (GAP, HEAD))
    board.paste(a, (W + GAP * 2, HEAD))
    # frame labels
    draw.text((GAP, HEAD + H + 6), "web 375×844", font=small, fill=(184, 184, 184))
    draw.text((W + GAP * 2, HEAD + H + 6), "android 375×844", font=small, fill=(184, 184, 184))
    path = os.path.join(OUT, f"parity-{key}.png")
    board.save(path)
    print("board:", path)
print("done")
