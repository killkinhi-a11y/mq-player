/* Debug: does --mq-g2-tint follow theme switches? */
import { chromium } from "playwright";
import { execSync, spawn } from "node:child_process";

const BASE = "http://127.0.0.1:3112";

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
await btn.click({ timeout: 8000 });
await page.waitForTimeout(2500);

async function switchTheme(name) {
  const setBtn = page.locator('button[aria-label="Настройки"]').first();
  await setBtn.click({ timeout: 5000 });
  await page.waitForTimeout(1300);
  const tab = page.locator("button").filter({ hasText: /^Оформление$/ }).first();
  await tab.click({ timeout: 3000 });
  await page.waitForTimeout(600);
  const row = page.locator('[aria-controls="mq-theme-picker"]').first();
  await row.click({ timeout: 3000 });
  await page.waitForTimeout(500);
  await page.locator(`#mq-theme-picker button[title="${name}"]`).first().click({ timeout: 4000 });
  await page.waitForTimeout(1400);
}

for (const t of ["Abyss", "Borealis"]) {
  await switchTheme(t);
  const home = page.locator('button[aria-label="Главная"], button[aria-label="Домой"]').first();
  if (await home.count()) { await home.click({ timeout: 4000 }); await page.waitForTimeout(1200); }
  const probe = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      g2tint: cs.getPropertyValue("--mq-g2-tint").trim().slice(0, 50),
      ambGlass: cs.getPropertyValue("--mq-amb-glass").trim(),
      wave1: cs.getPropertyValue("--wave-color-1").trim(),
      wave2: cs.getPropertyValue("--wave-color-2").trim(),
    };
  });
  console.log(t, JSON.stringify(probe));
}
await browser.close();
killServer();
