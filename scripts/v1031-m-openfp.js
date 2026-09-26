(() => {
  const pause = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Пауза');
  if (!pause) return 'no-pause-btn';
  // walk up to the player bar root
  let bar = pause.closest('div');
  for (let i = 0; i < 8 && bar; i++) {
    const r = bar.getBoundingClientRect();
    if (r.width > 300 && r.height > 60 && r.height < 200 && getComputedStyle(bar).position === 'fixed') break;
    bar = bar.parentElement;
  }
  const r = bar.getBoundingClientRect();
  // click the artwork/title area (not a button) to open the full player
  const target = bar.querySelector('img, [class*=artwork], [class*=cover]') || bar;
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return 'bar=' + r.width + 'x' + r.height + ' clicked-target=' + target.tagName;
})()
