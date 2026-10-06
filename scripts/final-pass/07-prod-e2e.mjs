/*
 * FINAL CORRECTION PASS — PRODUCTION E2E + screenshot audit (mq1.vercel.app).
 * Desktop 1440x900 + Mobile 390x844: all tabs, WAVE surface geometry,
 * ambient visibility, volume fill, terminology, status labels, overflow,
 * console errors. Produces the AFTER evidence set.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://mq1.vercel.app";
const OUT = "/home/z/my-project/download/qa-final-pass/prod-after";
fs.mkdirSync(OUT, { recursive: true });

const report = { consoleErrors: [], shots: [], probes: {}, acceptance: {} };
const consoleErrors = report.consoleErrors;

async function newPage(browser, w, h, isMobile = false) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile, hasTouch: isMobile, deviceScaleFactor: isMobile ? 3 : 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 140)}`));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" && !/turnstile|Content Security Policy|challenges\.cloudflare/.test(t)) consoleErrors.push(t.slice(0, 140));
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
  try { await page.waitForFunction(() => !document.querySelector(".animate-pulse, [data-skeleton]"), { timeout: 8000 }); } catch {}
  await page.waitForTimeout(600);
}

const shot = async (page, name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); report.shots.push(name); console.log("shot:", name); };

const browser = await chromium.launch({ headless: true });

// ── DESKTOP 1440x900 ──
{
  const { ctx, page } = await newPage(browser, 1440, 900);
  await demoLogin(page);

  report.acceptance.app_root_transparent = await page.evaluate(() => getComputedStyle(document.querySelector(".mq-app-root")).backgroundColor);
  await shot(page, "d1440-01-home");

  // volume fill neutral on prod
  report.acceptance.volume_fill = await page.evaluate(() => {
    const fills = [...document.querySelectorAll(".mq-player-capsule div")].filter((d) => d.style.transform?.startsWith("scaleX"));
    return fills.map((f) => getComputedStyle(f).backgroundColor);
  });

  // WAVE on
  const waveBtn = page.locator('button[aria-label*="WAVE" i]').first();
  if (await waveBtn.count()) { await waveBtn.click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(4000); }
  await shot(page, "d1440-02-wave");
  report.acceptance.wave_surface = await page.evaluate(() => {
    const w = document.querySelector('[data-testid="wave-home"]');
    if (!w) return null;
    const cs = getComputedStyle(w);
    return { radius: cs.borderRadius, bg: cs.backgroundColor, border: cs.border, shadow: cs.boxShadow.slice(0, 60) };
  });
  report.acceptance.wave_liquid_active = await page.evaluate(() => document.querySelector(".mq-wave-liquid")?.getAttribute("data-active"));
  // terminology + labels sweep live
  report.acceptance.volna_and_badges = await page.evaluate(() => {
    const hits = [];
    for (const el of document.querySelectorAll("h1,h2,h3,h4,p,span,button")) {
      const t = (el.textContent || "").trim();
      const al = el.getAttribute?.("aria-label") || "";
      if ((/волна/i.test(t) && el.children.length === 0 && t.length < 60) || /^(Играет|ИГРАЕТ|Сейчас играет|Пауза)$/.test(t)) {
        const cs = getComputedStyle(el);
        if (cs.display !== "none" && cs.visibility !== "hidden") hits.push(t.slice(0, 40));
      }
      if (/волна/i.test(al)) hits.push(`aria:${al.slice(0, 40)}`);
    }
    return hits;
  });
  // glass-on-content check: backdropFilter must not appear in content views
  report.acceptance.glass_leaks = await page.evaluate(() => {
    const leaks = [];
    const view = document.querySelector("[data-view], main");
    if (!view) return leaks;
    for (const el of view.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.backdropFilter && cs.backdropFilter !== "none" && !el.closest("nav, [data-mq-dock], .mq-player-capsule, [role='menu'], [data-floating]")) {
        leaks.push((el.className || "").toString().slice(0, 40));
        if (leaks.length > 5) break;
      }
    }
    return leaks;
  });
  // 3D button check
  report.acceptance.buttons_3d = await page.evaluate(() => {
    const out = [];
    for (const b of document.querySelectorAll("button")) {
      const cs = getComputedStyle(b);
      const insets = (cs.boxShadow.match(/inset/g) || []).length;
      if (insets >= 2 || (cs.backgroundImage.includes("radial") && !cs.backgroundImage.includes("gradient(165deg"))) out.push({ cls: (b.className || "").toString().slice(0, 36), insets, bg: cs.backgroundImage.slice(0, 36) });
      if (out.length > 4) break;
    }
    return out;
  });
  report.acceptance.overflowX_desktop = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // Full player + queue + context menu
  const stopBtn = page.locator('button[aria-label="Остановить WAVE"]').first();
  if (await stopBtn.count()) { await stopBtn.click().catch(() => {}); await page.waitForTimeout(1200); }
  const capsule = page.locator(".mq-player-capsule button").first();
  if (await capsule.count()) {
    await capsule.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await shot(page, "d1440-03-fullplayer");
    const q = page.locator('button[aria-label="Очередь"]').first();
    if (await q.count()) { await q.click().catch(() => {}); await page.waitForTimeout(1200); await shot(page, "d1440-04-queue"); }
    const closeBtn = page.locator('button[aria-label*="акрыть" i]').first();
    if (await closeBtn.count()) await closeBtn.click().catch(() => {});
    await page.waitForTimeout(700);
  }
  const row = page.locator("li button, article").first();
  if (await row.count()) { await row.click({ button: "right", timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1000); await shot(page, "d1440-05-contextmenu"); await page.keyboard.press("Escape"); }

  for (const [name, sel] of [["search", 'button[aria-label="Поиск"]'], ["library", 'button[aria-label="Библиотека"]'], ["chats", 'button[aria-label="Чаты"]'], ["settings", 'button[aria-label="Настройки"]']]) {
    const b = page.locator(sel).first();
    if (await b.count()) { await b.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(1600); if (name === "search") { const inp = page.locator("input[type='search'], [data-search-input] input").first(); if (await inp.count()) { await inp.fill("музыка"); await page.waitForTimeout(1800); } } await shot(page, `d1440-06-${name}`); }
  }
  await ctx.close();
}

// ── MOBILE 390x844 ──
{
  const { ctx, page } = await newPage(browser, 390, 844, true);
  await demoLogin(page);
  await shot(page, "m390-01-home");
  const waveBtn = page.locator("button").filter({ hasText: /WAVE/i }).first();
  if (await waveBtn.count()) { await waveBtn.click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(4000); }
  await shot(page, "m390-02-wave");
  report.acceptance.wave_surface_mobile = await page.evaluate(() => {
    const w = document.querySelector('[data-testid="wave-home"]');
    if (!w) return null;
    const cs = getComputedStyle(w);
    return { radius: cs.borderRadius, bg: cs.backgroundColor };
  });
  report.acceptance.volna_mobile = await page.evaluate(() => {
    const hits = [];
    for (const el of document.querySelectorAll("h1,h2,h3,h4,p,span,button")) {
      const t = (el.textContent || "").trim();
      if (/волна/i.test(t) && el.children.length === 0 && t.length < 60) hits.push(t.slice(0, 40));
    }
    return hits;
  });
  report.acceptance.overflowX_mobile = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  report.acceptance.touch_targets = await page.evaluate(() => {
    // all visible buttons on the wave screen
    const bad = [];
    for (const b of document.querySelectorAll("button")) {
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 44 && r.width < 44) {
        const cs = getComputedStyle(b);
        if (cs.visibility !== "hidden") bad.push({ cls: (b.className || "").toString().slice(0, 30), h: Math.round(r.height), w: Math.round(r.width) });
      }
    }
    return bad.slice(0, 6);
  });
  const stopBtn = page.locator('button[aria-label="Остановить WAVE"]').first();
  if (await stopBtn.count()) { await stopBtn.click().catch(() => {}); await page.waitForTimeout(1000); }
  for (const [name, sel] of [["library", 'button[aria-label="Библиотека"]'], ["search", 'button[aria-label="Поиск"]'], ["chats", 'button[aria-label="Чаты"]'], ["settings", 'button[aria-label="Настройки"]']]) {
    const b = page.locator(sel).first();
    if (await b.count()) { await b.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(1400); if (name === "search") { const inp = page.locator("input[type='search'], [data-search-input] input").first(); if (await inp.count()) { await inp.fill("музыка"); await page.waitForTimeout(1600); } } await shot(page, `m390-${name}`); }
  }
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/acceptance.json`, JSON.stringify(report, null, 2));
console.log("\n=== ACCEPTANCE (live production) ===");
for (const [k, v] of Object.entries(report.acceptance)) console.log(`${k}:`, JSON.stringify(v)?.slice(0, 150));
console.log("console errors:", consoleErrors.length ? consoleErrors.slice(0, 8) : "none");
