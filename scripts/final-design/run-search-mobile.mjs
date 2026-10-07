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
}
killServer();
await new Promise(r => setTimeout(r, 1000));
const serverProc = spawn("node", ["/home/z/my-project/.next/standalone/server.js"], {
  env: { ...process.env, PORT: "3112", HOSTNAME: "127.0.0.1", NODE_ENV: "production" },
  stdio: "ignore", detached: true,
});
serverProc.unref();
for (let i = 0; i < 30; i++) {
  const ok = await fetch(`${BASE}/play`, { redirect: "manual" }).catch(() => null);
  if (ok) break;
  await new Promise(r => setTimeout(r, 1000));
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
const page = await ctx.newPage();
await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
const btn = page.locator("button", { hasText: "Демо-режим" }).first();
await btn.waitFor({ state: "visible", timeout: 15000 });
await btn.click({ timeout: 8000 });
await page.waitForTimeout(2200);

const searchBtn = page.locator('button[aria-label="Поиск"]').locator("visible=true").first();
await searchBtn.click({ timeout: 6000 });
await page.waitForTimeout(1100);
await page.screenshot({ path: `${OUT}/search-m-discovery.png` });
const input = page.locator("[data-search-input]").locator("visible=true").first();
if (await input.count()) {
  await input.tap();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/search-m-focus.png` });
  await input.fill("кино");
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/search-m-results-kino.png` });
  const probe = await page.evaluate(() => ({
    topResult: !!document.querySelector(".mq-search-topresult"),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    sub44: [...document.querySelectorAll("button")].map(b => b.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0 && r.height < 44 && r.width < 90).length,
  }));
  fs.writeFileSync("/tmp/search-mobile-probe.json", JSON.stringify(probe));
  console.log("PROBE", JSON.stringify(probe));
}
await browser.close();
killServer();
console.log("done");
