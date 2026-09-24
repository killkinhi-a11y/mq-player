#!/bin/bash
# v7 PRODUCTION E2E — MOBILE 390x844 (fresh session)
set -u
export AGENT_BROWSER_SESSION="mq-v7-prod-e2e-mobile"
agent-browser session id --scope worktree >/dev/null 2>&1 || true
AB="agent-browser"
T="https://mq1.vercel.app"
OUT="/home/z/my-project/download/playlist-ref-qa"

q() {
  $AB eval "(() => { let d=document.getElementById('mq-qa-dump'); if(!d){d=document.createElement('div'); d.id='mq-qa-dump'; d.style.display='none'; document.body.appendChild(d);} d.textContent=String(($1)); return 1; })()" >/dev/null 2>&1
  $AB get text "#mq-qa-dump"
  $AB eval "(() => { document.getElementById('mq-qa-dump')?.remove(); return 1; })()" >/dev/null 2>&1
}

echo "===== PROD MOBILE 390x844 ====="
$AB set viewport 390 844 >/dev/null
$AB open "$T/" >/dev/null
$AB wait 3500
$AB eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Демо-режим'); if(b){b.click();return 1;} return 0; })()" >/dev/null
R="w"
for i in $(seq 1 45); do
  R=$(q "(() => document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]') ? 'OK' : 'w')()")
  [ "$R" = "OK" ] && break
  $AB wait 1500 >/dev/null
done
echo "mobile section: $R"
$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const y=window.scrollY+sec.getBoundingClientRect().top-40; window.scrollTo(0,y); return 1; })()" >/dev/null
$AB wait 1200

echo "--- 1) mobile telemetry ---"
q "(() => {
  const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]');
  const hero=sec.querySelector('[role=button]');
  const hr=hero.getBoundingClientRect();
  const strips=[...sec.querySelectorAll('[role=button]')].filter(e=>{const r=e.getBoundingClientRect();return r.height>100&&r.width>30&&e!==hero;}).map(e=>Math.round(e.getBoundingClientRect().width));
  const playBtns=[...sec.querySelectorAll('button')].filter(b=>b.getAttribute('aria-label')?.startsWith('Играть')).map(b=>Math.round(b.getBoundingClientRect().width)).filter(w=>w>0);
  const overflowX=document.documentElement.scrollWidth-document.documentElement.clientWidth;
  const brokenVisible=[...sec.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth===0&&i.offsetParent).length;
  return JSON.stringify({heroW:Math.round(hr.width),heroH:Math.round(hr.height),heroLabel:hero.getAttribute('aria-label')?.slice(0,36),strips,playBtns,overflowX,brokenVisible});
})()"
$AB screenshot "$OUT/prod-v7-mobile-initial.png" >/dev/null

echo "--- 2) tap STRIP (visible zone) -> expand ---"
TXY=$(q "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>{const r=e.getBoundingClientRect();return r.height>100&&r.width>30;}); if(cards.length<2) return 'one'; const r=cards[1].getBoundingClientRect(); return Math.round(r.left+r.width/2)+' '+Math.round(r.top+80); })()")
echo "strip tap xy: $TXY"
if [ "$TXY" != "one" ]; then
  $AB mouse move $TXY >/dev/null
  $AB mouse down >/dev/null; $AB mouse up >/dev/null
  $AB wait 1300
  q "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const hero=sec.querySelector('[role=button]'); const strips=[...sec.querySelectorAll('[role=button]')].filter(e=>{const r=e.getBoundingClientRect();return r.height>100&&r.width>30&&e!==hero;}).length; return JSON.stringify({heroNow:hero.getAttribute('aria-label')?.slice(0,40),stripsLeft:strips}); })()"
  $AB screenshot "$OUT/prod-v7-mobile-expanded.png" >/dev/null
fi

echo "--- 3) tap HERO -> FULL playlist page ---"
HXY=$(q "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const hero=sec.querySelector('[role=button]'); const r=hero.getBoundingClientRect(); return Math.round(r.left+r.width*0.55)+' '+Math.round(r.top+r.height*0.3); })()")
echo "hero tap xy: $HXY"
$AB mouse move $HXY >/dev/null
$AB mouse down >/dev/null; $AB mouse up >/dev/null
$AB wait 1600
q "(() => {
  const view=document.querySelector('main')?.dataset.view;
  const back=[...document.querySelectorAll('button')].some(b=>b.offsetParent&&b.textContent.trim()==='Назад');
  const titles=[...document.querySelectorAll('h2')].map(h=>h.textContent.trim()).filter(t=>t&&t!=='Публичные плейлисты'&&!/версия/i.test(t));
  const playAll=[...document.querySelectorAll('button')].some(b=>b.offsetParent&&/Play all/.test(b.textContent));
  const rows=[...document.querySelectorAll('main [role=button]')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height>30&&e.getBoundingClientRect().height<120).length;
  const overflowX=document.documentElement.scrollWidth-document.documentElement.clientWidth;
  return JSON.stringify({view,back,title:titles[0]||null,playAll,rows,overflowX});
})()"
$AB screenshot "$OUT/prod-v7-mobile-fullpage.png" >/dev/null

echo "--- 4) Back -> Home ---"
$AB eval "(() => { const b=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.trim()==='Главная'); if(!b) return 0; b.click(); return 1; })()" >/dev/null
$AB wait 1500
q "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); return JSON.stringify({view:document.querySelector('main')?.dataset.view,secOk:!!sec}); })()"

echo "--- 5) hero play button (36px) direct play ---"
$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const y=window.scrollY+sec.getBoundingClientRect().top-40; window.scrollTo(0,y); return 1; })()" >/dev/null
$AB wait 800
q "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const hero=sec.querySelector('[role=button]'); const pb=[...hero.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('Играть')); if(!pb) return 'NO PLAY BTN'; const r=pb.getBoundingClientRect(); pb.click(); return Math.round(r.width)+'x'+Math.round(r.height); })()"
$AB wait 2500
q "(() => { try { const s=JSON.parse(localStorage.getItem('mq-store-v8')).state; return JSON.stringify({nowPlaying:s.currentTrack?s.currentTrack.title.slice(0,50):'none',isPlaying:s.isPlaying}); } catch(e){ return 'err'; } })()"

echo "--- 6) console errors (mobile) ---"
$AB console errors 2>/dev/null | grep -iv "^\[debug" | grep -v corrupt | head -5
echo "PROD MOBILE DONE"
