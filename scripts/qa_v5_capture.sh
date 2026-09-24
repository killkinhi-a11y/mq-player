#!/bin/bash
# v4 chrome-trails capture: server + browser in ONE call (bg procs die between calls)
# Usage: qa_v4_capture.sh [suffix]   -> download/playlist-ref-qa/*-v5<suffix>.png
set -u
cd /home/z/my-project
SUF="${1:-}"
PORT=3111
LOG=/tmp/mq-prod-v5.log

# 1. Start production server (fresh, no stale manifest)
pkill -9 -f next-server 2>/dev/null; sleep 1
npx next start -p $PORT > "$LOG" 2>&1 &
SRV=$!
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 4 "http://localhost:$PORT/" 2>/dev/null)
  [ "$code" != "000" ] && break
  sleep 2
done
echo "server: $code (pid $SRV)"

export AGENT_BROWSER_SESSION="mq-playlists-v5"
agent-browser session id --scope worktree >/dev/null 2>&1 || true

# 2. Desktop 1440x900
agent-browser set viewport 1440 900 >/dev/null
agent-browser open "http://localhost:$PORT/" >/dev/null
agent-browser wait 2500
# Inject QA store (3 curated playlists) if not present
agent-browser eval "(() => {   const raw = localStorage.getItem('mq-store-v8');   const ok = raw && JSON.parse(raw).state?.playlists?.length === 3;   if (!ok) {     localStorage.setItem('mq-store-v8', JSON.parse(atob('IntcInN0YXRlXCI6e1wiY3VycmVudFRoZW1lXCI6XCJkZWZhdWx0XCIsXCJjdXN0b21BY2NlbnRcIjpudWxsLFwiYW5pbWF0aW9uc0VuYWJsZWRcIjp0cnVlLFwicmVkdWNlTW90aW9uXCI6ZmFsc2UsXCJjb21wYWN0TW9kZVwiOmZhbHNlLFwiZm9udFNpemVcIjoxNixcImxpcXVpZEdsYXNzRW5hYmxlZFwiOmZhbHNlLFwibGlxdWlkR2xhc3NNb2JpbGVcIjpmYWxzZSxcImN1cnJlbnRTdHlsZVwiOlwiXCIsXCJzdHlsZVZhcmlhbnRcIjpcIlwiLFwidm9sdW1lXCI6NzAsXCJzaHVmZmxlXCI6ZmFsc2UsXCJyZXBlYXRcIjpcIm9mZlwiLFwicGxheWJhY2tSYXRlXCI6MSxcImN1cnJlbnRUcmFja1wiOm51bGwsXCJxdWV1ZVwiOlt7XCJpZFwiOlwiZGVtby0xXCIsXCJ0aXRsZVwiOlwiQW1iaWVudCBEcmVhbXNcIixcImFydGlzdFwiOlwiTVEgRGVtb1wiLFwiYWxidW1cIjpcIkRlbW8gQ29sbGVjdGlvblwiLFwiZHVyYXRpb25cIjo0MCxcImNvdmVyXCI6XCIvaWNvbi01MTIucG5nXCIsXCJnZW5yZVwiOlwiYW1iaWVudFwiLFwic291cmNlXCI6XCJkZW1vXCIsXCJzY1RyYWNrSWRcIjowLFwiYXVkaW9VcmxcIjpcIi9kZW1vL3NvbmcxLm1wM1wifSx7XCJpZFwiOlwiZGVtby0yXCIsXCJ0aXRsZVwiOlwiRWxlY3Ryb25pYyBQdWxzZVwiLFwiYXJ0aXN0XCI6XCJNUSBEZW1vXCIsXCJhbGJ1bVwiOlwiRGVtbyBDb2xsZWN0aW9uXCIsXCJkdXJhdGlvblwiOjQwLFwiY292ZXJcIjpcIi9pY29uLTUxMi5wbmdcIixcImdlbnJlXCI6XCJlbGVjdHJvbmljXCIsXCJzb3VyY2VcIjpcImRlbW9cIixcInNjVHJhY2tJZFwiOjAsXCJhdWRpb1VybFwiOlwiL2RlbW8vc29uZzIubXAzXCJ9LHtcImlkXCI6XCJkZW1vLTNcIixcInRpdGxlXCI6XCJKYXp6IEV2ZW5pbmdcIixcImFydGlzdFwiOlwiTVEgRGVtb1wiLFwiYWxidW1cIjpcIkRlbW8gQ29sbGVjdGlvblwiLFwiZHVyYXRpb25cIjo0MCxcImNvdmVyXCI6XCIvaWNvbi01MTIucG5nXCIsXCJnZW5yZVwiOlwiamF6elwiLFwic291cmNlXCI6XCJkZW1vXCIsXCJzY1RyYWNrSWRcIjowLFwiYXVkaW9VcmxcIjpcIi9kZW1vL3NvbmczLm1wM1wifSx7XCJpZFwiOlwiZGVtby00XCIsXCJ0aXRsZVwiOlwiUm9jayBFbmVyZ3lcIixcImFydGlzdFwiOlwiTVEgRGVtb1wiLFwiYWxidW1cIjpcIkRlbW8gQ29sbGVjdGlvblwiLFwiZHVyYXRpb25cIjo0MCxcImNvdmVyXCI6XCIvaWNvbi01MTIucG5nXCIsXCJnZW5yZVwiOlwicm9ja1wiLFwic291cmNlXCI6XCJkZW1vXCIsXCJzY1RyYWNrSWRcIjowLFwiYXVkaW9VcmxcIjpcIi9kZW1vL3Nvbmc0Lm1wM1wifV0sXCJxdWV1ZUluZGV4XCI6MCxcInVwTmV4dFwiOltdLFwiY3VycmVudFBsYXlsaXN0SWRcIjpudWxsLFwiY3Jvc3NmYWRlRW5hYmxlZFwiOnRydWUsXCJjcm9zc2ZhZGVEdXJhdGlvblwiOjIsXCJ3YXNtRW5naW5lRW5hYmxlZFwiOmZhbHNlLFwicmVwbGF5R2FpbkVuYWJsZWRcIjpmYWxzZSxcImlzQXV0aGVudGljYXRlZFwiOnRydWUsXCJ1c2VySWRcIjpcImRlbW8tdXNlci1pZFwiLFwidXNlcm5hbWVcIjpcItCU0LXQvNC+XCIsXCJlbWFpbFwiOlwiZGVtb0BtcS1wbGF5ZXIuaW50ZXJuYWxcIixcImF2YXRhclwiOm51bGwsXCJ1c2VyUm9sZVwiOlwidXNlclwiLFwibWVzc2FnZXNcIjpbXSxcInVucmVhZENvdW50c1wiOnt9LFwiY29udGFjdHNcIjpbXSxcImN1cnJlbnRWaWV3XCI6XCJtYWluXCIsXCJsaWtlZFRyYWNrSWRzXCI6W10sXCJkaXNsaWtlZFRyYWNrSWRzXCI6W10sXCJkaXNsaWtlZFRyYWNrc0RhdGFcIjpbXSxcImxpa2VkVHJhY2tzRGF0YVwiOltdLFwiZGlzbGlrZWRUYWdzXCI6W10sXCJmYXZvcml0ZUFydGlzdHNcIjpbXSxcIm9uYm9hcmRpbmdDb21wbGV0ZVwiOnRydWUsXCJwbGF5bGlzdHNcIjpbe1wiaWRcIjpcInBsXzE3OTAyMDgxNzA2NzFfcWNrdmpiXCIsXCJuYW1lXCI6XCJBLiBLLiAgbWFzdGVyIG9mIGNlcmVtb255XCIsXCJkZXNjcmlwdGlvblwiOlwiXCIsXCJjb3ZlclwiOlwiL2FwaS9tdXNpYy9zb3VuZGNsb3VkL2ltYWdlLXByb3h5P3VybD1odHRwcyUzQSUyRiUyRmkxLnNuZGNkbi5jb20lMkZhcnR3b3Jrcy1NdEVMaDhmYnZ3NDFmVXNCLVpYa3JWQS10NTAweDUwMC5qcGdcIixcInRyYWNrc1wiOlt7XCJpZFwiOlwic2NfMjIyMzE0NzU1NFwiLFwidGl0bGVcIjpcIlBlcnNpYW4gR2lybFwiLFwiYXJ0aXN0XCI6XCJBLiBLLiAgbWFzdGVyIG9mIGNlcmVtb255XCIsXCJhbGJ1bVwiOlwiXCIsXCJkdXJhdGlvblwiOjI1MyxcImNvdmVyXCI6XCIvYXBpL211c2ljL3NvdW5kY2xvdWQvaW1hZ2UtcHJveHk/dXJsPWh0dHBzJTNBJTJGJTJGaTEuc25kY2RuLmNvbSUyRmFydHdvcmtzLU10RUxoOGZidnc0MWZVc0ItWlhrclZBLXQ1MDB4NTAwLmpwZ1wiLFwiZ2VucmVcIjpcImRlZXAgaG91c2VcIixcInNvdXJjZVwiOlwic291bmRjbG91ZFwiLFwic2NUcmFja0lkXCI6MjIyMzE0NzU1NCxcInNjU3RyZWFtUG9saWN5XCI6XCJBTExPV1wiLFwic2NJc0Z1bGxcIjp0cnVlLFwiYXVkaW9VcmxcIjpcIlwiLFwicHJldmlld1VybFwiOlwiXCJ9XSxcImNyZWF0ZWRBdFwiOjE3OTAyMDgxNzA2NzF9LHtcImlkXCI6XCJwbF8xNzkwMjA4MTcyMjgxX3lhdHVidlwiLFwibmFtZVwiOlwiVGhhbmggVMO5bmdcIixcImRlc2NyaXB0aW9uXCI6XCJcIixcImNvdmVyXCI6XCIvYXBpL211c2ljL3NvdW5kY2xvdWQvaW1hZ2UtcHJveHk/dXJsPWh0dHBzJTNBJTJGJTJGaTEuc25kY2RuLmNvbSUyRmF2YXRhcnMtcGdqWmFPSUQ0M3Y5bTMyUy16ZlNSQlEtdDUwMHg1MDAuanBnXCIsXCJ0cmFja3NcIjpbe1wiaWRcIjpcInNjXzIxNzQ0NDg3MDhcIixcInRpdGxlXCI6XCJDw6AgUGjDqiDEkOG6r25nIFRpbSBBbmggxJBhdSBMb2ZpIENoaWxsXCIsXCJhcnRpc3RcIjpcIlRoYW5oIFTDuW5nXCIsXCJhbGJ1bVwiOlwiXCIsXCJkdXJhdGlvblwiOjI0OCxcImNvdmVyXCI6XCIvYXBpL211c2ljL3NvdW5kY2xvdWQvaW1hZ2UtcHJveHk/dXJsPWh0dHBzJTNBJTJGJTJGaTEuc25kY2RuLmNvbSUyRmF2YXRhcnMtcGdqWmFPSUQ0M3Y5bTMyUy16ZlNSQlEtdDUwMHg1MDAuanBnXCIsXCJnZW5yZVwiOlwiXCIsXCJzb3VyY2VcIjpcInNvdW5kY2xvdWRcIixcInNjVHJhY2tJZFwiOjIxNzQ0NDg3MDgsXCJzY1N0cmVhbVBvbGljeVwiOlwiQUxMT1dcIixcInNjSXNGdWxsXCI6dHJ1ZSxcImF1ZGlvVXJsXCI6XCJcIixcInByZXZpZXdVcmxcIjpcIlwifV0sXCJjcmVhdGVkQXRcIjoxNzkwMjA4MTcyMjgxfSx7XCJpZFwiOlwicGxfMTc5MDIwNzg0NzAyNl9tZWprY3JcIixcIm5hbWVcIjpcIkJ5INCY0L3QtNC40Y9cIixcImRlc2NyaXB0aW9uXCI6XCJcIixcImNvdmVyXCI6XCIvYXBpL211c2ljL3NvdW5kY2xvdWQvaW1hZ2UtcHJveHk/dXJsPWh0dHBzJTNBJTJGJTJGaTEuc25kY2RuLmNvbSUyRmFydHdvcmtzLWt1cGdNRTA2YjhhRnFkdW8tTUJhZDJ3LXQ1MDB4NTAwLmpwZ1wiLFwidHJhY2tzXCI6W3tcImlkXCI6XCJzY18yMzE2Mzk2MTU1XCIsXCJ0aXRsZVwiOlwi0KjQsNC00Y0gKGZlYXQuIFhjaG8sINCc0J7QoilcIixcImFydGlzdFwiOlwiQnkg0JjQvdC00LjRj1wiLFwiYWxidW1cIjpcIlwiLFwiZHVyYXRpb25cIjoxNTgsXCJjb3ZlclwiOlwiL2FwaS9tdXNpYy9zb3VuZGNsb3VkL2ltYWdlLXByb3h5P3VybD1odHRwcyUzQSUyRiUyRmkxLnNuZGNkbi5jb20lMkZhcnR3b3Jrcy1rdXBnTUUwNmI4YUZxZHVvLU1CYWQydy10NTAweDUwMC5qcGdcIixcImdlbnJlXCI6XCJwb3BcIixcInNvdXJjZVwiOlwic291bmRjbG91ZFwiLFwic2NUcmFja0lkXCI6MjMxNjM5NjE1NSxcInNjU3RyZWFtUG9saWN5XCI6XCJBTExPV1wiLFwic2NJc0Z1bGxcIjp0cnVlLFwiYXVkaW9VcmxcIjpcIlwiLFwicHJldmlld1VybFwiOlwiXCJ9XSxcImNyZWF0ZWRBdFwiOjE3OTAyMDc4NDcwMjZ9XSxcImhpc3RvcnlcIjpbXSxcInRyYWNrRmVlZGJhY2tcIjp7fSxcImZlZWRiYWNrQmF0Y2hcIjp7XCJjb21wbGV0ZWRHZW5yZXNcIjpbXSxcInNraXBwZWRHZW5yZXNcIjpbXSxcImNvbXBsZXRlZEFydGlzdHNcIjpbXSxcInNraXBwZWRBcnRpc3RzXCI6W10sXCJnZW5yZUxpc3RlblRpbWVzXCI6e30sXCJhcnRpc3RMaXN0ZW5UaW1lc1wiOnt9LFwibGFzdFN5bmNcIjowLFwicGVuZGluZ0NvdW50XCI6MH0sXCJjYXRFbmFibGVkXCI6ZmFsc2UsXCJjYXRGcmVxdWVuY3lcIjpcIm5vcm1hbFwiLFwiY2F0TW9vZFwiOlwiY2hpbGxcIixcImNhdFNpemVcIjpcIm1lZGl1bVwiLFwiY2F0TGFzdFNlZW5cIjowLFwiY2F0UGV0Q291bnRcIjowLFwiZXFFbmFibGVkXCI6ZmFsc2UsXCJlcUJhbmRzXCI6WzAsMCwwLDAsMCwwLDAsMCwwLDBdLFwiZXFQcmVzZXRcIjpcImZsYXRcIixcImxpbWl0ZXJFbmFibGVkXCI6ZmFsc2UsXCJsaW1pdGVyVGhyZXNob2xkXCI6LTEsXCJ0YXN0ZUdlbnJlc1wiOnt9LFwidGFzdGVBcnRpc3RzXCI6e30sXCJ0YXN0ZU1vb2RzXCI6e30sXCJleGNsdWRlZEFydGlzdHNcIjpbXSxcIl9jb2JhbHRKd3RcIjpudWxsLFwiX2NvYmFsdEp3dEV4cGlyeVwiOm51bGx9LFwidmVyc2lvblwiOjEyfSIK')));     location.assign('/'); return 'injected+navigating'; } return 'store present'; })()"
agent-browser open "http://localhost:$PORT/" >/dev/null
agent-browser wait 3000
# Demo-auth is cleared on every rehydration (M1) — click "Демо-режим" after
# the backup (playlists survive the clear) has been rehydrated.
agent-browser eval "(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Демо-режим'); if (!b) return 'NO DEMO BTN'; b.click(); return 'demo clicked'; })()"
agent-browser wait 4500
agent-browser eval "(() => { const s = document.querySelector('section[aria-label=\"Плейлисты\"]'); return s ? 'SECTION OK, playlists=' + (localStorage.getItem('mq-store-v8')||'').length : 'STILL NO SECTION: ' + document.querySelector('h1,h2')?.textContent; })()"

# Scroll playlists section to the v3 baseline position (section top ~= 55px)
agent-browser eval "(() => {
  const sec = document.querySelector('section[aria-label=\"Плейлисты\"]');
  if (!sec) return 'NO SECTION';
  const y = window.scrollY + sec.getBoundingClientRect().top - 55;
  window.scrollTo(0, y);
  return 'scrolled to ' + y;
})()"
agent-browser wait 1200

# DOM telemetry: verify geometry + band imgs + overflow
agent-browser eval "(() => {
  const sec = document.querySelector('section[aria-label=\"Плейлисты\"]');
  const r = sec.getBoundingClientRect();
  const hero = sec.querySelector('[role=button]');
  const hr = hero.getBoundingClientRect();
  const strips = [...sec.querySelectorAll('[role=button]')].slice(1, 4).map(e => e.getBoundingClientRect());
  const bandHost = sec.querySelector('div[aria-hidden=true].absolute.inset-x-0.bottom-0, div[style*=\"23.3%\"]');
  // band = the last absolute overflow-hidden host inside section (desktop)
  const hosts = [...sec.querySelectorAll('div')].filter(d => d.className && String(d.className).includes && String(d.className).includes('overflow-hidden') && d.getAttribute('aria-hidden') === 'true');
  const bh = hosts.length ? hosts[hosts.length-1].getBoundingClientRect() : null;
  const bandImgs = bh ? document.elementsFromPoint(bh.left + bh.width/2, bh.top + bh.height/2)
    .filter(e => e.tagName === 'IMG') : [];
  const cs = bandImgs.length ? getComputedStyle(bandImgs[0]) : null;
  const vtitle = hero.querySelector('p[title]');
  const vcs = vtitle ? getComputedStyle(vtitle) : null;
  const strip1 = strips[0];
  return JSON.stringify({
    sec: {top: +r.top.toFixed(1), h: +r.height.toFixed(1), w: +r.width.toFixed(1)},
    scrollY: window.scrollY,
    hero: {x: +hr.left.toFixed(1), y: +hr.top.toFixed(1), w: +hr.width.toFixed(1), h: +hr.height.toFixed(1)},
    strip1: strip1 ? {x: +strip1.left.toFixed(1), w: +strip1.width.toFixed(1), h: +strip1.height.toFixed(1)} : null,
    band: bh ? {y: +bh.top.toFixed(1), h: +bh.height.toFixed(1), x: +bh.left.toFixed(1), w: +bh.width.toFixed(1)} : null,
    bandImgCount: bandImgs.length,
    bandImgTransform: cs ? cs.transform + ' | filter: ' + cs.filter + ' | opacity: ' + cs.opacity : null,
    vtitleFont: vcs ? vcs.fontSize + ' / stripW ' + (strip1 ? strip1.width.toFixed(1) : '?') : null,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    brokenImgs: [...document.images].filter(i => i.complete && i.naturalWidth === 0).length
  });
})()"

agent-browser screenshot "download/playlist-ref-qa/desktop-final-v5${SUF}.png"
echo "desktop shot done"

# 3. Mobile 390x844
agent-browser set viewport 390 844 >/dev/null
agent-browser wait 800
agent-browser eval "(() => { const sec = document.querySelector('section[aria-label=\'Плейлисты\']'); const bandHost = [...sec.querySelectorAll('div')].find(d => (d.getAttribute('style')||'').includes('height: 110px')); if (!bandHost) return 'NO BAND'; const r = bandHost.getBoundingClientRect(); const target = Math.max(0, window.scrollY + r.top + r.height - 844 + 36); window.scrollTo(0, target); return 'band h=' + r.height + ' -> scroll ' + target; })()"
agent-browser wait 1200
# re-scroll: content above may have grown after first scroll (images/hydration)
agent-browser eval "(() => { const sec = document.querySelector('section[aria-label=\'Плейлисты\']'); const bandHost = [...sec.querySelectorAll('div')].find(d => (d.getAttribute('style')||'').includes('height: 110px')); if (!bandHost) return 'NO BAND'; const r = bandHost.getBoundingClientRect(); const target = Math.max(0, window.scrollY + r.top + r.height - 844 + 36); window.scrollTo(0, target); return 're-scroll -> ' + target; })()"
agent-browser wait 900
agent-browser eval "(() => { const sec = document.querySelector('section[aria-label=\'Плейлисты\']'); const bandHost = [...sec.querySelectorAll('div')].find(d => (d.getAttribute('style')||'').includes('height: 110px')); const r = bandHost ? bandHost.getBoundingClientRect() : null; return JSON.stringify({scrollY: window.scrollY, overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, imgs: [...document.images].filter(i => i.complete && i.naturalWidth === 0).length, band: r ? {y: +r.top.toFixed(1), h: +r.height.toFixed(1), w: +r.width.toFixed(1)} : null}); })()"
agent-browser screenshot "download/playlist-ref-qa/mobile-final-v5${SUF}.png"
echo "mobile shot done"

# 4. Stop server (browser daemon stays for follow-ups)
kill $SRV 2>/dev/null; pkill -9 -f next-server 2>/dev/null
echo "capture complete"
