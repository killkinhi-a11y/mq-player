#!/usr/bin/env python3
"""Deep verification of shortlisted proxies: full playlist identity + egress IP geo.
Tokenless. Prints playlist title/owner/kind/trackCount/tracks_len + egress ip/country.
Usage: ym_proxy_verify.py proxy [proxy ...]
"""
import json
import sys
import time
import urllib.request

PL_URL = "https://api.music.yandex.net/users/music.partners/playlists/1293"
IP_URL = "http://ip-api.com/json/?fields=status,country,countryCode,city,isp,query"
TIMEOUT = 15


def fetch(opener, url):
    req = urllib.request.Request(url, headers={"User-Agent": "Yandex-Music-API", "Accept": "application/json"})
    t0 = time.time()
    with opener.open(req, timeout=TIMEOUT) as r:
        body = r.read()
        return r.status, body, int((time.time() - t0) * 1000)


def verify(entry: str):
    scheme, addr = (entry.split("://", 1) + [""])[:2] if "://" in entry else ("http", entry)
    if scheme not in ("http", "socks5"):
        scheme, addr = "http", entry if "://" not in entry else entry.split("://", 1)[1]
    url = f"{scheme}://{addr}"
    print(f"\n=== {url} ===")
    try:
        if scheme == "http":
            opener = urllib.request.build_opener(
                urllib.request.ProxyHandler({"http": url, "https": url}))
        else:
            from ym_proxy_canary import SocksHandler
            opener = urllib.request.build_opener(SocksHandler(url))
        # 1) egress geo
        try:
            st, body, ms = fetch(opener, IP_URL)
            g = json.loads(body)
            print(f"  egress: {g.get('query')} {g.get('countryCode')} {g.get('city')} isp={g.get('isp')} ({ms}ms)")
        except Exception as e:
            print(f"  egress check failed: {type(e).__name__}")
        # 2) playlist identity
        st, body, ms = fetch(opener, PL_URL)
        data = json.loads(body)
        res = data.get("result") or {}
        pl = res.get("playlist") or res
        # the endpoint returns the playlist object possibly wrapped
        title = pl.get("title")
        owner = (pl.get("owner") or {})
        tracks = pl.get("tracks") or []
        print(f"  playlist: HTTP {st} ({ms}ms, {len(body)}B) title={title!r} "
              f"owner={owner.get('login')} uid={owner.get('uid')} kind={pl.get('kind')} "
              f"trackCount={pl.get('trackCount')} tracks_len={len(tracks)} visibility={pl.get('visibility')}")
        return st == 200 and title and owner.get("login") == "music.partners"
    except Exception as e:
        print(f"  FAIL: {type(e).__name__}: {e}"[:160])
        return False


if __name__ == "__main__":
    good = [p for p in sys.argv[1:] if verify(p)]
    print(f"\nVERIFIED GOOD: {good}")
