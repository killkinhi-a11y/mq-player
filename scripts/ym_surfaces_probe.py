#!/usr/bin/env python3
"""
YM tokenless surfaces probe (v2) — re-verify ALL non-API surfaces for public playlist 1293
from this sandbox (non-RU egress, expects 451/404 on geo-fenced stuff).

Covers user's checklist:
 1. Old handlers/*.jsx endpoints (WITH full query params this time)
 2. New playlist URL forms (/playlists/<uuid>, /playlist/..., /p/...)
 3. iframe playlist variants
 4. oEmbed / embed API paths sweep
 5. RSC/SSR data in HTML (__NEXT_DATA__, ld+json, og:, preloaded state)
 6. Public CDN/JSON surfaces (robots, sitemap, misc /api/ paths)
 + Wayback CDX (historical evidence of tokenless API availability)

Report: /home/z/my-project/download/ym-research/surfaces_probe.json
"""
import json
import os
import re
import urllib.request
import urllib.error
import urllib.parse

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
OUT_DIR = "/home/z/my-project/download/ym-research"
REPORT = os.path.join(OUT_DIR, "surfaces_probe.json")
os.makedirs(os.path.join(OUT_DIR, "bodies"), exist_ok=True)

OWNER = "music.partners"
KIND = "1293"

def fetch(url, timeout=20, headers=None):
    h = {"User-Agent": UA, "Accept": "*/*",
         "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode("utf-8", "replace")
            return {"status": r.status, "body": body, "headers": dict(r.headers),
                    "final_url": r.geturl()}
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", "replace")
        except Exception:
            body = ""
        return {"status": e.code, "body": body, "headers": dict(e.headers),
                "final_url": url}
    except Exception as e:
        return {"status": None, "body": "", "error": f"{type(e).__name__}: {e}",
                "headers": {}, "final_url": url}

def snip(s, n=400):
    return s[:n].replace("\n", " ")

report = {"meta": {"sandbox": "non-RU egress (expect 451 on geo-fenced, 404 on dead)",
                   "target": f"https://music.yandex.ru/users/{OWNER}/playlists/{KIND}"},
          "probes": {}}

def probe(name, url, headers=None, timeout=20):
    r = fetch(url, timeout=timeout, headers=headers)
    body = r.get("body", "")
    entry = {
        "url": url,
        "status": r["status"],
        "error": r.get("error"),
        "final_url": r.get("final_url"),
        "headers": r["headers"],
        "content_type": r["headers"].get("Content-Type", r["headers"].get("content-type", "")),
        "len": len(body),
        "snip": snip(body),
        "body_kind": ("JSON" if body.lstrip()[:1] in "{[" else
                      "HTML" if re.match(r"\s*(<!doctype|<html|<head)", body, re.I) else "OTHER"),
    }
    report["probes"][name] = entry
    print(f"[{name}] {r['status']} {entry['body_kind']:5s} len={len(body)}  {url}")
    # save full bodies of interesting responses for deep analysis
    if entry["body_kind"] == "JSON" or r["status"] == 200:
        safe = re.sub(r"[^a-z0-9]+", "_", name)[:60]
        try:
            with open(os.path.join(OUT_DIR, f"bodies/{safe}.body"), "w", encoding="utf-8") as bf:
                bf.write(body)
            entry["body_file"] = f"bodies/{safe}.body"
        except Exception as ex:
            entry["body_file"] = f"save-error: {ex}"
    return r, entry

# ---------------------------------------------------------------- 5. page HTML
pl_page = f"https://music.yandex.ru/users/{OWNER}/playlists/{KIND}"
r, entry = probe("page_html", pl_page)
body = r.get("body", "")
entry["ssr_markers"] = {
    "__NEXT_DATA__": "__NEXT_DATA__" in body,
    "ld_plus_json": 'application/ld+json' in body,
    "og_title": re.search(r'property="og:title" content="([^"]*)"', body).group(1) if re.search(r'property="og:title" content="([^"]*)"', body) else None,
    "window_state": bool(re.search(r'window\.__[A-Za-z_]+__', body)),
    "initState": "initState" in body,
    "PRELOADED": "PRELOAD" in body.upper(),
    "title_tag": (re.search(r"<title>([^<]*)</title>", body).group(1)
                  if re.search(r"<title>([^<]*)</title>", body) else None),
    "track_names_inline": bool(re.search(r'"title"\s*:\s*"[^"]{2,60}"', body)),
    "has_root_div_only": ('class="app"' in body or 'id="root"' in body or 'id="app"' in body),
}
# extract ld+json blocks if any
lds = re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', body, re.S)
entry["ld_json"] = [l.strip()[:2000] for l in lds]
# meta description
m = re.search(r'<meta name="description" content="([^"]*)"', body)
entry["meta_description"] = m.group(1) if m else None

# ------------------------------------------------------------- 3. iframe set
iframe_urls = [
    f"https://music.yandex.ru/iframe/playlist/{OWNER}/{KIND}",
    f"https://music.yandex.ru/iframe/playlist?owner={OWNER}&kind={KIND}",
    "https://music.yandex.ru/iframe/",
    f"https://music.yandex.ru/iframe/#{OWNER}/{KIND}",
]
iframe_hits = {}
for i, u in enumerate(iframe_urls):
    r, entry = probe(f"iframe_{i}", u)
    body = r.get("body", "")
    if r["status"] == 200 and body:
        scripts = re.findall(r'<script[^>]+src="([^"]+)"', body)
        inline = re.findall(r'<script(?![^>]*src)[^>]*>(.*?)</script>', body, re.S)
        entry["script_srcs"] = scripts
        entry["inline_scripts_n"] = len(inline)
        entry["inline_state_snips"] = [snip(s, 500) for s in inline if len(s) > 50][:6]
        entry["has_track_data_inline"] = bool(re.search(r'"title"\s*:\s*"[^"]{2,60}"', body))
        iframe_hits[u] = entry

# --------------------------------------------------------- 1. old handlers
handler_urls = {
    "handler_playlist_full_params":
        f"https://music.yandex.ru/handlers/playlist.jsx?owner={OWNER}&kinds={KIND}"
        f"&lang=ru&external-domain=music.yandex.ru&overembed=false",
    "handler_playlist_list":
        f"https://music.yandex.ru/handlers/playlist-list.jsx?owners={OWNER}&lang=ru"
        f"&external-domain=music.yandex.ru&overembed=false",
    "handler_playlists":
        f"https://music.yandex.ru/handlers/playlists.jsx?owner={OWNER}&lang=ru"
        f"&external-domain=music.yandex.ru",
    "handler_feed": "https://music.yandex.ru/handlers/feed.jsx?lang=ru&external-domain=music.yandex.ru",
    "handler_oembed": f"https://music.yandex.ru/handlers/oembed.jsx?url={urllib.parse.quote(pl_page, safe='')}",
}
for name, u in handler_urls.items():
    probe(name, u)

# ------------------------------------------------------- 2. new URL forms
url_forms = [
    f"https://music.yandex.ru/playlists/{KIND}",
    f"https://music.yandex.ru/playlist/{OWNER}/{KIND}",
    f"https://music.yandex.ru/playlists/{OWNER}/{KIND}",
    f"https://music.yandex.ru/p/{KIND}",
    f"https://music.yandex.ru/pl/{KIND}",
]
for i, u in enumerate(url_forms):
    r, entry = probe(f"urlform_{i}", u)
    loc = entry["headers"].get("Location") or entry["headers"].get("location")
    if loc:
        entry["redirect_location"] = loc

# --------------------------------------------------------- 4. oEmbed sweep
oembed_paths = [
    f"https://music.yandex.ru/oembed?url={urllib.parse.quote(pl_page, safe='')}",
    f"https://music.yandex.ru/api/oembed?url={urllib.parse.quote(pl_page, safe='')}",
    f"https://music.yandex.ru/embed/oembed?url={urllib.parse.quote(pl_page, safe='')}",
    f"https://music.yandex.ru/services/oembed?url={urllib.parse.quote(pl_page, safe='')}",
    f"https://music.yandex.com/oembed?url={urllib.parse.quote(pl_page, safe='')}",
]
for i, u in enumerate(oembed_paths):
    probe(f"oembed_{i}", u)

# ------------------------------------- 6. misc public CDN/JSON + robots/sitemap
misc_urls = {
    "robots": "https://music.yandex.ru/robots.txt",
    "sitemap": "https://music.yandex.ru/sitemap.xml",
    "api_v1_playlist": f"https://music.yandex.ru/api/v1/playlist/{OWNER}/{KIND}",
    "api_v2_playlist": f"https://music.yandex.ru/api/v2/playlist/{OWNER}/{KIND}",
    "api_playlist_json": f"https://music.yandex.ru/api/playlist/{OWNER}/{KIND}",
    "user_page": f"https://music.yandex.ru/users/{OWNER}",
}
for name, u in misc_urls.items():
    r, entry = probe(name, u)
    if name == "robots" and r["status"] == 200:
        entry["interesting_lines"] = [l for l in r["body"].splitlines()
                                      if re.search(r'handler|playlist|iframe|api|Allow|Disallow', l, re.I)][:40]

# ----------------------------------------------- API re-verification (fence)
api_urls = {
    "api_playlist": f"https://api.music.yandex.net/users/{OWNER}/playlists/{KIND}",
    "api_playlist_embed_params":
        f"https://api.music.yandex.net/users/{OWNER}/playlists/{KIND}"
        f"?lang=ru&external-domain=music.yandex.ru&overembed=false",
    "api_playlist_list": f"https://api.music.yandex.net/users/{OWNER}/playlists",
    "api_genres_control": "https://api.music.yandex.net/genres",
    "api_landing_control": "https://api.music.yandex.net/landing",
}
for name, u in api_urls.items():
    r, entry = probe(name, u, headers={"Accept": "application/json"})

# --------------------------------------------------------------- Wayback CDX
def cdx(query, name):
    url = "http://web.archive.org/cdx/search/cdx?" + query
    r, entry = probe(name, url, timeout=40)
    if r["status"] == 200 and r.get("body"):
        entry["snapshot_lines"] = r["body"].splitlines()[:30]

cdx(f"url=api.music.yandex.net/users/{OWNER}/playlists/{KIND}&output=text", "cdx_api_playlist")
cdx(f"url=music.yandex.ru/users/{OWNER}/playlists/{KIND}&output=text&limit=25", "cdx_page")
cdx("url=api.music.yandex.net/users/music.partners*&output=text&limit=25", "cdx_api_owner_any")
cdx("url=api.music.yandex.net/users/*&output=text&limit=40&filter=statuscode:200", "cdx_api_any200")

os.makedirs(OUT_DIR, exist_ok=True)
with open(REPORT, "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

print("\n=== SUMMARY ===")
for k, v in report["probes"].items():
    print(f"{v['status']}\t{k}\t{v['url'][:110]}")
print(f"\nreport: {REPORT}")
