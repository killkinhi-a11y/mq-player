import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("https://mq1.vercel.app", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2500);
await page.locator("text=Демо-режим").first().click();
await page.waitForTimeout(3000);
const probe = await page.evaluate(() => {
  const glass = document.querySelector(".mq-glass2-player, .mq-glass2, .mq-glass2-nav");
  const menu = document.querySelector(".mq-menu-surface");
  const out = {};
  if (glass) {
    const cs = getComputedStyle(glass);
    out.glassClass = glass.className.slice(0, 40);
    out.glassBgColor = cs.backgroundColor;
    out.glassBgImage = (cs.backgroundImage || "").slice(0, 260);
  }
  if (menu) {
    const cs = getComputedStyle(menu);
    out.menuBgColor = cs.backgroundColor;
    out.menuBgImage = (cs.backgroundImage || "").slice(0, 260);
  }
  return out;
});
console.log(JSON.stringify(probe, null, 1));
await browser.close();
