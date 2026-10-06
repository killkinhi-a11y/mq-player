import { chromium } from "playwright";
const BASE = "http://localhost:3210";
const browser = await chromium.launch({ headless: true });
// desktop settings debug
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForTimeout(2500);
  await page.locator("button", { hasText: "Демо-режим" }).first().click();
  await page.waitForTimeout(2500);
  await page.locator('button[aria-label="Настройки"]').first().click();
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => ({
    view: document.querySelector("[data-view]")?.getAttribute("data-view"),
    ranges: document.querySelectorAll('input[type="range"]').length,
    h1: document.querySelector("h1, h2")?.textContent?.slice(0, 60),
    text: document.body.innerText.slice(0, 200).replace(/\n/g, " | "),
  }));
  console.log("SETTINGS:", JSON.stringify(info, null, 1));
  await ctx.close();
}
// mobile debug
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForTimeout(2500);
  await page.locator("button", { hasText: "Демо-режим" }).first().click();
  await page.waitForTimeout(2500);
  const dock = await page.evaluate(() => [...document.querySelectorAll("button")].map(b => b.getAttribute("aria-label") || b.textContent?.trim()).filter(Boolean).slice(0, 25));
  console.log("MOBILE BUTTONS:", JSON.stringify(dock));
  await page.locator('button:has-text("Поиск")').first().click({ timeout: 8000 }).catch(e => console.log("click err", e.message.slice(0, 80)));
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => ({
    searchInput: !!document.querySelector("[data-search-input]"),
    view: document.querySelector("[data-view]")?.getAttribute("data-view"),
  }));
  console.log("MOBILE AFTER:", JSON.stringify(info));
  await ctx.close();
}
await browser.close();
