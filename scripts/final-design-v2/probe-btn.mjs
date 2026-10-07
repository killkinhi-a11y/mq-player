import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("https://mq1.vercel.app", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
await page.locator("text=Демо-режим").first().click();
await page.waitForTimeout(2600);
await page.click('[aria-label="Поиск"]', { timeout: 8000 });
await page.waitForTimeout(4500);
const probe = await page.evaluate(() => {
  const btn = document.querySelector(".mq-platinum-btn");
  if (!btn) return { found: false };
  const cs = getComputedStyle(btn);
  const r = btn.getBoundingClientRect();
  // sample the rendered pixel color at the button center
  return {
    found: true,
    visible: r.width > 0 && r.height > 0,
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    backgroundColor: cs.backgroundColor,
    backgroundImage: (cs.backgroundImage || "").slice(0, 200),
    border: cs.borderColor,
    boxShadow: (cs.boxShadow || "").slice(0, 160),
    color: cs.color,
  };
});
console.log(JSON.stringify(probe, null, 1));
await browser.close();
