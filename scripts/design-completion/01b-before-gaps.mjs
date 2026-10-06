/* DESIGN COMPLETION — BEFORE gap fill v2: mobile tabs/settings/fullplayer + desktop playlist detail */
import { chromium } from "playwright";

const BASE = "https://mq1.vercel.app";
const OUT = "/home/z/my-project/download/qa-design-completion/before";

async function demoLogin(page) {
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForTimeout(3500);
  const btn = page.locator("button", { hasText: "Демо-режим" }).first();
  await btn.waitFor({ state: "visible", timeout: 25000 });
  await btn.click();
  await page.waitForSelector("[data-view='main'], nav", { timeout: 40000 });
  await page.waitForTimeout(5000);
}
const dock = (page, label) => page.locator(`button[aria-label="${label}"]:visible`).first();
const shot = async (page, name, full = false) => {
  try { await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }); console.log("shot:", name); }
  catch (e) { console.log(`SHOT-FAIL ${name}: ${e.message.slice(0, 90)}`); }
};

const browser = await chromium.launch({ headless: true });

// ── Desktop playlist detail via Быстрые переходы → Плейлисты ──
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await demoLogin(page);
  await dock(page, "Плейлисты").click({ timeout: 6000 }).catch(async (e) => { console.log("quick btn fail", e.message.slice(0, 80)); });
  await page.waitForTimeout(2500);
  await shot(page, "d1440-10-playlists");
  // playlist detail: click first playlist-ish clickable card
  const cands = page.locator("main .cursor-pointer, main article");
  const n = Math.min(await cands.count(), 10);
  console.log("playlist candidates:", n);
  for (let i = 0; i < n; i++) {
    if (page.isClosed()) { console.log("page closed, abort"); break; }
    const box = await cands.nth(i).boundingBox().catch(() => null);
    if (!box || box.width < 140 || box.height < 90) continue;
    console.log(`clicking cand ${i} (${Math.round(box.width)}x${Math.round(box.height)})`);
    await cands.nth(i).click({ timeout: 3000 }).catch((e) => console.log("click fail:", e.message.slice(0, 60)));
    await page.waitForTimeout(2500);
    if (page.isClosed()) { console.log("page closed after click"); break; }
    await shot(page, "d1440-11-playlist-detail");
    break;
  }
  await ctx.close();
}

// ── Mobile: tabs + settings + full player ──
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await demoLogin(page);

  // start playback: tap the first Слушать CTA on home (platinum)
  const listen = page.locator('button[aria-label="Слушать"]:visible').first();
  if (await listen.count()) { await listen.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(4000); }

  await shot(page, "m390-01-home");
  const waveBtn = page.locator('button[aria-label*="WAVE" i]:visible').first();
  if (await waveBtn.count()) { await waveBtn.click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(4500); }
  await shot(page, "m390-02-wave");
  const stopBtn = page.locator('button[aria-label="Остановить WAVE"]:visible').first();
  if (await stopBtn.count()) { await stopBtn.click().catch(() => {}); await page.waitForTimeout(1500); }

  await dock(page, "Поиск").click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const minput = page.locator("input[type='search']:visible, input[placeholder*='иск' i]:visible").first();
  if (await minput.count()) { await minput.fill("Sia"); await page.waitForTimeout(2500); }
  await shot(page, "m390-search");
  const mArtist = page.locator("button.text-xs:visible").first();
  if (await mArtist.count()) { await mArtist.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(2200); await shot(page, "m390-artist"); }

  await dock(page, "Библиотека").click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(2200);
  await shot(page, "m390-library");

  await dock(page, "Чаты").click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(2200);
  await shot(page, "m390-chats");

  await dock(page, "Профиль").click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(2200);
  const setRow = page.locator("div.cursor-pointer", { hasText: "Настройки" }).first();
  if (await setRow.count()) { await setRow.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(2200); await shot(page, "m390-settings"); }
  else console.log("settings row not found");

  // full player from mini (a track should be playing now)
  await dock(page, "Главная").click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1800);
  const mini = page.locator(".mq-mini:visible").first();
  if (await mini.count()) {
    await mini.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await shot(page, "m390-fullplayer");
  } else console.log("mini player not visible");
  await ctx.close();
}

await browser.close();
console.log("DONE");
