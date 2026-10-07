/* Probe: does clicking a search result row start playback (history entry)? */
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", m => { if (m.type() === "error") console.log("ERR:", m.text().slice(0, 120)); });
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(2000);
await page.locator("text=Демо-режим").first().click();
await page.waitForTimeout(2000);

// navigate to search via aria-label
await page.click('[aria-label="Поиск"]', { timeout: 5000 });
await page.waitForTimeout(1500);
await page.locator("[data-search-input]").fill("кино");
await page.waitForTimeout(2800);

const rows = page.locator('[role="button"][aria-label^="Слушать"]');
console.log("search rows:", await rows.count());
if (await rows.count() > 0) {
  await rows.first().click();
  await page.waitForTimeout(3000);
  // player bar state
  const pb = await page.evaluate(() => document.body.innerText.slice(0, 400));
  console.log("PLAYERBAR AREA:", pb.split("\n").slice(0, 12).join(" | "));
  // check history in library
  await page.click('[aria-label="Библиотека"]', { timeout: 4000 }).catch(async () => {
    await page.locator('button[aria-label="Библиотека"]').last().click({ timeout: 4000 });
  });
  await page.waitForTimeout(1500);
  const lib = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("LIBRARY:", lib.split("\n").filter(l => l.trim()).slice(0, 15).join(" | "));
}
await browser.close();
killServer();
