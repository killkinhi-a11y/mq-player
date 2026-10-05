/*
 * Transition integrity probe — verify the wave ON/OFF cross-fades are REAL
 * CSS transitions (950ms) on both the ambient wrapper (opacity) and the
 * app root (background-color), and capture TRUE mid-fade screenshots via
 * the v10.1 freeze technique (pause + seek document.getAnimations()).
 *
 * Rationale: headless render starvation makes computed-style sampling of
 * transitions jump to end states — the animations themselves are real.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://127.0.0.1:3112";
const OUT = "/home/z/my-project/download/qa-wave-liquid";

async function demoLogin(page) {
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.locator("button", { hasText: "Демо-режим" }).first().click();
  await page.waitForSelector("nav, [data-view='main']", { timeout: 30000 });
  await page.waitForTimeout(2500);
}

/** Install a document-level transition watcher (survives React remounts). */
const INSTALL_WATCHER = () => {
  window.__transitions = [];
  const rec = (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const cls = t.className && typeof t.className === "string" ? t.className : "";
    if (cls.includes("mq-wave-liquid") || cls.includes("mq-app-root")) {
      window.__transitions.push({
        cls,
        property: e.propertyName,
        at: performance.now(),
      });
    }
  };
  document.addEventListener("transitionrun", rec, true);
  document.addEventListener("transitionstart", rec, true);
};

const READ_ANIMS = () => {
  const anims = document.getAnimations();
  return anims.map((a) => {
    const target = a.effect?.target;
    const cls = target instanceof Element ? String(target.className || "") : "";
    return {
      cls: cls.slice(0, 60),
      type: a instanceof CSSTransition ? "transition" : a instanceof CSSAnimation ? "animation" : "other",
      property: a.transitionProperty || a.animationName || "?",
      duration: a.effect?.getTiming()?.duration,
      playState: a.playState,
      currentTime: Math.round(a.currentTime || 0),
    };
  }).filter((a) => a.cls.includes("mq-wave") || a.cls.includes("mq-app-root"));
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await demoLogin(page);
  await page.evaluate(INSTALL_WATCHER);

  // CSSOM contract first: transitions registered on both elements
  const cssom = await page.evaluate(() => {
    const root = document.querySelector(".mq-app-root");
    const wrap = document.querySelector(".mq-wave-liquid");
    return {
      rootTransition: root ? getComputedStyle(root).transitionProperty + " " + getComputedStyle(root).transitionDuration : null,
      wrapOpacityWhenOff: wrap ? getComputedStyle(wrap).opacity : null,
      wrapTransition: wrap ? getComputedStyle(wrap).transitionProperty + " " + getComputedStyle(wrap).transitionDuration : null,
    };
  });

  // start wave → capture the FADE-IN transition running
  await page.locator('[aria-label="Запустить Волну"]').first().click();
  await page.waitForFunction(
    () => document.querySelector(".mq-wave-liquid")?.getAttribute("data-active") === "true",
    null,
    { timeout: 60000 },
  );
  await page.waitForTimeout(120); // let the transition start
  const fadeInAnims = await page.evaluate(READ_ANIMS);
  // freeze at 45% → TRUE mid fade-in pixels
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      const t = a.effect?.target;
      if (t instanceof Element && String(t.className).includes("mq-wave")) {
        a.pause();
        a.currentTime = 430; // ~45% of 950ms
      }
    }
  });
  await page.screenshot({ path: `${OUT}/11-wave-on-fade-mid-FROZEN.png` });
  await page.evaluate(() => {
    for (const a of document.getAnimations()) a.play();
  });
  await page.waitForTimeout(2000);

  // stop wave → capture the FADE-OUT transition running
  await page.evaluate(() => {
    window.__transitions = [];
  });
  await page.locator('[aria-label="Выключить волну"]').first().click();
  await page.waitForTimeout(120);
  const fadeOutAnims = await page.evaluate(READ_ANIMS);
  const fadeOutEvents = await page.evaluate(() => window.__transitions);
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      const t = a.effect?.target;
      if (t instanceof Element && String(t.className).includes("mq-wave")) {
        a.pause();
        a.currentTime = 430;
      }
    }
  });
  await page.screenshot({ path: `${OUT}/12-wave-off-fade-mid-FROZEN.png` });
  await page.evaluate(() => {
    for (const a of document.getAnimations()) a.play();
  });

  // wait for settle, verify final state
  await page.waitForTimeout(1800);
  const finalState = await page.evaluate(() => {
    const wrap = document.querySelector(".mq-wave-liquid");
    const root = document.querySelector(".mq-app-root");
    return {
      wrapActive: wrap?.getAttribute("data-active"),
      wrapOpacity: wrap ? getComputedStyle(wrap).opacity : null,
      rootWave: root?.getAttribute("data-wave"),
      rootBg: root ? getComputedStyle(root).backgroundColor : null,
    };
  });

  await ctx.close();
  await browser.close();

  const report = { cssom, fadeInAnims, fadeOutAnims, fadeOutEvents, finalState, errors };
  fs.writeFileSync(`${OUT}/transition-probe.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
