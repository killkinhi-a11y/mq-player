#!/usr/bin/env python3
"""Test candidate RU proxies: CONNECT tunnel -> api.music.yandex.net public playlist.

Tokenless by construction (no Authorization/Cookie ever set).
Usage: proxy_check.py [proxy ...]   (default: built-in candidate list)
Prints: proxy | http_code | verdict (never prints credentials - there are none).
"""
import json
import socket
import ssl
import sys
import time
import urllib.request

URL = "https://api.music.yandex.net/users/music.partners/playlists/1293"
TIMEOUT = 20

CANDIDATES = [
    "62.182.159.194:3128",
    "62.182.159.194:50100",
    "62.33.207.202:3128",
    "5.167.51.30:53281",
    "85.143.220.61:3128",
    "94.180.42.51:3128",
    "46.161.203.26:3128",
]


def check(proxy: str) -> dict:
    out = {"proxy": proxy, "http_code": None, "err": None, "ms": None, "tracks": None, "title": None}
    t0 = time.time()
    try:
        handler = urllib.request.ProxyHandler(
            {"http": f"http://{proxy}", "https": f"http://{proxy}"}
        )
        opener = urllib.request.build_opener(handler)
        req = urllib.request.Request(
            URL,
            headers={  # tokenless GET; UA like the adapter's default
                "User-Agent": "Yandex-Music-API",
                "Accept": "application/json",
            },
        )
        with opener.open(req, timeout=TIMEOUT) as r:
            body = r.read()
            out["http_code"] = r.status
            try:
                data = json.loads(body)
                res = (data.get("result") or {})
                out["title"] = res.get("title")
                out["tracks"] = len(res.get("tracks") or [])
            except Exception:
                out["err"] = "non-json body"
    except urllib.error.HTTPError as e:
        out["http_code"] = e.code
    except Exception as e:
        out["err"] = f"{type(e).__name__}: {e}"[:120]
    out["ms"] = int((time.time() - t0) * 1000)
    return out


def main():
    proxies = sys.argv[1:] or CANDIDATES
    print(f"target: {URL}")
    print(f"credentials: NONE (tokenless GET, no Authorization/Cookie)")
    ok = []
    for p in proxies:
        r = check(p)
        verdict = "OK" if (r["http_code"] == 200 and r["tracks"]) else "FAIL"
        if verdict == "OK":
            ok.append(p)
        print(f"{r['proxy']:26} code={str(r['http_code']):>4} {r['ms']:>6}ms "
              f"tracks={r['tracks']} title={r['title']!r} err={r['err']} -> {verdict}")
    print(f"\nWORKING: {ok}")


if __name__ == "__main__":
    main()
