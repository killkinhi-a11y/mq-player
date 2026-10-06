/*
 * FINAL REFINEMENT — computed-style geometry probe (deterministic).
 * Verifies the material decisions LIVE on the running build:
 *   - FeaturedCard reason label color (must be muted, not accent)
 *   - Platinum play button flatness (no radial-gradient, <=1 inset)
 *   - Card surface opacity (mat-2/3 must be OPAQUE)
 *   - Glass blur token (<=16px), capsule/nav/dock blur live
 *   - ProgressBar fill (platinum gradient, not accent)
 *   - NavBar nav container (no border)
 *   - FeaturedCard width vs viewport (dead-zone check)
 *   - Mobile: dock height, overflowX
 */
import { chromium } from "playwright";

const BASE = process.env.QA_BASE || "http://127.0.0.1:3112";

async function demoLogin(page) {
  for (let i = 0; i < 6; i++) {
    try { await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 20000 }); break; }
    catch { await page.waitForTimeout(3000); }
  }
  await page.waitForTimeout(2500);
  const btn = page.locator("button", { hasText: "Демо-режим" }).first();
  await btn.waitFor({ state: "visible", timeout: 15000 });
  await btn.click();
  await page.waitForSelector("nav, [data-view='main']", { timeout: 30000 });
  await page.waitForTimeout(2500);
  try {
    await page.waitForSelector("article", { timeout: 12000 });
    await page.waitForFunction(() => !document.querySelector(".animate-pulse, [data-skeleton]"), { timeout: 8000 });
  } catch {}
  await page.waitForTimeout(400);
}

const browser = await chromium.launch({ headless: true });
const report = {};

// ── DESKTOP 1440 ──
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await demoLogin(page);
  report.desktop = await page.evaluate(() => {
    const out = {};
    const cs = (el, P) => (el ? getComputedStyle(el)[P] : null);

    // FeaturedCard reason label (first article's .mq-t-label)
    const art = document.querySelector("article");
    const reasonEl = art?.querySelector(".mq-t-label");
    out.featured_reason_color = cs(reasonEl, "color");

    // Featured card geometry (dead-zone check)
    if (art) {
      const r = art.getBoundingClientRect();
      out.featured_width = Math.round(r.width);
      out.viewport_w = window.innerWidth;
      out.featured_fill = Math.round((r.width / window.innerWidth) * 100) + "%";
    }

    // Card surface opacity (featured card uses mat-3 via inline var)
    out.mat3_bg = getComputedStyle(document.documentElement).getPropertyValue("--mq-mat-3-bg").trim();
    out.mat2_bg = getComputedStyle(document.documentElement).getPropertyValue("--mq-mat-2-bg").trim();
    // computed on the card itself:
    out.featured_bg = cs(art, "backgroundColor");
    out.featured_bg_alpha = (() => {
      const m = out.featured_bg?.match(/rgba?\([^)]*\)/);
      if (!m) return null;
      const a = m[0].match(/,\s*([\d.]+)\s*\)$/);
      return a ? Number(a[1]) : 1;
    })();
    out.featured_shadow = cs(art, "boxShadow")?.slice(0, 90);

    // Platinum play button in PlayerBar capsule
    const plat = document.querySelector(".mq-player-capsule .mq-platinum-btn");
    out.playerbar_play_bgImage = cs(plat, "backgroundImage")?.slice(0, 140);
    out.playerbar_play_shadow = cs(plat, "boxShadow");
    out.playerbar_play_inset_count = (cs(plat, "boxShadow")?.match(/inset/g) || []).length;

    // Progress fill
    const fill = document.querySelector(".mq-player-capsule [role='slider'] > div:nth-child(3)")
      || document.querySelector(".mq-player-capsule [role='slider'] div[style*='width']");
    out.progress_fill_bg = cs(fill, "backgroundImage") || cs(fill, "backgroundColor");

    // Glass blur token + live blur on capsule
    out.g2_blur = getComputedStyle(document.documentElement).getPropertyValue("--mq-g2-blur").trim();
    const capsule = document.querySelector(".mq-player-capsule");
    out.capsule_blur = cs(capsule, "backdropFilter") || cs(capsule, "webkitBackdropFilter");

    // NavBar: inner nav container border + active tab
    const nav = document.querySelector("header nav");
    out.nav_border = cs(nav, "borderTopWidth") + " " + cs(nav, "borderTopColor");
    const activeTab = document.querySelector("header nav button[data-active='true'], header nav button[aria-current='page']");
    out.nav_active_border = cs(activeTab, "borderTopWidth");
    out.nav_active_bg = cs(activeTab, "backgroundColor");

    // Platinum WAVE wordmark
    const wm = document.querySelector(".mq-platinum-text");
    out.wordmark_exists = !!wm;

    // overflow
    out.overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    return out;
  });

  // WAVE on → platinum hero button + solid mat cards
  const waveBtn = page.locator('button[aria-label*="WAVE" i]').first();
  await waveBtn.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2800);
  report.wave = await page.evaluate(() => {
    const out = {};
    const plat = document.querySelector(".mq-wave .mq-platinum-btn");
    out.wave_play_bgImage = plat ? getComputedStyle(plat).backgroundImage.slice(0, 120) : null;
    out.wave_play_shadow = plat ? getComputedStyle(plat).boxShadow : null;
    out.wave_play_inset_count = plat ? (getComputedStyle(plat).boxShadow.match(/inset/g) || []).length : null;
    const fill = document.querySelector(".mq-wave [role='progressbar'] > div");
    out.wave_progress_bg = fill ? getComputedStyle(fill).backgroundImage || getComputedStyle(fill).backgroundColor : null;
    const art = document.querySelector(".mq-wave-art");
    out.wave_art_blur = art ? getComputedStyle(art).backdropFilter : null;
    out.liquid_scene = !!document.querySelector(".mq-wave-liquid[data-active='true'], .mq-wave-liquid");
    out.wave_present = !!document.querySelector(".mq-wave, [data-testid='wave-home']");
    return out;
  });
  await ctx.close();
}

// ── MOBILE 390 ──
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await demoLogin(page);
  await page.waitForTimeout(800);
  report.mobile = await page.evaluate(() => {
    const out = {};
    out.overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    // dock: the fixed bottom bar (nav inside it)
    const dock = document.querySelector(".lg\\:hidden.fixed.bottom-0, body > div.fixed.lg\\:hidden");
    const nav = document.querySelector("div.fixed.lg\\:hidden nav, .fixed[class*='lg:hidden'] nav");
    const anyDock = document.querySelector(".fixed.lg\\:hidden");
    if (anyDock) {
      const r = anyDock.getBoundingClientRect();
      out.dock_h = Math.round(r.height);
      out.dock_bottom = Math.round(r.bottom - window.innerHeight);
    }
    out.dock_blur = anyDock ? getComputedStyle(anyDock).backdropFilter : null;
    // mobile hero play button = platinum?
    const heroPlay = document.querySelector("[data-mq-hero] .mq-platinum-btn");
    out.hero_play_is_platinum = !!heroPlay;
    out.hero_play_shadow = heroPlay ? getComputedStyle(heroPlay).boxShadow : null;
    // mobile hero reason label color
    const reason = document.querySelector("[data-mq-hero] .mq-t-label");
    out.hero_reason_color = reason ? getComputedStyle(reason).color : null;
    // hero progress strip fill
    const strip = document.querySelector("[data-mq-hero] [role='progressbar'] > div");
    out.hero_progress_bg = strip ? getComputedStyle(strip).backgroundImage || getComputedStyle(strip).backgroundColor : null;
    return out;
  });
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
