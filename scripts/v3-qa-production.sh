#!/bin/bash
# V3 — PHASE 37: PRODUCTION SMOKE TEST (the mandated 16-step protocol)
set -u
OUT=download/qa-v3
PROD="https://mq1.vercel.app"
AB="agent-browser --session v3prod"
mkdir -p "$OUT"

echo "=== 0. PRODUCTION ALIVE ==="
curl -s --max-time 15 "$PROD/version.json" | head -c 120; echo

$AB set viewport 1440 900 > /dev/null 2>&1
$AB open "$PROD/" > /dev/null 2>&1
sleep 3
$AB find text "Демо-режим" click 2>&1 | tail -1
sleep 3

echo "=== 1. SEARCH REAL TRACK ==="
$AB find text "Поиск" click > /dev/null 2>&1; sleep 1
$AB eval "
(() => {
  const inp = document.querySelector('input[placeholder*=Треки], input[placeholder*=треки]');
  if (!inp) return 'no input';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, 'blinding lights the weeknd');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()" > /dev/null 2>&1
sleep 5
ROWS=$($AB eval "document.querySelectorAll('.mq-row').length" 2>/dev/null | tr -d '"')
echo "search rows: $ROWS"
$AB screenshot $OUT/50-prod-search.png 2>&1 | tail -1

echo "=== 2-4. ARTIST / ALBUM / TRACK pages ==="
$AB eval "
(() => {
  // find an artist chip/link in results to open the artist page
  const links = [...document.querySelectorAll('button, a, [role=button]')];
  const artist = links.find(el => /The Weeknd/i.test(el.textContent||'') && (el.getAttribute('data-mq-artist') || el.className.toString().includes('artist')));
  if (artist) { artist.click(); return 'artist page opened'; }
  return 'artist link not found (ok — search page rows only)';
})()" 2>/dev/null
sleep 2
$AB screenshot $OUT/51-prod-after-artist.png 2>&1 | tail -1

echo "=== 5-6. PLAY + VERIFY FULL-LENGTH SOURCE ==="
$AB find text "Поиск" click > /dev/null 2>&1; sleep 1
$AB eval "
(() => {
  const inp = document.querySelector('input[placeholder*=Треки], input[placeholder*=треки]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, 'starboy the weeknd');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()" > /dev/null 2>&1
sleep 5
$AB eval "document.querySelectorAll('.mq-row')[0]?.click() || 'no row'" > /dev/null 2>&1
T0=$(date +%s)
sleep 6
$AB screenshot $OUT/52-prod-playing.png 2>&1 | tail -1
echo "-- full-length + provider attribution --"
$AB eval "
(() => {
  // pull what the timeline/resolver recorded for THIS play
  const tl = window.__mqTimeline;
  const last = tl?.get?.()?.slice(-1)[0];
  return JSON.stringify({
    stages: last?.stages?.slice(0, 8),
    totalMs: last?.total,
  });
})()" 2>/dev/null

echo "=== 7-8. PLAY >30s AND >90s (full-track proof §21) ==="
sleep 30
P30=$($AB eval "
(() => {
  const wf = document.querySelector('[data-mq-waveform]');
  const time = [...document.querySelectorAll('[class*=player]')].map(e=>e.textContent).join(' ').match(/(\d+):(\d+)/g);
  return JSON.stringify({ state: wf?.getAttribute('data-wave-state') ?? 'no-wave', times: time?.slice(0,3) });
})()" 2>/dev/null)
echo "at T+36s: $P30"
$AB screenshot $OUT/53-prod-30s.png 2>&1 | tail -1
sleep 62
P90=$($AB eval "
(() => {
  const wf = document.querySelector('[data-mq-waveform]');
  const time = [...document.querySelectorAll('[class*=player]')].map(e=>e.textContent).join(' ').match(/(\d+):(\d+)/g);
  return JSON.stringify({ state: wf?.getAttribute('data-wave-state') ?? 'no-wave', times: time?.slice(0,3), stillPlaying: !!document.querySelector('[aria-label*=Пауз], [aria-label*=пауз]') });
})()" 2>/dev/null)
echo "at T+98s: $P90"
$AB screenshot $OUT/54-prod-90s.png 2>&1 | tail -1
NOW=$(date +%s); echo "elapsed since play: $((NOW-T0))s"

echo "=== 9. SEEK (wave click at 60%) ==="
$AB eval "
(() => {
  const c = document.querySelector('[data-mq-waveform] canvas');
  if (!c) return 'no canvas (mini bar — use playerbar)';
  const r = c.getBoundingClientRect();
  c.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width*0.6, bubbles: true }));
  c.dispatchEvent(new PointerEvent('pointerup', { clientX: r.left + r.width*0.6, bubbles: true }));
  return 'seeked';
})()" 2>/dev/null

echo "=== 10-11. PAUSE + RESUME ==="
$AB eval "
(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Пауз|пауз/i.test(x.getAttribute('aria-label')||''));
  if (b) { b.click(); return 'paused'; }
  return 'no pause btn';
})()" 2>/dev/null
sleep 2
$AB eval "
(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Воспроизвед|Play|play/i.test(x.getAttribute('aria-label')||''));
  if (b) { b.click(); return 'resumed'; }
  return 'no play btn';
})()" 2>/dev/null

echo "=== 12. NEXT (rapid x2 — §28) ==="
$AB eval "
(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Следующ/i.test(x.getAttribute('aria-label')||''));
  if (b) { b.click(); b.click(); return 'next x2'; }
  return 'no next btn';
})()" 2>/dev/null
sleep 4

echo "=== 13. QUEUE ==="
$AB eval "
(() => {
  const b = [...document.querySelectorAll('button')].find(x => /очеред/i.test((x.getAttribute('aria-label')||'') + (x.textContent||'')));
  if (b) { b.click(); return 'queue opened'; }
  return 'queue btn not found';
})()" 2>/dev/null
sleep 2
$AB screenshot $OUT/55-prod-queue.png 2>&1 | tail -1

echo "=== 14. LYRICS ==="
$AB eval "
(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Текст|текст песн/i.test((x.getAttribute('aria-label')||'') + (x.textContent||'')));
  if (b) { b.click(); return 'lyrics opened'; }
  return 'lyrics btn not found';
})()" 2>/dev/null
sleep 3
$AB screenshot $OUT/56-prod-lyrics.png 2>&1 | tail -1

echo "=== 15. WAVE (full player) ==="
$AB press Escape > /dev/null 2>&1; sleep 1
$AB find role button click --name "Открыть полный плеер" 2>&1 | tail -1
sleep 3
$AB eval "document.querySelector('[data-mq-waveform]')?.getAttribute('data-wave-state') + ' / ' + document.querySelector('[data-mq-waveform]')?.getAttribute('data-status')" 2>/dev/null
$AB screenshot $OUT/57-prod-wave.png 2>&1 | tail -1

echo "=== 16. MOBILE 390x844 ==="
$AB press Escape > /dev/null 2>&1; sleep 1
$AB set viewport 390 844 > /dev/null 2>&1; sleep 2
$AB screenshot $OUT/58-prod-mobile.png 2>&1 | tail -1
$AB eval "JSON.stringify({wave: document.querySelector('[data-mq-waveform]')?.getAttribute('data-wave-state') ?? null})" 2>/dev/null

echo "=== skip events on PRODUCTION (§24 live) ==="
$AB eval "
(() => {
  const raw = localStorage.getItem('mq:v3:listeningEvents');
  if (!raw) return 'no events';
  const ev = JSON.parse(raw);
  return JSON.stringify({ total: ev.length, sample: ev.slice(0,3).map(e => e.kind+':'+Math.round(e.playedSeconds)+'s') });
})()" 2>/dev/null

echo "=== PROD PAGE ERRORS ==="
$AB errors 2>&1 | grep -v "^✗ *$" | head -4

echo "PRODUCTION-SMOKE DONE"
