#!/usr/bin/env python3
"""v6.1 QA store: history built from REAL genre-diverse SoundCloud tracks
(fetched live from the local curated API) so the taste engine produces a
fuller real curated set (genre playlists + Похожее + Открытия + Популярное)."""
import base64, json, io, re, subprocess, urllib.request

# 1. Fetch real tracks from the local curated endpoint
raw = urllib.request.urlopen("http://localhost:3111/api/playlists/curated", timeout=60).read()
d = json.loads(raw)

GENRES = ["deep house", "house", "pop", "techno", "indie", "alternative rock", "lo-fi"]
picked: dict[str, dict] = {}
for pl in d.get("playlists", []):
    for t in pl.get("tracks", []):
        g = (t.get("genre") or "").strip().lower()
        if g in GENRES and g not in picked:
            picked[g] = {
                "id": t["id"], "title": t["title"], "artist": t["artist"],
                "album": t.get("album", ""), "duration": t.get("duration", 0),
                "cover": t.get("cover", ""), "genre": g, "source": t.get("source", "soundcloud"),
                "scTrackId": t.get("scTrackId"), "scStreamPolicy": t.get("scStreamPolicy", ""),
                "scIsFull": t.get("scIsFull", False), "audioUrl": t.get("audioUrl", ""),
                "previewUrl": t.get("previewUrl", ""),
            }
        if len(picked) == len(GENRES):
            break
    if len(picked) == len(GENRES):
        break
print("picked genres:", list(picked))

# 2. Base store from the v5 backup (auth + playlists)
src = io.open("/home/z/my-project/scripts/qa_v5_capture.sh", encoding="utf-8").read()
m = re.search(r"atob\('([^']+)'\)", src)
store = json.loads(json.loads(base64.b64decode(m.group(1)).decode("utf-8")))
st = store["state"]

now = 1790270000000
tracks = list(picked.values())
st["history"] = [
    {"track": t, "playedAt": now - (i + 1) * 3600_000, "playCount": 2 if i < 3 else 1}
    for i, t in enumerate(tracks)
]
st["likedTrackIds"] = [t["id"] for t in tracks[:4]]
st["likedTracksData"] = tracks[:4]
st["dislikedTrackIds"] = []
st["dislikedTracksData"] = []
st["currentView"] = "main"

payload = json.dumps({"state": st, "version": store.get("version", 12)}, ensure_ascii=False)
b64 = base64.b64encode(payload.encode("utf-8")).decode("ascii")
io.open("/home/z/my-project/scripts/qa_v6_store.js", "w", encoding="utf-8").write(
    f'const QA_STORE_B64 = "{b64}";\nexport {{ QA_STORE_B64 }};\n'
)
print("payload chars:", len(b64))
