#!/bin/bash
# DESIGN COMPLETION — VLM audit of AFTER-local shots
cd /home/z/my-project
mkdir -p /tmp/vlm-dc-after
B=/home/z/my-project/download/qa-design-completion/after-local
run() {
  local name="$1"; local prompt="$2"; local img="$3"
  if [ -s "/tmp/vlm-dc-after/$name.json" ]; then echo "skip $name"; return; fi
  z-ai vision -p "$prompt" -i "$img" -o "/tmp/vlm-dc-after/$name.json" >/dev/null 2>&1
  if [ -s "/tmp/vlm-dc-after/$name.json" ]; then echo "ok $name"; else echo "FAIL $name"; fi
}

CRIT="This music app was just redesigned (dark theme, target: QUIET LUXURY / EDITORIAL / SPATIAL, solid cards, flat controls, rare red accent). Audit the RESULT: 1) BACKGROUND: flat black or living atmosphere (soft light pools, depth)? 2) CARDS: solid, clean corners, artwork clipped cleanly? any box-in-box (frame inside frame)? 3) BUTTONS: flat and premium or glossy/3D? 4) RED ACCENT: rare and tasteful or still everywhere (borders, CTAs, progress)? 5) Any remaining cheap-looking elements (with locations)? 6) Score /10 for premium feel vs before (be strict but fair)."

run d-home "$CRIT" $B/d1440-01-home.png
run d-wave "$CRIT" $B/d1440-02-wave.png
run d-search "$CRIT" $B/d1440-03-search.png
run d-artist "$CRIT" $B/d1440-12-artist.png
run d-library "$CRIT" $B/d1440-04-library.png
run d-chats "$CRIT" $B/d1440-05-chats.png
run d-settings "$CRIT" $B/d1440-06-settings.png
run d-fullplayer "$CRIT" $B/d1440-07-fullplayer.png
run d-queue "$CRIT" $B/d1440-08-queue.png
run m-home "$CRIT This is MOBILE 390px. Extra: compact+premium? one-hand friendly?" $B/m390-01-home.png
run m-wave "$CRIT This is MOBILE 390px. Extra: artwork clipping clean? bezel gone (single clean edge)?" $B/m390-02-wave.png
run m-fullplayer "$CRIT This is MOBILE 390px." $B/m390-fullplayer.png
run m-artist "$CRIT This is MOBILE 390px." $B/m390-artist.png
run m-settings "$CRIT This is MOBILE 390px." $B/m390-settings.png
run m-library "$CRIT This is MOBILE 390px." $B/m390-library.png

echo ALL-DONE
run d-contextmenu "$CRIT Floating context menu focus: glass material quality, spacing, icons, red usage." $B/d1440-09-contextmenu.png
echo ALL-DONE-2
