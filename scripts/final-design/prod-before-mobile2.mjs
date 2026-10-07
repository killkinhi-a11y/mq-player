/* BEFORE mobile search results — debug + capture */
import { chromium } from "playwright";
import fs from "node:fs";

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

// enumerate nav buttons
const navInfo = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("nav button, [class*='dock'] button, header button")];
  return btns.slice(0, 14).map(b => ({ label: b.getAttribute("aria-label") || b.textContent?.trim().slice(0, 18), tag: b.tagName }));
});
console.log("NAV:", JSON.stringify(navInfo));

const searchNav = page.locator("button[aria-label='Поиск']").first();
await searchNav.click({ timeout: 6000, force: true }).catch(e => console.log("nav click err", e.message.slice(0, 80)));
await page.waitForTimeout(1800);

const inputs = await page.evaluate(() =>
  [...document.querySelectorAll("input")].map(i => ({
    ph: i.placeholder?.slice(0, 40),
    dataAttr: i.getAttribute("data-search-input"),
    visible: i.offsetParent !== null,
  }))
);
console.log("INPUTS:", JSON.stringify(inputs));

const input = page.locator("input[data-search-input], input[placeholder*='иск' i]").first();
if (await input.count()) {
  await input.tap().catch(() => {});
  await page.waitForTimeout(400);
  await input.fill("кино");
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/before-m-search-results.png` });
  console.log("results shot OK");
} else {
  await page.screenshot({ path: `${OUT}/before-m-debug.png` });
  console.log("NO INPUT — debug shot saved");
}
await browser.close();
