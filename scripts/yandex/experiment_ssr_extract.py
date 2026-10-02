"""Extract playlist + tracks from music.yandex.ru SSR flight data (RSC)."""

import re
import json
import requests

URL = "https://music.yandex.ru/users/music.partners/playlists/1293"

h = {
    "User-Agent": "TelegramBot",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.6",
}
r = requests.get(URL, headers=h, timeout=30)
html = r.text
print("status:", r.status_code, "len:", len(html))

# RSC flight chunks: self.__next_f.push([1,"...json-escaped..."])
chunks = re.findall(r'self\.__next_f\.push\(\[1,(".*?")\]\)', html, re.S)
print("flight chunks:", len(chunks))
blob = ""
for c in chunks:
    try:
        blob += json.loads(c)
    except Exception:
        pass
print("flight blob len:", len(blob))

# Search for playlist markers inside the flight payload
for marker in ["playlist", "trackCount", "tracks", "music.partners", '"title"']:
    print(f"marker {marker!r}: count={blob.count(marker)}")

# Try to locate a playlist object with title + trackCount
idx = blob.find("trackCount")
if idx > 0:
    print("\n=== around trackCount ===")
    print(blob[max(0, idx-300):idx+500])
else:
    # try camelCase variants
    for m in re.finditer(r'"(playlist|owner|kinds?)"\s*:', blob[:200000]):
        print("found key", m.group(0), "at", m.start())
        break
    idx2 = blob.find("playlists")
    print(blob[max(0, idx2-200):idx2+800] if idx2 > 0 else "no 'playlists' key")
