#!/usr/bin/env python3
"""V10.4.1 — focused: swipe-right fires prevTrack (double-swipe semantics)."""
import json
import sys

sys.path.insert(0, "/home/z/my-project/scripts")
from v1041_server import start_server, stop_server
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3112"


def demo_login(page):
    btn = page.get_by_role("button", name="Демо", exact=False)
    btn.wait_for(state="visible", timeout=8000)
    btn.click()
    page.wait_for_timeout(4000)


def swipe_h(page, x0, x1, y, steps=8):
    cdp = page.context.new_cdp_session(page)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y}]})
    for i in range(1, steps + 1):
        cdp.send("Input.dispatchTouchEvent", {
            "type": "touchMove",
            "touchPoints": [{"x": x0 + (x1 - x0) * i / steps, "y": y}],
        })
        page.wait_for_timeout(16)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})


def title(page):
    return page.evaluate("() => (document.querySelector('[role=dialog] h1') || {}).textContent || ''")


def main():
    proc, _ = start_server()
    try:
        with sync_playwright() as pw:
            iphone = dict(pw.devices["iPhone 14"])
            iphone["viewport"] = {"width": 390, "height": 844}
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context(**iphone)
            page = ctx.new_page()
            page.goto(BASE, wait_until="domcontentloaded")
            page.wait_for_timeout(2500)
            demo_login(page)
            page.locator('button[aria-label="Открыть плеер"]').first.click(timeout=8000)
            page.wait_for_timeout(1500)

            art = page.locator('[data-mq-artwork]')
            box = art.bounding_box()
            cy = box["y"] + box["height"] / 2

            # swipe LEFT -> next track
            swipe_h(page, 300, 20, cy)
            page.wait_for_timeout(800)
            t0 = title(page)
            # swipe RIGHT at pos>3s -> restart attempt (title may stay on WASM path)
            page.wait_for_timeout(4500)
            swipe_h(page, 90, 370, cy)
            page.wait_for_timeout(400)
            t1 = title(page)
            # swipe RIGHT again quickly (pos<3s after restart) -> real prev track
            swipe_h(page, 90, 370, cy)
            page.wait_for_timeout(800)
            t2 = title(page)
            # one more LEFT to prove next still fine
            swipe_h(page, 300, 20, cy)
            page.wait_for_timeout(800)
            t3 = title(page)

            out = {
                "afterSwipeLeft_next": t0,
                "afterSwipeRight1_posOver3s": t1,
                "afterSwipeRight2_posUnder3s_prev": t2,
                "afterSwipeLeftAgain_next": t3,
                "prevWorked": t2 != t1,
                "nextWorked": t0 != title(page) or t3 != t2,
                "playerStillOpen": page.evaluate(
                    '!!document.querySelector(\'[role=dialog][aria-label^="Полноэкранный плеер"]\')'
                ),
            }
            print(json.dumps(out, ensure_ascii=False, indent=1))
            browser.close()
    finally:
        stop_server(proc)


if __name__ == "__main__":
    main()
