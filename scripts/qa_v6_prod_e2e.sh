#!/bin/bash
# v6 PRODUCTION E2E: fresh session, real data, real interactions
set -u
export AGENT_BROWSER_SESSION="mq-prod-e2e-v6"
agent-browser session id --scope worktree >/dev/null 2>&1 || true
PORT_TARGET="https://mq1.vercel.app"

echo "===== DESKTOP 1440x900 ====="
agent-browser set viewport 1440 900 >/dev/null
agent-browser open "$PORT_TARGET/" >/dev/null
agent-browser wait 3000
agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Демо-режим'); if(b){b.click();return 'demo ok';} return 'no demo btn'; })()"
# Poll for the recommended section (prod fetch, no taste => 2-3 curated)
for i in $(seq 1 40); do
  R=$(agent-browser eval "(() => document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]') ? 'OK' : 'w')()" | tr -d '"')
  [ "$R" = "OK" ] && break
  agent-browser wait 1500 >/dev/null
done
echo "section: $R"
agent-browser eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); if(!sec) return 'NO SECTION'; const y=window.scrollY+sec.getBoundingClientRect().top-55; window.scrollTo(0,y); return 'scrolled'; })()"
agent-browser wait 1200
echo "--- initial telemetry ---"
agent-browser eval "(() => {
  const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]');
  if(!sec) return 'NO SECTION';
  const h2=sec.querySelector('h2')?.textContent;
  const sub=sec.querySelector('h2+p, h2~p')?.textContent;
  const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>Math.round(e.getBoundingClientRect().width));
  const grid=sec.querySelector('.grid');
  const overflowX=document.documentElement.scrollWidth-document.documentElement.clientWidth;
  const brokenVisible=[...sec.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth===0&&i.offsetParent).length;
  const gapBelow=Math.round(sec.getBoundingClientRect().bottom - (grid?grid.getBoundingClientRect().bottom:0));
  return JSON.stringify({h2,sub,cards,gridCols:grid?grid.style.gridTemplateColumns.slice(0,40):'-',overflowX,brokenVisible,gapBelow});
})()"
agent-browser screenshot download/playlist-ref-qa/prod-desktop-initial-v6.png >/dev/null

echo "--- hover expansion ---"
agent-browser eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100); if(cards.length<2) return 'only '+cards.length; const r=cards[cards.length-1].getBoundingClientRect(); return Math.round(r.left+r.width/2)+' '+Math.round(r.top+r.height/2); })()" | tr -d '"' > /tmp/p_xy.txt
agent-browser mouse move $(cat /tmp/p_xy.txt)
agent-browser wait 800
agent-browser eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); return 'expanded widths: '+JSON.stringify([...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>Math.round(e.getBoundingClientRect().width))); })()"
agent-browser screenshot download/playlist-ref-qa/prod-desktop-expanded-v6.png >/dev/null
agent-browser mouse move 720 200
agent-browser wait 800
agent-browser eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); return 'after leave: '+JSON.stringify([...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>Math.round(e.getBoundingClientRect().width))); })()"

echo "--- playback ---"
agent-browser eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const hero=sec.querySelector('[role=button]'); const cta=[...hero.querySelectorAll('button')].find(b=>/^(Слушать|Пауза)$/.test(b.textContent.trim())); if(!cta) return 'no CTA'; cta.click(); return 'CTA play'; })()"
agent-browser wait 3000
agent-browser eval "(() => { try { const t=JSON.parse(localStorage.getItem('mq-store-v8')).state?.currentTrack; return 'now playing: '+(t?t.title.slice(0,50):'none'); } catch(e){ return 'err'; } })()"

echo "--- actions menu ---"
agent-browser eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const hero=sec.querySelector('[role=button]'); const more=[...hero.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('Действия')); if(!more) return 'NO MORE'; more.click(); return 'menu'; })()"
agent-browser wait 600
agent-browser eval "(() => { const items=[...document.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>b.textContent.trim()).filter(t=>/Воспроизвести|Перемешать|Добавить в очередь/.test(t)); return 'menu items: '+JSON.stringify(items); })()"
agent-browser eval "(() => { document.addEventListener('keydown', e=>{}, true); const esc=new KeyboardEvent('keydown',{key:'Escape',bubbles:true}); document.dispatchEvent(esc); const it=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&/Добавить в очередь/.test(b.textContent)); if(it){it.click(); return 'queue add';} return 'no queue item'; })()"
agent-browser wait 1200
agent-browser eval "(() => { try { const q=JSON.parse(localStorage.getItem('mq-store-v8')).state?.queue?.length; return 'queue length: '+q; } catch(e){ return 'err'; } })()"

echo "--- console (desktop) ---"
agent-browser console errors 2>/dev/null | rg -iv "^\[debug" | rg -v "corrupt" | head -5

echo "===== MOBILE 390x844 ====="
agent-browser set viewport 390 844 >/dev/null
agent-browser open "$PORT_TARGET/" >/dev/null
agent-browser wait 3000
agent-browser eval "(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Демо-режим'); if(b){b.click();return 'demo ok';} return 'authed (session persisted)'; })()"
for i in $(seq 1 40); do
  R=$(agent-browser eval "(() => document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]') ? 'OK' : 'w')()" | tr -d '"')
  [ "$R" = "OK" ] && break
  agent-browser wait 1500 >/dev/null
done
echo "mobile section: $R"
agent-browser eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); if(!sec) return 'NO SECTION'; const y=window.scrollY+sec.getBoundingClientRect().top-40; window.scrollTo(0,y); return 'scrolled'; })()"
agent-browser wait 1200
echo "--- mobile telemetry ---"
agent-browser eval "(() => {
  const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]');
  if(!sec) return 'NO SECTION';
  const hero=sec.querySelector('[role=button]');
  const hr=hero.getBoundingClientRect();
  const strips=[...sec.querySelectorAll('[role=button]')].filter(e=>{const r=e.getBoundingClientRect();return r.height>100&&r.width>30&&e!==hero;}).map(e=>Math.round(e.getBoundingClientRect().width));
  const playBtns=[...sec.querySelectorAll('button')].filter(b=>b.getAttribute('aria-label')?.startsWith('Играть')).map(b=>{const r=b.getBoundingClientRect();return Math.round(r.width);}).filter(w=>w>0);
  const overflowX=document.documentElement.scrollWidth-document.documentElement.clientWidth;
  const brokenVisible=[...sec.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth===0&&i.offsetParent).length;
  return JSON.stringify({heroW:Math.round(hr.width),heroH:Math.round(hr.height),strips,playBtns,overflowX,brokenVisible});
})()"
agent-browser screenshot download/playlist-ref-qa/prod-mobile-initial-v6.png >/dev/null
echo "--- mobile tap expansion ---"
agent-browser eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>{const r=e.getBoundingClientRect();return r.height>100&&r.width>30;}); if(cards.length<2) return 'one card only'; const r=cards[1].getBoundingClientRect(); return Math.round(r.left+r.width/2)+' '+Math.round(r.top+r.height/2); })()" | tr -d '"' > /tmp/pm_xy.txt
PM=$(cat /tmp/pm_xy.txt)
if [ "$PM" != "one card only" ]; then
  agent-browser mouse move $PM >/dev/null
  agent-browser mouse down >/dev/null; agent-browser mouse up >/dev/null
  agent-browser wait 1000
  agent-browser eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const hero=sec.querySelector('[role=button]'); return 'after tap hero: '+hero.getAttribute('aria-label')?.slice(0,60); })()"
  agent-browser screenshot download/playlist-ref-qa/prod-mobile-expanded-v6.png >/dev/null
fi
echo "--- console (mobile) ---"
agent-browser console errors 2>/dev/null | rg -iv "^\[debug" | rg -v "corrupt" | head -5
echo "E2E DONE"
