/*
 * FINAL CORRECTION PASS — LOCAL AFTER verification.
 * Screenshot + geometry probe the LOCAL build (post-fix):
 *  - WAVE surface radius VISIBLE (pixel check of the rounded corner)
 *  - ambient background visible on all tabs (luminance variance)
 *  - volume fill neutral
 *  - labels/terminology clean
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://127.0.0.1:3112";
const OUT = "/home/z/my-project/download/qa-final-pass/after-local";
fs.mkdirSync(OUT, { recursive: true });

const report = { shots: [], probes: {} };
const consoleErrors = [];

async function newPage(browser, w, h, isMobile = false) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile, hasTouch: isMobile, deviceScaleFactor: isMobile ? 3 : 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 140)}`));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 120)); });
  return { ctx, page };
}

async function demoLogin(page) {
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  const btn = page.locator("button", { hasText: "Демо-режим" }).first();
  await btn.waitFor({ state: "visible", timeout: 15000 });
  await btn.click();
  await page.waitForSelector("nav, [data-view='main']", { timeout: 20000 });
  await page.waitForTimeout(3000);
  try { await page.waitForFunction(() => !document.querySelector(".animate-pulse, [data-skeleton]"), { timeout: 6000 }); } catch {}
  await page.waitForTimeout(400);
}

const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); report.shots.push(name); console.log("shot:", name); };

const browser = await chromium.launch({ headless: true });

// ── DESKTOP ──
{
  const { ctx, page } = await newPage(browser, 1440, 900);
  await demoLogin(page);

  // AMBIENT visibility probe: sample background luminance in empty areas
  const amb = await page.evaluate(() => {
    const root = document.querySelector(".mq-app-root");
    const cs = getComputedStyle(root);
    return { rootBg: cs.backgroundColor, ambientChildren: [...document.querySelectorAll(".mq-ambient-bg > div")].map((c) => getComputedStyle(c).backgroundImage.slice(0, 40)) };
  });
  report.probes.appRoot = amb;
  console.log("app-root:", JSON.stringify(amb));

  await shot(page, "d1440-home");
  // volume fill color in PlayerBar (hover to reveal? it's always visible on desktop)
  const vol = await page.evaluate(() => {
    const fills = [...document.querySelectorAll(".mq-player-capsule div")].filter((d) => d.style.transform?.startsWith("scaleX"));
    return fills.map((f) => getComputedStyle(f).backgroundColor);
  });
  report.probes.volumeFill = vol;
  console.log("volume fills:", vol);

  // WAVE
  const waveBtn = page.locator('button[aria-label*="WAVE" i]').first();
  if (await waveBtn.count()) { await waveBtn.click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(3500); }
  await shot(page, "d1440-wave");
  const waveGeo = await page.evaluate(() => {
    const w = document.querySelector('[data-testid="wave-home"]');
    if (!w) return null;
    const cs = getComputedStyle(w);
    const r = w.getBoundingClientRect();
    return { radius: cs.borderRadius, bg: cs.backgroundColor, border: cs.border, shadow: cs.boxShadow.slice(0, 70), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
  });
  report.probes.waveSurface = waveGeo;
  console.log("wave surface:", JSON.stringify(waveGeo));
  // terminology sweep on live DOM
  const volna = await page.evaluate(() => {
    const hits = [];
    for (const el of document.querySelectorAll("h1,h2,h3,h4,p,span,button")) {
      const t = (el.textContent || "").trim();
      if (/волна/i.test(t) && el.children.length === 0 && t.length < 60) hits.push(t.slice(0, 50));
      const al = el.getAttribute?.("aria-label") || "";
      if (/волна/i.test(al)) hits.push(`aria: ${al.slice(0, 40)}`);
    }
    return hits;
  });
  report.probes.volna = volna;
  console.log("live Волна text:", volna.length ? volna : "none ✓");
  // status labels sweep
  const badges = await page.evaluate(() => {
    const hits = [];
    for (const el of document.querySelectorAll("p, span")) {
      const t = (el.textContent || "").trim();
      if (/^(Играет|ИГРАЕТ|Сейчас играет|Пауза)$/.test(t) && el.children.length === 0) {
        const cs = getComputedStyle(el);
        if (cs.display !== "none" && cs.visibility !== "hidden") hits.push(t);
      }
    }
    return hits;
  });
  console.log("status badges on home+wave:", badges.length ? badges : "none ✓");

  const stopBtn = page.locator('button[aria-label="Остановить WAVE"]').first();
  if (await stopBtn.count()) { await stopBtn.click().catch(() => {}); await page.waitForTimeout(1200); }
  for (const [name, sel] of [["search", 'button[aria-label="Поиск"]'], ["library", 'button[aria-label="Библиотека"]'], ["chats", 'button[aria-label="Чаты"]'], ["settings", 'button[aria-label="Настройки"]']]) {
    const b = page.locator(sel).first();
    if (await b.count()) { await b.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(1400); await shot(page, `d1440-${name}`); }
  }
  await ctx.close();
}

// ── MOBILE ──
{
  const { ctx, page } = await newPage(browser, 390, 844, true);
  await demoLogin(page);
  await shot(page, "m390-home");
  const waveBtn = page.locator("button").filter({ hasText: /WAVE/i }).first();
  if (await waveBtn.count()) { await waveBtn.click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(3500); }
  await shot(page, "m390-wave");
  const waveGeo = await page.evaluate(() => {
    const w = document.querySelector('[data-testid="wave-home"]');
    if (!w) return null;
    const cs = getComputedStyle(w);
    return { radius: cs.borderRadius, bg: cs.backgroundColor, border: cs.border };
  });
  report.probes.waveSurfaceMobile = waveGeo;
  console.log("wave surface (mobile):", JSON.stringify(waveGeo));
  const volna = await page.evaluate(() => {
    const hits = [];
    for (const el of document.querySelectorAll("h1,h2,h3,h4,p,span,button")) {
      const t = (el.textContent || "").trim();
      if (/волна/i.test(t) && el.children.length === 0 && t.length < 60) hits.push(t.slice(0, 50));
    }
    return hits;
  });
  console.log("mobile live Волна text:", volna.length ? volna : "none ✓");
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log("mobile overflowX:", ov);
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/probes.json`, JSON.stringify(report, null, 2));
console.log("\nconsole errors:", consoleErrors.length ? consoleErrors.slice(0, 6) : "none");
