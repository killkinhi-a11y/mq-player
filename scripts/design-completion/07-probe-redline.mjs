/* Probe: which element paints the red line under the search input? */
import { chromium } from "playwright";
const BASE = "http://127.0.0.1:3112";
const browser = await chromium.launch({ headless: true });
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  await page.locator("button", { hasText: "Демо-режим" }).first().click();
  await page.waitForTimeout(4500);
  await page.locator("button[aria-label='Поиск']:visible").first().click();
  await page.waitForTimeout(1800);
  const input = page.locator("input[type='search'], [data-search-input] input, input[placeholder*='иск' i]").first();
  await input.waitFor({ state: "visible", timeout: 15000 });
  await input.fill("Поп");
  await page.waitForTimeout(1200);
  const probe = await page.evaluate(() => {
    // element at the red line position: CSS y≈55 under the input
    const input = document.querySelector("input[type='search']");
    const r = input.getBoundingClientRect();
    const y = r.bottom + 4;
    const els = document.elementsFromPoint(r.left + 60, y);
    // also scan for any element with a red-ish computed background/border in the top 120px
    const reds = [];
    for (const el of document.querySelectorAll("body *")) {
      const rect = el.getBoundingClientRect();
      if (rect.top > 130 || rect.bottom < 0) continue;
      const cs = getComputedStyle(el);
      for (const [prop, val] of [["backgroundColor", cs.backgroundColor], ["borderTopColor", cs.borderTopColor], ["backgroundImage", cs.backgroundImage]]) {
        const m = (val || "").match(/rgba?\((\d+), (\d+), (\d+)/);
        if (m && Number(m[1]) > 150 && Number(m[2]) < 110 && Number(m[3]) < 110) {
          reds.push({ tag: el.tagName, cls: (el.className || "").toString().slice(0, 60), prop, val: val.slice(0, 50), top: Math.round(rect.top), h: Math.round(rect.height), w: Math.round(rect.width) });
          break;
        }
      }
      if (reds.length > 8) break;
    }
    return { inputRect: { top: Math.round(r.top), bottom: Math.round(r.bottom) }, probeY: Math.round(y), atPoint: els.slice(0, 4).map(e => `${e.tagName}.${(e.className || "").toString().slice(0, 40)}`), reds };
  });
  console.log(JSON.stringify(probe, null, 1));
  await ctx.close();
}
await browser.close();
