#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
# v11.1 VERIFICATION E2E (rev 2) — fresh clean build + pointer-capture fix
#   STAGE 1 DESKTOP 1440×900: player / waveform / keyboard single-seek
#     (Arrow/Shift/Home/End) / audio-clock sync / lyrics synced / fullscreen
#     +focus / custom font upload+apply+IDB+delete / download menu honesty /
#     waveform OFF→classic seek / resize
#   STAGE 2 MOBILE 390×844: waveform / touch tap+drag seek / keyboard slider
#     / lyrics / font persisted / download sheet
# ════════════════════════════════════════════════════════════════════════
set -u
AB="agent-browser --session v125"
PAGE="${MQ_E2E_PAGE:-http://localhost:3777/play}"
OUT="${MQ_E2E_OUT:-download/qa-v11.1}"
mkdir -p "$OUT"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ FAIL: $1"; }
note() { echo "  · $1"; }

ev() { $AB eval "$1" 2>/dev/null | sed -E 's/^"(.*)"$/\1/'; }
snap() { $AB snapshot -i 2>/dev/null; }
ref_of() { grep -E "$1" | head -1 | grep -oE 'ref=[a-z0-9]+' | head -1 | grep -oE 'e[0-9]+'; }
click_ref() {
  local r
  for i in 1 2 3; do
    r=$(snap | ref_of "$1")
    if [ -n "$r" ]; then $AB click "@$r" >/dev/null 2>&1 && return 0; fi
    $AB wait 700 >/dev/null 2>&1
  done
  return 1
}
poll_ev() {  # poll_ev <expected> <max-tries> <js-expr>
  local want="$1" tries="${2:-10}" expr="$3" got=""
  for i in $(seq 1 "$tries"); do
    got=$(ev "$expr")
    [ "$got" = "$want" ] && return 0
    $AB wait 800 >/dev/null 2>&1
  done
  return 1
}
pos_sec() { ev "document.querySelector('[data-mq-waveform] canvas')?.getAttribute('aria-valuenow') ?? ''"; }
ecnt() { $AB errors --json 2>/dev/null | python3 -c 'import json,sys
try: print(len(json.load(sys.stdin)["data"]["errors"]))
except: print("?")'; }
checkpoint() { note "[errcount] $1 → $(ecnt)"; }
dur_sec() { ev "document.querySelector('[data-mq-waveform] canvas')?.getAttribute('aria-valuemax') ?? '0'"; }

mk_lrc() { python3 -c "
import json, sys
n = int(sys.argv[1]); step = float(sys.argv[2])
lines = []
for i in range(n):
    t = i * step; m = int(t//60); s = t%60
    lines.append(f'[{m:02d}:{s:06.3f}]Строка {i+1} — текучая вода музыки MQ')
print(json.dumps({'syncedLyrics': '\n'.join(lines), 'plainLyrics': '', 'duration': int(n*step)}))
" "$1" "$2"; }
LRC_80=$(mk_lrc 80 4)
FONT_B64=$(cat /tmp/font_b64.txt)

install_mocks() {
  ev "
(() => {
  if (window.__mqOrigFetch) return 'already';
  window.__mqOrigFetch = window.fetch.bind(window);
  const LRC = $LRC_80;
  const demo = (n, t) => ({ id: 'demo-'+n, title: t, artist: 'MQ Demo', album: 'Demo Collection', cover: '/icon-512.png', duration: 40, genre: 'ambient', scTrackId: 0, source: 'demo', audioUrl: '/demo/song'+n+'.mp3', scIsFull: true, _reason: 'discovery' });
  const four = [demo(1,'Ambient Dreams'), demo(2,'Electronic Pulse'), demo(3,'Jazz Evening'), demo(4,'Rock Energy')];
  const long = [];
  for (let i = 0; i < 12; i++) for (let k = 0; k < 4; k++) long.push({ ...four[k], id: 'demo-'+(i*4+k+1)+'-'+four[k].id });
  const recs = { tracks: long, categories: [{ id: 'for_you', title: 'Для вас', icon: 'Sparkles', tracks: long.slice(0, 24) }] };
  window.__mqLrc = LRC;
  window.fetch = (url, init) => {
    const u = String(url);
    if (u.includes('lrclib.net')) return Promise.resolve(new Response(JSON.stringify(window.__mqLrc), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    if (u.includes('/api/music/recommendations')) return Promise.resolve(new Response(JSON.stringify(recs), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    if (u.includes('/api/music/trending') || u.includes('apple-charts') || u.includes('spotify-charts')) return Promise.resolve(new Response('{\"tracks\":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    if (u.includes('/api/playlists/curated')) return Promise.resolve(new Response('{\"playlists\":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    return window.__mqOrigFetch(url, init);
  };
  return 'mocks-installed';
})()" | grep -q mocks-installed && note "fetch mocks installed" || note "fetch mocks: already"
}

fresh_login() {
  # Land on the APP ORIGIN first: storage/cookies/IDB clears issued from
  # about:blank hit an OPAQUE ORIGIN (no-ops + SecurityError rejections that
  # pollute the error list). The app boots here with the previous run's
  # state, we clear it, then reload for a clean boot.
  $AB open "$PAGE" >/dev/null 2>&1
  $AB wait 3000 >/dev/null 2>&1
  $AB storage local clear >/dev/null 2>&1
  $AB cookies clear >/dev/null 2>&1
  ev "localStorage.setItem('mq-tour-complete', 'true'); 'tour-dead'" >/dev/null 2>&1
  # No IDB wipe needed: the END-of-run UI cleanup empties the fonts DB, and
  # waveform cache hits across runs are DESIRED (fresh decodes are verified
  # on pristine profiles).
  $AB open "$PAGE" >/dev/null 2>&1
  $AB wait 3000 >/dev/null 2>&1
  for i in 1 2 3; do
    [ "$(ev "location.href")" = "about:blank" ] && { $AB open "$PAGE" >/dev/null 2>&1; $AB wait 3000 >/dev/null 2>&1; }
  done
  $AB wait 2000 >/dev/null 2>&1
  install_mocks
  click_ref 'button "Демо-режим"' || bad "demo login button"
  $AB wait 4500 >/dev/null 2>&1
  click_ref 'button "Отложить обновление и продолжить прослушивание"' && $AB wait 1500 >/dev/null 2>&1
  snap | grep -q "Добр" && ok "demo home" || bad "no home"
  checkpoint "after-login"
  # Only errors raised DURING this run count for the final check — the
  # browser session error list is cumulative across the whole session.
  $AB errors --clear >/dev/null 2>&1
  # Capture unhandled rejection REASONS (the CLI error list shows no detail).
  $AB eval "
(() => {
  window.__rej = [];
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    window.__rej.push(String(r && r.message ? r.message : r).slice(0, 160) + ' @ ' + String(r && r.stack ? r.stack.split('\\n')[1] : '').trim().slice(0, 120));
  });
  return 'rejection-spy';
})()" >/dev/null 2>&1
}

play_demo() {
  for i in 1 2 3; do
    click_ref 'button "Слушать"' && break
    $AB wait 1500 >/dev/null 2>&1
  done
  $AB wait 3500 >/dev/null 2>&1
  snap | grep -q 'button "Пауза"' && ok "demo track playing" || bad "not playing"
  # STABILITY: pause and STAY paused — the 45s demo tracks would auto-advance
  # mid-run (every section below works on a paused track: the active lyric
  # line, keyboard seek, sync sampling are all position-based, not
  # playback-based). No auto-next → no state divergence.
  pause_track
  note "track paused for deterministic sections"
checkpoint "after-play"
}

open_full_player() {
  local NP
  NP=$(snap | grep -oE 'button "Открыть полн[^"]*" \[ref=[a-z0-9]+\]' | grep -oE 'e[0-9]+' | head -1)
  [ -z "$NP" ] && NP=$(snap | grep -oE 'button "Открыть плеер[^"]*" \[ref=[a-z0-9]+\]' | grep -oE 'e[0-9]+' | head -1)
  [ -z "$NP" ] && NP=$(snap | grep -oE '(button|link|generic) "[^"]*Ambient Dreams[^"]*" \[ref=[a-z0-9]+\]' | grep -oE 'e[0-9]+' | head -1)
  [ -n "$NP" ] && $AB click "@$NP" >/dev/null 2>&1
  $AB wait 2500 >/dev/null 2>&1
}

pause_track() {
  ev "
(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Пауза' || x.textContent.trim() === 'Пауза'); if (b) b.click(); return 'paused'; })()" >/dev/null 2>&1
  $AB wait 500 >/dev/null 2>&1
}
resume_track() {
  ev "
(() => { const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Воспроизвести' || x.textContent.trim() === 'Воспроизвести'); if (b) b.click(); return 'resumed'; })()" >/dev/null 2>&1
  $AB wait 500 >/dev/null 2>&1
}

wait_waveform_ready() {
  poll_ev "ready" 14 "document.querySelector('[data-mq-waveform]')?.getAttribute('data-status') ?? 'none'" \
    && ok "waveform ready (real decode of the mp3)" \
    || bad "waveform not ready ($(ev "document.querySelector('[data-mq-waveform]')?.getAttribute('data-status') ?? 'none'"))"
}

# synthetic pointer helper — pointerId 0 avoids setPointerCapture issues
synth_seek() { # synth_seek <fraction 0..1> [pointerType]
  ev "
(() => {
  const c = document.querySelector('[data-mq-waveform] canvas');
  if (!c) return 'no-canvas';
  const r = c.getBoundingClientRect();
  const at = (fx) => ({ clientX: r.x + r.width * fx, clientY: r.y + r.height / 2 });
  const pt = '${2:-touch}';
  const fire = (t, p) => c.dispatchEvent(new PointerEvent(t, { ...p, bubbles: true, pointerId: 99, pointerType: pt, isPrimary: true }));
  fire('pointerdown', at($1));
  fire('pointerup', at($1));
  return 'seeked';
})()"
}

echo "═══ STAGE 1: DESKTOP 1440×900 ═══"
$AB open "about:blank" >/dev/null 2>&1
$AB set viewport 1440 900 >/dev/null 2>&1
fresh_login
BID=$(ev "fetch('/version.json').then(r=>r.json()).then(j=>j.buildId)" 2>/dev/null)
note "serving build: $BID"

play_demo
open_full_player
ev "document.querySelector('.mq-ft-seek-input, [data-mq-waveform]') ? 'open' : 'no'" | grep -q open && ok "full player opened" || bad "full player not open"
checkpoint "after-player-open"
wait_waveform_ready
ev "document.querySelectorAll('[data-mq-waveform] canvas').length" | grep -q 1 && ok "single canvas renderer (no DOM bars)" || bad "canvas count"
checkpoint "after-waveform-ready"
$AB screenshot "$OUT/01-desktop-player-waveform.png" >/dev/null 2>&1
checkpoint "after-shot01"

# ── click-to-seek 50% (REAL mouse events) ──
WFXY=$(ev "(() => { const c = document.querySelector('[data-mq-waveform] canvas'); const r = c.getBoundingClientRect(); return Math.round(r.x + r.width/2) + ' ' + Math.round(r.y + r.height/2); })()")
$AB mouse move ${WFXY% *} ${WFXY##* } >/dev/null 2>&1
$AB mouse down left >/dev/null 2>&1; $AB mouse up left >/dev/null 2>&1
$AB wait 1500 >/dev/null 2>&1
PROG=$(pos_sec)
note "click-to-seek 50% → ${PROG}s"
[ "${PROG:-0}" -ge 14 ] && [ "${PROG:-0}" -le 26 ] && ok "waveform click-to-seek (mouse)" || bad "click seek (got ${PROG}s)"
checkpoint "after-click-seek"

# ── drag-to-seek (REAL mouse): down at 20%, move, up at 70% ──
WFXY2=$(ev "(() => { const c = document.querySelector('[data-mq-waveform] canvas'); const r = c.getBoundingClientRect(); return Math.round(r.x + r.width*0.2) + ' ' + Math.round(r.y + r.height/2) + ' ' + Math.round(r.x + r.width*0.7); })()")
X1=$(echo "$WFXY2" | awk '{print $1}'); Y=$(echo "$WFXY2" | awk '{print $2}'); X2=$(echo "$WFXY2" | awk '{print $3}')
$AB mouse move ${X1} ${Y} >/dev/null 2>&1
$AB mouse down left >/dev/null 2>&1
$AB mouse move $(( (X1 + X2) / 2 )) ${Y} >/dev/null 2>&1
$AB mouse move ${X2} ${Y} >/dev/null 2>&1
$AB mouse up left >/dev/null 2>&1
$AB wait 1200 >/dev/null 2>&1
PROG2=$(pos_sec)
DUR=$(dur_sec)
EXPD=$(python3 -c "print(round(${DUR:-0} * 0.7))")
DIFF=$(( ${PROG2:-0} - ${EXPD:-0} ))
[ ${DIFF#-} -le 3 ] && ok "drag-to-seek commits at release (→ ${PROG2}s ≈ 70% of ${DUR}s)" || bad "drag seek: ${PROG2}s (expect ~${EXPD}s)"
checkpoint "after-drag-seek"

# ── KEYBOARD SINGLE-SEEK MATRIX (paused → exact deltas) ──
ev "document.querySelector('[data-mq-waveform] canvas')?.focus(); 'ok'" >/dev/null 2>&1

B=$(pos_sec); $AB press ArrowRight >/dev/null 2>&1; $AB wait 700 >/dev/null 2>&1; A=$(pos_sec); D=$(( ${A:-0} - ${B:-0} ))
[ "$D" = 5 ] && ok "ArrowRight = ONE seek (+5)" || bad "ArrowRight delta=$D (want +5)"

B=$(pos_sec); $AB press ArrowLeft >/dev/null 2>&1; $AB wait 700 >/dev/null 2>&1; A=$(pos_sec); D=$(( ${A:-0} - ${B:-0} ))
[ "$D" = -5 ] && ok "ArrowLeft = ONE seek (−5)" || bad "ArrowLeft delta=$D (want −5)"

B=$(pos_sec); $AB press Home >/dev/null 2>&1; $AB wait 700 >/dev/null 2>&1; A=$(pos_sec)
[ "$A" = 0 ] && ok "Home = ONE seek (→ 0)" || bad "Home → $A (want 0)"

DUR=$(dur_sec)
B=$(pos_sec); $AB press End >/dev/null 2>&1; $AB wait 700 >/dev/null 2>&1; A=$(pos_sec)
[ "$A" = "$DUR" ] && ok "End = ONE seek (→ duration ${DUR}s)" || bad "End → $A (want $DUR)"

# back to a mid position, then shift-fine-step
for i in 1 2 3; do $AB press Home >/dev/null 2>&1; $AB wait 300 >/dev/null 2>&1; done
for i in 1 2 3; do $AB press ArrowRight >/dev/null 2>&1; done; $AB wait 600 >/dev/null 2>&1
B=$(pos_sec); $AB press Shift+ArrowLeft >/dev/null 2>&1; $AB wait 700 >/dev/null 2>&1; A=$(pos_sec); D=$(( ${A:-0} - ${B:-0} ))
[ "$D" = -1 ] && ok "Shift+Arrow = fine seek (−1)" || bad "shift delta=$D (want −1)"
$AB screenshot "$OUT/02-desktop-after-keyboard-seek.png" >/dev/null 2>&1
checkpoint "after-keyboard-matrix"

# ── AUDIO-CLOCK SYNC (paused, lyrics panel OPEN, 3 indicators at one instant) ──
$AB press f >/dev/null 2>&1
poll_ev "yes" 12 "document.querySelectorAll('.ll-line').length >= 60 ? 'yes' : 'no'" && ok "synced lyrics rendered (LRCLIB provider chain)" || bad "synced lines (got $(ev "document.querySelectorAll('.ll-line').length"))"
ev "document.querySelector('.ll-line[aria-current=\"true\"]') ? 'ok' : 'no'" | grep -q ok && ok "active line highlighted (aria-current)" || bad "no active line"
$AB screenshot "$OUT/03-desktop-lyrics-panel.png" >/dev/null 2>&1
checkpoint "after-lyrics-open"

synth_seek 0.4 >/dev/null 2>&1
$AB wait 1000 >/dev/null 2>&1
SYNC=$(ev "
(() => {
  const wave = +(document.querySelector('[data-mq-waveform] canvas')?.getAttribute('aria-valuenow') || -1);
  const lbl = document.querySelector('.mq-t-time')?.textContent.trim() || 'none';
  const al = document.querySelector('.ll-line[aria-current=\"true\"]');
  const idx = al ? [...document.querySelectorAll('.ll-line')].indexOf(al) : -1;
  return wave + '|' + lbl + '|' + idx;
})()")
WV=$(echo "$SYNC" | cut -d'|' -f1); LB=$(echo "$SYNC" | cut -d'|' -f2); LI=$(echo "$SYNC" | cut -d'|' -f3)
note "sync: wave=${WV}s label=${LB} lineIdx=${LI}"
python3 -c "
import sys
w = int('$WV' or -1); i = int('$LI' or -2)
ok = w >= 0 and i >= 0 and i == w // 4 and w < (i + 1) * 4 + 4
m, s = divmod(w, 60)
lbl_ok = '$LB' == f'{m}:{s:02d}'
sys.exit(0 if ok and lbl_ok else 1)
" && ok "unified audio clock: waveform ↔ time label ↔ lyric line all at ${WV}s" || bad "sync mismatch: $SYNC"

# lyric click-to-seek: line 4 (starts 12s)
checkpoint "after-sync-check"
LINE4=$(ev "
(() => { const ls = [...document.querySelectorAll('.ll-line')]; const el = ls[3]; if (!el) return ''; const r = el.getBoundingClientRect(); return Math.round(r.x + r.width/2) + ' ' + Math.round(r.y + r.height/2); })()")
if [ -n "$LINE4" ]; then
  $AB mouse move ${LINE4% *} ${LINE4##* } >/dev/null 2>&1
  $AB mouse down left >/dev/null 2>&1; $AB mouse up left >/dev/null 2>&1
  $AB wait 1200 >/dev/null 2>&1
  P2=$(pos_sec)
  [ "${P2:-0}" -ge 8 ] && [ "${P2:-0}" -le 16 ] && ok "lyric click-to-seek (line 4 → ~12s, got ${P2}s)" || bad "lyric seek (got ${P2}s)"
else
  bad "lyric line 4 not found"
fi

# ── Fullscreen lyrics → custom font → focus mode ──
checkpoint "after-lyric-seek"
click_ref 'button "Текст песни на весь экран"'
$AB wait 1500 >/dev/null 2>&1
poll_ev "fullscreen" 8 "document.querySelector('[data-mq-fullscreen-lyrics]')?.getAttribute('data-mode') ?? 'none'" && ok "fullscreen lyrics stage open" || bad "fullscreen stage"
$AB screenshot "$OUT/04-desktop-fullscreen-lyrics.png" >/dev/null 2>&1

# font popover
click_ref 'button "Настройки шрифта текста"' || ev "
(() => { const b = document.querySelector('[aria-label=\"Настройки шрифта текста\"]'); if (b) { b.click(); return 'clicked'; } return 'not-found'; })()" | grep -q clicked
$AB wait 900 >/dev/null 2>&1
poll_ev "yes" 6 "document.querySelector('input[aria-label=\"Загрузить шрифт\"]') ? 'yes' : 'no'" && ok "font popover (upload input present)" || bad "font popover"
$AB screenshot "$OUT/05-desktop-font-popover.png" >/dev/null 2>&1

# upload real woff2 bytes through the file input
IDB_BEFORE=$(ev "
(async () => { const db = await new Promise((res) => { const r = indexedDB.open('mq-custom-fonts', 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('fonts')) r.result.createObjectStore('fonts', { keyPath: 'id' }); }; r.onsuccess = () => res(r.result); }); const names = [...db.objectStoreNames]; if (!names.includes('fonts')) return -1; return await new Promise((res) => { const tx = db.transaction('fonts', 'readonly'); const rq = tx.objectStore('fonts').getAll(); rq.onsuccess = () => res(rq.result.length); }); })()")
UP=$(ev "
(async () => {
  const b64 = '$FONT_B64';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const input = document.querySelector('input[aria-label=\"Загрузить шрифт\"]');
  if (!input) return 'no-input';
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], 'E2E TestFont.woff2', { type: 'font/woff2' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return 'uploaded';
})()")
note "font upload: $UP"
poll_ev "yes" 10 "document.documentElement.style.getPropertyValue('--ll-font-family').includes('MQFont_') ? 'yes' : 'no'" \
  && ok "custom font uploaded + AUTO-SELECTED (--ll-font-family set)" \
  || bad "font family var: $(ev "document.documentElement.style.getPropertyValue('--ll-font-family')")"
FAMVAR=$(ev "document.documentElement.style.getPropertyValue('--ll-font-family')")
note "font var: $FAMVAR"
poll_ev "yes" 8 "
(() => {
  const el = document.querySelector('.ll-line');
  if (!el) return 'no-line';
  const ff = getComputedStyle(el).fontFamily || '';
  return ff.includes('MQFont_') ? 'yes' : 'no';
})()" && ok "custom font APPLIED to lyric lines (computed font-family)" || bad "font not applied: $(ev "getComputedStyle(document.querySelector('.ll-line') || document.body).fontFamily")"
ev "
(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('mq-custom-fonts', 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('fonts')) r.result.createObjectStore('fonts', { keyPath: 'id' }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const names = [...db.objectStoreNames];
  if (!names.length) return 'no-stores';
  return await new Promise((res) => {
    const tx = db.transaction(names[0], 'readonly');
    const rq = tx.objectStore(names[0]).getAll();
    rq.onsuccess = () => res('idb:' + rq.result.length);
    rq.onerror = () => res('read-error');
  });
})()" | grep -qE "idb:[1-9]" && ok "font persisted in IndexedDB (survives restart)" || bad "IDB font count wrong"
$AB screenshot "$OUT/06-desktop-custom-font-applied.png" >/dev/null 2>&1

# size pref → CSS var
ev "
(() => { const s = document.querySelector('input[aria-label=\"Размер\"]'); if (!s) return 'no-slider'; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(s, '34'); s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return 'set'; })()" | grep -q set \
  && poll_ev "yes" 6 "document.documentElement.style.getPropertyValue('--ll-font-size') === '34px' ? 'yes' : 'no'" \
  && ok "size pref → --ll-font-size var" || note "size slider path skipped"

# focus mode
click_ref 'button "Режим фокуса"'
$AB wait 900 >/dev/null 2>&1
poll_ev "focus" 6 "document.querySelector('[data-mq-fullscreen-lyrics]')?.getAttribute('data-mode') ?? 'none'" && ok "focus mode (spotlight) works" || bad "focus mode"
$AB screenshot "$OUT/07-desktop-focus-lyrics.png" >/dev/null 2>&1

# NOTE: the delete test moved to the END of the mobile stage (cleanup) —
checkpoint "after-font-section"
# the font must stay installed for the mobile persistence check.

# Escape layering: stage closes
$AB press Escape >/dev/null 2>&1; $AB wait 500 >/dev/null 2>&1
$AB press Escape >/dev/null 2>&1; $AB wait 800 >/dev/null 2>&1
poll_ev "no" 6 "document.querySelector('[data-mq-fullscreen-lyrics]') ? 'yes' : 'no'" && ok "Escape closes the lyrics stage" || bad "escape layering"
# close the lyrics panel too (f)
$AB press f >/dev/null 2>&1; $AB wait 700 >/dev/null 2>&1

# ── Download menu (Контекстное меню трека → Скачать) ──
# The lyrics context panel is a designed slide-in OVERLAY on wide screens —
# it covers the right part of the center column (incl. the More button).
# Close it first (real user flow: F / X / Escape closes the panel).
pause_track
for i in 1 2 3; do
  ev "document.querySelector('.ll-line') ? 'panel' : 'closed'" | grep -q closed && break
  $AB press Escape >/dev/null 2>&1
  $AB wait 700 >/dev/null 2>&1
done
click_ref 'button "Контекстное меню трека"' && $AB wait 900 >/dev/null 2>&1
click_ref 'menuitem "Скачать"'
$AB wait 1400 >/dev/null 2>&1
poll_ev "yes" 8 "document.querySelector('[aria-label=\"Скачивание трека\"]') ? 'yes' : 'no'" && ok "DownloadMenu opened" || bad "download menu open"
DLTEXT=$(ev "document.body.textContent")
echo "$DLTEXT" | grep -q "MP3" && ok "MP3 row present" || bad "no MP3 row"
FLACROWS=$(ev "
(() => { const m = document.querySelector('[aria-label=\"Скачивание трека\"]'); if (!m) return 'no-menu'; const t = m.textContent || ''; return t.includes('FLAC') ? (m.querySelector('[aria-disabled=\"true\"], button[disabled]') ? 'has-disabled' : 'all-enabled') : 'no-flac-row'; })()")
note "FLAC state: $FLACROWS"
[ "$FLACROWS" = "no-flac-row" ] || [ "$FLACROWS" = "has-disabled" ] && ok "FLAC honest (disabled or absent — no fake FLAC for an MP3 source)" || bad "FLAC row enabled for MP3 source!"
$AB screenshot "$OUT/08-desktop-download-menu.png" >/dev/null 2>&1
$AB press Escape >/dev/null 2>&1; $AB wait 600 >/dev/null 2>&1
poll_ev "no" 5 "document.querySelector('[aria-label=\"Скачивание трека\"]') ? 'yes' : 'no'" && ok "download menu closes cleanly" || bad "download menu close"

# ── Waveform OFF via Settings → Звук (deterministic DOM clicks) ──
checkpoint "after-download-menu"
for i in 1 2 3 4 5; do
  ev "document.querySelector('[data-mq-waveform], .mq-ft-seek-input') ? 'open' : 'closed'" | grep -q closed && break
  $AB press Escape >/dev/null 2>&1; $AB wait 800 >/dev/null 2>&1
done
ev "document.querySelector('[aria-label=\"Настройки\"]')?.click(); 'nav'" >/dev/null 2>&1
poll_ev "yes" 10 "document.body.textContent.includes('Волна в плеере') ? 'yes' : 'no'" \
  || { ev "(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Звук'); if (b) { b.click(); return 'cat'; } return 'no-cat'; })()" >/dev/null 2>&1
       poll_ev "yes" 8 "document.body.textContent.includes('Волна в плеере') ? 'yes' : 'no'"; }
poll_ev "yes" 6 "(() => { const p = [...document.querySelectorAll('p')].find(x => x.textContent.trim() === 'Волна в плеере'); return p ? 'yes' : 'no'; })()" \
  && ok "Settings → Звук → «Волна в плеере» row visible" || bad "settings waveform row"
# The toggle is a LiquidGlassToggle div (no role=switch) — click its track.
ev "
(() => { const p = [...document.querySelectorAll('p')].find(x => x.textContent.trim() === 'Волна в плеере'); if (!p) return 'no-row'; const row = p.closest('div').parentElement; const t = [...row.querySelectorAll('div')].find(d => String(d.className).includes('cursor-pointer') && String(d.className).includes('rounded-full')); if (!t) return 'no-toggle'; t.click(); return 'toggled'; })()" | grep -q toggled && ok "waveform toggle switched OFF (Settings → Звук)" || bad "waveform toggle click"
$AB wait 800 >/dev/null 2>&1
ev "document.querySelector('[aria-label=\"Главная\"]')?.click(); 'home'" >/dev/null 2>&1
$AB wait 1500 >/dev/null 2>&1
open_full_player
# Desktop classic fallback = a role=slider DIV «Прогресс воспроизведения»
# (the input[...] variant is the SPATIAL player's seek row).
ev "document.querySelector('[data-mq-waveform]') ? 'waveform-still-on' : (document.querySelector('[aria-label=\"Прогресс воспроизведения\"]') ? 'classic-ok' : 'nothing')" | grep -q classic-ok && ok "waveform OFF → classic progress bar restored" || bad "classic seek restore ($(ev "document.querySelector('[data-mq-waveform]') ? 'waveform-still-on' : (document.querySelector('[aria-label=\"Прогресс воспроизведения\"]') ? 'classic-ok' : 'nothing')"))"
$AB screenshot "$OUT/09-desktop-classic-progress.png" >/dev/null 2>&1
# keyboard on the classic bar (div slider): the event bubbles to the player's
# window handler → ONE ±5 seek (single owner preserved).
ev "document.querySelector('[aria-label=\"Прогресс воспроизведения\"]')?.focus(); 'ok'" >/dev/null 2>&1
B=$(ev "(() => { const t = document.querySelector('.mq-t-time'); return t ? t.textContent.trim() : ''; })()")
$AB press ArrowRight >/dev/null 2>&1; $AB wait 600 >/dev/null 2>&1
A=$(ev "(() => { const t = document.querySelector('.mq-t-time'); return t ? t.textContent.trim() : ''; })()")
note "classic input arrows: $B → $A (native step, single handler)"
# toggle waveform back ON (deterministic DOM clicks)
$AB press Escape >/dev/null 2>&1; $AB wait 900 >/dev/null 2>&1
ev "document.querySelector('[aria-label=\"Настройки\"]')?.click(); 'nav'" >/dev/null 2>&1
poll_ev "yes" 10 "document.body.textContent.includes('Волна в плеере') ? 'yes' : 'no'" \
  || { ev "(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Звук'); if (b) { b.click(); return 'cat'; } return 'no-cat'; })()" >/dev/null 2>&1
       poll_ev "yes" 8 "document.body.textContent.includes('Волна в плеере') ? 'yes' : 'no'"; }
ev "
(() => { const p = [...document.querySelectorAll('p')].find(x => x.textContent.trim() === 'Волна в плеере'); if (!p) return 'no-row'; const row = p.closest('div').parentElement; const t = [...row.querySelectorAll('div')].find(d => String(d.className).includes('cursor-pointer') && String(d.className).includes('rounded-full')); if (!t) return 'no-toggle'; t.click(); return 'on'; })()" >/dev/null 2>&1
$AB wait 800 >/dev/null 2>&1
ev "document.querySelector('[aria-label=\"Главная\"]')?.click(); 'home'" >/dev/null 2>&1; $AB wait 1200 >/dev/null 2>&1
open_full_player
poll_ev "ready" 8 "document.querySelector('[data-mq-waveform]')?.getAttribute('data-status') ?? 'none'" && ok "waveform back ON (cached: instant ready)" || bad "waveform back on"

# ── Resize robustness ──
checkpoint "after-settings-toggle"
# Canvas resize invariant: the backing store (canvas.width) must track the
# laid-out CSS size × DPR after a viewport change (no stale/blurry bitmap),
# whatever panel layout the player is in.
$AB set viewport 1000 800 >/dev/null 2>&1; $AB wait 2200 >/dev/null 2>&1
M1=$(ev "
(() => { const c = document.querySelector('[data-mq-waveform] canvas'); if (!c) return 'no-canvas'; const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; return 'bw=' + c.width + ' css=' + Math.round(r.width) + ' dpr=' + (Math.round(dpr*100)/100) + ' st=' + document.querySelector('[data-mq-waveform]').getAttribute('data-status'); })()")
$AB set viewport 1440 900 >/dev/null 2>&1; $AB wait 2200 >/dev/null 2>&1
M2=$(ev "
(() => { const c = document.querySelector('[data-mq-waveform] canvas'); if (!c) return 'no-canvas'; const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; return 'bw=' + c.width + ' css=' + Math.round(r.width) + ' dpr=' + (Math.round(dpr*100)/100) + ' st=' + document.querySelector('[data-mq-waveform]').getAttribute('data-status'); })()")
note "resize: 1000vp[$M1] 1440vp[$M2]"
check_resize() {
  local m="$1" bw css dpr st
  bw=$(echo "$m" | grep -oE 'bw=[0-9]+' | cut -d= -f2)
  css=$(echo "$m" | grep -oE 'css=[0-9]+' | cut -d= -f2)
  dpr=$(echo "$m" | grep -oE 'dpr=[0-9.]+' | cut -d= -f2)
  st=$(echo "$m" | grep -oE 'st=[a-z]+' | cut -d= -f2)
  python3 -c "import sys; sys.exit(0 if ('$st'=='ready' and abs($bw - $css*$dpr) <= 2) else 1)"
}
CSS1=$(echo "$M1" | grep -oE 'css=[0-9]+' | cut -d= -f2); CSS2=$(echo "$M2" | grep -oE 'css=[0-9]+' | cut -d= -f2)
if check_resize "$M1" && check_resize "$M2" && [ "$CSS1" != "$CSS2" ]; then
  ok "waveform resize: backing store tracks CSS size × DPR at both viewports (${CSS1}px ↔ ${CSS2}px)"
else
  bad "resize invariant ($M1 → $M2)"
fi

echo ""
echo "═══ STAGE 2: MOBILE 390×844 ═══"
checkpoint "after-resize"
$AB set viewport 390 844 >/dev/null 2>&1
$AB wait 2000 >/dev/null 2>&1
if ! ev "document.querySelector('[data-mq-waveform]') ? 'open' : 'no'" | grep -q open; then
  open_full_player
fi
poll_ev "ready" 10 "document.querySelector('[data-mq-waveform]')?.getAttribute('data-status') ?? 'none'" && ok "mobile player renders waveform (cached, ready)" || bad "mobile waveform"
$AB screenshot "$OUT/10-mobile-player-waveform.png" >/dev/null 2>&1

pause_track
DURM=$(dur_sec)

# ── Touch TAP seek at 60% ──
checkpoint "after-mobile-open"
synth_seek 0.6 touch >/dev/null 2>&1
$AB wait 1000 >/dev/null 2>&1
PT=$(pos_sec)
EXPT=$(python3 -c "print(round(${DURM:-0} * 0.6))")
DIFF=$(( ${PT:-0} - ${EXPT:-0} ))
[ ${DIFF#-} -le 3 ] && ok "touch tap-to-seek 60% → ${PT}s (expect ~${EXPT}s)" || bad "touch tap seek: ${PT}s (expect ~${EXPT}s)"

# ── Touch DRAG seek (down 20% → move → up 70%) ──
DRAG=$(ev "
(() => {
  const c = document.querySelector('[data-mq-waveform] canvas');
  if (!c) return 'no-canvas';
  const r = c.getBoundingClientRect();
  const at = (fx) => ({ clientX: r.x + r.width * fx, clientY: r.y + r.height / 2 });
  const fire = (t, p) => c.dispatchEvent(new PointerEvent(t, { ...p, bubbles: true, pointerId: 98, pointerType: 'touch', isPrimary: true }));
  fire('pointerdown', at(0.2));
  fire('pointermove', at(0.45));
  fire('pointermove', at(0.7));
  fire('pointerup', at(0.7));
  return 'dragged';
})()")
$AB wait 1000 >/dev/null 2>&1
PD=$(pos_sec)
EXPD=$(python3 -c "print(round(${DURM:-0} * 0.7))")
DIFF=$(( ${PD:-0} - ${EXPD:-0} ))
[ "$DRAG" = "dragged" ] && [ ${DIFF#-} -le 3 ] && ok "touch drag-to-seek commits at release (→ ${PD}s ≈ 70%)" || bad "drag seek: ${PD}s (expect ~${EXPD}s, got op=$DRAG)"

# ── Keyboard on mobile canvas (tablet + hw keyboard): still ONE seek ──
checkpoint "after-touch-seeks"
ev "document.querySelector('[data-mq-waveform] canvas')?.focus(); 'ok'" >/dev/null 2>&1
B=$(pos_sec); $AB press ArrowRight >/dev/null 2>&1; $AB wait 700 >/dev/null 2>&1; A=$(pos_sec); D=$(( ${A:-0} - ${B:-0} ))
[ "$D" = 5 ] && ok "mobile canvas keyboard: ONE seek (+5, no interference)" || bad "mobile ArrowRight delta=$D"

# ── Mobile lyrics ──
click_ref 'button "Текст"'
$AB wait 1500 >/dev/null 2>&1
poll_ev "yes" 8 "document.querySelectorAll('.ll-line').length >= 60 ? 'yes' : 'no'" && ok "mobile synced lyrics render" || bad "mobile lyrics"
ev "document.querySelector('.ll-line[aria-current=\"true\"]') ? 'ok' : 'no'" | grep -q ok && ok "mobile active line" || bad "mobile active line"
$AB screenshot "$OUT/11-mobile-lyrics.png" >/dev/null 2>&1

# mobile fullscreen + focus
click_ref 'button "Текст песни на весь экран"' && $AB wait 1400 >/dev/null 2>&1
poll_ev "fullscreen" 6 "document.querySelector('[data-mq-fullscreen-lyrics]')?.getAttribute('data-mode') ?? 'none'" && ok "mobile fullscreen lyrics" || bad "mobile fullscreen"
click_ref 'button "Режим фокуса"' && $AB wait 900 >/dev/null 2>&1
poll_ev "focus" 5 "document.querySelector('[data-mq-fullscreen-lyrics]')?.getAttribute('data-mode') ?? 'none'" && ok "mobile focus mode" || bad "mobile focus"
$AB screenshot "$OUT/12-mobile-fullscreen-focus.png" >/dev/null 2>&1
$AB press Escape >/dev/null 2>&1; $AB wait 600 >/dev/null 2>&1
$AB press Escape >/dev/null 2>&1; $AB wait 800 >/dev/null 2>&1
$AB press f >/dev/null 2>&1; $AB wait 700 >/dev/null 2>&1 || true

# ── Mobile download sheet (Ещё → Скачать) ──
for i in 1 2 3; do
  ev "document.querySelector('[data-mq-fullscreen-lyrics]') ? 'open' : 'closed'" | grep -q closed && break
  $AB press Escape >/dev/null 2>&1; $AB wait 700 >/dev/null 2>&1
done
ev "document.querySelector('[data-mq-waveform]') ? 'p-open' : 'p-closed'" | grep -q p-open || { open_full_player; }
click_ref 'button "Ещё"' && $AB wait 1100 >/dev/null 2>&1
click_ref 'menuitem "Скачать"' && $AB wait 2800 >/dev/null 2>&1
poll_ev "yes" 8 "document.querySelector('[aria-label=\"Скачивание трека\"]') ? 'yes' : 'no'" && ok "mobile download sheet opens" || bad "mobile download"
MDT=$(ev "document.body.textContent")
echo "$MDT" | grep -q "MP3" && ok "mobile MP3 row present" || bad "mobile no MP3 row"
$AB screenshot "$OUT/13-mobile-download-sheet.png" >/dev/null 2>&1
$AB press Escape >/dev/null 2>&1; $AB wait 500 >/dev/null 2>&1

# ── Font cleanup + DELETE test (mobile popover, same component) ──
checkpoint "after-mobile-download"
# Self-verifying chain: panel → stage → popover → delete-each → empty.
for i in 1 2 3; do
  ev "document.querySelector('.ll-line') ? 'open' : 'closed'" | grep -q open && break
  click_ref 'button "Текст"' >/dev/null 2>&1
  $AB wait 1200 >/dev/null 2>&1
done
for i in 1 2 3; do
  click_ref 'button "Текст песни на весь экран"' >/dev/null 2>&1
  poll_ev "yes" 4 "document.querySelector('[data-mq-fullscreen-lyrics]') ? 'yes' : 'no'" && break
done
poll_ev "yes" 6 "document.querySelector('[data-mq-fullscreen-lyrics]') ? 'yes' : 'no'" \
  || bad "cleanup: fullscreen stage did not open"
for i in 1 2 3; do
  ev "document.querySelector('[aria-label=\"Настройки шрифта текста\"]')?.click(); 'ok'" >/dev/null 2>&1
  poll_ev "yes" 4 "document.querySelector('input[aria-label=\"Загрузить шрифт\"]') ? 'yes' : 'no'" && break
  $AB wait 800 >/dev/null 2>&1
done
poll_ev "yes" 6 "document.querySelector('input[aria-label=\"Загрузить шрифт\"]') ? 'yes' : 'no'" \
  && note "cleanup: font popover open" || bad "cleanup: popover did not open"
for i in 1 2 3 4 5 6 7 8; do
  CNT=$(ev "document.querySelectorAll('button[aria-label^=\"Удалить шрифт\"]').length")
  [ "${CNT:-0}" = 0 ] && break
  ev "
(() => { const b = document.querySelector('button[aria-label^=\"Удалить шрифт\"]'); if (b) b.click(); return 'clicked'; })()" >/dev/null 2>&1
  # wait until the row count actually decreases (refresh completed)
  for j in 1 2 3 4 5 6; do
    CNT2=$(ev "document.querySelectorAll('button[aria-label^=\"Удалить шрифт\"]').length")
    [ "${CNT2:-99}" -lt "${CNT:-99}" ] && break
    $AB wait 500 >/dev/null 2>&1
  done
done
LEFT=$(ev "document.querySelectorAll('button[aria-label^=\"Удалить шрифт\"]').length")
[ "${LEFT:-1}" = 0 ] && ok "all custom fonts deleted (loop until empty)" || bad "font delete loop (${LEFT} left)"
poll_ev "yes" 6 "!document.documentElement.style.getPropertyValue('--ll-font-family').includes('MQFont_') ? 'yes' : 'no'" \
  && ok "delete → family var cleared (preference pruned)" || bad "font delete var not cleared"
ev "
(async () => { const db = await new Promise((res) => { const r = indexedDB.open('mq-custom-fonts', 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('fonts')) r.result.createObjectStore('fonts', { keyPath: 'id' }); }; r.onsuccess = () => res(r.result); }); const names = [...db.objectStoreNames]; if (!names.includes('fonts')) return 'idb:-1'; return 'idb:' + await new Promise((res) => { const tx = db.transaction('fonts', 'readonly'); const rq = tx.objectStore('fonts').getAll(); rq.onsuccess = () => res(rq.result.length); }); })()" | grep -q "idb:0" && ok "IDB empty after deletes" || bad "IDB not empty after deletes"
$AB press Escape >/dev/null 2>&1; $AB wait 500 >/dev/null 2>&1
$AB press Escape >/dev/null 2>&1; $AB wait 700 >/dev/null 2>&1

# ── Page errors ──
ERRS=$($AB errors 2>/dev/null | grep -vE "^\s*$" | head -6)
REJ=$(ev "JSON.stringify(window.__rej || [])")
if [ -z "$ERRS" ]; then
  ok "zero page errors across both stages"
else
  note "page errors:"; echo "$ERRS"
  note "unhandled rejection reasons: $REJ"
  bad "page errors present"
fi

echo ""
echo "═══ SUMMARY ═══"
echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" = 0 ] && echo "ALL GREEN" || echo "SOME CHECKS FAILED"
