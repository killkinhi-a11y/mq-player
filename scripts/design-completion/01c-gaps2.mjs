/* DESIGN COMPLETION — BEFORE gap fill v3: desktop playlist detail + mobile full player */
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
const shot = async (page, name, full = false) => {
  try { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); console.log("shot:", name); }
  catch (e) { console.log(`SHOT-FAIL ${name}: ${e.message.slice(0, 90)}`); }
};

const browser = await chromium.launch({ headless: true });

// Desktop: library → Плейлисты tab → playlist tile → detail
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await demoLogin(page);
  await page.locator('button[aria-label="Библиотека"]').first().click({ timeout: 6000 });
  await page.waitForTimeout(2200);
  await shot(page, "d1440-04-library");
  // tab buttons inside library header (they are plain buttons with tab label text)
  const tabs = page.locator("main button", { hasText: "Плейлисты" });
  const tn = await tabs.count();
  console.log("Плейлисты tab candidates:", tn);
  for (let i = 0; i < tn; i++) {
    const vis = await tabs.nth(i).isVisible().catch(() => false);
    if (!vis) continue;
    await tabs.nth(i).click({ timeout: 4000 }).catch((e) => console.log("tab click fail", e.message.slice(0, 60)));
    break;
  }
  await page.waitForTimeout(2500);
  await shot(page, "d1440-10-playlists");
  // playlist tiles: div.group.rounded-2xl inside the grid
  const tile = page.locator("main .grid .group.rounded-2xl").first();
  if (await tile.count()) {
    await tile.click({ timeout: 4000 }).catch((e) => console.log("tile click fail", e.message.slice(0, 60)));
    await page.waitForTimeout(2500);
    await shot(page, "d1440-11-playlist-detail");
  } else console.log("no playlist tile found");
  await ctx.close();
}

// Mobile: full player via correct mini button (track info = .mq-mini.flex-1)
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await demoLogin(page);
  const listen = page.locator('button[aria-label="Слушать"]:visible').first();
  if (await listen.count()) { await listen.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(4000); }
  const miniInfo = page.locator("button.mq-mini.flex-1:visible").first();
  console.log("mini info present:", await miniInfo.count());
  if (await miniInfo.count()) {
    await miniInfo.click({ timeout: 5000 }).catch((e) => console.log("mini click fail", e.message.slice(0, 60)));
    await page.waitForTimeout(2800);
    const fpOpen = await page.evaluate(() => !!document.querySelector("[data-mq-fullplayer], .mq-fullplayer, [class*='fulltrack' i], [class*='full-track' i]"));
    console.log("full player open marker:", fpOpen);
    await shot(page, "m390-fullplayer");
  } else console.log("mini info NOT visible — no track playing?");
  await ctx.close();
}

await browser.close();
console.log("DONE");
