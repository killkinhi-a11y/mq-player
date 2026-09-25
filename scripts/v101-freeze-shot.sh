#!/bin/bash
# v10.1 §17 shots 11+12 — deterministic mid-transition capture via Web Animations API.
# Freezes REAL in-flight CSS animations/transitions at several timed offsets after a
# click, then screenshots the frozen intermediate state. No fake states injected.
#
# Usage: v101-freeze-shot.sh <session> <clickAriaLabel> <offsetsCsv> <outPng> <probeSelector>
set -u
S="$1"; LABEL="$2"; OFFSETS="$3"; OUT="$4"; PROBE="$5"

EVAL_JS="(() => {
  const btn = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'').includes('$LABEL'));
  if (!btn) return {error: 'button not found: $LABEL'};
  window.__mqFrozen = {log: []};
  const offs = ['$OFFSETS'.split(',')][0].map(Number);
  offs.forEach(ms => setTimeout(() => {
    let paused = 0;
    document.getAnimations().forEach(a => { try { a.pause(); paused++; } catch (e) {} });
    const el = document.querySelector('$PROBE');
    const cs = el ? getComputedStyle(el) : null;
    window.__mqFrozen.log.push({ atMs: ms, paused, opacity: cs ? cs.opacity : null });
    window.__mqFrozen.last = { atMs: ms, opacity: cs ? cs.opacity : null };
  }, ms));
  btn.click();
  return {clicked: btn.getAttribute('aria-label'), offsets: offs};
})()"

R1=$(agent-browser --session "$S" eval "$EVAL_JS" 2>&1 | tail -n +2)
sleep 1.2
agent-browser --session "$S" screenshot "$OUT" 2>&1 | tail -1
R2=$(agent-browser --session "$S" eval "window.__mqFrozen" 2>&1 | tail -n +2)
echo "CLICK: $R1"
echo "FROZEN: $R2"
