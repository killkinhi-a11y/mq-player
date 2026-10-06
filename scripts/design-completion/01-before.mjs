/*
 * DESIGN COMPLETION PASS — Step 1: BEFORE audit of CURRENT production.
 * In-app navigation ONLY (demo session clears on reload).
 * Desktop 1440x900 + Mobile 390x844, all surfaces.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://mq1.vercel.app";
const OUT = "/home/z/my-project/download/qa-design-completion/before";
fs.mkdirSync(OUT, { recursive: true });

const report = { consoleErrors: [], shots: [], nav: [] };
const consoleErrors = report.consoleErrors;

async function newPage(browser, w, h, isMobile = false) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    isMobile,
    hasTouch: isMobile,
    deviceScaleFactor: isMobile ? 3 : 1,
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 160)}`));
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" && !/turnstile|Content Security Policy|challenges\.cloudflare|400|401/.test(t)) {
      consoleErrors.push(`console.error: ${t.slice(0, 160)}`);
    }
  });
  return { ctx, page };
}

async function demoLogin(page) {
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForTimeout(3000);
  const btn = page.locator("button", { hasText: "Демо-режим" }).first();
  await btn.waitFor({ state: "visible", timeout: 20000 });
  await btn.click();
  await page.waitForSelector("[data-view='main'], nav", { timeout: 30000 });
  await page.waitForTimeout(4000);
}

const shot = async (page, name, full = false) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  report.shots.push(name);
  console.log("shot:", name);
};

const view = () => report.nav.push("");

const browser = await chromium.launch({ headless: true });

// ── DESKTOP 1440x900 ──
{
  const { ctx, page } = await newPage(browser, 1440, 900);
  await demoLogin(page);
  await shot(page, "d1440-01-home");

  // WAVE on
  const waveBtn = page.locator('button[aria-label*="WAVE" i]').first();
  if (await waveBtn.count()) { await waveBtn.click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(4500); }
  await shot(page, "d1440-02-wave");
  const stopBtn = page.locator('button[aria-label="Остановить WAVE"]').first();
  if (await stopBtn.count()) { await stopBtn.click().catch(() => {}); await page.waitForTimeout(1500); }

  // SEARCH with results (query that yields tracks w/ artist links)
  await page.locator('button[aria-label="Поиск"]').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1800);
  const input = page.locator("input[type='search'], [data-search-input] input, input[placeholder*='иск' i]").first();
  if (await input.count()) { await input.fill("Sia"); await page.waitForTimeout(2500); }
  await shot(page, "d1440-03-search");

  // ARTIST: click artist name in first result row
  const artistLink = page.locator("main button.text-xs, [data-view] button.text-xs").first();
  let artistOk = false;
  if (await artistLink.count()) {
    await artistLink.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await shot(page, "d1440-12-artist");
    artistOk = true;
  }
  console.log("artist detail captured:", artistOk);

  // LIBRARY
  await page.locator('button[aria-label="Библиотека"]').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, "d1440-04-library");

  // PLAYLISTS tab inside library
  const plTab = page.locator("button", { hasText: "Плейлисты" }).first();
  if (await plTab.count()) {
    await plTab.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await shot(page, "d1440-10-playlists");
    // playlist detail
    const plCard = page.locator("article, [class*='playlist'] li, ul li").first();
    if (await plCard.count()) {
      await plCard.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(2200);
      await shot(page, "d1440-11-playlist-detail");
    }
  }

  // CHATS + SETTINGS
  await page.locator('button[aria-label="Чаты"]').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, "d1440-05-chats");
  await page.locator('button[aria-label="Настройки"]').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, "d1440-06-settings");

  // FULL PLAYER + QUEUE
  const fp = page.locator('button[aria-label="Открыть полный плеер"]').first();
  if (await fp.count()) {
    await fp.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2200);
    await shot(page, "d1440-07-fullplayer");
    const q = page.locator('button[aria-label="Очередь воспроизведения"], button[aria-label="Очередь"]').first();
    if (await q.count()) { await q.click().catch(() => {}); await page.waitForTimeout(1500); await shot(page, "d1440-08-queue"); }
    const closeBtn = page.locator('button[aria-label*="акрыть" i], button[aria-label*="Закрыть" i]').first();
    if (await closeBtn.count()) await closeBtn.click().catch(() => {});
    await page.waitForTimeout(900);
  }

  // CONTEXT MENU on home
  await page.locator('button[aria-label="MQ — на главную"], button[aria-label="Главная"]').first().click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(1800);
  const row = page.locator("li button, article button").first();
  if (await row.count()) {
    await row.click({ button: "right", timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await shot(page, "d1440-09-contextmenu");
    await page.keyboard.press("Escape");
  }
  await ctx.close();
}

// ── MOBILE 390x844 ──
{
  const { ctx, page } = await newPage(browser, 390, 844, true);
  await demoLogin(page);
  await shot(page, "m390-01-home");
  await shot(page, "m390-01b-home-full", true);

  const waveBtn = page.locator("[data-mq-dock] button, button").filter({ hasText: /^WAVE$/ }).first();
  const waveBtn2 = page.locator('button[aria-label*="WAVE" i]').first();
  const wv = (await waveBtn2.count()) ? waveBtn2 : waveBtn;
  if (wv) { await wv.click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(4500); }
  await shot(page, "m390-02-wave");
  const stopBtn = page.locator('button[aria-label="Остановить WAVE"]').first();
  if (await stopBtn.count()) { await stopBtn.click().catch(() => {}); await page.waitForTimeout(1500); }

  // SEARCH + artist
  await page.locator("[data-mq-dock] button[aria-label='Поиск']").first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1800);
  const minput = page.locator("input[type='search'], input[placeholder*='иск' i]").first();
  if (await minput.count()) { await minput.fill("Sia"); await page.waitForTimeout(2500); }
  await shot(page, "m390-search");
  const mArtist = page.locator("button.text-xs").first();
  if (await mArtist.count()) { await mArtist.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(2200); await shot(page, "m390-artist"); }

  // LIBRARY
  await page.locator("[data-mq-dock] button[aria-label='Библиотека']").first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, "m390-library");

  // CHATS
  await page.locator("[data-mq-dock] button[aria-label='Чаты']").first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, "m390-chats");

  // SETTINGS via profile
  await page.locator("[data-mq-dock] button[aria-label='Профиль']").first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const setRow = page.locator("button", { hasText: "Настройки" }).first();
  if (await setRow.count()) { await setRow.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(2000); await shot(page, "m390-settings"); }
  else { await shot(page, "m390-profile"); }

  // FULL PLAYER via mini player
  await page.locator("[data-mq-dock] button[aria-label='Главная']").first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const mfp = page.locator('button[aria-label="Открыть полный плеер"]').first();
  if (await mfp.count()) { await mfp.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(2200); await shot(page, "m390-fullplayer"); }
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/nav.json`, JSON.stringify(report, null, 2));
console.log("\nDONE. shots:", report.shots.length, "| console errors:", consoleErrors.length ? consoleErrors : "none");
