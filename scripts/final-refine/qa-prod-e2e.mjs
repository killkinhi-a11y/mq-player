/*
 * FINAL REFINEMENT — PRODUCTION E2E (mq1.vercel.app).
 * Walks: Home → WAVE → Search → Library → Chats → Settings → Full Player
 * (+ Queue, Context Menu) on DESKTOP 1440×900 and MOBILE 390×844.
 * Verifies the refined material contracts live on production + zero
 * page errors + no overflow.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://mq1.vercel.app";
const OUT = "/home/z/my-project/download/qa-final-refine/prod";
fs.mkdirSync(OUT, { recursive: true });

const report = { consoleErrors: [], shots: [] };
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
    // pre-existing CSP/turnstile noise on prod is excluded
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
  report.shots.push(name);
};

const browser = await chromium.launch({ headless: true });

// ── DESKTOP 1440 ──
{
  const { ctx, page } = await newPage(browser, 1440, 900);
  await demoLogin(page);
  await shot(page, "d1440-home");
  report.desktop = await page.evaluate(() => {
    const out = {};
    const art = document.querySelector("article");
    out.featured_reason = art?.querySelector(".mq-t-label") ? getComputedStyle(art.querySelector(".mq-t-label")).color : null;
    out.featured_shadow = art ? getComputedStyle(art).boxShadow.slice(0, 60) : null;
    const plat = document.querySelector(".mq-player-capsule .mq-platinum-btn");
    out.play_flat = plat ? ((getComputedStyle(plat).boxShadow.match(/inset/g) || []).length <= 1 && !getComputedStyle(plat).backgroundImage.includes("radial")) : null;
    out.g2_blur = getComputedStyle(document.documentElement).getPropertyValue("--mq-g2-blur").trim();
    out.mat3_opaque = !getComputedStyle(document.documentElement).getPropertyValue("--mq-mat-3-bg").includes("transparent)");
    out.overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    return out;
  });
  // WAVE
  const waveBtn = page.locator('button[aria-label*="WAVE" i]').first();
  if (await waveBtn.count()) {
    await waveBtn.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await shot(page, "d1440-wave");
    report.wave = await page.evaluate(() => {
      const out = {};
      const plat = document.querySelector(".mq-wave .mq-platinum-btn");
      out.wave_play_flat = plat ? ((getComputedStyle(plat).boxShadow.match(/inset/g) || []).length <= 1) : null;
      out.liquid = !!document.querySelector(".mq-wave-liquid");
      out.active = document.querySelector(".mq-wave-liquid")?.getAttribute("data-active");
      return out;
    });
    // track change → palette transition
    const skip = page.locator('button[aria-label="Пропустить"]').first();
    if (await skip.count()) { await skip.click().catch(() => {}); await page.waitForTimeout(1400); }
    await shot(page, "d1440-wave-nexttrack");
  }
  // Sections
  for (const [name, sel] of [
    ["search", 'button[aria-label="Поиск"]'],
    ["library", 'button[aria-label="Библиотека"]'],
    ["chats", 'button[aria-label="Чаты"]'],
    ["settings", 'button[aria-label="Настройки"]'],
  ]) {
    const b = page.locator(sel).first();
    if (await b.count()) {
      await b.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1800);
      if (name === "search") {
        const input = page.locator("input[type='search'], [data-search-input] input").first();
        if (await input.count()) { await input.fill("музыка"); await page.waitForTimeout(1800); }
      }
      await shot(page, `d1440-${name}`);
    }
  }
  // Full player + queue
  const capsule = page.locator(".mq-player-capsule button").first();
  if (await capsule.count()) {
    await capsule.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await shot(page, "d1440-fullplayer");
    const q = page.locator('button[aria-label="Очередь"]').first();
    if (await q.count()) { await q.click().catch(() => {}); await page.waitForTimeout(1200); await shot(page, "d1440-queue"); }
    const closeBtn = page.locator('button[aria-label*="акрыть" i]').first();
    if (await closeBtn.count()) await closeBtn.click().catch(() => {});
    await page.waitForTimeout(800);
  }
  // Context menu
  const row = page.locator("li button, article").first();
  if (await row.count()) {
    await row.click({ button: "right", timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await shot(page, "d1440-contextmenu");
    await page.keyboard.press("Escape");
  }
  await ctx.close();
}

// ── MOBILE 390 ──
{
  const { ctx, page } = await newPage(browser, 390, 844, true);
  await demoLogin(page);
  await page.waitForTimeout(1000);
  await shot(page, "m390-home");
  report.mobile = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    hero_play_platinum: !!document.querySelector("[data-mq-hero] .mq-platinum-btn"),
    reason_muted: (() => {
      const r = document.querySelector("[data-mq-hero] .mq-t-label");
      return r ? getComputedStyle(r).color : null;
    })(),
  }));
  const waveBtn = page.locator("button").filter({ hasText: /WAVE/i }).first();
  if (await waveBtn.count()) {
    await waveBtn.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await shot(page, "m390-wave");
  }
  const art = page.locator(".mq-wave-art, [data-mq-hero] button").first();
  if (await art.count()) {
    await art.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await shot(page, "m390-fullplayer");
    const closeBtn = page.locator('button[aria-label*="акрыть" i]').first();
    if (await closeBtn.count()) await closeBtn.click().catch(() => {});
  }
  for (const [name, sel] of [
    ["library", 'button[aria-label="Библиотека"]'],
    ["search", 'button[aria-label="Поиск"]'],
    ["settings", 'button[aria-label="Настройки"]'],
  ]) {
    const b = page.locator(sel).first();
    if (await b.count()) {
      await b.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1600);
      await shot(page, `m390-${name}`);
    }
  }
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(report, null, 2));
console.log("shots:", report.shots.length, "| errors:", consoleErrors.length);
console.log(JSON.stringify({ desktop: report.desktop, wave: report.wave, mobile: report.mobile }, null, 2));
if (consoleErrors.length) console.log(consoleErrors.slice(0, 6).join("\n"));
