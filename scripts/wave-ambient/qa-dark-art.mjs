/* Targeted capture: skip until the wave lands on a DARK/low-saturation
 * artwork palette (c2 sat < 0.45), then screenshot. */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3112";
const OUT = "/home/z/my-project/download/qa-wave-liquid";

const satOf = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
};

await (async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.locator("button", { hasText: "Демо-режим" }).first().click();
  await page.waitForSelector("nav, [data-view='main']", { timeout: 30000 });
  await page.waitForTimeout(2000);

  await page.locator('[aria-label="Запустить Волну"]').first().click();
  await page.waitForFunction(
    () => document.querySelector(".mq-wave-ambient")?.getAttribute("data-active") === "true",
    null,
    { timeout: 60000 },
  );
  await page.waitForTimeout(2500);

  const paletteOf = () =>
    page.evaluate(() => ({
      c2: document.documentElement.style.getPropertyValue("--wave-color-2") || "#000000",
      track: (window.__mqWaveAmbient?.palette?.c2) || "?",
    }));

  let found = null;
  for (let i = 0; i < 14; i++) {
    const p = await paletteOf();
    const s = satOf(p.c2);
    if (s < 0.45) {
      found = { ...p, sat: +s.toFixed(2), skipIndex: i - 1 };
      break;
    }
    await page.locator('[aria-label="Следующий трек"]').first().click();
    await page.waitForTimeout(2400);
  }

  if (found) {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/04-wave-dark-artwork-desktop-1440.png` });
  }
  console.log(JSON.stringify({ found }, null, 2));
  await ctx.close();
  await browser.close();
})();
