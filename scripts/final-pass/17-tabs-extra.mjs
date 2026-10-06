/* Complete the 14-tab coverage: Artist detail, Playlist detail, Profile (+red scan) */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://mq1.vercel.app";
const OUT = "/home/z/my-project/download/qa-red-focus/prod-audit";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(3500);
await page.locator("button", { hasText: "Демо-режим" }).first().click();
await page.waitForTimeout(3500);

const redScan = () => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
    if (["IMG", "CANVAS", "SVG", "VIDEO", "PICTURE", "PATH"].includes(el.tagName)) continue;
    const cs = getComputedStyle(el);
    const aria = el.getAttribute("aria-label") || "";
    if (/Избранн|любим|Нравит|Выйти|Очист|trash|log-out/i.test(aria)) continue;
    for (const [prop, val] of [["backgroundColor", cs.backgroundColor], ["color", cs.color]]) {
      const m = (val || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m && Number(m[1]) > 150 && Number(m[2]) < 110 && Number(m[3]) < 110) {
        const svg = el.querySelector("svg");
        const icon = svg ? ((svg.getAttribute("class") || "").match(/lucide-([a-z-]+)/) || [])[1] || "" : "";
        out.push({ tag: el.tagName, prop, icon, text: (el.textContent || "").trim().slice(0, 24) });
        break;
      }
    }
    if (out.length >= 8) break;
  }
  return out;
});

const report = {};
// SEARCH → artist page (click first artist result)
await page.locator('button[aria-label="Поиск"], button:has-text("Поиск")').first().click().catch(() => {});
await page.waitForTimeout(1800);
const artistBtn = page.locator('a, button', { hasText: /Артист|дстры/ }).first();
await page.locator("[data-search-input]").fill("a").catch(() => {});
await page.waitForTimeout(2500);
// click a result row (track or artist chip)
const artistLink = page.locator("text=/К артисту/").first();
if (await artistLink.count()) { await artistLink.click().catch(() => {}); }
else {
  // try search result card click via artist name link
  const art = page.locator("[data-search-input]").first();
  await page.waitForTimeout(1000);
  await page.locator("main button, main a").nth(6).click().catch(() => {});
}
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/d1440-11-artist.png` });
report.artist = await redScan();

// LIBRARY → playlists tab → open a playlist
await page.locator('button[aria-label="Библиотека"], button:has-text("Библиотека")').first().click().catch(() => {});
await page.waitForTimeout(1800);
const plTab = page.locator('button', { hasText: "Плейлисты" }).first();
if (await plTab.count()) { await plTab.click().catch(() => {}); await page.waitForTimeout(1500); }
const plTile = page.locator(".mq-card-feature, .group.rounded-2xl, [class*='mq-card-']").first();
if (await plTile.count()) { await plTile.click().catch(() => {}); await page.waitForTimeout(2000); }
await page.screenshot({ path: `${OUT}/d1440-12-playlist.png` });
report.playlist = await redScan();

// PROFILE
await page.locator('button[aria-label="Профиль"]').first().click().catch(() => {});
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/d1440-13-profile.png` });
report.profile = await redScan();

await ctx.close();
await browser.close();
fs.writeFileSync(`${OUT}/tabs-extra.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
