#!/bin/bash
# v10.1 §17 shots 11+12 — deterministic mid-transition capture v2.
# On transitionrun/animationstart (document-level delegation — survives React
# keyed remounts), find the matching Animation in document.getAnimations(),
# pause() it and SEEK to a chosen progress (midpoint by default), then
# screenshot. The rendered frame is a genuine intermediate state of the real
# animation object — immune to headless frame starvation.
#
# Usage: v101-art-freeze.sh <session> <clickAriaLabel> <outPng> <probeSelector> <progressPct> [kind]
#   kind: transition (default) | animation
#   progressPct: 0-100 target progress of the animation (default 50)
set -u
S="$1"; LABEL="$2"; OUT="$3"; PROBE="$4"; PROG="${5:-50}"; KIND="${6:-transition}"

EVAL_JS="(() => {
  const btn = '$LABEL'.startsWith('css:')
    ? document.querySelector('$LABEL'.slice(4))
    : [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'').includes('$LABEL'));
  if (!btn) return {error: 'button not found: $LABEL'};
  document.getAnimations().forEach(a => { try { a.play(); } catch (e) {} });
  window.__mqFrozen = {log: [], fired: false};
  const evName = '$KIND' === 'animation' ? 'animationstart' : 'transitionrun';
  const handler = (e) => {
    const isAnim = '$KIND' === 'animation';
    const ok = isAnim
      ? (e.animationName === 'mqFtSlideUp')
      : (e.target && e.target.matches && e.target.matches('.mq-art-fade') && e.propertyName === 'opacity');
    if (!ok || window.__mqFrozen.fired) return;
    window.__mqFrozen.fired = true;
    window.__mqFrozen.event = {type: e.type, name: e.animationName || e.propertyName, t: Math.round(performance.now())};
    // Find the running animation for this element/property and seek it.
    const anims = document.getAnimations().filter(a => {
      if (isAnim) return a.animationName === 'mqFtSlideUp';
      const el = a.effect && a.effect.target;
      return el && el.matches && el.matches('.mq-art-fade') && (a.transitionProperty === 'opacity' || a.transitionProperty === 'all');
    });
    if (!anims.length) { window.__mqFrozen.log.push({error: 'anim not found', count: document.getAnimations().length}); return; }
    let detail = null;
    anims.forEach(a => {
      try {
        a.pause();
        const dur = a.effect.getTiming().duration || 200;
        a.currentTime = Math.round(dur * $PROG / 100);
        detail = {duration: dur, seekTo: a.currentTime, playState: a.playState};
      } catch (err) { detail = {error: String(err)}; }
    });
    const el = document.querySelector('$PROBE');
    const cs = el ? getComputedStyle(el) : null;
    window.__mqFrozen.log.push({ phase: 'seeked to $PROG%', detail, opacity: cs ? cs.opacity : null, transform: cs ? (cs.transform || 'none').slice(0, 72) : null });
  };
  document.addEventListener(evName, handler, true);
  window.__mqCleanupFreeze = () => document.removeEventListener(evName, handler, true);
  btn.click();
  return {clicked: btn.getAttribute('aria-label') || '$LABEL', listening: evName};
})()"

R1=$(agent-browser --session "$S" eval "$EVAL_JS" 2>&1 | tail -n +2)
sleep 1.5
agent-browser --session "$S" screenshot "$OUT" 2>&1 | tail -1
R2=$(agent-browser --session "$S" eval "window.__mqFrozen" 2>&1 | tail -n +2)
agent-browser --session "$S" eval "window.__mqCleanupFreeze ? window.__mqCleanupFreeze() : null" >/dev/null 2>&1
echo "CLICK: $R1"
echo "FROZEN: $R2"
