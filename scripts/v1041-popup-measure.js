// V10.4.1 PHASE 1 — Volume popup INTERNAL geometry measurement (works for both
// spatial desktop popup and mobile popup; requires the popup already open).
// Sets volume to 27 via the range input (state setup, not interaction test),
// then measures every inner element vs the popup box.
(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const pp = document.querySelector('[data-mq-volpopup]');
  if (!pp) return JSON.stringify({ error: 'NO POPUP OPEN' });

  // set volume 27 through the real range input (React onChange path)
  const input = pp.querySelector('input[type="range"]');
  if (input) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '27');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(400);
  }

  const icon = pp.querySelector('button');
  const value = pp.querySelector('span.font-mono') || [...pp.querySelectorAll('span')].pop();
  const row = pp.firstElementChild; // VolumeSlider root flex row
  const R = (el) => el ? el.getBoundingClientRect().toJSON() : null;
  const S = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      width: cs.width, minWidth: cs.minWidth, maxWidth: cs.maxWidth,
      flex: cs.flex, flexGrow: cs.flexGrow, flexShrink: cs.flexShrink, flexBasis: cs.flexBasis,
      boxSizing: cs.boxSizing, overflow: cs.overflow, display: cs.display,
      padding: cs.padding, position: cs.position,
    };
  };

  const ppR = R(pp), inR = R(input), icR = R(icon), vaR = R(value), roR = R(row);
  const num = (x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x);
  const calc = {
    popup: { x: num(ppR.x), y: num(ppR.y), w: num(ppR.width), h: num(ppR.height), right: num(ppR.right), bottom: num(ppR.bottom) },
    icon: icR && { x: num(icR.x), w: num(icR.width), right: num(icR.right), h: num(icR.height) },
    slider: inR && { x: num(inR.x), w: num(inR.width), right: num(inR.right), h: num(inR.height) },
    value: vaR && { x: num(vaR.x), w: num(vaR.width), right: num(vaR.right), h: num(vaR.height), text: value.textContent },
    row: roR && { x: num(roR.x), w: num(roR.width), right: num(roR.right) },
  };

  return JSON.stringify({
    viewport: { w: innerWidth, h: innerHeight },
    rects: calc,
    styles: { popup: S(pp), icon: S(icon), slider: S(input), value: S(value), row: S(row) },
    scroll: {
      popup: { scrollWidth: pp.scrollWidth, clientWidth: pp.clientWidth, overflowDelta: pp.scrollWidth - pp.clientWidth },
      row: row && { scrollWidth: row.scrollWidth, clientWidth: row.clientWidth, overflowDelta: row.scrollWidth - row.clientWidth },
    },
    containment: {
      sliderInsideRight: inR ? inR.right <= ppR.right + 0.5 : null,
      valueInsideRight: vaR ? vaR.right <= ppR.right + 0.5 : null,
      valueInsideBottom: vaR ? vaR.bottom <= ppR.bottom + 0.5 : null,
      iconInsideLeft: icR ? icR.left >= ppR.left - 0.5 : null,
      sliderInsideLeft: inR ? inR.left >= ppR.left - 0.5 : null,
      // how far past the popup's right edge the value text sits (px)
      valueOverflowPx: vaR ? num(vaR.right - ppR.right) : null,
      sliderOverflowPx: inR ? num(inR.right - ppR.right) : null,
    },
    valueShown: value ? value.textContent : null,
  }, null, 1);
})()
