#!/usr/bin/env python3
"""Debug local wave journey: what's on the page, what buttons exist."""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    req_failures = []
    page.on("requestfailed", lambda r: req_failures.append(f"{r.method} {r.url[:110]} -> {r.failure}"))
    page.on("console", lambda m: req_failures.append(f"console.{m.type}: {m.text[:160]}") if m.type in ("error", "warning") else None)
    page.goto(BASE, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(6000)
    # dump state
    info = page.evaluate("""() => ({
      title: document.title,
      bodyText: document.body.innerText.slice(0, 600),
      buttons: [...document.querySelectorAll('button')].slice(0, 25).map(b => ({
        label: b.getAttribute('aria-label') || b.textContent?.trim().slice(0, 30),
        visible: !!(b.offsetParent),
      })),
      splash: !!document.querySelector('[data-mq-splash], .mq-splash'),
      imgCount: document.images.length,
    })""")
    print("TITLE:", info["title"])
    print("BODY:", info["bodyText"][:400].replace("\\n", " | "))
    print("BUTTONS:", [b for b in info["buttons"] if b["visible"]][:15])
    page.screenshot(path="/tmp/debug-local.png")
    print("req failures / console:", req_failures[:15])
    ctx.close()
    browser.close()
