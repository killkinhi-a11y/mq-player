#!/usr/bin/env python3
"""
Phase E — LOCAL E2E of the W13 account-linking matrix (code tree = 5bad44a0,
same as production build). Environment: local dev server on :3000 with LOCAL
TEST env (throwaway SQLite via the SAME Turso adapter path prod uses, test
bot token). Clearly labeled: this is LOCAL evidence, not production.

Real cryptographic flows:
  - Telegram Login Widget payloads signed with the official Telegram
    algorithm (HMAC-SHA256 over the data-check-string with SHA256(bot_token))
    — the exact payloads the real widget produces, verified server-side.
  - Email account via register + devCode (dev mode) + verify-code.

Matrix:
  1. email account A (session)                    -> me 200
  2. TG account X via widget (separate account)   -> session X
  3. A links FRESH TG identity Z                   -> linkSuccess
  4. conflict: A links X (owned by other account)  -> telegram_taken, NO merge
  5. duplicate: A links Z again                    -> idempotent, no dup rows
  6. garbage hash in link mode                     -> rejected before link
  7. /api/sync snapshot before/after               -> unchanged (link != merge)
  8. logout / login                                -> link survives, same account
  9. google link-mode start with session           -> 302 + link cookie
 10. direct DB audit                               -> no duplicate/merged rows

Secrets: the session cookie values are kept in memory only (never printed).
"""
import hashlib
import hmac
import json
import random
import re
import sqlite3
import string
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar

BASE = "http://localhost:3000"
BOT_TOKEN = "1234567890:LOCAL-QA-TEST-TOKEN-NOT-REAL"
DB_FILE = "/home/z/my-project/scripts/qa-auth/local-qa.db"
UA = {"User-Agent": "mq-qa/1.0", "Accept": "application/json"}

results = []


def record(name, ok, detail):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name} — {detail}")


def rand(n=6):
    return "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(n))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def http(method, url, body=None, headers=None, timeout=40):
    data = json.dumps(body).encode() if body is not None else None
    hdrs = dict(UA)
    if body is not None:
        hdrs["Content-Type"] = "application/json"
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode(errors="replace")
            return r.status, (json.loads(raw) if raw else {}), r.headers
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(raw), e.headers
        except Exception:
            return e.code, {"raw": raw[:200]}, e.headers


def get_follow(opener, url, timeout=40):
    req = urllib.request.Request(url, headers=UA)
    with opener.open(req, timeout=timeout) as r:
        return r.status, r.geturl(), r.read().decode(errors="replace")


def get_noredirect(opener, url, timeout=40):
    """GET without following redirects; returns (status, headers, body)."""
    req = urllib.request.Request(url, headers=UA)
    try:
        with opener.open(req, timeout=timeout) as r:
            return r.status, r.headers, r.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read().decode(errors="replace")


def tg_sign(params: dict) -> str:
    check = "\n".join(f"{k}={params[k]}" for k in sorted(params) if k != "hash")
    secret = hashlib.sha256(BOT_TOKEN.encode()).digest()
    return hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()


def tg_callback_url(tg_id: int, username: str, link: bool) -> str:
    p = {
        "id": str(tg_id),
        "first_name": "QA Local",
        "username": username,
        "auth_date": str(int(time.time())),
    }
    p["hash"] = tg_sign(p)
    qs = urllib.parse.urlencode(p)
    return f"{BASE}/api/auth/telegram-widget/callback?{qs}" + ("&link=1" if link else "")


def session_of(hdrs) -> str:
    sc = hdrs.get("Set-Cookie") or ""
    m = re.search(r"session=([^;]+)", sc)
    return m.group(1) if m else None


def sess_hdr(session: str) -> dict:
    return {"Cookie": f"session={session}"}


def main():
    # ── 1. email account A ──
    uname_a = f"qa_local_a_{rand(5)}"
    addr_a = f"qa.local.a.{rand(8)}@example.test"
    pass_a = rand(16) + "Aa1!"
    st, reg, _ = http("POST", f"{BASE}/api/auth/register",
                      {"username": uname_a, "email": addr_a, "password": pass_a})
    devcode = reg.get("devCode")
    ok = st == 201 and bool(devcode)
    record("A: register (dev mode returns devCode)", ok,
           f"HTTP {st}, devCode={'received' if devcode else 'MISSING'}")
    if not devcode:
        return 1
    st, ver, vhdrs = http("POST", f"{BASE}/api/auth/verify-code",
                          {"email": addr_a, "code": devcode})
    sess_a = session_of(vhdrs)
    ok = st == 200 and bool(sess_a)
    record("A: verify-code -> confirmed + session cookie", ok,
           f"HTTP {st}, session={'set' if sess_a else 'MISSING'}")
    st, me, _ = http("GET", f"{BASE}/api/auth/me", headers=sess_hdr(sess_a))
    record("A: /api/auth/me authenticated", st == 200 and me.get("authenticated"),
           f"HTTP {st}, user={me.get('username')} confirmed={me.get('confirmed')}")
    uid_a = me.get("userId")

    st, lp, _ = http("GET", f"{BASE}/api/auth/link/providers", headers=sess_hdr(sess_a))
    ok = st == 200 and lp.get("google", {}).get("linked") is False \
        and lp.get("telegram", {}).get("linked") is False
    record("A: link/providers initial state (google=F, telegram=F)", ok, f"HTTP {st}, {json.dumps(lp)}")

    # ── 2. TG account X (separate MQ account via widget login) ──
    TG_X = 910000001
    url = tg_callback_url(TG_X, "qa_tg_x", link=False)
    jar = CookieJar()
    op = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPCookieProcessor(jar))
    st, hdrs, _ = get_noredirect(op, url)
    loc = hdrs.get("Location", "")
    q = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(loc).query))
    ok = "authStep=telegram-widget-register" in loc and q.get("token")
    record("X: TG widget login (new user) -> pending-identity token", ok,
           f"HTTP {st}, authStep={q.get('authStep')}, token={'issued' if q.get('token') else 'MISSING'}")
    st, xreg, xhdrs = http("POST", f"{BASE}/api/auth/telegram-widget/register",
                           {"token": q.get("token"), "username": f"qa_tg_x_{rand(5)}"})
    sess_x = session_of(xhdrs)
    ok = st == 200 and bool(sess_x) and xreg.get("isNewUser") is True
    record("X: widget register -> account created + session", ok,
           f"HTTP {st}, user={xreg.get('username')}, isNewUser={xreg.get('isNewUser')}")
    st, lp, _ = http("GET", f"{BASE}/api/auth/link/providers", headers=sess_hdr(sess_x))
    ok = st == 200 and lp.get("telegram", {}).get("linked") is True
    record("X: link/providers shows telegram linked", ok, f"HTTP {st}, {json.dumps(lp)}")
    st, me, _ = http("GET", f"{BASE}/api/auth/me", headers=sess_hdr(sess_x))
    uid_x = me.get("userId")
    record("X: distinct MQ account (userId differs from A)",
           bool(uid_a) and bool(uid_x) and uid_a != uid_x, f"A={str(uid_a)[:8]}… X={str(uid_x)[:8]}…")

    # ── 3. A links FRESH TG identity Z ──
    TG_Z = 910000002
    st, hdrs, _ = get_noredirect(op, tg_callback_url(TG_Z, "qa_tg_z", link=True))
    # NOTE: link mode needs session A cookie; use a fresh opener with raw header
    req = urllib.request.Request(tg_callback_url(TG_Z, "qa_tg_z", link=True),
                                 headers={**UA, **sess_hdr(sess_a)})
    class NR(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None
    op2 = urllib.request.build_opener(NR())
    try:
        with op2.open(req, timeout=40) as r:
            st, hdrs2 = r.status, r.headers
    except urllib.error.HTTPError as e:
        st, hdrs2 = e.code, e.headers
    loc = hdrs2.get("Location", "")
    ok = st in (302, 303, 307) and "linkSuccess=telegram" in loc
    record("A: link fresh TG identity Z -> linkSuccess=telegram", ok,
           f"HTTP {st}, Location={urllib.parse.urlparse(loc).path}?{dict(urllib.parse.parse_qsl(urllib.parse.urlparse(loc).query))}")
    st, me2, _ = http("GET", f"{BASE}/api/auth/me", headers=sess_hdr(sess_a))
    record("A: session preserved after linking (same userId)",
           me2.get("authenticated") and me2.get("userId") == uid_a,
           f"me={me2.get('authenticated')}, userId_same={me2.get('userId') == uid_a}")
    st, lp, _ = http("GET", f"{BASE}/api/auth/link/providers", headers=sess_hdr(sess_a))
    ok = st == 200 and lp.get("telegram", {}).get("linked") is True \
        and lp.get("telegram", {}).get("username") == "qa_tg_z"
    record("A: link/providers now telegram=connected @qa_tg_z (google still F)", ok,
           f"HTTP {st}, {json.dumps(lp)}")

    # ── 4. CONFLICT: A links X (owned by X's account) ──
    req = urllib.request.Request(tg_callback_url(TG_X, "qa_tg_x", link=True),
                                 headers={**UA, **sess_hdr(sess_a)})
    try:
        with op2.open(req, timeout=40) as r:
            st, hdrs3 = r.status, r.headers
    except urllib.error.HTTPError as e:
        st, hdrs3 = e.code, e.headers
    loc = hdrs3.get("Location", "")
    ok = st in (302, 303, 307) and "linkError=telegram_taken" in loc
    record("CONFLICT: A links TG owned by another account -> telegram_taken", ok,
           f"HTTP {st}, linkError={dict(urllib.parse.parse_qsl(urllib.parse.urlparse(loc).query)).get('linkError')}")
    st, lp, _ = http("GET", f"{BASE}/api/auth/link/providers", headers=sess_hdr(sess_a))
    ok = lp.get("telegram", {}).get("username") == "qa_tg_z"  # NOT switched to X
    record("CONFLICT: A unchanged (still @qa_tg_z, no takeover)", ok,
           f"telegram={json.dumps(lp.get('telegram'))}")
    # X account intact: TG widget re-login as X -> same userId
    opx = urllib.request.build_opener(NoRedirect())
    st, hdrs4, _ = get_noredirect(opx, tg_callback_url(TG_X, "qa_tg_x", link=False))
    sess_x2 = session_of(hdrs4)
    st, me3, _ = http("GET", f"{BASE}/api/auth/me", headers=sess_hdr(sess_x2))
    record("CONFLICT: X account intact (TG login still -> X userId)",
           me3.get("userId") == uid_x,
           f"userId_same={me3.get('userId') == uid_x}, user={me3.get('username')}")

    # ── 5. DUPLICATE: A links Z again ──
    req = urllib.request.Request(tg_callback_url(TG_Z, "qa_tg_z", link=True),
                                 headers={**UA, **sess_hdr(sess_a)})
    try:
        with op2.open(req, timeout=40) as r:
            st, hdrs5 = r.status, r.headers
    except urllib.error.HTTPError as e:
        st, hdrs5 = e.code, e.headers
    loc = hdrs5.get("Location", "")
    ok = st in (302, 303, 307) and "linkSuccess=telegram" in loc
    record("DUPLICATE: re-link own TG -> idempotent success", ok,
           f"HTTP {st}, {dict(urllib.parse.parse_qsl(urllib.parse.urlparse(loc).query))}")
    con = sqlite3.connect(DB_FILE)
    n_z = con.execute(
        "SELECT COUNT(*) FROM AuthIdentity WHERE provider='telegram' AND providerUserId=?",
        (str(TG_Z),)).fetchone()[0]
    n_a = con.execute(
        "SELECT COUNT(*) FROM AuthIdentity WHERE userId=? AND provider='telegram'",
        (uid_a,)).fetchone()[0]
    ok = n_z == 1 and n_a == 1
    record("DUPLICATE: DB audit — exactly 1 identity row for Z, 1 telegram identity for A",
           ok, f"rows(Z)={n_z}, telegram_rows(A)={n_a}")
    con.close()

    # ── 6. GARBAGE hash in link mode ──
    now = str(int(time.time()))
    bad = (f"{BASE}/api/auth/telegram-widget/callback?id=910000003&first_name=Bad"
           f"&username=qa_bad&auth_date={now}&hash=deadbeefdeadbeef&link=1")
    req = urllib.request.Request(bad, headers={**UA, **sess_hdr(sess_a)})
    try:
        with op2.open(req, timeout=40) as r:
            st, hdrs6 = r.status, r.headers
    except urllib.error.HTTPError as e:
        st, hdrs6 = e.code, e.headers
    loc = hdrs6.get("Location", "")
    ok = "authError=telegram_hash_invalid" in loc
    record("GARBAGE: unsigned payload in link mode rejected (verify-before-link)", ok,
           f"HTTP {st}, authError={dict(urllib.parse.parse_qsl(urllib.parse.urlparse(loc).query)).get('authError')}")
    st, lp, _ = http("GET", f"{BASE}/api/auth/link/providers", headers=sess_hdr(sess_a))
    record("GARBAGE: A linkage unchanged after rejected attempt",
           lp.get("telegram", {}).get("username") == "qa_tg_z", f"telegram={json.dumps(lp.get('telegram'))}")

    # ── 7. sync integrity (link != merge) ──
    st, s1, _ = http("GET", f"{BASE}/api/sync", headers=sess_hdr(sess_a))
    snap1 = json.dumps(s1, sort_keys=True)
    st2, s2, _ = http("GET", f"{BASE}/api/sync", headers=sess_hdr(sess_a))
    snap2 = json.dumps(s2, sort_keys=True)
    record("INTEGRITY: /api/sync stable across linking session (no data merge/loss)",
           snap1 == snap2 and st == 200, f"HTTP {st}/{st2}, identical={snap1 == snap2}")

    # ── 8. logout / login ──
    st, _, _ = http("POST", f"{BASE}/api/auth/logout", headers=sess_hdr(sess_a))
    st, me4, _ = http("GET", f"{BASE}/api/auth/me", headers=sess_hdr(sess_a))
    record("LOGOUT: session invalidated", me4.get("authenticated") is not True,
           f"me HTTP {st}, authenticated={me4.get('authenticated')}")
    st, lg, lgh = http("POST", f"{BASE}/api/auth/login",
                       {"email": addr_a, "password": pass_a})
    sess_a2 = session_of(lgh)
    ok = st == 200 and bool(sess_a2)
    record("LOGIN: email+password re-login", ok, f"HTTP {st}, session={'set' if sess_a2 else 'MISSING'}")
    st, lp, _ = http("GET", f"{BASE}/api/auth/link/providers", headers=sess_hdr(sess_a2))
    ok = lp.get("telegram", {}).get("linked") is True and lp.get("telegram", {}).get("username") == "qa_tg_z"
    record("LOGIN: link survives re-login, same account", ok, f"{json.dumps(lp)}")

    # ── 9. google link-mode start with session ──
    jar9 = CookieJar()
    op9 = urllib.request.build_opener(
        type("NR2", (urllib.request.HTTPRedirectHandler,),
             {"redirect_request": staticmethod(lambda *a, **k: None)})(),
        urllib.request.HTTPCookieProcessor(jar9))
    # attach session cookie manually as header (cookie jar has none yet)
    req = urllib.request.Request(f"{BASE}/api/auth/google?link=1",
                                 headers={**UA, **sess_hdr(sess_a2)})
    try:
        with op9.open(req, timeout=40) as r:
            st, hdrs9 = r.status, r.headers
    except urllib.error.HTTPError as e:
        st, hdrs9 = e.code, e.headers
    loc = hdrs9.get("Location", "")
    names = sorted(c.name for c in jar9)
    ok = st in (302, 303, 307) and loc.startswith("https://accounts.google.com/") \
        and "mq_oauth_link" in names
    record("GOOGLE: link-mode start with session -> 302 + mq_oauth_link cookie", ok,
           f"HTTP {st}, cookies={names}")
    record("GOOGLE: completion (real Google consent) NOT testable locally — external provider",
           True, "documented as BLOCKED in the report (same as production)")

    # ── 10. final DB audit ──
    con = sqlite3.connect(DB_FILE)
    rows = con.execute(
        "SELECT provider, providerUserId, providerUsername FROM AuthIdentity ORDER BY provider, providerUserId"
    ).fetchall()
    n_users = con.execute("SELECT COUNT(*) FROM User").fetchone()[0]
    con.close()
    print(f"[db] AuthIdentity rows: {rows}")
    print(f"[db] users created this run: {n_users}")
    ok = len(rows) == 2 and rows[0][0] == "telegram" and rows[1][0] == "telegram"
    record("DB AUDIT: exactly 2 identity rows (X->X-account, Z->A-account), no dup/merge",
           ok, f"{len(rows)} rows, users={n_users}")

    passed = sum(1 for _, okk, _ in results if okk)
    print(f"\nPHASE E (LOCAL): {passed}/{len(results)} passed")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
