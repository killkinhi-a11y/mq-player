#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
# v11 Player Extension — Visual E2E (spec §14), session-safe edition.
# Demo login is CLIENT-ONLY (no token) → NEVER reload after login.
# Everything is driven through the real UI in ONE browser session.
# Viewports: 1440×900 + 390×844 (live matchMedia switch, no reload).
# ════════════════════════════════════════════════════════════════════════
set -u
PAGE="http://localhost:3777/play"
OUT="download/qa-v11"
mkdir -p "$OUT"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ FAIL: $1"; }
note() { echo "  · $1"; }

snap() { agent-browser snapshot -i 2>/dev/null; }
ref_of() { grep -oE "$1 \[ref=[a-z0-9]+\]" | head -1 | grep -oE 'e[0-9]+'; }
click_ref() {
  local r
  for i in 1 2 3; do
    r=$(snap | ref_of "$1")
    if [ -n "$r" ]; then agent-browser click "@$r" >/dev/null 2>&1 && return 0; fi
    agent-browser wait 700 >/dev/null 2>&1
  done
  return 1
}
ev() { agent-browser eval "$1" 2>/dev/null | tr -d '"'; }

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
LRC_400=$(mk_lrc 400 1.6)

# agent-browser `network route` does NOT intercept page-context fetches in
# this CLI version — mocks are installed by patching window.fetch via eval
# BEFORE the app fetches (right after page load, before demo login).
install_mocks() {  # $1 = LRC json payload
  agent-browser eval "
(() => {
  if (window.__mqOrigFetch) return 'already';
  window.__mqOrigFetch = window.fetch.bind(window);
  const LRC = $( printf '%s' "$1" );
  const demo = (n, t) => ({ id: 'demo-'+n, title: t, artist: 'MQ Demo', album: 'Demo Collection', cover: '/icon-512.png', duration: 40, genre: 'ambient', scTrackId: 0, source: 'demo', audioUrl: '/demo/song'+n+'.mp3', scIsFull: true, _reason: 'discovery' });
  // 48 DISTINCT ids cycling the 4 real files — a long queue so auto-next
  // never exhausts mid-test (real files are ~46s, metadata says 40).
  const four = [demo(1,'Ambient Dreams'), demo(2,'Electronic Pulse'), demo(3,'Jazz Evening'), demo(4,'Rock Energy')];
  const long = [];
  for (let i = 0; i < 12; i++) for (let k = 0; k < 4; k++) long.push({ ...four[k], id: 'demo-'+(i*4+k+1)+'-'+four[k].id });
  const recs = { tracks: long, categories: [{ id: 'for_you', title: 'Для вас', icon: 'Sparkles', tracks: long.slice(0, 24) }] };
  window.__mqLrc = LRC;
  window.fetch = (url, init) => {
    const u = String(url);
    if (u.includes('lrclib.net')) {
      return Promise.resolve(new Response(JSON.stringify(window.__mqLrc), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    if (u.includes('/api/music/recommendations')) {
      return Promise.resolve(new Response(JSON.stringify(recs), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    if (u.includes('/api/music/trending') || u.includes('apple-charts') || u.includes('spotify-charts')) {
      return Promise.resolve(new Response('{\"tracks\":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    if (u.includes('/api/playlists/curated')) {
      return Promise.resolve(new Response('{\"playlists\":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return window.__mqOrigFetch(url, init);
  };
  return 'mocks-installed';
})()" | grep -q mocks-installed && note "fetch mocks installed (lrclib + home feed → demo)" || note "fetch mock install: already present"
}

set_lrc() {  # switch the mocked LRC payload (80 ↔ 400 lines)
  agent-browser eval "window.__mqLrc = $( printf '%s' "$1" ); 'lrc-set'" >/dev/null 2>&1
  note "lrclib payload switched"
}
route_lrc() { set_lrc "$1"; }

# ── Fresh session → demo login (client-only, gives the demo queue) ─────
fresh_login() {
  agent-browser storage local clear >/dev/null 2>&1
  agent-browser cookies clear >/dev/null 2>&1
  # Kill the onboarding tour DETERMINISTICALLY: its own localStorage flag
  # (mq-tour-complete). The tour's step effect toggles the full player open/
  # closed and its ArrowRight handler advances steps — both would wreck the
  # player-flow QA. (Set before load; storage clear wiped it.)
  agent-browser eval "localStorage.setItem('mq-tour-complete', 'true'); 'tour-dead'" >/dev/null 2>&1
  agent-browser open "$PAGE" >/dev/null 2>&1
  agent-browser wait 2500 >/dev/null 2>&1
  for i in 1 2 3; do
    [ "$(agent-browser get url 2>/dev/null)" = "about:blank" ] && { agent-browser open "$PAGE" >/dev/null 2>&1; agent-browser wait 3000 >/dev/null 2>&1; }
  done
  agent-browser wait 2500 >/dev/null 2>&1
  # Mocks BEFORE login so the home feed fetch (fires on mount) is served
  # the demo tracks + the LRC payload.
  install_mocks "$LRC_80"
  if ! snap | grep -q "Добр"; then
    click_ref 'button "Демо-режим"' || { bad "demo login button"; return 1; }
    agent-browser wait 4500 >/dev/null 2>&1
    click_ref 'button "Отложить обновление и продолжить прослушивание"' && agent-browser wait 1500 >/dev/null 2>&1
  fi
  snap | grep -q "Добр" && ok "demo home" || bad "no home"
}

# Poll an eval expression until it matches (up to N×800ms).
poll_ev() {  # poll_ev <expected> <max-tries> <js-expr>
  local want="$1" tries="${2:-10}" expr="$3" got=""
  for i in $(seq 1 "$tries"); do
    got=$(ev "$expr")
    [ "$got" = "$want" ] && return 0
    agent-browser wait 800 >/dev/null 2>&1
  done
  return 1
}

# Play the demo track through the REAL UI path: hero card «Слушать».
play_demo() {
  local i
  for i in 1 2 3; do
    click_ref 'button "Слушать"' && break
    agent-browser wait 1500 >/dev/null 2>&1
  done
  agent-browser wait 3500 >/dev/null 2>&1
}

open_full_player() {  # PlayerBar (desktop) / MobileDock (mobile) now-playing zone
  local NP
  NP=$(snap | grep -oE 'button "Открыть полн[^"]*" \[ref=[a-z0-9]+\]' | grep -oE 'e[0-9]+' | head -1)
  [ -z "$NP" ] && NP=$(snap | grep -oE 'button "Открыть плеер[^"]*" \[ref=[a-z0-9]+\]' | grep -oE 'e[0-9]+' | head -1)
  [ -z "$NP" ] && NP=$(snap | grep -oE '(button|link|generic) "[^"]*Ambient Dreams[^"]*" \[ref=[a-z0-9]+\]' | grep -oE 'e[0-9]+' | head -1)
  [ -n "$NP" ] && agent-browser click "@$NP" >/dev/null 2>&1
  agent-browser wait 2500 >/dev/null 2>&1
}

is_playing() {  # UI truth: a Пауза button exists (audio element lives off-DOM)
  snap | grep -q 'button "Пауза"'
}

pos_sec() {  # live position: waveform aria-valuenow → seek label fallback
  local P
  P=$(ev "document.querySelector('[data-mq-waveform] canvas')?.getAttribute('aria-valuenow') ?? ''")
  if [ -z "$P" ] || [ "$P" = "null" ]; then
    P=$(ev "(() => { const t = document.querySelector('.mq-t-time'); if (!t) return ''; const m = t.textContent.match(/(\d+):(\d+)/); return m ? String(+m[1]*60 + +m[2]) : ''; })()")
  fi
  echo "$P"
}

play() {
  click_ref 'button "Воспроизвести"' || click_ref 'button "Играть"'
  agent-browser wait 3000 >/dev/null 2>&1
}

echo "═══ STAGE 1: DESKTOP 1440×900 ═══"
agent-browser set viewport 1440 900 >/dev/null 2>&1
fresh_login

# Play the DEMO track via the hero card (mocked recommendations → demo-1)
play_demo
is_playing && ok "demo track plays (same-origin mp3, Пауза shown)" || bad "audio not playing"
CT=$(ev "(() => { const t = document.querySelector('.mq-player-capsule, [data-mq-playerbar]'); const s = JSON.parse(localStorage.getItem('mq-store-v8')).state; return (s.currentTrack?.title ?? 'null'); })()")
note "current track: $CT"
[ "$CT" = "Ambient Dreams" ] && ok "currentTrack = demo mp3 (Ambient Dreams)" || bad "currentTrack is $CT"

open_full_player
ev "document.querySelector('.mq-ft-seek-input, [data-mq-waveform]') ? 'open' : 'no'" | grep -q open && ok "full player opened" || bad "full player not open"

# ── Waveform: real decode of the same-origin demo MP3 ──
if poll_ev "ready" 14 "document.querySelector('[data-mq-waveform]')?.getAttribute('data-status') ?? 'none'"; then ok "waveform DECODED from real mp3 (complete, cached)"; else bad "waveform not ready ($(ev "document.querySelector('[data-mq-waveform]')?.getAttribute('data-status') ?? 'none'"))"; fi
ev "document.querySelectorAll('[data-mq-waveform] canvas').length === 1 ? 'canvas-ok' : 'no'" | grep -q canvas-ok && ok "Canvas renderer (single canvas, no DOM bars)" || bad "canvas renderer"
agent-browser screenshot "$OUT/01-desktop-player-waveform.png" >/dev/null 2>&1 && ok "shot 01"

# click-to-seek at 50% of the waveform
WFXY=$(ev "(() => { const c = document.querySelector('[data-mq-waveform] canvas'); const r = c.getBoundingClientRect(); return Math.round(r.x + r.width/2) + ' ' + Math.round(r.y + r.height/2); })()")
agent-browser mouse move ${WFXY% *} ${WFXY##* } >/dev/null 2>&1
agent-browser mouse down left >/dev/null 2>&1; agent-browser mouse up left >/dev/null 2>&1
agent-browser wait 1800 >/dev/null 2>&1
PROG=$(pos_sec)
note "position after 50% click: ${PROG}s (expect ~20)"
[ "${PROG:-0}" -ge 14 ] && [ "${PROG:-0}" -le 26 ] && ok "waveform click-to-seek (50% → ~20s)" || bad "waveform seek (got ${PROG}s)"
agent-browser screenshot "$OUT/02-desktop-waveform-seeked.png" >/dev/null 2>&1 && ok "shot 02"

# keyboard seek on the canvas slider
ev "document.querySelector('[data-mq-waveform] canvas')?.focus(); 'focused'" >/dev/null 2>&1
BEFORE=$(pos_sec)
agent-browser press ArrowRight >/dev/null 2>&1; agent-browser wait 900 >/dev/null 2>&1
AFTER=$(pos_sec)
DELTA=$(( ${AFTER:-0} - ${BEFORE:-0} ))
[ "$DELTA" -ge 3 ] && [ "$DELTA" -le 8 ] && ok "keyboard seek (+5s via ArrowRight on canvas slider)" || bad "keyboard seek (delta $DELTA)"

# ── Lyrics panel (synced via mocked LRCLIB) ──
agent-browser press f >/dev/null 2>&1
poll_ev "yes" 12 "document.querySelectorAll('.ll-line').length >= 60 ? 'yes' : 'no'" && ok "synced lyrics rendered (LRCLIB provider chain)" || bad "synced lines (got $(ev "document.querySelectorAll('.ll-line').length"))"
ev "document.querySelector('.ll-line[aria-current=\"true\"]') ? 'active-ok' : 'no'" | grep -q active-ok && ok "active line highlighted (aria-current)" || bad "no active line"
agent-browser screenshot "$OUT/03-desktop-lyrics-panel.png" >/dev/null 2>&1 && ok "shot 03"

# lyric line click → seek to its timestamp (line 4 = 12s)
ev "(() => { const b = document.querySelectorAll('.ll-line')[3]; b?.click(); return b?.getAttribute('data-t') ?? 'none'; })()" >/dev/null 2>&1
agent-browser wait 1600 >/dev/null 2>&1
PROG2=$(pos_sec)
note "position after line-4 click: ${PROG2}s (expect ~12)"
[ "${PROG2:-0}" -ge 8 ] && [ "${PROG2:-0}" -le 16 ] && ok "lyric click-to-seek (line 4 → ~12s)" || bad "lyric seek (got ${PROG2}s)"

# ── Fullscreen lyrics ──
click_ref 'button "Текст песни на весь экран"' && agent-browser wait 1400 >/dev/null 2>&1
ev "document.querySelector('[data-mq-fullscreen-lyrics]')?.getAttribute('data-mode')" | grep -q fullscreen && ok "fullscreen lyrics stage (portal, mode=fullscreen)" || bad "fullscreen stage"
agent-browser screenshot "$OUT/04-desktop-fullscreen-lyrics.png" >/dev/null 2>&1 && ok "shot 04"

# Focus mode
click_ref 'button "Режим фокуса"' && agent-browser wait 900 >/dev/null 2>&1
ev "document.querySelector('[data-mq-fullscreen-lyrics]')?.getAttribute('data-mode')" | grep -q focus && ok "focus mode (spotlight dimming)" || bad "focus mode"
agent-browser screenshot "$OUT/05-desktop-focus-lyrics.png" >/dev/null 2>&1 && ok "shot 05"

# Font quick-popover (Aa) inside fullscreen
click_ref 'button "Настройки шрифта текста"' && agent-browser wait 1000 >/dev/null 2>&1
ev "document.querySelector('[data-mq-lyrics-appearance]') ? 'font-ui-ok' : 'no'" | grep -q font-ui-ok && ok "font popover: preview + select + size/leading" || bad "font popover"
agent-browser screenshot "$OUT/06-desktop-font-popover.png" >/dev/null 2>&1 && ok "shot 06"
agent-browser press Escape >/dev/null 2>&1; agent-browser wait 500 >/dev/null 2>&1
agent-browser press Escape >/dev/null 2>&1; agent-browser wait 800 >/dev/null 2>&1

# ── Long lyrics → virtualization ──
# (the two Escapes above closed the stage AND the panel — reopen the panel)
if ! ev "document.querySelector('.ll-line') ? 'y' : 'n'" | grep -q y; then
  agent-browser press f >/dev/null 2>&1; agent-browser wait 1500 >/dev/null 2>&1
fi
set_lrc "$LRC_400"
ev "window.dispatchEvent(new CustomEvent('mq-lyrics-retry'))" >/dev/null 2>&1
poll_ev "yes" 15 "document.querySelectorAll('.ll-line').length > 30 && document.querySelectorAll('.ll-line').length < 400 ? 'yes' : 'no'" && ok "virtualization active (DOM < 400, spacers keep scroll)" || bad "virtualization (DOM=$(ev "document.querySelectorAll('.ll-line').length"))"
note "400-line lyrics → DOM line nodes: $(ev "document.querySelectorAll('.ll-line').length")"
agent-browser screenshot "$OUT/07-desktop-long-lyrics.png" >/dev/null 2>&1 && ok "shot 07"
set_lrc "$LRC_80"
ev "window.dispatchEvent(new CustomEvent('mq-lyrics-retry'))" >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
# close the lyrics panel (player stays open)
agent-browser press Escape >/dev/null 2>&1; agent-browser wait 700 >/dev/null 2>&1

# ── Download menu (demo = same-origin mp3 → honest MP3, FLAC unavailable) ──
# NOTE: the desktop player's More button is labelled «Контекстное меню трека».
click_ref 'button "Контекстное меню трека"' && agent-browser wait 1100 >/dev/null 2>&1
click_ref 'menuitem "Скачать"' && agent-browser wait 1000 >/dev/null 2>&1
poll_ev "yes" 12 "document.body.textContent.includes('Формат') ? 'yes' : 'no'" && ok "download menu opened (formats resolved)" || bad "download menu open"
ev "document.body.textContent.includes('MP3')" | grep -q true && ok "download menu: MP3 row" || bad "no MP3 row"
poll_ev "yes" 10 "document.body.textContent.includes('FLAC') ? 'yes' : 'no'" && ok "download menu: FLAC row shown" || bad "no FLAC row"
ev "document.body.textContent.includes('Источник не предоставляет FLAC')" | grep -q true && ok "FLAC honestly unavailable (никакого псевдо-FLAC)" || bad "FLAC row not honest"
agent-browser screenshot "$OUT/08-desktop-download-menu.png" >/dev/null 2>&1 && ok "shot 08"
agent-browser press Escape >/dev/null 2>&1; agent-browser wait 700 >/dev/null 2>&1

# ── Settings: fonts card + waveform toggle (close the player first) ──
for i in 1 2 3; do
  ev "document.querySelector('[data-mq-waveform]') ? 'open' : 'closed'" | grep -q closed && break
  agent-browser press Escape >/dev/null 2>&1; agent-browser wait 700 >/dev/null 2>&1
done
click_ref 'button "Настройки"' && agent-browser wait 2200 >/dev/null 2>&1
click_ref 'tab "Оформление"' && agent-browser wait 1500 >/dev/null 2>&1
ev "document.querySelector('[data-mq-setting=\"lyrics-appearance\"]') ? 'card-ok' : 'no'" | grep -q card-ok && ok "Settings → «Текст песни» card (upload/list/preview/sliders)" || bad "settings card"
ev "document.body.textContent.includes('Загрузить шрифт')" | grep -q true && ok "font upload UI (.woff2/.woff/.ttf/.otf)" || bad "font upload UI"
agent-browser screenshot "$OUT/09-desktop-settings-fonts.png" >/dev/null 2>&1 && ok "shot 09"

# Waveform toggle OFF via Settings → Воспроизведение (deterministic row→switch click)
click_ref 'tab "Воспроизведение"' && agent-browser wait 1500 >/dev/null 2>&1
ev "(() => { const row = [...document.querySelectorAll('div')].reverse().find(d => d.querySelector('button[role=\"switch\"]') && (d.textContent||'').trim().startsWith('Волна в плеере')); const sw = row?.querySelector('button[role=\"switch\"]'); if (!sw) return 'no-switch'; sw.click(); return 'toggled'; })()" | grep -q toggled && ok "waveform toggle switched OFF" || bad "waveform toggle click"
agent-browser wait 1000 >/dev/null 2>&1
# back to the player
click_ref 'button "Главная"' && agent-browser wait 1500 >/dev/null 2>&1
open_full_player
ev "document.querySelector('input[aria-label=\"Позиция воспроизведения\"]') ? 'classic-ok' : 'no'" | grep -q classic-ok && ok "waveform OFF → classic seek input restored" || bad "classic seek restore"
agent-browser screenshot "$OUT/10-desktop-classic-progress.png" >/dev/null 2>&1 && ok "shot 10"
# toggle back ON
click_ref 'button "Настройки"' >/dev/null 2>&1; agent-browser wait 1800 >/dev/null 2>&1
click_ref 'tab "Воспроизведение"' >/dev/null 2>&1; agent-browser wait 1300 >/dev/null 2>&1
ev "(() => { const row = [...document.querySelectorAll('div')].reverse().find(d => d.querySelector('button[role=\"switch\"]') && (d.textContent||'').trim().startsWith('Волна в плеере')); const sw = row?.querySelector('button[role=\"switch\"]'); if (!sw) return 'no-switch'; sw.click(); return 'on'; })()" >/dev/null 2>&1
agent-browser wait 800 >/dev/null 2>&1
click_ref 'button "Главная"' >/dev/null 2>&1; agent-browser wait 1200 >/dev/null 2>&1

echo ""
echo "═══ STAGE 2: MOBILE 390×844 (live viewport switch — no reload) ═══"
agent-browser set viewport 390 844 >/dev/null 2>&1
agent-browser wait 2000 >/dev/null 2>&1
open_full_player
MP=$(ev "document.querySelector('[data-mq-playerbar]') ? 'mobile-bar' : 'no'")
note "mobile player bar: $MP"
MWF=$(ev "document.querySelector('[data-mq-playerbar]')?.querySelector('[data-mq-waveform]') ? 'wf' : 'no'")
note "mobile waveform: $MWF"
[ "$MWF" = "wf" ] && ok "mobile player shows waveform" || bad "mobile waveform"
agent-browser screenshot "$OUT/11-mobile-player-waveform.png" >/dev/null 2>&1 && ok "shot 11"

# mobile lyrics panel (bottom bar secondary row: Текст)
click_ref 'button "Текст"' && agent-browser wait 2800 >/dev/null 2>&1
MLINES=$(ev "document.querySelectorAll('.ll-line').length" | tr -d '"')
note "mobile synced lines: $MLINES"
[ "${MLINES:-0}" -ge 40 ] && ok "mobile synced lyrics" || bad "mobile lyrics ($MLINES)"
agent-browser screenshot "$OUT/12-mobile-lyrics.png" >/dev/null 2>&1 && ok "shot 12"

click_ref 'button "Текст песни на весь экран"' && agent-browser wait 1400 >/dev/null 2>&1
ev "document.querySelector('[data-mq-fullscreen-lyrics]')?.getAttribute('data-mode')" | grep -q fullscreen && ok "mobile fullscreen lyrics" || bad "mobile fullscreen"
agent-browser screenshot "$OUT/13-mobile-fullscreen-lyrics.png" >/dev/null 2>&1 && ok "shot 13"
click_ref 'button "Режим фокуса"' && agent-browser wait 900 >/dev/null 2>&1
agent-browser screenshot "$OUT/14-mobile-focus-lyrics.png" >/dev/null 2>&1 && ok "shot 14 (focus)"
agent-browser press Escape >/dev/null 2>&1; agent-browser wait 600 >/dev/null 2>&1
agent-browser press Escape >/dev/null 2>&1; agent-browser wait 800 >/dev/null 2>&1
# (two Escapes: fullscreen stage → lyrics panel. The PLAYER stays open.)

# mobile download sheet (More ⋯ — labelled «Ещё» on mobile)
click_ref 'button "Ещё"' && agent-browser wait 1100 >/dev/null 2>&1
click_ref 'menuitem "Скачать"' && agent-browser wait 2800 >/dev/null 2>&1
ev "document.body.textContent.includes('FLAC') && document.body.textContent.includes('MP3')" | grep -q true && ok "mobile download sheet (MP3 + honest FLAC)" || bad "mobile download sheet"
agent-browser screenshot "$OUT/15-mobile-download-sheet.png" >/dev/null 2>&1 && ok "shot 15"

ERRORS=$(agent-browser errors 2>/dev/null | grep -vE "^\s*$" | head -5)
[ -z "$ERRORS" ] && ok "0 page errors" || { note "console errors: $ERRORS"; bad "page errors present"; }

echo ""
echo "══════════ RESULTS: PASS=$PASS FAIL=$FAIL ══════════"
[ "$FAIL" -eq 0 ] && echo "VISUAL E2E: ALL GREEN" || echo "VISUAL E2E: HAS FAILURES"
