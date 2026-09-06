// Audio QA metrics snapshot v2 — live position from DOM (persist strips transient fields)
(() => {
  const h = window.__mqWasmAudio || {};
  const wf = h._workletFlow || {};
  const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
  const nan = [h.rms, h.peak, h.truePeakDb].some(v => typeof v === 'number' && !isFinite(v));
  // live position: the biggest visible progressbar + time labels
  const pb = [...document.querySelectorAll('[role=progressbar]')].filter(p => p.getBoundingClientRect().width > 100).pop();
  const pct = pb ? Number(pb.getAttribute('aria-valuenow')) : null;
  let times = '';
  const timeEl = [...document.querySelectorAll('span, p, div')].find(el => /^\d+:\d\d\s*\/\s*\d+:\d\d$/.test(el.textContent.trim()));
  if (timeEl) times = timeEl.textContent.trim();
  return JSON.stringify({
    t: Math.round(performance.now() / 1000),
    life: h.lifecycle, eng: h.engineState, gen: h.generation,
    frames: h.framesProcessed, buf: h.bufferLevel, un: h.underruns, ov: h.overruns,
    drop: wf.pcmDropped, stale: wf.pcmStale, granted: wf.granted, arrived: wf.arrived, bnd: wf.boundaries,
    rms: h.rms ? +h.rms.toFixed(4) : null, peak: h.peak ? +h.peak.toFixed(3) : null, tp: h.truePeakDb ? +h.truePeakDb.toFixed(1) : null,
    posPct: pct, posStr: times,
    cpuNs: h.avgProcessNs ? Math.round(h.avgProcessNs) : null,
    memMB: mem, NaN: nan, err: h.lastError || null,
  });
})()
