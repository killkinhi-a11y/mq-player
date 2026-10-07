import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("https://mq1.vercel.app", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
await page.locator("text=Демо-режим").first().click();
await page.waitForTimeout(3000);

// 1. Pixel-compare: NavBar strip vs page bg beside it
const pixel = await page.evaluate(() => {
  const nav = document.querySelector(".mq-glass2-nav");
  if (!nav) return { nav: false };
  const r = nav.getBoundingClientRect();
  const c = document.createElement("canvas");
  c.width = 2; c.height = Math.max(1, Math.round(r.height));
  const ctx = c.getContext("2d");
  // draw nothing — we can't rasterize DOM; use element screenshot instead
  return { nav: true, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
});
console.log("nav rect:", JSON.stringify(pixel));

// screenshot the navbar strip + a strip below the app content for comparison
const navEl = await page.locator(".mq-glass2-nav").first();
if (await navEl.count() > 0) {
  await navEl.screenshot({ path: "/tmp/nav-strip.png" });
}
// open a context menu on a track (search first)
await page.click('[aria-label="Поиск"]', { timeout: 8000 });
await page.waitForTimeout(1500);
await page.locator("[data-search-input]").fill("кино");
await page.waitForTimeout(2800);
const row = page.locator('[role="button"][aria-label^="Слушать"]').first();
if (await row.count() > 0) {
  await row.click({ button: "right" });
  await page.waitForTimeout(1000);
  const menu = page.locator(".mq-menu-surface").first();
  if (await menu.count() > 0) {
    const m = await menu.evaluate(el => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, img: (cs.backgroundImage || "").slice(0, 300), blur: cs.backdropFilter };
    });
    console.log("MENU:", JSON.stringify(m, null, 1));
    await menu.screenshot({ path: "/tmp/menu-strip.png" });
  } else console.log("MENU: not found");
}
await browser.close();
