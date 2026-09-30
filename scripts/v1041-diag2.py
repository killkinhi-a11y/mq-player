#!/usr/bin/env python3
"""V10.4.1 — diag2: desktop settings -> spatial radio flow."""
import json
import sys

sys.path.insert(0, "/home/z/my-project/scripts")
from v1041_server import start_server, stop_server
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3112"
OUT = "/home/z/my-project/download/qa-v10.4.1"


def main():
    proc, _ = start_server()
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            page = ctx.new_page()
            logs = []
            page.goto(BASE, wait_until="domcontentloaded")
            page.wait_for_timeout(2500)
            btn = page.get_by_role("button", name="Демо", exact=False)
            btn.wait_for(state="visible", timeout=8000)
            btn.click()
            page.wait_for_timeout(4000)

            matches = page.evaluate(
                """() => ['button[aria-label="Настройки"]','button[title="Настройки"]']
                .map(s => s + ' => ' + document.querySelectorAll(s).length)"""
            )
            logs.append(f"matches={matches}")

            settings_btn = page.locator(
                'button[aria-label="Настройки"], button[title="Настройки"]'
            ).first
            settings_btn.click(timeout=8000)
            page.wait_for_timeout(2000)
            page.screenshot(path=f"{OUT}/diag2-after-settings-click.png")
            logs.append(f"url={page.url}")
            logs.append(
                "radiogroups="
                + str(page.evaluate("document.querySelectorAll('[data-mq-setting]').length"))
            )
            names = page.evaluate(
                "() => [...document.querySelectorAll('[data-mq-setting]')].map(e => e.getAttribute('data-mq-setting'))"
            )
            logs.append(f"settingNames={names}")
            print(json.dumps({"logs": logs}, ensure_ascii=False, indent=1))
            browser.close()
    finally:
        stop_server(proc)


if __name__ == "__main__":
    main()
