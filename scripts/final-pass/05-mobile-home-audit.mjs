/* Mobile home compactness audit — section offsets, heading sizes, card sizes, dock */
import { chromium } from "playwright";

const BASE = "https://mq1.vercel.app";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
const page = await ctx.newPage();
await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 40000 });
await page.waitForTimeout(3000);
const btn = page.locator("button", { hasText: "Демо-режим" }).first();
await btn.click();
await page.waitForTimeout(3500);

const data = await page.evaluate(() => {
  const out = { sections: [], headings: [], dock: null, hero: null, viewport: { w: innerWidth, h: innerHeight } };
  const main = document.querySelector("main") || document.body;
  const walk = (el) => {
    for (const child of el.children) {
      if (child.tagName === "SECTION" || child.getAttribute?.("data-section") || /^(Добрый|Вас приветствует)/.test(child.textContent || "")) {
        const r = child.getBoundingClientRect();
        if (r.height > 40) out.sections.push({ tag: child.tagName, cls: (child.className || "").toString().slice(0, 50), h: Math.round(r.height), top: Math.round(r.top + scrollY) });
      }
    }
  };
  walk(main);
  // headings
  for (const h of document.querySelectorAll("h1, h2, h3")) {
    const cs = getComputedStyle(h);
    const r = h.getBoundingClientRect();
    if (r.height > 0 && r.top + scrollY < 1200) {
      out.headings.push({ tag: h.tagName, text: (h.textContent || "").trim().slice(0, 30), fontSize: cs.fontSize, top: Math.round(r.top + scrollY) });
    }
  }
  // MobileNowHero
  const hero = document.querySelector("[data-mq-hero]");
  if (hero) {
    const r = hero.getBoundingClientRect();
    const art = hero.querySelector("img, [class*='rounded'] div, button");
    const artR = art ? art.getBoundingClientRect() : null;
    out.hero = { h: Math.round(r.height), w: Math.round(r.width), art: artR ? { w: Math.round(artR.width), h: Math.round(artR.height) } : null };
  }
  // dock
  const dock = document.querySelector("nav[class*='fixed'], [data-mq-dock], .mq-glass2.fixed, footer");
  const allFixed = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" && cs.display !== "none") {
      const r = el.getBoundingClientRect();
      if (r.height > 30 && r.height < 200 && r.bottom > innerHeight - 220) {
        allFixed.push({ cls: (el.className || "").toString().slice(0, 60), h: Math.round(r.height), bottomGap: Math.round(innerHeight - r.bottom) });
      }
    }
  }
  out.dock = allFixed;
  out.pageHeight = document.documentElement.scrollHeight;
  return out;
});
console.log(JSON.stringify(data, null, 2));
await page.screenshot({ path: "/tmp/m390-home-top.png" });
await browser.close();
