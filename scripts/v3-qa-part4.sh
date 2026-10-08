#!/bin/bash
# V3 QA — PART 4: full journey (play, wave states, rapid A→B→C→D, lyrics, queue, mobile)
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

echo "=== SEARCH 'blinding lights' ==="
$AB find label "Трекы, артисты, альбомы…" fill "blinding lights" 2>&1 | tail -1
sleep 4
$AB screenshot $OUT/10-desktop-search-results.png 2>&1 | tail -1
TRACKS=$($AB eval "document.querySelectorAll('.mq-row').length" 2>/dev/null | tr -d '"')
echo "track rows: $TRACKS"

echo "=== PLAY FIRST TRACK ROW ==="
$AB eval "
(() => {
  const rows = [...document.querySelectorAll('.mq-row')];
  if (!rows.length) return 'no rows';
  rows[0].click();
  return 'clicked row 1: ' + (rows[0].textContent||'').slice(0,60);
})()
" 2>/dev/null
sleep 6
$AB screenshot $OUT/11-desktop-track-playing.png 2>&1 | tail -1
echo "-- state checks --"
$AB eval "
(() => {
  const wf = document.querySelector('[data-mq-waveform]');
  return JSON.stringify({
    waveState: wf?.getAttribute('data-wave-state'),
    waveStatus: wf?.getAttribute('data-status'),
    playerTitle: document.querySelector('[data-mq-player-title], .mq-playerbar, [class*=player] .truncate')?.textContent?.slice(0,50) || null,
    hasCanvas: !!wf?.querySelector('canvas'),
  });
})()
" 2>/dev/null

echo "=== RAPID A→B→C→D (§32: rapid next x3 + row clicks) ==="
$AB eval "
(() => {
  // Click rows 2,3,4 in rapid succession (each is a new play intent).
  const rows = [...document.querySelectorAll('.mq-row')];
  const picked = [];
  for (const i of [1,2,3]) {
    if (rows[i]) { rows[i].click(); picked.push((rows[i].textContent||'').slice(0,40)); }
  }
  return JSON.stringify(picked);
})()
" 2>/dev/null
sleep 5
echo "-- final track after rapid switching (D must win) --"
$AB eval "
(() => {
  const wf = document.querySelector('[data-mq-waveform]');
  const bar = [...document.querySelectorAll('[class*=player] .truncate, [data-mq-player-title]')].map(e=>e.textContent?.trim()).filter(Boolean).slice(0,3);
  return JSON.stringify({ waveState: wf?.getAttribute('data-wave-state'), bar });
})()
" 2>/dev/null
$AB screenshot $OUT/12-desktop-after-rapid-switch.png 2>&1 | tail -1

echo "=== SKIP EVENTS RECORDED? (§24 live) ==="
$AB eval "
(() => {
  const raw = localStorage.getItem('mq:v3:listeningEvents');
  if (!raw) return 'NO EVENTS';
  const ev = JSON.parse(raw);
  return JSON.stringify({
    total: ev.length,
    kinds: ev.slice(0,5).map(e => e.kind + ':' + Math.round(e.playedSeconds) + 's'),
  });
})()
" 2>/dev/null

echo "=== WAVE CLICK-SEEK (§33) ==="
$AB eval "
(() => {
  const wf = document.querySelector('[data-mq-waveform] canvas');
  if (!wf) return 'no canvas';
  const r = wf.getBoundingClientRect();
  const evDown = new PointerEvent('pointerdown', { clientX: r.left + r.width * 0.5, bubbles: true });
  const evUp = new PointerEvent('pointerup', { clientX: r.left + r.width * 0.5, bubbles: true });
  wf.dispatchEvent(evDown); wf.dispatchEvent(evUp);
  return 'seeked to 50%';
})()
" 2>/dev/null
sleep 2
$AB eval "
(() => {
  const wf = document.querySelector('[data-mq-waveform]');
  return 'after seek: state=' + wf?.getAttribute('data-wave-state');
})()
" 2>/dev/null

echo "=== LYRICS VIEW ==="
$AB eval "
(() => {
  const btn = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'').toLowerCase().includes('текст') || (b.textContent||'').includes('Текст'));
  if (btn) { btn.click(); return 'lyrics clicked'; }
  return 'lyrics button not found';
})()
" 2>/dev/null
sleep 3
$AB screenshot $OUT/13-desktop-lyrics.png 2>&1 | tail -1

echo "=== QUEUE VIEW ==="
$AB eval "
(() => {
  const btn = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'').toLowerCase().includes('очеред'));
  if (btn) { btn.click(); return 'queue clicked'; }
  const nav = [...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Очередь');
  if (nav) { nav.click(); return 'queue nav clicked'; }
  return 'queue button not found';
})()
" 2>/dev/null
sleep 2
$AB screenshot $OUT/14-desktop-queue.png 2>&1 | tail -1

echo "=== CONSOLE/PAGE ERRORS ==="
$AB errors 2>&1 | tail -4

kill $SERVER_PID 2>/dev/null
echo "QA-PART-4 DONE"
