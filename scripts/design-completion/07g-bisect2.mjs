/* Probe v7: bisect INSIDE the sticky — hide input vs siblings */
import { chromium } from "playwright";
const BASE = "http://127.0.0.1:3112";
const browser = await chromium.launch({ headless: true });

async function setup() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.locator("button", { hasText: "Демо-режим" }).first().click();
  await page.waitForSelector("[data-view='main'], nav", { timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.locator("button[aria-label='Поиск']:visible").first().waitFor({ state: "visible", timeout: 15000 });
  await page.locator("button[aria-label='Поиск']:visible").first().click({ timeout: 8000 });
  await page.waitForSelector("[data-view='search']", { timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.locator("input:visible").first().waitFor({ state: "visible", timeout: 15000 });
  await page.locator("input:visible").first().fill("Поп");
  await page.waitForTimeout(1500);
  return { ctx, page };
}

const variants = [
  ["noinput", `input { visibility: hidden !important; }`],
  ["noinputwrap", `.sticky.top-0 .flex-1.relative { visibility: hidden !important; }`],
  ["noflexrow", `.sticky.top-0 .flex.gap-2 { visibility: hidden !important; }`],
  ["nocaret", `input { caret-color: transparent !important; }`],
  ["nosel", `::selection { background: transparent !important; } input::selection { background: transparent !important; }`],
];

for (const [tag, css] of variants) {
  const { ctx, page } = await setup();
  await page.addStyleTag({ content: css });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `/tmp/bisect2-${tag}.png` });
  await ctx.close();
  console.log("shot", tag);
}
await browser.close();
