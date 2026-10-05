/*
 * WAVE LIQUID AMBIENT — local production QA (standalone build on :3112).
 *
 * Captures the required screenshot matrix + behaviour/fps evidence:
 *   01 normal home (wave off)          04 wave + dark artwork
 *   02 wave active (default palette)   05 wave + colourful artwork
 *   03 track transition (mid-dissolve) 06 mobile wave
 *   + route navigation, wave OFF fade, 1920×1080 fps, console errors,
 *     overflow checks, engine mode/scale telemetry.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://127.0.0.1:3112";
const OUT = "/home/z/my-project/download/qa-wave-liquid";
fs.mkdirSync(OUT, { recursive: true });

const results = {};
const consoleErrors = [];

async function newPage(browser, w, h, isMobile = false) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    isMobile,
    hasTouch: isMobile,
    deviceScaleFactor: isMobile ? 3 : 1,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`console.error: ${m.text().slice(0, 200)}`);
  });
  return { ctx, page };
}

async function demoLogin(page) {
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const btn = page.locator("button", { hasText: "Демо-режим" }).first();
  await btn.waitFor({ state: "visible", timeout: 15000 });
  await btn.click();
  // wait for the main view (NavBar appears)
  await page.waitForSelector("nav, [data-view='main']", { timeout: 30000 });
  await page.waitForTimeout(2500);
}

const waveState = (page) =>
  page.evaluate(() => {
    const wrap = document.querySelector(".mq-wave-ambient");
    const root = document.querySelector(".mq-app-root");
    const canvas = document.querySelector(".mq-wave-canvas");
    const hook = window.__mqWaveAmbient;
    const cs = root ? getComputedStyle(root) : null;
    return {
      wrap: !!wrap,
      active: wrap?.getAttribute("data-active"),
      mode: wrap?.getAttribute("data-mode"),
      motion: wrap?.getAttribute("data-wave-motion"),
      scale: wrap?.getAttribute("data-scale"),
      canvas: canvas ? { w: canvas.width, h: canvas.height, cw: canvas.clientWidth, ch: canvas.clientHeight } : null,
      rootWave: root?.getAttribute("data-wave"),
      rootBg: cs?.backgroundColor,
      rootBgTranslucent: cs ? cs.backgroundColor.endsWith(", 0)") || cs.backgroundColor === "rgba(0, 0, 0, 0)" : null,
      vars: {
        c1: document.documentElement.style.getPropertyValue("--wave-color-1"),
        c2: document.documentElement.style.getPropertyValue("--wave-color-2"),
        c3: document.documentElement.style.getPropertyValue("--wave-color-3"),
        hl: document.documentElement.style.getPropertyValue("--wave-highlight"),
      },
      hook: hook ? { ...hook } : null,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

const measureFps = (page, frames = 120) =>
  page.evaluate((n) => {
    return new Promise((resolve) => {
      let count = 0;
      let last = performance.now();
      const deltas = [];
      const t0 = last;
      function step(t) {
        deltas.push(t - last);
        last = t;
        if (++count < n) requestAnimationFrame(step);
        else {
          const arr = deltas.slice(2); // drop warm-up
          const sorted = [...arr].sort((a, b) => a - b);
          resolve({
            frames: count,
            ms: Math.round(performance.now() - t0),
            avg: +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1),
            p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
            max: +Math.max(...arr).toFixed(1),
            fps: Math.round(1000 / (arr.reduce((a, b) => a + b, 0) / arr.length)),
          });
        }
      }
      requestAnimationFrame(step);
    });
  }, frames);

const satOf = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};

(async () => {
  const browser = await chromium.launch();

  /* ══════════ DESKTOP 1440×900 ══════════ */
  {
    const { ctx, page } = await newPage(browser, 1440, 900);
    await demoLogin(page);

    // 01 — normal home, wave OFF
    await page.screenshot({ path: `${OUT}/01-normal-home-desktop-1440.png` });
    results.waveOff = await waveState(page);
    results.waveOff.overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    // start the Wave
    const startBtn = page.locator('[aria-label="Запустить Волну"]').first();
    if (!(await startBtn.count())) {
      await page.locator('[aria-label="Волна"]').first().click();
    } else {
      await startBtn.click();
    }
    // wait until ambient becomes active (radio mode on + a track playing)
    await page.waitForFunction(
      () => document.querySelector(".mq-wave-ambient")?.getAttribute("data-active") === "true",
      null,
      { timeout: 60000 },
    );
    await page.waitForTimeout(2600); // fade-in 950ms + first frames + palette settle

    // 02 — wave active
    await page.screenshot({ path: `${OUT}/02-wave-active-desktop-1440.png` });
    results.waveOn = await waveState(page);
    results.fps1440 = await measureFps(page, 120);
    results.hookAfterStart = results.waveOn.hook;

    // skip tracks → collect palettes for dark/colourful artwork shots
    const palettes = [results.waveOn];
    let darkShot = false, colorfulShot = false;
    for (let i = 0; i < 7; i++) {
      const before = await waveState(page);
      await page.locator('[aria-label="Следующий трек"]').first().click();
      await page.waitForTimeout(400); // mid-dissolve
      if (i === 0) {
        // 03 — track transition (mid colour dissolve)
        await page.screenshot({ path: `${OUT}/03-track-transition-desktop-1440.png` });
        results.transitionMid = await waveState(page);
        results.transitionFrom = before.vars;
      }
      await page.waitForTimeout(1600); // transition done (950) + margin
      const after = await waveState(page);
      palettes.push(after);
      const s2 = satOf(after.vars.c2);
      const cover = await page.evaluate(() => window.__mqWaveAmbient?.palette?.c2);
      if (!darkShot && s2 < 0.35) {
        await page.screenshot({ path: `${OUT}/04-wave-dark-artwork-desktop-1440.png` });
        results.darkArtwork = { palette: after.vars, c2sat: +s2.toFixed(2), skipIndex: i };
        darkShot = true;
      }
      if (!colorfulShot && s2 >= 0.5) {
        await page.screenshot({ path: `${OUT}/05-wave-colorful-artwork-desktop-1440.png` });
        results.colorfulArtwork = { palette: after.vars, c2sat: +s2.toFixed(2), skipIndex: i };
        colorfulShot = true;
      }
      if (darkShot && colorfulShot) break;
    }
    results.skipPalettes = palettes.map((p) => p.vars);

    // route navigation while the wave is on
    await page.evaluate(() => {
      const lib = [...document.querySelectorAll("nav button, [role='tab'], button")].find((b) => b.textContent?.trim() === "Библиотека");
      lib?.click();
    });
    await page.waitForTimeout(1800);
    results.routeNav = await waveState(page);
    await page.screenshot({ path: `${OUT}/07-wave-route-nav-library.png` });
    await page.evaluate(() => {
      const home = [...document.querySelectorAll("nav button, [role='tab'], button")].find((b) => b.textContent?.trim() === "Главная");
      home?.click();
    });
    await page.waitForTimeout(1500);

    // wave OFF — fade-out capture
    await page.locator('[aria-label="Выключить волну"]').first().click();
    await page.waitForTimeout(420); // mid fade
    await page.screenshot({ path: `${OUT}/08-wave-off-fade-mid.png` });
    results.waveOffMid = await waveState(page);
    await page.waitForTimeout(1800);
    results.waveOffAfter = await waveState(page);
    await page.screenshot({ path: `${OUT}/09-wave-off-after.png` });

    await ctx.close();
  }

  /* ══════════ DESKTOP 1920×1080 ══════════ */
  {
    const { ctx, page } = await newPage(browser, 1920, 1080);
    await demoLogin(page);
    const startBtn = page.locator('[aria-label="Запустить Волну"]').first();
    if (!(await startBtn.count())) await page.locator('[aria-label="Волна"]').first().click();
    else await startBtn.click();
    await page.waitForFunction(
      () => document.querySelector(".mq-wave-ambient")?.getAttribute("data-active") === "true",
      null,
      { timeout: 60000 },
    );
    await page.waitForTimeout(3000);
    results.fps1920 = await measureFps(page, 120);
    results.state1920 = await waveState(page);
    await page.screenshot({ path: `${OUT}/10-wave-active-desktop-1920.png` });
    await ctx.close();
  }

  /* ══════════ MOBILE 390×844 ══════════ */
  {
    const { ctx, page } = await newPage(browser, 390, 844, true);
    await demoLogin(page);
    const startBtn = page.locator('[aria-label="Запустить Волну"]').first();
    if (!(await startBtn.count())) await page.locator('[aria-label="Волна"]').first().click();
    else await startBtn.click();
    await page.waitForFunction(
      () => document.querySelector(".mq-wave-ambient")?.getAttribute("data-active") === "true",
      null,
      { timeout: 60000 },
    );
    await page.waitForTimeout(2800);
    results.mobile = await waveState(page);
    results.fps390 = await measureFps(page, 90);
    await page.screenshot({ path: `${OUT}/06-wave-active-mobile-390.png` });
    results.mobileOverflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    await ctx.close();
  }

  await browser.close();

  results.consoleErrors = consoleErrors;
  fs.writeFileSync(`${OUT}/qa-results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch((e) => {
  fs.writeFileSync(`${OUT}/qa-results.json`, JSON.stringify({ fatal: String(e), consoleErrors }, null, 2));
  console.error(e);
  process.exit(1);
});
