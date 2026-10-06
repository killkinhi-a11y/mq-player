/*
 * DESIGN COMPLETION — AFTER capture from LOCAL build (127.0.0.1:3112).
 * Same matrix as BEFORE: d1440 + m390, all surfaces, in-app navigation.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.QA_BASE || "http://127.0.0.1:3112";
const OUT = "/home/z/my-project/download/qa-design-completion/after-local";
fs.mkdirSync(OUT, { recursive: true });

const report = { consoleErrors: [], shots: [] };
const consoleErrors = report.consoleErrors;

async function newPage(browser, w, h, isMobile = false) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    isMobile, hasTouch: isMobile, deviceScaleFactor: isMobile ? 3 : 1,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 160)}`));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" && !/turnstile|Content Security Policy|challenges\.cloudflare|400|401|127\.0\.0\.1/.test(t)) {
      consoleErrors.push(`console.error: ${t.slice(0, 160)}`);
    }
  });
  return { ctx, page };
}

async function demoLogin(page) {
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForTimeout(3500);
  const btn = page.locator("button", { hasText: "Демо-режим" }).first();
  await btn.waitFor({ state: "visible", timeout: 25000 });
  await btn.click();
  await page.waitForSelector("[data-view='main'], nav", { timeout: 40000 });
  await page.waitForTimeout(4500);
}
const shot = async (page, name, full = false) => {
  try { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); report.shots.push(name); console.log("shot:", name); }
  catch (e) { console.log(`SHOT-FAIL ${name}: ${e.message.slice(0, 80)}`); }
};
const vis = (page, label) => page.locator(`button[aria-label="${label}"]:visible`).first();

const browser = await chromium.launch({ headless: true });

// ── DESKTOP 1440x900 ──
{
  const { ctx, page } = await newPage(browser, 1440, 900);
  await demoLogin(page);
  await shot(page, "d1440-01-home");
  const waveBtn = vis(page, "Запустить WAVE").count() ? vis(page, "Запустить WAVE") : page.locator('button[aria-label*="WAVE" i]:visible').first();
  if (await waveBtn.count()) { await waveBtn.click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(4500); }
  await shot(page, "d1440-02-wave");
  const stopBtn = page.locator('button[aria-label="Остановить WAVE"]:visible').first();
  if (await stopBtn.count()) { await stopBtn.click().catch(() => {}); await page.waitForTimeout(1500); }

  // SEARCH
  await vis(page, "Поиск").click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1800);
  const input = page.locator("input[type='search']:visible, input[placeholder*='иск' i]:visible").first();
  if (await input.count()) { await input.fill("Sia"); await page.waitForTimeout(2500); }
  await shot(page, "d1440-03-search");
  const artistLink = page.locator("main button.text-xs:visible, [data-view] button.text-xs:visible").first();
  if (await artistLink.count()) { await artistLink.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(2500); await shot(page, "d1440-12-artist"); }

  // LIBRARY + PLAYLISTS + DETAIL
  await vis(page, "Библиотека").click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, "d1440-04-library");
  const plTab = page.locator("main button", { hasText: "Плейлисты" }).first();
  if (await plTab.count()) { await plTab.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(2200); await shot(page, "d1440-10-playlists"); }
  const tile = page.locator("main .grid .group").first();
  if (await tile.count()) { await tile.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(2200); await shot(page, "d1440-11-playlist-detail"); }

  // CHATS + SETTINGS
  await vis(page, "Чаты").click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, "d1440-05-chats");
  await vis(page, "Настройки").click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, "d1440-06-settings");

  // FULL PLAYER + QUEUE
  const fp = vis(page, "Открыть полный плеер");
  if (await fp.count()) {
    await fp.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2300);
    await shot(page, "d1440-07-fullplayer");
    const q = page.locator('button[aria-label="Очередь воспроизведения"]:visible, button[aria-label="Очередь"]:visible').first();
    if (await q.count()) { await q.click().catch(() => {}); await page.waitForTimeout(1500); await shot(page, "d1440-08-queue"); }
    const closeBtn = page.locator('button[aria-label*="акрыть" i]:visible, button[aria-label*="Закрыть" i]:visible').first();
    if (await closeBtn.count()) await closeBtn.click().catch(() => {});
    await page.waitForTimeout(900);
  }

  // CONTEXT MENU
  await vis(page, "MQ — на главную").click({ timeout: 5000 }).catch(async () => {
    await page.locator('button[aria-label="Главная"]:visible').first().click().catch(() => {});
  });
  await page.waitForTimeout(1800);
  const row = page.locator("main li:visible, main article:visible").first();
  if (await row.count()) {
    await row.click({ button: "right", timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await shot(page, "d1440-09-contextmenu");
    await page.keyboard.press("Escape");
  }
  await ctx.close();
}

// ── MOBILE 390x844 ──
{
  const { ctx, page } = await newPage(browser, 390, 844, true);
  await demoLogin(page);
  const listen = page.locator('button[aria-label="Слушать"]:visible').first();
  if (await listen.count()) { await listen.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(4000); }
  await shot(page, "m390-01-home");
  await shot(page, "m390-01b-home-full", true);
  const waveBtn = page.locator('button[aria-label*="WAVE" i]:visible').first();
  if (await waveBtn.count()) { await waveBtn.click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(4500); }
  await shot(page, "m390-02-wave");
  const stopBtn = page.locator('button[aria-label="Остановить WAVE"]:visible').first();
  if (await stopBtn.count()) { await stopBtn.click().catch(() => {}); await page.waitForTimeout(1500); }

  await vis(page, "Поиск").click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1800);
  const minput = page.locator("input[type='search']:visible, input[placeholder*='иск' i]:visible").first();
  if (await minput.count()) { await minput.fill("Sia"); await page.waitForTimeout(2500); }
  await shot(page, "m390-search");
  const mArtist = page.locator("button.text-xs:visible").first();
  if (await mArtist.count()) { await mArtist.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(2200); await shot(page, "m390-artist"); }

  await vis(page, "Библиотека").click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, "m390-library");
  await vis(page, "Чаты").click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, "m390-chats");

  await vis(page, "Профиль").click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const setRow = page.locator("div.cursor-pointer", { hasText: "Настройки" }).first();
  if (await setRow.count()) { await setRow.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(2200); await shot(page, "m390-settings"); }

  await vis(page, "Главная").click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1800);
  const opener = page.locator('button[aria-label^="Открыть плеер"]:visible').first();
  if (await opener.count()) { await opener.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(2800); await shot(page, "m390-fullplayer"); }
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log("\nDONE. shots:", report.shots.length, "| console errors:", consoleErrors.length ? consoleErrors : "none");
