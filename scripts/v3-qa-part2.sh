#!/bin/bash
# V3 QA — PART 2: full desktop journey (§31-33)
set -u
cd /home/z/my-project/.next/standalone
node server.js > /tmp/mq-standalone.log 2>&1 &
SERVER_PID=$!
cd /home/z/my-project
OUT=download/qa-v3
mkdir -p "$OUT"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 http://127.0.0.1:3000/ 2>/dev/null)
  if [ "$code" != "000" ] && [ -n "$code" ]; then break; fi
  sleep 1
done

AB="agent-browser --session v3qa"
$AB set viewport 1440 900 > /dev/null 2>&1
$AB open http://127.0.0.1:3000/ > /dev/null 2>&1
sleep 2

echo "=== ENTER DEMO ==="
$AB find text "Демо-режим" click 2>&1 | tail -1
sleep 3
$AB screenshot $OUT/01-desktop-home-demo.png 2>&1 | tail -1
$AB eval "document.body.getAttribute('data-view') || document.querySelector('[data-mq-view]')?.getAttribute('data-mq-view') || location.pathname" 2>/dev/null

echo "=== 02 SEARCH 'weeknd' ==="
# Click the search nav (bottom-left rail or top search box)
$AB eval "
(() => {
  const btns = [...document.querySelectorAll('button, a, [role=button]')];
  const s = btns.find(b => (b.textContent||'').trim() === 'Поиск' || (b.getAttribute('aria-label')||'').includes('Поиск'));
  if (s) { s.click(); return 'clicked: ' + (s.textContent||'').trim(); }
  return 'search button not found';
})()
" 2>/dev/null
sleep 1
# Type into the search input
$AB eval "
(() => {
  const inp = document.querySelector('input[type=text], input[type=search], input:not([type])');
  if (!inp) return 'no input';
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(inp, 'weeknd');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()
" 2>/dev/null
sleep 3
$AB screenshot $OUT/02-desktop-search.png 2>&1 | tail -1
$AB eval "document.querySelectorAll('[data-mq-track], [data-mq-artist-track], [data-mq-catalog-track]').length" 2>/dev/null

echo "=== 03 PLAY FIRST RESULT + WAVE STATE ==="
$AB eval "
(() => {
  const play = [...document.querySelectorAll('button, [role=button], .mq-row, [data-mq-track]')].find(el => {
    const t = (el.textContent||'').trim(); const a = el.getAttribute('aria-label')||'';
    return a.includes('Слушать') || a.includes('Play') || t === '▶' || a.includes('Воспроизвести');
  });
  if (play) { play.click(); return 'play clicked'; }
  // fallback: click first track row
  const row = document.querySelector('[data-mq-track], [data-mq-artist-track], .mq-row');
  if (row) { row.click(); return 'row clicked'; }
  return 'nothing to play';
})()
" 2>/dev/null
sleep 4
$AB screenshot $OUT/03-desktop-playing.png 2>&1 | tail -1
echo "-- wave state + track --"
$AB eval "document.querySelector('[data-mq-waveform]')?.getAttribute('data-wave-state') + ' | ' + document.querySelector('[data-mq-waveform]')?.getAttribute('data-status')" 2>/dev/null

echo "=== 04 PLAYER BAR / MINI ==="
$AB screenshot $OUT/04-desktop-playerbar.png 2>&1 | tail -1

echo "=== 05 CONSOLE ERRORS ==="
$AB errors 2>&1 | tail -5

kill $SERVER_PID 2>/dev/null
echo "QA-PART-2 DONE"
