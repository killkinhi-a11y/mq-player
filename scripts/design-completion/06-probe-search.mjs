/* Probe: what paints the red border on the search input? */
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
  const probe = await page.evaluate(() => {
    const input = document.querySelector("input[type='search'], [data-search-input]");
    if (!input) return { found: false };
    const cs = getComputedStyle(input);
    const el = input.closest("div");
    const cs2 = el ? getComputedStyle(el) : null;
    // walk up: find any ancestor/child painting a red-ish border
    const reds = [];
    const check = (node) => {
      for (const n of node.querySelectorAll("*")) {
        const s = getComputedStyle(n);
        const b = s.borderColor;
        if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) {
          const m = b.match(/rgba?\((\d+), (\d+), (\d+)/);
          if (m && Number(m[1]) > 140 && Number(m[2]) < 110 && Number(m[3]) < 110) {
            reds.push({ tag: n.tagName, cls: (n.className || "").toString().slice(0, 50), border: b, boxShadow: s.boxShadow.slice(0, 60) });
          }
        }
      }
    };
    check(document);
    return {
      found: true,
      inputBorder: cs.borderColor,
      inputBorderWidth: cs.borderWidth,
      inputOutline: cs.outlineColor,
      parentBorder: cs2 ? cs2.borderColor : null,
      parentShadow: cs2 ? cs2.boxShadow.slice(0, 80) : null,
      redElements: reds.slice(0, 6),
    };
  });
  console.log(JSON.stringify(probe, null, 1));
  await ctx.close();
}
await browser.close();
