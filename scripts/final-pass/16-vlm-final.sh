#!/bin/bash
# FINAL VLM proof — production mq-build-138fab12
cd /home/z/my-project
mkdir -p /tmp/vlm-final
B=/home/z/my-project/download/qa-red-focus/prod-audit
run() {
  local name="$1"; local prompt="$2"; local img="$3"
  if [ -s "/tmp/vlm-final/$name.json" ]; then echo "skip $name"; return; fi
  z-ai vision -p "$prompt" -i "$img" -o "/tmp/vlm-final/$name.json" >/dev/null 2>&1
  if [ -s "/tmp/vlm-final/$name.json" ]; then echo "ok $name"; else echo "FAIL $name"; fi
}

NORMAL="Dark-theme premium music app (target: QUIET LUXURY / EDITORIAL). Answer briefly: 1) BACKGROUND: flat black, or living atmospheric depth (soft gradients/light pools/vignette)? 2) CARDS: solid opaque or cheap transparent/frosted? 3) Any RED element that is not a heart/error/destructive? list. 4) Verdict: PREMIUM or CHEAP + one line why."
WAVES="Music app WAVE mode screen. Answer briefly: 1) The main WAVE surface (hero panel): does it have a CLEARLY VISIBLE rounded radius? solid (not transparent/blurred)? 2) Is the animated scene visible AROUND the surface? 3) Controls flat (no 3D/chrome)? 4) Any red badges or 'ВОЛНА/Играет' text labels near tracks? 5) Verdict: PREMIUM or CHEAP."
MAT="Music app floating surfaces. Answer briefly: 1) The player bar / menu: glass-morphism material with blur, sitting above content? premium or cheap? 2) Play controls: flat solid or 3D/chrome/glossy? 3) Any red elements? 4) Verdict."
MOB="Mobile music app screen. Answer briefly: 1) Density: comfortable or oversized blocks/giant headings/wasted space? 2) Navigation reachable one-handed (bottom)? 3) Any red default accents? 4) Verdict: COMPACT+PREMIUM or BLOATED/CHEAP."

run n-home    "$NORMAL" $B/d1440-01-home.png
run n-search  "$NORMAL" $B/d1440-02-search.png
run n-library "$NORMAL" $B/d1440-03-library.png
run n-settings "$NORMAL" $B/d1440-04-settings.png
run n-chats   "$NORMAL" $B/d1440-05-chats.png
run n-queue   "$NORMAL" $B/d1440-06-queue.png
run w-desk    "$WAVES" $B/d1440-10-wave.png
run w-mob     "$WAVES This is MOBILE 390px." $B/m390-05-wave.png
run mat-bar   "$MAT The floating player capsule at the bottom." $B/d1440-08-playerbar-mini.png
run mat-menu  "$MAT The open context menu." $B/d1440-09-contextmenu.png
run mat-full  "$MAT Full player screen: seek bar material + play button material." $B/d1440-07-fullplayer.png
run mob-375   "$MOB 375px wide." $B/m375-01-home.png
run mob-430   "$MOB 430px wide." $B/m430-01-home.png
run mob-390fp "$MOB 390px, fullscreen player." $B/m390-06-fullplayer.png

echo; echo "══════════ VERDICTS ══════════"
for f in /tmp/vlm-final/*.json; do
  echo "── $(basename $f .json) ──"
  python3 -c "import json; d=json.load(open('$f')); print((d.get('choices') or [{}])[0].get('message',{}).get('content','')[:520])" 2>/dev/null || head -c 300 "$f"
  echo
done
