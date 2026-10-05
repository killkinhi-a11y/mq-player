#!/usr/bin/env python3
"""MQ WAVE V2 — BEFORE screenshots (current production UI).

Captures the CURRENT Wave UI (pre-redesign) at 4 viewports:
  desktop 1440x900, 1920x1080; mobile 390x844, 430x932.

Flow per viewport: demo login → start Wave → wait for now-playing → shot.
Output: /home/z/my-project/download/qa-wave-v2/before-*.png
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "https://mq1.vercel.app"
OUT = Path("/home/z/my-project/download/qa-wave-v2")
OUT.mkdir(parents=True, exist_ok=True)

VIEWPORTS = [
    ("desktop-1440", 1440, 900),
    ("desktop-1920", 1920, 1080),
    ("mobile-390", 390, 844),
    ("mobile-430", 430, 932),
]


def start_wave(page):
    """Click the Wave CTA (header pill or hero CTA) and wait for WaveHome."""
    # dismiss tour if it appears
    page.evaluate("() => { try { localStorage.setItem('mq-tour-complete','true'); } catch(e){} }")
    # header pill (desktop) or hero CTA (mobile): both aria-label contains Волна
    for label in ["Запустить Волну", "Волна"]:
        btn = page.locator(f'button[aria-label="{label}"]').first
        if btn.count() > 0 and btn.is_visible():
            btn.click(timeout=4000)
            break
    # wait for the wave home block
    page.wait_for_selector('[data-testid="wave-home"]', timeout=25000)
    page.wait_for_timeout(3500)  # let tracks + artwork settle


def run():
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for name, w, h in VIEWPORTS:
            ctx = browser.new_context(viewport={"width": w, "height": h},
                                      device_scale_factor=2 if w < 500 else 1,
                                      is_mobile=w < 500, has_touch=w < 500)
            page = ctx.new_page()
            page.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
            try:
                page.goto(BASE, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(2500)
                demo = page.get_by_role("button", name="Демо", exact=False)
                if demo.count() > 0 and demo.first.is_visible():
                    demo.first.click()
                    page.wait_for_timeout(4500)
                start_wave(page)
                page.screenshot(path=str(OUT / f"before-{name}.png"), full_page=False)
                # full-page desktop shot for layout analysis
                page.screenshot(path=str(OUT / f"before-{name}-full.png"), full_page=True)
                print(f"[ok] {name}")
            except Exception as e:
                print(f"[FAIL] {name}: {e}")
                try:
                    page.screenshot(path=str(OUT / f"before-{name}-FAIL.png"))
                except Exception:
                    pass
            ctx.close()
        browser.close()
    print("page errors:", errors if errors else "none")


if __name__ == "__main__":
    sys.exit(run())
