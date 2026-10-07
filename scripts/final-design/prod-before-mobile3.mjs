/* BEFORE mobile search results — visible-nav fix */
import { chromium } from "playwright";

const BASE = "https://mq1.vercel.app";
const OUT = "/home/z/my-project/download/qa-final-design/prod";

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

// visible Поиск button (mobile dock, not the hidden desktop sidebar one)
const searchNav = page.locator('button[aria-label="Поиск"]').locator("visible=true").first();
await searchNav.click({ timeout: 6000 }).catch(e => console.log("nav err", e.message.slice(0, 60)));
await page.waitForTimeout(1800);

const input = page.locator("input[data-search-input], input[placeholder*='иск' i]").locator("visible=true").first();
if (await input.count()) {
  await input.tap().catch(() => {});
  await page.waitForTimeout(400);
  await input.fill("кино");
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/before-m-search-results.png` });
  console.log("results shot OK");
} else {
  console.log("still no input");
}
await browser.close();
