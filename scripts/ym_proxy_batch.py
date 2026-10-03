#!/usr/bin/env python3
"""Parallel test of candidate RU proxies against the Yandex public playlist endpoint.
Tokenless by construction. Verdict per proxy: 200+tracks = OK.
Usage: ym_proxy_batch.py file_with_proxies.txt [max_workers]
"""
import concurrent.futures as cf
import json
import sys
import time
import urllib.request

URL = "https://api.music.yandex.net/users/music.partners/playlists/1293"
TIMEOUT = 15


def check(proxy: str) -> dict:
    out = {"proxy": proxy, "http_code": None, "err": None, "ms": None, "tracks": None, "title": None}
    t0 = time.time()
    try:
        handler = urllib.request.ProxyHandler({"http": f"http://{proxy}", "https": f"http://{proxy}"})
        opener = urllib.request.build_opener(handler)
        req = urllib.request.Request(URL, headers={"User-Agent": "Yandex-Music-API", "Accept": "application/json"})
        with opener.open(req, timeout=TIMEOUT) as r:
            body = r.read()
            out["http_code"] = r.status
            try:
                res = (json.loads(body).get("result") or {})
                out["title"] = res.get("title")
                out["tracks"] = len(res.get("tracks") or [])
            except Exception:
                out["err"] = "non-json"
    except urllib.error.HTTPError as e:
        out["http_code"] = e.code
    except Exception as e:
        out["err"] = f"{type(e).__name__}"[:40]
    out["ms"] = int((time.time() - t0) * 1000)
    return out


def main():
    path = sys.argv[1]
    workers = int(sys.argv[2]) if len(sys.argv) > 2 else 24
    proxies = [ln.strip() for ln in open(path) if ln.strip()]
    print(f"testing {len(proxies)} proxies -> {URL}")
    results = []
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        for r in ex.map(check, proxies):
            verdict = "OK" if (r["http_code"] == 200 and (r["tracks"] or 0) > 0) else "fail"
            results.append(r)
            print(f"{r['proxy']:28} code={str(r['http_code']):>4} {r['ms'] or 0:>6}ms "
                  f"tracks={r['tracks']} {r['err'] or ''} -> {verdict}", flush=True)
    ok = [r for r in results if r["http_code"] == 200 and (r["tracks"] or 0) > 0]
    ok.sort(key=lambda r: r["ms"] or 10**9)
    print(f"\n=== WORKING ({len(ok)}), by latency ===")
    for r in ok:
        print(f"{r['proxy']:28} {r['ms']}ms tracks={r['tracks']} title={r['title']!r}")


if __name__ == "__main__":
    main()
