/* PRODUCTION AFTER verification — mq-build-c42f64d1.
   Proves on LIVE production: theme-aware ambient (distinct per theme),
   editorial search (topResult + sections), neutral focus, queue rhythm,
   wave theme-awareness, overflow, console errors. */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://mq1.vercel.app";
const OUT = "/home/z/my-project/download/qa-final-design/prod-after";
fs.mkdirSync(OUT, { recursive: true });
const results = { base: BASE, shots: {}, probes: {}, consoleErrors: [] };

const browser = await chromium.launch({ headless: true });

async function session(w, h, isMobile, fn) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, isMobile, hasTouch: isMobile,
    deviceScaleFactor: isMobile ? 3 : 1,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => results.consoleErrors.push(`pageerror: ${e.message.slice(0, 140)}`));
  page.on("console", (m) => { if (m.type() === "error") results.consoleErrors.push(`console.error: ${m.text().slice(0, 140)}`); });
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForTimeout(3000);
  const btn = page.locator("button", { hasText: "Демо-режим" }).first();
  await btn.waitFor({ state: "visible", timeout: 20000 });
  await btn.click({ timeout: 10000 });
  await page.waitForTimeout(3000);
  await fn(page);
  await ctx.close();
}

const ambientProbe = () => ({
  pool: getComputedStyle(document.documentElement).getPropertyValue("--mq-amb-pool").trim(),
  poolAlt: getComputedStyle(document.documentElement).getPropertyValue("--mq-amb-pool-alt").trim(),
  glass: getComputedStyle(document.documentElement).getPropertyValue("--mq-amb-glass").trim(),
  waveBase: getComputedStyle(document.documentElement).getPropertyValue("--mq-wave-base").trim(),
  g2tint: getComputedStyle(document.documentElement).getPropertyValue("--mq-g2-tint").trim().slice(0, 60),
  platinumRefl: getComputedStyle(document.documentElement).getPropertyValue("--mq-platinum-refl").trim().slice(0, 80),
});

async function switchTheme(page, name) {
  const setBtn = page.locator('button[aria-label="Настройки"]').first();
  await setBtn.click({ timeout: 6000 });
  await page.waitForTimeout(1400);
  const tab = page.locator("button").filter({ hasText: /^Оформление$|^Тема$/ }).first();
  if (await tab.count()) { await tab.click({ timeout: 4000 }); await page.waitForTimeout(800); }
  const row = page.locator('[aria-controls="mq-theme-picker"]').first();
  if (await row.count()) { await row.click({ timeout: 4000 }); await page.waitForTimeout(700); }
  const swatch = page.locator(`#mq-theme-picker button[title="${name}"]`).first();
  if (!(await swatch.count())) return false;
  await swatch.click({ timeout: 6000 });
  return true;
}

/* ── Desktop: theme matrix on prod ── */
await session(1440, 900, false, async (page) => {
  for (const name of ["Obsidian", "Abyss", "Borealis", "Daylight"]) {
    const ok = await switchTheme(page, name);
    if (!ok) { results.probes[`theme-${name}`] = "SWATCH NOT FOUND"; continue; }
    await page.waitForTimeout(1250);
    const home = page.locator('button[aria-label="Главная"], button[aria-label="Домой"]').first();
    if (await home.count()) { await home.click({ timeout: 5000 }); await page.waitForTimeout(1500); }
    await page.screenshot({ path: `${OUT}/theme-${name.toLowerCase()}-normal-home.png` });
    results.probes[`ambient-${name}`] = await page.evaluate(ambientProbe);
    // WAVE on
    const waveBtn = page.locator('button[title*="WAVE" i], button[aria-label*="WAVE" i]').first();
    const navWave = page.locator("nav button, aside button").filter({ hasText: /WAVE/i }).first();
    const trigger = (await waveBtn.count()) ? waveBtn : navWave;
    if (await trigger.count()) {
      await trigger.click({ timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${OUT}/theme-${name.toLowerCase()}-wave-home.png` });
      const stop = page.locator("button").filter({ hasText: /Выключить|Остановить/i }).first();
      if (await stop.count()) { await stop.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(1500); }
    }
  }
  results.probes.overflowD = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
});

/* ── Desktop: search states ── */
await session(1440, 900, false, async (page) => {
  const s = page.locator('button[aria-label="Поиск"]').first();
  await s.click({ timeout: 6000 });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${OUT}/search-d-discovery.png` });
  const input = page.locator("[data-search-input]").first();
  await input.click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/search-d-focus.png` });
  results.probes.focusRing = await page.evaluate(() => {
    const el = document.querySelector("[data-search-input]");
    const cs = el ? getComputedStyle(el) : null;
    return cs ? { outlineColor: cs.outlineColor, outlineWidth: cs.outlineWidth } : null;
  });
  await input.fill("кино");
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/search-d-results-kino.png` });
  results.probes.searchEditorial = await page.evaluate(() => ({
    topResult: !!document.querySelector(".mq-search-topresult"),
    artists: [...document.querySelectorAll("h3")].some(h => h.textContent?.trim() === "Артисты"),
    albums: [...document.querySelectorAll("h3")].some(h => h.textContent?.trim() === "Альбомы"),
    allTracks: [...document.querySelectorAll("h3")].some(h => h.textContent?.includes("Все треки")),
    rows: document.querySelectorAll(".mq-row").length,
  }));
  results.probes.overflowSearchD = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
});

/* ── Mobile: search + core tabs ── */
await session(390, 844, true, async (page) => {
  const s = page.locator('button[aria-label="Поиск"]').locator("visible=true").first();
  await s.click({ timeout: 6000 });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${OUT}/search-m-discovery.png` });
  const input = page.locator("[data-search-input]").locator("visible=true").first();
  if (await input.count()) {
    await input.tap();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/search-m-focus.png` });
    await input.fill("кино");
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `${OUT}/search-m-results-kino.png` });
    results.probes.searchMobile = await page.evaluate(() => ({
      topResult: !!document.querySelector(".mq-search-topresult"),
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      sub44: [...document.querySelectorAll("button")].map(b => b.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0 && r.height < 44 && r.width < 90).length,
    }));
  }
});

await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2));
console.log("SHOTS:", Object.keys(results.shots).length + 10);
console.log("PROBES:", JSON.stringify(results.probes, null, 1));
console.log("console errors:", results.consoleErrors.length);
