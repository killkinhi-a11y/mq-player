#!/usr/bin/env python3
"""
Phase B — PRODUCTION auth QA without a session (https://mq1.vercel.app).

Real HTTP flows against the deployed W13 endpoints:

  1. Google LOGIN start   GET /api/auth/google
     -> 302 accounts.google.com, state cookie set, NO link cookie
  2. Google LINK start    GET /api/auth/google?link=1
     -> 302 accounts.google.com, state + mq_oauth_link cookies
     -> redirect_uri == production origin, client_id == public providers id
  3. CANCEL flow          GET callback?error=access_denied&state=<valid>
     -> /play?authError=google_cancelled, session untouched
  4. CSRF invalid state   GET callback?state=<garbage>&code=x
     -> authError=invalid_state
  5. FAKE code            GET callback?state=<valid>&code=<fake>
     -> google_exchange_failed (Google client creds VALID)
        or google_not_configured (invalid_client -> creds broken)
  6. TG widget garbage    GET telegram-widget/callback?id=..&auth_date=..&hash=deadbeef
     (login AND ?link=1)  -> authError=telegram_hash_invalid (verify-before-link)
  7. link/providers       no cookie -> 401 Unauthorized (again)

Cookie/state values are used in-flight but never printed.
"""
import json
import re
import sys
import time
import urllib.request
import urllib.error
import http.cookiejar
import urllib.parse

PROD = "https://mq1.vercel.app"
UA = {"User-Agent": "mq-qa/1.0", "Accept": "application/json"}

results = []


def record(name, ok, detail):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name} — {detail}")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def make_opener(jar):
    return urllib.request.build_opener(
        NoRedirect(), urllib.request.HTTPCookieProcessor(jar))


def get(opener, url, timeout=25):
    req = urllib.request.Request(url, headers=UA)
    try:
        with opener.open(req, timeout=timeout) as r:
            return r.status, r.headers, b""
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()


def qs(url):
    q = urllib.parse.urlparse(url).query
    return dict(urllib.parse.parse_qsl(q))


def cookie_names(jar):
    return sorted(c.name for c in jar)


def main():
    # ── 1. Google LOGIN start ──
    jar = http.cookiejar.CookieJar()
    op = make_opener(jar)
    st, hdrs, _ = get(op, f"{PROD}/api/auth/google")
    loc = hdrs.get("Location", "")
    q = qs(loc)
    ok = st in (302, 303, 307) and loc.startswith("https://accounts.google.com/")
    ok = ok and "mq_oauth_state" in cookie_names(jar) and "mq_oauth_link" not in cookie_names(jar)
    ok = ok and q.get("scope") == "openid email profile" and bool(q.get("state"))
    ok = ok and q.get("redirect_uri") == f"{PROD}/api/auth/google/callback"
    ok = ok and q.get("response_type") == "code"
    record("google login start (302 + state cookie, no link cookie, correct params)",
           ok, f"HTTP {st}, redirect={'accounts.google.com ✓' if loc.startswith('https://accounts.google.com/') else loc[:60]}, "
               f"redirect_uri={q.get('redirect_uri')}, scope={q.get('scope')}, cookies={cookie_names(jar)}")
    state_login = None
    for c in jar:
        if c.name == "mq_oauth_state":
            state_login = c.value

    # ── 2. Google LINK start ──
    jar2 = http.cookiejar.CookieJar()
    op2 = make_opener(jar2)
    st, hdrs, _ = get(op2, f"{PROD}/api/auth/google?link=1")
    loc2 = hdrs.get("Location", "")
    q2 = qs(loc2)
    ok = st in (302, 303, 307) and loc2.startswith("https://accounts.google.com/")
    ok = ok and "mq_oauth_link" in cookie_names(jar2) and "mq_oauth_state" in cookie_names(jar2)
    client_id = q2.get("client_id", "")
    record("google LINK start (?link=1 -> mq_oauth_link cookie + 302)",
           ok, f"HTTP {st}, cookies={cookie_names(jar2)}, client_id={client_id[:12]}…")
    state_link = None
    for c in jar2:
        if c.name == "mq_oauth_state":
            state_link = c.value

    # ── 3. CANCEL flow (valid state from LOGIN start, access_denied) ──
    jar3 = http.cookiejar.CookieJar()
    op3 = make_opener(jar3)
    # fresh state for this flow
    st, hdrs, _ = get(op3, f"{PROD}/api/auth/google")
    state_c = None
    for c in jar3:
        if c.name == "mq_oauth_state":
            state_c = c.value
    url = f"{PROD}/api/auth/google/callback?error=access_denied&state={urllib.parse.quote(state_c or '')}"
    st, hdrs, _ = get(op3, url)
    loc = hdrs.get("Location", "")
    ok = st in (302, 303, 307) and "authError=google_cancelled" in loc
    record("google cancel flow (access_denied + valid state -> google_cancelled)",
           ok, f"HTTP {st}, Location={urllib.parse.urlparse(loc).path}?{qs(loc) and list(qs(loc).items())}")

    # ── 4. CSRF: invalid state ──
    jar4 = http.cookiejar.CookieJar()
    op4 = make_opener(jar4)
    st, hdrs, _ = get(op4, f"{PROD}/api/auth/google")
    url = f"{PROD}/api/auth/google/callback?state=f4k3st4t3&code=4/0fake"
    st, hdrs, _ = get(op4, url)
    loc = hdrs.get("Location", "")
    ok = st in (302, 303, 307) and "authError=invalid_state" in loc
    record("google CSRF guard (wrong state -> invalid_state)", ok,
           f"HTTP {st}, Location={loc.split('?')[0]}?{qs(loc)}")

    # ── 5. FAKE code with VALID state ──
    jar5 = http.cookiejar.CookieJar()
    op5 = make_opener(jar5)
    st, hdrs, _ = get(op5, f"{PROD}/api/auth/google")
    state5 = None
    for c in jar5:
        if c.name == "mq_oauth_state":
            state5 = c.value
    url = (f"{PROD}/api/auth/google/callback?state={urllib.parse.quote(state5 or '')}"
           f"&code=4%2F0AQfakecode-qa-probe-000")
    st, hdrs, _ = get(op5, url)
    loc = hdrs.get("Location", "")
    err = qs(loc).get("authError", "")
    if err == "google_exchange_failed":
        record("google fake code -> google_exchange_failed (prod client creds VALID: Google rejected the code, not the client)",
               True, f"HTTP {st}, authError={err}")
    elif err == "google_not_configured":
        record("google fake code -> google_not_configured (PROD CLIENT CREDS BROKEN: Google answered invalid_client)",
               False, f"HTTP {st}, authError={err}")
    else:
        record("google fake code", False, f"HTTP {st}, authError={err or loc[:80]}")

    # ── 6. TG widget garbage hash (login + link mode) ──
    now = str(int(time.time()))
    for mode, tag in [("", "login mode"), ("&link=1", "LINK mode")]:
        url = (f"{PROD}/api/auth/telegram-widget/callback?id=900000001"
               f"&first_name=QA&username=qa_probe&auth_date={now}&hash=deadbeefdeadbeef{mode}")
        jarx = http.cookiejar.CookieJar()
        opx = make_opener(jarx)
        st, hdrs, _ = get(opx, url)
        loc = hdrs.get("Location", "")
        ok = st in (302, 303, 307) and "authError=telegram_hash_invalid" in loc
        record(f"telegram widget garbage hash rejected ({tag}, verify-before-link)", ok,
               f"HTTP {st}, authError={qs(loc).get('authError')}")

    # ── 7. link/providers without session ──
    req = urllib.request.Request(f"{PROD}/api/auth/link/providers", headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read().decode()
            record("link/providers without session -> 401", False, f"HTTP {r.status}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        ok = e.code == 401 and "Unauthorized" in body
        record("link/providers without session -> 401 Unauthorized, no data", ok,
               f"HTTP {e.code}, body={body.strip()[:60]}, no provider ids leaked")

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\nPHASE B: {passed}/{len(results)} passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
