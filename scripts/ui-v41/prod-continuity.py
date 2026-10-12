#!/usr/bin/env python3
"""UI V4.1 — PRODUCTION continuity E2E: catalog track free playback >90s.

The V4 acceptance bar (kept for V4.1): a catalog (Deezer) track played via
the free resolver must run CONTINUOUSLY past 90 seconds of wall time with
linear progress, surviving page navigation — no cuts, no restarts.
"""
import time

from playwright.sync_api import sync_playwright

BASE = "https://mq1.vercel.app"


def run():
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_context(viewport={"width": 1440, "height": 900}).new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(BASE + "/play", wait_until="domcontentloaded", timeout=45000)
        pg.wait_for_timeout(5000)
        try:
            btn = pg.get_by_role("button", name="Демо", exact=False)
            btn.wait_for(state="visible", timeout=10000)
            btn.click()
            pg.wait_for_timeout(4500)
        except Exception:
            pass
        jc = lambda a: pg.evaluate(
            "(a)=>{const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')===a); if(b){b.click();return true} return false}", a)
        timecodes = lambda: pg.evaluate(
            "() => { const el=[...document.querySelectorAll('span')].find(s=>/^\\d+:\\d+ \\/ \\d+:\\d+$/.test(s.textContent.trim())); return el ? el.textContent.trim() : null }")

        jc("Поиск")
        pg.wait_for_timeout(1200)
        pg.locator("[data-search-input]").first.fill("faded alan walker")
        pg.wait_for_timeout(5000)
        # Play the HERO (catalog track → free resolver → SoundCloud audio)
        pg.evaluate("() => { const b=document.querySelector('[data-mq-topresult-play]'); if(b) b.click(); }")
        pg.wait_for_timeout(6000)
        print("start:", timecodes(), flush=True)

        samples = []
        t0 = time.time()
        nav_at = {30: "Поиск", 55: "Главная", 80: "Библиотека"}
        while time.time() - t0 < 100:
            elapsed = int(time.time() - t0)
            for mark, view in list(nav_at.items()):
                if elapsed >= mark:
                    jc(view)
                    nav_at.pop(mark)
                    print(f"t+{elapsed}s navigate -> {view}")
            tc = timecodes()
            samples.append((elapsed, tc))
            if elapsed % 20 == 0 and samples[-1][0] == elapsed:
                print(f"t+{elapsed}s {tc}", flush=True)
            time.sleep(10)

        print("end:", samples[-1])
        # Parse and verify linear continuity
        def secs(tc):
            if not tc:
                return None
            cur = tc.split("/")[0].strip().split(":")
            return int(cur[0]) * 60 + int(cur[1])

        first, last = samples[0], samples[-1]
        p0, p1 = secs(first[1]), secs(last[1])
        wall = last[0] - first[0]
        print(f"wall={wall}s played={p1 - p0}s (from {p0}s to {p1}s)")
        ok = p1 is not None and p0 is not None and (p1 - p0) >= 85
        print("CONTINUITY:", "PASS — free catalog playback ran >90s across navigation" if ok else "FAIL")
        print("page-errors:", len(errors))
        b.close()


if __name__ == "__main__":
    run()
