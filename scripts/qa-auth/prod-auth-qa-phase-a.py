#!/usr/bin/env python3
"""
Phase A — REAL auth QA on production MQ Player (https://mq1.vercel.app).

Creates a REAL test account end-to-end through the PRODUCTION auth API:
  1. disposable mailbox (mail.tm public API)
  2. POST /api/auth/register        (username + email + random password)
  3. poll mailbox for the MQ verification email, extract the 6-digit code
  4. POST /api/auth/verify-code     -> account confirmed + session cookie
  5. GET  /api/auth/me              -> 200 authenticated (session proof)

Secrets (password, mailbox token, session cookie) are written ONLY to
gitignored files under scripts/qa-auth/.secret* and NEVER printed.
Printed output: statuses + safe fields only.
"""
import json
import random
import re
import string
import sys
import time
import urllib.request
import urllib.error

PROD = "https://mq1.vercel.app"
BASE = "/home/z/my-project/scripts/qa-auth"
TAG = "w13qa"


def http(method, url, body=None, headers=None, timeout=20):
    data = json.dumps(body).encode() if body is not None else None
    hdrs = {"Accept": "application/json", "User-Agent": "mq-qa/1.0"}
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
            return e.code, {"raw": raw[:300]}, e.headers


def rand(n=8):
    return "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(n))


def main():
    # ── 1. disposable mailbox ──
    st, domains, _ = http("GET", "https://api.mail.tm/domains")
    if isinstance(domains, list) and domains:
        domain = domains[0]["domain"]
    elif st == 200 and isinstance(domains, dict):
        members = domains.get("hydra:member") or domains.get("member") or []
        if not members:
            print("FAIL: no mail.tm domains", str(domains)[:200])
            return 1
        domain = members[0]["domain"]
    else:
        print(f"FAIL: cannot list mail.tm domains HTTP {st}", str(domains)[:200])
        return 1

    local = f"mq{TAG}{rand(6)}"
    addr = f"{local}@{domain}"
    mailpw = rand(18) + "Aa1!"

    st, acc, _ = http("POST", "https://api.mail.tm/accounts",
                      {"address": addr, "password": mailpw})
    if st not in (200, 201):
        print(f"FAIL: mailbox create {st}", str(acc)[:200])
        return 1
    st, tok, _ = http("POST", "https://api.mail.tm/token",
                      {"address": addr, "password": mailpw})
    if st != 200 or not tok.get("token"):
        print(f"FAIL: mailbox token {st}", str(tok)[:200])
        return 1

    # ── 2. register on PRODUCTION ──
    username = f"qa_{TAG}_{rand(5)}"
    password = rand(20) + "Aa1!"
    st, reg, _ = http("POST", f"{PROD}/api/auth/register",
                      {"username": username, "email": addr, "password": password})
    print(f"[register] HTTP {st} emailSent={reg.get('emailSent')} "
          f"emailConfigured={reg.get('emailConfigured')} user={reg.get('userId')}")
    if st != 201:
        print("FAIL: register", str(reg)[:300])
        return 1

    # ── 3. poll for the MQ verification email ──
    code = None
    bearer = {"Authorization": f"Bearer {tok['token']}"}
    deadline = time.time() + 150
    print("[mailbox] polling for MQ verification email ...")
    while time.time() < deadline:
        st, msgs, _ = http("GET", "https://api.mail.tm/messages", headers=bearer)
        if isinstance(msgs, list):
            lst = msgs
        elif isinstance(msgs, dict):
            lst = msgs.get("hydra:member") or msgs.get("member") or []
        else:
            lst = []
        for m in lst:
            if "mq" in (m.get("subject") or "").lower() or "код" in (m.get("subject") or ""):
                st2, full, _ = http("GET",
                                     f"https://api.mail.tm/messages/{m['id']}",
                                     headers=bearer)
                text = full.get("text") or full.get("html") or ""
                if not text:
                    text = json.dumps(full, ensure_ascii=False)
                m_code = re.search(r"\b(\d{6})\b", text)
                if m_code:
                    code = m_code.group(1)
                    break
        if code:
            break
        time.sleep(6)
    if not code:
        print("FAIL: verification email did not arrive in 150s")
        return 1
    print(f"[mailbox] code received (value withheld)")

    # ── 4. verify-code -> confirmed + session ──
    st, ver, vhdrs = http("POST", f"{PROD}/api/auth/verify-code",
                          {"email": addr, "code": code})
    print(f"[verify-code] HTTP {st} user={ver.get('username')} "
          f"confirmed=true msg={ver.get('message')}")
    if st != 200:
        print("FAIL: verify-code", str(ver)[:300])
        return 1
    set_cookie = vhdrs.get("Set-Cookie") or ""
    m = re.search(r"session=([^;]+)", set_cookie)
    if not m:
        print("FAIL: no session cookie in verify-code response")
        return 1
    session = m.group(1)
    cookie_hdr = f"session={session}"

    # ── 5. /api/auth/me with the session ──
    st, me, _ = http("GET", f"{PROD}/api/auth/me",
                     headers={"Cookie": cookie_hdr})
    print(f"[me] HTTP {st} authenticated={me.get('authenticated')} "
          f"user={me.get('username')} confirmed={me.get('confirmed')}")
    if st != 200 or not me.get("authenticated"):
        print("FAIL: session not valid after verify-code")
        return 1

    # ── save secrets (gitignored), never printed ──
    with open(f"{BASE}/.secret-a.json", "w") as f:
        json.dump({"username": username, "email": addr, "password": password,
                   "session": session, "mail_token": tok["token"]}, f)
    with open(f"{BASE}/.secret-a.cookies", "w") as f:
        f.write(cookie_hdr + "\n")

    print(f"PHASE A PASS — real account {username} confirmed and session active")
    return 0


if __name__ == "__main__":
    sys.exit(main())
