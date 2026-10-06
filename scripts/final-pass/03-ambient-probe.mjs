/* Probe the ambient background children + verify visibility on prod */
import { chromium } from "playwright";

const BASE = "https://mq1.vercel.app";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded", timeout: 40000 });
await page.waitForTimeout(3000);
const btn = page.locator("button", { hasText: "Демо-режим" }).first();
await btn.click();
await page.waitForTimeout(3500);

const data = await page.evaluate(() => {
  const out = {};
  const amb = document.querySelector(".mq-ambient-bg");
  out.container_exists = !!amb;
  if (amb) {
    out.container = { z: getComputedStyle(amb).zIndex, pos: getComputedStyle(amb).position };
    out.children = [];
    for (const child of amb.children) {
      const cs = getComputedStyle(child);
      out.children.push({
        cls: child.className,
        display: cs.display,
        opacity: cs.opacity,
        bg: (cs.backgroundImage || "none").slice(0, 90),
        bgColor: cs.backgroundColor,
      });
    }
    const r = amb.getBoundingClientRect();
    out.rect = { x: r.x, y: r.y, w: r.width, h: r.height };
  }
  // what does the app root paint?
  const root = document.querySelector(".mq-app-root");
  if (root) {
    const cs = getComputedStyle(root);
    out.app_root = { bg: cs.backgroundColor, bgimg: (cs.backgroundImage || "none").slice(0, 60) };
  }
  out.body_bg = getComputedStyle(document.body).backgroundColor;
  // stacked order check: is the ambient container a sibling before app root?
  out.ambient_parent = amb?.parentElement?.className?.toString?.().slice(0, 60) || amb?.parentElement?.tagName;
  out.siblings = amb?.parentElement ? Array.from(amb.parentElement.children).map((c) => (c.className || c.tagName).toString().slice(0, 40)) : [];
  return out;
});
console.log(JSON.stringify(data, null, 2));
await page.screenshot({ path: "/tmp/ambient-probe.png" });
await browser.close();
