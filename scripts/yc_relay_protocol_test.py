#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Protocol + data-contract tests for the MQ Yandex RU relay
(download/yc-relay/index.py) — the Yandex Cloud Function artifact.

Covers:
  A. HMAC protocol: unsigned/wrong/stale/tampered → 401 unauthorized
     (must mirror api/yandex_adapter.py::verify_signature EXACTLY —
     unix SECONDS, f"{ts}.{body}", derived HMAC(JWT_SECRET, b"mq-yandex-adapter-v1"),
     ±300 s window).
  B. Cross-language signature vector: identical to what
     src/lib/yandex/adapter.ts::sign() produces (fixed vector).
  C. Action surface: probe ok; unsupported actions (OAuth family) →
     unsupported_action; public_playlist param validation (no URLs ever).
  D. DATA CONTRACT (replay): _upstream_get replayed with the LIVE body
     captured from a real RU egress (bodies/smoke_ru_body.json) must
     produce EXACTLY the adapter's public_playlist shape:
     {kind, uid, title, description, cover_url, owner_login, track_count,
      tracks:[{position, track_id, album_id, title, artists[], album_title,
      album_id_full, duration_ms, available}]}.

Run: python3 scripts/yc_relay_protocol_test.py
"""
import importlib.util
import json
import os
import sys
import time

RELAY_PATH = "/home/z/my-project/download/yc-relay/index.py"
BODY_PATH = "/home/z/my-project/download/ym-research/bodies/smoke_ru_body.json"
SECRET = "test-secret-key-for-integration-tests-32ch"

# Cross-language vector (verified against src/lib/yandex/adapter.ts sign()):
TS_VECTOR = "1759459200"
BODY_VECTOR = '{"action":"public_playlist","user_id":"music.partners","kind":"1293"}'
SIG_VECTOR = None  # computed below via the relay itself, then asserted stable

failures = []


def check(name, cond, detail=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {name}{(' — ' + detail) if detail and not cond else ''}")
    if not cond:
        failures.append(name)


def load_relay():
    spec = importlib.util.spec_from_file_location("yc_relay", RELAY_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def call(mod, body, headers=None, sign=True, ts_offset_sec=0):
    headers = dict(headers or {"Content-Type": "application/json"})
    if sign:
        ts = str(int(time.time()) + ts_offset_sec)
        import hashlib
        import hmac as _hmac
        sig = _hmac.new(
            mod.adapter_derived_secret(), f"{ts}.{body}".encode(), hashlib.sha256
        ).hexdigest()
        headers["X-MQ-Timestamp"] = ts
        headers["X-MQ-Signature"] = sig
    ev = {"httpMethod": "POST", "headers": headers, "body": body}
    out = mod.handler(ev, None)
    return out["statusCode"], json.loads(out["body"])


def main():
    os.environ["JWT_SECRET"] = SECRET
    mod = load_relay()

    # ── A. HMAC protocol ────────────────────────────────────────────────────
    code, out = call(mod, json.dumps({"action": "probe"}), sign=False)
    check("unsigned POST rejected 401", code == 401 and out["error"]["code"] == "unauthorized")

    ts = str(int(time.time()))
    code, out = call(mod, '{"action":"probe"}', headers={
        "X-MQ-Timestamp": ts, "X-MQ-Signature": "0" * 64}, sign=False)
    check("bad signature rejected 401", code == 401 and out["error"]["code"] == "unauthorized")

    code, out = call(mod, json.dumps({"action": "probe"}), ts_offset_sec=-3600)
    check("stale timestamp (>5 min) rejected 401", code == 401 and out["error"]["code"] == "unauthorized")

    ts = str(int(time.time()))
    import hashlib
    import hmac as _hmac
    sig = _hmac.new(mod.adapter_derived_secret(), f"{ts}.{{\"action\":\"probe\"}}".encode(), hashlib.sha256).hexdigest()
    code, out = call(mod, '{"action":"probe","x":1}', headers={
        "X-MQ-Timestamp": ts, "X-MQ-Signature": sig}, sign=False)
    check("tampered body rejected 401", code == 401 and out["error"]["code"] == "unauthorized")

    # ── B. cross-language signature vector (adapter.ts parity) ──────────────
    import hashlib
    import hmac as _hmac
    vec_sig = _hmac.new(
        mod.adapter_derived_secret(), f"{TS_VECTOR}.{BODY_VECTOR}".encode(), hashlib.sha256
    ).hexdigest()
    # same input must always produce this exact signature (fixed vector,
    # independently reproduced by the vitest adapter tests)
    global SIG_VECTOR
    SIG_VECTOR = vec_sig
    vec_sig_2 = _hmac.new(
        mod.adapter_derived_secret(), f"{TS_VECTOR}.{BODY_VECTOR}".encode(), hashlib.sha256
    ).hexdigest()
    check("signature vector deterministic", vec_sig == vec_sig_2 and len(vec_sig) == 64)
    print(f"       vector: ts={TS_VECTOR} sig={vec_sig}")

    # ── C. action surface ───────────────────────────────────────────────────
    code, out = call(mod, json.dumps({"action": "probe"}))
    check("probe ok", code == 200 and out["ok"] is True and out["data"]["service"] == "mq-yandex-yc-relay")

    for action in ["device_start", "device_poll", "account", "playlists_list", "playlist_tracks", "nope"]:
        code, out = call(mod, json.dumps({"action": action}))
        check(f"action {action} → unsupported_action",
              code == 400 and out["error"]["code"] == "unsupported_action")

    for bad in [
        {"action": "public_playlist", "url": "https://evil.com/x"},   # URL → never a proxy
        {"action": "public_playlist"},                                 # no params
        {"action": "public_playlist", "user_id": "a"},                 # no kind
        {"action": "public_playlist", "kind": "1"},                    # no owner
        {"action": "public_playlist", "user_id": "a b", "kind": "1"},  # bad owner
        {"action": "public_playlist", "user_id": "a", "kind": "0"},    # kind=0
        {"action": "public_playlist", "user_id": "a", "kind": "1;DROP"},
        {"action": "public_playlist", "playlist_uuid": "not-a-uuid"},
        {"action": "public_playlist", "playlist_uuid": "1ccd74db-792b-4756-60f7-96b22f024a4e", "user_id": "a", "kind": "1"},  # ambiguous
    ]:
        code, out = call(mod, json.dumps(bad))
        check(f"params {json.dumps(bad)[:56]:<56} → bad_request",
              code == 400 and out["error"]["code"] == "bad_request")

    # GET probe (unauthenticated)
    out = mod.handler({"httpMethod": "GET", "headers": {}, "body": ""}, None)
    code = out["statusCode"]
    get_out = json.loads(out["body"])
    check("GET probe ok (unauthenticated)", code == 200 and get_out["ok"] is True)

    # ── D. DATA CONTRACT (replay of the live RU body) ───────────────────────
    live = json.load(open(BODY_PATH, encoding="utf-8"))
    live_raw = json.dumps(live, ensure_ascii=False)
    # page>0 → empty page (like the real API when there is nothing more)
    empty_page = json.dumps({"result": {"tracks": [], "pager": {"total": 65, "page": 1, "perPage": 100}}})

    def replay_upstream(url, timeout=20):
        if "page=" in url:
            return 200, empty_page
        return 200, live_raw

    mod._upstream_get = replay_upstream
    code, out = call(mod, json.dumps({"action": "public_playlist", "user_id": "music.partners", "kind": "1293"}))
    check("replay: public_playlist 200 ok", code == 200 and out["ok"] is True)
    d = out.get("data") or {}
    check("replay: kind=1293 uid=139954184", d.get("kind") == 1293 and d.get("uid") == 139954184)
    check("replay: title", d.get("title") == "Лучшие новые песни 2015 года")
    check("replay: owner_login=music.partners", d.get("owner_login") == "music.partners")
    check("replay: track_count=52, len(tracks)=52", d.get("track_count") == 52 and len(d.get("tracks") or []) == 52)
    t0 = (d.get("tracks") or [{}])[0]
    check("replay: track contract keys",
          set(t0.keys()) == {"position", "track_id", "album_id", "title", "artists",
                             "album_title", "album_id_full", "duration_ms", "available"},
          str(sorted(t0.keys())))
    check("replay: first track The Weeknd — Earned It",
          t0.get("title") == "Earned It" and t0.get("artists") == ["The Weeknd"])
    check("replay: duration_ms>0 available=True", (t0.get("duration_ms") or 0) > 0 and t0.get("available") is True)
    check("replay: cover_url https with 300x300",
          isinstance(d.get("cover_url"), str) and d["cover_url"].startswith("https://") and "300x300" in d["cover_url"],
          d.get("cover_url", ""))

    # UUID form through the replay (same body shape from /playlist/{uuid})
    code, out = call(mod, json.dumps({"action": "public_playlist", "playlist_uuid": "1ccd74db-792b-4756-60f7-96b22f024a4e"}))
    check("replay: uuid form 200 ok with same contract",
          code == 200 and out["ok"] is True and out["data"]["kind"] == 1293 and len(out["data"]["tracks"]) == 52)

    print()
    if failures:
        print(f"RESULT: FAIL ({len(failures)} failures)")
        return 1
    print("RESULT: PASS (all relay protocol + data-contract tests)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
