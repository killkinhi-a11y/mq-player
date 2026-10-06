/* DESIGN COMPLETION — BEFORE gap fill v4: mobile full player via Открыть плеер */
import { chromium } from "playwright";

const BASE = "https://mq1.vercel.app";
const OUT = "/home/z/my-project/download/qa-design-completion/before";

async function demoLogin(page) {
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForTimeout(3500);
  const btn = page.locator("button", { hasText: "Демо-режим" }).first();
  await btn.waitFor({ state: "visible", timeout: 25000 });
  await btn.click();
  await page.waitForSelector("[data-view='main'], nav", { timeout: 40000 });
  await page.waitForTimeout(5000);
}
const shot = async (page, name) => {
  try { await page.screenshot({ path: `${OUT}/${name}.png` }); console.log("shot:", name); }
  catch (e) { console.log(`SHOT-FAIL ${name}: ${e.message.slice(0, 90)}`); }
};

const browser = await chromium.launch({ headless: true });
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await demoLogin(page);
  // start playback
  const listen = page.locator('button[aria-label="Слушать"]:visible').first();
  if (await listen.count()) { await listen.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(4500); }
  // open full player from the home "Текущий трек" hero
  const opener = page.locator('button[aria-label^="Открыть плеер"]:visible').first();
  console.log("opener count:", await opener.count());
  if (await opener.count()) {
    await opener.click({ timeout: 5000 }).catch((e) => console.log("opener click fail:", e.message.slice(0, 80)));
    await page.waitForTimeout(3000);
    await shot(page, "m390-fullplayer");
  } else {
    console.log("no opener — try mini");
    const mini = page.locator("button.mq-mini.flex-1:visible").first();
    if (await mini.count()) { await mini.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(3000); await shot(page, "m390-fullplayer"); }
  }
  await ctx.close();
}
await browser.close();
console.log("DONE");
