/* Probe v2: fill query, then find WHAT paints red at the input bottom */
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
  const nav = page.locator("button[aria-label='Поиск']:visible").first();
  await nav.waitFor({ state: "visible", timeout: 15000 });
  await nav.click({ timeout: 8000 });
  await page.waitForSelector("[data-view='search']", { timeout: 15000 });
  await page.waitForTimeout(2000);
  const input = page.locator("input:visible").first();
  await input.waitFor({ state: "visible", timeout: 15000 });
  await input.fill("Поп");
  await page.waitForTimeout(1500);
  const probe = await page.evaluate(() => {
    const inp = document.querySelector("input");
    const r = inp.getBoundingClientRect();
    const out = { inputRect: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left) } };
    // sample points: just below input bottom, several x
    const pts = [];
    for (const dy of [1, 2, 3, 5]) {
      const els = document.elementsFromPoint(r.left + 80, r.bottom + dy);
      pts.push({ dy, els: els.slice(0, 3).map(e => `${e.tagName}.${(e.className || "").toString().slice(0, 46)}`) });
    }
    out.pointsBelow = pts;
    // scan top 140px for accent-colored painters
    const reds = [];
    for (const el of document.querySelectorAll("body *")) {
      const rect = el.getBoundingClientRect();
      if (rect.top > 150 || rect.width < 8) continue;
      const cs = getComputedStyle(el);
      const cands = [[cs.backgroundColor, "bg"], [cs.borderTopColor, "borderTop"], [cs.borderBottomColor, "borderBottom"], [cs.borderColor, "border"]];
      for (const [val, prop] of cands) {
        const m = (val || "").match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/);
        if (m && Number(m[1]) > 150 && Number(m[2]) < 110 && Number(m[3]) < 110 && (m[4] === undefined || Number(m[4]) > 0.4)) {
          reds.push({ tag: el.tagName, cls: (el.className || "").toString().slice(0, 56), prop, val, top: Math.round(rect.top), h: Math.round(rect.height), w: Math.round(rect.width) });
          break;
        }
      }
      if (reds.length > 10) break;
    }
    out.reds = reds;
    return out;
  });
  console.log(JSON.stringify(probe, null, 1).slice(0, 2400));
  await page.screenshot({ path: "/tmp/probe-search-pop.png" });
  // pixel scan for the red line
  const scan = await page.evaluate(() => null);
  await ctx.close();
}
await browser.close();
