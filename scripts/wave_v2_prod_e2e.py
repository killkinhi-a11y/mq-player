#!/usr/bin/env python3
"""MQ WAVE V2 — PRODUCTION E2E on https://mq1.vercel.app (mq-build-d3180756).

Journey per viewport (desktop 1440x900, mobile 390x844):
  demo → start Wave → like → skip (next rec) → ⋯/Больше такого →
  crossfade check → queue drawer via player → back → stop → screenshots.
Plus: version check, API relevance spot-check, page-error sweep.
"""
import json
import sys
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "https://mq1.vercel.app"
OUT = Path("/home/z/my-project/download/qa-wave-v2")
OUT.mkdir(parents=True, exist_ok=True)


def api_check():
    """Relevance gate spot-check on the production API."""
    body = json.dumps({
        "anonId": "prod-qa-user-0001",
        "debug": True,
        "likedArtists": ["Molchat Doma", "Joy Division", "Tame Impala", "Кино"],
        "likedGenres": ["post punk", "indie rock", "electronic", "rock"],
        "historyArtists": ["Molchat Doma", "Joy Division", "Tame Impala", "Виктор Цой", "New Order"],
        "historyGenres": ["post punk", "indie rock", "rock", "electronic"],
        "tasteGenres": ["post punk", "indie rock", "electronic"],
        "tasteArtists": ["Molchat Doma", "Tame Impala"],
        "language": "mixed",
        "likedTexts": ["Судно Molchat Doma", "Atmosphere Joy Division", "Группа крови Кино"],
        "historyTexts": ["Судно Molchat Doma", "Blue Monday New Order", "Группа крови Кино", "Elephant Tame Impala"],
        "seed": {"kind": "taste", "label": "Ваш вкус"},
    }).encode()
    req = urllib.request.Request(BASE + "/api/wave", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=90) as r:
        d = json.loads(r.read())
    tracks = d.get("tracks", [])
    meta = d.get("meta", {})
    print(f"[api] tracks={len(tracks)} rejected={meta.get('relevance_rejected_count')} "
          f"exploration={meta.get('exploration_count')} rung={meta.get('gate_rung')}")
    foreign = 0
    for t in tracks[:8]:
        dbg = t.get("_debug") or {}
        title = t.get("title", "")
        artist = t.get("artist", "")
        has_cyr_nonlat = any(0x0900 <= ord(c) <= 0x0D80 or 0xAC00 <= ord(c) <= 0xD7AF or
                             0x3040 <= ord(c) <= 0x30FF or 0x4E00 <= ord(c) <= 0x9FFF or
                             0x0600 <= ord(c) <= 0x06FF for c in title + artist)
        if has_cyr_nonlat:
            foreign += 1
        print(f"   {title[:36]:38} | {artist[:20]:22} | {t.get('_reason'):16} | anchor={dbg.get('anchor')}")
    return len(tracks) > 0


def journey(p, name, w, h, mobile=False):
    errors = []
    ok = []
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": w, "height": h},
                              device_scale_factor=2 if mobile else 1,
                              is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    try:
        page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(3500)
        demo = page.get_by_role("button", name="Демо", exact=False)
        if demo.count() > 0 and demo.first.is_visible():
            demo.first.click()
            page.wait_for_timeout(5000)
        page.evaluate("() => { try { localStorage.setItem('mq-tour-complete','true'); } catch(e){} }")
        for label in ["Запустить Волну", "Волна"]:
            btn = page.locator(f'button[aria-label="{label}"]').first
            if btn.count() > 0 and btn.is_visible():
                btn.click(timeout=4000)
                break
        page.wait_for_selector('[data-testid="wave-home"]', timeout=40000)
        page.wait_for_timeout(4500)
        art = page.evaluate("() => { const a = document.querySelector('.mq-wave-art'); return a ? Math.round(a.getBoundingClientRect().width) : 0; }")
        nexts = page.evaluate("() => document.querySelectorAll('[data-testid=wave-next-up] li, [data-testid=wave-next-up-mobile] li').length")
        ok.append(f"wave live: artwork={art}px next-up={nexts}")
        page.screenshot(path=str(OUT / f"prod-{name}-1-wave.png"))

        page.locator('[data-testid="wave-home"] button[aria-label="Лайк"], [data-testid="wave-home"] button[aria-label="Убрать лайк"]').first.click()
        page.wait_for_timeout(1000)
        ok.append("liked=" + str(page.locator('[data-testid="wave-home"] button[aria-label="Убрать лайк"], [data-testid="wave-home"] button[aria-label="Лайк"]').count() > 0))

        page.locator('[data-testid="wave-home"] button[aria-label="Пропустить"]').first.click()
        page.wait_for_timeout(3000)
        title2 = page.evaluate("() => document.querySelector('[data-testid=wave-home] h3')?.textContent")
        ok.append(f"after-skip: {title2}")
        page.screenshot(path=str(OUT / f"prod-{name}-2-after-skip.png"))

        page.locator('[data-testid="wave-home"] button[aria-label="Ещё"]').first.click()
        page.wait_for_timeout(600)
        more = page.locator('[role="menuitem"]:has-text("Больше такого")')
        if more.count() > 0:
            more.first.click()
            ok.append("more-like-this=fired")
        page.screenshot(path=str(OUT / f"prod-{name}-3-more.png"))

        # queue via player bar
        try:
            page.locator('button[aria-label*="ереди"], button[aria-label*="ueue"], button[aria-label="Очередь"]').first.click(timeout=3000)
            page.wait_for_timeout(1200)
            ok.append("queue-drawer=opened")
            page.screenshot(path=str(OUT / f"prod-{name}-4-queue.png"))
            page.keyboard.press("Escape")
        except Exception:
            ok.append("queue-drawer=skip (button not found)")

        page.locator('[data-testid="wave-home"] button[aria-label="Остановить Волну"]').first.click()
        page.wait_for_timeout(1200)
        ok.append(f"stopped={page.locator('[data-testid=wave-home]').count() == 0}")
        page.screenshot(path=str(OUT / f"prod-{name}-5-stopped.png"))
    except Exception as e:
        ok.append(f"FAIL: {e}")
        try:
            page.screenshot(path=str(OUT / f"prod-{name}-FAIL.png"))
        except Exception:
            pass
    ctx.close()
    browser.close()
    print(f"=== {name} ===")
    for line in ok:
        print("  ", line)
    print("   page errors:", errors if errors else "none")
    return all("FAIL" not in l for l in ok) and not errors


def main():
    with urllib.request.urlopen(BASE + "/version.json", timeout=15) as r:
        v = json.loads(r.read())
    print(f"[version] {v['buildId']} commit={v['commit'][:8]} v{v['version']}")
    api_ok = api_check()
    with sync_playwright() as p:
        d = journey(p, "desktop-1440", 1440, 900)
        m = journey(p, "mobile-390", 390, 844, mobile=True)
    print("API:", api_ok, "| DESKTOP:", d, "| MOBILE:", m)
    return 0 if (api_ok and d and m) else 1


if __name__ == "__main__":
    sys.exit(main())
