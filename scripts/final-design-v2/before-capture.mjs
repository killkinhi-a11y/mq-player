/*
 * FINAL DESIGN COMPLETION V2 — BEFORE capture from PRODUCTION
 * (mq-build-aba25a28): Search BEFORE QUERY state, desktop + mobile,
 * plus Home for the final before/after set.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://mq1.vercel.app";
const OUT = "/home/z/my-project/download/qa-v2/before";
fs.mkdirSync(OUT, { recursive: true });

const results = { shots: {}, consoleErrors: [], probes: {} };

async function newPage(browser, w, h, isMobile = false) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    ...(isMobile
      ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }
      : {}),
  });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") results.consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => results.consoleErrors.push("PAGEERROR " + String(e).slice(0, 200)));
  return { ctx, page };
}

async function enterDemo(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  const demo = page.locator("text=Демо-режим").first();
  if (await demo.isVisible({ timeout: 8000 }).catch(() => false)) {
    await demo.click();
    await page.waitForTimeout(2500);
  }
}

async function gotoSearch(page) {
  // Try known nav hooks, fall back to text match
  const candidates = [
    () => page.click('[aria-label="Поиск"]', { timeout: 3000 }),
    () => page.click('[data-mq-nav="search"]', { timeout: 3000 }),
    () => page.locator('button[aria-label="Поиск"]').last().click({ timeout: 3000 }),
    () => page.locator('a:has-text("Поиск")').first().click({ timeout: 3000 }),
  ];
  for (const c of candidates) { if (await c().then(() => true).catch(() => false)) return true; }
  return false;
}

const browser = await chromium.launch();

// ── DESKTOP 1440×900 ──
{
  const { ctx, page } = await newPage(browser, 1440, 900);
  await enterDemo(page);
  const okSearch = await gotoSearch(page);
  await page.waitForTimeout(2400);
  await page.screenshot({ path: `${OUT}/d1440-search-before-cold.png` });
  results.probes.searchNav = okSearch;
  // Type a query → results (AFTER state)
  const input = page.locator("[data-search-input]");
  await input.fill("кино");
  await page.waitForTimeout(2800);
  await page.screenshot({ path: `${OUT}/d1440-search-after-kino.png` });
  // Clear → warm before-query (with history)
  await input.fill("");
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${OUT}/d1440-search-before-warm.png` });
  // Home for the set
  const homeCandidates = [
    () => page.click('[aria-label="Главная"]', { timeout: 3000 }),
    () => page.locator('button[aria-label="Главная"]').first().click({ timeout: 3000 }),
  ];
  for (const c of homeCandidates) { if (await c().then(() => true).catch(() => false)) break; }
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/d1440-home.png` });
  results.probes.buildId = await page.evaluate(() => (window.__NEXT_DATA__?.buildId) || "unknown").catch(() => "unknown");
  results.probes.dOverflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await ctx.close();
}

// ── MOBILE 390×844 ──
{
  const { ctx, page } = await newPage(browser, 390, 844, true);
  await enterDemo(page);
  await gotoSearch(page);
  await page.waitForTimeout(2400);
  await page.screenshot({ path: `${OUT}/m390-search-before-cold.png` });
  const input = page.locator("[data-search-input]");
  await input.fill("кино");
  await page.waitForTimeout(2800);
  await page.screenshot({ path: `${OUT}/m390-search-after-kino.png` });
  results.probes.mOverflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2));
console.log("DONE", JSON.stringify({ consoleErrors: results.consoleErrors.length, probes: results.probes }));
