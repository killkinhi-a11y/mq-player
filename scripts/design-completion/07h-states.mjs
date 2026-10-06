/* Probe v8: red line state tests — blur / evaluate-set / color transparent */
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
  return { ctx, page };
}

// A: fill + blur (tap elsewhere)
{
  const { ctx, page } = await setup();
  await page.locator("input:visible").first().fill("Поп");
  await page.waitForTimeout(800);
  await page.mouse.click(195, 400); // tap empty area below
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/tmp/state-blur.png" });
  const info = await page.evaluate(() => {
    const inp = document.querySelector("input");
    const cs = getComputedStyle(inp);
    return { active: document.activeElement?.tagName, border: cs.borderColor, bw: cs.borderWidth, caret: cs.caretColor, color: cs.color, deco: cs.textDecoration, tf: cs.textFillColor };
  });
  console.log("blur state:", JSON.stringify(info));
  await ctx.close();
}

// B: set value via evaluate (no focus, no fill)
{
  const { ctx, page } = await setup();
  await page.evaluate(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    const inp = document.querySelector("input");
    setter.call(inp, "Поп");
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.blur();
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/state-evalset.png" });
  await ctx.close();
}

// C: focused + text color transparent
{
  const { ctx, page } = await setup();
  await page.locator("input:visible").first().fill("Поп");
  await page.waitForTimeout(800);
  await page.addStyleTag({ content: `input { color: transparent !important; -webkit-text-fill-color: transparent !important; }` });
  await page.waitForTimeout(300);
  await page.screenshot({ path: "/tmp/state-notext.png" });
  await ctx.close();
}

// D: empty query but focused
{
  const { ctx, page } = await setup();
  await page.locator("input:visible").first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "/tmp/state-focus-empty.png" });
  await ctx.close();
}
await browser.close();
console.log("done");
