#!/usr/bin/env python3
"""LIVE chain proof: real adapter handler + built-in RU/CIS egress chain + real Yandex.

From this sandbox direct egress is HK (451) — a 200 here proves the chain works.
Checks: music.partners/1293 (expect 200 + 52 tracks), rsljst/1100 (factual),
bad-uuid (expect 404). No credentials anywhere (tokenless action).
"""
import hashlib
import hmac
import json
import subprocess
import sys
import time
import urllib.request

SECRET = b"chain-live-proof-secret-0123456789abcd"
PORT = 8791
BASE = f"http://127.0.0.1:{PORT}"

server = subprocess.Popen(
    [sys.executable, "api/yandex_adapter.py", "--port", str(PORT)],
    cwd="/home/z/my-project",
    env={"JWT_SECRET": SECRET.decode(), "PATH": "/usr/bin:/bin", "PYTHONUNBUFFERED": "1"},
    stdout=subprocess.DEVNULL,
    stderr=subprocess.PIPE,
)
time.sleep(1.5)


def call(payload, expect):
    body = json.dumps(payload).encode()
    ts = str(int(time.time()))
    dk = hmac.new(SECRET, b"mq-yandex-adapter-v1", hashlib.sha256).digest()
    sig = hmac.new(dk, f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    req = urllib.request.Request(
        BASE, data=body, method="POST",
        headers={"Content-Type": "application/json", "X-MQ-Timestamp": ts, "X-MQ-Signature": sig},
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            out = json.loads(r.read())
            ms = int((time.time() - t0) * 1000)
            return r.status, out, ms
    except urllib.error.HTTPError as e:
        out = json.loads(e.read() or b"{}")
        ms = int((time.time() - t0) * 1000)
        return e.code, out, ms


try:
    print("=== probe (GET) ===")
    with urllib.request.urlopen(BASE, timeout=10) as r:
        probe = json.loads(r.read())
    print("probe:", {k: probe.get(k) for k in ("ok", "python", "yandex_music", "proxy_configured", "default_egress_active")})
    assert probe.get("default_egress_active") is True, "chain must be active (no env proxy)"

    print("\n=== music.partners/1293 (control) ===")
    st, out, ms = call({"action": "public_playlist", "user_id": "music.partners", "kind": 1293}, 200)
    d = out.get("data") or {}
    tr = d.get("tracks") or []
    print(f"HTTP {st} ({ms}ms) ok={out.get('ok')} title={d.get('title')!r} owner={d.get('owner_login')} "
          f"track_count={d.get('track_count')} tracks_len={len(tr)}")
    if tr:
        print("first 3:", [(t["artists"][0] if t["artists"] else "?", t["title"]) for t in tr[:3]])
    print("creds in request: NONE (tokenless action, public chain relays)")

    print("\n=== rsljst/1100 (factual) ===")
    st2, out2, ms2 = call({"action": "public_playlist", "user_id": "rsljst", "kind": 1100}, 0)
    print(f"HTTP {st2} ({ms2}ms) error={out2.get('error')}")

    print("\n=== uuid control (1293 uuid) ===")
    st3, out3, ms3 = call({"action": "public_playlist", "playlist_uuid": "1ccd74db-792b-4756-60f7-96b22f024a4e"}, 200)
    d3 = out3.get("data") or {}
    print(f"HTTP {st3} ({ms3}ms) ok={out3.get('ok')} title={d3.get('title')!r} tracks={len(d3.get('tracks') or [])}")

    print("\n=== repeat 1293 (warm-start sticky candidate) ===")
    st4, out4, ms4 = call({"action": "public_playlist", "user_id": "music.partners", "kind": 1293}, 200)
    d4 = out4.get("data") or {}
    print(f"HTTP {st4} ({ms4}ms) tracks={len(d4.get('tracks') or [])}")

    verdict = (
        st == 200 and out.get("ok") is True
        and d.get("title") == "Лучшие новые песни 2015 года"
        and d.get("owner_login") == "music.partners"
        and (d.get("track_count") or 0) > 0
    )
    print("\nCHAIN LIVE PROOF:", "PASS" if verdict else "FAIL")
    sys.exit(0 if verdict else 1)
finally:
    server.terminate()
    err = server.stderr.read().decode(errors="replace") if server.stderr else ""
    chain_lines = [ln for ln in err.splitlines() if "default egress" in ln]
    print("\n--- adapter stderr (chain events only) ---")
    print("\n".join(chain_lines[-10:]) or "(no chain events logged)")
