// V10.3.1 — Volume popup DOM/CSS inspection (runs via agent-browser eval with require of this file content)
// Usage: content is inlined into `agent-browser eval` — see scripts/v1031-inspect.sh
(() => {
  const btn = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').startsWith('Громкость'));
  const pp = document.querySelector('[role=group][aria-label="Громкость"]');
  if (!pp) return JSON.stringify({error: 'NO POPUP OPEN', btn: btn ? btn.getAttribute('aria-label') : 'no-btn'});
  const cs = getComputedStyle(pp);
  const btnRect = btn ? btn.getBoundingClientRect().toJSON() : null;
  const ppRect = pp.getBoundingClientRect().toJSON();
  const chain = [];
  let el = pp;
  while (el && el !== document.documentElement) {
    const c = getComputedStyle(el);
    chain.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className || '').toString().slice(0, 70),
      pos: c.position, z: c.zIndex,
      transform: c.transform !== 'none' ? c.transform.slice(0, 50) : 'none',
      filter: c.filter !== 'none' ? c.filter : '',
      backdrop: c.backdropFilter !== 'none' ? c.backdropFilter : '',
      opacity: c.opacity, overflow: c.overflow, willChange: c.willChange,
      contain: c.contain, isolation: c.isolation,
      rect: { x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }
    });
    el = el.parentElement;
  }
  const cx = ppRect.x + ppRect.width / 2, cy = ppRect.y + ppRect.height / 2;
  const stack = document.elementsFromPoint(cx, cy).map(e => e.tagName.toLowerCase() + '.' + (e.className || '').toString().slice(0, 25));
  // footer rows for spatial reference
  const footer = pp.closest('footer');
  const rows = footer ? [...footer.children].map(ch => {
    const r = ch.getBoundingClientRect();
    return { cls: (ch.className || '').toString().slice(0, 45), y: Math.round(r.y), h: Math.round(r.height) };
  }) : null;
  return JSON.stringify({
    viewport: { w: innerWidth, h: innerHeight },
    btnRect, popupRect: ppRect,
    popupStyle: {
      position: cs.position, inset: cs.bottom + ' / ' + cs.left, transform: cs.transform,
      opacity: cs.opacity, zIndex: cs.zIndex,
      backgroundColor: cs.backgroundColor, backdropFilter: cs.backdropFilter,
      border: cs.border, borderRadius: cs.borderRadius,
      boxShadow: cs.boxShadow.slice(0, 140), overflow: cs.overflow,
      pointerEvents: cs.pointerEvents, width: cs.width, height: cs.height,
      padding: cs.padding, display: cs.display, color: cs.color
    },
    offsetParent: pp.offsetParent ? pp.offsetParent.tagName + '.' + pp.offsetParent.className.toString().slice(0, 50) : 'null',
    ancestors: chain,
    stackAtCenter: stack.slice(0, 8),
    footerRows: rows
  }, null, 1);
})()
