/*
 * FINAL CORRECTION PASS — Step 1: capture REAL production WAVE screenshots
 * + dump the geometry of every element the user could read as the "WAVE
 * main surface", so we can see (VLM) what actually looks unrounded.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://mq1.vercel.app";
const OUT = "/home/z/my-project/download/qa-final-pass/audit";
fs.mkdirSync(OUT, { recursive: true });

const report = { consoleErrors: [], geometry: {} };
const consoleErrors = report.consoleErrors;

async function newPage(browser, w, h, isMobile = false) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    isMobile,
    hasTouch: isMobile,
    deviceScaleFactor: isMobile ? 3 : 1,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 160)}`));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" && !/turnstile|Content Security Policy|challenges\.cloudflare/.test(t)) {
      consoleErrors.push(`console.error: ${t.slice(0, 160)}`);
    }
  });
  return { ctx, page };
}

async function demoLogin(page) {
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForTimeout(3000);
  const btn = page.locator("button", { hasText: "Демо-режим" }).first();
  await btn.waitFor({ state: "visible", timeout: 20000 });
  await btn.click();
  await page.waitForSelector("nav, [data-view='main']", { timeout: 30000 });
  await page.waitForTimeout(3000);
  try {
    await page.waitForSelector("article", { timeout: 12000 });
    await page.waitForFunction(() => !document.querySelector(".animate-pulse, [data-skeleton]"), { timeout: 8000 });
  } catch {}
  await page.waitForTimeout(600);
}

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("shot:", name);
};

/* Dump geometry of the wave section + every wrapper around it + artwork */
async function dumpWaveGeometry(page, tag) {
  const data = await page.evaluate(() => {
    const out = [];
    const wave = document.querySelector('[data-testid="wave-home"]') || document.querySelector(".mq-wave");
    if (!wave) return [{ error: "no wave section" }];
    let el = wave;
    let depth = 0;
    while (el && depth < 8) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      out.push({
        depth,
        tag: el.tagName.toLowerCase(),
        cls: (el.className && typeof el.className === "string" ? el.className : "").slice(0, 90),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        radius: cs.borderRadius,
        background: cs.backgroundColor,
        backgroundImage: cs.backgroundImage.slice(0, 80),
        border: cs.border,
        boxShadow: cs.boxShadow.slice(0, 90),
        overflow: cs.overflow,
        backdropFilter: cs.backdropFilter,
      });
      el = el.parentElement;
      depth++;
    }
    const art = document.querySelector(".mq-wave-art");
    if (art) {
      const cs = getComputedStyle(art);
      const r = art.getBoundingClientRect();
      out.push({
        depth: "artwork",
        tag: "button.mq-wave-art",
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        radius: cs.borderRadius,
        overflow: cs.overflow,
        backdropFilter: cs.backdropFilter,
      });
      const layer = art.querySelector(".mq-wave-art-layer[data-active='true'], .mq-wave-art-layer");
      if (layer) {
        const lcs = getComputedStyle(layer);
        out.push({ depth: "artwork-layer", radius: lcs.borderRadius, inset: lcs.inset || lcs.top });
      }
    }
    return out;
  });
  report.geometry[tag] = data;
  console.log(`--- geometry ${tag} ---`);
  for (const d of data) {
    if (d.error) { console.log(d.error); continue; }
    const rect = d.rect ? ` @${d.rect.x},${d.rect.y} ${d.rect.w}x${d.rect.h}` : "";
    console.log(
      `d${d.depth} <${d.tag}> cls="${d.cls || ""}"${rect} radius=${d.radius} bg=${(d.background || "").slice(0, 40)} bgimg=${(d.backgroundImage || "none").slice(0, 50)} border=${(d.border || "").slice(0, 40)} overflow=${d.overflow || ""} blur=${d.backdropFilter || ""}`
    );
  }
}

const browser = await chromium.launch({ headless: true });

// ── DESKTOP 1440x900 ──
{
  const { ctx, page } = await newPage(browser, 1440, 900);
  await demoLogin(page);
  await shot(page, "d1440-01-home");
  // Start WAVE
  const waveBtn = page.locator('button[aria-label*="WAVE" i]').first();
  if (await waveBtn.count()) {
    await waveBtn.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(4000);
  }
  await shot(page, "d1440-02-wave");
  await dumpWaveGeometry(page, "desktop");
  await page.evaluate(() => { window.scrollTo(0, 300); });
  await page.waitForTimeout(800);
  await shot(page, "d1440-03-wave-scrolled");
  await ctx.close();
}

// ── MOBILE 390x844 ──
{
  const { ctx, page } = await newPage(browser, 390, 844, true);
  await demoLogin(page);
  await shot(page, "m390-01-home");
  const waveBtn = page.locator('button[aria-label*="WAVE" i]').first();
  if (await waveBtn.count()) {
    await waveBtn.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(4000);
  }
  await shot(page, "m390-02-wave");
  await dumpWaveGeometry(page, "mobile");
  await ctx.close();
}

await browser.close();
fs.writeFileSync("/home/z/my-project/download/qa-final-pass/audit/wave-geometry.json", JSON.stringify(report, null, 2));
console.log("\nconsole errors:", consoleErrors.length ? consoleErrors : "none");
