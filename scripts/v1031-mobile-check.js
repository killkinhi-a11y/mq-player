(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const q = (s) => document.querySelector(s);
  const btns = () => [...document.querySelectorAll('button')];
  const R = {};
  // demo if auth screen
  const demo = btns().find(b => b.textContent.includes('Демо'));
  if (demo) { demo.click(); await sleep(2500); }
  // play
  const listen = btns().find(x => (x.getAttribute('aria-label') || '').includes('Слушать') || x.textContent.trim().startsWith('Слушать'));
  if (listen) { listen.click(); await sleep(2500); }
  // open full player via mobile mini
  let vb = btns().find(b => b.hasAttribute('data-mq-volbtn'));
  if (!vb) {
    const mini = q('.mq-mini');
    if (mini) { mini.click(); await sleep(1500); }
    vb = btns().find(b => b.hasAttribute('data-mq-volbtn'));
  }
  if (!vb) return 'NO MOBILE PLAYER';
  vb.click(); await sleep(500);
  const pp = q('[data-mq-volpopup]');
  if (!pp) return 'NO MOBILE POPUP';
  const p = pp.getBoundingClientRect();
  const bar = q('[data-mq-playerbar]');
  const br = bar.getBoundingClientRect();
  const mute = [...pp.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').includes('звук'));
  const mr = mute.getBoundingClientRect();
  const cs = getComputedStyle(pp);
  // outside tap
  q('[data-mq-artwork]')?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  await sleep(400);
  return JSON.stringify({
    popup: { x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.width), h: Math.round(p.height) },
    barTop: Math.round(br.y),
    gapToBar: Math.round(br.y - (p.y + p.height)),
    withinViewport: p.x >= 0 && p.right <= innerWidth,
    muteTouch: { w: Math.round(mr.width), h: Math.round(mr.height) },
    material: { bg: cs.backgroundColor.slice(0, 50), blur: cs.backdropFilter },
    outsideTapClosed: !q('[data-mq-volpopup]'),
    spatialMarks: document.querySelectorAll('[data-mq-spatial]').length,
  });
})()
