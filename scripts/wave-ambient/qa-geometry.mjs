import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://127.0.0.1:3112/play', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.locator("button", { hasText: "Демо-режим" }).first().click();
await p.waitForSelector("nav, [data-view='main']", { timeout: 30000 });
await p.waitForTimeout(2000);
await p.locator('[aria-label="Запустить Волну"]').first().click();
await p.waitForFunction(() => document.querySelector('.mq-wave-liquid')?.getAttribute('data-active') === 'true', null, { timeout: 60000 });
await p.waitForFunction(() => document.querySelectorAll('.mq-wave-next-row').length > 0, null, { timeout: 45000 }).catch(() => {});
await p.waitForTimeout(1500);
const geo = await p.evaluate(() => {
  const inner = document.querySelector('.fixed.z-\\[55\\]')?.firstElementChild?.getBoundingClientRect();
  const rows = [...document.querySelectorAll('.mq-wave-next-row')];
  const rowRects = rows.map(r => { const x = r.getBoundingClientRect(); return { top: Math.round(x.top), bottom: Math.round(x.bottom), visible: x.bottom > 0 && x.top < window.innerHeight }; });
  const lastVisible = [...rowRects].reverse().find(r => r.visible);
  const waveHome = document.querySelector('[class*="mq-wave-shell"], section[class*="wave"], main [class*="mq-wave"]');
  const scroller = document.scrollingElement;
  return {
    playerBarTop: inner ? Math.round(inner.top) : null,
    rowCount: rows.length,
    rowRects: rowRects.slice(0, 8),
    lastVisibleRowBottom: lastVisible?.bottom ?? null,
    clearance: lastVisible && inner ? Math.round(inner.top - lastVisible.bottom) : null,
    scrollBottomReached: scroller ? Math.round(scroller.scrollHeight - scroller.scrollTop - window.innerHeight) : null,
  };
});
console.log(JSON.stringify(geo, null, 2));
await b.close();
