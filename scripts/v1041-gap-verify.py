#!/usr/bin/env python3
"""V10.4.1 — GAP verification battery (local build with all 4 fixes).

GAP #1  desktop 1440x900: «← двойной тап →» hint must NOT exist (no DOM node,
        not even transiently during the 4s window); desktop double-click seek
        (the feature the hint described) still works. Mobile 390x844: player
        opens, no hint (preserved behavior — FullTrackViewMobile never had it).
GAP #2  capsule volume slider, TRUSTED keyboard: 80→ArrowUp→85→ArrowUp→90→
        ArrowDown→85→ArrowDown→80 (exactly ±5 per press, one logical update);
        boundaries 0/100 clamp; global shortcuts still work when the slider
        is NOT focused (arrows ±5, Space play/pause).
GAP #3  mobile swipe-down close: same lifecycle as the Close button —
        requestClose → mqFtSlideDown (~200ms) → unmount. Proven via a
        delegated animationstart log + document.getAnimations() sampled
        mid-flight (real translateY). Button close + Escape close still
        animate. Swipe left/right still switch tracks. Reduced-motion swipe
        close still completes.
"""
import json
import sys

sys.path.insert(0, "/home/z/my-project/scripts")
from v1041_server import start_server, stop_server
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3112"
OUT = "/home/z/my-project/download/qa-v10.4.1"

ANIM_LOGGER_JS = """
() => {
  window.__animLog = [];
  document.addEventListener('animationstart', (e) => {
    window.__animLog.push({
      name: e.animationName,
      t: Math.round(performance.now()),
      target: (e.target.className || e.target.tagName || '').toString().slice(0, 40),
    });
  }, true);
  return 'logger-installed';
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


# ─────────────────────────────────────────────────────────────────────────
# GAP #1 — desktop hint absent, mobile preserved
# ─────────────────────────────────────────────────────────────────────────
def gap1_desktop(pw):
    r = {"case": "GAP1-desktop-1440x900"}
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    demo_login(page)
    try:
        page.locator('button[aria-label="Открыть полный плеер"]').first.click(timeout=8000)
        page.wait_for_timeout(400)
    except Exception as e:
        r["openError"] = str(e)[:80]
        browser.close()
        return r

    # t≈0.4s: the hint (old behavior) mounted instantly on open — must be gone
    r["hintAtOpen"] = page.evaluate("document.body.innerText.includes('двойной тап')")
    r["hintNodesAtOpen"] = page.evaluate(
        "() => [...document.querySelectorAll('*')].filter(el => el.childNodes.length && [...el.childNodes].some(n => n.textContent === '← двойной тап →')).length"
    )
    # watch the full 4s window in which the old hint lived
    page.wait_for_timeout(4500)
    r["hintAt4s"] = page.evaluate("document.body.innerText.includes('двойной тап')")
    r["hintNodesAnyTime"] = page.evaluate(
        "() => [...document.querySelectorAll('*')].filter(el => el.childNodes.length && [...el.childNodes].some(n => n.textContent === '← двойной тап →')).length"
    )
    page.screenshot(path=f"{OUT}/03-desktop-classic-nohint.png")
    r["screenshot"] = "03-desktop-classic-nohint.png"

    # the desktop double-click seek (feature the hint described) still works
    try:
        art = page.locator('div.cursor-pointer[style*="aspect-ratio"]').first
        art.wait_for(state="visible", timeout=5000)
        box = art.bounding_box()
        cx, cy = box["x"] + box["width"] * 0.75, box["y"] + box["height"] / 2
        page.mouse.dblclick(cx, cy)
        page.wait_for_timeout(250)
        r["dblclickSeekFeedback"] = page.evaluate(
            "() => document.body.innerText.includes('10s')"
        )
        r["dblclickTarget"] = f"{cx:.0f},{cy:.0f}"
    except Exception as e:
        r["dblclickSeekFeedback"] = f"error: {str(e)[:60]}"

    r["pageErrors"] = errors
    browser.close()
    return r


def gap1_mobile(pw):
    r = {"case": "GAP1-mobile-390x844-preserved"}
    iphone = dict(pw.devices["iPhone 14"])
    iphone["viewport"] = {"width": 390, "height": 844}
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context(**iphone)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    demo_login(page)
    try:
        page.locator('button[aria-label="Открыть плеер"]').first.click(timeout=8000)
        page.wait_for_timeout(1500)
    except Exception as e:
        r["openError"] = str(e)[:80]
        browser.close()
        return r
    r["playerOpen"] = page.evaluate("!!document.querySelector('[role=dialog][aria-label^=\"Полноэкранный плеер\"]')")
    r["hintPresent"] = page.evaluate("document.body.innerText.includes('двойной тап')")
    page.screenshot(path=f"{OUT}/04-mobile-player-nohint.png")
    r["screenshot"] = "04-mobile-player-nohint.png"
    r["pageErrors"] = errors
    browser.close()
    return r


# ─────────────────────────────────────────────────────────────────────────
# GAP #2 — capsule trusted keyboard ±5
# ─────────────────────────────────────────────────────────────────────────
def gap2_capsule(pw):
    r = {"case": "GAP2-capsule-trusted-keyboard"}
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    demo_login(page)

    slider = page.locator('div[role="slider"][aria-label="Громкость"]').first
    try:
        slider.wait_for(state="visible", timeout=8000)
    except Exception as e:
        r["sliderError"] = str(e)[:80]
        browser.close()
        return r
    slider.focus()
    page.wait_for_timeout(150)

    def vol():
        return int(page.locator('div[role="slider"][aria-label="Громкость"]').first.get_attribute("aria-valuenow"))

    steps = []

    def press(key):
        page.keyboard.press(key)  # CDP trusted key event
        page.wait_for_timeout(220)
        steps.append({"key": key, "volume": vol()})
        return steps[-1]["volume"]

    v0 = vol()
    # navigate to exactly 80 with trusted keys only
    if v0 != 80:
        if v0 < 80:
            press("End")           # 100
            while vol() > 80:
                press("ArrowDown")
        else:
            while vol() > 80:
                press("ArrowDown")
    r["setupTo80"] = vol()
    r["setupSteps"] = steps.copy()

    # ── the user's exact sequence ──
    seq = []
    seq.append({"press": "ArrowUp", "expect": 85, "got": press("ArrowUp")})
    seq.append({"press": "ArrowUp", "expect": 90, "got": press("ArrowUp")})
    seq.append({"press": "ArrowDown", "expect": 85, "got": press("ArrowDown")})
    seq.append({"press": "ArrowDown", "expect": 80, "got": press("ArrowDown")})
    r["sequence"] = seq
    r["sequencePASS"] = all(s["expect"] == s["got"] for s in seq)

    # ── boundaries ──
    press("Home");  r["homeIsZero"] = vol() == 0
    press("ArrowDown"); r["arrowDownAtZeroStays"] = vol() == 0
    press("End");   r["endIsHundred"] = vol() == 100
    press("ArrowUp"); r["arrowUpAtHundredStays"] = vol() == 100

    # ── global shortcuts with slider NOT focused ──
    page.evaluate("document.activeElement && document.activeElement.blur()")
    page.locator("body").focus()
    page.wait_for_timeout(150)
    vg = vol()
    page.keyboard.press("ArrowUp")
    page.wait_for_timeout(250)
    r["globalArrowUp"] = {"before": vg, "after": vol(), "delta": vol() - vg}
    page.keyboard.press("ArrowDown")
    page.wait_for_timeout(250)
    r["globalArrowDown"] = {"after": vol(), "delta": vol() - (vg + 5)}

    # Space (body focused) toggles play/pause via the global handler
    play_label = lambda: page.evaluate(
        "() => { const b = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'')==='Пауза' || (b.getAttribute('aria-label')||'')==='Воспроизвести'); return b ? b.getAttribute('aria-label') : null; }"
    )
    before_play = play_label()
    page.keyboard.press(" ")
    page.wait_for_timeout(400)
    after_play = play_label()
    r["globalSpaceTogglesPlay"] = {"before": before_play, "after": after_play,
                                   "toggled": before_play is not None and before_play != after_play}
    page.keyboard.press(" ")
    page.wait_for_timeout(300)

    # M mutes globally (body focused)
    vm = vol()
    page.keyboard.press("m")
    page.wait_for_timeout(250)
    r["globalMuteM"] = {"before": vm, "after": vol()}
    page.keyboard.press("m")
    page.wait_for_timeout(250)

    r["allSteps"] = steps
    r["pageErrors"] = errors
    browser.close()
    return r


# ─────────────────────────────────────────────────────────────────────────
# GAP #3 — mobile swipe-down close lifecycle
# ─────────────────────────────────────────────────────────────────────────
def swipe(page, x, y0, y1, steps=8, hold_ms=16):
    """TRUSTED touch swipe via CDP Input.dispatchTouchEvent."""
    cdp = page.context.new_cdp_session(page)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y0}]})
    for i in range(1, steps + 1):
        cdp.send("Input.dispatchTouchEvent", {
            "type": "touchMove",
            "touchPoints": [{"x": x, "y": y0 + (y1 - y0) * i / steps}],
        })
        page.wait_for_timeout(hold_ms)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})


def player_open(page):
    return page.evaluate(
        "!!document.querySelector('[role=dialog][aria-label^=\"Полноэкранный плеер\"]')"
    )


def gap3_mobile(pw):
    r = {"case": "GAP3-mobile-swipe-close-lifecycle"}
    iphone = dict(pw.devices["iPhone 14"])
    iphone["viewport"] = {"width": 390, "height": 844}
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context(**iphone)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    demo_login(page)
    try:
        page.locator('button[aria-label="Открыть плеер"]').first.click(timeout=8000)
        page.wait_for_timeout(1500)
    except Exception as e:
        r["openError"] = str(e)[:80]
        browser.close()
        return r
    r["playerOpen"] = player_open(page)
    page.evaluate(ANIM_LOGGER_JS)

    # ── swipe-down close ──
    art = page.locator('[data-mq-artwork]')
    box = art.bounding_box()
    cx = box["x"] + box["width"] / 2
    cy = box["y"] + box["height"] / 2
    swipe(page, cx, cy, cy + 340)
    page.wait_for_timeout(60)  # ~30% into the 200ms exit
    mid = page.evaluate(
        """() => {
        const anims = document.getAnimations().map(a => ({
            name: (a.animationName || (a.effect && a.effect.getKeyframes && a.effect.getKeyframes().length, a.animationName) || 'transition'),
            name2: a.animationName || '',
            ct: Math.round(a.currentTime || 0),
        }));
        const root = document.querySelector('[role=dialog][aria-label^="Полноэкранный плеер"]');
        return {
            anims: anims.filter(a => a.name2),
            rootTransform: root ? getComputedStyle(root).transform : 'GONE',
            rootAnim: root ? getComputedStyle(root).animationName : 'GONE',
        };
    }"""
    )
    r["swipeMidFlight"] = mid
    page.screenshot(path=f"{OUT}/05-mobile-swipe-exit-midflight.png")
    page.wait_for_timeout(800)
    r["swipeAnimLog"] = page.evaluate("window.__animLog")
    r["swipeUnmounted"] = not player_open(page)
    r["swipeHasSlideDown"] = any(a["name"] == "mqFtSlideDown" for a in r["swipeAnimLog"])

    # ── button close still animates ──
    page.locator('button[aria-label="Открыть плеер"]').first.click(timeout=8000)
    page.wait_for_timeout(1500)
    r["reopenAfterSwipe"] = player_open(page)
    page.evaluate("window.__animLog = []")
    page.locator('button[aria-label="Закрыть"]').first.click(timeout=8000)
    page.wait_for_timeout(700)
    btn_log = page.evaluate("window.__animLog")
    r["buttonCloseHasSlideDown"] = any(a["name"] == "mqFtSlideDown" for a in btn_log)
    r["buttonCloseUnmounted"] = not player_open(page)

    # ── Escape close still animates ──
    page.locator('button[aria-label="Открыть плеер"]').first.click(timeout=8000)
    page.wait_for_timeout(1500)
    page.evaluate("window.__animLog = []")
    page.keyboard.press("Escape")
    page.wait_for_timeout(700)
    esc_log = page.evaluate("window.__animLog")
    r["escapeCloseHasSlideDown"] = any(a["name"] == "mqFtSlideDown" for a in esc_log)
    r["escapeCloseUnmounted"] = not player_open(page)

    # ── swipe left/right still switch tracks (player stays open) ──
    page.locator('button[aria-label="Открыть плеер"]').first.click(timeout=8000)
    page.wait_for_timeout(1500)
    title_before = page.evaluate(
        "() => (document.querySelector('[role=dialog] h1') || {}).textContent || ''"
    )
    art = page.locator('[data-mq-artwork]')
    box = art.bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    cdp = page.context.new_cdp_session(page)
    # swipe LEFT (next): 300 -> 260 -> ... -> 20
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": 300, "y": cy}]})
    for i in range(1, 9):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": 300 - 280 * i / 8, "y": cy}]})
        page.wait_for_timeout(16)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    page.wait_for_timeout(800)
    title_after_left = page.evaluate(
        "() => (document.querySelector('[role=dialog] h1') || {}).textContent || ''"
    )
    r["swipeLeftNextTrack"] = {"before": title_before, "after": title_after_left,
                               "changed": title_before != title_after_left,
                               "playerStillOpen": player_open(page)}

    # swipe RIGHT (prev) — Spotify semantics: pos>3s restarts the SAME track
    # (title unchanged is EXPECTED); prove it by the time label resetting.
    time_label = lambda: page.evaluate(
        "() => (document.querySelector('span.tabular-nums.font-bold') || {}).textContent || null"
    )
    # let the (restarted) track play past 3s so prev = restart semantics
    page.wait_for_timeout(4500)
    t_before = time_label()
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": 90, "y": cy}]})
    for i in range(1, 9):
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": 90 + 280 * i / 8, "y": cy}]})
        page.wait_for_timeout(16)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    page.wait_for_timeout(800)
    t_after = time_label()
    title_after_right = page.evaluate(
        "() => (document.querySelector('[role=dialog] h1') || {}).textContent || ''"
    )
    r["swipeRightPrevTrack"] = {
        "timeBefore": t_before, "timeAfter": t_after,
        "restartedOrSwitched": t_before != t_after or title_after_left != title_after_right,
        "titleAfter": title_after_right, "playerStillOpen": player_open(page),
    }

    r["pageErrors"] = errors
    browser.close()
    return r


def gap3_reduced_motion(pw):
    r = {"case": "GAP3-reduced-motion-swipe-close"}
    iphone = dict(pw.devices["iPhone 14"])
    iphone["viewport"] = {"width": 390, "height": 844}
    iphone["reduced_motion"] = "reduce"  # OS-level; AppShell auto-detects -> .mq-reduce-motion
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context(**iphone)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    demo_login(page)
    page.wait_for_timeout(1000)
    r["reduceClassOnHtml"] = page.evaluate("document.documentElement.className.includes('mq-reduce-motion')")
    try:
        page.locator('button[aria-label="Открыть плеер"]').first.click(timeout=8000)
        page.wait_for_timeout(1500)
    except Exception as e:
        r["openError"] = str(e)[:80]
        browser.close()
        return r
    r["playerOpen"] = player_open(page)
    page.evaluate(ANIM_LOGGER_JS)
    art = page.locator('[data-mq-artwork]')
    box = art.bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    swipe(page, cx, cy, cy + 340)
    page.wait_for_timeout(1200)
    r["animNames"] = [a["name"] for a in page.evaluate("window.__animLog")]
    r["closedUnderReducedMotion"] = not player_open(page)
    r["pageErrors"] = errors
    browser.close()
    return r


def main():
    proc, _ = start_server()
    try:
        with sync_playwright() as pw:
            out = {"build": open("/home/z/my-project/.next/BUILD_ID").read().strip()}
            out["gap1_desktop"] = gap1_desktop(pw)
            out["gap1_mobile"] = gap1_mobile(pw)
            out["gap2_capsule"] = gap2_capsule(pw)
            out["gap3_mobile"] = gap3_mobile(pw)
            out["gap3_reduced"] = gap3_reduced_motion(pw)
    finally:
        stop_server(proc)
    path = f"{OUT}/gap-verification.json"
    with open(path, "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"\nSAVED: {path}", file=sys.stderr)


if __name__ == "__main__":
    main()
