/* Capture the missing prod desktop tab shots: search/library/settings */
import { chromium } from "playwright";

const BASE = "https://mq1.vercel.app";
const OUT = "/home/z/my-project/download/qa-final-pass/prod-after";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 40000 });
await page.waitForTimeout(3000);
const btn = page.locator("button", { hasText: "Демо-режим" }).first();
await btn.waitFor({ state: "visible", timeout: 20000 });
await btn.click();
await page.waitForSelector("nav, [data-view='main']", { timeout: 30000 });
await page.waitForTimeout(3000);

for (const [name, sel] of [["search", 'button[aria-label="Поиск"]'], ["library", 'button[aria-label="Библиотека"]'], ["settings", 'button[aria-label="Настройки"]']]) {
  const b = page.locator(sel).first();
  console.log(name, "count:", await b.count());
  if (await b.count()) {
    await b.click({ timeout: 6000 }).catch((e) => console.log(name, "click fail", e.message.slice(0, 60)));
    await page.waitForTimeout(2000);
    if (name === "search") {
      const inp = page.locator("input[type='search'], [data-search-input] input").first();
      if (await inp.count()) { await inp.fill("музыка"); await page.waitForTimeout(2000); }
    }
    await page.screenshot({ path: `${OUT}/d1440-06-${name}.png` });
    console.log("shot d1440-06-" + name);
  }
}
await browser.close();
