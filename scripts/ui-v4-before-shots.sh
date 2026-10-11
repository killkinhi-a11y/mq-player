#!/bin/bash
# UI-V4 PHASE 0 — BEFORE screenshots (desktop 1440x900 + mobile 390x844)
# Usage: ui-v4-before-shots.sh <session> <outdir>
set -u
S="${1:-mqaudit}"
OUT="${2:-download/ui-v4/screens-before}"
mkdir -p "$OUT"

nav() { # nav <ariaLabel> <shotName> [waitMs]
  agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='$1'); if(b){b.click(); return 'ok'} return 'MISS $1' })()" --session "$S" 2>&1 | tail -1
  sleep "${3:-1800}"
  agent-browser screenshot "$OUT/$2.png" --session "$S" 2>&1 | tail -1
}

wait_page() {
  agent-browser wait 2200 --session "$S" 2>&1 | tail -1
}

echo "== DESKTOP 1440x900 =="
agent-browser set viewport 1440 900 --session "$S" 2>&1 | tail -1
wait_page
agent-browser screenshot "$OUT/01-home-desktop.png" --session "$S" 2>&1 | tail -1
agent-browser scroll down 900 --session "$S" 2>&1 | tail -1
sleep 400
agent-browser screenshot "$OUT/01b-home-desktop-scrolled.png" --session "$S" 2>&1 | tail -1
agent-browser scroll up 5000 --session "$S" 2>&1 | tail -1

nav "Поиск" "02-search-desktop" 2500

# search with query
agent-browser eval "(() => { const i=document.querySelector('[data-search-input]'); if(i){ i.value=''; i.focus(); return 'focused' } return 'no-input' })()" --session "$S" 2>&1 | tail -1
agent-browser keyboard type "daft punk" --session "$S" 2>&1 | tail -1
wait_page
agent-browser screenshot "$OUT/02b-search-results-desktop.png" --session "$S" 2>&1 | tail -1

nav "Библиотека" "03-library-desktop" 2200
nav "Главная" "01-home-desktop-2" 1500

# Open a playlist via library tab? Keep it simple: settings + profile
nav "Настройки" "09-settings-desktop" 2500
agent-browser scroll down 800 --session "$S" 2>&1 | tail -1
sleep 400
agent-browser screenshot "$OUT/09b-settings-desktop-scrolled.png" --session "$S" 2>&1 | tail -1
agent-browser scroll up 5000 --session "$S" 2>&1 | tail -1
nav "Профиль" "10-profile-desktop" 2200
nav "Чаты" "11-messenger-desktop" 2500

# back to main, play a track to get PlayerBar
nav "Главная" "01-home-desktop-3" 1500
agent-browser eval "(() => { const c=[...document.querySelectorAll('[class*=cursor-pointer]')].filter(x=>x.querySelector('img')&&x.textContent.trim().length>3); if(c.length){ c[Math.min(6,c.length-1)].click(); return 'clicked-card-'+c.length } return 'no-cards' })()" --session "$S" 2>&1 | tail -1
wait_page
agent-browser screenshot "$OUT/05-playerbar-desktop.png" --session "$S" 2>&1 | tail -1

# Fullscreen player
agent-browser eval "(() => { const st=window.__mqProbeStore; const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('aria-label')||'').match(/развер|полный|расшир/i)); if(b){b.click(); return 'expanded'} return 'no-expand-btn' })()" --session "$S" 2>&1 | tail -1
wait_page
agent-browser screenshot "$OUT/06-fullplayer-desktop.png" --session "$S" 2>&1 | tail -1

# Lyrics in full player if button exists
agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('aria-label')||'').match(/текст|лирик|lyrics/i)); if(b){b.click(); return 'lyrics'} return 'no-lyrics-btn' })()" --session "$S" 2>&1 | tail -1
wait_page
agent-browser screenshot "$OUT/07-lyrics-desktop.png" --session "$S" 2>&1 | tail -1

# Queue panel if button exists
agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('aria-label')||'').match(/очеред/i)); if(b){b.click(); return 'queue'} return 'no-queue-btn' })()" --session "$S" 2>&1 | tail -1
wait_page
agent-browser screenshot "$OUT/08-queue-desktop.png" --session "$S" 2>&1 | tail -1

# close full player
agent-browser press Escape --session "$S" 2>&1 | tail -1
sleep 600

echo "== MOBILE 390x844 =="
agent-browser set viewport 390 844 --session "$S" 2>&1 | tail -1
nav "Главная" "20-home-mobile" 2200
agent-browser scroll down 700 --session "$S" 2>&1 | tail -1
sleep 400
agent-browser screenshot "$OUT/20b-home-mobile-scrolled.png" --session "$S" 2>&1 | tail -1
agent-browser scroll up 5000 --session "$S" 2>&1 | tail -1
nav "Поиск" "21-search-mobile" 2500
nav "Библиотека" "22-library-mobile" 2200
agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('aria-label')||'').match(/настрой/i)); if(b){b.click(); return 'ok'} return 'MISS settings' })()" --session "$S" 2>&1 | tail -1
wait_page
agent-browser screenshot "$OUT/23-settings-mobile.png" --session "$S" 2>&1 | tail -1

echo "DONE"
