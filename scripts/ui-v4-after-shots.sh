#!/bin/bash
# UI-V4 — AFTER screenshots (desktop 1440x900 + mobile 390x844)
# Usage: ui-v4-after-shots.sh <session> <outdir>
set -u
S="${1:-mqaudit}"
OUT="${2:-download/ui-v4/screens-after}"
mkdir -p "$OUT"

nav() {
  agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='$1'); if(b){b.click(); return 'ok'} return 'MISS $1' })()" --session "$S" 2>&1 | tail -1
  sleep "${3:-2200}"
}

echo "== DESKTOP 1440x900 =="
agent-browser set viewport 1440 900 --session "$S" 2>&1 | tail -1
nav "Главная" "x" 2500
agent-browser screenshot "$OUT/01-home-desktop.png" --session "$S" 2>&1 | tail -1

nav "Поиск" "x" 2500
agent-browser screenshot "$OUT/02-search-desktop.png" --session "$S" 2>&1 | tail -1
agent-browser eval "(() => { const i=document.querySelector('[data-search-input]'); if(i){ i.focus(); return 'f' } return 'no' })()" --session "$S" 2>&1 | tail -1
agent-browser keyboard type "zzqqxx" --session "$S" 2>&1 | tail -1
sleep 4500
agent-browser screenshot "$OUT/02b-search-empty-desktop.png" --session "$S" 2>&1 | tail -1
agent-browser eval "(() => { const i=document.querySelector('[data-search-input]'); if(i){ i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); return 'cleared' } return 'no' })()" --session "$S" 2>&1 | tail -1

nav "Библиотека" "x" 2200
agent-browser screenshot "$OUT/03-library-desktop.png" --session "$S" 2>&1 | tail -1

nav "Главная" "x" 2000
agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='Продолжить'||x.getAttribute('aria-label')==='Слушать'||x.getAttribute('aria-label')==='Пауза'); if(b){b.click(); return 'play'} return 'no-btn' })()" --session "$S" 2>&1 | tail -1
sleep 6000
agent-browser screenshot "$OUT/05-playerbar-desktop.png" --session "$S" 2>&1 | tail -1
agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('aria-label')||'').match(/Открыть полный плеер/i)); if(b){b.click(); return 'expanded'} return 'no' })()" --session "$S" 2>&1 | tail -1
sleep 3000
agent-browser screenshot "$OUT/06-fullplayer-desktop.png" --session "$S" 2>&1 | tail -1
agent-browser press Escape --session "$S" 2>&1 | tail -1
sleep 1200
agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='Очередь воспроизведения'); if(b){b.click(); return 'q'} return 'MISS' })()" --session "$S" 2>&1 | tail -1
sleep 2500
agent-browser screenshot "$OUT/08-queue-desktop.png" --session "$S" 2>&1 | tail -1
agent-browser press Escape --session "$S" 2>&1 | tail -1

nav "Настройки" "x" 2500
agent-browser screenshot "$OUT/09-settings-desktop.png" --session "$S" 2>&1 | tail -1

echo "== MOBILE 390x844 =="
agent-browser set viewport 390 844 --session "$S" 2>&1 | tail -1
nav "Главная" "x" 2500
agent-browser screenshot "$OUT/20-home-mobile.png" --session "$S" 2>&1 | tail -1
nav "Поиск" "x" 2500
agent-browser screenshot "$OUT/21-search-mobile.png" --session "$S" 2>&1 | tail -1
nav "Библиотека" "x" 2200
agent-browser screenshot "$OUT/22-library-mobile.png" --session "$S" 2>&1 | tail -1
agent-browser eval "(() => { const b=document.querySelector('.mq-mini'); if(b){b.click(); return 'full'} return 'no-mini' })()" --session "$S" 2>&1 | tail -1
sleep 3000
agent-browser screenshot "$OUT/26-fullplayer-mobile.png" --session "$S" 2>&1 | tail -1
agent-browser press Escape --session "$S" 2>&1 | tail -1
echo "DONE"
