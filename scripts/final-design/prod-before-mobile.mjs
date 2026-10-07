/* BEFORE mobile search — production retry with robust nav taps */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://mq1.vercel.app";
const OUT = "/home/z/my-project/download/qa-final-design/prod";
const results = { shots: {} };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
});
const page = await ctx.newPage();
await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
const btn = page.locator("button", { hasText: "Демо-режим" }).first();
await btn.waitFor({ state: "visible", timeout: 15000 });
await btn.click({ timeout: 8000 });
await page.waitForTimeout(2200);

// mobile nav = bottom dock; tap Поиск by text with force
const searchNav = page.locator("nav button, [class*='dock'] button").filter({ hasText: "Поиск" }).first();
if (await searchNav.count()) {
  await searchNav.click({ timeout: 6000, force: true }).catch(() => {});
}
await page.waitForTimeout(1600);
await page.screenshot({ path: `${OUT}/before-m-search-empty.png` });
results.shots["before-m-search-empty"] = true;

const input = page.locator("[data-search-input], input[placeholder*='иск' i]").first();
if (await input.count()) {
  await input.tap();
  await page.waitForTimeout(400);
  await input.fill("кино");
  await page.waitForTimeout(2400);
  await page.screenshot({ path: `${OUT}/before-m-search-results.png` });
  results.shots["before-m-search-results"] = true;
}
await browser.close();
fs.writeFileSync(`${OUT}/report-mobile-before.json`, JSON.stringify(results, null, 2));
console.log("DONE", Object.keys(results.shots));
