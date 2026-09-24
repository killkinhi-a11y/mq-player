#!/bin/bash
# v6 recommended-playlists QA capture: server + browser in ONE call
# Usage: qa_v6_capture.sh  -> download/playlist-ref-qa/*-v6.png + telemetry
set -u
cd /home/z/my-project
PORT=3111
LOG=/tmp/mq-prod-v6.log
OUT=download/playlist-ref-qa

pkill -9 -f next-server 2>/dev/null; sleep 1
npx next start -p $PORT > "$LOG" 2>&1 &
SRV=$!
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 "http://localhost:$PORT/" 2>/dev/null)
  [ "$code" != "000" ] && break
  sleep 2
done
echo "server: $code (pid $SRV)"

export AGENT_BROWSER_SESSION="mq-playlists-v6"
agent-browser session id --scope worktree >/dev/null 2>&1 || true

B64=$(python3 -c "import re,io; s=io.open('scripts/qa_v6_store.js',encoding='utf-8').read(); print(re.search(r'\"([^\"]+)\"',s).group(1))")

# ---------- DESKTOP 1440x900 ----------
agent-browser set viewport 1440 900 >/dev/null
agent-browser open "http://localhost:$PORT/" >/dev/null
agent-browser wait 2000
agent-browser eval "(() => { localStorage.setItem('mq-store-v8', atob('$B64')); return 'injected: ' + localStorage.getItem('mq-store-v8').slice(0,40); })()"
agent-browser open "http://localhost:$PORT/" >/dev/null
agent-browser wait 2500
agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Демо-режим'); if(!b) return 'NO DEMO BTN'; b.click(); return 'demo ok'; })()"
# Wait for the home feed (curated with taste) + public recs to land
agent-browser wait 9000
# Poll until the recommended section appears (genre searches can take a while)
for i in $(seq 1 20); do
  R=$(agent-browser eval "(() => { const s=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); return s ? 'SECTION OK' : 'wait'; })()" | tr -d '"')
  [ "$R" = "SECTION OK" ] && break
  agent-browser wait 1500 >/dev/null
done
echo "section poll: $R (after $((i*15))/10s)"

# Scroll the section to a stable position (section top ~= 55px)
agent-browser eval "(() => { const s=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); if(!s) return 'none'; const y=window.scrollY+s.getBoundingClientRect().top-55; window.scrollTo(0,y); return 'scrolled '+Math.round(y); })()"
agent-browser wait 1500

echo "=== DESKTOP INITIAL TELEMETRY ==="
agent-browser eval "(() => {
  const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]');
  if(!sec) return 'NO SECTION';
  const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>{const r=e.getBoundingClientRect();return r.height>100;}).map(e=>{const r=e.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)};});
  const h2=sec.querySelector('h2')?.textContent;
  const sub=sec.querySelector('h2 + p, h2~p')?.textContent;
  const chromeSvg=sec.querySelectorAll('svg').length;
  const grid=sec.querySelector('.grid');
  const overflowX=document.documentElement.scrollWidth-document.documentElement.clientWidth;
  const broken=[...sec.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth===0).length;
  const imgs=[...sec.querySelectorAll('img')].length;
  const recos=(localStorage.getItem('mq-store-v8')||'');
  return JSON.stringify({h2,sub,cards,chromeSvg,overflowX,broken,imgs,gridCols:grid?grid.style.gridTemplateColumns:'-'});
})()"

agent-browser screenshot "$OUT/desktop-initial-v6.png" >/dev/null

# ---------- EXPANSION (hover strip #2) ----------
STRIPXY=$(agent-browser eval "(() => {
  const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]');
  const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>30&&r.height>100;});
  if(cards.length<2) return 'NEED 2+ CARDS, have '+cards.length;
  const r=cards[1].getBoundingClientRect();
  return Math.round(r.left+r.width/2)+' '+Math.round(r.top+r.height/2);
})()" | tr -d '"')
echo "strip2 center: $STRIPXY"
agent-browser mouse move $STRIPXY
agent-browser wait 900
echo "=== DESKTOP EXPANDED TELEMETRY ==="
agent-browser eval "(() => {
  const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]');
  const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>{const r=e.getBoundingClientRect();return {w:Math.round(r.width)};});
  const grid=sec.querySelector('.grid');
  return JSON.stringify({cards,gridCols:grid?grid.style.gridTemplateColumns:'-'});
})()"
agent-browser screenshot "$OUT/desktop-expanded-v6.png" >/dev/null

# ---------- COLLAPSE (leave the row) ----------
agent-browser mouse move 720 200
agent-browser wait 900
agent-browser eval "(() => {
  const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]');
  const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>Math.round(e.getBoundingClientRect().width));
  return 'after leave: '+JSON.stringify(cards);
})()"
agent-browser screenshot "$OUT/desktop-collapsed-v6.png" >/dev/null

# ---------- RE-OPEN (hover strip #3 if present) ----------
S3XY=$(agent-browser eval "(() => {
  const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]');
  const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>30&&r.height>100;});
  if(cards.length<3) return '720 533';
  const r=cards[2].getBoundingClientRect();
  return Math.round(r.left+r.width/2)+' '+Math.round(r.top+r.height/2);
})()" | tr -d '"')
echo "strip3 center: $S3XY"
agent-browser mouse move $S3XY
agent-browser wait 900
agent-browser screenshot "$OUT/desktop-reopen-v6.png" >/dev/null
agent-browser eval "(() => {
  const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]');
  const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>Math.round(e.getBoundingClientRect().width));
  const overflowX=document.documentElement.scrollWidth-document.documentElement.clientWidth;
  return 're-open widths: '+JSON.stringify(cards)+' overflowX='+overflowX;
})()"

# ---------- CONSOLE ERRORS ----------
echo "=== CONSOLE ==="
agent-browser console errors 2>/dev/null | head -10 || true

# ---------- MOBILE 390x844 ----------
agent-browser set viewport 390 844 >/dev/null
agent-browser open "http://localhost:$PORT/" >/dev/null
agent-browser wait 2000
agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Демо-режим'); if(b){b.click();return 'demo ok';} return 'no demo btn (already authed?)'; })()"
agent-browser wait 8000
agent-browser eval "(() => { const s=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); if(!s) return 'NO SECTION'; const y=window.scrollY+s.getBoundingClientRect().top-40; window.scrollTo(0,y); return 'scrolled'; })()"
agent-browser wait 1500
echo "=== MOBILE INITIAL TELEMETRY ==="
agent-browser eval "(() => {
  const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]');
  if(!sec) return 'NO SECTION';
  const hero=sec.querySelector('[role=button]');
  const hr=hero.getBoundingClientRect();
  const strips=[...sec.querySelectorAll('[role=button]')].filter(e=>{const r=e.getBoundingClientRect();return r.height>100&&r.width>30;}).slice(1).map(e=>{const r=e.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)};});
  const playBtns=[...sec.querySelectorAll('button')].filter(b=>b.getAttribute('aria-label')?.startsWith('Играть')).map(b=>{const r=b.getBoundingClientRect();return Math.round(r.width);});
  const overflowX=document.documentElement.scrollWidth-document.documentElement.clientWidth;
  const broken=[...sec.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth===0).length;
  const chromeSvg=sec.querySelectorAll('svg').length;
  return JSON.stringify({hero:{w:Math.round(hr.width),h:Math.round(hr.height)},strips,playBtns,overflowX,broken,chromeSvg});
})()"
agent-browser screenshot "$OUT/mobile-initial-v6.png" >/dev/null

# ---------- MOBILE TAP-EXPANSION ----------
MXY=$(agent-browser eval "(() => {
  const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]');
  const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>30&&r.height>100;});
  if(cards.length<2) return 'NEED 2+ CARDS';
  const r=cards[1].getBoundingClientRect();
  return Math.round(r.left+r.width/2)+' '+Math.round(r.top+r.height/2);
})()" | tr -d '"')
echo "mobile strip center: $MXY"
agent-browser mouse move $MXY >/dev/null
agent-browser mouse down >/dev/null; agent-browser mouse up >/dev/null
agent-browser wait 900
agent-browser eval "(() => {
  const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]');
  const hero=sec.querySelector('[role=button]');
  const hr=hero.getBoundingClientRect();
  const h2=sec.querySelector('h2')?.textContent;
  const strips=[...sec.querySelectorAll('[role=button]')].filter(e=>{const r=e.getBoundingClientRect();return r.height>100&&r.width>30;}).slice(1).map(e=>Math.round(e.getBoundingClientRect().width));
  const overflowX=document.documentElement.scrollWidth-document.documentElement.clientWidth;
  return JSON.stringify({heroTitle:hero.getAttribute('aria-label'),heroW:Math.round(hr.width),strips,overflowX});
})()"
agent-browser screenshot "$OUT/mobile-expanded-v6.png" >/dev/null
echo "=== MOBILE CONSOLE ==="
agent-browser console errors 2>/dev/null | head -6 || true

pkill -9 -f next-server 2>/dev/null
echo "CAPTURE DONE"
