#!/usr/bin/env python3
"""prod-email-brevo-probe.py — reproduce + characterize Brevo failure on production.

What it does (read-only for app code, creates one throwaway account on prod):
  1. GET /api/auth/providers  -> emailDelivery flag (BREVO_API_KEY + BREVO_SENDER_EMAIL set?)
  2. Baseline latency: POST /api/auth/register with invalid payload -> 400 (route+DB floor)
  3. Real register with throwaway mail.tm address -> measure latency, emailSent, emailConfigured
  4. Poll mail.tm inbox up to 90s for the verification email
  5. Verdict on failure class:
       fast-fail  (delta < ~1.5s)  -> Brevo API returned an error quickly (4xx: key/sender/quota/permission)
       slow/timeout (delta > ~5s)  -> network / fetch hang class
Security: throwaway credentials generated in-memory, never printed; no secrets in output.
"""
import json
import random
import string
import time
import urllib.request
import urllib.error

BASE = "https://mq1.vercel.app"
MAILTM = "https://api.mail.tm"


def req(url, method="GET", body=None, headers=None, timeout=40):
    h = {"User-Agent": "mq-qa-probe/1.0"}
    if headers:
        h.update(headers)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h.setdefault("Content-Type", "application/json")
    r = urllib.request.Request(url, method=method, headers=h, data=data)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, resp.read().decode(), dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(), dict(e.headers)
    except Exception as e:
        return 0, f"EXC:{type(e).__name__}:{e}", {}


def rand(n=10):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


print("== 1. providers ==")
st, body, _ = req(f"{BASE}/api/auth/providers")
prov = json.loads(body) if st == 200 else {}
print(f"status={st} emailDelivery={prov.get('emailDelivery')} email={prov.get('email')} telegramBot={prov.get('telegramBot')}")

print("\n== 2. mail.tm throwaway inbox ==")
st, body, _ = req(f"{MAILTM}/domains")
domains = [d["domain"] for d in json.loads(body).get("hydra:member", []) if d.get("isActive")]
addr = f"mqprobe{rand(8)}@{domains[0]}"
mail_pw = rand(16)  # in-memory only, never printed
st, body, _ = req(f"{MAILTM}/accounts", "POST", {"address": addr, "password": mail_pw})
print(f"account create status={st} address={addr}" if st == 201 else f"account create FAILED status={st} body={body[:200]}")
st, body, _ = req(f"{MAILTM}/token", "POST", {"address": addr, "password": mail_pw})
tok = json.loads(body).get("token") if st == 200 else None
print(f"mail.tm token: {'OK' if tok else 'FAILED'}")

print("\n== 3. baseline latency (invalid register -> 400) ==")
t0 = time.perf_counter()
st, body, hdr = req(f"{BASE}/api/auth/register", "POST", {"username": "x"})
base_ms = (time.perf_counter() - t0) * 1000
print(f"status={st} latency={base_ms:.0f}ms")

print("\n== 4. real register (throwaway mail.tm address) ==")
username = f"mqa{rand(8)}"
app_pw = rand(16)  # throwaway, never printed
t0 = time.perf_counter()
st, body, hdr = req(
    f"{BASE}/api/auth/register",
    "POST",
    {"username": username, "email": addr, "password": app_pw},
)
reg_ms = (time.perf_counter() - t0) * 1000
try:
    data = json.loads(body)
except Exception:
    data = {"raw": body[:200]}
delta_ms = reg_ms - base_ms
print(f"status={st} latency={reg_ms:.0f}ms (delta vs baseline: {delta_ms:.0f}ms)")
safe = {k: data.get(k) for k in ("message", "userId", "email", "emailSent", "emailConfigured", "error", "devCode") if k in data}
if "devCode" in safe:
    safe["devCode"] = "<redacted>"
print(f"response: {json.dumps(safe, ensure_ascii=False)}")

verdict = None
if st == 201 and data.get("emailSent") is False:
    if delta_ms < 1500:
        verdict = "FAST-FAIL: Brevo (или SMTP-эндпоинт) быстро вернул ошибку — класс: ключ/sender/квота/права (4xx), НЕ сетевой таймаут"
    elif delta_ms > 5000:
        verdict = "SLOW: похоже на сетевой таймаут/подвисание fetch до api.brevo.com"
    else:
        verdict = "MID: неоднозначный класс, см. Vercel logs для точного статуса"
print(f"\nverdict: {verdict}")

print("\n== 5. poll mail.tm inbox (90s) ==")
received = False
deadline = time.time() + 90
while time.time() < deadline:
    st, body, _ = req(f"{MAILTM}/messages", headers={"Authorization": f"Bearer {tok}"} if tok else {})
    if st == 200:
        msgs = json.loads(body).get("hydra:member", [])
        if msgs:
            m = msgs[0]
            frm = (m.get("from") or {}).get("address", "?")
            print(f"RECEIVED: subject='{m.get('subject')}' from={frm} at {time.strftime('%H:%M:%S')}")
            received = True
            break
    time.sleep(5)
if not received:
    print("NO EMAIL received in 90s (подтверждает: отправка реально не происходит)")

print("\n== SUMMARY ==")
print(f"build: {prov.get('buildId', 'n/a') if 'buildId' in prov else '(см. version.json)'}")
print(f"emailConfigured={data.get('emailConfigured')} emailSent={data.get('emailSent')} received={received}")
print(f"latency: baseline={base_ms:.0f}ms register={reg_ms:.0f}ms delta={delta_ms:.0f}ms")
print(f"class: {verdict}")
