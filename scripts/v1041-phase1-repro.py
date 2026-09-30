#!/usr/bin/env python3
"""V10.4.1 PHASE 1 — Volume popup overflow reproduction (BEFORE fix). v2

Desktop Spatial: demo login -> Settings radiogroup -> Spatial -> home ->
open full player -> open volume popup -> set 27 -> measure + screenshot.
Mobile: demo login -> open full player -> open volume popup -> set 27 ->
measure + screenshot.
"""
import json
import os
import sys

sys.path.insert(0, "/home/z/my-project/scripts")
from v1041_server import start_server, stop_server
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3112"
OUT_DIR = "/home/z/my-project/download/qa-v10.4.1"
os.makedirs(OUT_DIR, exist_ok=True)

MEASURE_JS = """
() => {
  const pp = document.querySelector('[data-mq-volpopup]');
  if (!pp) return { error: 'NO POPUP OPEN' };
  const input = pp.querySelector('input[type="range"]');
  const icon = pp.querySelector('button');
  const spans = [...pp.querySelectorAll('span')];
  const value = spans.find(s => /font-mono/.test(s.className)) || spans[spans.length-1];
  const row = pp.firstElementChild;
  const R = (el) => el ? el.getBoundingClientRect().toJSON() : null;
  const S = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      width: cs.width, minWidth: cs.minWidth, maxWidth: cs.maxWidth,
      flex: cs.flex, flexGrow: cs.flexGrow, flexShrink: cs.flexShrink, flexBasis: cs.flexBasis,
      boxSizing: cs.boxSizing, overflow: cs.overflow, display: cs.display,
      padding: cs.padding, margin: cs.margin,
    };
  };
  const n = (x) => (typeof x === 'number' ? Math.round(x*100)/100 : x);
  const ppR = R(pp), inR = R(input), icR = R(icon), vaR = R(value), roR = R(row);
  return {
    viewport: { w: innerWidth, h: innerHeight },
    rects: {
      popup: ppR && {x:n(ppR.x),y:n(ppR.y),w:n(ppR.width),h:n(ppR.height),right:n(ppR.right),bottom:n(ppR.bottom)},
      icon:   icR && {x:n(icR.x),y:n(icR.y),w:n(icR.width),h:n(icR.height),right:n(icR.right)},
      slider: inR && {x:n(inR.x),y:n(inR.y),w:n(inR.width),h:n(inR.height),right:n(inR.right)},
      value:  vaR && {x:n(vaR.x),y:n(vaR.y),w:n(vaR.width),h:n(vaR.height),right:n(vaR.right),text:value.textContent},
      row:    roR && {x:n(roR.x),y:n(roR.y),w:n(roR.width),h:n(roR.height),right:n(roR.right)},
    },
    styles: { popup: S(pp), icon: S(icon), slider: S(input), value: S(value), row: S(row) },
    scroll: {
      popup: { scrollWidth: pp.scrollWidth, clientWidth: pp.clientWidth, delta: pp.scrollWidth - pp.clientWidth },
      row: row && { scrollWidth: row.scrollWidth, clientWidth: row.clientWidth, delta: row.scrollWidth - row.clientWidth },
    },
    containment: {
      sliderInsideRight: inR ? inR.right <= ppR.right + 0.5 : null,
      valueInsideRight: vaR ? vaR.right <= ppR.right + 0.5 : null,
      iconInsideLeft: icR ? icR.left >= ppR.left - 0.5 : null,
      sliderInsideLeft: inR ? inR.left >= ppR.left - 0.5 : null,
      valueInsideBottom: vaR ? vaR.bottom <= ppR.bottom + 0.5 : null,
      valueOverflowPx: vaR ? n(vaR.right - ppR.right) : null,
      sliderOverflowPx: inR ? n(inR.right - ppR.right) : null,
    },
    valueText: value ? value.textContent : null,
  };
}
"""

SET_VOL_JS = """
(v) => {
  const pp = document.querySelector('[data-mq-volpopup]');
  if (!pp) return 'no-popup';
  const input = pp.querySelector('input[type="range"]');
  if (!input) return 'no-input';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, String(v));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
}
"""


def demo_login(page):
    btn = page.get_by_role("button", name="Демо", exact=False)
    try:
        btn.wait_for(state="visible", timeout=8000)
        btn.click()
        page.wait_for_timeout(4000)
        return True
    except Exception:
        return False


def open_full_player(page, log, mobile=False):
    selectors = (
        ['button[aria-label="Открыть плеер"]', 'button[aria-label^="Открыть плеер:"]', '[data-mq-playerbar]']
        if mobile
        else ['button[aria-label="Открыть полный плеер"]', '[data-mq-playerbar]']
    )
    for sel in selectors:
        try:
            page.locator(sel).first.click(timeout=8000)
            page.wait_for_timeout(1800)
            log.append(f"open-fullplayer: clicked {sel}")
            return True
        except Exception as e:
            log.append(f"open-fullplayer: {sel} fail {str(e)[:60]}")
    return False


def open_volume_popup(page, log):
    try:
        page.locator('button[aria-label^="Громкость:"]').first.click(timeout=8000)
        page.wait_for_timeout(700)
    except Exception as e:
        log.append(f"volbtn: fail {str(e)[:70]}")
    return page.evaluate("!!document.querySelector('[data-mq-volpopup]')")


def run_desktop(pw, prefix="before"):
    log = []
    result = {"surface": "desktop-spatial-1440x900", "log": log}
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    log.append(f"demoLogin={demo_login(page)}")

    # switch to Spatial through the Settings UI (login resets persisted mode)
    try:
        settings_btn = page.locator(
            'button[aria-label="Настройки"], button[title="Настройки"]'
        ).first
        settings_btn.click(timeout=8000)
        page.wait_for_timeout(1500)
        # «Вид полного плеера» lives in the APPEARANCE tab
        page.locator('button:has-text("Оформление")').first.click(timeout=8000)
        page.wait_for_timeout(1200)
        rg = page.locator('[data-mq-setting="full-player-mode"] [role="radio"]').nth(1)
        rg.click(timeout=8000)
        page.wait_for_timeout(800)
        log.append("settings: spatial radio clicked")
        mode = page.evaluate(
            "() => { const s = JSON.parse(localStorage.getItem('mq-store-v8')||'{}').state||{}; return s.fullPlayerMode; }"
        )
        log.append(f"store mode now: {mode}")
        home_btn = page.locator(
            'button[aria-label="MQ — на главную"], button[aria-label*="на главную"], a:has-text("Главная")'
        ).first
        home_btn.click(timeout=8000)
        page.wait_for_timeout(1500)
    except Exception as e:
        log.append(f"settings-spatial: fail {str(e)[:90]}")

    open_full_player(page, log)
    result["spatialMarks"] = page.evaluate("document.querySelectorAll('[data-mq-spatial]').length")
    page.screenshot(path=f"{OUT_DIR}/diag-desktop-player-open.png")

    if open_volume_popup(page, log):
        page.evaluate(SET_VOL_JS, 27)
        page.wait_for_timeout(600)
        result["geometry"] = page.evaluate(MEASURE_JS)
        page.screenshot(path=f"{OUT_DIR}/{prefix}-desktop-spatial-popup.png")
        result["screenshot"] = f"{prefix}-desktop-spatial-popup.png"
    else:
        result["popupOpen"] = False
    result["pageErrors"] = errors
    browser.close()
    return result


def run_mobile(pw, prefix="before"):
    log = []
    result = {"surface": "mobile-390x844", "log": log}
    iphone = dict(pw.devices["iPhone 14"])
    iphone["viewport"] = {"width": 390, "height": 844}
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context(**iphone)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    log.append(f"demoLogin={demo_login(page)}")
    page.wait_for_timeout(2000)
    page.screenshot(path=f"{OUT_DIR}/diag-mobile-home.png")
    # dump visible button labels for debugging if the open button is missing
    labels = page.evaluate(
        "() => [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null)"
        ".map(b => b.getAttribute('aria-label') || b.title || '').filter(Boolean).slice(0, 30)"
    )
    log.append(f"visibleButtons={labels}")

    open_full_player(page, log, mobile=True)
    page.screenshot(path=f"{OUT_DIR}/diag-mobile-player-open.png")

    if open_volume_popup(page, log):
        page.evaluate(SET_VOL_JS, 27)
        page.wait_for_timeout(600)
        result["geometry"] = page.evaluate(MEASURE_JS)
        page.screenshot(path=f"{OUT_DIR}/{prefix}-mobile-popup.png")
        result["screenshot"] = f"{prefix}-mobile-popup.png"
    else:
        result["popupOpen"] = False
    result["pageErrors"] = errors
    browser.close()
    return result


def main():
    prefix = sys.argv[1] if len(sys.argv) > 1 else "before"
    proc, _ = start_server()
    try:
        with sync_playwright() as pw:
            out = {"build": open("/home/z/my-project/.next/BUILD_ID").read().strip()}
            out["desktop"] = run_desktop(pw, prefix)
            out["mobile"] = run_mobile(pw, prefix)
    finally:
        stop_server(proc)
    path = f"{OUT_DIR}/{prefix}-geometry.json"
    with open(path, "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"\nSAVED: {path}", file=sys.stderr)


if __name__ == "__main__":
    main()
