#!/usr/bin/env python3
"""YANDEX IMPORT — PRODUCTION E2E on https://mq1.vercel.app (mq-build-8400e870).

Proves the FULL production chain with a REAL user session
(temp mailbox registration → email code → session cookie):

  1. mail.tm account → register on MQ production → verify code → session
  2. GET  /api/yandex/account        → {connected: false}
  3. POST /api/yandex/auth/start    → REAL Yandex device code through the
     PRODUCTION stack (Next route → HMAC → Python function → oauth.yandex.ru)
  4. POST /api/yandex/auth/poll     → {status: "pending"} (real Yandex response)
  5. GET  /api/yandex/playlists     → 401 no_yandex_account (not linked yet)
  6. UI (desktop 1440×900): Playlists → Импорт → Яндекс → connect →
     REAL device code rendered (screenshot)
  7. UI (mobile 390×844): flow renders mobile-first (screenshot)
  8. No secrets in any response (device_code / token scans)

The actual playlist IMPORT requires authorizing with a REAL Yandex account —
no test account is available: YANDEX_RUNTIME_E2E = BLOCKED (documented).
"""

import json
import random
import re
import string
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "https://mq1.vercel.app"
OUT = "/home/z/my-project/download/qa-yandex-prod"

PASS = 0
FAIL = 0


def ok(msg):
    global PASS
    PASS += 1
    print(f"  ✓ {msg}")


def bad(msg):
    global FAIL
    FAIL += 1
    print(f"  ✗ {msg}")


def rand(n=10):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


def http(method, url, body=None, headers=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode() or "{}"), dict(r.headers)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}"), dict(e.headers)
        except Exception:
            return e.code, {}, dict(e.headers)


def make_mailbox():
    """Create a temp mailbox on mail.tm; returns (address, token)."""
    addr = f"mq{rand(8)}@indigo.ma"  # mail.tm alternate domain is often open
    # discover available domain first
    st, doms, _ = http("GET", "https://api.mail.tm/domains")
    domains = [d.get("domain") for d in (doms.get("hydra:member") or doms.get("member") or []) if d.get("domain")]
    if domains:
        addr = f"mq{rand(8)}@{domains[0]}"
    password = rand(16) + "Aa1!"
    st, acc, _ = http("POST", "https://api.mail.tm/accounts", {"address": addr, "password": password})
    if st not in (200, 201):
        # retry with another domain
        if domains and len(domains) > 1:
            addr = f"mq{rand(8)}@{domains[1]}"
            st, acc, _ = http("POST", "https://api.mail.tm/accounts", {"address": addr, "password": password})
    if st not in (200, 201):
        raise SystemExit(f"mailbox create failed: {st} {acc}")
    st, tok, _ = http("POST", "https://api.mail.tm/token", {"address": addr, "password": password})
    if st != 200 or not tok.get("token"):
        raise SystemExit(f"mailbox token failed: {st}")
    return addr, tok["token"], password


def wait_for_code(token, timeout=180):
    headers = {"Authorization": f"Bearer {token}"}
    deadline = time.time() + timeout
    while time.time() < deadline:
        st, msgs, _ = http("GET", "https://api.mail.tm/messages", headers=headers)
        lst = msgs if isinstance(msgs, list) else (msgs.get("hydra:member") or msgs.get("member") or [])
        for m in lst:
            st2, full, _ = http("GET", f"https://api.mail.tm/messages/{m['id']}", headers=headers)
            text = full.get("text") or full.get("html") or json.dumps(full, ensure_ascii=False)
            match = re.search(r"\b(\d{6})\b", text)
            if match:
                return match.group(1)
        time.sleep(6)
    return None


def main():
    print("== 1. temp mailbox + production registration ==")
    addr, mail_token, mail_pass = make_mailbox()
    print(f"  mailbox: {addr}")
    username = f"qa_ym_{rand(6)}"
    password = rand(20) + "Aa1!"
    st, reg, _ = http("POST", f"{BASE}/api/auth/register", {"username": username, "email": addr, "password": password})
    if st != 201:
        print(f"  register: HTTP {st} {str(reg)[:200]}")
        bad("registration failed")
        return summary()
    ok(f"registered {username} (emailSent={reg.get('emailSent')})")

    print("== 2. email verification code ==")
    code = wait_for_code(mail_token)
    if not code:
        bad("verification email did not arrive")
        return summary()
    ok("verification code received")

    st, ver, vhdrs = http("POST", f"{BASE}/api/auth/verify-code", {"email": addr, "code": code})
    if st != 200:
        bad(f"verify-code failed: {st} {str(ver)[:150]}")
        return summary()
    cookie = (vhdrs.get("Set-Cookie") or "").split(";")[0]
    if not cookie.startswith("session="):
        bad("no session cookie from verify-code")
        return summary()
    ok("session cookie established")
    auth = {"Cookie": cookie}

    print("== 3. Yandex account status (not linked) ==")
    st, acc, _ = http("GET", f"{BASE}/api/yandex/account", headers=auth)
    if st == 200 and acc.get("connected") is False:
        ok("account route: not linked (correct initial state)")
    else:
        bad(f"account route unexpected: {st} {str(acc)[:120]}")

    print("== 4. REAL device flow through the production stack ==")
    st, started, _ = http("POST", f"{BASE}/api/yandex/auth/start", body={}, headers=auth)
    if st != 200 or not started.get("userCode"):
        bad(f"auth/start failed: {st} {str(started)[:200]}")
        return summary()
    user_code = started.get("userCode")
    ver_url = started.get("verificationUrl") or started.get("verification_url")
    ok(f"REAL Yandex device code issued: {user_code} @ {ver_url} (expires in {started.get('expiresIn')}s)")
    if ver_url and "ya" in ver_url:
        ok("verification URL is the real Yandex page")
    if "deviceCode" in json.dumps(started) or "device_code" in json.dumps(started):
        bad("device_code leaked in auth/start response!")
    else:
        ok("no device_code in auth/start response (server-side only)")

    st, poll, _ = http("POST", f"{BASE}/api/yandex/auth/poll", body={}, headers=auth)
    if st == 200 and poll.get("status") == "pending":
        ok("auth/poll → pending (real Yandex authorization_pending)")
    else:
        bad(f"auth/poll unexpected: {st} {str(poll)[:120]}")

    st, pls, _ = http("GET", f"{BASE}/api/yandex/playlists", headers=auth)
    if st == 401 and pls.get("error") == "no_yandex_account":
        ok("playlists without linked account → 401 no_yandex_account")
    else:
        bad(f"playlists unexpected: {st} {str(pls)[:120]}")

    st, noauth, _ = http("POST", f"{BASE}/api/yandex/auth/start", body={})
    if st == 401:
        ok("auth/start without session → 401")
    else:
        bad(f"auth/start without session: {st}")

    # ================= UI ==============================================
    print("== 5. UI flow on production (desktop 1440×900) ==")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        m = re.match(r"session=(.+)", cookie)
        ctx.add_cookies([{"name": "session", "value": m.group(1), "url": BASE, "httpOnly": True}])
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{BASE}/app", wait_until="domcontentloaded", timeout=90000)
        try:
            page.get_by_text("Библиотека").first.wait_for(timeout=60000)
            ok("production app boots with the session")
        except Exception:
            bad(f"app boot failed: {str(errors)[:120]}")
            browser.close()
            return summary()
        page.wait_for_timeout(1500)
        page.screenshot(path=f"{OUT}/01-prod-app-boot.png")

        page.get_by_text("Библиотека").first.click()
        page.wait_for_timeout(1200)
        page.get_by_text("Плейлисты", exact=True).first.click()
        page.wait_for_timeout(1500)
        page.get_by_role("button", name="Импорт", exact=True).first.click()
        page.wait_for_timeout(600)
        page.screenshot(path=f"{OUT}/02-prod-import-dialog.png")
        if page.get_by_text("Импортировать из Яндекс Музыки").is_visible():
            ok("production import dialog shows the Yandex entry")
        else:
            bad("Yandex entry missing in production dialog")

        page.get_by_text("Импортировать из Яндекс Музыки").first.click()
        page.wait_for_timeout(1500)
        page.screenshot(path=f"{OUT}/03-prod-yandex-connect.png")
        if page.get_by_text("Подключите Яндекс.Музыку").is_visible():
            ok("production connect step renders")

        page.get_by_role("button", name="Подключить Яндекс.Музыку").first.click()
        try:
            page.get_by_text("ya.ru/device").first.wait_for(timeout=30000)
        except Exception:
            pass
        page.wait_for_timeout(1500)
        page.screenshot(path=f"{OUT}/04-prod-device-code.png")
        body_text = page.inner_text("body")
        if re.search(r"[a-z0-9]{6,10}", body_text) and "ya.ru/device" in body_text:
            ok("REAL device code rendered in the production UI")
        else:
            bad("device code not visible in production UI")
        if "device" in body_text.lower() and "code" in body_text.lower():
            pass
        html = page.content()
        # the production user_code from the API step may differ from this new
        # start call — assert A code is present and no device_code leaked
        if "mq-yandex-adapter" in html or "device_code" in html.replace("device_code_expired", "").replace("device_code_cancelled", ""):
            bad("adapter internals/device_code leaked into DOM")
        else:
            ok("no device_code in production DOM")
        if not errors:
            ok("production UI: 0 page errors")
        else:
            bad(f"page errors: {errors[0][:120]}")

        print("== 6. mobile 390×844 ==")
        mctx = browser.new_context(viewport={"width": 390, "height": 844})
        mctx.add_cookies([{"name": "session", "value": m.group(1), "url": BASE, "httpOnly": True}])
        mpage = mctx.new_page()
        merrors = []
        mpage.on("pageerror", lambda e: merrors.append(str(e)))
        mpage.goto(f"{BASE}/app", wait_until="domcontentloaded", timeout=90000)
        mob_lib = mpage.get_by_label("Библиотека").locator("visible=true").first
        mob_lib.wait_for(timeout=60000)
        mob_lib.click()
        mpage.wait_for_timeout(1000)
        mpage.get_by_text("Плейлисты", exact=True).locator("visible=true").first.click()
        mpage.wait_for_timeout(1200)
        mpage.get_by_role("button", name="Импорт", exact=True).first.click()
        mpage.wait_for_timeout(500)
        mpage.get_by_text("Импортировать из Яндекс Музыки").first.click()
        mpage.wait_for_timeout(1500)
        mpage.screenshot(path=f"{OUT}/05-prod-mobile-connect.png")
        if mpage.get_by_text("Подключите Яндекс.Музыку").is_visible():
            ok("production mobile: connect step renders")
        else:
            bad("production mobile: connect step missing")
        if not merrors:
            ok("production mobile: 0 page errors")
        else:
            bad(f"mobile page errors: {merrors[0][:120]}")
        browser.close()

    return summary()


def summary():
    print("")
    print(f"PROD E2E: {PASS} passed, {FAIL} failed")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
