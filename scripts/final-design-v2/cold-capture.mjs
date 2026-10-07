/* Dedicated COLD-START capture: fresh profile, sync blocked (no server
 * history restore). Usage: node cold-capture.mjs [mobile|desktop|both]
 * (Default both — but separate invocations avoid the 60/min read limiter.) */
import { chromium } from "playwright";
import { execSync, spawn } from "node:child_process";

const ONLY = process.argv[2] || "both";
const BASE = "http://127.0.0.1:3112";
const OUT = "/home/z/my-project/download/qa-v2/local";

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

async function captureCold(browser, { w, h, isMobile, name, prefix }) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    ...(isMobile
      ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }
      : {}),
  });
  const page = await ctx.newPage();
  await page.route("**/api/sync**", r => r.fulfill({ status: 200, contentType: "application/json", body: '{"success":true,"items":[]}' }));
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);
  const demo = page.locator("text=Демо-режим").first();
  if (await demo.isVisible({ timeout: 8000 }).catch(() => false)) {
    await demo.click();
    await page.waitForTimeout(2500);
  }
  if (isMobile) await page.locator('button[aria-label="Поиск"]').last().click({ timeout: 6000 });
  else await page.click('[aria-label="Поиск"]', { timeout: 6000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUT}/${prefix}-search-before-cold.png` });
  await page.screenshot({ path: `${OUT}/${prefix}-search-before-cold-full.png`, fullPage: true });
  const probes = {
    featured: await page.locator("[data-mq-search-featured]").count(),
    genreTiles: await page.getByText("Обзор жанров").count(),
    popularChips: await page.getByText("Популярные запросы").count(),
    overflowX: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  };
  console.log(`${name} COLD:`, JSON.stringify(probes));
  await ctx.close();
}

await startServer();
const browser = await chromium.launch();

if (ONLY === "mobile" || ONLY === "both") {
  await captureCold(browser, { w: 390, h: 844, isMobile: true, name: "MOBILE", prefix: "m390" });
}
if (ONLY === "desktop" || ONLY === "both") {
  if (ONLY === "both") await new Promise(r => setTimeout(r, 20000));
  await captureCold(browser, { w: 1440, h: 900, isMobile: false, name: "DESKTOP", prefix: "d1440" });
}

await browser.close();
killServer();
console.log("DONE");
