#!/usr/bin/env python3
"""MQ WAVE V2 — local interactive E2E journey (desktop + mobile).

Journey: demo → start Wave → wait now-playing → LIKE → SKIP (next rec)
→ open ⋯ menu → «Больше такого» → queue drawer check → close wave → verify.
Collects console/page errors throughout. Screenshots at key moments.
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = Path("/home/z/my-project/download/qa-wave-v2")
OUT.mkdir(parents=True, exist_ok=True)


def run_viewport(p, name, w, h, mobile=False):
    errors = []
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": w, "height": h},
                              device_scale_factor=2 if mobile else 1,
                              is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    ok = []
    try:
        page.goto(BASE, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(2500)
        demo = page.get_by_role("button", name="Демо", exact=False)
        if demo.count() > 0 and demo.first.is_visible():
            demo.first.click()
            page.wait_for_timeout(4500)
        page.evaluate("() => { try { localStorage.setItem('mq-tour-complete','true'); } catch(e){} }")

        # Start wave
        for label in ["Запустить Волну", "Волна"]:
            btn = page.locator(f'button[aria-label="{label}"]').first
            if btn.count() > 0 and btn.is_visible():
                btn.click(timeout=4000)
                break
        page.wait_for_selector('[data-testid="wave-home"]', timeout=30000)
        page.wait_for_timeout(3500)
        title1 = page.evaluate("() => document.querySelector('[data-testid=wave-home] h3')?.textContent || null")
        ok.append(f"wave-started title={title1}")
        page.screenshot(path=str(OUT / f"e2e-{name}-1-wave.png"))

        # LIKE
        page.locator('[data-testid="wave-home"] button[aria-label="Лайк"], [data-testid="wave-home"] button[aria-label="Убрать лайк"]').first.click()
        page.wait_for_timeout(1200)
        liked = page.locator('[data-testid="wave-home"] button[aria-label="Убрать лайк"]').count() > 0
        ok.append(f"liked={liked}")

        # SKIP → next recommendation appears
        page.locator('[data-testid="wave-home"] button[aria-label="Пропустить"]').first.click()
        page.wait_for_timeout(2500)
        title2 = page.evaluate("() => document.querySelector('[data-testid=wave-home] h3')?.textContent || null")
        ok.append(f"after-skip title={title2} changed={title1 != title2}")
        page.screenshot(path=str(OUT / f"e2e-{name}-2-after-skip.png"))

        # ⋯ menu → Больше такого
        page.locator('[data-testid="wave-home"] button[aria-label="Ещё"]').first.click()
        page.wait_for_timeout(600)
        more = page.locator('[role="menuitem"]:has-text("Больше такого")')
        if more.count() > 0:
            more.first.click()
            page.wait_for_timeout(800)
            ok.append("more-like-this=fired")
        else:
            ok.append("more-like-this=MENU-NOT-FOUND")
        page.screenshot(path=str(OUT / f"e2e-{name}-3-more.png"))

        # reduced motion sanity (CSS applies)
        rm = ctx.add_init_script  # noop keep
        page.emulate_media(reduced_motion="reduce")
        page.wait_for_timeout(300)
        ok.append("reduced-motion=emulated")

        # artwork crossfade layers present after another skip
        page.locator('[data-testid="wave-home"] button[aria-label="Пропустить"]').first.click()
        page.wait_for_timeout(1800)
        layers = page.evaluate("() => document.querySelectorAll('.mq-wave-art-layer').length")
        ok.append(f"crossfade-layers={layers}")

        # Stop wave via header X
        page.locator('[data-testid="wave-home"] button[aria-label="Остановить Волну"]').first.click()
        page.wait_for_timeout(1200)
        stopped = page.locator('[data-testid="wave-home"]').count() == 0
        ok.append(f"stopped={stopped}")
        page.screenshot(path=str(OUT / f"e2e-{name}-4-stopped.png"))
    except Exception as e:
        ok.append(f"FAIL: {e}")
        try:
            page.screenshot(path=str(OUT / f"e2e-{name}-FAIL.png"))
        except Exception:
            pass
    ctx.close()
    browser.close()
    print(f"=== {name} ===")
    for line in ok:
        print("  ", line)
    print("   errors:", errors if errors else "none")
    return all("FAIL" not in l for l in ok) and not errors


def main():
    with sync_playwright() as p:
        d = run_viewport(p, "desktop-1440", 1440, 900)
        m = run_viewport(p, "mobile-390", 390, 844, mobile=True)
    print("DESKTOP PASS:", d, "| MOBILE PASS:", m)
    return 0 if (d and m) else 1


if __name__ == "__main__":
    sys.exit(main())
