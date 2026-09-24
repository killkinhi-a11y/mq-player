#!/bin/bash
set -u
cd /home/z/my-project
PORT=3111
pkill -9 -f next-server 2>/dev/null; sleep 1
npx next start -p $PORT > /tmp/mq-prod-dbg.log 2>&1 &
SRV=$!
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 "http://localhost:$PORT/" 2>/dev/null)
  [ "$code" != "000" ] && break; sleep 2
done
echo "server: $code"
export AGENT_BROWSER_SESSION="mq-playlists-v4"
agent-browser set viewport 1440 900 >/dev/null
agent-browser open "http://localhost:$PORT/" >/dev/null
agent-browser wait 2500
B64=$(python3 -c "import base64;print(base64.b64encode(open('scripts/qa-store-backup.json','rb').read()).decode())")
# Inject + navigate in ONE JS turn — no timer window to clobber the store
agent-browser eval "(() => { localStorage.setItem('mq-store-v8', JSON.parse(atob('$B64'))); location.assign('/'); return 'injected+navigating'; })()"
agent-browser wait 3500
agent-browser eval "(() => { const s = JSON.parse(localStorage.getItem('mq-store-v8')||'{}'); return 'after reload: pls=' + (s.state?.playlists||[]).length + ' auth=' + s.state?.isAuthenticated; })()"
agent-browser eval "(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Демо-режим'); if (!b) return 'NO DEMO BTN: ' + location.href; b.click(); return 'demo clicked'; })()"
agent-browser wait 4500
agent-browser eval "(() => { const s = JSON.parse(localStorage.getItem('mq-store-v8')||'{}'); const sec = document.querySelector('section[aria-label=\'Плейлисты\']'); return JSON.stringify({pls: (s.state?.playlists||[]).length, section: !!sec, h: location.href}); })()"
agent-browser console 2>&1 | grep -iE "store|hydrat|migrat|playlist|demo|corrupt|error" | head -25
kill $SRV 2>/dev/null; pkill -9 -f next-server 2>/dev/null
