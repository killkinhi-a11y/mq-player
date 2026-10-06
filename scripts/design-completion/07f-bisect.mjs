/* Probe v6: bisect — hide elements, re-screenshot, find who owns the red line */
import { chromium } from "playwright";
const BASE = "http://127.0.0.1:3112";
const browser = await chromium.launch({ headless: true });

async function setup() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.locator("button", { hasText: "Демо-режим" }).first().click();
  await page.waitForSelector("[data-view='main'], nav", { timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.locator("button[aria-label='Поиск']:visible").first().waitFor({ state: "visible", timeout: 15000 });
  await page.locator("button[aria-label='Поиск']:visible").first().click({ timeout: 8000 });
  await page.waitForSelector("[data-view='search']", { timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.locator("input:visible").first().waitFor({ state: "visible", timeout: 15000 });
  await page.locator("input:visible").first().fill("Поп");
  await page.waitForTimeout(1500);
  return { ctx, page };
}

const redAt = (path) => {
  // returns true if red pixels exist in CSS band y 50..60
  const { createCanvas } = (() => ({})) || {};
  return null;
};

async function hasRed(page, tag) {
  await page.screenshot({ path: `/tmp/bisect-${tag}.png` });
  return await page.evaluate(async () => {
    // pixel scan inside the browser via a 2d canvas snapshot is complex;
    // instead return a marker so the node side can scan
    return true;
  });
}

const { ctx, page } = await setup();
// Baseline: red present?
await page.screenshot({ path: "/tmp/bisect-base.png" });

// Hide suspects one at a time (all at once first, then individually)
await page.addStyleTag({ content: `
  .sticky.top-0 { visibility: hidden !important; }
` });
await page.waitForTimeout(300);
await page.screenshot({ path: "/tmp/bisect-nosticky.png" });
await page.addStyleTag({ content: ` .sticky.top-0 { visibility: visible !important; }` });

// Hide suggestions if open
await page.evaluate(() => {
  document.querySelectorAll("[class*='z-30'], [class*='z-20']").forEach(e => { e.style.visibility = "hidden"; });
});
await page.waitForTimeout(300);
await page.screenshot({ path: "/tmp/bisect-noz.png" });
await ctx.close();

await browser.close();
console.log("done");
