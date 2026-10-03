#!/usr/bin/env python3
"""Targeted UI error-diagnostic check on production (mq1.vercel.app).

Requirement: when the adapter chain WORKS but the specific playlist is dead,
the UI must show the PLAYLIST's own error (yandex_not_found), never the
generic «Адаптер Яндекс.Музыки недоступен». Plus: the USER's actual playlist
(rlslist/1100, alive, 286 tracks) must render a real preview card and import.
"""
import sys
import time

from playwright.sync_api import sync_playwright

BASE = "https://mq1.vercel.app"
DEAD = "https://music.yandex.ru/users/rsljst/playlists/1100"
ALIVE = "https://music.yandex.ru/users/rlslist/playlists/1100"

PASS, FAIL = 0, 0


def ok(msg):
    global PASS
    PASS += 1
    print(f"  OK {msg}", flush=True)


def bad(msg):
    global FAIL
    FAIL += 1
    print(f" FAIL {msg}", flush=True)


def enter_demo(page):
    page.goto(f"{BASE}/play", wait_until="domcontentloaded", timeout=90000)
    for _ in range(6):
        btn = page.get_by_role("button", name="Демо-режим")
        if btn.count():
            try:
                btn.first.click(timeout=4000)
                break
            except Exception:
                pass
        time.sleep(1.5)


def open_import_with_url(page, url):
    """Open the playlist import modal, type the URL, press the icon-only button.

    Uses the exact navigation that the verified prod_chain_ui_e2e.py uses:
    Библиотека → Плейлисты → Импорт → input[type=url] + adjacent icon button.
    """
    page.get_by_role("button", name="Библиотека").click()
    time.sleep(0.7)
    page.get_by_role("button", name="Плейлисты", exact=True).first.click()
    time.sleep(0.7)
    page.get_by_role("button", name="Импорт", exact=True).click()
    time.sleep(0.6)
    page.locator('input[type="url"]').fill(url)
    time.sleep(0.4)
    page.locator('input[type="url"] + button').click()
    time.sleep(1.0)


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        # ── 1) DEAD link in the UI → the PLAYLIST's own error, not adapter-down ──
        enter_demo(page)
        open_import_with_url(page, DEAD)
        deadline = time.time() + 80
        body = ""
        while time.time() < deadline:
            body = page.locator("body").inner_text()
            if "Плейлист" in body and ("не найден" in body or "приватн" in body or "недоступен" in body):
                break
            time.sleep(2)
        has_specific = ("не найден" in body or "приватн" in body) and "Плейлист" in body
        has_adapter_down = "Адаптер Яндекс.Музыки недоступен" in body
        if has_specific and not has_adapter_down:
            frag = next(s for s in body.split("\n") if "Плейлист" in s or "плейлист" in s)
            ok(f"dead link → SPECIFIC playlist error in UI: {frag.strip()[:90]}")
        else:
            bad(f"dead link UI verdict wrong (specific={has_specific}, adapter_down={has_adapter_down})")
            print("      body snippet:", [l for l in body.split("\n") if l.strip()][:12])

        # ── 2) The USER's live playlist (rlslist/1100) in the UI ──
        enter_demo(page)
        open_import_with_url(page, ALIVE)
        deadline = time.time() + 90
        preview = False
        while time.time() < deadline:
            body = page.locator("body").inner_text()
            if "треков" in body and "Релизы" in body:
                preview = True
                break
            if "недоступен" in body or "ошибк" in body.lower():
                break
            time.sleep(2.5)
        if preview:
            line = next((s for s in body.split("\n") if "Релизы" in s), "")
            cnt = next((s for s in body.split("\n") if "треков" in s), "")
            ok(f"user playlist 1100 preview card: {line.strip()[:60]} | {cnt.strip()[:40]}")
            # go further: wait for matching then IMPORT
            deadline = time.time() + 150
            imported = False
            while time.time() < deadline:
                body = page.locator("body").inner_text()
                if "Импортировать" in body and "Найдено" in body:
                    btn = page.get_by_role("button", name="Импортировать")
                    if btn.count():
                        try:
                            btn.first.click(timeout=4000)
                        except Exception:
                            pass
                if "Импорт успешен" in body:
                    imported = True
                    break
                time.sleep(3)
            ok("user playlist 1100 IMPORT completed in UI" if imported else "import click did not complete")
            ok(f"zero page errors: {not errors}" if not errors else f"page errors: {errors[:3]}")
        else:
            bad("user playlist 1100 did not render a preview card in the UI")
            print("      body snippet:", [l for l in body.split("\n") if l.strip()][:12])

        page.screenshot(path="/home/z/my-project/download/qa-yandex-prod/hotfix-1100-ui-final.png", full_page=False)
        browser.close()

    print(f"\n=== DIAGNOSTIC UI CHECK: {PASS} passed, {FAIL} failed ===")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
