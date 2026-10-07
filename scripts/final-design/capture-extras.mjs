/* Targeted captures: context menu, settings theme picker, queue (after gutter fix). */
import { chromium } from "playwright";
import fs from "node:fs";
import { execSync, spawn } from "node:child_process";

const BASE = "http://127.0.0.1:3112";
const OUT = "/home/z/my-project/download/qa-final-design/local";

function killServer() {
  try {
    const out = execSync("ss -tlnp 2>/dev/null | grep 3112 | grep -oP 'pid=\\K[0-9]+' | head -1", { shell: "/bin/sh" }).toString().trim();
    if (out) execSync(`kill -9 ${out}`, { shell: "/bin/sh", stdio: "ignore" });
  } catch {}
  try { execSync("pkill -f 'standalone/server.js' || true", { shell: "/bin/sh", stdio: "ignore" }); } catch {}
}

killServer();
await new Promise(r => setTimeout(r, 1000));
const proc = spawn("node", ["/home/z/my-project/.next/standalone/server.js"], {
  env: { ...process.env, PORT: "3112", HOSTNAME: "127.0.0.1", NODE_ENV: "production" },
  stdio: "ignore", detached: true,
});
proc.unref();
for (let i = 0; i < 30; i++) {
  const ok = await fetch(`${BASE}/play`, { redirect: "manual" }).catch(() => null);
  if (ok) break;
  await new Promise(r => setTimeout(r, 1000));
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
const btn = page.locator("button", { hasText: "Демо-режим" }).first();
await btn.waitFor({ state: "visible", timeout: 15000 });
await btn.click({ timeout: 8000 });
await page.waitForTimeout(2200);

// 1) search + right-click a track row → context menu
const searchBtn = page.locator('button[aria-label="Поиск"]').first();
await searchBtn.click({ timeout: 5000 });
await page.waitForTimeout(1200);
const input = page.locator("[data-search-input]").first();
await input.fill("кино");
await page.waitForTimeout(2200);
const row = page.locator(".mq-row").first();
await row.click({ button: "right", timeout: 5000 });
await page.waitForTimeout(1100);
await page.screenshot({ path: `${OUT}/d-contextmenu.png` });
const ctxProbe = await page.evaluate(() => {
  const menus = [...document.querySelectorAll("[class*='menu'], [role='menu'], [class*='context']")].filter(m => m.offsetParent !== null);
  return { openMenus: menus.length, firstClass: menus[0]?.className?.slice(0, 80) || null };
});
console.log("CTX", JSON.stringify(ctxProbe));
await page.keyboard.press("Escape");

// 2) settings + theme picker open (swatch grid with ambient previews)
const setBtn = page.locator('button[aria-label="Настройки"]').first();
await setBtn.click({ timeout: 5000 });
await page.waitForTimeout(1300);
const tab = page.locator("button").filter({ hasText: /^Оформление$/ }).first();
if (await tab.count()) { await tab.click({ timeout: 3000 }); await page.waitForTimeout(600); }
const row2 = page.locator('[aria-controls="mq-theme-picker"]').first();
if (await row2.count()) { await row2.click({ timeout: 3000 }); await page.waitForTimeout(800); }
await page.screenshot({ path: `${OUT}/d-settings-themepicker.png` });
console.log("themepicker shot ok");

// 3) queue after gutter fix: play something, open queue
const playSomething = page.locator('button[aria-label="Главная"]').first();
if (await playSomething.count()) { await playSomething.click(); await page.waitForTimeout(1000); }
const playBtn = page.locator("button").filter({ hasText: /^Играть все$|^Слушать$/ }).first();
if (await playBtn.count()) { await playBtn.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1500); }
const capsule = page.locator(".mq-player-capsule button").first();
if (await capsule.count()) {
  await capsule.click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1600);
  const queueBtn = page.locator('button[aria-label="Очередь"]').first();
  if (await queueBtn.count()) { await queueBtn.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(1100); }
  await page.screenshot({ path: `${OUT}/d-queue.png` });
  console.log("queue shot ok");
  const closeBtn = page.locator('button[aria-label*="акрыть" i]').first();
  if (await closeBtn.count()) await closeBtn.click().catch(() => {});
}
await ctx.close();
await browser.close();
killServer();
console.log("done");
