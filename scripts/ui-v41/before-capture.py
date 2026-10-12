#!/usr/bin/env python3
"""UI V4.1 — BEFORE screenshots from PRODUCTION (mq1.vercel.app).

Captures Home / Search / Artist / Album at 1440x900, 1280x800, 390x844,
360x800 — the four pages targeted by the V4.1 polish pass. Real demo
session, real catalog (Deezer) + SoundCloud data. No mocks.

Usage: python3 scripts/ui-v41/before-capture.py [--base URL] [--out DIR]
"""
import argparse
import os

from playwright.sync_api import sync_playwright

PARSER = argparse.ArgumentParser()
PARSER.add_argument("--base", default="https://mq1.vercel.app")
PARSER.add_argument("--out", default="download/ui-v4.1/screens-before")
PARSER.add_argument("--suffix", default="")
ARGS = PARSER.parse_args()

BASE = ARGS.base
OUT = ARGS.out
SUF = ARGS.suffix
os.makedirs(OUT, exist_ok=True)

LOG = []


def shot(page, name):
    path = os.path.join(OUT, f"{name}{SUF}.png")
    page.screenshot(path=path)
    LOG.append(f"OK  {name}")


def log(msg):
    print(msg, flush=True)
    LOG.append(msg)


def demo_login(page):
    """Enter the app via the demo button; skip the onboarding tour."""
    try:
        btn = page.get_by_role("button", name="Демо", exact=False)
        btn.wait_for(state="visible", timeout=15000)
        btn.click()
        page.wait_for_timeout(5000)
    except Exception as e:
        log(f"demo-login: {e}")
    page.evaluate("() => localStorage.setItem('mq-tour-complete','true')")
    page.wait_for_timeout(800)


def goto_view(page, aria):
    """Click a NavBar/MobileDock tab by aria-label (JS click — robust to
    overlays/visibility quirks of fixed-position nav cards)."""
    ok = page.evaluate(
        """(aria) => {
            const b = [...document.querySelectorAll('button')]
              .find(x => x.getAttribute('aria-label') === aria);
            if (b) { b.click(); return true; } return false;
        }""",
        aria,
    )
    page.wait_for_timeout(2200)
    if not ok:
        log(f"nav[{aria}]: button not found")
    return ok


def clear_search(page):
    """Reset the search input to the no-query state."""
    try:
        page.locator("[data-search-input]").first.fill("")
        page.wait_for_timeout(900)
    except Exception as e:
        log(f"clear-search: {e}")


def click_album_tile(page, album_text):
    """Click the first album tile inside the 'Альбомы' results section."""
    ok = page.evaluate(
        """(text) => {
            const secs = [...document.querySelectorAll('section')];
            const sec = secs.find(s => (s.querySelector('h3')||{}).textContent === 'Альбомы');
            const root = sec || document;
            const btns = [...root.querySelectorAll('button')];
            const b = btns.find(x => x.textContent.toLowerCase().includes(text.toLowerCase()));
            if (b) { b.click(); return 'tile'; }
            const any = btns[0];
            if (any) { any.click(); return 'first'; }
            return 'none';
        }""",
        album_text,
    )
    log(f"album-tile: {ok}")
    return ok != "none"


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto(BASE, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(4000)
        demo_login(page)

        # ══ DESKTOP 1440x900 ══
        page.set_viewport_size({"width": 1440, "height": 900})
        page.wait_for_timeout(1200)
        shot(page, "01-home-desktop")
        page.evaluate("window.scrollTo(0, 620)")
        page.wait_for_timeout(900)
        shot(page, "01b-home-desktop-continue")
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(500)

        # Search — no query
        if goto_view(page, "Поиск"):
            clear_search(page)
            shot(page, "02-search-empty-desktop")

        # Search — query with a clear top result (artist hero via Deezer)
        page.locator("[data-search-input]").first.fill("")
        page.wait_for_timeout(300)
        page.locator("[data-search-input]").first.fill("daft punk")
        page.wait_for_timeout(4500)
        shot(page, "02b-search-topresult-desktop")

        # Hover state on a result row
        try:
            row = page.locator(".mq-row").first
            row.hover(timeout=4000)
            page.wait_for_timeout(600)
            shot(page, "02c-search-row-hover")
        except Exception as e:
            log(f"hover: {e}")

        # Search — no results
        page.locator("[data-search-input]").first.fill("zzxxqvw nobody")
        page.wait_for_timeout(3500)
        shot(page, "02d-search-noresults-desktop")

        # Top result hero — artist page (full metadata)
        page.locator("[data-search-input]").first.fill("daft punk")
        page.wait_for_timeout(4500)
        try:
            hero = page.locator(".mq-search-topresult").first
            hero.click(timeout=6000)
            page.wait_for_timeout(5000)
            shot(page, "03-artist-desktop-full")
            page.evaluate("window.scrollTo(0, 700)")
            page.wait_for_timeout(1000)
            shot(page, "03b-artist-desktop-popular-albums")
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(500)
        except Exception as e:
            log(f"artist-open: {e}")

        # Album — long title + big tracklist (Random Access Memories: 13 tracks)
        try:
            goto_view(page, "Поиск")
            page.locator("[data-search-input]").first.fill("random access memories")
            page.wait_for_timeout(4500)
            click_album_tile(page, "Random Access Memories")
            page.wait_for_timeout(5000)
            shot(page, "04-album-desktop")
            page.evaluate("window.scrollTo(0, 560)")
            page.wait_for_timeout(900)
            shot(page, "04b-album-desktop-tracklist")
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(400)
        except Exception as e:
            log(f"album-open: {e}")

        # Artist with incomplete metadata (SC-based ArtistDetailView)
        try:
            goto_view(page, "Поиск")
            page.locator("[data-search-input]").first.fill("lofi girl")
            page.wait_for_timeout(4500)
            page.get_by_role("button").filter(has_text="слушателей").first.click(timeout=5000)
            page.wait_for_timeout(4500)
            shot(page, "03c-artist-desktop-sc")
        except Exception as e:
            log(f"sc-artist: {e}")

        # Playback continuity: play a track, navigate, mini-player visible
        try:
            goto_view(page, "Поиск")
            page.locator("[data-search-input]").first.fill("faded alan walker")
            page.wait_for_timeout(4500)
            play = page.get_by_role("button").filter(has_text="Слушать").first
            play.click(timeout=6000)
            page.wait_for_timeout(6000)
            goto_view(page, "Главная")
            shot(page, "05-home-minidesktop-playing")
        except Exception as e:
            log(f"playback: {e}")

        # ══ DESKTOP 1280x800 ══
        page.set_viewport_size({"width": 1280, "height": 800})
        page.wait_for_timeout(900)
        shot(page, "11-home-1280")
        goto_view(page, "Поиск")
        page.locator("[data-search-input]").first.fill("daft punk")
        page.wait_for_timeout(4200)
        shot(page, "12-search-topresult-1280")

        # ══ MOBILE 390x844 ══
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(1200)
        goto_view(page, "Главная")
        page.wait_for_timeout(1200)
        shot(page, "20-home-mobile")
        goto_view(page, "Поиск")
        clear_search(page)
        shot(page, "21-search-empty-mobile")
        page.locator("[data-search-input]").first.fill("daft punk")
        page.wait_for_timeout(4500)
        shot(page, "21b-search-topresult-mobile")
        # artist on mobile
        try:
            page.locator(".mq-search-topresult").first.click(timeout=5000)
            page.wait_for_timeout(5000)
            shot(page, "22-artist-mobile")
        except Exception as e:
            log(f"artist-mobile: {e}")
        # album on mobile
        try:
            goto_view(page, "Поиск")
            page.locator("[data-search-input]").first.fill("random access memories")
            page.wait_for_timeout(4500)
            click_album_tile(page, "Random Access Memories")
            page.wait_for_timeout(5000)
            shot(page, "23-album-mobile")
            page.evaluate("window.scrollTo(0, 420)")
            page.wait_for_timeout(700)
            shot(page, "23b-album-mobile-tracklist")
        except Exception as e:
            log(f"album-mobile: {e}")

        # ══ MOBILE 360x800 ══
        page.set_viewport_size({"width": 360, "height": 800})
        page.wait_for_timeout(1000)
        goto_view(page, "Главная")
        page.wait_for_timeout(1000)
        shot(page, "30-home-360")
        goto_view(page, "Поиск")
        clear_search(page)
        page.locator("[data-search-input]").first.fill("daft punk")
        page.wait_for_timeout(4200)
        shot(page, "31-search-topresult-360")

        if errors:
            log(f"PAGE ERRORS: {len(errors)}")
            for e in errors[:8]:
                log(f"  {e[:180]}")
        else:
            log("PAGE ERRORS: 0")

        browser.close()

    with open(os.path.join(OUT, "_capture-log.txt"), "w") as f:
        f.write("\n".join(LOG) + "\n")
    print("\n".join(LOG))


if __name__ == "__main__":
    run()
