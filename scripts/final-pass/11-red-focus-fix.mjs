/*
 * RED FOCUS RING FIX — verification script.
 * Focuses Search input / Settings slider / button / menu item on the given
 * base URL (local prod build first, then mq1.vercel.app), measures the
 * computed focus styles + screenshots each state. PASS criteria:
 *   1. focused element shows a visible outline (accessibility preserved)
 *   2. outline color is NOT red-dominant (no MQ accent)
 *   3. screenshots captured for visual proof
 */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.QA_BASE || "http://localhost:3210";
const OUT = process.env.QA_OUT || "/home/z/my-project/download/qa-red-focus/local";
fs.mkdirSync(OUT, { recursive: true });

const report = { base: BASE, probes: [], shots: [], pass: [], fail: [] };

function isRed(cssColor) {
  const m = cssColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return false;
  const [, r, g, b] = m.map(Number);
  // red-dominant: r high, r >> g and r >> b
  return r > 140 && r > g * 1.7 && r > b * 1.7;
}

async function newPage(browser, w, h, isMobile = false) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile, hasTouch: isMobile, deviceScaleFactor: isMobile ? 3 : 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => (report.fail ??= []).push(`pageerror: ${e.message.slice(0, 120)}`));
  return { ctx, page };
}

async function demoLogin(page) {
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 40000 });
  await page.waitForTimeout(2500);
  const btn = page.locator("button", { hasText: "Демо-режим" }).first();
  await btn.waitFor({ state: "visible", timeout: 20000 });
  await btn.click();
  await page.waitForSelector("nav, [data-view='main']", { timeout: 30000 });
  await page.waitForTimeout(2500);
}

async function focusProbe(page, label, selector, shotName) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: "visible", timeout: 12000 });
  await el.scrollIntoViewIfNeeded();
  // keyboard focus => guaranteed :focus-visible
  await page.evaluate((s) => document.querySelector(s)?.blur(), selector);
  await el.focus();
  await page.waitForTimeout(350);
  const probe = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      outlineColor: cs.outlineColor,
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
      boxShadow: cs.boxShadow.slice(0, 220),
      borderColor: cs.borderColor,
    };
  }, selector);
  report.probes.push({ label, selector, ...probe });
  const visible = probe && probe.outlineStyle !== "none" && parseFloat(probe.outlineWidth) >= 1;
  const red = probe && (isRed(probe.outlineColor) || /224, ?49, ?49|229, ?62, ?62|e03131|e53e3e/.test(probe.boxShadow + probe.borderColor));
  if (!probe) { report.fail.push(`${label}: element not found (${selector})`); }
  else {
    if (red) report.fail.push(`${label}: RED focus (${probe.outlineColor} / ${probe.boxShadow})`);
    else if (!visible && !probe.boxShadow.includes("0px 0px")) report.pass.push(`${label}: ring=${probe.outlineColor} ${probe.outlineWidth} (box-shadow only)`);
    else if (!visible) report.fail.push(`${label}: NO visible focus indication (a11y)`);
    else report.pass.push(`${label}: ring=${probe.outlineColor} ${probe.outlineWidth}`);
  }
  await page.screenshot({ path: `${OUT}/${shotName}.png` });
  report.shots.push(shotName);
  console.log(`${red ? "RED!" : "ok  "} ${label}: ${probe ? probe.outlineColor + " " + probe.outlineWidth + " style=" + probe.outlineStyle : "not found"}`);
  return probe;
}

const browser = await chromium.launch({ headless: true });

// ── DESKTOP 1440x900 ──
{
  const { ctx, page } = await newPage(browser, 1440, 900);
  await demoLogin(page);

  // 1. SEARCH INPUT — click (mouse focus, Chromium still applies :focus-visible to text inputs)
  await page.locator('button:has-text("Поиск"), [aria-label*="оиск"]').first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const searchInput = page.locator("[data-search-input]").first();
  if (await searchInput.count()) {
    await searchInput.click({ timeout: 8000 });
    await page.waitForTimeout(400);
    const cs = await page.evaluate(() => {
      const el = document.querySelector("[data-search-input]");
      const c = getComputedStyle(el);
      return { outlineColor: c.outlineColor, outlineStyle: c.outlineStyle, outlineWidth: c.outlineWidth, boxShadow: c.boxShadow.slice(0, 200) };
    });
    report.probes.push({ label: "search-click", ...cs });
    if (isRed(cs.outlineColor) || isRed(cs.boxShadow)) report.fail.push(`search-click RED: ${cs.outlineColor} / ${cs.boxShadow}`);
    else report.pass.push(`search-click: ${cs.outlineColor} ${cs.outlineWidth}`);
    await page.screenshot({ path: `${OUT}/d1440-01-search-click-focus.png` }); report.shots.push("d1440-01-search-click-focus");
    console.log("search click:", cs.outlineColor, cs.outlineWidth, cs.outlineStyle);
    await searchInput.blur();
  } else report.fail.push("search input not found");

  // 2. SEARCH INPUT via TAB (keyboard)
  await focusProbe(page, "search-tab", "[data-search-input]", "d1440-02-search-tab-focus");

  // 3. Settings slider focus (settings → Звук section → range inputs)
  await page.locator('button[aria-label="Настройки"]').first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2500);
  // sliders live in the Звук (sound) section
  await page.locator('button:has-text("Звук")').first().click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1500);
  if (!(await page.locator('input[type="range"]').count())) {
    await page.mouse.wheel(0, 900); await page.waitForTimeout(800);
  }
  await page.screenshot({ path: `${OUT}/d1440-03-settings.png` }); report.shots.push("d1440-03-settings");
  const range = page.locator('input[type="range"]').first();
  if (await range.count()) {
    await range.focus(); await page.waitForTimeout(350);
    const cs = await page.evaluate(() => {
      const el = document.querySelector('input[type="range"]');
      const c = getComputedStyle(el);
      return { outlineColor: c.outlineColor, outlineStyle: c.outlineStyle, outlineWidth: c.outlineWidth };
    });
    report.probes.push({ label: "settings-range", ...cs });
    if (isRed(cs.outlineColor)) report.fail.push(`settings-range RED: ${cs.outlineColor}`);
    else report.pass.push(`settings-range: ${cs.outlineColor} ${cs.outlineWidth}`);
    await page.screenshot({ path: `${OUT}/d1440-04-settings-slider-focus.png` }); report.shots.push("d1440-04-settings-slider-focus");
    console.log("settings slider:", cs.outlineColor, cs.outlineWidth, cs.outlineStyle);
  } else report.fail.push("no range input in settings");

  // 4. Button focus (nav tab button via TAB key)
  await focusProbe(page, "nav-button", 'button[aria-label="Настройки"]', "d1440-05-button-focus");

  // 5. Menu item focus: open the track context menu (Ещё / Действия), focus an item
  await page.locator('button[aria-label*="Домой"], button:has-text("Главная")').first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const moreBtn = page.locator('button[aria-label^="Ещё"], button[aria-label^="Действия"]').first();
  if (await moreBtn.count()) {
    await moreBtn.scrollIntoViewIfNeeded().catch(() => {});
    await moreBtn.click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(900);
    const item = page.locator(".mq-menu-item:not([data-destructive])").first();
    if (await item.count()) {
      await item.focus(); await page.waitForTimeout(300);
      const cs = await page.evaluate(() => {
        const el = document.querySelector(".mq-menu-item:not([data-destructive])");
        const c = getComputedStyle(el);
        return { outlineColor: c.outlineColor, outlineStyle: c.outlineStyle, outlineWidth: c.outlineWidth, bg: c.backgroundColor };
      });
      report.probes.push({ label: "menu-item", ...cs });
      if (isRed(cs.outlineColor)) report.fail.push(`menu-item RED: ${cs.outlineColor}`);
      else report.pass.push(`menu-item: ${cs.outlineColor} ${cs.outlineWidth}`);
      await page.screenshot({ path: `${OUT}/d1440-06-menu-item-focus.png` }); report.shots.push("d1440-06-menu-item-focus");
      console.log("menu item:", cs.outlineColor, cs.outlineWidth, cs.outlineStyle, "bg:", cs.bg);
    } else report.fail.push("menu items not found");
  } else report.fail.push("track more button not found");

  // 6. Skip-link (Tab from body start)
  await page.keyboard.press("Escape");
  await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); document.body.focus(); });
  await page.keyboard.press("Tab");
  await page.waitForTimeout(300);
  const skipCs = await page.evaluate(() => {
    const el = document.querySelector(".mq-skip-link");
    if (!el) return null;
    const c = getComputedStyle(el);
    return { bg: c.backgroundColor, color: c.color, left: c.left };
  });
  report.probes.push({ label: "skip-link", ...skipCs });
  if (skipCs && isRed(skipCs.bg)) report.fail.push(`skip-link RED bg: ${skipCs.bg}`);
  else if (skipCs) report.pass.push(`skip-link: bg=${skipCs.bg}`);
  await page.screenshot({ path: `${OUT}/d1440-07-skip-link.png` }); report.shots.push("d1440-07-skip-link");

  await ctx.close();
}

// ── MOBILE 390x844 ──
{
  const { ctx, page } = await newPage(browser, 390, 844, true);
  await demoLogin(page);
  // mobile dock Поиск button (visible only — the desktop nav also matches but is hidden)
  await page.locator('button', { hasText: "Поиск" }).locator("visible=true").first().click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1800);
  let searchInput = page.locator("[data-search-input]").first();
  if (!(await searchInput.count())) {
    // some mobile layouts focus only after view settles
    await page.waitForTimeout(1500);
    searchInput = page.locator("[data-search-input]").first();
  }
  if (await searchInput.count()) {
    await searchInput.tap({ timeout: 8000 }).catch(() => searchInput.click());
    await page.waitForTimeout(500);
    const cs = await page.evaluate(() => {
      const el = document.querySelector("[data-search-input]");
      const c = getComputedStyle(el);
      return { outlineColor: c.outlineColor, outlineStyle: c.outlineStyle, outlineWidth: c.outlineWidth };
    });
    report.probes.push({ label: "mobile-search", ...cs });
    if (isRed(cs.outlineColor)) report.fail.push(`mobile-search RED: ${cs.outlineColor}`);
    else report.pass.push(`mobile-search: ${cs.outlineColor} ${cs.outlineWidth}`);
    await page.screenshot({ path: `${OUT}/m390-01-search-focus.png` }); report.shots.push("m390-01-search-focus");
    console.log("mobile search:", cs.outlineColor, cs.outlineWidth, cs.outlineStyle);
  } else report.fail.push("mobile search input not found");
  await ctx.close();
}

await browser.close();
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log("\n=== RESULT ===");
console.log("PASS:", report.pass.length, "| FAIL:", report.fail.length);
report.fail.forEach((f) => console.log("  FAIL:", f));
console.log("shots:", report.shots.join(", "));
process.exit(report.fail.length ? 1 : 0);
