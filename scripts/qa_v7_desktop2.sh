#!/bin/bash
# v7 MICRO-PASS LOCAL QA — DESKTOP part 2 (fix-ups)
# - accordion expand/collapse/reopen with the available STRIP card
# - strip (middle/last) card click -> full page (with proper re-scroll)
set -u
export AGENT_BROWSER_SESSION="mq-v7-local-desktop"
agent-browser session id --scope worktree >/dev/null 2>&1 || true
AB="agent-browser"
T="http://127.0.0.1:3111"
OUT="/home/z/my-project/download/playlist-ref-qa"

# helper: scroll section into view
scrollsec() {
  $AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); if(!sec) return 'NO SECTION'; const y=window.scrollY+sec.getBoundingClientRect().top-70; window.scrollTo(0,y); return 'scrolled'; })()" >/dev/null
}
# helper: viewport xy of card N (0=hero), center-top area (avoids CTA)
cardxy() {
  $AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100); const i=Math.min($1,cards.length-1); const r=cards[i].getBoundingClientRect(); return Math.round(r.left+r.width*0.5)+' '+Math.round(r.top+r.height*0.25); })()" | tr -d '"'
}
widths() {
  $AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); return JSON.stringify([...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>Math.round(e.getBoundingClientRect().width))); })()"
}
fullpage() {
  $AB eval "(() => {
    const view=document.querySelector('main')?.dataset.view;
    const back=[...document.querySelectorAll('button')].some(b=>b.offsetParent&&b.textContent.trim()==='Назад');
    const titles=[...document.querySelectorAll('h2')].map(h=>h.textContent.trim()).filter(t=>t&&t!=='Публичные плейлисты'&&!/версия/i.test(t));
    const playAll=[...document.querySelectorAll('button')].some(b=>b.offsetParent&&/Play all/.test(b.textContent));
    const rows=[...document.querySelectorAll('main [role=button]')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height>30&&e.getBoundingClientRect().height<120).length;
    const fromUser=[...document.querySelectorAll('p')].some(p=>p.offsetParent&&/^от @/.test(p.textContent.trim()));
    const desc=[...document.querySelectorAll('p')].some(p=>p.offsetParent&&/подобран|открыти|популярн/i.test(p.textContent.trim()));
    const overflowX=document.documentElement.scrollWidth-document.documentElement.clientWidth;
    return JSON.stringify({view,back,title:titles[0]||null,playAll,rows,fromUser,desc,overflowX});
  })()"
}

echo "--- A) accordion: hover strip -> expand ---"
scrollsec; $AB wait 600
XY=$(cardxy 1)
echo "strip xy: $XY"
$AB mouse move $XY; $AB wait 900
echo -n "expanded:  "; widths
$AB screenshot "$OUT/v7-desktop-hover-strip.png" >/dev/null

echo "--- B) leave row -> collapse ---"
$AB mouse move 720 120; $AB wait 900
echo -n "collapsed: "; widths

echo "--- C) hover again -> reopen (same strip) ---"
$AB mouse move $XY; $AB wait 900
echo -n "reopen:    "; widths
$AB mouse move 720 120; $AB wait 800

echo "--- D) STRIP (narrow/last) card CLICK -> full page ---"
scrollsec; $AB wait 600
SX=$(cardxy 1)
echo "strip click xy: $SX"
$AB mouse move $SX; $AB mouse down; $AB mouse up
$AB wait 1600
fullpage
$AB screenshot "$OUT/v7-desktop-fullpage-strip.png" >/dev/null

echo "--- E) track row click on the full page (playable tracks) ---"
$AB eval "(() => { const rows=[...document.querySelectorAll('main [role=button]')].filter(e=>e.offsetParent&&e.getBoundingClientRect().height>30&&e.getBoundingClientRect().height<120); if(!rows.length) return 'NO ROWS'; const r=rows[2]||rows[0]; const rr=r.getBoundingClientRect(); return Math.round(rr.left+rr.width*0.5)+' '+Math.round(rr.top+rr.height*0.5); })()" | tr -d '"' > /tmp/v7_row.txt
RX=$(cat /tmp/v7_row.txt)
echo "row xy: $RX"
$AB mouse move $RX; $AB mouse down; $AB mouse up
$AB wait 2500
$AB eval "(() => { try { const s=JSON.parse(localStorage.getItem('mq-store-v8')).state; return JSON.stringify({nowPlaying:s.currentTrack?s.currentTrack.title.slice(0,60):'none', isPlaying:s.isPlaying}); } catch(e){ return 'err'; } })()"

echo "--- F) Back -> Home; section + accordion state intact ---"
$AB eval "(() => { const b=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.trim()==='Главная'); if(!b) return 'NO HOME'; b.click(); return 'home'; })()"
$AB wait 1500
$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const cards=sec?[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100).map(e=>Math.round(e.getBoundingClientRect().width)):[]; return JSON.stringify({view:document.querySelector('main')?.dataset.view,secOk:!!sec,h2:sec?.querySelector('h2')?.textContent,cards}); })()"

echo "--- G) keyboard: Tab-focus strip -> expands; Enter -> full page ---"
scrollsec; $AB wait 500
$AB eval "(() => { const sec=document.querySelector('section[aria-label=\"Рекомендованные плейлисты\"]'); const cards=[...sec.querySelectorAll('[role=button]')].filter(e=>e.getBoundingClientRect().height>100); const strip=cards[cards.length-1]; strip.focus(); return 'focused: '+strip.getAttribute('aria-label')?.slice(0,50); })()"
$AB wait 900
echo -n "focus expanded: "; widths
$AB press Enter
$AB wait 1500
fullpage

echo "--- H) back home; console errors ---"
$AB eval "(() => { const b=[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.trim()==='Главная'); if(b)b.click(); return 'home'; })()"
$AB wait 1200
$AB console errors 2>/dev/null | grep -iv "^\[debug" | grep -v corrupt | head -5
echo "PART2 DONE"
