/*
 * V2 §24 — LOCAL capture v2: Search BEFORE (warm+cold) / AFTER / typing,
 * mobile, themes. Warm state = demo + PLAY a track (history) + search кино
 * (search history) + like a track (quick picks). Cold = fresh demo profile.
 * Usage: node local-capture2.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import { execSync, spawn } from "node:child_process";

const BASE = "http://127.0.0.1:3112";
const OUT = "/home/z/my-project/download/qa-v2/local";
fs.mkdirSync(OUT, { recursive: true });

const results = { shots: {}, consoleErrors: [], probes: {} };

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

async function fillSearch(page, text) {
  for (let i = 0; i < 3; i++) {
    const el = page.locator("[data-search-input]");
    if (await el.count() > 0) {
      try { await el.fill(text, { timeout: 8000 }); return true; } catch {}
    }
    await gotoSearch(page);
    await page.waitForTimeout(1200);
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

const browser = await chromium.launch();
const serverOk = await startServer();
results.probes.server = serverOk;
if (!serverOk) { console.error("SERVER FAIL"); process.exit(1); }

// ═══ DESKTOP 1440×900 ═══
{
  const { ctx, page } = await newPage(browser, 1440, 900);
  await enterDemo(page);

  // ── WARM STATE SETUP (proven path: play via SEARCH rows → real history) ──
  // 1. search "кино" → play first row (history entry #1 + search query #1)
  await gotoSearch(page);
  await fillSearch(page, "кино");
  await page.waitForTimeout(2800);
  let rows = page.locator('[role="button"][aria-label^="Слушать"]');
  if (await rows.count() > 0) {
    await rows.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2200);
  }
  // like the current track (player bar heart) → quick picks
  await page.locator('[aria-label="Добавить в любимые"], [aria-label="Нравится"]').first().click({ timeout: 3000 }).catch(() => {});
  // 2. search "джаз" → play first row (history #2 + search query #2)
  await fillSearch(page, "джаз");
  await page.waitForTimeout(2800);
  rows = page.locator('[role="button"][aria-label^="Слушать"]');
  if (await rows.count() > 1) {
    await rows.nth(1).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2200);
  }
  // 3. final search "кино" — the AFTER-query screenshot state
  await fillSearch(page, "кино");
  await page.waitForTimeout(2800);
  console.log("step: after-kino captured");
  await page.screenshot({ path: `${OUT}/d1440-search-after-kino.png` });
  // clear → WARM before-query
  await fillSearch(page, "");
  await page.waitForTimeout(1400);
  console.log("step: before-warm captured, featured=", await page.locator("[data-mq-search-featured]").count());
  await page.screenshot({ path: `${OUT}/d1440-search-before-warm.png` });
  await page.screenshot({ path: `${OUT}/d1440-search-before-warm-full.png`, fullPage: true });
  results.probes.warmFeatured = await page.locator("[data-mq-search-featured]").count();
  results.probes.warmRecentRows = await page.locator(".recent-search-row").count();
  results.probes.warmArtists = await page.getByText("Артисты рядом").count();
  results.probes.warmQuickPicks = await page.getByText("Быстрый доступ").count();
  results.probes.dOverflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // ── COLD STATE: wipe all persisted data, re-enter demo ──
  await page.evaluate(() => {
    localStorage.removeItem("mq-search-history");
    Object.keys(localStorage).forEach(k => { if (/mq/i.test(k)) localStorage.removeItem(k); });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2600);
  const demo = page.locator("text=Демо-режим").first();
  if (await demo.isVisible({ timeout: 6000 }).catch(() => false)) {
    await demo.click();
    await page.waitForTimeout(2400);
  }
  await gotoSearch(page);
  await page.waitForTimeout(4000); // cold fetch (+ possible retry)
  await page.screenshot({ path: `${OUT}/d1440-search-before-cold.png` });
  await page.screenshot({ path: `${OUT}/d1440-search-before-cold-full.png`, fullPage: true });
  results.probes.coldFeatured = await page.locator("[data-mq-search-featured]").count();
  results.probes.coldGenreTiles = await page.getByText("Обзор жанров").count();
  await ctx.close();
}

// ═══ MOBILE 390×844 ═══
{
  const { ctx, page } = await newPage(browser, 390, 844, true);
  await enterDemo(page);
  // warm: search + play a row (history) + like
  await gotoSearch(page);
  await fillSearch(page, "кино");
  await page.waitForTimeout(2800);
  const rows = page.locator('[role="button"][aria-label^="Слушать"]');
  if (await rows.count() > 0) {
    await rows.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }
  await page.locator('[aria-label="Добавить в любимые"], [aria-label="Нравится"]').first().click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/m390-search-after-kino.png` });
  await fillSearch(page, "");
  await page.waitForTimeout(1400);
  console.log("step: mobile before-warm captured");
  await page.screenshot({ path: `${OUT}/m390-search-before-warm.png` });
  await page.screenshot({ path: `${OUT}/m390-search-before-warm-full.png`, fullPage: true });
  results.probes.mOverflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  // sub-44px interactive probe (visible buttons in search home)
  results.probes.mSub44 = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll("main button, [role='button']").forEach(el => {
      const r = el.getBoundingClientRect();
      const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
      const style = getComputedStyle(el);
      if (visible && style.pointerEvents !== "none" && (r.height < 44) && !el.closest("[hidden]")) {
        // icon-only buttons < 44 are still acceptable IF they sit inside a >=44 container
        const parent = el.parentElement?.getBoundingClientRect();
        if (!parent || parent.height < 44) bad.push(`${el.getAttribute("aria-label") || el.textContent?.slice(0, 20)} h=${Math.round(r.height)}`);
      }
    });
    return bad.slice(0, 10);
  });
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2));
console.log("DONE", JSON.stringify({ errors: results.consoleErrors.length, probes: results.probes, sampleErrors: results.consoleErrors.slice(0, 3) }));
