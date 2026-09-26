(() => {
  const pause = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Пауза');
  if (!pause) return 'no-pause-btn';
  const chain = [];
  let el = pause;
  for (let i = 0; i < 7 && el; i++) {
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    chain.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 55), pos: c.position, bottom: c.bottom, h: Math.round(r.height), y: Math.round(r.y) });
    el = el.parentElement;
  }
  return JSON.stringify(chain, null, 0);
})()
