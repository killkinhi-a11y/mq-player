/*
 * V2 §24 — LOCAL capture: Search BEFORE/AFTER + cold start + themes + tabs.
 * Usage: node local-capture.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { execSync, spawn } from "node:child_process";

const BASE = "http://127.0.0.1:3112";
const OUT = "/home/z/my-project/download/qa-v2/local";
fs.mkdirSync(OUT, { recursive: true });

const results = { shots: {}, consoleErrors: [], probes: {} };

// ── server lifecycle (in-script: survives the caller shell) ──
let serverProc = null;
function killServer() {
  try { execSync(`ss -tlnp 2>/dev/null | grep 3112 | grep -oP 'pid=\\K[0-9]+' | head -1`, { shell: "/bin/sh" }).toString().trim().split("\n").filter(Boolean).forEach(pid => execSync(`kill -9 ${pid} 2>/dev/null || true`, { shell: "/bin/sh", stdio: "ignore" })); } catch {}
  try { execSync("pkill -f 'standalone/server.js' || true", { shell: "/bin/sh", stdio: "ignore" }); } catch {}
  try { execSync("pkill -f 'next-server' || true", { shell: "/bin/sh", stdio: "ignore" }); } catch {}
}
async function startServer() {
  killServer();
  await new Promise(r => setTimeout(r, 800));
  serverProc = spawn("node", ["/home/z/my-project/.next/standalone/server.js"], {
    env: { ...process.env, PORT: "3112", HOSTNAME: "127.0.0.1", NODE_ENV: "production" },
    stdio: "ignore", detached: true,
  });
  serverProc.unref();
  for (let i = 0; i < 30; i++) {
    try { const ok = await fetch(`${BASE}/play`, { redirect: "manual" }).catch(() => null); if (ok) return true; } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

async function newPage(browser, w, h, isMobile = false) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    ...(isMobile
      ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }
      : {}),
  });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") results.consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => results.consoleErrors.push("PAGEERROR " + String(e).slice(0, 200)));
  return { ctx, page };
}

async function enterDemo(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  const demo = page.locator("text=Демо-режим").first();
  if (await demo.isVisible({ timeout: 8000 }).catch(() => false)) {
    await demo.click();
    await page.waitForTimeout(2200);
    return true;
  }
  return false;
}

async function gotoSearch(page) {
  const cands = [
    () => page.click('[aria-label="Поиск"]', { timeout: 2500 }),
    () => page.locator('button[aria-label="Поиск"]').last().click({ timeout: 2500 }),
  ];
  for (const c of cands) { if (await c().then(() => true).catch(() => false)) return true; }
  return false;
}

const serverOk = await startServer();
results.probes.server = serverOk;
if (!serverOk) { console.error("SERVER FAIL"); process.exit(1); }
const browser = await chromium.launch();

// ── DESKTOP 1440×900 — warm before-query, after-query, cold start ──
{
  const { ctx, page } = await newPage(browser, 1440, 900);
  await enterDemo(page);
  await gotoSearch(page);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/d1440-search-before-warm.png` });

  // AFTER QUERY
  await page.locator("[data-search-input]").fill("кино");
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/d1440-search-after-kino.png` });
  // clear
  await page.locator("[data-search-input]").fill("");
  await page.waitForTimeout(1200);

  // COLD START — wipe persisted personal data, reload
  await page.evaluate(() => {
    localStorage.removeItem("mq-search-history");
    const keys = Object.keys(localStorage).filter(k => /mq/i.test(k) && /store|persist/i.test(k));
    // wipe the persisted store entirely for a cold profile
    for (const k of keys) localStorage.removeItem(k);
    localStorage.removeItem("mq-player-store");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  // re-enter demo (fresh store logged out)
  const demo = page.locator("text=Демо-режим").first();
  if (await demo.isVisible({ timeout: 6000 }).catch(() => false)) {
    await demo.click();
    await page.waitForTimeout(2200);
  }
  await gotoSearch(page);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/d1440-search-before-cold.png` });
  results.probes.coldFeatured = await page.locator("[data-mq-search-featured]").count();
  results.probes.coldGenreTiles = await page.getByText("Обзор жанров").count();
  await ctx.close();
}

// ── MOBILE 390×844 — warm + cold ──
{
  const { ctx, page } = await newPage(browser, 390, 844, true);
  await enterDemo(page);
  await gotoSearch(page);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/m390-search-before-warm.png`, fullPage: false });
  await page.locator("[data-search-input]").fill("кино");
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/m390-search-after-kino.png` });
  results.probes.mOverflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  // sub-44px probe on interactive elements in search home
  await page.locator("[data-search-input]").fill("");
  await page.waitForTimeout(1200);
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2));
console.log("DONE", JSON.stringify({ errors: results.consoleErrors.length, probes: results.probes, firstErrors: results.consoleErrors.slice(0, 5) }));
