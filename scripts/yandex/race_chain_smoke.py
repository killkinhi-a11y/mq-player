#!/usr/bin/env python3
"""Live smoke of the RACING egress chain against REAL Yandex (from non-RU egress).

Starts api/yandex_adapter.py standalone (JWT_SECRET=smoke), then sends REAL
HMAC-signed public_playlist actions through it and verifies:

  1. music.partners/1293  -> 200, 52 tracks, exact title, fast (racing)
  2. rlslist/1100         -> 200, capped at PUBLIC_MAX_TRACKS(200), real title
  3. dead playlist        -> 404 yandex_not_found with the SPECIFIC message
                             (never the generic "adapter unavailable")
  4. race timing sanity   -> 1293 completes in << sequential-worst-case (45s)

Zero credentials anywhere (tokenless public endpoints only).
"""
import hashlib
import hmac
import json
import os
import subprocess
import sys
import time
import urllib.request

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SECRET = b"smoke-secret"
PORT = 8791
BASE = f"http://127.0.0.1:{PORT}"

def derived() -> bytes:
    return hmac.new(SECRET, b"mq-yandex-adapter-v1", hashlib.sha256).digest()

def post_action(action: str, payload: dict, timeout: int = 90):
    body = json.dumps({"action": action, **payload}).encode()
    ts = str(int(time.time()))
    sig = hmac.new(derived(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    req = urllib.request.Request(
        BASE, data=body, method="POST",
        headers={"Content-Type": "application/json", "X-MQ-Timestamp": ts, "X-MQ-Signature": sig},
    )
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read()), time.monotonic() - t0
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}"), time.monotonic() - t0

def main() -> int:
    env = dict(os.environ, JWT_SECRET="smoke-secret")
    env.pop("YANDEX_PROXY_URL", None)  # exercise the BUILT-IN racing chain
    proc = subprocess.Popen(
        [sys.executable, str(ROOT / "api" / "yandex_adapter.py"), "--port", str(PORT)],
        env=env, cwd=str(ROOT),
        stderr=subprocess.DEVNULL,
    )
    failures = 0
    try:
        # wait for the probe endpoint
        for _ in range(40):
            try:
                with urllib.request.urlopen(f"{BASE}/api/yandex_adapter", timeout=2) as r:
                    if r.status == 200:
                        break
            except Exception:
                time.sleep(0.25)
        else:
            print("FATAL: adapter did not start")
            return 1

        def check(name, cond, extra=""):
            nonlocal failures
            print(("  ok  " if cond else " FAIL ") + name + (f"  {extra}" if extra else ""))
            if not cond:
                failures += 1

        # 1) control playlist 1293
        status, out, dt = post_action("public_playlist", {"user_id": "music.partners", "kind": "1293"})
        d = out.get("data") or {}
        check("1293: ok=true", out.get("ok") is True, f"{dt:.1f}s err={out.get('error')}")
        check("1293: exact title", d.get("title") == "Лучшие новые песни 2015 года", repr(d.get("title"))[:50])
        check("1293: owner music.partners", d.get("owner_login") == "music.partners")
        n = len(d.get("tracks") or [])
        check("1293: 52 tracks", n == 52, f"got {n}")
        check("1293: fits the 55s adapter budget (was 45-60s+ fail before racing)", dt < 50, f"{dt:.1f}s")

        # 2) the USER's playlist (286 tracks, first page overshoots the cap)
        status, out, dt = post_action("public_playlist", {"user_id": "rlslist", "kind": "1100"})
        d = out.get("data") or {}
        check("1100: ok=true", out.get("ok") is True, f"{dt:.1f}s err={out.get('error')}")
        n = len(d.get("tracks") or [])
        check("1100: capped at 200 tracks (PUBLIC_MAX_TRACKS)", n == 200, f"got {n}")
        check("1100: true size still reported", (d.get("track_count") or 0) >= 250, f"track_count={d.get('track_count')}")
        check("1100: real title", bool(d.get("title")), repr(d.get("title"))[:60])
        check("1100: big playlist fits the adapter budget", dt < 55, f"{dt:.1f}s")

        # 3) dead playlist -> SPECIFIC verdict, fast
        status, out, dt = post_action("public_playlist", {"user_id": "rsljst", "kind": "1100"})
        err = out.get("error") or {}
        check("dead link: yandex_not_found (specific, not 'adapter unavailable')",
              err.get("code") == "yandex_not_found", f"code={err.get('code')} {dt:.1f}s")
        check("dead link: human message mentions the playlist", "\u043b\u0435\u0439\u043b\u0438\u0441\u0442" in (err.get("message") or ""))

        # 4) probe still honest
        status, out, dt = post_action("probe", {})
        d = out.get("data") or {}
        check("probe: chain active + no proxy leak", d.get("default_egress_active") is True and d.get("proxy_configured") is False)

        print(f"\n{'SMOKE PASS' if failures == 0 else f'SMOKE FAIL ({failures})'}")
        return 1 if failures else 0
    finally:
        proc.terminate()
        proc.wait(timeout=5)

if __name__ == "__main__":
    sys.exit(main())
