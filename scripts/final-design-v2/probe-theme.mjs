import { chromium } from "playwright";
import { execSync, spawn } from "node:child_process";
const BASE = "http://127.0.0.1:3112";
function killServer() {
  try { execSync("pkill -f 'standalone/server.js' || true", { shell: "/bin/sh", stdio: "ignore" }); } catch {}
  try { execSync("pkill -f 'next-server' || true", { shell: "/bin/sh", stdio: "ignore" }); } catch {}
}
killServer(); await new Promise(r => setTimeout(r, 800));
const srv = spawn("node", ["/home/z/my-project/.next/standalone/server.js"], {
  env: { ...process.env, PORT: "3112", HOSTNAME: "127.0.0.1", NODE_ENV: "production" }, stdio: "ignore", detached: true });
srv.unref();
for (let i = 0; i < 30; i++) { try { const ok = await fetch(`${BASE}/play`, { redirect: "manual" }).catch(() => null); if (ok) break; } catch {} await new Promise(r => setTimeout(r, 1000)); }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2200);
await page.locator("text=Демо-режим").first().click();
await page.waitForTimeout(2200);
// find settings entry — what aria labels exist?
await page.click('[aria-label="Настройки"]', { timeout: 6000 }).catch(e => console.log("settings nav fail:", e.message.slice(0, 80)));
await page.waitForTimeout(1500);
console.log("settings body:", (await page.evaluate(() => document.body.innerText.slice(0, 300))).replace(/\n/g, "|"));
// Open the "Оформление" section first
const appearance = page.locator('button:has-text("Оформление")').first();
if (await appearance.isVisible({ timeout: 3000 }).catch(() => false)) { await appearance.click(); await page.waitForTimeout(1200); }
const picker = page.locator('[aria-controls="mq-theme-picker"]').first();
console.log("picker count:", await page.locator('[aria-controls="mq-theme-picker"]').count());
if (await picker.isVisible({ timeout: 3000 }).catch(() => false)) {
  await picker.click(); await page.waitForTimeout(800);
  console.log("swatches:", await page.locator(".mq-swatch").count());
  console.log("title Obsidian:", await page.locator('[title="Obsidian"]').count());
  const byTitle = page.locator('[title="Borealis"]').first();
  if (await byTitle.isVisible().catch(() => false)) { await byTitle.click(); await page.waitForTimeout(1800); }
  console.log("pool after switch:", await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--mq-amb-pool")));
}
await browser.close(); killServer();
