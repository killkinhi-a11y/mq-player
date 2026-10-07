import { chromium } from "playwright";
import { execSync, spawn } from "node:child_process";
function killServer() {
  try { execSync("pkill -f 'standalone/server.js' || true", { shell: "/bin/sh", stdio: "ignore" }); } catch {}
  try { execSync("pkill -f 'next-server' || true", { shell: "/bin/sh", stdio: "ignore" }); } catch {}
}
killServer(); await new Promise(r => setTimeout(r, 800));
const srv = spawn("node", ["/home/z/my-project/.next/standalone/server.js"], {
  env: { ...process.env, PORT: "3112", HOSTNAME: "127.0.0.1", NODE_ENV: "production" }, stdio: "ignore", detached: true });
srv.unref();
for (let i = 0; i < 30; i++) { try { const ok = await fetch("http://127.0.0.1:3112/play", { redirect: "manual" }).catch(() => null); if (ok) break; } catch {} await new Promise(r => setTimeout(r, 1000)); }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:3112", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2200);
await page.locator("text=Демо-режим").first().click();
await page.waitForTimeout(2600);
// 1. nav glass
const nav = await page.evaluate(() => {
  const el = document.querySelector(".mq-glass2-nav");
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { bgColor: cs.backgroundColor, bgImage: (cs.backgroundImage || "").slice(0, 220) };
});
console.log("NAV:", JSON.stringify(nav));
// 2. platinum button (search home featured)
await page.click('[aria-label="Поиск"]', { timeout: 6000 });
await page.waitForTimeout(3500);
const btn = await page.evaluate(() => {
  const el = document.querySelector(".mq-platinum-btn");
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { bgColor: cs.backgroundColor, bgImage: (cs.backgroundImage || "").slice(0, 260) };
});
console.log("BTN:", JSON.stringify(btn));
// 3. menu surface (right-click a row)
await page.locator("[data-search-input]").fill("кино");
await page.waitForTimeout(2600);
const row = page.locator('[role="button"][aria-label^="Слушать"]').first();
if (await row.count() > 0) {
  await row.click({ button: "right" });
  await page.waitForTimeout(900);
  const menu = await page.evaluate(() => {
    const el = document.querySelector(".mq-menu-surface");
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { bgColor: cs.backgroundColor, bgImage: (cs.backgroundImage || "").slice(0, 220) };
  });
  console.log("MENU:", JSON.stringify(menu));
  await page.screenshot({ path: "/tmp/menu-glass-fixed.png" });
}
await browser.close(); killServer();
