/*
 * V2 §21/§24 — TABS matrix capture (desktop 1440 + mobile 390):
 * Home, Library, Playlists, Settings, Queue, WAVE, Full Player, Chats.
 * Usage: node tabs-capture.mjs [desktop|mobile]
 */
import { chromium } from "playwright";
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";

const ONLY = process.argv[2] || "both";
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

const results = { probes: {}, errors: [] };

async function runSession(browser, { w, h, isMobile, prefix }) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    ...(isMobile
      ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }
      : {}),
  });
  const page = await ctx.newPage();
  page.on("pageerror", e => results.errors.push(String(e).slice(0, 120)));
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);
  const demo = page.locator("text=Демо-режим").first();
  if (await demo.isVisible({ timeout: 8000 }).catch(() => false)) { await demo.click(); await page.waitForTimeout(2500); }

  const nav = async (label) => {
    if (isMobile) await page.locator(`button[aria-label="${label}"]`).last().click({ timeout: 6000 }).catch(() => {});
    else await page.click(`[aria-label="${label}"]`, { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1600);
  };
  const shot = (name) => page.screenshot({ path: `${OUT}/${prefix}-${name}.png` });

  // HOME
  await shot("01-home");
  results.probes[`${prefix}-home-overflow`] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // SEARCH (skip — captured separately)

  // LIBRARY
  await nav("Библиотека");
  await shot("03-library");

  // PLAYLISTS (via library → плейлисты tab if present; else nav)
  const plTab = page.locator('button:has-text("Плейлисты")').first();
  if (await plTab.isVisible({ timeout: 2500 }).catch(() => false)) { await plTab.click(); await page.waitForTimeout(1200); }
  await shot("10-playlists");

  // SETTINGS
  if (isMobile) {
    // Settings lives behind the Демо/profile on mobile? Try nav label first
    await page.locator('button[aria-label="Настройки"], [aria-label="Профиль"]').last().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1400);
    // inside profile, find settings gear if needed
    const gear = page.locator('[aria-label="Настройки"], [title="Настройки"]').first();
    if (await gear.isVisible({ timeout: 2000 }).catch(() => false)) { await gear.click(); await page.waitForTimeout(1200); }
  } else {
    await nav("Настройки");
  }
  await shot("06-settings");

  // WAVE — home → WAVE card/button
  await nav("Главная");
  const waveBtn = page.locator('button:has-text("Запустить WAVE"), [aria-label*="WAVE"]').first();
  if (await waveBtn.isVisible({ timeout: 3000 }).catch(() => false)) { await waveBtn.click(); await page.waitForTimeout(2600); }
  await shot("02-wave");

  // FULL PLAYER — play a track from search then open player
  await nav("Поиск");
  await page.locator("[data-search-input]").fill("кино").catch(() => {});
  await page.waitForTimeout(2600);
  const rows = page.locator('[role="button"][aria-label^="Слушать"]');
  if (await rows.count() > 0) { await rows.first().click().catch(() => {}); await page.waitForTimeout(2000); }
  // open full player
  const artwork = page.locator("[data-mq-playerbar] img, [data-mq-playerbar] .mq-art").first();
  const pbOpen = page.locator('[aria-label="Открыть плеер"], [aria-label="Развернуть плеер"]').first();
  if (await pbOpen.isVisible({ timeout: 2000 }).catch(() => false)) { await pbOpen.click(); await page.waitForTimeout(1400); }
  else if (await artwork.isVisible({ timeout: 2000 }).catch(() => false)) { await artwork.click(); await page.waitForTimeout(1400); }
  await shot("07-fullplayer");
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(800);

  // QUEUE — via player bar queue button
  const queueBtn = page.locator('[aria-label="Очередь"], [aria-label="Очередь воспроизведения"], [title*="очередь" i]').first();
  if (await queueBtn.isVisible({ timeout: 2500 }).catch(() => false)) { await queueBtn.click(); await page.waitForTimeout(1400); await shot("08-queue"); }
  else {
    // try context panel from full player
    await shot("08-queue-missing");
  }

  results.probes[`${prefix}-final-overflow`] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await ctx.close();
}

await startServer();
const browser = await chromium.launch();
if (ONLY === "desktop" || ONLY === "both") await runSession(browser, { w: 1440, h: 900, isMobile: false, prefix: "d1440" });
if (ONLY === "mobile" || ONLY === "both") {
  if (ONLY === "both") await new Promise(r => setTimeout(r, 20000));
  await runSession(browser, { w: 390, h: 844, isMobile: true, prefix: "m390" });
}
await browser.close();
killServer();
fs.writeFileSync(`${OUT}/tabs-report.json`, JSON.stringify(results, null, 2));
console.log("DONE", JSON.stringify(results.probes), "errors:", results.errors.length);
