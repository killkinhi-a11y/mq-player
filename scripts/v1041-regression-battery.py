#!/usr/bin/env python3
"""V10.4.1 — PHASE 7-9 full regression battery (local build with all fixes).

Desktop Classic: Play/Pause, Previous, Next, Like, Dislike, Lyrics, Queue,
  Volume (inline), More, Close, Seek, Escape.
Desktop Spatial: Volume popup (V10.3.1 geometry + material + behavior),
  More, Queue, Lyrics, Carousel, Close, Escape.
Mobile: Play/Pause, Previous, Next, Like, Dislike, Lyrics, Queue, Volume
  popup (open/inside/drag/mute/unmute/Escape/outside), More, Close, Swipes.
Capsule: Play/Pause, Volume, Mute, Unmute, ArrowUp(+5), ArrowDown(-5).
Context Menu (PHASE 9): open, items, Escape, keyboard nav, destructive.
"""
import json
import sys

sys.path.insert(0, "/home/z/my-project/scripts")
from v1041_server import start_server, stop_server
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3112"
OUT = "/home/z/my-project/download/qa-v10.4.1"

JS = {
    "playerOpen": '!!document.querySelector(\'[role="dialog"][aria-label^="Полноэкранный плеер"]\')',
    "volFromBtn": """() => { const b=[...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||'').startsWith('Громкость:')); return b? parseInt(b.getAttribute('aria-label').match(/(\\d+)/)?.[1] ?? '-1') : -1; }""",
}


def demo_login(page, disable_tour=True):
    btn = page.get_by_role("button", name="Демо", exact=False)
    try:
        btn.wait_for(state="visible", timeout=8000)
        btn.click()
        page.wait_for_timeout(4000)
        if disable_tour:
            # demo sessions auto-start the onboarding tour whose window
            # keydown hijacks Arrow keys (tour navigation) and whose steps
            # open/close the player — a real user has completed it already.
            page.evaluate("() => localStorage.setItem('mq-tour-complete', 'true')")
            page.wait_for_timeout(300)
        return True
    except Exception:
        return False


def ensure_current_track(page, timeout=15000):
    """Wait for the mini bar; if no track is current, start one
    (continue card / Слушать button) — the open-player control needs it."""
    import time
    deadline = time.time() + timeout / 1000
    while time.time() < deadline:
        if page.locator('button[aria-label="Открыть полный плеер"]').count() > 0:
            return True
        if page.locator('button[aria-label="Открыть плеер"]').count() > 0:
            return True
        for lbl in ("Продолжить",):
            b = page.locator(f'button[aria-label="{lbl}"]').first
            if b.count() > 0:
                try:
                    b.click(timeout=2000)
                    page.wait_for_timeout(2500)
                except Exception:
                    pass
                continue
        listen = page.locator('button[aria-label*="Слушать"]').first
        if listen.count() > 0:
            try:
                listen.click(timeout=2000)
                page.wait_for_timeout(2500)
            except Exception:
                pass
        page.wait_for_timeout(800)
    return False


def click_label(page, label, timeout=6000, scope=""):
    page.locator(f'{scope}button[aria-label="{label}"]').first.click(timeout=timeout)


def has_label(page, label):
    return page.locator(f'button[aria-label="{label}"]').count() > 0


def play_state(page, retry=True, scope=""):
    for attempt in range(2 if retry else 1):
        for lbl in ("Пауза", "Воспроизвести"):
            if page.locator(f'{scope}button[aria-label="{lbl}"]').count() > 0:
                return lbl
        if retry:
            page.wait_for_timeout(1200)  # loading spinner may mask the label
    return None


def vol_by_btn(page):
    return page.evaluate(JS["volFromBtn"])


# ───────────────────────────── DESKTOP CLASSIC ─────────────────────────────

def desktop_classic(pw):
    r = {"case": "desktop-classic-1440x900"}
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    demo_login(page)
    ensure_current_track(page)
    # default mode = classic
    try:
        click_label(page, "Открыть полный плеер")
        page.wait_for_timeout(1500)
    except Exception as e:
        r["openError"] = str(e)[:70]
        browser.close()
        return r
    r["playerOpen"] = page.evaluate(JS["playerOpen"])
    r["hintAbsent"] = not page.evaluate("document.body.innerText.includes('двойной тап')")

    # Play/Pause (scoped to the dialog — the capsule behind shares labels)
    D = '[role="dialog"] '
    s0 = play_state(page, scope=D)
    click_label(page, s0, scope=D)
    page.wait_for_timeout(700)
    s1 = play_state(page, scope=D)
    r["playPause"] = {"before": s0, "after": s1}
    if s1:
        click_label(page, s1, scope=D)
        page.wait_for_timeout(500)

    # Previous / Next (classic title = LiquidTitle span.mq-liquid[aria-label])
    title = "() => { const e = document.querySelector('[role=dialog] .mq-liquid'); return e ? e.getAttribute('aria-label') : ''; }"
    t0 = page.evaluate(title)
    click_label(page, "Следующий трек", scope=D); page.wait_for_timeout(900)
    t1 = page.evaluate(title)
    click_label(page, "Предыдущий трек", scope=D); page.wait_for_timeout(900)
    t2 = page.evaluate(title)
    r["prevNext"] = {"before": t0, "afterNext": t1, "afterPrev": t2}

    # Like / Dislike (aria-pressed)
    like = page.locator('button[aria-label^="Нравится"], button[aria-label="Убрать из избранного"]').first
    p0 = like.get_attribute("aria-pressed")
    like.click(); page.wait_for_timeout(400)
    lbl1 = like.get_attribute("aria-label")
    p1 = like.get_attribute("aria-pressed")
    like.click(); page.wait_for_timeout(300)
    r["like"] = {"before": [p0], "after": [p1, lbl1]}
    dl = page.locator('button[aria-label="Не нравится"]').first
    d0 = dl.get_attribute("aria-pressed")
    dtitle = page.evaluate(title)
    dl.click(); page.wait_for_timeout(900)
    # toggleDislike SKIPS the disliked current track (by design) — the new
    # current track is not disliked → pressed stays false + title changed
    r["dislike"] = {"pressedBefore": d0,
                    "titleBefore": dtitle,
                    "titleAfter": page.evaluate(title),
                    "skippedCurrent": page.evaluate(title) != dtitle}

    # Lyrics / Queue (panels toggle, aria-pressed)
    lyr = page.locator('button[aria-label="Текст песни"]').first
    q0 = lyr.get_attribute("aria-pressed")
    lyr.click(); page.wait_for_timeout(700)
    q1 = lyr.get_attribute("aria-pressed")
    panel_lyr = page.evaluate("!!document.querySelector('[data-mq-context-panel], [data-mq-panel=lyrics], [data-panel=lyrics]')")
    # close the panel via Escape (layered dismissal) — the open panel covers the toggle
    page.keyboard.press("Escape"); page.wait_for_timeout(500)
    q2 = page.evaluate("!!document.querySelector('[data-mq-context-panel], [data-mq-panel=lyrics], [data-panel=lyrics]')")
    r["lyrics"] = {"pressed": [q0, q1], "panelAppeared": panel_lyr, "escapeClosed": not q2}
    qb = page.locator('button[aria-label="Очередь"]').first
    b0 = qb.get_attribute("aria-pressed")
    qb.click(); page.wait_for_timeout(700)
    b1 = qb.get_attribute("aria-pressed")
    panel_q = page.evaluate("!!document.querySelector('[data-mq-context-panel], [data-mq-panel=queue], [data-panel=queue], [data-mq-panel=history]')")
    page.keyboard.press("Escape"); page.wait_for_timeout(500)
    r["queue"] = {"pressed": [b0, b1], "panelAppeared": panel_q}

    # Volume (inline row): set via input, mute, unmute restore
    mute = page.locator('button[aria-label="Выключить звук"], button[aria-label="Включить звук"]').first
    r["volumeInline"] = {}
    try:
        page.evaluate("""() => {
          const dlg = document.querySelector('[role="dialog"]');
          const input = [...dlg.querySelectorAll('input[type="range"]')].pop();
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, '42'); input.dispatchEvent(new Event('input', {bubbles:true}));
        }""")
        page.wait_for_timeout(400)
        v0 = page.evaluate(JS["volFromBtn"])
    except Exception:
        v0 = None
    m0 = mute.get_attribute("aria-label")
    mute.click(); page.wait_for_timeout(300)
    m1 = page.locator('button[aria-label="Выключить звук"], button[aria-label="Включить звук"]').first.get_attribute("aria-label")
    page.locator('button[aria-label="Выключить звук"], button[aria-label="Включить звук"]').first.click()
    page.wait_for_timeout(300)
    m2 = page.locator('button[aria-label="Выключить звук"], button[aria-label="Включить звук"]').first.get_attribute("aria-label")
    r["volumeInline"] = {"set42": v0, "afterMute": m1, "afterUnmute": m2}

    # More (context menu via classic player)
    click_label(page, "Контекстное меню трека")
    page.wait_for_timeout(600)
    items = page.evaluate("() => [...document.querySelectorAll('[role=menuitem]')].map(e => e.textContent.trim()).filter(Boolean)")
    r["more"] = {"items": items, "count": len(items)}
    page.keyboard.press("Escape"); page.wait_for_timeout(400)
    r["moreEscapeCloses"] = page.evaluate("document.querySelectorAll('[role=menuitem]').length") == 0

    # Seek: ProgressBar owns arrow keys (v10.4 ownership model) — trusted
    # ArrowRight on the FOCUSED seek slider = +5s (tour disabled above).
    # Wait for the engine to report duration (ProgressBar ignores keys at 0).
    seek = page.locator('[role="dialog"] [role="slider"]').first
    for _ in range(10):
        if int(seek.get_attribute("aria-valuenow") or 0) > 0 or page.evaluate("() => (document.querySelector('[role=dialog] [role=slider]')||{}).getAttribute('aria-valuemax')") not in (None, "0"):
            break
        page.wait_for_timeout(600)
    s_before = int(seek.get_attribute("aria-valuenow") or 0)
    seek.focus()
    page.wait_for_timeout(200)
    page.keyboard.press("ArrowRight")
    page.wait_for_timeout(900)
    s_after = int(seek.get_attribute("aria-valuenow") or 0)
    r["seek"] = {"before": s_before, "after": s_after, "moved": s_after != s_before,
                  "playerStillOpen": page.evaluate(JS["playerOpen"])}

    # Close via button + Escape (reopen first)
    page.keyboard.press("Escape"); page.wait_for_timeout(600)
    r["escapeCloses"] = not page.evaluate(JS["playerOpen"])
    click_label(page, "Открыть полный плеер"); page.wait_for_timeout(1200)
    click_label(page, "Закрыть"); page.wait_for_timeout(600)
    r["closeButton"] = not page.evaluate(JS["playerOpen"])

    r["pageErrors"] = errors
    page.screenshot(path=f"{OUT}/07-classic-desktop-battery.png")
    browser.close()
    return r


# ───────────────────────────── DESKTOP SPATIAL ─────────────────────────────

def desktop_spatial(pw):
    r = {"case": "desktop-spatial-1440x900"}
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    demo_login(page)
    # switch to spatial through Settings
    try:
        page.locator('button[aria-label="Настройки"]').first.click(timeout=8000)
        page.wait_for_timeout(1500)
        page.locator('button:has-text("Оформление")').first.click(timeout=8000)
        page.wait_for_timeout(1000)
        page.locator('[data-mq-setting="full-player-mode"] [role="radio"]').nth(1).click(timeout=8000)
        page.wait_for_timeout(600)
        page.locator('button[aria-label="MQ — на главную"], button[aria-label*="на главную"]').first.click(timeout=8000)
        page.wait_for_timeout(1200)
    except Exception as e:
        r["settingsError"] = str(e)[:70]
    click_label(page, "Открыть полный плеер")
    page.wait_for_timeout(1800)
    ensure_current_track(page)
    r["spatialMarks"] = page.evaluate("document.querySelectorAll('[data-mq-spatial]').length")

    # ── V10.3.1 volume popup geometry + material ──
    click_label(page, page.locator('button[aria-label^="Громкость:"]').first.get_attribute("aria-label"))
    page.wait_for_timeout(700)
    geo = page.evaluate("""() => {
      const pp = document.querySelector('[data-mq-volpopup]');
      if (!pp) return {error: 'no popup'};
      const btn = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'').startsWith('Громкость:'));
      const footer = pp.closest('footer') || document.querySelector('[data-mq-spatial="controls"]');
      const panel = footer ? footer.querySelector('[class*="rounded-"]') : null;
      const ppR = pp.getBoundingClientRect(), btnR = btn.getBoundingClientRect();
      const panR = panel ? panel.getBoundingClientRect() : null;
      let el = pp.parentElement, filteredAncestor = false;
      while (el && el !== document.body) {
        const cs = getComputedStyle(el);
        if (cs.backdropFilter !== 'none' || cs.filter !== 'none') { filteredAncestor = true; break; }
        el = el.parentElement;
      }
      const cs = getComputedStyle(pp);
      return {
        popup: {w: ppR.width, h: ppR.height, x: ppR.x, y: ppR.y, right: ppR.right, bottom: ppR.bottom},
        btnCx: btnR.x + btnR.width/2, popupCx: ppR.x + ppR.width/2,
        panelTop: panR ? panR.y : null, popupBottom: ppR.bottom,
        offsetParent: pp.offsetParent ? (pp.offsetParent.tagName + '.' + String(pp.offsetParent.className).slice(0,40)) : 'null',
        filteredAncestor,
        bg: cs.backgroundColor, blur: cs.backdropFilter, border: cs.border, shadow: cs.boxShadow.slice(0,60), radius: cs.borderRadius,
      };
    }""")
    r["popupGeometry"] = geo
    if "error" not in geo:
        r["popupV1031"] = {
            "size200x54": abs(geo["popup"]["w"] - 200) < 1 and abs(geo["popup"]["h"] - 54) < 1,
            "centerMatchesButton": abs(geo["popupCx"] - geo["btnCx"]) < 1.5,
            "gapAbovePanel": (geo["panelTop"] is not None
                              and abs(geo["panelTop"] - geo["popupBottom"] - 12) < 2),
            "noFilteredAncestor": not geo["filteredAncestor"],
            "glassBlur": "blur" in str(geo["blur"]),
        }

    # popup behavior: drag(set), mute, unmute, Escape, outside click, arrows
    beh = {}
    try:
        page.evaluate("""() => {
          const pp = document.querySelector('[data-mq-volpopup]');
          const input = pp.querySelector('input[type="range"]');
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
          setter.call(input, '51'); input.dispatchEvent(new Event('input',{bubbles:true}));
        }""")
        page.wait_for_timeout(400)
        beh["set51_popupStays"] = page.evaluate("!!document.querySelector('[data-mq-volpopup]')")
        beh["volAfterSet"] = page.evaluate(JS["volFromBtn"])
        # keyboard on the focused slider (native range step)
        page.evaluate("document.querySelector('[data-mq-volpopup] input').focus()")
        page.keyboard.press("ArrowUp"); page.wait_for_timeout(300)
        beh["arrowUpNative"] = page.evaluate(JS["volFromBtn"])  # 51 -> 52
        page.keyboard.press("Escape"); page.wait_for_timeout(500)
        beh["escapeClosesPopupPlayerStays"] = (
            not page.evaluate("!!document.querySelector('[data-mq-volpopup]')")
            and page.evaluate(JS["playerOpen"])
        )
        # mute/unmute via the VolumeSlider icon (reopen popup)
        lbl = page.locator('button[aria-label^="Громкость:"]').first.get_attribute("aria-label")
        click_label(page, lbl); page.wait_for_timeout(600)
        page.locator('[data-mq-volpopup] button[aria-label*="звук"]').first.click()
        page.wait_for_timeout(300)
        beh["muteToZero"] = page.evaluate(JS["volFromBtn"])
        page.locator('[data-mq-volpopup] button[aria-label*="звук"]').first.click()
        page.wait_for_timeout(300)
        beh["unmuteRestores"] = page.evaluate(JS["volFromBtn"])
        # outside click
        page.mouse.click(400, 300); page.wait_for_timeout(500)
        beh["outsideClickCloses"] = not page.evaluate("!!document.querySelector('[data-mq-volpopup]')")
    except Exception as e:
        beh["error"] = str(e)[:90]
    r["popupBehavior"] = beh

    # More (7 items)
    try:
        click_label(page, "Ещё"); page.wait_for_timeout(600)
        r["more"] = {"items": page.evaluate("() => [...document.querySelectorAll('[role=menuitem]')].length")}
        page.keyboard.press("Escape"); page.wait_for_timeout(400)
    except Exception as e:
        r["more"] = {"error": str(e)[:70]}

    # Queue drawer + Lyrics
    try:
        page.locator('[data-mq-spatial="controls"] button[aria-label="Очередь"]').first.click(timeout=8000)
        page.wait_for_timeout(800)
        r["queueDrawer"] = page.evaluate("!!document.querySelector('[data-mq-spatial=\"queue\"]')")
        r["queueTabs"] = page.evaluate("() => [...document.querySelectorAll('[role=tab], [data-mq-spatial=\"queue\"] button')].map(b=>b.textContent.trim()).filter(t=>t && t.length<12).slice(0,6)")
        click_label(page, "Закрыть очередь"); page.wait_for_timeout(500)
    except Exception as e:
        r["queueDrawer"] = f"error: {str(e)[:60]}"
    try:
        click_label(page, "Текст песни"); page.wait_for_timeout(700)
        r["lyricsOpen"] = page.evaluate("!!document.querySelector('[data-mq-spatial=\"lyrics\"], [aria-label*=\"Закрыть текст\"]')")
        page.locator('button[aria-label="Закрыть текст песни"]').first.click(timeout=4000)
        page.wait_for_timeout(500)
    except Exception as e:
        r["lyricsOpen"] = f"error: {str(e)[:60]}"

    # Carousel: click ANY side card (offset depends on queue position)
    try:
        center = """() => { const e = document.querySelector('[data-mq-spatial-card="0"]'); return e ? e.getAttribute('data-track-id') : null; }"""
        t0 = page.evaluate(center)
        offs = page.evaluate("() => [...document.querySelectorAll('[data-mq-spatial-card]')].map(e => e.getAttribute('data-mq-spatial-card'))")
        side = len(offs)
        clicked = None
        for off in ("1", "-1", "2", "-2"):
            if off in offs:
                try:
                    page.locator(f'[data-mq-spatial-card="{off}"]').first.click(timeout=4000)
                    clicked = off
                    break
                except Exception:
                    continue
        page.wait_for_timeout(1300)
        t1 = page.evaluate(center)
        r["carousel"] = {"offsets": offs, "clicked": clicked, "before": t0, "afterClick": t1, "changed": t0 != t1}
    except Exception as e:
        r["carousel"] = {"error": str(e)[:70]}

    # Close + Escape
    page.keyboard.press("Escape"); page.wait_for_timeout(800)
    r["escapeCloses"] = not page.evaluate(JS["playerOpen"])
    try:
        click_label(page, "Открыть полный плеер"); page.wait_for_timeout(1500)
        click_label(page, "Закрыть"); page.wait_for_timeout(800)
        r["closeButton"] = not page.evaluate(JS["playerOpen"])
    except Exception as e:
        r["closeButton"] = f"error: {str(e)[:60]}"

    r["pageErrors"] = errors
    page.screenshot(path=f"{OUT}/08-spatial-desktop-battery.png")
    browser.close()
    return r


# ──────────────────────────────── MOBILE ────────────────────────────────

def mobile_battery(pw):
    r = {"case": "mobile-390x844"}
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
    ensure_current_track(page)
    try:
        click_label(page, "Открыть плеер")
        page.wait_for_timeout(1500)
    except Exception as e:
        r["openError"] = str(e)[:70]
        browser.close()
        return r
    r["playerOpen"] = page.evaluate(JS["playerOpen"])

    # Play/Pause, prev, next (scoped to the dialog)
    D = '[role="dialog"] '
    s0 = play_state(page, scope=D)
    click_label(page, s0, scope=D)
    page.wait_for_timeout(700)
    s1 = play_state(page, scope=D)
    r["playPause"] = {"before": s0, "after": s1}
    if s1:
        click_label(page, s1, scope=D)
        page.wait_for_timeout(500)
    t0 = page.evaluate("() => (document.querySelector('[role=dialog] h1')||{}).textContent || ''")
    click_label(page, "Следующий трек", scope=D); page.wait_for_timeout(900)
    t1 = page.evaluate("() => (document.querySelector('[role=dialog] h1')||{}).textContent || ''")
    click_label(page, "Предыдущий трек", scope=D); page.wait_for_timeout(900)
    t2 = page.evaluate("() => (document.querySelector('[role=dialog] h1')||{}).textContent || ''")
    r["prevNext"] = {"before": t0, "afterNext": t1, "afterPrev": t2}

    # Like / Dislike
    like = page.locator('button[aria-label^="Нравится"], button[aria-label="Убрать из избранного"]').first
    p0 = like.get_attribute("aria-pressed")
    like.click(); page.wait_for_timeout(300)
    p1 = like.get_attribute("aria-pressed")
    like.click(); page.wait_for_timeout(300)
    r["like"] = [p0, p1]
    dl = page.locator('[role="dialog"] button[aria-label="Не нравится"]').first
    d0 = dl.get_attribute("aria-pressed")
    mtitle = "() => { const e = document.querySelector('[role=dialog] h1'); return e ? e.textContent : ''; }"
    dtitle = page.evaluate(mtitle)
    dl.click(); page.wait_for_timeout(900)
    r["dislike"] = {"pressedBefore": d0, "titleBefore": dtitle,
                    "titleAfter": page.evaluate(mtitle),
                    "skippedCurrent": page.evaluate(mtitle) != dtitle}

    # Lyrics / Queue panels
    lyr = page.locator('button[aria-label="Текст"]').first
    q0 = lyr.get_attribute("aria-pressed")
    lyr.click(); page.wait_for_timeout(700)
    q1 = lyr.get_attribute("aria-pressed")
    r["lyrics"] = [q0, q1, page.evaluate("!!document.querySelector('[data-mq-panel=lyrics]')")]
    page.keyboard.press("Escape"); page.wait_for_timeout(600)
    qb = page.locator('[role="dialog"] button[aria-label="Очередь"]').first
    b0 = qb.get_attribute("aria-pressed")
    qb.click(); page.wait_for_timeout(700)
    b1 = qb.get_attribute("aria-pressed")
    r["queue"] = [b0, b1, page.evaluate("!!document.querySelector('[data-mq-panel=queue]')")]
    page.keyboard.press("Escape"); page.wait_for_timeout(600)

    # Volume popup: open / inside / drag / mute / unmute / Escape / outside
    v = {}
    lbl = page.locator('button[aria-label^="Громкость:"]').first.get_attribute("aria-label")
    click_label(page, lbl); page.wait_for_timeout(700)
    v["open"] = page.evaluate("!!document.querySelector('[data-mq-volpopup]')")
    v["insideGeometry"] = page.evaluate("""() => {
      const pp = document.querySelector('[data-mq-volpopup]');
      const val = [...pp.querySelectorAll('span')].find(s => /font-mono/.test(s.className));
      const input = pp.querySelector('input[type=range]');
      const R = el => el.getBoundingClientRect();
      return { valueRight: R(val).right, popupRight: R(pp).right,
               valueInside: R(val).right <= R(pp).right,
               sliderInside: R(input).right <= R(pp).right,
               popupSize: {w: R(pp).width, h: R(pp).height} };
    }""")
    page.evaluate("""() => {
      const pp = document.querySelector('[data-mq-volpopup]');
      const input = pp.querySelector('input[type="range"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      setter.call(input, '33'); input.dispatchEvent(new Event('input',{bubbles:true}));
    }""")
    page.wait_for_timeout(400)
    v["dragTo33"] = page.evaluate(JS["volFromBtn"])
    page.locator('[data-mq-volpopup] button[aria-label*="звук"]').first.click(); page.wait_for_timeout(300)
    v["mute"] = page.evaluate(JS["volFromBtn"])
    page.locator('[data-mq-volpopup] button[aria-label*="звук"]').first.click(); page.wait_for_timeout(300)
    v["unmuteRestores"] = page.evaluate(JS["volFromBtn"])
    page.keyboard.press("Escape"); page.wait_for_timeout(500)
    v["escapeCloses"] = not page.evaluate("!!document.querySelector('[data-mq-volpopup]')")
    lbl = page.locator('button[aria-label^="Громкость:"]').first.get_attribute("aria-label")
    click_label(page, lbl); page.wait_for_timeout(600)
    page.touchscreen.tap(195, 200); page.wait_for_timeout(500)
    v["outsideTapCloses"] = not page.evaluate("!!document.querySelector('[data-mq-volpopup]')")
    r["volumePopup"] = v

    # More sheet
    try:
        click_label(page, "Ещё"); page.wait_for_timeout(700)
        r["moreSheet"] = {"items": page.evaluate("() => [...document.querySelectorAll('[role=menuitem]')].length")}
        page.keyboard.press("Escape"); page.wait_for_timeout(500)
    except Exception as e:
        r["moreSheet"] = {"error": str(e)[:70]}

    # Close button (swipes already proven in GAP#3 battery)
    click_label(page, "Закрыть"); page.wait_for_timeout(700)
    r["closeButton"] = not page.evaluate(JS["playerOpen"])

    r["pageErrors"] = errors
    page.screenshot(path=f"{OUT}/09-mobile-battery.png")
    browser.close()
    return r


# ──────────────────────────────── CAPSULE ────────────────────────────────

def capsule_battery(pw):
    r = {"case": "capsule-desktop-1440x900"}
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    demo_login(page)
    ensure_current_track(page)

    slider = page.locator('div[role="slider"][aria-label="Громкость"]').first
    slider.wait_for(state="visible", timeout=8000)

    def vol():
        return int(slider.get_attribute("aria-valuenow"))

    # Play/Pause on the capsule
    s0 = play_state(page)
    if s0:
        click_label(page, s0); page.wait_for_timeout(500)
        r["playPause"] = {"before": s0, "after": play_state(page)}
        click_label(page, r["playPause"]["after"]); page.wait_for_timeout(400)

    # Mute / Unmute buttons
    m0 = page.locator('button[aria-label="Выключить звук"], button[aria-label="Включить звук"]').first.get_attribute("aria-label")
    page.locator('button[aria-label="Выключить звук"], button[aria-label="Включить звук"]').first.click()
    page.wait_for_timeout(300)
    r["muteUnmute"] = {"before": m0, "volAfterMute": vol()}
    page.locator('button[aria-label="Выключить звук"], button[aria-label="Включить звук"]').first.click()
    page.wait_for_timeout(300)
    r["muteUnmute"]["volAfterUnmute"] = vol()

    # Volume drag (pointer)
    v0 = vol()
    box = slider.bounding_box()
    page.mouse.move(box["x"] + box["width"] * 0.5, box["y"] + box["height"] / 2)
    page.mouse.down()
    page.mouse.move(box["x"] + box["width"] * 0.5 + 30, box["y"] + box["height"] / 2, steps=5)
    page.mouse.up()
    page.wait_for_timeout(400)
    r["drag"] = {"before": v0, "after": vol()}

    # Trusted ArrowUp/Down = ±5 (GAP#2 again, from a mid value)
    slider.focus(); page.wait_for_timeout(150)
    b = vol()
    page.keyboard.press("ArrowUp"); page.wait_for_timeout(250)
    a1 = vol()
    page.keyboard.press("ArrowDown"); page.wait_for_timeout(250)
    a2 = vol()
    r["trustedKeys"] = {"before": b, "afterUp": a1, "afterDown": a2,
                        "upExactly5": a1 - b == 5, "downExactly5": a2 - a1 == -5}

    r["pageErrors"] = errors
    browser.close()
    return r


# ────────────────────────── CONTEXT MENU (PHASE 9) ──────────────────────────

def context_menu_battery(pw):
    r = {"case": "context-menu-regression"}
    browser = pw.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(BASE, wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    demo_login(page)

    # open via a track actions button on the home view («Действия: …»)
    try:
        page.locator('button[aria-label^="Действия:"]').first.click(timeout=8000)
        page.wait_for_timeout(700)
        r["open"] = page.evaluate("document.querySelectorAll('[role=menuitem]').length") > 0
        r["items"] = page.evaluate("() => [...document.querySelectorAll('[role=menuitem]')].map(e => e.textContent.trim()).filter(Boolean)")
        r["destructivePresent"] = page.evaluate("!!document.querySelector('[data-destructive]')")
        r["disabledPresent"] = page.evaluate("() => [...document.querySelectorAll('[role=menuitem]')].some(e => e.getAttribute('aria-disabled') === 'true')")
        # keyboard: ArrowDown moves selection
        first_before = page.evaluate("() => document.activeElement ? (document.activeElement.getAttribute('role') === 'menuitem' ? document.activeElement.textContent.trim() : document.activeElement.tagName) : 'none'")
        page.keyboard.press("ArrowDown"); page.wait_for_timeout(300)
        page.keyboard.press("ArrowDown"); page.wait_for_timeout(300)
        after_nav = page.evaluate("() => document.activeElement ? (document.activeElement.getAttribute('role') === 'menuitem' ? document.activeElement.textContent.trim() : document.activeElement.tagName) : 'none'")
        r["keyboardNav"] = {"before": first_before, "afterArrows": after_nav}
        # Escape closes
        page.keyboard.press("Escape"); page.wait_for_timeout(500)
        r["escapeCloses"] = page.evaluate("document.querySelectorAll('[role=menuitem]').length") == 0
        # reopen + close by outside click
        page.locator('button[aria-label^="Действия:"]').first.click(timeout=8000)
        page.wait_for_timeout(500)
        page.mouse.click(700, 200); page.wait_for_timeout(500)
        r["outsideClickCloses"] = page.evaluate("document.querySelectorAll('[role=menuitem]').length") == 0
    except Exception as e:
        r["error"] = str(e)[:90]

    r["pageErrors"] = errors
    browser.close()
    return r


def main():
    proc, _ = start_server()
    try:
        with sync_playwright() as pw:
            out = {"build": open("/home/z/my-project/.next/BUILD_ID").read().strip()}
            out["desktop_classic"] = desktop_classic(pw)
            out["desktop_spatial"] = desktop_spatial(pw)
            out["mobile"] = mobile_battery(pw)
            out["capsule"] = capsule_battery(pw)
            out["context_menu"] = context_menu_battery(pw)
    finally:
        stop_server(proc)
    path = f"{OUT}/regression-battery.json"
    with open(path, "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print(f"\nSAVED: {path}", file=sys.stderr)


if __name__ == "__main__":
    main()
