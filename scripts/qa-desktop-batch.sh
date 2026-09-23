#!/bin/bash
# Desktop QA batch: scroll to the playlists editorial section, verify
# reference geometry via DOM, take screenshots.
set -u
snap() { agent-browser snapshot -i 2>/dev/null; }

# try to add one more playlist quickly
ACT=$(snap | grep -oE 'button "Действия: [^"]+" \[ref=[a-z0-9]+\]' | grep -oE 'e[0-9]+' | tail -1)
if [ -n "$ACT" ]; then
  agent-browser click "@$ACT" >/dev/null 2>&1; agent-browser wait 800 >/dev/null 2>&1
  R=$(snap | grep -oE 'menuitem "Добавить в плейлист" \[ref=[a-z0-9]+\]' | grep -oE 'e[0-9]+')
  [ -n "$R" ] && agent-browser click "@$R" >/dev/null 2>&1 && agent-browser wait 700 >/dev/null 2>&1
  R=$(snap | grep -oE 'menuitem "Новый плейлист" \[ref=[a-z0-9]+\]' | grep -oE 'e[0-9]+')
  [ -n "$R" ] && agent-browser click "@$R" >/dev/null 2>&1 && agent-browser wait 800 >/dev/null 2>&1
  R=$(snap | grep -oE 'button "Создать плейлист" \[ref=[a-z0-9]+\]' | grep -oE 'e[0-9]+')
  if [ -n "$R" ]; then agent-browser click "@$R" >/dev/null 2>&1; agent-browser wait 1500 >/dev/null 2>&1; fi
  if ! snap | grep -q "Добрый вечер"; then
    R=$(snap | grep -oE 'button "Главная" \[ref=[a-z0-9]+\]' | grep -oE 'e[0-9]+')
    [ -n "$R" ] && agent-browser click "@$R" >/dev/null 2>&1 && agent-browser wait 2200 >/dev/null 2>&1
  fi
fi
snap | grep -oE 'button "ПЛЕЙЛИСТЫ [0-9]+"' | head -1

# scroll the section into view (full page scroll first for lazy sections)
agent-browser eval "(async()=>{for(let y=0;y<=document.body.scrollHeight;y+=700){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,110));}window.scrollTo(0,0);return 'ok'})()" >/dev/null 2>&1
agent-browser wait 900 >/dev/null 2>&1
agent-browser eval "(()=>{const s=document.querySelector('section[aria-label=\"Плейлисты\"]');if(!s)return 'NO_SECTION';const r=s.getBoundingClientRect();const top=r.top+window.scrollY;window.scrollTo(0,Math.max(0,top-100));return 'scrolled-to-'+Math.round(top)})()"
agent-browser wait 1200 >/dev/null 2>&1

# screenshots
mkdir -p /home/z/my-project/download/playlist-ref-qa
agent-browser screenshot /home/z/my-project/download/playlist-ref-qa/desktop-section.png >/dev/null 2>&1
echo "SHOT desktop-section"

# DOM telemetry: reference-geometry verification
agent-browser eval "(()=>{const s=document.querySelector('section[aria-label=\"Плейлисты\"]');if(!s)return 'NO_SECTION';const sr=s.getBoundingClientRect();const canvas=s.querySelector(':scope > div > div, :scope .relative.mx-auto')||s;const cr=canvas.getBoundingClientRect();const row=canvas.querySelectorAll(':scope .grid');const grid=row[0];const gr=grid.getBoundingClientRect();const cards=[...grid.children].filter(c=>{const r=c.getBoundingClientRect();return r.width>40});const info=cards.map(c=>{const r=c.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height)});const h2=s.querySelector('h2');const h2r=h2?h2.getBoundingClientRect():null;const secW=sr.width;const imgs=[...s.querySelectorAll('img')];const vertTitles=[...s.querySelectorAll('p')].filter(p=>{const wm=getComputedStyle(p).writingMode;return wm&&wm.includes('vertical')});return JSON.stringify({secW:Math.round(secW),secH:Math.round(sr.height),secLeft:Math.round(sr.left),secRight:Math.round(sr.right),canvasW:Math.round(cr.width),canvasH:Math.round(cr.height),canvasAspect:+(cr.width/cr.height).toFixed(3),rowW:Math.round(gr.width),rowH:Math.round(gr.height),rowLeftPct:+(100*(gr.left-sr.left)/secW).toFixed(1),rowRightPct:+(100*(sr.right-gr.right)/secW).toFixed(1),rowTopPct:+(100*(gr.top-sr.top)/sr.height).toFixed(1),rowHShare:+(100*gr.height/sr.height).toFixed(1),cards:info,cardAspects:cards.map(c=>{const r=c.getBoundingClientRect();return (r.width/r.height).toFixed(2)}),h2centerOffset:h2r?Math.round(h2r.left+h2r.width/2-(sr.left+secW/2)):null,vertTitles:vertTitles.length,imgCount:imgs.length,brokenImgs:imgs.filter(i=>!(i.complete&&i.naturalWidth>0)).length,overflowX:document.documentElement.scrollWidth-document.documentElement.clientWidth,overflowXBody:document.body.scrollWidth-document.body.clientWidth})})()"