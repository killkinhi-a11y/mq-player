/*
 * FINAL DESIGN COMPLETION — QA capture (theme-aware background + search redesign).
 *
 * Usage:  node qa-capture.mjs <local|prod>
 *
 * LOCAL  (http://127.0.0.1:3112 — fresh standalone build):
 *   A. THEME MATRIX §21 — 6 themes × (NORMAL Home + WAVE Home) @1440×900,
 *      + one mid-transition frame (proof of the 850ms cross-fade).
 *   B. SEARCH §22 — desktop: discovery state / focus / results "кино" /
 *      results "музыка"; mobile 390: discovery + results + focus.
 *   C. TABS §23 — desktop sections, mobile sections, overflow probes.
 * PROD  (https://mq1.vercel.app — mq-build-138fab12 = BEFORE):
 *   D. BEFORE search (desktop + mobile) + BEFORE theme sameness probe.
 *
 * Sandbox note: 4GB RAM — server restarted fresh per group, browser closed
 * at the end of each group.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { execSync, spawn } from "node:child_process";

const PHASE = process.argv[2] || "local";
const BASE = PHASE === "prod" ? "https://mq1.vercel.app" : "http://127.0.0.1:3112";
const OUT = `/home/z/my-project/download/qa-final-design/${PHASE}`;
fs.mkdirSync(OUT, { recursive: true });

const results = { phase: PHASE, base: BASE, shots: {}, consoleErrors: [], probes: {} };
const consoleErrors = results.consoleErrors;

function killServer() {
  try {
    const out = execSync("ss -tlnp 2>/dev/null | grep 3112 | grep -oP 'pid=\\K[0-9]+' | head -1", { shell: "/bin/sh" }).toString().trim();
    if (out) execSync(`kill -9 ${out} 2>/dev/null || true`, { shell: "/bin/sh", stdio: "ignore" });
  } catch {}
  try { execSync("pkill -f 'standalone/server.js' || true", { shell: "/bin/sh", stdio: "ignore" }); } catch {}
}

let serverProc = null;
async function startServer() {
  if (PHASE === "prod") return true;
  killServer();
  await new Promise((r) => setTimeout(r, 1000));
  serverProc = spawn("node", ["/home/z/my-project/.next/standalone/server.js"], {
    env: { ...process.env, PORT: "3112", HOSTNAME: "127.0.0.1", NODE_ENV: "production" },
    stdio: "ignore",
    detached: true,
  });
  serverProc.unref();
  for (let i = 0; i < 30; i++) {
    try {
      const ok = await fetch(`${BASE}/play`, { redirect: "manual" }).catch(() => null);
      if (ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

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
    if (m.type() === "error") consoleErrors.push(`console.error: ${m.text().slice(0, 160)}`);
  });
  return { ctx, page };
}

async function demoLogin(page) {
  for (let i = 0; i < 6; i++) {
    try {
      await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 30000 });
      break;
    } catch { await page.waitForTimeout(3000); }
  }
  await page.waitForTimeout(2500);
  const btn = page.locator("button", { hasText: "Демо-режим" }).first();
  for (let i = 0; i < 3; i++) {
    try { await btn.waitFor({ state: "visible", timeout: 12000 }); break; }
    catch { await page.waitForTimeout(2000); }
  }
  await btn.click({ timeout: 8000 });
  await page.waitForSelector("nav, [data-view='main']", { timeout: 30000 });
  await page.waitForTimeout(2200);
}

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  results.shots[name] = true;
};

async function waitForContent(page, extraMs = 400) {
  const contentSel = "article, .mq-wave, [data-testid='track-row'], [data-testid='wave-home'], .mq-hero, .mq-search-topresult";
  try { await page.waitForSelector(contentSel, { timeout: 12000 }); } catch {}
  try {
    await page.waitForFunction(
      () => !document.querySelector(".mq-skeleton, [data-skeleton], .animate-pulse"),
      { timeout: 8000 },
    );
  } catch {}
  await page.waitForTimeout(extraMs);
}

async function goHome(page) {
  const home = page.locator('button[aria-label="Главная"], button[aria-label="Домой"]').first();
  if (await home.count()) await home.click({ timeout: 4000 }).catch(() => {});
  else await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1400);
  await waitForContent(page, 200);
}

async function waveOn(page) {
  const waveBtn = page.locator('button[title*="WAVE" i], button[aria-label*="WAVE" i]').first();
  const navWave = page.locator("nav button, aside button").filter({ hasText: /WAVE/i }).first();
  const trigger = (await waveBtn.count()) ? waveBtn : navWave;
  if (await trigger.count()) {
    await trigger.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(2800);
    await waitForContent(page, 200);
    return true;
  }
  return false;
}

async function waveOff(page) {
  const stop = page.locator('button[title*="Выключить WAVE" i], button[aria-label*="Выключить WAVE" i]').first();
  const stop2 = page.locator("button").filter({ hasText: /Выключить|Остановить/i }).first();
  const t = (await stop.count()) ? stop : stop2;
  if (await t.count()) { await t.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1600); }
}

/* ── theme switching through the REAL Settings UI (§16 proof) ── */
async function switchTheme(page, themeName) {
  const setBtn = page.locator('button[aria-label="Настройки"]').first();
  if (await setBtn.count()) await setBtn.click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const tab = page.locator("button").filter({ hasText: /^Оформление$|^Тема$/ }).first();
  if (await tab.count()) await tab.click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(700);
  const row = page.locator('[aria-controls="mq-theme-picker"]').first();
  if (await row.count()) {
    await row.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(600);
  }
  const swatch = page.locator(`#mq-theme-picker button[title="${themeName}"]`).first();
  if (!(await swatch.count())) return false;
  await swatch.click({ timeout: 4000 });
  return true;
}

/* ═══ GROUP A — THEME MATRIX (§21) ═══ */
async function themeMatrix(browser) {
  const { ctx, page } = await newPage(browser, 1440, 900);
  await demoLogin(page);
  const THEMES = ["Obsidian", "Abyss", "Borealis", "Phantom", "Ember", "Daylight"];
  let first = true;
  for (const name of THEMES) {
    if (!first) await goHome(page);
    first = false;
    const ok = await switchTheme(page, name);
    if (!ok) { results.probes[`theme-${name}`] = "SWATCH NOT FOUND"; continue; }
    if (name === "Abyss") {
      await page.waitForTimeout(380);
      await shot(page, "theme-transition-mid-abyss");
    }
    await page.waitForTimeout(1250);
    await goHome(page);
    await shot(page, `theme-${name.toLowerCase()}-normal-home`);
    await waveOn(page);
    await shot(page, `theme-${name.toLowerCase()}-wave-home`);
    await waveOff(page);
    await page.waitForTimeout(1200);
    results.probes[`ambient-${name}`] = await page.evaluate(() => {
      const els = document.querySelectorAll(".mq-ambient-pools, .mq-ambient-indigo, .mq-ambient-haze");
      const cs = getComputedStyle(document.documentElement);
      return {
        pool: cs.getPropertyValue("--mq-amb-pool").trim(),
        poolAlt: cs.getPropertyValue("--mq-amb-pool-alt").trim(),
        haze: cs.getPropertyValue("--mq-amb-haze").trim(),
        layers: els.length,
        waveBase: cs.getPropertyValue("--mq-wave-base").trim(),
      };
    });
  }
  await ctx.close();
}

/* ═══ GROUP B — SEARCH (§22) ═══ */
async function searchDesktop(browser) {
  const { ctx, page } = await newPage(browser, 1440, 900);
  await demoLogin(page);
  const searchBtn = page.locator('button[aria-label="Поиск"]').first();
  await searchBtn.click({ timeout: 4000 });
  await page.waitForTimeout(1100);
  await waitForContent(page, 300);
  await shot(page, "search-d-discovery");
  const input = page.locator("[data-search-input]").first();
  if (await input.count()) {
    await input.click();
    await page.waitForTimeout(450);
    await shot(page, "search-d-focus");
    await input.fill("кино");
    await page.waitForTimeout(2100);
    await waitForContent(page, 600);
    await shot(page, "search-d-results-kino");
    results.probes.searchEditorial = await page.evaluate(() => ({
      topResult: !!document.querySelector(".mq-search-topresult"),
      artistRows: [...document.querySelectorAll("h3")].filter(h => h.textContent?.trim() === "Артисты").length,
      albumTiles: [...document.querySelectorAll("h3")].filter(h => h.textContent?.trim() === "Альбомы").length,
      allTracks: [...document.querySelectorAll("h3")].some(h => h.textContent?.includes("Все треки")),
      rows: document.querySelectorAll(".mq-row").length,
    }));
    await input.fill("музыка");
    await page.waitForTimeout(2100);
    await waitForContent(page, 400);
    await shot(page, "search-d-results-muzyka");
    await input.fill("");
    await page.waitForTimeout(900);
    await shot(page, "search-d-discovery-back");
  }
  results.probes.searchOverflowD = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  await ctx.close();
}

async function searchMobile(browser) {
  const { ctx, page } = await newPage(browser, 390, 844, true);
  await demoLogin(page);
  const searchBtn = page.locator('button[aria-label="Поиск"]').locator("visible=true").first();
  await searchBtn.click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1100);
  await waitForContent(page, 300);
  await shot(page, "search-m-discovery");
  const input = page.locator("[data-search-input]").locator("visible=true").first();
  if (await input.count()) {
    await input.tap();
    await page.waitForTimeout(500);
    await shot(page, "search-m-focus");
    await input.fill("кино");
    await page.waitForTimeout(2200);
    await waitForContent(page, 600);
    await shot(page, "search-m-results-kino");
    results.probes.searchMobile = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll("button")].map(b => ({
        w: Math.round(b.getBoundingClientRect().width),
        h: Math.round(b.getBoundingClientRect().height),
      })).filter(b => b.w > 0 && b.h > 0);
      return {
        topResult: !!document.querySelector(".mq-search-topresult"),
        sub44: buttons.filter(b => b.h < 44 && b.w < 90).length,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
  }
  await ctx.close();
}

/* ═══ GROUP C — TABS (§23) ═══ */
async function tabsDesktop(browser) {
  const { ctx, page } = await newPage(browser, 1440, 900);
  await demoLogin(page);
  await waitForContent(page);
  await shot(page, "d-home");
  await waveOn(page); await shot(page, "d-wave"); await waveOff(page);
  const nav = async (label) => {
    const b = page.locator(`button[aria-label="${label}"]`).first();
    if (await b.count()) { await b.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1300); }
  };
  await nav("Поиск");
  const input = page.locator("[data-search-input]").first();
  if (await input.count()) { await input.fill("кино"); await page.waitForTimeout(2100); }
  await waitForContent(page, 300);
  await shot(page, "d-search");
  const artistRow = page.locator(".mq-row").filter({ hasText: /Артист ·/ }).first();
  if (await artistRow.count()) {
    await artistRow.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1800);
    await shot(page, "d-artist");
    await goHome(page);
    await nav("Поиск");
    const inp2 = page.locator("[data-search-input]").first();
    if (await inp2.count()) { await inp2.fill("кино"); await page.waitForTimeout(1800); }
  }
  await nav("Библиотека");
  await waitForContent(page, 300);
  await shot(page, "d-library");
  const plTab = page.locator("button").filter({ hasText: /^Плейлисты$/ }).first();
  if (await plTab.count()) { await plTab.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1100); await shot(page, "d-playlists"); }
  await nav("Чаты"); await waitForContent(page, 200); await shot(page, "d-chats");
  await nav("Настройки"); await page.waitForTimeout(1100); await shot(page, "d-settings");
  const row = page.locator('[aria-controls="mq-theme-picker"]').first();
  if (await row.count()) { await row.click().catch(() => {}); await page.waitForTimeout(700); await shot(page, "d-settings-themepicker"); }
  const capsule = page.locator(".mq-player-capsule button").first();
  if (await capsule.count()) {
    await capsule.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1800);
    await shot(page, "d-fullplayer");
    const queueBtn = page.locator('button[aria-label="Очередь"]').first();
    if (await queueBtn.count()) { await queueBtn.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1100); await shot(page, "d-queue"); }
    const closeBtn = page.locator('button[aria-label*="акрыть" i]').first();
    if (await closeBtn.count()) await closeBtn.click().catch(() => {});
    await page.waitForTimeout(800);
  }
  await shot(page, "d-playerbar");
  const rowEl = page.locator("li button, article").first();
  if (await rowEl.count()) {
    await rowEl.click({ button: "right", timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(900);
    await shot(page, "d-contextmenu");
    await page.keyboard.press("Escape");
  }
  results.probes.overflowD = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  await ctx.close();
}

async function tabsMobile(browser) {
  const { ctx, page } = await newPage(browser, 390, 844, true);
  await demoLogin(page);
  await waitForContent(page, 300);
  await shot(page, "m-home");
  await waveOn(page); await shot(page, "m-wave"); await waveOff(page);
  const art = page.locator(".mq-wave-art, [data-mq-hero] button").first();
  if (await art.count()) {
    await art.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1800);
    await shot(page, "m-fullplayer");
    const closeBtn = page.locator('button[aria-label*="акрыть" i], button[aria-label*="вернуть" i]').first();
    if (await closeBtn.count()) await closeBtn.click().catch(() => {});
    await page.waitForTimeout(700);
  }
  for (const [name, sel] of [
    ["library", 'button[aria-label="Библиотека"]'],
    ["search", 'button[aria-label="Поиск"]'],
    ["settings", 'button[aria-label="Настройки"]'],
  ]) {
    const b = page.locator(sel).first();
    if (await b.count()) { await b.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1300); await shot(page, `m-${name}`); }
  }
  results.probes.overflowM = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  await ctx.close();
}

/* ═══ GROUP D — PROD BEFORE (search + theme sameness) ═══ */
async function prodBefore(browser) {
  const { ctx, page } = await newPage(browser, 1440, 900);
  await demoLogin(page);
  const searchBtn = page.locator('button[aria-label="Поиск"]').first();
  await searchBtn.click({ timeout: 6000 });
  await page.waitForTimeout(1400);
  await waitForContent(page, 300);
  await shot(page, "before-d-search-empty");
  const input = page.locator("[data-search-input], input[placeholder*='иск' i]").first();
  if (await input.count()) {
    await input.fill("кино");
    await page.waitForTimeout(2400);
    await waitForContent(page, 600);
    await shot(page, "before-d-search-results");
    results.probes.beforeSearch = await page.evaluate(() => ({
      topResult: !!document.querySelector(".mq-search-topresult"),
      oldList: document.querySelectorAll(".mq-row").length,
    }));
    await input.fill("");
  }
  await switchTheme(page, "Abyss");
  await page.waitForTimeout(1200);
  await goHome(page);
  await shot(page, "before-d-theme-abyss-home");
  results.probes.beforeAmbientAbyss = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { pool: cs.getPropertyValue("--mq-amb-pool").trim() || "(unset)" };
  });
  await ctx.close();

  const { ctx: mctx, page: mpage } = await newPage(browser, 390, 844, true);
  await demoLogin(mpage);
  const s = mpage.locator('button[aria-label="Поиск"]').first();
  await s.click({ timeout: 6000 });
  await mpage.waitForTimeout(1400);
  await waitForContent(mpage, 300);
  await shot(mpage, "before-m-search-empty");
  const minput = mpage.locator("[data-search-input], input[placeholder*='иск' i]").first();
  if (await minput.count()) {
    await minput.fill("кино");
    await mpage.waitForTimeout(2400);
    await waitForContent(mpage, 600);
    await shot(mpage, "before-m-search-results");
  }
  await mctx.close();
}

const GROUPS = PHASE === "prod"
  ? [{ tag: "prod-before", run: (b) => prodBefore(b) }]
  : [
      { tag: "theme-matrix", run: (b) => themeMatrix(b) },
      { tag: "search-desktop", run: (b) => searchDesktop(b) },
      { tag: "tabs-desktop", run: (b) => tabsDesktop(b) },
      { tag: "search-mobile", run: (b) => searchMobile(b) },
      { tag: "tabs-mobile", run: (b) => tabsMobile(b) },
    ];

for (const g of GROUPS) {
  const up = await startServer();
  if (!up) { console.error(`server failed for ${g.tag}`); process.exit(1); }
  const browser = await chromium.launch({ headless: true });
  try {
    await g.run(browser);
    console.log(`✓ group ${g.tag} done`);
  } catch (e) {
    console.error(`✗ group ${g.tag}: ${e.message.slice(0, 300)}`);
    results.probes[`error-${g.tag}`] = e.message.slice(0, 300);
  }
  await browser.close();
  if (PHASE !== "prod") { killServer(); await new Promise((r) => setTimeout(r, 800)); }
}

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2));
console.log(`\nDONE — ${Object.keys(results.shots).length} shots → ${OUT}`);
console.log(`console errors: ${consoleErrors.length}`);
