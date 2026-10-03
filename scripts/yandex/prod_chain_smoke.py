#!/usr/bin/env python3
"""PRODUCTION API smoke — public Yandex import via the built-in RU/CIS egress chain.

Target: https://mq1.vercel.app (production, NOT localhost).
Chain: Browser -> /api/yandex/public-playlist -> adapter (HMAC, JWT_SECRET) ->
       public RU/CIS relay -> api.music.yandex.net. Zero Yandex credentials.

Verdicts:
  - 1293 owner+kind: expect 200 + playlist card + 52 tracks + title/owner match
  - 1293 UUID form : expect 200 + same playlist
  - rsljst/1100    : factual result recorded (dead binding -> 404 expected)
  - invalid URL    : expect 400
  - SSRF host      : expect 400
  - probe          : default_egress_active=true, proxy_configured=false
"""
import json
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

BASE = "https://mq1.vercel.app"
EXPECT_COMMIT = "27a67532"
TIMEOUT = 75  # public route maxDuration 60 + slack

PASS, FAIL = 0, 0


def check(name, cond, extra=""):
    global PASS, FAIL
    mark = "OK  " if cond else "FAIL"
    if cond:
        PASS += 1
    else:
        FAIL += 1
    print(f" {mark} {name}" + (f" | {extra}" if extra else ""))


def http(method, url, body=None, timeout=TIMEOUT):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode(), dict(r.headers), int((time.time() - t0) * 1000)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(), dict(e.headers), int((time.time() - t0) * 1000)


def local_head() -> str:
    """Current repo HEAD (the smoke runs from the repo that was just pushed)."""
    try:
        import subprocess
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=str(Path(__file__).resolve().parents[2]), text=True
        ).strip()
    except Exception:
        return ""


def fetch_public_playlist(url: str, attempts: int = 3):
    """POST /api/yandex/public-playlist with retries on chain-transient failures.

    Public relays swing by the minute — a 503 yandex_proxy_error / 504
    yandex_timeout is a POOL phase, not a code regression; each retry is a
    fresh parallel race with fresh relay phases (exactly what a user retry
    does). Any 4xx verdict is final (real Yandex answer) and returned as-is.
    """
    last = None
    for i in range(attempts):
        st, body, hdrs, ms = http("POST", f"{BASE}/api/yandex/public-playlist", {"url": url})
        last = (st, body, hdrs, ms)
        if st < 500:
            return last
        if i < attempts - 1:
            print(f"  (attempt {i + 1} got {st} — chain phase, retrying)"),
            time.sleep(3)
    return last


def main():
    print(f"=== production API smoke: {BASE} ===")
    expected = local_head() or EXPECT_COMMIT
    print(f"expected commit: {expected}")

    st, body, _, _ = http("GET", f"{BASE}/version.json", timeout=15)
    ver = json.loads(body)
    build = ver.get("buildId", "")
    commit = ver.get("commit", "")
    print(f"version.json: build={build} commit={commit} version={ver.get('version')}")
    check("deployed build is the repo HEAD (auto-deploy in sync)", commit.startswith(expected[:8]), f"commit={commit}")

    print("\n--- adapter probe ---")
    st, body, _, ms = http("GET", f"{BASE}/api/yandex_adapter", timeout=20)
    probe = json.loads(body)
    print(f"probe ({ms}ms): ok={probe.get('ok')} python={probe.get('python')} "
          f"yandex_music={probe.get('yandex_music')} proxy_configured={probe.get('proxy_configured')} "
          f"default_egress_active={probe.get('default_egress_active')}")
    check("probe ok", st == 200 and probe.get("ok") is True)
    check("chain active on production (no env proxy)",
          probe.get("default_egress_active") is True and probe.get("proxy_configured") is False)

    print("\n--- 1293 owner+kind (CONTROL) ---")
    st, body, hdrs, ms = fetch_public_playlist("https://music.yandex.ru/users/music.partners/playlists/1293")
    print(f"HTTP {st} ({ms}ms)")
    out = json.loads(body) if body.startswith("{") else {}
    pl = out.get("playlist") or {}
    tracks = out.get("tracks") or []
    print(f"  title={pl.get('title')!r} owner={pl.get('owner') or pl.get('ownerLogin')} "
          f"trackCount={pl.get('trackCount') or pl.get('track_count')} tracks={len(tracks)} "
          f"cover={'yes' if pl.get('coverUrl') or pl.get('cover') else 'no'}")
    print(f"  rate-limit: {hdrs.get('x-ratelimit-limit')}/{hdrs.get('x-ratelimit-remaining')}")
    check("1293 -> HTTP 200", st == 200, f"status={st} body[:200]={body[:200]}")
    check("1293 -> ok envelope + real playlist", out.get("ok") is True or pl.get("title") is not None)
    check("1293 -> title matches", pl.get("title") == "Лучшие новые песни 2015 года", str(pl.get("title")))
    owner = pl.get("owner") or pl.get("ownerLogin") or ""
    check("1293 -> owner music.partners", "music.partners" in str(owner), str(owner))
    check("1293 -> 52 tracks", len(tracks) == 52, f"got {len(tracks)}")
    if tracks:
        t0 = tracks[0]
        print(f"  first: artists={t0.get('artists')} title={t0.get('title')!r}")
        check("1293 -> track fields real", bool(t0.get("title")) and bool(t0.get("artists")))

    print("\n--- 1293 UUID form ---")
    st, body, _, ms = fetch_public_playlist("https://music.yandex.ru/playlist/1ccd74db-792b-4756-60f7-96b22f024a4e")
    out = json.loads(body) if body.startswith("{") else {}
    pl = out.get("playlist") or {}
    print(f"HTTP {st} ({ms}ms) title={pl.get('title')!r} tracks={len(out.get('tracks') or [])}")
    check("UUID link -> 200 + same playlist", st == 200 and pl.get("title") == "Лучшие новые песни 2015 года")

    print("\n--- rsljst/1100 (FACTUAL) ---")
    st, body, _, ms = fetch_public_playlist("https://music.yandex.ru/users/rsljst/playlists/1100")
    out = json.loads(body) if body.startswith("{") else {}
    err_code = out.get("error") if isinstance(out.get("error"), str) else (out.get("error") or {}).get("code")
    print(f"HTTP {st} ({ms}ms) error={err_code} message={out.get('message')!r}")
    check("1100 -> factual 404 (dead binding, recorded as source property)",
          st == 404 and err_code == "yandex_not_found",
          f"status={st} error={err_code}")

    print("\n--- guards ---")
    st, body, _, _ = http("POST", f"{BASE}/api/yandex/public-playlist", {"url": "not a url"})
    check("invalid URL -> 400", st == 400, f"status={st}")
    st, body, _, _ = http("POST", f"{BASE}/api/yandex/public-playlist",
                          {"url": "https://evil.example.com/users/a/playlists/1"})
    check("foreign host -> 400", st == 400, f"status={st}")
    st, body, _, _ = http("POST", f"{BASE}/api/yandex/public-playlist",
                          {"url": "https://music.yandex.ru/users/music.partners/playlists/1293?x=" + "y" * 600})
    check("oversize URL -> 400", st == 400, f"status={st}")

    print(f"\n=== SMOKE: {PASS} passed, {FAIL} failed ===")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
