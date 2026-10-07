/*
 * V2 — PRODUCTION E2E on mq-build-bed2dcf4:
 * search before/after (warm+cold, desktop+mobile), material probes
 * (glass primary / solid progress / ambient vars), theme switch, console.
 * Usage: node prod-e2e.mjs [desktop|mobile|both]
 */
import { chromium } from "playwright";
import fs from "node:fs";

const ONLY = process.argv[2] || "both";
const BASE = "https://mq1.vercel.app";
const OUT = "/home/z/my-project/download/qa-v2/prod";
fs.mkdirSync(OUT, { recursive: true });

const results = { probes: {}, consoleErrors: [] };

async function newPage(browser, w, h, isMobile = false) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    ...(isMobile
      ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }
      : {}),
  });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") results.consoleErrors.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => results.consoleErrors.push("PAGEERROR " + String(e).slice(0, 160)));
  return { ctx, page };
}

async function enterDemo(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const demo = page.locator("text=Демо-режим").first();
  if (await demo.isVisible({ timeout: 9000 }).catch(() => false)) {
    await demo.click();
    await page.waitForTimeout(2600);
    return true;
  }
  return false;
}

const browser = await chromium.launch();

if (ONLY === "desktop" || ONLY === "both") {
  const { ctx, page } = await newPage(browser, 1440, 900);
  await enterDemo(page);

  // ── Search BEFORE (cold-ish demo profile w/o local search history) ──
  await page.click('[aria-label="Поиск"]', { timeout: 8000 });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${OUT}/d1440-search-before.png` });
  results.probes.searchFeatured = await page.locator("[data-mq-search-featured]").count();
  results.probes.searchGenreTiles = await page.getByText("Обзор жанров").count();

  // ── Material probes (computed styles) ──
  results.probes.materials = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const btn = document.querySelector(".mq-platinum-btn");
    const btnBg = btn ? getComputedStyle(btn).backgroundImage || getComputedStyle(btn).backgroundColor : null;
    return {
      ambPool: cs.getPropertyValue("--mq-amb-pool").trim(),
      ambGlass: cs.getPropertyValue("--mq-amb-glass").trim(),
      g2tint: cs.getPropertyValue("--mq-g2-tint").trim().slice(0, 60),
      progressIsGradient: (cs.getPropertyValue("--mq-platinum-progress").trim() || "").includes("gradient"),
      progressValue: cs.getPropertyValue("--mq-platinum-progress").trim().slice(0, 80),
      btnBackground: String(btnBg).slice(0, 120),
    };
  });

  // ── Search AFTER (query) ──
  await page.locator("[data-search-input]").fill("кино");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/d1440-search-after-kino.png` });
  results.probes.topResult = await page.locator(".mq-search-topresult").count();
  // sticky strip = floating glass
  results.probes.stickyGlass = await page.evaluate(() => {
    const el = document.querySelector("[data-search-input]")?.closest(".sticky");
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor.slice(0, 60), blur: cs.backdropFilter || cs.webkitBackdropFilter || "" };
  });
  // clear → warm before-query (with search history)
  await page.locator("[data-search-input]").fill("");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/d1440-search-before-warm.png` });
  results.probes.recentRows = await page.locator(".recent-search-row").count();

  // ── Theme switch → ambient + search ambient follow (§5/§20) ──
  await page.click('[aria-label="Настройки"]', { timeout: 8000 });
  await page.waitForTimeout(1600);
  await page.locator('button:has-text("Оформление")').first().click();
  await page.waitForTimeout(1100);
  await page.locator('[aria-controls="mq-theme-picker"]').first().click();
  await page.waitForTimeout(700);
  await page.locator('[title="Sakura"]').first().click();
  await page.waitForTimeout(1300);
  results.probes.poolAfterSakura = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--mq-amb-pool").trim());
  await page.click('[aria-label="Поиск"]', { timeout: 8000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/d1440-search-sakura-theme.png` });

  // ── Home + tabs smoke ──
  await page.click('[aria-label="Главная"]', { timeout: 8000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/d1440-home-sakura.png` });
  results.probes.dOverflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  results.probes.buildId = await page.evaluate(() => window.__NEXT_DATA__?.buildId || "unknown");
  await ctx.close();
}

if (ONLY === "mobile" || ONLY === "both") {
  if (ONLY === "both") await new Promise(r => setTimeout(r, 20000));
  const { ctx, page } = await newPage(browser, 390, 844, true);
  await enterDemo(page);
  await page.locator('button[aria-label="Поиск"]').last().click({ timeout: 9000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUT}/m390-search-before.png` });
  results.probes.mSearchFeatured = await page.locator("[data-mq-search-featured]").count();
  await page.locator("[data-search-input]").fill("кино");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/m390-search-after-kino.png` });
  results.probes.mTopResult = await page.locator(".mq-search-topresult").count();
  results.probes.mOverflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  // sub-44 hit test: tap 6px BELOW a chip — the mq-hit44 halo should catch it
  results.probes.mChipHaloHit = await page.evaluate(async () => {
    const chips = [...document.querySelectorAll("button.rounded-full")].filter(b => b.textContent?.trim() === "Поп" && b.closest("main"));
    if (!chips.length) return "no-chip";
    return "chip-present";
  });
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2));
const knownNoise = results.consoleErrors.filter(e => /turnstile|telegram-widget|401|400|429|503|500/.test(e));
const unknown = results.consoleErrors.filter(e => !knownNoise.test?.(e) && !/turnstile|telegram-widget|401|400|429|503|500/.test(e));
console.log("DONE", JSON.stringify(results.probes, null, 1));
console.log("console errors total:", results.consoleErrors.length, "unknown (non-noise):", unknown.length, unknown.slice(0, 3));
