/* PRODUCTION E2E — Wave Liquid Ambient on mq1.vercel.app (mq-build-967ece82) */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://mq1.vercel.app";
const OUT = "/home/z/my-project/download/qa-wave-liquid";
fs.mkdirSync(OUT, { recursive: true });

const errs = [];

async function runViewport(browser, w, h, isMobile, label) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    isMobile,
    hasTouch: isMobile,
    deviceScaleFactor: isMobile ? 3 : 1,
  });
  const page = await ctx.newPage();
  const myErrs = [];
  page.on("pageerror", (e) => myErrs.push(`pageerror: ${String(e).slice(0, 150)}`));
  page.on("console", (m) => {
    if (m.type() === "error") myErrs.push(m.text().slice(0, 130));
  });

  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.locator("button", { hasText: "Демо-режим" }).first().click();
  await page.waitForSelector("nav, [data-view='main']", { timeout: 30000 });
  await page.waitForTimeout(2500);

  // wave OFF state
  const off = await page.evaluate(() => ({
    wrap: !!document.querySelector(".mq-wave-liquid"),
    active: document.querySelector(".mq-wave-liquid")?.getAttribute("data-active"),
    rootWave: document.querySelector(".mq-app-root")?.getAttribute("data-wave"),
    rootBg: getComputedStyle(document.querySelector(".mq-app-root")).backgroundColor,
  }));

  await page.locator('[aria-label="Запустить Волну"]').first().click();
  await page.waitForFunction(
    () => document.querySelector(".mq-wave-liquid")?.getAttribute("data-active") === "true",
    null,
    { timeout: 90000 },
  );
  await page.waitForTimeout(3000);

  const on = await page.evaluate(() => {
    const wrap = document.querySelector(".mq-wave-liquid");
    const canvas = document.querySelector(".mq-wave-canvas");
    return {
      active: wrap?.getAttribute("data-active"),
      mode: wrap?.getAttribute("data-mode"),
      motion: wrap?.getAttribute("data-wave-motion"),
      canvas: canvas ? `${canvas.width}x${canvas.height}` : null,
      rootWave: document.querySelector(".mq-app-root")?.getAttribute("data-wave"),
      rootBg: getComputedStyle(document.querySelector(".mq-app-root")).backgroundColor,
      vars: {
        c1: document.documentElement.style.getPropertyValue("--wave-color-1"),
        c2: document.documentElement.style.getPropertyValue("--wave-color-2"),
      },
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      waveHomeVisible: !!document.querySelector('[aria-label="Остановить Волну"]'),
    };
  });

  const shot = `${OUT}/prod-${label}-wave-active.png`;
  await page.screenshot({ path: shot });

  // stop wave → normal page returns
  await page.locator('[aria-label="Остановить Волну"], [aria-label="Выключить волну"]').first().click();
  await page.waitForTimeout(2200);
  const offAfter = await page.evaluate(() => ({
    active: document.querySelector(".mq-wave-liquid")?.getAttribute("data-active"),
    rootWave: document.querySelector(".mq-app-root")?.getAttribute("data-wave"),
    rootBg: getComputedStyle(document.querySelector(".mq-app-root")).backgroundColor,
  }));

  await ctx.close();
  return { label, off, on, offAfter, shot, errs: myErrs };
}

const browser = await chromium.launch();
const results = [];
results.push(await runViewport(browser, 1440, 900, false, "desktop-1440"));
results.push(await runViewport(browser, 390, 844, true, "mobile-390"));
await browser.close();
fs.writeFileSync(`${OUT}/prod-e2e.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
