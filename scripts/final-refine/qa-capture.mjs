/*
 * FINAL VISUAL REFINEMENT — QA capture (shared engine for BEFORE / AFTER).
 *
 * Usage:  node qa-capture.mjs <before|after>
 *
 * Captures the full section matrix:
 *   DESKTOP 1440x900 + 1920x1080, MOBILE 375x812 / 390x844 / 430x932
 *   Sections: Home, WAVE, Library, Search, Settings, Chats, Full Player,
 *             Queue, Context Menu, PlayerBar, Mobile nav.
 *
 * Sandbox note: 4GB RAM — the standalone Next server + one chromium must
 * never run as two long-lived neighbours. Therefore: the server is
 * restarted FRESH before each resolution group, and the browser is closed
 * at the end of each group.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { execSync, spawn } from "node:child_process";

const PHASE = process.argv[2] || "before";
const BASE = process.env.QA_BASE || "http://127.0.0.1:3112";
const OUT = `/home/z/my-project/download/qa-final-refine/${PHASE}`;
fs.mkdirSync(OUT, { recursive: true });

const results = { phase: PHASE, shots: {}, consoleErrors: [] };
const consoleErrors = results.consoleErrors;

function killServer() {
  // NOTE: the standalone server renames itself to "next-server (v16.x)"
  // (15-char comm truncation breaks pkill -x) and `fuser` is NOT installed
  // in this sandbox. Kill by the PID that owns the port (ss), then sweep.
  try {
    const out = execSync("ss -tlnp 2>/dev/null | grep 3112 | grep -oP 'pid=\\K[0-9]+' | head -1", { shell: "/bin/sh" }).toString().trim();
    if (out) execSync(`kill -9 ${out} 2>/dev/null || true`, { shell: "/bin/sh", stdio: "ignore" });
  } catch {}
  for (const cmd of [
    "pkill -f 'standalone/server.js' || true",
    "pkill -f 'serve-qa-v8' || true",
  ]) {
    try { execSync(cmd, { shell: "/bin/sh", stdio: "ignore" }); } catch {}
  }
}

let serverProc = null;
async function startServer() {
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
      await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 20000 });
      break;
    } catch {
      await page.waitForTimeout(3000);
    }
  }
  await page.waitForTimeout(2500);
  const btn = page.locator("button", { hasText: "Демо-режим" }).first();
  for (let i = 0; i < 3; i++) {
    try {
      await btn.waitFor({ state: "visible", timeout: 12000 });
      break;
    } catch { await page.waitForTimeout(2000); }
  }
  await btn.click({ timeout: 8000 });
  await page.waitForSelector("nav, [data-view='main']", { timeout: 30000 });
  await page.waitForTimeout(2200);
}

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  results.shots[name] = true;
};

/** Wait until real content (not skeletons) is painted — the featured card,
 *  a track row, or the wave hero. Prevents capturing a loading state. */
async function waitForContent(page, extraMs = 400) {
  const contentSel = "article, .mq-wave, [data-testid='track-row'], [data-testid='wave-home'], .mq-hero";
  try {
    await page.waitForSelector(contentSel, { timeout: 12000 });
  } catch {}
  // skeletons must be gone (if any existed)
  try {
    await page.waitForFunction(
      () => !document.querySelector(".mq-skeleton, [data-skeleton], .animate-pulse"),
      { timeout: 8000 },
    );
  } catch {}
  await page.waitForTimeout(extraMs);
}

async function desktopSections(browser, w, h, tag) {
  const { ctx, page } = await newPage(browser, w, h);
  await demoLogin(page);
  await waitForContent(page);
  await shot(page, `${tag}-home`);
  // WAVE on
  const waveBtn = page.locator('button[title*="WAVE" i], button[aria-label*="WAVE" i]').first();
  const navWave = page.locator("nav button, aside button").filter({ hasText: /WAVE/i }).first();
  const trigger = (await waveBtn.count()) ? waveBtn : navWave;
  if (await trigger.count()) {
    await trigger.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(2600);
    await waitForContent(page);
    await shot(page, `${tag}-wave`);
  }
  // Library
  const libBtn = page.locator('button[aria-label="Библиотека"]').first();
  if (await libBtn.count()) {
    await libBtn.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1400);
    await waitForContent(page, 200);
    await shot(page, `${tag}-library`);
  }
  // Search
  const searchBtn = page.locator('button[aria-label="Поиск"]').first();
  if (await searchBtn.count()) {
    await searchBtn.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(900);
    const input = page.locator("input[type='search'], input[placeholder*='иск' i], [data-search-input] input").first();
    if (await input.count()) {
      await input.fill("музыка");
      await page.waitForTimeout(1600);
    }
    await shot(page, `${tag}-search`);
  }
  // Chats (aria-label on nav item)
  const chatBtn = page.locator('button[aria-label="Чаты"]').first();
  if (await chatBtn.count()) {
    await chatBtn.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1400);
    await shot(page, `${tag}-chats`);
  }
  // Settings (icon-only button, aria-label)
  const setBtn = page.locator('button[aria-label="Настройки"]').first();
  if (await setBtn.count()) {
    await setBtn.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1400);
    await shot(page, `${tag}-settings`);
  }
  // Full player (click the player capsule info area)
  const capsule = page.locator(".mq-player-capsule button").first();
  if (await capsule.count()) {
    await capsule.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1800);
    await shot(page, `${tag}-fullplayer`);
    const queueBtn = page.locator('button[aria-label="Очередь"]').first();
    if (await queueBtn.count()) {
      await queueBtn.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(1100);
      await shot(page, `${tag}-queue`);
    }
    const closeBtn = page.locator('button[aria-label*="акрыть" i], button[aria-label*="Close" i]').first();
    if (await closeBtn.count()) await closeBtn.click().catch(() => {});
    await page.waitForTimeout(800);
  }
  await shot(page, `${tag}-playerbar`);
  // Context menu (right-click the first clickable track-ish element)
  const row = page.locator("li button, article").first();
  if (await row.count()) {
    await row.click({ button: "right", timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(900);
    await shot(page, `${tag}-contextmenu`);
    await page.keyboard.press("Escape");
  }
  results[`${tag}-overflowX`] = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  await ctx.close();
}

async function mobileSections(browser, w, h, tag) {
  const { ctx, page } = await newPage(browser, w, h, true);
  await demoLogin(page);
  await page.waitForTimeout(1200);
  await waitForContent(page, 300);
  await shot(page, `${tag}-home`);
  results[`${tag}-probe`] = await page.evaluate(() => ({
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    dockH: (() => {
      const d = document.querySelector(".mq-mobile-dock, nav");
      return d ? Math.round(d.getBoundingClientRect().height) : null;
    })(),
  }));
  // WAVE via nav
  const waveBtn = page.locator("button").filter({ hasText: /WAVE/i }).first();
  if (await waveBtn.count()) {
    await waveBtn.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(2600);
    await waitForContent(page, 200);
    await shot(page, `${tag}-wave`);
  }
  // Full player mobile: tap the wave artwork / hero
  const art = page.locator(".mq-wave-art, [data-mq-hero] button").first();
  if (await art.count()) {
    await art.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1800);
    await shot(page, `${tag}-fullplayer`);
    const closeBtn = page.locator('button[aria-label*="акрыть" i], button[aria-label*="вернуть" i]').first();
    if (await closeBtn.count()) await closeBtn.click().catch(() => {});
    await page.waitForTimeout(700);
  }
  for (const [name, sel] of [
    ["library", 'button[aria-label="Библиотека"]'],
    ["search", 'button[aria-label="Поиск"]'],
    ["settings", 'button[aria-label="Настройки"]'],
    ["chats", 'button[aria-label="Чаты"]'],
  ]) {
    const b = page.locator(sel).first();
    if (await b.count()) {
      await b.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(1400);
      await shot(page, `${tag}-${name}`);
    }
  }
  await ctx.close();
}

const GROUPS = [
  { tag: "d1440", run: (b) => desktopSections(b, 1440, 900, "d1440") },
  { tag: "d1920", run: (b) => desktopSections(b, 1920, 1080, "d1920") },
  { tag: "m390", run: (b) => mobileSections(b, 390, 844, "m390") },
  { tag: "m375", run: (b) => mobileSections(b, 375, 812, "m375") },
  { tag: "m430", run: (b) => mobileSections(b, 430, 932, "m430") },
];

for (const g of GROUPS) {
  const up = await startServer();
  if (!up) { console.error(`server failed to start for ${g.tag}`); process.exit(1); }
  const browser = await chromium.launch({ headless: true });
  try {
    await g.run(browser);
  } catch (e) {
    console.error(`group ${g.tag} error:`, e.message.slice(0, 200));
  }
  await browser.close();
  killServer();
}

fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(`[${PHASE}] shots:`, Object.keys(results.shots).length, "consoleErrors:", consoleErrors.length);
console.log(consoleErrors.slice(0, 6).join("\n"));
