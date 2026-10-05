/* Reduced-motion QA: emulate prefers-reduced-motion: reduce → the Wave
 * ambient must render a STATIC composition (data-wave-motion="static",
 * no continuous frames) while still showing gradients/light/depth. */
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:3112";
const OUT = "/home/z/my-project/download/qa-wave-liquid";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.locator("button", { hasText: "Демо-режим" }).first().click();
  await page.waitForSelector("nav, [data-view='main']", { timeout: 30000 });
  await page.waitForTimeout(2000);

  await page.locator('[aria-label="Запустить Волну"]').first().click();
  await page.waitForFunction(
    () => document.querySelector(".mq-wave-liquid")?.getAttribute("data-active") === "true",
    null,
    { timeout: 60000 },
  );
  await page.waitForTimeout(2500); // transition settles + parks

  const state = await page.evaluate(() => {
    const wrap = document.querySelector(".mq-wave-liquid");
    return {
      motionAttr: wrap?.getAttribute("data-wave-motion"),
      mode: wrap?.getAttribute("data-mode"),
      active: wrap?.getAttribute("data-active"),
      htmlReduceClass: document.documentElement.classList.contains("mq-reduce-motion"),
      hook: window.__mqWaveAmbient ? { ...window.__mqWaveAmbient } : null,
    };
  });

  // frame-churn check: canvas should NOT redraw continuously in static mode.
  // Instrument: patch drawArrays counter via hook fps (engine-side, 0 = parked)
  const churn = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let frames = 0;
        let last = performance.now();
        const t0 = last;
        function step(t) {
          frames++;
          last = t;
          if (t - t0 < 2000) requestAnimationFrame(step);
          else resolve({ rafFrames: frames, fps: Math.round((frames * 1000) / (t - t0)) });
        }
        requestAnimationFrame(step);
      }),
  );

  await page.screenshot({ path: `${OUT}/13-wave-reduced-motion-static.png` });
  await ctx.close();
  await browser.close();
  console.log(JSON.stringify({ state, churn }, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
