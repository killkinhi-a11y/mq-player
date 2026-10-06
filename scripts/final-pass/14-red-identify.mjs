/* Identify the exact red elements found by the audit on home/settings/wave */
import { chromium } from "playwright";
const BASE = "https://mq1.vercel.app";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(3500);
await page.locator("button", { hasText: "Демо-режим" }).first().click();
await page.waitForTimeout(3500);

const describe = (el) => {
  const label = el.getAttribute("aria-label") || el.getAttribute("title") || "";
  let text = "";
  for (let n = el; n && !text; n = n.parentElement) text = (n.textContent || "").trim().slice(0, 60);
  return `${el.tagName} label="${label}" ctx="${text}"`;
};

const scan = async (name) => {
  const reds = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
      if (["IMG", "CANVAS", "SVG", "VIDEO", "PICTURE", "PATH"].includes(el.tagName)) continue;
      const cs = getComputedStyle(el);
      for (const [prop, val] of [["backgroundColor", cs.backgroundColor], ["color", cs.color]]) {
        const m = (val || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m && Number(m[1]) > 150 && Number(m[2]) < 110 && Number(m[3]) < 110) {
          // find the nearest svg icon name if this is an icon container
          const svg = el.querySelector("svg") || (el.tagName === "svg" ? el : null);
          let iconName = "";
          if (svg) iconName = (svg.getAttribute("class") || "").match(/lucide-([a-z-]+)/)?.[1] || "";
          out.push({ tag: el.tagName, cls: String(el.className).slice(0, 44), prop, val: val.slice(0, 36), icon: iconName, aria: el.getAttribute("aria-label") || "", title: el.getAttribute("title") || "" });
          break;
        }
      }
      if (out.length >= 14) break;
    }
    return out;
  });
  console.log(`\n=== ${name} ===`);
  reds.forEach(r => console.log(JSON.stringify(r)));
};

await page.waitForTimeout(1500);
await scan("HOME");
await page.locator('button[aria-label="Настройки"]').first().click().catch(() => {});
await page.waitForTimeout(1800);
await scan("SETTINGS");
const waveBtn = page.locator('button[aria-label*="WAVE" i]').first();
await waveBtn.click({ timeout: 6000 }).catch(() => {});
await page.waitForTimeout(4500);
await scan("WAVE");
await ctx.close();
await browser.close();
