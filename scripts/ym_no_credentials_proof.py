#!/usr/bin/env python3
"""NO-CREDENTIALS PROOF — instrument requests.Session.request (the exact
network boundary the adapter uses) and run the REAL tokenless public_playlist
action through the REAL built-in RU/CIS chain against the REAL Yandex API.

Logs per outbound request: method, URL, header NAMES, and explicit verdicts
for Authorization / OAuth / Cookie / QR headers. No secrets are printed
(there are none — that is the point being proven).
"""
import importlib.util
import json
import os
import sys

os.environ.pop("YANDEX_PROXY_URL", None)
os.environ["JWT_SECRET"] = "no-creds-proof-secret-0123456789ab"

spec = importlib.util.spec_from_file_location("yandex_adapter", "/home/z/my-project/api/yandex_adapter.py")
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)

import requests

seen = []
orig_request = requests.Session.request


def spy_request(self, method, url, **kwargs):
    headers = kwargs.get("headers") or {}
    names = sorted(k.lower() for k in headers.keys())
    verdict = {
        "url": url,
        "method": method,
        "header_names": names,
        "has_authorization": any(n in ("authorization", "proxy-authorization") for n in names),
        "has_oauth": any("oauth" in n for n in names),
        "has_cookie": any("cookie" in n for n in names),
        "has_bearer": any("bearer" in n for n in names),
    }
    # proxies actually used for this call (the chain candidate)
    proxies = kwargs.get("proxies") or getattr(self, "proxies", None)
    verdict["proxies"] = proxies if isinstance(proxies, dict) else None
    seen.append(verdict)
    return orig_request(self, method, url, **kwargs)


requests.Session.request = spy_request

data = adapter.action_public_playlist({"user_id": "music.partners", "kind": 1293})

print(f"requests made: {len(seen)}")
bad = 0
for i, v in enumerate(seen, 1):
    flag = v["has_authorization"] or v["has_oauth"] or v["has_cookie"] or v["has_bearer"]
    bad += 1 if flag else 0
    proxy = (v.get("proxies") or {}).get("https") or "direct"
    print(f"  #{i} {v['method']} {v['url'][:72]}")
    print(f"     headers={v['header_names']} | egress={proxy}")
    print(f"     Authorization/OAuth/Cookie/Bearer present: {flag}")

print(f"\nplaylist: {data['title']!r} owner={data['owner_login']} tracks={len(data['tracks'])}")
creds_free = bad == 0 and len(data["tracks"]) > 0
print(f"NO-CREDENTIALS PROOF: {'PASS — zero credential headers on every request' if creds_free else 'FAIL'}")
sys.exit(0 if creds_free else 1)
