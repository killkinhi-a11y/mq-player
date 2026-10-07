/* Mobile cold-start debug: why is the featured card missing on mobile? */
import { chromium } from "playwright";
import { execSync, spawn } from "node:child_process";

const BASE = "http://127.0.0.1:3112";
function killServer() {
  try { execSync("pkill -f 'standalone/server.js' || true", { shell: "/bin/sh", stdio: "ignore" }); } catch {}
  try { execSync("pkill -f 'next-server' || true", { shell: "/bin/sh", stdio: "ignore" }); } catch {}
}
killServer();
await new Promise(r => setTimeout(r, 800));
const srv = spawn("node", ["/home/z/my-project/.next/standalone/server.js"], {
  env: { ...process.env, PORT: "3112", HOSTNAME: "127.0.0.1", NODE_ENV: "production" },
  stdio: "ignore", detached: true,
});
srv.unref();
for (let i = 0; i < 30; i++) {
  try { const ok = await fetch(`${BASE}/play`, { redirect: "manual" }).catch(() => null); if (ok) break; } catch {}
  await new Promise(r => setTimeout(r, 1000));
}

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
const page = await ctx.newPage();
page.on("console", m => { const t = m.text(); if (t.includes("genre") || m.type() === "error") console.log("CONSOLE:", t.slice(0, 150)); });
page.on("response", r => { if (r.url().includes("/api/music/genre")) console.log("GENRE RESPONSE:", r.status()); });
page.on("pageerror", e => console.log("PAGEERR:", String(e).slice(0, 150)));
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2200);
await page.locator("text=Демо-режим").first().click();
await page.waitForTimeout(2500);
await page.locator('button[aria-label="Поиск"]').last().click({ timeout: 6000 });
await page.waitForTimeout(6000);
console.log("featured:", await page.locator("[data-mq-search-featured]").count());
console.log("Популярная музыка:", await page.getByText("Популярная музыка").count());
console.log("жанры:", await page.getByText("Обзор жанров").count());
console.log("body:", (await page.evaluate(() => document.body.innerText.slice(0, 400))).replace(/\n/g, "|"));
await page.screenshot({ path: "/tmp/m-cold-debug.png" });
await browser.close();
killServer();
