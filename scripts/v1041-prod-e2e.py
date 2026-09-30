#!/usr/bin/env python3
"""V10.4.1 — PRODUCTION E2E on https://mq1.vercel.app (mq-build-b3141f2c).

Per the V10.4.1 spec:
  Desktop 1440x900 Volume Popup: open / slider / number inside / drag /
    mute / unmute / Escape / outside click
  Mobile 390x844 Volume: open / number inside / slider inside / drag /
    mute/unmute / Escape / outside click
  Capsule: ArrowUp +5 / ArrowDown -5 (trusted)
  Mobile: swipe-down -> exit animation -> unmount (document.getAnimations)
  Desktop: no double-tap hint
"""
import json
import sys

from playwright.sync_api import sync_playwright

BASE = "https://mq1.vercel.app"
OUT = "/home/z/my-project/download/qa-v10.4.1"
VOLBTN = 'button[aria-label^="Громкость:"]'


def demo_login(page):
    btn = page.get_by_role("button", name="Демо", exact=False)
    try:
        btn.wait_for(state="visible", timeout=12000)
        btn.click()
        page.wait_for_timeout(4500)
        page.evaluate("() => localStorage.setItem('mq-tour-complete','true')")
        return True
    except Exception:
        return False


def ensure_current_track(page, timeout=20000):
    import time
    deadline = time.time() + timeout / 1000
    while time.time() < deadline:
        if page.locator('button[aria-label="Открыть полный плеер"]').count() > 0:
            return True
        if page.locator('button[aria-label="Открыть плеер"]').count() > 0:
            return True
        b = page.locator('button[aria-label="Продолжить"]').first
        if b.count() > 0:
            try:
                b.click(timeout=2000); page.wait_for_timeout(2500)
            except Exception:
                pass
        listen = page.locator('button[aria-label*="Слушать"]').first
        if listen.count() > 0:
            try:
                listen.click(timeout=2000); page.wait_for_timeout(2500)
            except Exception:
                pass
        page.wait_for_timeout(1000)
    return False


def vol_by_btn(page):
    return page.evaluate(
        "() => { const b=[...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||'').startsWith('Громкость:')); return b? parseInt(b.getAttribute('aria-label').match(/(\\d+)/)?.[1] ?? '-1') : -1; }"
    )


def set_popup_input(page, v):
    page.evaluate(
        """(v) => {
        const pp = document.querySelector('[data-mq-volpopup]');
        const input = pp.querySelector('input[type="range"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
        setter.call(input, String(v)); input.dispatchEvent(new Event('input',{bubbles:true}));
    }""", v)


def popup_inside(page):
    return page.evaluate("""() => {
      const pp = document.querySelector('[data-mq-volpopup]');
      if (!pp) return {error: 'no popup'};
      const input = pp.querySelector('input[type="range"]');
      const val = [...pp.querySelectorAll('span')].find(s => /font-mono/.test(s.className));
      const icon = pp.querySelector('button');
      const R = el => el.getBoundingClientRect();
      return {
        popup: {w: R(pp).width, h: R(pp).height, right: R(pp).right},
        valueRight: R(val).right, valueText: val.textContent,
        valueInside: R(val).right <= R(pp).right,
        sliderRight: R(input).right,
        sliderInside: R(input).right <= R(pp).right,
        iconLeft: R(icon).left, iconInside: R(icon).left >= R(pp).left,
      };
    }""")


def popup_battery(page, r):
    """open / inside / drag(set) / mute / unmute / Escape / outside click."""
    lbl = page.locator(VOLBTN).first.get_attribute("aria-label")
    page.locator(VOLBTN).first.click(timeout=8000)
    page.wait_for_timeout(800)
    r["open"] = page.evaluate("!!document.querySelector('[data-mq-volpopup]')")
    r["inside"] = popup_inside(page)
    set_popup_input(page, 37)
    page.wait_for_timeout(500)
    r["dragTo37"] = vol_by_btn(page)
    r["popupStaysAfterDrag"] = page.evaluate("!!document.querySelector('[data-mq-volpopup]')")
    page.locator('[data-mq-volpopup] button[aria-label*="звук"]').first.click()
    page.wait_for_timeout(350)
    r["mute"] = vol_by_btn(page)
    page.locator('[data-mq-volpopup] button[aria-label*="звук"]').first.click()
    page.wait_for_timeout(350)
    r["unmuteRestores"] = vol_by_btn(page)
    # Escape (slider focused = the harder path)
    page.evaluate("document.querySelector('[data-mq-volpopup] input').focus()")
    page.keyboard.press("Escape")
    page.wait_for_timeout(600)
    r["escapeCloses"] = not page.evaluate("!!document.querySelector('[data-mq-volpopup]')")
    r["playerStaysAfterEscape"] = page.evaluate(
        '!!document.querySelector(\'[role=dialog][aria-label^="Полноэкранный плеер"]\')'
    )
    # outside click — INSIDE the viewport (mobile is 390 wide!), on the
    # artwork area covered by the fixed close-overlay
    lbl = page.locator(VOLBTN).first.get_attribute("aria-label")
    page.locator(VOLBTN).first.click(timeout=8000)
    page.wait_for_timeout(700)
    try:
        page.touchscreen.tap(195, 250)
    except Exception:
        page.mouse.click(195, 250)
    page.wait_for_timeout(700)
    r["outsideClickCloses"] = not page.evaluate("!!document.querySelector('[data-mq-volpopup]')")


def run_desktop(pw):
    r = {"case": "PROD-desktop-1440x900"}
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(3500)
    r["demoLogin"] = demo_login(page)
    ensure_current_track(page)

    # ── CLASSIC: no double-tap hint ──
    try:
        page.locator('button[aria-label="Открыть полный плеер"]').first.click(timeout=10000)
        page.wait_for_timeout(1800)
        r["classicHintAtOpen"] = page.evaluate("document.body.innerText.includes('двойной тап')")
        page.wait_for_timeout(4200)
        r["classicHintAt4s"] = page.evaluate("document.body.innerText.includes('двойной тап')")
        page.screenshot(path=f"{OUT}/prod-01-desktop-classic-nohint.png")
        page.keyboard.press("Escape")
        page.wait_for_timeout(800)
    except Exception as e:
        r["classicError"] = str(e)[:80]

    # ── SPATIAL: volume popup battery ──
    try:
        page.locator('button[aria-label="Настройки"]').first.click(timeout=10000)
        page.wait_for_timeout(1800)
        page.locator('button:has-text("Оформление")').first.click(timeout=10000)
        page.wait_for_timeout(1200)
        page.locator('[data-mq-setting="full-player-mode"] [role="radio"]').nth(1).click(timeout=10000)
        page.wait_for_timeout(800)
        page.locator('button[aria-label="MQ — на главную"], button[aria-label*="на главную"]').first.click(timeout=10000)
        page.wait_for_timeout(1500)
        page.locator('button[aria-label="Открыть полный плеер"]').first.click(timeout=10000)
        page.wait_for_timeout(2000)
        r["spatialMarks"] = page.evaluate("document.querySelectorAll('[data-mq-spatial]').length")
        popup_battery(page, r)
        # reopen for the AFTER screenshot at 37
        lbl = page.locator(VOLBTN).first.get_attribute("aria-label")
        page.locator(VOLBTN).first.click(timeout=8000)
        page.wait_for_timeout(700)
        set_popup_input(page, 27)
        page.wait_for_timeout(500)
        page.screenshot(path=f"{OUT}/prod-02-desktop-spatial-popup.png")
        r["screenshotInside27"] = popup_inside(page)
    except Exception as e:
        r["spatialError"] = str(e)[:90]

    r["pageErrors"] = errors
    browser.close()
    return r


def run_capsule(pw):
    r = {"case": "PROD-capsule-1440x900"}
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(3500)
    demo_login(page)
    ensure_current_track(page)
    slider = page.locator('div[role="slider"][aria-label="Громкость"]').first
    slider.wait_for(state="visible", timeout=10000)

    def vol():
        return int(slider.get_attribute("aria-valuenow"))

    slider.focus()
    page.wait_for_timeout(200)
    v0 = vol()
    page.keyboard.press("ArrowUp"); page.wait_for_timeout(300)
    v1 = vol()
    page.keyboard.press("ArrowUp"); page.wait_for_timeout(300)
    v2 = vol()
    page.keyboard.press("ArrowDown"); page.wait_for_timeout(300)
    v3 = vol()
    page.keyboard.press("ArrowDown"); page.wait_for_timeout(300)
    v4 = vol()
    r["trustedSequence"] = {"start": v0, "up1": v1, "up2": v2, "down1": v3, "down2": v4}
    r["exactly5each"] = (v1 - v0 == 5) and (v2 - v1 == 5) and (v3 - v2 == -5) and (v4 - v3 == -5)
    r["net80_80"] = (v4 - v0 == 0)
    r["pageErrors"] = errors
    browser.close()
    return r


def run_mobile(pw):
    r = {"case": "PROD-mobile-390x844"}
    iphone = dict(pw.devices["iPhone 14"])
    iphone["viewport"] = {"width": 390, "height": 844}
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context(**iphone)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(3500)
    demo_login(page)
    ensure_current_track(page)
    try:
        page.locator('button[aria-label="Открыть плеер"]').first.click(timeout=10000)
        page.wait_for_timeout(2000)
    except Exception as e:
        r["openError"] = str(e)[:80]
        r["pageErrors"] = errors
        browser.close()
        return r
    r["playerOpen"] = page.evaluate(
        '!!document.querySelector(\'[role=dialog][aria-label^="Полноэкранный плеер"]\')'
    )

    # ── volume popup battery ──
    popup_battery(page, r)
    try:
        lbl = page.locator(VOLBTN).first.get_attribute("aria-label")
        page.locator(VOLBTN).first.click(timeout=8000)
        page.wait_for_timeout(700)
        set_popup_input(page, 27)
        page.wait_for_timeout(500)
        page.screenshot(path=f"{OUT}/prod-03-mobile-popup.png")
    except Exception as e:
        r["shotError"] = str(e)[:70]

    # ── swipe-down exit animation ──
    try:
        if page.evaluate("!!document.querySelector('[data-mq-volpopup]')"):
            page.keyboard.press("Escape")
            page.wait_for_timeout(600)
        page.evaluate("""() => {
          window.__animLog = [];
          document.addEventListener('animationstart', (e) => {
            window.__animLog.push({name: e.animationName, t: Math.round(performance.now())});
          }, true);
        }""")
        art = page.locator('[data-mq-artwork]')
        box = art.bounding_box()
        cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        cdp = page.context.new_cdp_session(page)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": cx, "y": cy}]})
        for i in range(1, 9):
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": cx, "y": cy + 340 * i / 8}]})
            page.wait_for_timeout(16)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        page.wait_for_timeout(60)
        r["swipeMidFlight"] = page.evaluate("""() => {
          const root = document.querySelector('[role=dialog][aria-label^="Полноэкранный плеер"]');
          const anims = document.getAnimations().map(a => a.animationName).filter(Boolean);
          return {
            rootAnim: root ? getComputedStyle(root).animationName : 'GONE',
            rootTransform: root ? getComputedStyle(root).transform.slice(0, 44) : 'GONE',
            liveAnims: anims,
          };
        }""")
        page.screenshot(path=f"{OUT}/prod-04-mobile-swipe-midflight.png")
        page.wait_for_timeout(800)
        r["swipeAnimLog"] = [a["name"] for a in page.evaluate("window.__animLog")]
        r["swipeHasSlideDown"] = "mqFtSlideDown" in r["swipeAnimLog"]
        r["swipeUnmounted"] = not page.evaluate(
            '!!document.querySelector(\'[role=dialog][aria-label^="Полноэкранный плеер"]\')'
        )
    except Exception as e:
        r["swipeError"] = str(e)[:80]

    r["pageErrors"] = errors
    browser.close()
    return r


def main():
    with sync_playwright() as pw:
        out = {"production": open("/dev/null").read() if False else requests_version()}
        out["desktop_classic_spatial"] = run_desktop(pw)
        out["capsule"] = run_capsule(pw)
        out["mobile"] = run_mobile(pw)
    path = f"{OUT}/prod-e2e.json"
    with open(path, "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"\nSAVED: {path}", file=sys.stderr)


def requests_version():
    import urllib.request
    with urllib.request.urlopen(f"{BASE}/version.json", timeout=10) as resp:
        return json.loads(resp.read().decode())


if __name__ == "__main__":
    main()
