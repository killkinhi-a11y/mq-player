#!/bin/bash
# Interaction QA batch: play CTA, open playlist, actions menu, focus, hover.
set -u
snap() { agent-browser snapshot -i 2>/dev/null; }
ref_of() { grep -oE "$1 \[ref=[a-z0-9]+\]" | head -1 | grep -oE 'e[0-9]+'; }
clickpat() {
  local r; local i
  for i in 1 2 3; do
    r=$(snap | ref_of "$1")
    [ -n "$r" ] && agent-browser click "@$r" >/dev/null 2>&1 && return 0
    agent-browser wait 700 >/dev/null 2>&1
  done
  return 1
}

echo "=== 1. PLAY via expanded-card CTA ==="
CTA=$(snap | grep -oE 'button "Слушать — [^"]+" \[ref=[a-z0-9]+\]' | head -1 | grep -oE 'e[0-9]+')
if [ -z "$CTA" ]; then echo "CTA not found"; else
  agent-browser click "@$CTA" >/dev/null 2>&1; agent-browser wait 1600 >/dev/null 2>&1
  snap | grep -qE 'button "Пауза — ' && echo "PLAY_OK (CTA -> Пауза)" || echo "PLAY_FAIL"
fi

echo "=== 2. actions menu from strip more-chip ==="
MORE=$(snap | grep -oE 'button "Действия: [^"]+" \[ref=[a-z0-9]+\]' | grep -oE 'e[0-9]+' | head -1)
# pick the more-chip inside the playlists section (hover-chips are in-section)
agent-browser eval "(()=>{const s=document.querySelector('section[aria-label=\"Плейлисты\"]');const btn=[...s.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||'').startsWith('Действия:'));if(!btn)return 'no-more-chip';const r=btn.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)})})()"

echo "=== 3. OPEN playlist (click expanded card) ==="
CARD=$(snap | grep -oE 'button "Плейлист: [^"]+" \[ref=[a-z0-9]+\]' | head -1 | grep -oE 'e[0-9]+')
if [ -n "$CARD" ]; then
  agent-browser click "@$CARD" >/dev/null 2>&1; agent-browser wait 1600 >/dev/null 2>&1
  snap | grep -qE 'heading "[^"]+" \[level=1\]' && echo "OPEN_OK (playlist view)" || echo "OPEN_FAIL"
  # back home
  clickpat 'button "Главная"' && agent-browser wait 2200 >/dev/null 2>&1
else
  echo "card ref not found, click via aria-label selector"
  agent-browser eval "(()=>{const s=document.querySelector('section[aria-label=\"Плейлисты\"]');const c=[...s.querySelectorAll('[role=button]')].find(b=>(b.getAttribute('aria-label')||'').startsWith('Плейлист:'));if(c){c.click();return 'clicked'}return 'none'})()"
  agent-browser wait 1600 >/dev/null 2>&1
  snap | grep -qE 'heading "[^"]+" \[level=1\]' && echo "OPEN_OK (playlist view, via js)" || echo "OPEN_FAIL"
  clickpat 'button "Главная"' && agent-browser wait 2200 >/dev/null 2>&1
fi

echo "=== 4. keyboard focus outline ==="
agent-browser eval "(()=>{const s=document.querySelector('section[aria-label=\"Плейлисты\"]');if(!s)return 'NO_SECTION';const card=[...s.querySelectorAll('[role=button]')].find(b=>(b.getAttribute('aria-label')||'').startsWith('Плейлист:'));if(!card)return 'no-card';card.focus();const st=getComputedStyle(card);return JSON.stringify({outlineStyle:st.outlineStyle,outlineWidth:st.outlineWidth,outlineColor:st.outlineColor})})()"

echo "=== 5. hover: play-circle visibility (headless hover-media bypass) ==="
# headless reports (hover:hover)=false; replicate the compiled group-hover rule
# with an attribute selector, then use a REAL CDP hover + computed style check.
agent-browser eval "(()=>{const st=document.createElement('style');st.id='qa-hover-patch';st.textContent='[data-qa-group]:hover [data-qa-hover-el]{opacity:1 !important}';document.head.appendChild(st);const s=document.querySelector('section[aria-label=\"Плейлисты\"]');const strip=[...s.querySelectorAll('[role=button]')].filter(b=>(b.getAttribute('aria-label')||'').startsWith('Плейлист:')&&b.getBoundingClientRect().width<100)[0];if(!strip)return 'no-strip';strip.setAttribute('data-qa-group','');const circle=[...strip.querySelectorAll('[role=button],button')].find(b=>(b.getAttribute('aria-label')||'').startsWith('Играть'));if(!circle)return 'no-circle';circle.setAttribute('data-qa-hover-el','');const before=getComputedStyle(circle).opacity;strip.setAttribute('data-qa-group-hover','');return JSON.stringify({stripW:Math.round(strip.getBoundingClientRect().width),circleFound:true,opacityBeforeHover:before})})()"
echo "(patch applied; CDP hover next)"
