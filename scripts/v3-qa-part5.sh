#!/bin/bash
# V3 QA — PART 5: FULL PLAYER (Wave §33) + states + lyrics + mobile 390
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
$AB find label "Треки, артисты" fill "blinding lights" > /dev/null 2>&1 || $AB eval "
(() => {
  const inp = document.querySelector('input[placeholder*=Треки], input[placeholder*=треки]');
  if (!inp) return 'no input';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, 'blinding lights');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()" > /dev/null 2>&1
sleep 4

echo "=== PLAY A TRACK ==="
$AB eval "document.querySelectorAll('.mq-row')[0]?.click() || 'no row'" > /dev/null 2>&1
sleep 5

echo "=== OPEN FULL PLAYER (click the mini player bar) ==="
$AB eval "
(() => {
  // The mini player bar opens the full player on click (excluding control buttons)
  const bar = document.querySelector('[data-mq-playerbar], [class*=playerbar], footer [class*=player]');
  if (!bar) return 'playerbar not found';
  const info = bar.querySelector('[class*=track], [class*=info], [class*=meta]');
  if (info) { info.click(); return 'info clicked'; }
  bar.click(); return 'bar clicked';
})()
" 2>/dev/null
sleep 2
$AB screenshot $OUT/20-desktop-fullplayer.png 2>&1 | tail -1
echo "-- wave in full player --"
$AB eval "
(() => {
  const wf = document.querySelector('[data-mq-waveform]');
  return JSON.stringify({
    found: !!wf,
    waveState: wf?.getAttribute('data-wave-state') ?? null,
    waveStatus: wf?.getAttribute('data-status') ?? null,
    canvas: !!wf?.querySelector('canvas'),
  });
})()
" 2>/dev/null

echo "=== WAVE: PLAYING STATE ==="
sleep 3
$AB screenshot $OUT/21-wave-playing.png 2>&1 | tail -1
$AB eval "document.querySelector('[data-mq-waveform]')?.getAttribute('data-wave-state')" 2>/dev/null

echo "=== WAVE: PAUSE → PAUSED STATE (§16 distinct states) ==="
$AB eval "
(() => {
  const btns = [...document.querySelectorAll('button')];
  const pause = btns.find(b => b.getAttribute('aria-label')?.toLowerCase().includes('пауза') || b.getAttribute('aria-label')?.toLowerCase().includes('pause'));
  if (pause) { pause.click(); return 'paused'; }
  return 'pause button not found';
})()
" 2>/dev/null
sleep 2
$AB eval "document.querySelector('[data-mq-waveform]')?.getAttribute('data-wave-state')" 2>/dev/null
$AB screenshot $OUT/22-wave-paused.png 2>&1 | tail -1

echo "=== WAVE: SEEK via keyboard (slider semantics) ==="
$AB eval "
(() => {
  const c = document.querySelector('[data-mq-waveform] canvas');
  if (!c) return 'no canvas';
  c.focus();
  c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  return 'ArrowRight sent';
})()
" 2>/dev/null
sleep 1
$AB eval "document.querySelector('[data-mq-waveform]')?.getAttribute('data-wave-state')" 2>/dev/null
$AB screenshot $OUT/23-wave-seek.png 2>&1 | tail -1

echo "=== RESUME ==="
$AB eval "
(() => {
  const btns = [...document.querySelectorAll('button')];
  const play = btns.find(b => b.getAttribute('aria-label')?.toLowerCase().includes('воспроизв') || b.getAttribute('aria-label')?.toLowerCase().includes('play'));
  if (play) { play.click(); return 'resumed'; }
  return 'not found';
})()
" 2>/dev/null

echo "=== FULL PLAYER: LYRICS BUTTON ==="
$AB eval "
(() => {
  const btn = [...document.querySelectorAll('button')].find(b => {
    const a = (b.getAttribute('aria-label')||'') + (b.textContent||'');
    return /текст|lyrics/i.test(a);
  });
  if (btn) { btn.click(); return 'lyrics open: ' + (btn.getAttribute('aria-label')||btn.textContent).slice(0,30); }
  return 'lyrics button not found in full player';
})()
" 2>/dev/null
sleep 3
$AB screenshot $OUT/24-desktop-lyrics.png 2>&1 | tail -1

echo "=== MOBILE 390x844 (§31) ==="
$AB set viewport 390 844 > /dev/null 2>&1
sleep 2
$AB screenshot $OUT/30-mobile-fullplayer.png 2>&1 | tail -1
$AB eval "document.querySelector('[data-mq-waveform]')?.getAttribute('data-wave-state') + ' | canvas=' + !!document.querySelector('[data-mq-waveform] canvas')" 2>/dev/null

echo "=== MOBILE HOME ==="
$AB eval "window.close?.(); document.body.style.zoom='1'; location.href='/'; 'nav'" > /dev/null 2>&1
sleep 2
$AB press Escape > /dev/null 2>&1
sleep 1
$AB screenshot $OUT/31-mobile-home.png 2>&1 | tail -1

echo "=== ERRORS ==="
$AB errors 2>&1 | grep -v "^✗ *$" | tail -6

kill $SERVER_PID 2>/dev/null
echo "QA-PART-5 DONE"
