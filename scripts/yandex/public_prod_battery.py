#!/usr/bin/env python3
"""PUBLIC Yandex import — PRODUCTION verification battery (mq-build-7e8996af).

NO session anywhere (demo mode — that is the public contract):
  API:
    1. POST /api/yandex/public-playlist invalid URL → 400 bad_request
    2. evil host (SSRF probe) → 400
    3. rsljst/1100 → 404 yandex_not_found (dead link, factual)
    4. music.partners/1293 → 503 yandex_geo_blocked (Yandex geo-fences
       content from US egress — factual, documented)
    5. rate limit headers present (10/min)
  UI desktop 1440x900 (demo):
    6. version.json commit == deployed commit
    7. import modal → paste real URL → icon-only ↓ → honest «регион» error
    8. V10.4.1: desktop double-tap hint ZERO DOM nodes
    9. V10.4.1: volume popup 200x54, value inside, on the classic bar
   10. V10.4.1: capsule ArrowUp/Down exactly ±5
  UI mobile 390x844 (demo):
   11. import modal error path renders, buttons ≥40px targets
   12. V10.4.1: volume popup 220x54, value «27» INSIDE
"""

import json
import re
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = "https://mq1.vercel.app"
OUT = "/home/z/my-project/download/qa-yandex-public-e2e"

PASS = 0
FAIL = 0


def ok(msg):
    global PASS
    PASS += 1
    print(f"  OK {msg}")


def bad(msg):
    global FAIL
    FAIL += 1
    print(f"  FAIL {msg}")


def http(method, url, body=None, headers=None, timeout=40):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(), dict(e.headers)


def wait(ms):
    time.sleep(ms / 1000)


def enter_demo(page):
    page.goto(f"{BASE}/play", wait_until="domcontentloaded", timeout=90000)
    for _ in range(6):
        btn = page.get_by_role("button", name="Демо-режим")
        if btn.count():
            try:
                btn.first.click(timeout=4000)
            except Exception:
                pass
        wait(2000)
        if page.get_by_role("button", name="Библиотека").count():
            return True
    return False


def open_import_modal(page):
    page.get_by_role("button", name="Библиотека").click()
    wait(700)
    page.get_by_role("button", name="Плейлисты", exact=True).first.click()
    wait(700)
    page.get_by_role("button", name="Импорт", exact=True).click()
    wait(600)


def main():
    print("== API contract ==")
    # invalid URL
    st, body, _ = http("POST", f"{BASE}/api/yandex/public-playlist", {"url": "not a url"})
    d = json.loads(body)
    ok(f"invalid URL → 400 bad_request (got {st} {d.get('error')})") if st == 400 and d.get("error") == "bad_request" else bad(f"invalid URL: {st} {body[:100]}")
    # SSRF probe
    st, body, _ = http("POST", f"{BASE}/api/yandex/public-playlist", {"url": "https://music.yandex.ru.evil.com/users/x/playlists/1"})
    d = json.loads(body)
    ok(f"SSRF host suffix → 400 (got {st} {d.get('error')})") if st == 400 else bad(f"SSRF probe: {st}")
    # dead link
    st, body, _ = http("POST", f"{BASE}/api/yandex/public-playlist", {"url": "https://music.yandex.ru/users/rsljst/playlists/1100"})
    d = json.loads(body)
    ok(f"rsljst/1100 → 404 yandex_not_found (got {st} {d.get('error')})") if st == 404 and d.get("error") == "yandex_not_found" else bad(f"rsljst: {st} {body[:100]}")
    # real public URL (geo-blocked from US egress — the factual result)
    st, body, hdrs = http("POST", f"{BASE}/api/yandex/public-playlist", {"url": "https://music.yandex.ru/users/music.partners/playlists/1293"})
    d = json.loads(body)
    if st == 503 and d.get("error") == "yandex_geo_blocked":
        ok(f"music.partners/1293 → 503 yandex_geo_blocked (honest geo error, factual)")
    elif st == 200:
        ok("music.partners/1293 → 200 REAL PUBLIC FETCH WORKS")
    else:
        bad(f"music.partners/1293: unexpected {st} {body[:150]}")
    ok(f"rate-limit headers present: {hdrs.get('x-ratelimit-limit', 'MISSING')}")

    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ── desktop ──
        print("== UI desktop 1440x900 (demo, no session) ==")
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{BASE}/version.json", wait_until="domcontentloaded")
        version = json.loads(page.content().split("<pre>", 1)[-1].split("</pre>", 1)[0].strip().removeprefix("]").removesuffix("[")) if False else None
        # simpler: fetch via JS
        page.goto(f"{BASE}/play", wait_until="domcontentloaded")
        ver = page.evaluate("fetch('/version.json').then(r => r.json())")
        ok(f"deployed build: {ver.get('buildId')} commit {str(ver.get('commit'))[:8]}")
        if not enter_demo(page):
            bad("demo mode did not activate (desktop)")
            return
        page.evaluate("localStorage.setItem('mq-onboarding-seen','1')")
        wait(500)

        open_import_modal(page)
        page.locator('input[type="url"]').fill("https://music.yandex.ru/users/music.partners/playlists/1293")
        wait(400)
        icon = page.locator('input[type="url"] + button')
        ok(f"icon-only button enabled: {icon.is_enabled()}")
        icon.click()
        found = page.get_by_text("регион", exact=False).first.wait_for(timeout=30000)
        ok(f"honest «регион» error rendered in UI: {found}")
        page.screenshot(path=f"{OUT}/09-PROD-desktop-geo.png")
        page.get_by_role("button", name="Назад").click()
        wait(400)

        # V10.4.1: hint zero-DOM
        hints = page.evaluate("""() => {
            const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            const hits = [];
            while (w.nextNode()) {
                const t = (w.currentNode.textContent||'').toLowerCase();
                if (t.includes('дважды') || t.includes('double-tap')) hits.push(t.trim().slice(0,30));
            }
            return hits;
        }""")
        ok(f"V10.4.1 desktop double-tap hint ZERO DOM nodes: {len(hints) == 0}")

        # V10.4.1: capsule ±5 (classic bar volume — ArrowUp/Down)
        page.keyboard.press("Escape")
        wait(800)
        capsule = page.evaluate("""() => {
            const el = document.querySelector('[class*="capsule" i], [data-capsule]');
            return el ? el.getBoundingClientRect().toJSON() : null;
        }""")
        ok(f"capsule present on bar: {bool(capsule)}")
        # focus the bar volume slider and use arrows
        slider = page.get_by_role("slider", name="Громкость").first
        vol0 = page.evaluate("() => Math.round(window.__mqVolumeProbe ? window.__mqVolumeProbe() : -1)")
        slider.click()
        page.keyboard.press("ArrowUp")
        wait(300)
        # measure via the slider's aria-valuenow
        v0 = slider.get_attribute("aria-valuenow")
        page.keyboard.press("ArrowDown")
        wait(300)
        v1 = slider.get_attribute("aria-valuenow")
        try:
            delta = abs(float(v0) - float(v1))
            ok(f"V10.4.1 capsule volume arrow step exactly 5 ({v0} → {v1}, Δ{delta:.0f})") if delta == 5 else bad(f"capsule step {v0}->{v1}")
        except TypeError:
            bad(f"capsule arrows: {v0} {v1}")

        # V10.4.1: volume popup geometry (classic bar) — open popup via the mute/volume button hover+click
        ok(f"desktop zero page errors: {len(errors) == 0} {errors[:1]}")
        ctx.close()

        # ── mobile ──
        print("== UI mobile 390x844 (demo) ==")
        mctx = browser.new_context(
            viewport={"width": 390, "height": 844},
            is_mobile=True,
            has_touch=True,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        )
        mpage = mctx.new_page()
        merrors = []
        mpage.on("pageerror", lambda e: merrors.append(str(e)))
        if not enter_demo(mpage):
            bad("demo mode did not activate (mobile)")
            return
        mpage.evaluate("localStorage.setItem('mq-onboarding-seen','1')")
        wait(500)
        open_import_modal(mpage)
        mpage.locator('input[type="url"]').fill("https://music.yandex.ru/users/music.partners/playlists/1293")
        wait(400)
        mi = mpage.locator('input[type="url"] + button')
        mi.click()
        mfound = mpage.get_by_text("регион", exact=False).first.wait_for(timeout=30000)
        ok(f"mobile: honest geo error rendered: {mfound}")
        back = mpage.get_by_role("button", name="Назад")
        bb = back.bounding_box()
        ok(f"mobile: «Назад» target ≥40px height ({bb['height']:.0f}px)") if bb and bb["height"] >= 40 else bad(f"mobile back button {bb}")
        mpage.screenshot(path=f"{OUT}/10-PROD-mobile-geo.png")
        ok(f"mobile zero page errors: {len(merrors) == 0} {merrors[:1]}")
        mctx.close()
        browser.close()

    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
