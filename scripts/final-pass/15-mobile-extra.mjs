/* Mobile extra viewports: 375x812 + 430x932 — home/wave/fullplayer + density */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://mq1.vercel.app";
const OUT = "/home/z/my-project/download/qa-red-focus/prod-audit";
const browser = await chromium.launch({ headless: true });
const report = {};

for (const [w, h, name] of [[375, 812, "m375"], [430, 932, "m430"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(3500);
  await page.locator("button", { hasText: "Демо-режим" }).first().click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/${name}-01-home.png` });
  report[name] = { tinyButtons: [], overflowX: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) };
  // tiny buttons + oversized blocks
  const density = await page.evaluate(() => {
    const out = { tiny: [], wide: [] };
    for (const b of document.querySelectorAll("button")) {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.height < 44 && r.width < 44) out.tiny.push({ l: (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 20), h: Math.round(r.height), w: Math.round(r.width) });
      if (out.tiny.length >= 6) break;
    }
    return out;
  });
  report[name].tinyButtons = density.tiny;

  // WAVE
  const wb = page.locator('button[aria-label*="WAVE" i]').locator("visible=true").first();
  if (await wb.count()) {
    await wb.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `${OUT}/${name}-02-wave.png` });
    const wave = await page.evaluate(() => {
      const w = document.querySelector(".mq-wave");
      if (!w) return null;
      const cs = getComputedStyle(w);
      const r = w.getBoundingClientRect();
      return { radius: cs.borderRadius, solid: !cs.backgroundColor.includes("rgba(0, 0, 0, 0)"), w: Math.round(r.width) };
    });
    report[name].wave = wave;
    await wb.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }
  // FULL PLAYER
  await page.locator('button[aria-label*="Открыть плеер"]').first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${name}-03-fullplayer.png` });
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/mobile-extra.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
