#!/usr/bin/env python3
"""MQ WAVE V2 — AFTER screenshots (local standalone build).

Same journey as the BEFORE script (demo → start Wave → settle → shot) at:
  desktop 1440x900, 1920x1080; mobile 390x844, 430x932.

Extra checks per viewport:
  - document.body overflow-x (must be false)
  - wave section box (width/height)
  - artwork box (the dominant object)
  - all wave controls ≥ 44px
  - page errors collected

Output: /home/z/my-project/download/qa-wave-v2/after-*.png + after-report.json
"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = Path("/home/z/my-project/download/qa-wave-v2")
OUT.mkdir(parents=True, exist_ok=True)

VIEWPORTS = [
    ("desktop-1440", 1440, 900),
    ("desktop-1920", 1920, 1080),
    ("mobile-390", 390, 844),
    ("mobile-430", 430, 932),
]

MEASURE_JS = """
() => {
  const wave = document.querySelector('[data-testid="wave-home"]');
  if (!wave) return { error: 'no wave-home' };
  const wr = wave.getBoundingClientRect();
  const art = wave.querySelector('.mq-wave-art');
  const ar = art ? art.getBoundingClientRect() : null;
  const buttons = [...wave.querySelectorAll('button')].map(b => {
    const r = b.getBoundingClientRect();
    return { label: b.getAttribute('aria-label') || b.textContent?.slice(0, 20) || '?', w: Math.round(r.width), h: Math.round(r.height) };
  });
  const rows = [...wave.querySelectorAll('[data-testid="wave-next-up"] li')].map(li => {
    const r = li.getBoundingClientRect();
    return { h: Math.round(r.height) };
  });
  return {
    wave: { x: Math.round(wr.x), y: Math.round(wr.y), w: Math.round(wr.width), h: Math.round(wr.height) },
    artwork: ar ? { w: Math.round(ar.width), h: Math.round(ar.height) } : null,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    buttons, nextRows: rows,
    reasonText: wave.querySelector('[data-testid="wave-current-reason"]')?.textContent?.trim() || null,
    upNextCount: rows.length,
  };
}
"""


def start_wave(page):
    page.evaluate("() => { try { localStorage.setItem('mq-tour-complete','true'); } catch(e){} }")
    for label in ["Запустить Волну", "Волна"]:
        btn = page.locator(f'button[aria-label="{label}"]').first
        if btn.count() > 0 and btn.is_visible():
            btn.click(timeout=4000)
            break
    page.wait_for_selector('[data-testid="wave-home"]', timeout=30000)
    page.wait_for_timeout(4000)


def run():
    report = {}
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for name, w, h in VIEWPORTS:
            ctx = browser.new_context(viewport={"width": w, "height": h},
                                      device_scale_factor=2 if w < 500 else 1,
                                      is_mobile=w < 500, has_touch=w < 500)
            page = ctx.new_page()
            page.on("pageerror", lambda e, n=name: errors.append(f"{n}: {e}"))
            try:
                page.goto(BASE, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(2500)
                demo = page.get_by_role("button", name="Демо", exact=False)
                if demo.count() > 0 and demo.first.is_visible():
                    demo.first.click()
                    page.wait_for_timeout(4500)
                start_wave(page)
                page.screenshot(path=str(OUT / f"after-{name}.png"), full_page=False)
                page.screenshot(path=str(OUT / f"after-{name}-full.png"), full_page=True)
                m = page.evaluate(MEASURE_JS)
                report[name] = m
                print(f"[ok] {name}: artwork={m.get('artwork')} overflowX={m.get('overflowX')} next={m.get('upNextCount')}")
            except Exception as e:
                print(f"[FAIL] {name}: {e}")
                report[name] = { "error": str(e) }
                try:
                    page.screenshot(path=str(OUT / f"after-{name}-FAIL.png"))
                except Exception:
                    pass
            ctx.close()
        browser.close()
    report["page_errors"] = errors
    (OUT / "after-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print("page errors:", errors if errors else "none")
    return 0


if __name__ == "__main__":
    sys.exit(run())
