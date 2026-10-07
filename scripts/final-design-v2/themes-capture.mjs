/*
 * V2 §5/§24 — THEME MATRIX: 4 themes × (Home NORMAL + WAVE) + Search
 * before-query per theme (§20: Search ambient follows the theme).
 * Themes: Obsidian (default), Borealis (aurora), Sakura, Daylight.
 * Usage: node themes-capture.mjs
 */
import { chromium } from "playwright";
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";

const BASE = "http://127.0.0.1:3112";
const OUT = "/home/z/my-project/download/qa-v2/local";
fs.mkdirSync(OUT, { recursive: true });

function killServer() {
  try { execSync("pkill -f 'standalone/server.js' || true", { shell: "/bin/sh", stdio: "ignore" }); } catch {}
  try { execSync("pkill -f 'next-server' || true", { shell: "/bin/sh", stdio: "ignore" }); } catch {}
}
async function startServer() {
  killServer();
  await new Promise(r => setTimeout(r, 800));
  const srv = spawn("node", ["/home/z/my-project/.next/standalone/server.js"], {
    env: { ...process.env, PORT: "3112", HOSTNAME: "127.0.0.1", NODE_ENV: "production" },
    stdio: "ignore", detached: true,
  });
  srv.unref();
  for (let i = 0; i < 30; i++) {
    try { const ok = await fetch(`${BASE}/play`, { redirect: "manual" }).catch(() => null); if (ok) return true; } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

const THEMES = [
  { name: "Obsidian", file: "obsidian" },
  { name: "Borealis", file: "borealis" },
  { name: "Sakura", file: "sakura" },
  { name: "Daylight", file: "daylight" },
];

const results = { probes: {} };
await startServer();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", e => results.probes["pageerror"] = String(e).slice(0, 100));
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2200);
const demo = page.locator("text=Демо-режим").first();
if (await demo.isVisible({ timeout: 8000 }).catch(() => false)) { await demo.click(); await page.waitForTimeout(2500); }

// A track must play for WAVE; play via search
await page.click('[aria-label="Поиск"]', { timeout: 6000 });
await page.waitForTimeout(1500);
await page.locator("[data-search-input]").fill("кино");
await page.waitForTimeout(2600);
const rows = page.locator('[role="button"][aria-label^="Слушать"]');
if (await rows.count() > 0) { await rows.first().click().catch(() => {}); await page.waitForTimeout(1800); }

for (const theme of THEMES) {
  // Settings → Оформление → expand theme picker → click the swatch by title
  await page.click('[aria-label="Настройки"]', { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const appearance = page.locator('button:has-text("Оформление")').first();
  if (await appearance.isVisible({ timeout: 3000 }).catch(() => false)) { await appearance.click(); await page.waitForTimeout(1100); }
  const picker = page.locator('[aria-controls="mq-theme-picker"]').first();
  if (await picker.isVisible({ timeout: 3000 }).catch(() => false)) {
    await picker.click();
    await page.waitForTimeout(700);
  }
  const swatch = page.locator(`[title="${theme.name}"]`).first();
  const ok = await swatch.isVisible({ timeout: 3000 }).catch(() => false);
  if (ok) { await swatch.click(); await page.waitForTimeout(1600); }
  results.probes[`${theme.file}-switched`] = ok;

  // NORMAL Home
  await page.click('[aria-label="Главная"]', { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/theme-${theme.file}-normal-home.png` });

  // SEARCH before-query (ambient follows theme — §20)
  await page.click('[aria-label="Поиск"]', { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/theme-${theme.file}-search.png` });

  // WAVE — start via the search-row context menu ("WAVE с этого трека"):
  // the hero CTA only exists in the empty-hero state (a track is playing here).
  await page.click('[aria-label="Поиск"]', { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.locator("[data-search-input]").fill("кино").catch(() => {});
  await page.waitForTimeout(2400);
  const wrows = page.locator('[role="button"][aria-label^="Слушать"]');
  let waveOn = false;
  if (await wrows.count() > 0) {
    await wrows.first().click({ button: "right" }).catch(() => {});
    await page.waitForTimeout(900);
    const waveItem = page.locator('text=WAVE с этого трека').first();
    if (await waveItem.isVisible({ timeout: 2500 }).catch(() => false)) {
      await waveItem.click();
      await page.waitForTimeout(3600);
      waveOn = true;
    }
  }
  if (waveOn) {
    await page.click('[aria-label="Главная"]', { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/theme-${theme.file}-wave-home.png` });
    // stop WAVE for the next theme run (player bar pause = stops radio)
    await page.keyboard.press(" ").catch(() => {});
    await page.waitForTimeout(1400);
  }
  results.probes[`${theme.file}-wave`] = waveOn;
  results.probes[`${theme.file}-pool`] = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--mq-amb-pool").trim());
}

// Ambient probe per theme (pool color must differ)
results.probes.ambientCheck = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  return { pool: cs.getPropertyValue("--mq-amb-pool").trim(), glass: cs.getPropertyValue("--mq-amb-glass").trim() };
});

await ctx.close();
await browser.close();
killServer();
fs.writeFileSync(`${OUT}/themes-report.json`, JSON.stringify(results, null, 2));
console.log("DONE", JSON.stringify(results.probes));
