(() => {
  const el = document.querySelector('[data-mq-artwork]');
  if (!el) return 'no-target';
  const cfg = window.__swipe || { from: { x: 300, y: 290 }, to: { x: 80, y: 292 }, delay: 120 };
  const mk = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
  el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [mk(cfg.from.x, cfg.from.y)], changedTouches: [mk(cfg.from.x, cfg.from.y)] }));
  setTimeout(() => {
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [mk(cfg.to.x, cfg.to.y)] }));
  }, cfg.delay);
  return 'swipe-dispatched';
})()
