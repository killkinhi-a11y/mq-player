/* Probe v4: dump ALL children of the sticky search bar + red-ish styles incl. gradients */
import { chromium } from "playwright";
const BASE = "http://127.0.0.1:3112";
const browser = await chromium.launch({ headless: true });
{
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
  const input = page.locator("input:visible").first();
  await input.waitFor({ state: "visible", timeout: 15000 });
  await input.fill("Поп");
  await page.waitForTimeout(2000);
  const probe = await page.evaluate(() => {
    const sticky = document.querySelector(".sticky.top-0");
    const out = { stickyRect: sticky.getBoundingClientRect().toJSON(), kids: [] };
    const isRed = (val) => {
      const m = (val || "").match(/rgba?\((\d+), (\d+), (\d+)/);
      return m && Number(m[1]) > 140 && Number(m[2]) < 110 && Number(m[3]) < 110;
    };
    const walk = (el, depth) => {
      if (out.kids.length > 40) return;
      for (const c of el.children) {
        const cs = getComputedStyle(c);
        const r = c.getBoundingClientRect();
        const redish = isRed(cs.backgroundColor) || isRed(cs.borderTopColor) || isRed(cs.borderBottomColor) || (cs.backgroundImage !== "none" && /e03131|224,\s*49/.test(cs.backgroundImage)) || /224, 49, 49/.test(cs.boxShadow);
        out.kids.push({
          d: depth, tag: c.tagName, cls: (c.className || "").toString().slice(0, 52),
          rect: `y${Math.round(r.top)}-${Math.round(r.bottom)} x${Math.round(r.left)}-${Math.round(r.right)}`,
          RED: redish ? "<<< RED" : "",
          bg: cs.backgroundColor.slice(0, 40), bImg: cs.backgroundImage === "none" ? "" : cs.backgroundImage.slice(0, 70),
          sh: cs.boxShadow === "none" ? "" : cs.boxShadow.slice(0, 80),
        });
        if (depth < 3) walk(c, depth + 1);
      }
    };
    walk(sticky, 0);
    // also: what is above the sticky (y 0-49)?
    const above = [];
    for (const e of document.querySelectorAll("body *")) {
      const r = e.getBoundingClientRect();
      if (r.height > 2 && r.height < 60 && r.top >= 0 && r.bottom <= 50 && r.width > 100) {
        above.push(`${e.tagName}.${(e.className || "").toString().slice(0, 40)} y${Math.round(r.top)}-${Math.round(r.bottom)}`);
        if (above.length > 8) break;
      }
    }
    out.above = above;
    return out;
  });
  console.log(JSON.stringify(probe, null, 1).slice(0, 4200));
  await ctx.close();
}
await browser.close();
