#!/bin/bash
# v7 MICRO-PASS LOCAL QA — MOBILE 390x844
set -u
export AGENT_BROWSER_SESSION="mq-v7-local-mobile"
agent-browser session id --scope worktree >/dev/null 2>&1 || true
AB="agent-browser"
T="http://127.0.0.1:3111"
OUT="/home/z/my-project/download/playlist-ref-qa"

echo "===== MOBILE 390x844 ====="
$AB set viewport 390 844 >/dev/null
$AB open "$T/" >/dev/null
$AB wait 3000
$AB eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Демо-режим'); if(b){b.click();return 'demo ok';} return 'authed'; })()"
R="w"
for i in $(seq 1 40); do
  R=$($AB eval "(() => document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]') ? 'OK' : 'w')()" | tr -d '"')
  [ "$R" = "OK" ] && break
  $AB wait 1500 >/dev/null
done
echo "mobile section: $R"
$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const y=window.scrollY+sec.getBoundingClientRect().top-40; window.scrollTo(0,y); return 'scrolled'; })()"
$AB wait 1200

echo "--- 1) mobile telemetry ---"
$AB eval "(() => {
  const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]');
  if(!sec) return 'NO SECTION';
  const hero=sec.querySelector('[role=button]');
  const hr=hero.getBoundingClientRect();
  const strips=[...sec.querySelectorAll('[role=button]')].filter(e=>{const r=e.getBoundingClientRect();return r.height>100&&r.width>30&&e!==hero;}).map(e=>Math.round(e.getBoundingClientRect().width));
  const playBtns=[...sec.querySelectorAll('button')].filter(b=>b.getAttribute('aria-label')?.startsWith('Играть')).map(b=>Math.round(b.getBoundingClientRect().width)).filter(w=>w>0);
  const overflowX=document.documentElement.scrollWidth-document.documentElement.clientWidth;
  const brokenVisible=[...sec.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth===0&&i.offsetParent).length;
  return JSON.stringify({heroW:Math.round(hr.width),heroH:Math.round(hr.height),heroLabel:hero.getAttribute('aria-label')?.slice(0,40),strips,playBtns,overflowX,brokenVisible});
})()"
$AB screenshot "$OUT/v7-mobile-initial.png" >/dev/null

echo "--- 2) tap STRIP -> expand (accordion morph) ---"
$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>{const r=e.getBoundingClientRect();return r.height>100&&r.width>30;}); if(cards.length<2) return 'one card only'; const r=cards[1].getBoundingClientRect(); return Math.round(r.left+r.width/2)+' '+Math.round(r.top+r.height/2); })()" | tr -d '"' > /tmp/v7m_xy.txt
MX=$(cat /tmp/v7m_xy.txt)
echo "strip tap xy: $MX"
$AB mouse move $MX >/dev/null
$AB mouse down >/dev/null; $AB mouse up >/dev/null
$AB wait 1200
$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const hero=sec.querySelector('[role=button]'); const strips=[...sec.querySelectorAll('[role=button]')].filter(e=>{const r=e.getBoundingClientRect();return r.height>100&&r.width>30&&e!==hero;}).length; return JSON.stringify({heroNow:hero.getAttribute('aria-label')?.slice(0,44), stripsLeft:strips}); })()"
$AB screenshot "$OUT/v7-mobile-after-strip-tap.png" >/dev/null

echo "--- 3) tap HERO (expanded) -> FULL playlist page ---"
$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const hero=sec.querySelector('[role=button]'); const r=hero.getBoundingClientRect(); return Math.round(r.left+r.width*0.55)+' '+Math.round(r.top+r.height*0.3); })()" | tr -d '"' > /tmp/v7m_hero.txt
HX=$(cat /tmp/v7m_hero.txt)
echo "hero tap xy: $HX"
$AB mouse move $HX >/dev/null
$AB mouse down >/dev/null; $AB mouse up >/dev/null
$AB wait 1600
$AB eval "(() => {
  const view=document.querySelector('main')?.dataset.view;
  const back=[...document.querySelectorAll('button')].some(b=>b.offsetParent&&b.textContent.trim()==='Назад');
  const titles=[...document.querySelectorAll('h2')].map(h=>h.textContent.trim()).filter(t=>t&&t!=='Публичные плейлисты'&&!/версия/i.test(t));
  const playAll=[...document.querySelectorAll('button')].some(b=>b.offsetParent&&/Play all/.test(b.textContent));
  const rows=[...document.querySelectorAll('main [role=button]')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height>30&&e.getBoundingClientRect().height<120).length;
  const overflowX=document.documentElement.scrollWidth-document.documentElement.clientWidth;
  const clip=document.documentElement.scrollWidth>document.documentElement.clientWidth;
  return JSON.stringify({view,back,title:titles[0]||null,playAll,rows,overflowX,clip});
})()"
$AB screenshot "$OUT/v7-mobile-fullpage.png" >/dev/null

echo "--- 4) Back -> Home (mobile nav) ---"
$AB eval "(() => { const b=[...document.querySelectorAll('button,a,[role=button]').length?[...document.querySelectorAll('button')]:[]].find(b=>b.offsetParent&&b.textContent.trim()==='Главная'); if(!b) return 'NO HOME BTN'; b.click(); return 'home'; })()"
$AB wait 1500
$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const cards=sec?[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>Math.round(e.getBoundingClientRect().width)):[]; return JSON.stringify({view:document.querySelector('main')?.dataset.view,secOk:!!sec,cards}); })()"

echo "--- 5) mobile play button (36px) direct play ---"
$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const y=window.scrollY+sec.getBoundingClientRect().top-40; window.scrollTo(0,y); return 'scrolled'; })()"
$AB wait 800
$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const hero=sec.querySelector('[role=button]'); const pb=[...hero.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('Играть')); if(!pb) return 'NO PLAY BTN'; const r=pb.getBoundingClientRect(); pb.click(); return JSON.stringify({size:Math.round(r.width)+'x'+Math.round(r.height)}); })()"
$AB wait 2500
$AB eval "(() => { try { const s=JSON.parse(localStorage.getItem('mq-store-v8')).state; return JSON.stringify({nowPlaying:s.currentTrack?s.currentTrack.title.slice(0,50):'none', isPlaying:s.isPlaying}); } catch(e){ return 'err'; } })()"

echo "--- 6) console errors (mobile) ---"
$AB console errors 2>/dev/null | grep -iv "^\[debug" | grep -v corrupt | head -5
echo "MOBILE QA DONE"
