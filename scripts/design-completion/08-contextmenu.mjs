/* Context menu capture — right-click on a home track row */
import { chromium } from "playwright";
const BASE = "http://127.0.0.1:3112";
const OUT = "/home/z/my-project/download/qa-design-completion/after-local";
const browser = await chromium.launch({ headless: true });
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.locator("button", { hasText: "Демо-режим" }).first().click();
  await page.waitForSelector("[data-view='main'], nav", { timeout: 30000 });
  await page.waitForTimeout(4500);
  // right-click the "Текущий трек" hero or a track row title
  // The (…) TrackMoreButton opens the same unified menu (LMB primary trigger)
  const more = page.locator('button[aria-label^="Действия"]:visible').first();
  if (await more.count()) {
    await more.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1300);
    const menuOpen = await page.evaluate(() => !!document.querySelector("[role='menu'], .mq-menu-surface"));
    console.log("menu open:", menuOpen);
    if (menuOpen) await page.screenshot({ path: `${OUT}/d1440-09-contextmenu.png` });
    console.log("shot: d1440-09-contextmenu");
  } else {
    console.log("no Действия button visible");
  }
  await ctx.close();
}
await browser.close();
console.log("DONE");
