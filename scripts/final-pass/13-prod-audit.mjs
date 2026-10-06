/*
 * FINAL PRODUCTION AUDIT (post red-focus-fix, build mq-build-2495a501).
 * Covers the user's §4-§11: NORMAL background on 6 tabs (not flat black),
 * WAVE surface, cards solidity, glass roles, red-accent DOM scan, label
 * scan, all-tab screenshots d1440+m390, WAVE d+m, full player, context
 * menu, mobile density/touch targets.
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.QA_BASE || "https://mq1.vercel.app";
const OUT = "/home/z/my-project/download/qa-red-focus/prod-audit";
fs.mkdirSync(OUT, { recursive: true });

const report = { base: BASE, buildId: null, tabs: {}, wave: {}, mobile: {}, materials: {}, reds: {}, labels: {}, fail: [] };
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

const isRedCss = (v) => {
  const m = (v || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return false;
  const [, r, g, b] = m.map(Number);
  return r > 150 && g < 110 && b < 110;
};

// probes to run on every tab
async function tabProbes(page, label) {
  const probes = await page.evaluate(() => {
    const out = { redElements: [], volnaLabels: [], ambientLuma: null, cards: [], glassSurfaces: [] };
    // 1. red-dominant VISIBLE chrome (bg/border/color), excluding artwork imgs/canvas/svg and known semantic hearts
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
      const cs = getComputedStyle(el);
      const aria = el.getAttribute("aria-label") || "";
      const isHeart = /Избранн|любим|Нравит/i.test(aria + (el.textContent || "").slice(0, 40)) || el.querySelector("svg.lucide-heart, svg[class*='heart']") || el.closest("[aria-label*='бран'],[aria-label*='любим']");
      const tag = el.tagName;
      if (tag === "IMG" || tag === "CANVAS" || tag === "SVG" || tag === "VIDEO" || tag === "PICTURE") continue;
      if (isHeart) continue;
      for (const [prop, val] of [["backgroundColor", cs.backgroundColor], ["borderTopColor", cs.borderTopColor], ["color", cs.color]]) {
        const m = (val || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m && Number(m[1]) > 150 && Number(m[2]) < 110 && Number(m[3]) < 110) {
          if (prop === "color" && el.children.length > 0 && el.textContent.trim().length > 0) {
            // colored TEXT only counts if it's a leaf-ish node
            if (el.children.length > 3) break;
          }
          out.redElements.push({ tag, cls: String(el.className).slice(0, 50), prop, val: val.slice(0, 44), text: (el.textContent || "").trim().slice(0, 30) });
          break;
        }
      }
      if (out.redElements.length >= 12) break;
    }
    // 2. forbidden decorative labels
    const bad = /ВОЛНА|Сейчас играет|^Играет$|^Пауза$|^ИГРАЕТ$/;
    for (const el of document.querySelectorAll("body *")) {
      if (el.children.length === 0 && el.textContent && bad.test(el.textContent.trim())) {
        out.volnaLabels.push(el.textContent.trim().slice(0, 30));
      }
      if (out.volnaLabels.length >= 5) break;
    }
    // 3. ambient visibility: average luminance of 3 sample strips via a tiny canvas draw of the screenshot is not possible;
    // instead: ambient container present + opacity of its layers
    const amb = document.querySelector(".mq-ambient-bg, [class*='ambient']");
    if (amb) {
      const cs = getComputedStyle(amb);
      out.ambient = { display: cs.display, opacity: cs.opacity, children: amb.children.length };
    }
    out.rootBg = document.querySelector(".mq-app-root") ? getComputedStyle(document.querySelector(".mq-app-root")).backgroundColor : null;
    // 4. card solidity probe: mq-card-* visible elements
    for (const el of document.querySelectorAll("[class*='mq-card-']")) {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 40 || r.bottom < 0 || r.top > innerHeight) continue;
      const cs = getComputedStyle(el);
      out.cards.push({ cls: String(el.className).slice(0, 40), bg: cs.backgroundColor.slice(0, 40), blur: cs.backdropFilter !== "none", radius: cs.borderRadius });
      if (out.cards.length >= 6) break;
    }
    // 5. glass role surfaces
    for (const el of document.querySelectorAll("[class*='mq-glass'], .mq-player-capsule, nav, [data-mq-dock], .mq-menu-surface")) {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.bottom < 0 || r.top > innerHeight) continue;
      const cs = getComputedStyle(el);
      out.glassSurfaces.push({ cls: String(el.className).slice(0, 40), blur: (cs.backdropFilter || "none").slice(0, 26) });
      if (out.glassSurfaces.length >= 6) break;
    }
    return out;
  });
  report.tabs[label] = probes;
  if (probes.redElements.length) report.reds[label] = probes.redElements;
  if (probes.volnaLabels.length) report.labels[label] = probes.volnaLabels;
  return probes;
}

async function demoLogin(page) {
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(3500);
  const btn = page.locator("button", { hasText: "Демо-режим" }).first();
  await btn.waitFor({ state: "visible", timeout: 25000 });
  await btn.click();
  await page.waitForSelector("nav, [data-view='main']", { timeout: 30000 });
  await page.waitForTimeout(3500);
}

const browser = await chromium.launch({ headless: true });

// ═══ DESKTOP 1440x900, WAVE OFF ═══
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message.slice(0, 120)));
  await demoLogin(page);
  report.buildId = await page.evaluate(() => fetch("/version.json").then(r => r.json()).then(d => d.buildId).catch(() => null));

  // HOME
  await page.waitForTimeout(2500);
  await shot(page, "d1440-01-home");
  await tabProbes(page, "home");

  // SEARCH
  await page.locator('button[aria-label="Поиск"], button:has-text("Поиск")').first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await shot(page, "d1440-02-search");
  await tabProbes(page, "search");

  // LIBRARY
  await page.locator('button[aria-label="Библиотека"], button:has-text("Библиотека")').first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await shot(page, "d1440-03-library");
  await tabProbes(page, "library");

  // SETTINGS
  await page.locator('button[aria-label="Настройки"]').first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await shot(page, "d1440-04-settings");
  await tabProbes(page, "settings");

  // CHATS
  await page.locator('button[aria-label="Чаты"], button:has-text("Чаты")').first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, "d1440-05-chats");
  await tabProbes(page, "chats");

  // back HOME + play a track, open QUEUE panel
  await page.locator('button[aria-label="Главная"], button:has-text("Главная")').first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const playBtn = page.locator('button[aria-label^="Слушать"], button[aria-label^="Воспроизвести"]').first();
  if (await playBtn.count()) { await playBtn.click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(2500); }
  const queueBtn = page.locator('button[aria-label="Очередь воспроизведения"], button[aria-label="Очередь"]').first();
  if (await queueBtn.count()) {
    await queueBtn.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await shot(page, "d1440-06-queue");
    await tabProbes(page, "queue");
  } else report.fail.push("queue button not found");

  // FULL PLAYER + MINI/PLAYERBAR material
  const openPlayer = page.locator('button[aria-label*="Открыть плеер"], button[aria-label*="олный плеер"]').first();
  if (await openPlayer.count()) {
    await openPlayer.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await shot(page, "d1440-07-fullplayer");
    await tabProbes(page, "fullplayer");
    // progress fill material inside full player
    report.materials.fullplayer_progress = await page.evaluate(() => {
      const els = [...document.querySelectorAll("div")].filter(d => d.style.transform?.startsWith("scaleX"));
      return els.slice(0, 2).map(d => getComputedStyle(d).backgroundImage.slice(0, 90) || getComputedStyle(d).backgroundColor);
    });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
  } else report.fail.push("open player button not found");
  await shot(page, "d1440-08-playerbar-mini");
  // PlayerBar capsule glass probe
  report.materials.playerbar = await page.evaluate(() => {
    const pb = document.querySelector(".mq-player-capsule, [class*='player-capsule'], [class*='playerbar'], [class*='player-bar']");
    if (!pb) return null;
    const cs = getComputedStyle(pb);
    return { cls: String(pb.className).slice(0, 50), blur: (cs.backdropFilter || "none").slice(0, 30), bg: cs.backgroundColor.slice(0, 44) };
  });

  // CONTEXT MENU material
  const moreBtn = page.locator('button[aria-label^="Ещё"], button[aria-label^="Действия"]').first();
  if (await moreBtn.count()) {
    await moreBtn.scrollIntoViewIfNeeded().catch(() => {});
    await moreBtn.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await shot(page, "d1440-09-contextmenu");
    report.materials.context_menu = await page.evaluate(() => {
      const m = document.querySelector(".mq-menu-surface, [class*='menu-surface']");
      if (!m) return null;
      const cs = getComputedStyle(m);
      return { blur: (cs.backdropFilter || "none").slice(0, 30), bg: cs.backgroundColor.slice(0, 50), radius: cs.borderRadius, shadow: cs.boxShadow.slice(0, 60) };
    });
    await page.keyboard.press("Escape");
  } else report.fail.push("context menu button not found");

  // ═══ WAVE ON (desktop) ═══
  const waveBtn = page.locator('button[aria-label*="WAVE" i]').first();
  if (await waveBtn.count()) {
    await waveBtn.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await shot(page, "d1440-10-wave");
    report.wave.desktop = await page.evaluate(() => {
      const w = document.querySelector(".mq-wave");
      if (!w) return { found: false };
      const cs = getComputedStyle(w);
      const r = w.getBoundingClientRect();
      // artwork clip radius inside wave
      const art = w.querySelector("img, .mq-wave-art");
      const artCs = art ? getComputedStyle(art) : null;
      return {
        found: true,
        radius: cs.borderRadius, bg: cs.backgroundColor.slice(0, 50),
        border: cs.borderTopColor + " " + cs.borderTopWidth,
        shadow: cs.boxShadow.slice(0, 70),
        rect: { w: Math.round(r.width), h: Math.round(r.height) },
        artRadius: artCs ? artCs.borderRadius : null,
        overflow: cs.overflow,
      };
    });
    await tabProbes(page, "wave");
  } else report.fail.push("WAVE button not found");

  // ambient pixel proof (wave off vs on handled separately) — luminance strips on home for NORMAL
  await waveBtn.click({ timeout: 6000 }).catch(() => {}); // toggle wave OFF
  await page.waitForTimeout(2500);
  await page.locator('button[aria-label="Главная"], button:has-text("Главная")').first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2000);
  report.materials.normal_bg_luma = await page.evaluate(() => {
    // screenshot-based luma is not possible in-page; use ambient layer opacity + sample a computed gradient
    const amb = document.querySelector(".mq-ambient-bg");
    if (!amb) return { ambient: false };
    const kids = [...amb.children].map(c => ({ cls: String(c.className).slice(0, 40), op: getComputedStyle(c).opacity, bg: (getComputedStyle(c).backgroundImage || "none").slice(0, 60) }));
    return { ambient: true, kids: kids.slice(0, 6) };
  });

  report.consoleErrors = consoleErrors.filter(e => !/401|400|turnstile|CSP/i.test(e));
  await ctx.close();
}

// ═══ MOBILE 390x844 ═══
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await demoLogin(page);
  await page.waitForTimeout(2500);
  await shot(page, "m390-01-home");
  report.mobile.home = await page.evaluate(() => {
    // density probes: oversized headings, giant cards, tiny buttons
    const out = { bigText: [], tinyButtons: [] };
    for (const el of document.querySelectorAll("h1, h2, h3")) {
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      const r = el.getBoundingClientRect();
      if (r.height > 0 && fs > 0) out.bigText.push({ t: el.textContent.trim().slice(0, 24), fs, weight: cs.fontWeight });
    }
    for (const b of document.querySelectorAll("button")) {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.height < 44 && r.width < 44) out.tinyButtons.push({ label: (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 24), h: Math.round(r.height), w: Math.round(r.width) });
      if (out.tinyButtons.length >= 8) break;
    }
    return out;
  });

  await page.locator('button', { hasText: "Поиск" }).locator("visible=true").first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await shot(page, "m390-02-search");
  await page.locator('button', { hasText: "Библиотека" }).locator("visible=true").first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await shot(page, "m390-03-library");
  await page.locator('button[aria-label="Настройки"]').first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await shot(page, "m390-04-settings");

  // WAVE mobile
  await page.locator('button[aria-label="Главная"], button', { hasText: "Главная" }).first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const waveBtn = page.locator('button[aria-label*="WAVE" i]').first();
  if (await waveBtn.count()) {
    await waveBtn.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await shot(page, "m390-05-wave");
    report.wave.mobile = await page.evaluate(() => {
      const w = document.querySelector(".mq-wave");
      if (!w) return { found: false };
      const cs = getComputedStyle(w);
      const r = w.getBoundingClientRect();
      return { found: true, radius: cs.borderRadius, bg: cs.backgroundColor.slice(0, 50), rect: { w: Math.round(r.width), h: Math.round(r.height) }, screen: { w: innerWidth, h: innerHeight } };
    });
    await waveBtn.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1500);
  } else report.fail.push("mobile WAVE button not found");

  // FULL PLAYER mobile
  await page.locator('button[aria-label*="Открыть плеер"]').first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, "m390-06-fullplayer");
  report.mobile.fullplayer = await page.evaluate(() => {
    const out = { tinyButtons: [] };
    for (const b of document.querySelectorAll("button")) {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.height < 44 && r.width < 44) out.tinyButtons.push({ label: (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 22), h: Math.round(r.height), w: Math.round(r.width) });
      if (out.tinyButtons.length >= 8) break;
    }
    return out;
  });
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log("\n=== AUDIT SUMMARY ===");
console.log("buildId:", report.buildId);
console.log("\n-- RED chrome found (per tab):");
for (const [tab, reds] of Object.entries(report.reds)) console.log(`  ${tab}: ${reds.length}`, JSON.stringify(reds.slice(0, 3)));
console.log("\n-- Forbidden labels:", JSON.stringify(report.labels));
console.log("\n-- WAVE surface:", JSON.stringify(report.wave));
console.log("\n-- PlayerBar glass:", JSON.stringify(report.materials.playerbar));
console.log("-- Context menu:", JSON.stringify(report.materials.context_menu));
console.log("-- FullPlayer progress:", JSON.stringify(report.materials.fullplayer_progress));
console.log("\n-- Ambient (normal):", JSON.stringify(report.materials.normal_bg_luma)?.slice(0, 400));
console.log("\n-- Mobile home density:", JSON.stringify(report.mobile.home)?.slice(0, 400));
console.log("-- Mobile fullplayer tiny buttons:", JSON.stringify(report.mobile.fullplayer));
console.log("\n-- Console page errors:", report.consoleErrors?.length ?? 0, report.consoleErrors?.slice(0, 3));
console.log("\n-- FAIL items:", report.fail);
