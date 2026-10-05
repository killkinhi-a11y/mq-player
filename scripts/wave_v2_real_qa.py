#!/usr/bin/env python3
"""MQ WAVE V2 — REAL RECOMMENDATION QA (PART 13).

Runs 20 sequential Wave recommendations against the LOCAL production build
with a REALISTIC RU/EU user profile (real artists, real genres, RU+EN
listening history). No fixtures: every candidate comes from the real
SoundCloud candidate channels.

For every served pick we record:
  n, title, artist, genre, reason, finalScore, anchor, relevancePassed

Session simulation: a couple of likes, one skip burst (3 early skips of a
foreign-ish track if it ever appears — testing skip redirect on real data),
completions — driving the session layer like a real listening session.

Output: download/qa-wave-v2/real-qa-20.json + a readable table.
"""
import json
import sys
import urllib.request

BASE = "http://localhost:3000"
OUT = "/home/z/my-project/download/qa-wave-v2/real-qa-20.json"

# Realistic RU/EU listener: post-punk / indie / electronic + RU rock classics.
PROFILE = {
    "anonId": "real-qa-user-0001",
    "debug": True,
    "likedArtists": ["Molchat Doma", "Joy Division", "Tame Impala", "Кино"],
    "likedGenres": ["post punk", "indie rock", "electronic", "rock"],
    "historyArtists": ["Molchat Doma", "BONES", "Tame Impala", "Виктор Цой", "New Order"],
    "historyGenres": ["post punk", "indie rock", "rock", "electronic"],
    "tasteGenres": ["post punk", "indie rock", "electronic"],
    "tasteArtists": ["Molchat Doma", "Tame Impala"],
    "language": "mixed",
    "likedTexts": [
        "Судно Molchat Doma",
        "Atmosphere Joy Division",
        "The Less I Know The Better Tame Impala",
        "Группа крови Кино",
    ],
    "historyTexts": [
        "Судно Molchat Doma",
        "Atmosphere Joy Division",
        "Blue Monday New Order",
        "Группа крови Кино",
        "Dirt BONES",
        "Elephant Tame Impala",
        "концерт Виктор Цой",
        "custom entertainment Molchat Doma",
    ],
    "seed": {"kind": "taste", "label": "Ваш вкус"},
}

# Unicode cluster markers for the foreign-content sweep (mirrors clusters.ts)
FOREIGN_MARKERS = {
    "indic": range(0x0900, 0x0980),
    "devanagari_ext": range(0x0980, 0x0A00),
    "thai": range(0x0E00, 0x0E80),
    "hangul_syll": range(0xAC00, 0xD800),
    "hangul_jamo": range(0x1100, 0x1200),
    "kana": range(0x3040, 0x3100),
    "cjk": range(0x4E00, 0xA000),
    "arabic": range(0x0600, 0x0700),
    "hebrew": range(0x0590, 0x0600),
    "vietnamese": None,  # handled below (supplementary plane ranges)
}
FOREIGN_GENRE_TOKENS = [
    "bollywood", "bhangra", "punjabi", "desi", "hindi", "tamil", "k-pop", "kpop",
    "kdrama", "arabic", "arabesk", "reggaeton", "salsa", "bachata", "cumbia",
    "mariachi", "banda", "corrido", "v-pop", "vpop", "bolero", "türkçe", "turkish",
]
VIET_RE = None  # done via codepoint check


def cluster_of(text: str, genre: str) -> str | None:
    for ch in text:
        cp = ord(ch)
        for name, rng in FOREIGN_MARKERS.items():
            if isinstance(rng, range) and cp in rng:
                return name
        if 0x01A0 <= cp <= 0x01B0 or 0x1EA0 <= cp <= 0x1EF9:
            return "vietnamese"
        if cp in (0x011F, 0x0130, 0x0131, 0x015F):
            return "turkish"
    g = (genre or "").lower()
    for tok in FOREIGN_GENRE_TOKENS:
        if tok in g:
            return f"genre:{tok}"
    return None


def post(path: str, body: dict) -> dict:
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read())


def main() -> int:
    picks = []
    served_ids: list[str] = []
    exclude_ids: list[str] = []
    session_events: list[dict] = []
    gate_log: list[dict] = []
    meta_log: list[dict] = []

    batch_no = 0
    session_id = None
    while len(picks) < 20:
        batch_no += 1
        body = {**PROFILE}
        body["excludeIds"] = exclude_ids[:150]
        body["sessionEvents"] = session_events
        if session_id:
            body["sessionId"] = session_id
        path = "/api/wave" if batch_no == 1 else "/api/wave/next"
        data = post(path, body)
        session_id = data.get("sessionId")
        tracks = data.get("tracks", [])
        meta = data.get("meta", {})
        meta_log.append({"batch": batch_no, **{k: v for k, v in meta.items() if k != "gate_rejected"}})
        for g in (meta.get("gate_rejected") or []):
            gate_log.append({"batch": batch_no, **g})

        take = tracks[: min(len(tracks), 20 - len(picks))]
        for t in take:
            dbg = t.get("_debug") or {}
            picks.append({
                "n": len(picks) + 1,
                "title": t.get("title"),
                "artist": t.get("artist"),
                "genre": t.get("genre"),
                "reason": t.get("_reason"),
                "seedRef": t.get("_seedArtist"),
                "finalScore": dbg.get("finalScore"),
                "anchor": dbg.get("anchor"),
                "relevancePassed": dbg.get("relevancePassed"),
                "batch": batch_no,
                "foreignCluster": cluster_of(f"{t.get('title','')} {t.get('artist','')}", t.get("genre") or ""),
            })
            served_ids.append(t["id"])
            exclude_ids.append(t["id"])
            # Simulate a realistic listening session:
            n = picks[-1]["n"]
            if n == 5:
                # user skips one track early (mild negative)
                session_events.append({"type": "track_skipped", "trackId": t["id"], "title": t.get("title"), "artist": t.get("artist"), "genre": t.get("genre"), "position": 20, "duration": t.get("duration") or 200, "at": 1})
            elif n % 4 == 0:
                # likes a few
                session_events.append({"type": "track_liked", "trackId": t["id"], "title": t.get("title"), "artist": t.get("artist"), "genre": t.get("genre"), "at": n})
                session_events.append({"type": "play_completed", "trackId": t["id"], "title": t.get("title"), "artist": t.get("artist"), "genre": t.get("genre"), "at": n})
            else:
                session_events.append({"type": "play_completed", "trackId": t["id"], "title": t.get("title"), "artist": t.get("artist"), "genre": t.get("genre"), "at": n})

        if not tracks:
            print(f"[batch {batch_no}] EMPTY — stopping")
            break

    # ── Report ──
    print(f"\n{'#':>2}  {'TITLE':34} {'ARTIST':24} {'GENRE':14} {'REASON':18} {'FINAL':>6}  ANCHOR")
    print("-" * 118)
    for p in picks:
        print(f"{p['n']:>2}  {(p['title'] or '')[:33]:34} {(p['artist'] or '')[:23]:24} {(p['genre'] or '')[:13]:14} {(p['reason'] or '')[:17]:18} {p['finalScore']!s:>6}  {p['anchor']}")
    print("-" * 118)
    passed = sum(1 for p in picks if p["relevancePassed"])
    foreign = [p for p in picks if p["foreignCluster"]]
    expl = sum(1 for p in picks if p["reason"] == "exploration")
    print(f"TOTAL {len(picks)} | passed gate {passed} | exploration {expl} | FOREIGN-CLUSTER {len(foreign)}")
    for p in foreign:
        print(f"  !! FOREIGN: #{p['n']} {p['title']} — {p['artist']} [{p['foreignCluster']}]")
    print("\nBATCH META:")
    for m in meta_log:
        print(f"  batch {m['batch']}: candidates={m.get('candidate_count')} ranked={m.get('ranked_count')} rejected={m.get('relevance_rejected_count')} exploration={m.get('exploration_count')} rung={m.get('gate_rung')}")
    print(f"\nGATE REJECTED SAMPLE ({len(gate_log)}):")
    for g in gate_log[:12]:
        print(f"  batch {g['batch']}: {str(g.get('title'))[:32]:32} | {str(g.get('artist'))[:20]:20} | {g.get('blockedBy')} | {str(g.get('reason'))[:60]}")

    json.dump({"picks": picks, "meta": meta_log, "gateRejected": gate_log}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"\nsaved → {OUT}")
    return 0 if len(picks) >= 20 else 1


if __name__ == "__main__":
    sys.exit(main())
