#!/bin/bash
# v7 PRODUCTION E2E — DESKTOP 1440x900 (fresh session, real data)
# NOTE: eval result serialization is broken in non-TTY script context
# (strings/objects -> {}); results are round-tripped through a DOM node
# and read back via `get text` (works).
set -u
export AGENT_BROWSER_SESSION="mq-v7-prod-e2e-desktop"
agent-browser session id --scope worktree >/dev/null 2>&1 || true
AB="agent-browser"
T="https://mq1.vercel.app"
OUT="/home/z/my-project/download/playlist-ref-qa"
mkdir -p "$OUT"

q() {
  $AB eval "(() => { let d=document.getElementById('mq-qa-dump'); if(!d){d=document.createElement('div'); d.id='mq-qa-dump'; d.style.display='none'; document.body.appendChild(d);} d.textContent=String(($1)); return 1; })()" >/dev/null 2>&1
  $AB get text "#mq-qa-dump"
  $AB eval "(() => { document.getElementById('mq-qa-dump')?.remove(); return 1; })()" >/dev/null 2>&1
}
scrollsec() { $AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); if(!sec) return 0; const y=window.scrollY+sec.getBoundingClientRect().top-70; window.scrollTo(0,y); return 1; })()" >/dev/null; }
clickspot() { # $1 = card index (viewport coords of its top-quarter center)
  q "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100); const i=Math.min($1,cards.length-1); const r=cards[i].getBoundingClientRect(); return Math.round(r.left+r.width*0.5)+' '+Math.round(r.top+r.height*0.25); })()"
}

echo "===== PROD DESKTOP 1440x900 ====="
$AB set viewport 1440 900 >/dev/null
$AB open "$T/" >/dev/null
$AB wait 3500
$AB eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Демо-режим'); if(b){b.click();return 1;} return 0; })()" >/dev/null
R="w"
for i in $(seq 1 45); do
  R=$(q "(() => document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]') ? 'OK' : 'w')()")
  [ "$R" = "OK" ] && break
  $AB wait 1500 >/dev/null
done
echo "section: $R"
scrollsec; $AB wait 1000

echo "--- 1) telemetry + 500ms ---"
q "(() => {
  const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]');
  const h2=sec.querySelector('h2')?.textContent;
  const sub=sec.querySelector('h2~p')?.textContent;
  const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>Math.round(e.getBoundingClientRect().width));
  const grid=sec.querySelector('.grid');
  const cs=grid?getComputedStyle(grid):null;
  const gapBelow=Math.round(sec.getBoundingClientRect().bottom-(grid?grid.getBoundingClientRect().bottom:0));
  return JSON.stringify({h2,sub,cards,transDur:cs?cs.transitionDuration:'-',transProp:cs?cs.transitionProperty:'-',transEase:cs?cs.transitionTimingFunction:'-',
    overflowX:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    broken:[...sec.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth===0&&i.offsetParent).length,gapBelow});
})()"
$AB screenshot "$OUT/prod-v7-desktop-initial.png" >/dev/null

echo "--- 2) accordion expand/collapse/reopen ---"
XY=$(clickspot 1)
echo "strip xy: $XY"
$AB mouse move $XY; $AB wait 900
echo "expanded:  $(q "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); return JSON.stringify([...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>Math.round(e.getBoundingClientRect().width))); })()")"
$AB mouse move 720 120; $AB wait 900
echo "collapsed: $(q "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); return JSON.stringify([...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>Math.round(e.getBoundingClientRect().width))); })()")"
$AB mouse move $XY; $AB wait 900
echo "reopen:    $(q "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); return JSON.stringify([...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>Math.round(e.getBoundingClientRect().width))); })()")"
$AB screenshot "$OUT/prod-v7-desktop-expanded.png" >/dev/null
$AB mouse move 720 120; $AB wait 800

echo "--- 3) hero click -> full page ---"
scrollsec; $AB wait 500
HX=$(clickspot 0)
echo "hero xy: $HX"
$AB mouse move $HX; $AB mouse down; $AB mouse up; $AB wait 1600
q "(() => {
  const view=document.querySelector('main')?.dataset.view;
  const back=[...document.querySelectorAll('button')].some(b=>b.offsetParent&&b.textContent.trim()==='Назад');
  const titles=[...document.querySelectorAll('h2')].map(h=>h.textContent.trim()).filter(t=>t&&t!=='Публичные плейлисты'&&!/версия/i.test(t));
  const playAll=[...document.querySelectorAll('button')].some(b=>b.offsetParent&&/Play all/.test(b.textContent));
  const rows=[...document.querySelectorAll('main [role=button]')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height>30&&e.getBoundingClientRect().height<120).length;
  const fromUser=[...document.querySelectorAll('p')].some(p=>p.offsetParent&&/^от @/.test(p.textContent.trim()));
  const overflowX=document.documentElement.scrollWidth-document.documentElement.clientWidth;
  return JSON.stringify({view,back,title:titles[0]||null,playAll,rows,fromUser,overflowX});
})()"
$AB screenshot "$OUT/prod-v7-desktop-fullpage-hero.png" >/dev/null

echo "--- 4) Play all ---"
$AB eval "(() => { const b=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&/Play all/.test(b.textContent)); if(!b) return 0; b.click(); return 1; })()" >/dev/null
$AB wait 3000
q "(() => { try { const s=JSON.parse(localStorage.getItem('mq-store-v8')).state; return JSON.stringify({nowPlaying:s.currentTrack?s.currentTrack.title.slice(0,60):'none',isPlaying:s.isPlaying}); } catch(e){ return 'err'; } })()"

echo "--- 5) back home -> strip(last) click -> full page ---"
$AB eval "(() => { const b=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.trim()==='Главная'); b.click(); return 1; })()" >/dev/null
$AB wait 1500
scrollsec; $AB wait 600
SX=$(clickspot 1)
echo "strip xy: $SX"
$AB mouse move $SX; $AB mouse down; $AB mouse up; $AB wait 1600
q "(() => {
  const view=document.querySelector('main')?.dataset.view;
  const back=[...document.querySelectorAll('button')].some(b=>b.offsetParent&&b.textContent.trim()==='Назад');
  const titles=[...document.querySelectorAll('h2')].map(h=>h.textContent.trim()).filter(t=>t&&t!=='Публичные плейлисты'&&!/версия/i.test(t));
  const playAll=[...document.querySelectorAll('button')].some(b=>b.offsetParent&&/Play all/.test(b.textContent));
  const rows=[...document.querySelectorAll('main [role=button]')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height>30&&e.getBoundingClientRect().height<120).length;
  const fromUser=[...document.querySelectorAll('p')].some(p=>p.offsetParent&&/^от @/.test(p.textContent.trim()));
  const overflowX=document.documentElement.scrollWidth-document.documentElement.clientWidth;
  return JSON.stringify({view,back,title:titles[0]||null,playAll,rows,fromUser,overflowX});
})()"
$AB screenshot "$OUT/prod-v7-desktop-fullpage-strip.png" >/dev/null

echo "--- 6) back home, section intact + CTA ---"
$AB eval "(() => { const b=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.trim()==='Главная'); b.click(); return 1; })()" >/dev/null
$AB wait 1500
q "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const cards=sec?[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>Math.round(e.getBoundingClientRect().width)):[]; return JSON.stringify({view:document.querySelector('main')?.dataset.view,secOk:!!sec,h2:sec?.querySelector('h2')?.textContent,cards}); })()"
scrollsec; $AB wait 500
$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100); const cta=[...cards[0].querySelectorAll('button')].find(b=>/^(Слушать|Пауза)$/.test(b.textContent.trim())&&b.offsetParent); if(!cta) return 0; cta.click(); return 1; })()" >/dev/null
$AB wait 2500
q "(() => { try { const s=JSON.parse(localStorage.getItem('mq-store-v8')).state; return JSON.stringify({nowPlaying:s.currentTrack?s.currentTrack.title.slice(0,50):'none',isPlaying:s.isPlaying}); } catch(e){ return 'err'; } })()"

echo "--- 7) keyboard: focus strip -> expand; Enter -> full page ---"
scrollsec; $AB wait 500
$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100); cards[cards.length-1].focus(); return 1; })()" >/dev/null
$AB wait 900
echo "focus expanded: $(q "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); return JSON.stringify([...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>Math.round(e.getBoundingClientRect().width))); })()")"
$AB press Enter
$AB wait 1500
q "(() => { const view=document.querySelector('main')?.dataset.view; const back=[...document.querySelectorAll('button')].some(b=>b.offsetParent&&b.textContent.trim()==='Назад'); return JSON.stringify({view,back}); })()"

echo "--- 8) console errors ---"
$AB console errors 2>/dev/null | grep -iv "^\[debug" | grep -v corrupt | head -5
echo "PROD DESKTOP DONE"
