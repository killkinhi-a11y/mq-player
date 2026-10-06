/*
 * FINAL CORRECTION PASS — Step 2: FULL BEFORE audit of production.
 * Desktop 1440x900 + Mobile 390x844, all tabs, full-page shots +
 * per-tab geometry probes (glass leak, 3D buttons, card opacity,
 * normal background presence, volume fill, wave surface).
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://mq1.vercel.app";
const OUT = "/home/z/my-project/download/qa-final-pass/before";
fs.mkdirSync(OUT, { recursive: true });

const report = { consoleErrors: [], shots: [], probes: {} };
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
  await page.waitForSelector("nav, [data-view='main']", { timeout: 30000 });
  await page.waitForTimeout(3000);
  try {
    await page.waitForSelector("article", { timeout: 12000 });
    await page.waitForFunction(() => !document.querySelector(".animate-pulse, [data-skeleton]"), { timeout: 8000 });
  } catch {}
  await page.waitForTimeout(600);
}

const shot = async (page, name, full = false) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  report.shots.push(name);
  console.log("shot:", name);
};

/* Global probes run on every tab */
async function probe(page, tab) {
  const data = await page.evaluate(() => {
    const out = { tab: document.querySelector("[data-view]")?.getAttribute("data-view") || location.hash || "?" };
    // 1. Normal ambient background presence + visibility
    const amb = document.querySelector(".mq-ambient, [class*='ambient' i]");
    out.ambient = amb
      ? { cls: (amb.className || "").toString().slice(0, 60), display: getComputedStyle(amb).display, opacity: getComputedStyle(amb).opacity, bg: getComputedStyle(amb).backgroundImage.slice(0, 50) }
      : null;
    // 2. Glass leak: elements with backdrop-filter inside the main view (content area)
    const view = document.querySelector("[data-view], main");
    const leaks = [];
    if (view) {
      for (const el of view.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        if ((cs.backdropFilter && cs.backdropFilter !== "none") && !el.closest("nav, [data-mq-dock], .mq-player-capsule, [data-floating], .mq-menu, [role='menu'], [data-testid='wave-home']")) {
          leaks.push({ tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0, 50) });
          if (leaks.length > 8) break;
        }
      }
    }
    out.glass_leaks = leaks;
    // 3. 3D button check: any button with 2+ inset shadows or radial gradient
    const buttons3d = [];
    for (const b of document.querySelectorAll("button")) {
      const cs = getComputedStyle(b);
      const insets = (cs.boxShadow.match(/inset/g) || []).length;
      const radial = cs.backgroundImage.includes("radial");
      if ((insets >= 2 || radial) && cs.backgroundImage !== "none" && !cs.backgroundImage.includes("linear-gradient(165deg")) {
        buttons3d.push({ cls: (b.className || "").toString().slice(0, 44), insets, bg: cs.backgroundImage.slice(0, 40) });
        if (buttons3d.length > 6) break;
      }
    }
    out.buttons_3d = buttons3d;
    // 4. Volume slider fill (if visible)
    const vs = document.querySelector("input[type='range'][aria-label*='ромкость' i], input[type='range'][aria-label*='volume' i], .mq-volume input, input[class*='volume' i]");
    if (vs) {
      const cs = getComputedStyle(vs);
      const fill = cs.background.startsWith("linear") ? cs.background.slice(0, 130) : null;
      out.volume_input = { cls: (vs.className || "").toString().slice(0, 40), fill };
    }
    // 5. Overflow
    out.overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    // 6. Track row labels: look for decorative status badges
    const badges = [];
    for (const el of document.querySelectorAll("span, p")) {
      const t = (el.textContent || "").trim();
      if (/^(Сейчас играет|Играет|Волна|ВОЛНА)$/.test(t) && el.children.length === 0) {
        const cs = getComputedStyle(el);
        if (cs.display !== "none" && cs.visibility !== "hidden") {
          badges.push({ text: t, cls: (el.className || "").toString().slice(0, 40) });
          if (badges.length > 5) break;
        }
      }
    }
    out.status_badges = badges;
    // 7. Any Волна text visible anywhere
    const volna = [];
    for (const el of document.querySelectorAll("h1,h2,h3,h4,p,span,button,div[title],[aria-label]")) {
      const t = (el.textContent || "").trim();
      const al = el.getAttribute?.("aria-label") || "";
      if (/волна/i.test(t) && el.children.length === 0 && t.length < 60) { volna.push({ text: t.slice(0, 50), tag: el.tagName.toLowerCase() }); if (volna.length > 6) break; }
      else if (/волна/i.test(al) && al.length < 60) { volna.push({ aria: al.slice(0, 50) }); if (volna.length > 6) break; }
    }
    out.volna_text = volna;
    return out;
  });
  report.probes[tab] = data;
  const p = (k) => console.log(`  ${k}:`, JSON.stringify(data[k])?.slice(0, 140));
  console.log(`== probe ${tab} ==`);
  p("ambient"); p("glass_leaks"); p("buttons_3d"); p("volume_input"); p("status_badges"); p("volna_text");
  console.log(`  overflowX: ${data.overflowX}`);
}

const browser = await chromium.launch({ headless: true });

// ── DESKTOP 1440x900 ──
{
  const { ctx, page } = await newPage(browser, 1440, 900);
  await demoLogin(page);
  await shot(page, "d1440-01-home");
  await probe(page, "d-home");
  // WAVE on
  const waveBtn = page.locator('button[aria-label*="WAVE" i]').first();
  if (await waveBtn.count()) {
    await waveBtn.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(4000);
  }
  await shot(page, "d1440-02-wave");
  await probe(page, "d-wave");
  // stop wave for clean tab shots
  const stopBtn = page.locator('button[aria-label="Остановить WAVE"]').first();
  if (await stopBtn.count()) { await stopBtn.click().catch(() => {}); await page.waitForTimeout(1500); }
  for (const [name, sel] of [
    ["search", 'button[aria-label="Поиск"]'],
    ["library", 'button[aria-label="Библиотека"]'],
    ["chats", 'button[aria-label="Чаты"]'],
    ["settings", 'button[aria-label="Настройки"]'],
  ]) {
    const b = page.locator(sel).first();
    if (await b.count()) {
      await b.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1800);
      if (name === "search") {
        const input = page.locator("input[type='search'], [data-search-input] input").first();
        if (await input.count()) { await input.fill("музыка"); await page.waitForTimeout(2000); }
      }
      await shot(page, `d1440-0${name === "search" ? 3 : name === "library" ? 4 : name === "chats" ? 5 : 6}-${name}`);
      await probe(page, `d-${name}`);
    }
  }
  // Full player + queue
  const capsule = page.locator(".mq-player-capsule button").first();
  if (await capsule.count()) {
    await capsule.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await shot(page, "d1440-07-fullplayer");
    const q = page.locator('button[aria-label="Очередь"]').first();
    if (await q.count()) { await q.click().catch(() => {}); await page.waitForTimeout(1200); await shot(page, "d1440-08-queue"); await probe(page, "d-queue"); }
    const closeBtn = page.locator('button[aria-label*="акрыть" i]').first();
    if (await closeBtn.count()) await closeBtn.click().catch(() => {});
    await page.waitForTimeout(800);
  }
  // Context menu
  const row = page.locator("li button, article").first();
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
  await probe(page, "m-home");
  const waveBtn = page.locator("button").filter({ hasText: /WAVE/i }).first();
  if (await waveBtn.count()) {
    await waveBtn.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(4000);
  }
  await shot(page, "m390-02-wave");
  await probe(page, "m-wave");
  const stopBtn = page.locator('button[aria-label="Остановить WAVE"]').first();
  if (await stopBtn.count()) { await stopBtn.click().catch(() => {}); await page.waitForTimeout(1500); }
  for (const [name, sel] of [
    ["library", 'button[aria-label="Библиотека"]'],
    ["search", 'button[aria-label="Поиск"]'],
    ["chats", 'button[aria-label="Чаты"]'],
    ["settings", 'button[aria-label="Настройки"]'],
  ]) {
    const b = page.locator(sel).first();
    if (await b.count()) {
      await b.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1600);
      if (name === "search") {
        const input = page.locator("input[type='search'], [data-search-input] input").first();
        if (await input.count()) { await input.fill("музыка"); await page.waitForTimeout(1800); }
      }
      await shot(page, `m390-${name}`);
      await probe(page, `m-${name}`);
    }
  }
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/probes.json`, JSON.stringify(report, null, 2));
console.log("\nDONE. shots:", report.shots.length, "| console errors:", consoleErrors.length ? consoleErrors : "none");
