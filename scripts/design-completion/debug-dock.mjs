/* Debug: dump mobile dock contents + desktop playlists state */
import { chromium } from "playwright";

const BASE = "https://mq1.vercel.app";
async function demoLogin(page) {
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForTimeout(3500);
  const btn = page.locator("button", { hasText: "Демо-режим" }).first();
  await btn.waitFor({ state: "visible", timeout: 25000 });
  await btn.click();
  await page.waitForSelector("[data-view='main'], nav", { timeout: 40000 });
  await page.waitForTimeout(5000);
}
const browser = await chromium.launch({ headless: true });
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await demoLogin(page);
  const info = await page.evaluate(() => {
    const dock = document.querySelector("[data-mq-dock]");
    const navs = [...document.querySelectorAll("nav, [data-mq-dock], [aria-label]")].slice(0, 30).map((n) => `${n.tagName}.${(n.className || "").toString().slice(0, 30)} aria=${n.getAttribute("aria-label")}`);
    return {
      dock: dock ? "yes" : "no",
      view: document.querySelector("[data-view]")?.getAttribute("data-view"),
      navs,
      bodyClass: document.body.className.slice(0, 80),
      w: document.documentElement.clientWidth,
    };
  });
  console.log(JSON.stringify(info, null, 1).slice(0, 2200));
  await ctx.close();
}
await browser.close();
