import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 400, height: 300 } });
await p.goto('file:///home/z/my-project/scripts/wave-ambient/zorder-test.html');
await p.waitForTimeout(300);
const px = await p.evaluate(() => {
  // sample a point in the gap area (outside the card, e.g. 200,290 bottom area)
  const c = document.createElement('canvas');
  c.width = 400; c.height = 300;
  const ctx = c.getContext('2d');
  // draw via html2canvas-like not available; use elementFromPoint + computed style instead
  const el = document.elementFromPoint(200, 290);
  const cs = getComputedStyle(el);
  return { el: el.className || el.tagName, z: cs.zIndex, bg: cs.backgroundColor, pos: cs.position };
});
console.log(JSON.stringify(px));
await p.screenshot({ path: '/home/z/my-project/scripts/wave-ambient/zorder-test.png' });
await b.close();
