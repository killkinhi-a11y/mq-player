/* Probe v3: identify the element painting red at CSS(66,56) with query */
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
    const chain = document.elementsFromPoint(66, 56);
    const dump = chain.slice(0, 6).map((e) => {
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return {
        tag: e.tagName, cls: (e.className || "").toString().slice(0, 60),
        rect: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
        bg: cs.backgroundColor, bgImg: cs.backgroundImage.slice(0, 90),
        borderTop: cs.borderTopColor, borderBottom: cs.borderBottomColor,
        shadow: cs.boxShadow.slice(0, 110),
        pseudo: (() => { const p = getComputedStyle(e, "::after"); return p.backgroundColor + "|" + p.backgroundImage.slice(0, 60) + "|" + p.boxShadow.slice(0, 40); })(),
      };
    });
    return { dump };
  });
  console.log(JSON.stringify(probe, null, 1));
  await ctx.close();
}
await browser.close();
