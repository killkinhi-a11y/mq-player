(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const btns = () => [...document.querySelectorAll('button')];
  const vb = () => btns().find(b => (b.getAttribute('aria-label') || '').startsWith('Громкость:'));
  const q = (s) => document.querySelector(s);
  if (!vb()) return 'player not open';
  vb().click(); await sleep(450);
  const pp = q('[data-mq-volpopup]');
  if (!pp) return 'no popup';
  const p = pp.getBoundingClientRect();
  const b = vb().getBoundingClientRect();
  const panel = q('[data-mq-spatial="controls"] > div.mx-auto, [data-mq-spatial="controls"] div.rounded-\\[28px\\]');
  const pr = panel ? panel.getBoundingClientRect() : null;
  return JSON.stringify({
    vp: { w: innerWidth, h: innerHeight },
    popup: { x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.width), h: Math.round(p.height) },
    btnCx: Math.round(b.x + b.width / 2),
    popupCx: Math.round(p.x + p.width / 2),
    panelTop: pr ? Math.round(pr.y) : null,
    gapToPanel: pr ? Math.round(pr.y - (p.y + p.height)) : null,
    withinViewport: p.x >= 0 && p.y >= 0 && p.right <= innerWidth && p.bottom <= innerHeight,
    noOverlapPanel: pr ? (p.y + p.height) <= pr.y : null,
  });
})()
