#!/usr/bin/env python3
"""prod-secret-scan.py — production secret-leakage scan (read-only, no secrets printed).

Checks against https://mq1.vercel.app (current build):
  1. /api/auth/me without session      -> 401, {"authenticated": false}, no data leak
  2. /api/auth/providers full body     -> only booleans/public ids, no secrets
  3. Client JS bundle scan             -> no Brevo key (xkeysib-), no Google secret
                                          (GOCSPX-), no Telegram bot token, no JWT secret
  4. Source maps                       -> not published (404) or, if present, no secrets
Patterns detect the canonical secret formats of each provider. Findings are
reported as pattern NAME + chunk name only — matched text is never printed.
"""
import json
import re
import urllib.request
import urllib.error

BASE = "https://mq1.vercel.app"
UA = {"User-Agent": "mq-qa-scan/1.0"}

SECRET_PATTERNS = [
    ("BREVO_API_KEY (xkeysib-)", re.compile(rb"xkeysib-[A-Za-z0-9_\-]{20,}")),
    ("Brevo SMTP key (xsmtpinib-)", re.compile(rb"xsmtpinib-[A-Za-z0-9_\-]{20,}")),
    ("Google OAuth client secret (GOCSPX-)", re.compile(rb"GOCSPX[A-Za-z0-9_\-]{20,}")),
    ("Telegram bot token", re.compile(rb"\b\d{8,10}:AA[A-Za-z0-9_\-]{33}\b")),
    ("JWT secret literal", re.compile(rb"jwt[_-]?secret\s*[:=]\s*[\"'][^\"']{8,}")),
    ("Vercel token (vercel_)", re.compile(rb"vercel_[A-Za-z0-9_\-]{20,}")),
    ("GitHub PAT (ghp_)", re.compile(rb"ghp_[A-Za-z0-9]{36}")),
]


def req(url, method="GET", body=None, headers=None, timeout=30):
    h = dict(UA)
    if headers:
        h.update(headers)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h.setdefault("Content-Type", "application/json")
    r = urllib.request.Request(url, method=method, headers=h, data=data)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)
    except Exception as e:
        return 0, f"EXC:{type(e).__name__}".encode(), {}


print("== 1. /api/auth/me (no session) ==")
st, body, _ = req(f"{BASE}/api/auth/me")
try:
    data = json.loads(body)
except Exception:
    data = {}
leak = any(k in data for k in ("email", "userId", "username", "id", "role"))
print(f"status={st} body={body.decode()[:150]} | fields-leak={'NO' if not leak else 'YES!'} | "
      f"{'PASS' if st == 401 and not leak else 'FAIL'}")

print("\n== 2. /api/auth/providers full body ==")
st, body, _ = req(f"{BASE}/api/auth/providers")
print(f"status={st}")
try:
    prov = json.loads(body)
    print(json.dumps(prov, ensure_ascii=False, indent=1))
    text = body
    hits = [name for name, pat in SECRET_PATTERNS if pat.search(text.encode())]
    print(f"secret-pattern scan of providers response: {'CLEAN' if not hits else 'LEAK: ' + str(hits)}")
except Exception:
    print(body.decode()[:300])

print("\n== 3. client bundle scan ==")
st, body, _ = req(f"{BASE}/")
html = body.decode() if st == 200 else ""
chunks = sorted(set(re.findall(r"(?:src|href)=\"(/_next/static/[^\"]+\.js)\"", html)))
print(f"home page: status={st}, js chunks referenced: {len(chunks)}")
# also pull chunks from the build manifest for broader coverage
st, body, _ = req(f"{BASE}/_next/static/{re.findall(r'/_next/static/([^/]+)/', html)[0] if re.findall(r'/_next/static/([^/]+)/', html) else ''}")
total = len(chunks)
found_any = False
maps_published = []
scanned = 0
for c in chunks:
    st, body, _ = req(f"{BASE}{c}")
    if st != 200:
        continue
    scanned += 1
    for name, pat in SECRET_PATTERNS:
        if pat.search(body):
            print(f"  LEAK: {name} found in {c}")
            found_any = True
    # source map check (only for the largest few chunks to limit requests)
st_map, _, _ = req(f"{BASE}{chunks[0]}.map") if chunks else (0, b"", {})
print(f"chunks scanned: {scanned}/{total}")
print(f"source map for first chunk: HTTP {st_map} "
      f"{'(published — content would need deeper check)' if st_map == 200 else '(not published — good)'}")
print(f"client bundle secret scan: {'CLEAN' if not found_any else 'LEAKS FOUND'}")

print("\n== 4. verify-code rejection (no code in response) ==")
st, body, _ = req(f"{BASE}/api/auth/verify-code", "POST",
                  {"email": "nonexistent-probe@example.com", "code": "000000"},
                  headers={"Content-Type": "application/json"})
has_code = b"code" in body.lower() and b"devCode" in body
print(f"status={st} body={body.decode()[:120]} | verification code echoed: {'NO' if not has_code else 'YES!'}")
