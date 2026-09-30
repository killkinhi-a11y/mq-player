#!/usr/bin/env python3
"""V10.4.1 — diagnostic: why doesn't the full player open?"""
import json
import os
import sys

sys.path.insert(0, "/home/z/my-project/scripts")
from v1041_server import start_server, stop_server
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3112"
OUT = "/home/z/my-project/download/qa-v10.4.1"
os.makedirs(OUT, exist_ok=True)


def dump_state(page, label):
    try:
        raw = json.loads(page.evaluate("localStorage.getItem('mq-store-v8')") or "{}")
        st = raw.get("state", {})
        return {
            "label": label,
            "fullPlayerMode": st.get("fullPlayerMode"),
            "currentTrack": (st.get("currentTrack") or {}).get("title"),
            "isFullTrackViewOpen": st.get("isFullTrackViewOpen"),
            "url": page.url,
        }
    except Exception as e:
        return {"label": label, "err": str(e)}


def button_labels(page, limit=40):
    return page.evaluate(
        """() => [...document.querySelectorAll('button')]
         .filter(b => b.offsetParent !== null)
         .map(b => b.getAttribute('aria-label') || b.title || b.textContent.trim().slice(0,30))
         .filter(x => x).slice(0, %d)""" % limit
    )


def main():
    proc, _ = start_server()
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            page = ctx.new_page()
            logs = []
            page.goto(BASE, wait_until="domcontentloaded")
            page.wait_for_timeout(4000)
            page.screenshot(path=f"{OUT}/diag-01-fresh.png")

            demo = page.get_by_role("button", name="Демо", exact=False)
            try:
                demo.wait_for(state="visible", timeout=6000)
                demo.click()
                page.wait_for_timeout(4000)
                logs.append("demo-clicked")
            except Exception as e:
                logs.append(f"demo-missing: {str(e)[:60]}")
            page.screenshot(path=f"{OUT}/diag-02-after-demo.png")
            logs.append(dump_state(page, "after-demo"))
            labels1 = button_labels(page)

            # patch spatial
            page.evaluate("""() => {
                const raw = JSON.parse(localStorage.getItem('mq-store-v8') || '{}');
                raw.state = raw.state || {};
                raw.state.fullPlayerMode = 'spatial';
                localStorage.setItem('mq-store-v8', JSON.stringify(raw));
            }""")
            page.reload(wait_until="domcontentloaded")
            page.wait_for_timeout(4000)
            demo = page.get_by_role("button", name="Демо", exact=False)
            try:
                demo.wait_for(state="visible", timeout=6000)
                demo.click()
                page.wait_for_timeout(4000)
                logs.append("demo-2-clicked")
            except Exception:
                logs.append("demo-2-missing")
            logs.append(dump_state(page, "after-reload+demo"))
            page.screenshot(path=f"{OUT}/diag-03-after-reload.png")
            labels2 = button_labels(page)

            # try play
            try:
                listen = page.locator('button[aria-label*="Слушать"]').first
                listen.click(timeout=5000)
                page.wait_for_timeout(3000)
                logs.append("listen-clicked")
            except Exception as e:
                logs.append(f"listen-fail: {str(e)[:60]}")
            logs.append(dump_state(page, "after-listen"))

            # try open full player
            try:
                ob = page.locator('button[aria-label="Открыть полный плеер"]').first
                ob.click(timeout=5000)
                page.wait_for_timeout(2000)
                logs.append("openbtn-clicked")
            except Exception as e:
                logs.append(f"openbtn-fail: {str(e)[:60]}")
            logs.append(dump_state(page, "after-open"))
            page.screenshot(path=f"{OUT}/diag-04-after-open.png")
            labels3 = button_labels(page)
            logs.append(f"spatialMarks={page.evaluate('document.querySelectorAll(\'[data-mq-spatial]\').length')}")

            out = {"logs": logs,
                   "labelsAfterDemo": labels1,
                   "labelsAfterReload": labels2,
                   "labelsAfterOpen": labels3}
            print(json.dumps(out, ensure_ascii=False, indent=1))
            browser.close()
    finally:
        stop_server(proc)


if __name__ == "__main__":
    main()
