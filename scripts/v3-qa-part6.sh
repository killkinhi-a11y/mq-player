#!/bin/bash
# V3 QA — PART 6: full player via aria-label + WAVE states (§33) + lyrics + mobile
set -u
cd /home/z/my-project/.next/standalone
node server.js > /tmp/mq-standalone.log 2>&1 &
SERVER_PID=$!
cd /home/z/my-project
OUT=download/qa-v3
AB="agent-browser --session v3qa"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://127.0.0.1:3000/ 2>/dev/null)
  if [ "$code" != "000" ] && [ -n "$code" ]; then break; fi
  sleep 1
done

$AB set viewport 1440 900 > /dev/null 2>&1
$AB open http://127.0.0.1:3000/ > /dev/null 2>&1
sleep 2
$AB find text "Демо-режим" click > /dev/null 2>&1
sleep 3
$AB find text "Поиск" click > /dev/null 2>&1
sleep 1
$AB eval "
(() => {
  const inp = document.querySelector('input[placeholder*=Треки], input[placeholder*=треки]');
  if (!inp) return 'no input';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, 'blinding lights');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()" > /dev/null 2>&1
sleep 4
$AB eval "document.querySelectorAll('.mq-row')[0]?.click() || 'no row'" > /dev/null 2>&1
sleep 5

echo "=== OPEN FULL PLAYER (aria-label) ==="
$AB find role button click --name "Открыть полный плеер" 2>&1 | tail -1
sleep 2
$AB screenshot $OUT/20-desktop-fullplayer.png 2>&1 | tail -1
$AB eval "
(() => {
  const wf = document.querySelector('[data-mq-waveform]');
  return JSON.stringify({ found: !!wf, state: wf?.getAttribute('data-wave-state') ?? null, status: wf?.getAttribute('data-status') ?? null, canvas: !!wf?.querySelector('canvas') });
})()
" 2>/dev/null

echo "=== WAVE STATES SEQUENCE (§16/§33) ==="
# playing
sleep 3
echo -n "playing: "; $AB eval "document.querySelector('[data-mq-waveform]')?.getAttribute('data-wave-state')" 2>/dev/null
$AB screenshot $OUT/21-wave-playing.png 2>&1 | tail -1
# pause
$AB eval "
(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'').match(/пауз/i));
  if (b) { b.click(); return 'pause clicked'; }
  return 'no pause';
})()" 2>/dev/null
sleep 2
echo -n "paused: "; $AB eval "document.querySelector('[data-mq-waveform]')?.getAttribute('data-wave-state')" 2>/dev/null
$AB screenshot $OUT/22-wave-paused.png 2>&1 | tail -1
# keyboard seek while paused (slider semantics + SEEKING feedback)
$AB eval "
(() => {
  const c = document.querySelector('[data-mq-waveform] canvas');
  if (!c) return 'no canvas';
  c.focus();
  c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  return 'ArrowRight';
})()" 2>/dev/null
sleep 1
echo -n "after seek (paused): "; $AB eval "document.querySelector('[data-mq-waveform]')?.getAttribute('data-wave-state')" 2>/dev/null
$AB screenshot $OUT/23-wave-seek-paused.png 2>&1 | tail -1
# resume → playing again
$AB eval "
(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'').match(/воспроизв|play/i));
  if (b) { b.click(); return 'resume clicked'; }
  return 'no resume';
})()" 2>/dev/null
sleep 2
echo -n "resumed: "; $AB eval "document.querySelector('[data-mq-waveform]')?.getAttribute('data-wave-state')" 2>/dev/null
# drag-scrub on the canvas (pointer events)
$AB eval "
(() => {
  const c = document.querySelector('[data-mq-waveform] canvas');
  if (!c) return 'no canvas';
  const r = c.getBoundingClientRect();
  c.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width*0.4, bubbles: true }));
  c.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width*0.6, bubbles: true }));
  c.dispatchEvent(new PointerEvent('pointerup', { clientX: r.left + r.width*0.6, bubbles: true }));
  return 'scrubbed 40%→60%';
})()" 2>/dev/null
sleep 2
echo -n "after scrub: "; $AB eval "document.querySelector('[data-mq-waveform]')?.getAttribute('data-wave-state')" 2>/dev/null
$AB screenshot $OUT/24-wave-after-scrub.png 2>&1 | tail -1

echo "=== WAVEFORM DATA SOURCE (real peaks?) ==="
$AB eval "document.querySelector('[data-mq-waveform]')?.getAttribute('data-status')" 2>/dev/null

echo "=== LYRICS in full player ==="
$AB eval "
(() => {
  const b = [...document.querySelectorAll('button')].find(x => /текст|lyric/i.test((x.getAttribute('aria-label')||'') + (x.textContent||'')));
  if (b) { b.click(); return 'lyrics: ' + (b.getAttribute('aria-label')||b.textContent).slice(0,40); }
  return 'not found';
})()" 2>/dev/null
sleep 3
$AB screenshot $OUT/25-fullplayer-lyrics.png 2>&1 | tail -1

echo "=== MOBILE 390 (§31) ==="
$AB press Escape > /dev/null 2>&1; sleep 1
$AB set viewport 390 844 > /dev/null 2>&1
sleep 2
$AB screenshot $OUT/30-mobile-fullplayer.png 2>&1 | tail -1
$AB eval "JSON.stringify({wave: document.querySelector('[data-mq-waveform]')?.getAttribute('data-wave-state') ?? null, canvas: !!document.querySelector('[data-mq-waveform] canvas')})" 2>/dev/null

echo "=== ERRORS ==="
$AB errors --json 2>/dev/null | head -c 600
echo
kill $SERVER_PID 2>/dev/null
echo "QA-PART-6 DONE"
