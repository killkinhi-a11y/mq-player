#!/usr/bin/env python3
"""Bulk canary-test proxies against Yandex public playlist.
200+tracks => working RU/CIS egress (Yandex fence is the geo filter).
Supports http:// and socks5:// proxies. Tokenless by construction.
Usage: ym_proxy_canary.py <file> [workers] [scheme_hint]
  scheme_hint: http|socks5|auto (auto = try http first then socks5)
"""
import concurrent.futures as cf
import json
import socket
import sys
import time
import urllib.request

URL = "https://api.music.yandex.net/users/music.partners/playlists/1293"
TIMEOUT = 12

import socks  # PySocks
import socks as _s


class SocksHandler(urllib.request.ProxyHandler):
    def __init__(self, socks_url):
        parsed = socks_url.split("://", 1) if "://" in socks_url else ["", socks_url]
        host_port = parsed[1].rsplit("@")[-1]
        host, port = host_port.rsplit(":", 1)
        self._host, self._port = host, int(port)
        super().__init__({})

    def proxy_open(self, req, proxy, type_):
        orig = socket.socket
        s = socks.socksocket(orig.AF_INET if hasattr(orig, "AF_INET") else socket.AF_INET, socket.SOCK_STREAM)
        s.set_proxy(socks.SOCKS5, self._host, self._port)
        s.settimeout(TIMEOUT)
        return s


def check(entry: str) -> dict:
    scheme, addr = (entry.split("://", 1) + [""])[:2] if "://" in entry else ("http", entry)
    if scheme not in ("http", "socks5"):
        scheme = "http"
    out = {"proxy": f"{scheme}://{addr}", "http_code": None, "err": None, "ms": None, "tracks": None}
    t0 = time.time()
    try:
        url = f"{scheme}://{addr}"
        if scheme == "http":
            handler = urllib.request.ProxyHandler({"http": url, "https": url})
        else:
            handler = SocksHandler(url)
        opener = urllib.request.build_opener(handler)
        req = urllib.request.Request(URL, headers={"User-Agent": "Yandex-Music-API", "Accept": "application/json"})
        with opener.open(req, timeout=TIMEOUT) as r:
            body = r.read()
            out["http_code"] = r.status
            if r.status == 200:
                try:
                    res = (json.loads(body).get("result") or {})
                    out["tracks"] = len(res.get("tracks") or [])
                except Exception:
                    out["err"] = "non-json"
    except urllib.error.HTTPError as e:
        out["http_code"] = e.code
    except Exception as e:
        out["err"] = f"{type(e).__name__}"[:30]
    out["ms"] = int((time.time() - t0) * 1000)
    return out


def main():
    path, workers = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 60
    proxies = [ln.strip() for ln in open(path) if ln.strip()]
    print(f"canary {len(proxies)} proxies -> 200 = RU/CIS egress works")
    results = []
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        for r in ex.map(check, proxies):
            results.append(r)
    ok = [r for r in results if r["http_code"] == 200 and (r["tracks"] or 0) > 0]
    geo = [r for r in results if r["http_code"] == 451]
    ok.sort(key=lambda r: r["ms"] or 10**9)
    print(f"total={len(results)} OK(200)={len(ok)} geo(451)={len(geo)} dead={len(results)-len(ok)-len(geo)}")
    for r in ok:
        print(f"OK   {r['proxy']:32} {r['ms']}ms tracks={r['tracks']}")


if __name__ == "__main__":
    main()
