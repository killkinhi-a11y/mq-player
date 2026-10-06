/* Probe v5: exhaustive — every element whose rect covers (66,56), incl pseudos */
import { chromium } from "playwright";
const BASE = "http://127.0.0.1:3112";
const browser = await chromium.launch({ headless: true });
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/play`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  await page.locator("button", { hasText: "Демо-режим" }).first().click();
  await page.waitForSelector("[data-view='main'], nav", { timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.locator("button[aria-label='Поиск']:visible").first().waitFor({ state: "visible", timeout: 15000 });
  await page.locator("button[aria-label='Поиск']:visible").first().click({ timeout: 8000 });
  await page.waitForSelector("[data-view='search']", { timeout: 15000 });
  await page.waitForTimeout(2000);
  await page.locator("input:visible").first().waitFor({ state: "visible", timeout: 15000 });
  await page.locator("input:visible").first().fill("Поп");
  await page.waitForTimeout(2000);
  const probe = await page.evaluate(() => {
    const PX = 66, PY = 56;
    const out = [];
    const isRedish = (v) => {
      if (!v) return false;
      const m = v.match(/rgba?\((\d+), (\d+), (\d+)/);
      return m && Number(m[1]) > 140 && Number(m[2]) < 110 && Number(m[3]) < 110;
    };
    const check = (el, pseudo) => {
      const cs = getComputedStyle(el, pseudo ? `::${pseudo}` : null);
      const r = el.getBoundingClientRect();
      const covers = r.left <= PX && r.right >= PX && r.top <= PY && r.bottom >= PY;
      const props = {
        bg: cs.backgroundColor, bTop: cs.borderTopColor, bBottom: cs.borderBottomColor, bLeft: cs.borderLeftColor, bRight: cs.borderRightColor,
        bImg: cs.backgroundImage, outline: cs.outlineColor, shadow: cs.boxShadow,
      };
      const redHit = Object.entries(props).some(([k, v]) =>
        isRedish(v) || (typeof v === "string" && v !== "none" && /e03131|224,\s*49,\s*49/.test(v))
      );
      if (covers || redHit) {
        out.push({
          tag: el.tagName + (pseudo ? `::${pseudo}` : ""), cls: (el.className || "").toString().slice(0, 46),
          rect: `y${Math.round(r.top)}-${Math.round(r.bottom)} x${Math.round(r.left)}-${Math.round(r.right)}`,
          covers, redHit,
          redProps: redHit ? Object.fromEntries(Object.entries(props).filter(([, v]) => isRedish(v) || (typeof v === "string" && /e03131|224,\s*49/.test(String(v))))) : null,
          z: cs.zIndex, pos: cs.position,
        });
      }
    };
    for (const el of document.querySelectorAll("body *")) {
      check(el);
      check(el, "before");
      check(el, "after");
    }
    return out.filter(e => e.covers || e.redHit).slice(0, 40);
  });
  console.log(JSON.stringify(probe, null, 1).slice(0, 4500));
  await ctx.close();
}
await browser.close();
