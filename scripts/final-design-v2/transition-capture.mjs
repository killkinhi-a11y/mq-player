/* V2 §24 — theme switch MID-TRANSITION frame (the 850ms material cross-fade). */
import { chromium } from "playwright";
import { execSync, spawn } from "node:child_process";

const BASE = "http://127.0.0.1:3112";
const OUT = "/home/z/my-project/download/qa-v2/local";
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
await page.waitForTimeout(2400);
// settings → appearance → picker
await page.click('[aria-label="Настройки"]', { timeout: 6000 });
await page.waitForTimeout(1400);
await page.locator('button:has-text("Оформление")').first().click();
await page.waitForTimeout(1100);
await page.locator('[aria-controls="mq-theme-picker"]').first().click();
await page.waitForTimeout(700);
// go home so the full environment is visible, then return is not needed —
// theme change applies globally. Screenshot the MID frame ~420ms after click.
const swatch = page.locator('[title="Sakura"]').first();
await swatch.click();
await page.waitForTimeout(420); // mid-cross-fade (850ms total)
await page.screenshot({ path: `${OUT}/theme-transition-mid.png` });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/theme-transition-settled.png` });
console.log("captured mid + settled");
await browser.close();
killServer();
