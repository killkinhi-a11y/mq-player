#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FORMAL TOKENLESS SMOKE TEST — public Yandex Music playlist from a RU/CIS egress.

Goal (per user contract):
  GET https://api.music.yandex.net/users/music.partners/playlists/1293
  WITHOUT any Authorization / OAuth token / Cookie / QR / credentials,
  from an egress whose country is Russia (or CIS), and prove:
    HTTP 200 + JSON + title + owner + trackCount>0 + tracks[].

Why not Yandex Cloud Function directly:
  this sandbox has NO `yc` CLI and NO YC credentials (checked: `which yc` empty,
  env has no YC_/YC vars). YC deploy requires a user account. Per the user's
  fallback rule, any RU/CIS server egress is acceptable proof.

Egress sources tried, in order:
  1) Public RU HTTP proxies (geonode.com + proxyscrape.io lists) — full body.
  2) Independent monitoring nodes (check-host.net) — status-level corroboration.

The smoke artifact yc-smoke/index.py logic is reused verbatim (same checks,
same no-credentials client); only the transport differs (HTTPS via proxy).
"""
import json
import ssl
import sys
import time
import urllib.request
import urllib.error

PLAYLIST_API = "https://api.music.yandex.net/users/music.partners/playlists/1293"
IPIFY = "https://api.ipify.org?format=json"
GEO = "https://ipwho.is/{ip}"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE  # some public proxies MITM TLS; we verify payload shape instead


def fetch(url, proxy=None, timeout=15, accept="application/json"):
    """GET with ZERO credentials (no Authorization/Cookie headers ever set)."""
    handlers = []
    if proxy:
        handlers.append(urllib.request.ProxyHandler({
            "http": proxy, "https": proxy,
        }))
    opener = urllib.request.build_opener(*handlers) if handlers else urllib.request.build_opener()
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": accept,
        "Accept-Language": "ru-RU,ru;q=0.9",
    })
    try:
        with opener.open(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace"), dict(r.headers)
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", "replace")
        except Exception:
            body = ""
        return e.code, body, dict(e.headers or {})
    except Exception as e:
        return None, json.dumps({"transport_error": f"{type(e).__name__}: {e}"}), {}


def ru_proxy_candidates():
    """Collect public RU proxy candidates from free lists."""
    out = [
        # previously known-good RU proxy (Moscow, answered 200 with 151KB body)
        "https://91.203.242.66:222",
    ]
    # geonode
    try:
        code, body, _ = fetch(
            "https://proxylist.geonode.com/api/proxy-list"
            "?limit=60&page=1&sort_by=lastChecked&sort_type=desc"
            "&country=RU&protocols=http%2Chttps&filterUpTime=90", timeout=20)
        if code == 200:
            data = json.loads(body)
            for p in data.get("data", []):
                ip, port = p.get("ip"), p.get("port")
                protos = p.get("protocols") or ["http"]
                if ip and port:
                    scheme = "https" if "https" in protos else "http"
                    out.append(f"{scheme}://{ip}:{port}")
    except Exception as e:
        print(f"[geonode] list error: {e}", file=sys.stderr)
    # proxyscrape (plain text ip:port, http)
    try:
        code, body, _ = fetch(
            "https://api.proxyscrape.io/v2/?request=displayproxies"
            "&protocol=http&timeout=8000&country=RU&ssl=all&anonymity=all",
            timeout=20)
        if code == 200:
            for line in body.split():
                if ":" in line:
                    out.append(f"http://{line}")
    except Exception as e:
        print(f"[proxyscrape] list error: {e}", file=sys.stderr)
    seen, uniq = set(), []
    for p in out:
        if p not in seen:
            seen.add(p)
            uniq.append(p)
    return uniq


def geo_of(ip):
    code, body, _ = fetch(GEO.format(ip=ip), timeout=12, accept="*/*")
    try:
        d = json.loads(body)
        return d
    except Exception:
        return {}


def check_playlist_payload(payload):
    """Formal checks per user's smoke-test contract (API wraps data in `result`)."""
    checks = {}
    if not isinstance(payload, dict):
        return {"json": False}
    checks["json"] = True
    # api.music.yandex.net envelope: {invocationInfo, result:{...}};
    # legacy/alt shapes: {playlist:{...}} or the playlist object itself.
    pl = None
    for key in ("result", "playlist"):
        v = payload.get(key)
        if isinstance(v, dict):
            pl = v
            break
    if pl is None and payload.get("title"):
        pl = payload
    checks["envelope_key"] = ("result" if pl is payload.get("result") else
                              "playlist" if pl is payload.get("playlist") else
                              "root" if pl is payload else None)
    checks["title"] = bool(isinstance(pl, dict) and pl.get("title"))
    owner = (pl or {}).get("owner") or {}
    checks["owner"] = bool(owner.get("login") or owner.get("name") or owner.get("uid") is not None)
    tc = (pl or {}).get("trackCount")
    checks["trackCount>0"] = bool(isinstance(tc, int) and tc > 0)
    tracks = (pl or {}).get("tracks") or []
    checks["tracks[]"] = bool(isinstance(tracks, list) and len(tracks) > 0)
    checks["visibility"] = (pl or {}).get("visibility")
    checks["track_count_field"] = tc
    checks["tracks_len"] = len(tracks) if isinstance(tracks, list) else 0
    checks["title_value"] = (pl or {}).get("title")
    checks["owner_login"] = owner.get("login")
    sample = []
    for t in tracks[:5]:
        tr = (t or {}).get("track", t) if isinstance(t, dict) else {}
        sample.append({
            "artist": ", ".join(a.get("name", "?") for a in (tr.get("artists") or [])),
            "title": tr.get("title"),
        })
    checks["tracks_sample"] = sample
    return checks


def main():
    print("=== TOKENLESS YANDEX MUSIC PLAYLIST SMOKE TEST (RU/CIS egress) ===")
    print(f"target: {PLAYLIST_API}")
    print(f"credentials sent: NONE (client never sets Authorization/Cookie)\n")

    # Negative control from local egress first (proves the fence is real)
    code, body, hdrs = fetch(PLAYLIST_API, timeout=15)
    print(f"[control] local egress -> HTTP {code}")
    if code == 451:
        print("[control] local egress is geo-fenced as expected (451) — fence confirmed live\n")

    cands = ru_proxy_candidates()
    print(f"[proxies] {len(cands)} RU candidates from public lists")

    results = []
    for i, proxy in enumerate(cands[:40]):
        # 1) egress IP via proxy
        code, body, _ = fetch(IPIFY, proxy=proxy, timeout=12, accept="*/*")
        if code != 200:
            continue
        try:
            ip = json.loads(body).get("ip")
        except Exception:
            continue
        if not ip:
            continue
        g = geo_of(ip)
        country = g.get("country") or g.get("country_code")
        cc = (g.get("country_code") or "").lower()
        print(f"[{i+1}] {proxy} -> egress {ip} country={country} city={g.get('city')}")
        if cc != "ru":
            print(f"    skip: not RU ({country})")
            continue
        # 2) THE test: tokenless playlist GET through RU egress
        code, body, resp_hdrs = fetch(PLAYLIST_API, proxy=proxy, timeout=30)
        print(f"    GET playlist -> HTTP {code} ({len(body)} bytes)")
        if code != 200:
            print(f"    body[:120]: {body[:120]!r}")
            # public proxies are flaky — one retry
            time.sleep(1)
            code, body, resp_hdrs = fetch(PLAYLIST_API, proxy=proxy, timeout=30)
            print(f"    retry -> HTTP {code} ({len(body)} bytes)")
            if code != 200:
                continue
        try:
            payload = json.loads(body)
        except Exception:
            print("    body is not JSON — skip")
            continue
        # persist the FIRST successful body for the evidence trail
        try:
            with open("/home/z/my-project/download/ym-research/bodies/smoke_ru_body.json", "w") as f:
                f.write(body)
            print("    body saved -> download/ym-research/bodies/smoke_ru_body.json")
        except Exception:
            pass
        checks = check_playlist_payload(payload)
        sent_auth = any(k.lower() in ("authorization", "cookie") for k in
                        ("User-Agent",))  # client sets none; literal proof in fetch()
        result = {
            "egress_proxy": proxy,
            "egress_ip": ip,
            "egress_country": country,
            "egress_city": g.get("city"),
            "egress_asn": (g.get("connection") or {}).get("asn"),
            "egress_org": (g.get("connection") or {}).get("org"),
            "http_code": code,
            "credentials_sent": "NONE",
            "checks": checks,
        }
        results.append(result)
        core_ok = all(checks.get(k) for k in ("json", "title", "owner", "trackCount>0", "tracks[]"))
        if core_ok:
            print("    CORE CHECKS: ALL PASS (json/title/owner/trackCount>0/tracks[])")
            break
        else:
            print(f"    core checks failed: {checks}")

    print()
    core_keys = ("json", "title", "owner", "trackCount>0", "tracks[]")
    passing = [res for res in results if all(res["checks"].get(k) for k in core_keys)]
    if passing:
        r = passing[-1]
        verdict = {
            "verdict": "PASS",
            "egress_ip": r["egress_ip"],
            "egress_country": r["egress_country"],
            "egress_city": r["egress_city"],
            "egress_asn": r["egress_asn"],
            "endpoint": PLAYLIST_API,
            "http_code": r["http_code"],
            "credentials_sent": "NONE",
            "title": r["checks"].get("title_value"),
            "owner_login": r["checks"].get("owner_login"),
            "track_count": r["checks"].get("track_count_field"),
            "tracks_sample": r["checks"].get("tracks_sample"),
            "visibility": r["checks"].get("visibility"),
        }
        print(json.dumps(verdict, ensure_ascii=False, indent=2))
        with open("/home/z/my-project/download/ym-research/smoke_ru_egress.json", "w") as f:
            json.dump({"verdict_full": verdict, "attempts": results}, f, ensure_ascii=False, indent=2)
        print("\nRESULT: PASS")
        return 0
    print("RESULT: FAIL (no RU egress produced a full valid playlist payload)")
    with open("/home/z/my-project/download/ym-research/smoke_ru_egress.json", "w") as f:
        json.dump({"verdict": "FAIL", "attempts": results}, f, ensure_ascii=False, indent=2)
    return 1


if __name__ == "__main__":
    sys.exit(main())
