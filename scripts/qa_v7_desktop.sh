#!/bin/bash
# v7 MICRO-PASS LOCAL QA — DESKTOP 1440x900
# 500ms accordion + FULL playlist open (existing public-playlist view)
set -u
export AGENT_BROWSER_SESSION="mq-v7-local-desktop"
agent-browser session id --scope worktree >/dev/null 2>&1 || true
AB="agent-browser"
T="http://127.0.0.1:3111"
OUT="/home/z/my-project/download/playlist-ref-qa"
mkdir -p "$OUT"

echo "===== DESKTOP 1440x900 ====="
$AB set viewport 1440 900 >/dev/null
$AB open "$T/" >/dev/null
$AB wait 3000
$AB eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Демо-режим'); if(b){b.click();return 'demo ok';} return 'no demo btn (authed)'; })()"

# Poll for the recommended section (curated searches can take up to 60s)
R="w"
for i in $(seq 1 40); do
  R=$($AB eval "(() => document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]') ? 'OK' : 'w')()" | tr -d '"')
  [ "$R" = "OK" ] && break
  $AB wait 1500 >/dev/null
done
echo "section: $R"

$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const y=window.scrollY+sec.getBoundingClientRect().top-70; window.scrollTo(0,y); return 'scrolled'; })()"
$AB wait 1200

echo "--- 1) initial telemetry + 500ms transition ---"
$AB eval "(() => {
  const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]');
  if(!sec) return 'NO SECTION';
  const h2=sec.querySelector('h2')?.textContent;
  const sub=sec.querySelector('h2~p')?.textContent;
  const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>Math.round(e.getBoundingClientRect().width));
  const grid=sec.querySelector('.grid');
  const cs=grid?getComputedStyle(grid):null;
  const overflowX=document.documentElement.scrollWidth-document.documentElement.clientWidth;
  const brokenVisible=[...sec.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth===0&&i.offsetParent).length;
  return JSON.stringify({h2,sub,cards,gridCols:grid?grid.style.gridTemplateColumns.slice(0,44):'-',
    transProp:cs?cs.transitionProperty:'-',transDur:cs?cs.transitionDuration:'-',transEase:cs?cs.transitionTimingFunction:'-',
    overflowX,brokenVisible});
})()"

echo "--- 2) hover MIDDLE strip -> expand; leave -> collapse; hover again (reopen) ---"
$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100); if(cards.length<3) return 'need 3+ cards, got '+cards.length; const r=cards[1].getBoundingClientRect(); return Math.round(r.left+r.width/2)+' '+Math.round(r.top+r.height/2); })()" | tr -d '"' > /tmp/v7_xy.txt
XY=$(cat /tmp/v7_xy.txt)
echo "middle card xy: $XY"
$AB mouse move $XY
$AB wait 900
$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); return 'expanded: '+JSON.stringify([...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>Math.round(e.getBoundingClientRect().width))); })()"
$AB mouse move 720 150
$AB wait 900
$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); return 'collapsed: '+JSON.stringify([...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>Math.round(e.getBoundingClientRect().width))); })()"
$AB mouse move $XY
$AB wait 900
$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); return 'reopen: '+JSON.stringify([...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>Math.round(e.getBoundingClientRect().width))); })()"
$AB screenshot "$OUT/v7-desktop-expanded-reopen.png" >/dev/null
$AB mouse move 720 150
$AB wait 800

echo "--- 3) CLICK HERO (first card) -> FULL playlist page ---"
$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100); const hero=cards[0]; const r=hero.getBoundingClientRect(); const label=hero.getAttribute('aria-label'); window.__v7heroLabel=label; return JSON.stringify({label, x:Math.round(r.left+r.width*0.55), y:Math.round(r.top+r.height*0.3)}); })()" | tr -d '"' > /tmp/v7_hero.json
cat /tmp/v7_hero.json
HX=$($AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const hero=[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100)[0]; const r=hero.getBoundingClientRect(); return Math.round(r.left+r.width*0.55)+' '+Math.round(r.top+r.height*0.3); })()" | tr -d '"')
$AB mouse move $HX
$AB mouse down; $AB mouse up
$AB wait 1500
$AB eval "(() => {
  const view=document.querySelector('main')?.dataset.view;
  const back=[...document.querySelectorAll('button')].some(b=>b.offsetParent&&b.textContent.trim()==='Назад');
  const h2=[...document.querySelectorAll('h2')].map(h=>h.textContent.trim()).find(t=>t&&t!=='Публичные плейлисты')||null;
  const playAll=[...document.querySelectorAll('button')].some(b=>b.offsetParent&&/Play all/.test(b.textContent));
  const trackRows=[...document.querySelectorAll('main [role=button]')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height>30&&e.getBoundingClientRect().height<120&&e!==document.querySelector('section[aria-label]')).length;
  const likeBtn=[...document.querySelectorAll('button')].some(b=>b.offsetParent&&b.querySelector('svg')&&/^\d+$/.test(b.textContent.trim()));
  const fromUser=[...document.querySelectorAll('p')].some(p=>p.offsetParent&&/^от @/.test(p.textContent.trim()));
  const overflowX=document.documentElement.scrollWidth-document.documentElement.clientWidth;
  return JSON.stringify({view,back,h2,playAll,trackRows,fromUser,overflowX});
})()"
$AB screenshot "$OUT/v7-desktop-fullpage-hero.png" >/dev/null

echo "--- 4) Play all from the full page ---"
$AB eval "(() => { const b=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&/Play all/.test(b.textContent)); if(!b) return 'NO PLAY ALL'; b.click(); return 'play all clicked'; })()"
$AB wait 3000
$AB eval "(() => { try { const t=JSON.parse(localStorage.getItem('mq-store-v8')).state?.currentTrack; const playing=JSON.parse(localStorage.getItem('mq-store-v8')).state?.isPlaying; return JSON.stringify({nowPlaying:t?t.title.slice(0,60):'none', isPlaying:playing}); } catch(e){ return 'err '+e.message; } })()"

echo "--- 5) Back to Home (NavBar), section intact ---"
$AB eval "(() => { const b=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.trim()==='Главная'); if(!b) return 'NO HOME BTN'; b.click(); return 'home clicked'; })()"
$AB wait 1500
$AB eval "(() => {
  const view=document.querySelector('main')?.dataset.view;
  const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]');
  const h2=sec?.querySelector('h2')?.textContent;
  const cards=sec?[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>Math.round(e.getBoundingClientRect().width)):[];
  return JSON.stringify({view,secOk:!!sec,h2,cards});
})()"

echo "--- 6) MIDDLE card click -> full page ---"
MX=$($AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100); if(cards.length<2) return 'NEED2'; const r=cards[1].getBoundingClientRect(); return Math.round(r.left+r.width*0.5)+' '+Math.round(r.top+r.height*0.3); })()" | tr -d '"')
echo "middle xy: $MX"
$AB mouse move $MX
$AB mouse down; $AB mouse up
$AB wait 1500
$AB eval "(() => { const view=document.querySelector('main')?.dataset.view; const back=[...document.querySelectorAll('button')].some(b=>b.offsetParent&&b.textContent.trim()==='Назад'); const h2=[...document.querySelectorAll('h2')].map(h=>h.textContent.trim()).filter(t=>t&&t!=='Публичные плейлисты'); const rows=[...document.querySelectorAll('main [role=button]')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height>30&&e.getBoundingClientRect().height<120).length; return JSON.stringify({view,back,title:h2[0]||null,rows}); })()"
$AB screenshot "$OUT/v7-desktop-fullpage-middle.png" >/dev/null

echo "--- 7) Back home, LAST card click -> full page ---"
$AB eval "(() => { const b=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.trim()==='Главная'); if(b)b.click(); return 'home'; })()"
$AB wait 1500
LX=$($AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100); const r=cards[cards.length-1].getBoundingClientRect(); return Math.round(r.left+r.width*0.5)+' '+Math.round(r.top+r.height*0.3); })()" | tr -d '"')
echo "last xy: $LX"
$AB mouse move $LX
$AB mouse down; $AB mouse up
$AB wait 1500
$AB eval "(() => { const view=document.querySelector('main')?.dataset.view; const back=[...document.querySelectorAll('button')].some(b=>b.offsetParent&&b.textContent.trim()==='Назад'); const rows=[...document.querySelectorAll('main [role=button]')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height>30&&e.getBoundingClientRect().height<120).length; const h2=[...document.querySelectorAll('h2')].map(h=>h.textContent.trim()).filter(t=>t&&t!=='Публичные плейлисты'); return JSON.stringify({view,back,title:h2[0]||null,rows}); })()"
$AB screenshot "$OUT/v7-desktop-fullpage-last.png" >/dev/null

echo "--- 8) Home: CTA playback still works ---"
$AB eval "(() => { const b=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.trim()==='Главная'); if(b)b.click(); return 'home'; })()"
$AB wait 1500
$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100); const cta=[...cards[0].querySelectorAll('button')].find(b=>/^(Слушать|Пауза)$/.test(b.textContent.trim())&&b.offsetParent); if(!cta) return 'NO CTA visible'; cta.click(); return 'CTA clicked: '+cta.textContent.trim(); })()"
$AB wait 2500
$AB eval "(() => { try { const s=JSON.parse(localStorage.getItem('mq-store-v8')).state; return JSON.stringify({nowPlaying:s.currentTrack?s.currentTrack.title.slice(0,60):'none', isPlaying:s.isPlaying}); } catch(e){ return 'err'; } })()"

echo "--- 9) console errors (desktop) ---"
$AB console errors 2>/dev/null | grep -iv "^\[debug" | grep -v corrupt | head -6
echo "DESKTOP QA DONE"
