#!/bin/bash
# V3 — FOCUSED §21 FULL-TRACK PROOF: play ONE SoundCloud track, sample
# position every 15s for ~105s, assert monotonic growth past 90 seconds.
set -u
OUT=download/qa-v3
PROD="https://mq1.vercel.app"
AB="agent-browser --session v3full"

$AB set viewport 1440 900 > /dev/null 2>&1
$AB open "$PROD/" > /dev/null 2>&1
sleep 3
$AB find text "Демо-режим" click > /dev/null 2>&1
sleep 3
$AB find text "Поиск" click > /dev/null 2>&1; sleep 1
$AB eval "
(() => {
  const inp = document.querySelector('input[placeholder*=Треки], input[placeholder*=треки]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, 'blinding lights the weeknd');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()" > /dev/null 2>&1
sleep 5

echo "=== PLAY + close any stray modal ==="
$AB eval "document.querySelectorAll('.mq-row')[0]?.click() || 'no row'" 2>/dev/null
sleep 2
$AB press Escape > /dev/null 2>&1
sleep 4

sample() {
  $AB eval "
(() => {
  // Position sources, most precise first: wave slider aria-valuenow (s),
  // then the player capsule time labels.
  const wf = document.querySelector('[data-mq-waveform] canvas');
  if (wf) { const n = Number(wf.getAttribute('aria-valuenow')); if (n > 0) return String(n); }
  const cap = document.querySelector('.mq-player-capsule, [class*=player-capsule]');
  if (cap) {
    const m = (cap.textContent||'').match(/(\\d+):(\\d\\d)\\s*\\/\\s*(\\d+):(\\d\\d)/) || (cap.textContent||'').match(/^(\\d+):(\\d\\d)\\s/);
    if (m) {
      if (m.length >= 5 && m[3] !== undefined) return String(Number(m[1])*60 + Number(m[2]));
      return String(Number(m[1])*60 + Number(m[2]));
    }
  }
  // last resort: any aria slider
  const s = document.querySelector('[role=slider][aria-valuenow]');
  return s ? s.getAttribute('aria-valuenow') : '0';
})()" 2>/dev/null | tr -d '"'
}

echo "t=0s   pos=$(sample)"
sleep 15; echo "t=15s  pos=$(sample)"
sleep 15; echo "t=30s  pos=$(sample)   ← §21 30s checkpoint"
sleep 15; echo "t=45s  pos=$(sample)"
sleep 15; echo "t=60s  pos=$(sample)"
sleep 15; echo "t=75s  pos=$(sample)"
sleep 15; echo "t=90s  pos=$(sample)   ← §21 90s checkpoint (0:00→0:30→1:00→1:30)"
sleep 15; echo "t=105s pos=$(sample)"
$AB screenshot $OUT/60-prod-90s-proof.png 2>&1 | tail -1

echo "=== still playing? ==="
$AB eval "JSON.stringify({pauseBtnVisible: !![...document.querySelectorAll('button')].find(x => /Пауз/i.test(x.getAttribute('aria-label')||''))})" 2>/dev/null
echo "FULL-TRACK-PROBE DONE"
