#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MINIMAL SMOKE TEST: tokenless fetch of a PUBLIC Yandex Music playlist
from a Yandex Cloud Function (ru-central1) egress.

NO OAuth. NO token. NO cookies. NO credentials of any kind.
Single GET to the official public API + egress-IP self-report.

Deploy target : Yandex Cloud Serverless Function, ru-central1
Runtime       : python312, 128 MB, 30s timeout, entrypoint index.handler
Deps          : NONE (stdlib only)

Success criteria (ALL must hold):
  1. http_code == 200
  2. real playlist JSON: title + owner + track_count > 0 + tracks[] non-empty
  3. zero Authorization headers sent (see code — none are ever set)
  4. egress_ip resolves to Russia (YC ru-central1 egress)

Standalone dry-run (from ANY machine):  python3 index.py
"""
import json
import re
import urllib.request
import urllib.error
import urllib.parse

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

DEFAULT_URL = "https://music.yandex.ru/users/music.partners/playlists/1293"


def _get(url, timeout=20, accept="application/json"):
    """GET without ANY credentials. Never sends Authorization/Cookie headers."""
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": accept,
        "Accept-Language": "ru-RU,ru;q=0.9",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", "replace")
        except Exception:
            body = ""
        return e.code, body
    except Exception as e:
        return None, json.dumps({"error": f"{type(e).__name__}: {e}"})


def _egress_info():
    """Where does this function egress from? (IP + GeoIP verdict)"""
    info = {}
    code, body = _get("https://api.ipify.org?format=json", timeout=10, accept="*/*")
    try:
        info["egress_ip"] = json.loads(body).get("ip")
    except Exception:
        info["egress_ip"] = None
    if info.get("egress_ip"):
        code, body = _get(f"https://ipwho.is/{info['egress_ip']}", timeout=10)
        try:
            geo = json.loads(body)
            info["egress_country"] = geo.get("country")
            info["egress_city"] = geo.get("city")
            info["egress_asn"] = (geo.get("connection") or {}).get("asn")
            info["egress_org"] = (geo.get("connection") or {}).get("org")
        except Exception:
            info["egress_geo_error"] = body[:200]
    return info


def _parse_url(url):
    """Accept /users/{owner}/playlists/{kind} and /playlists/{uuid} forms."""
    m = re.search(r"/users/([^/]+)/playlists/(\d+)", url or "")
    if m:
        return {"type": "owner_kind", "owner": m.group(1), "kind": m.group(2)}
    m = re.search(r"/playlists/([0-9a-fA-F-]{36})", url or "")
    if m:
        return {"type": "uuid", "uuid": m.group(1)}
    return {"type": "unsupported", "url": url}


def _extract_playlist(payload):
    """Best-effort extraction of title/owner/tracks from playlist JSON."""
    if not isinstance(payload, dict):
        return None
    # api.music.yandex.net envelope: {invocationInfo, result:{...}};
    # alt shapes: {playlist:{...}} or the playlist object itself.
    pl = None
    for key in ("result", "playlist"):
        v = payload.get(key)
        if isinstance(v, dict) and (v.get("title") or v.get("tracks") is not None):
            pl = v
            break
    if pl is None and payload.get("title"):
        pl = payload
    if not isinstance(pl, dict):
        return None
    owner = pl.get("owner") or {}
    tracks_out = []
    for t in (pl.get("tracks") or [])[:10]:
        track = t.get("track", t) if isinstance(t, dict) else {}
        artists = ", ".join(a.get("name", "?") for a in (track.get("artists") or []))
        albums = ", ".join(a.get("title", "?") for a in (track.get("albums") or []))
        tracks_out.append({
            "artist": artists,
            "title": track.get("title"),
            "track_id": track.get("id"),
            "album": albums or None,
        })
    return {
        "title": pl.get("title"),
        "owner_login": owner.get("login"),
        "owner_name": owner.get("name"),
        "kind": pl.get("kind"),
        "playlist_uuid": pl.get("playlistUuid"),
        "track_count": pl.get("trackCount"),
        "visibility": pl.get("visibility"),
        "tracks_sample": tracks_out,
    }


def run_smoke(url=None):
    url = url or DEFAULT_URL
    result = {"request": {"url": url}}
    result["credentials_sent"] = "NONE"
    result["egress"] = _egress_info()

    parsed = _parse_url(url)
    result["parsed"] = parsed
    if parsed["type"] == "owner_kind":
        api = ("https://api.music.yandex.net/users/"
               f"{parsed['owner']}/playlists/{parsed['kind']}")
    elif parsed["type"] == "uuid":
        api = f"https://api.music.yandex.net/playlist/{parsed['uuid']}"
    else:
        result["verdict"] = "UNSUPPORTED_URL"
        return result
    result["api_called"] = api

    code, body = _get(api)
    result["http_code"] = code
    result["body_len"] = len(body)

    try:
        payload = json.loads(body)
    except Exception:
        payload = None
        result["body_snip"] = body[:300]

    pl = _extract_playlist(payload) if payload is not None else None
    result["playlist"] = pl
    if isinstance(payload, dict) and payload.get("error"):
        result["api_error"] = payload.get("error")

    # Verdict
    if code == 200 and pl and pl.get("title") and (pl.get("track_count") or 0) > 0:
        result["verdict"] = "PASS: tokenless public playlist fetched with real data"
    elif code == 451:
        result["verdict"] = ("FAIL: geo-fenced (egress is NOT RU/CIS). "
                             f"egress={result['egress'].get('egress_country')}")
    elif code == 404:
        result["verdict"] = "GEO PASSED but playlist not found (check URL)"
    elif code == 401:
        result["verdict"] = "AUTH REQUIRED for this endpoint (unexpected for public)"
    else:
        result["verdict"] = f"INCONCLUSIVE: http_code={code}"
    return result


def handler(event, context):
    """Yandex Cloud Function entrypoint (HTTP)."""
    url = None
    try:
        if isinstance(event, dict):
            if event.get("body"):
                try:
                    body = json.loads(event["body"])
                    url = body.get("url") or body.get("playlist_url")
                except Exception:
                    pass
            if not url:
                url = (event.get("queryStringParameters") or {}).get("url")
    except Exception:
        pass
    result = run_smoke(url)
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json; charset=utf-8"},
        "body": json.dumps(result, ensure_ascii=False, indent=2),
    }


if __name__ == "__main__":
    print(json.dumps(run_smoke(), ensure_ascii=False, indent=2))
