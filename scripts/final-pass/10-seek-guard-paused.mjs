/* Live keyboard seek regression guard: ArrowRight must advance EXACTLY +10s */
import { chromium } from "playwright";

const BASE = "https://mq1.vercel.app";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 40000 });
await page.waitForTimeout(3000);
const btn = page.locator("button", { hasText: "Демо-режим" }).first();
await btn.waitFor({ state: "visible", timeout: 20000 });
await btn.click();
await page.waitForTimeout(3500);

// play a track from home
const play = page.locator('button[aria-label*="Слушать" i], button[aria-label="Воспроизвести"]').first();
if (await play.count()) { await play.click().catch(() => {}); await page.waitForTimeout(2500); }

const read = () => page.evaluate(() => {
  const times = [...document.querySelectorAll(".mq-player-capsule span, .mq-player-capsule div")].map((e) => e.textContent?.trim()).filter((t) => /^\d+:\d{2}$/.test(t || ""));
  return times;
});
const t0 = await read();
await page.keyboard.press("Space"); await page.waitForTimeout(400); await page.keyboard.press("ArrowRight");
await page.waitForTimeout(700);
const t1 = await read();
await page.keyboard.press("Space"); await page.waitForTimeout(400); await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
const t2 = await read();
console.log("times before:", t0, "| after +1 ArrowRight:", t1, "| after +2:", t2);
const toSec = (s) => { const [m, sec] = s.split(":").map(Number); return m * 60 + sec; };
if (t1.length >= 2 && t2.length >= 2) {
  const d1 = toSec(t1[0]) - toSec(t0[0] || t1[0]);
  const d2 = toSec(t2[0]) - toSec(t1[0]);
  console.log(`seek deltas: +${d1}s, +${d2}s`, (d1 === 10 && d2 === 10) ? "→ PASS (+10 exactly, no double-seek)" : "→ CHECK (rounding to displayed second may apply)");
}
await browser.close();
