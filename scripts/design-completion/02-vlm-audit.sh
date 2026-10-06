#!/bin/bash
# DESIGN COMPLETION PASS — VLM audit of BEFORE shots (brutal design critique)
cd /home/z/my-project
mkdir -p /tmp/vlm-dc
B=/home/z/my-project/download/qa-design-completion/before
run() {
  local name="$1"; local prompt="$2"; local img="$3"
  if [ -s "/tmp/vlm-dc/$name.json" ]; then echo "skip $name"; return; fi
  z-ai vision -p "$prompt" -i "$img" -o "/tmp/vlm-dc/$name.json" >/dev/null 2>&1
  if [ -s "/tmp/vlm-dc/$name.json" ]; then echo "ok $name"; else echo "FAIL $name"; fi
}

CRIT="Brutal senior product designer audit of this music app screen (dark theme, target: QUIET LUXURY / EDITORIAL / SPATIAL). Answer with a numbered list, be specific with locations: 1) CARDS: solid opaque or cheap/transparent/glassy? all identical (same-card-x20 problem)? corner radius — too uniform or good hierarchy? artwork clipped cleanly to card radius? 2) BOX-IN-BOX: nested surfaces inside surfaces (card inside card inside glass)? where exactly? 3) BACKGROUND: flat black, cheap single gradient, or atmospheric depth? does it feel alive or static? 4) TYPOGRAPHY: hierarchy clean or muddy? sizes sensible? 5) DENSITY: oversized blocks, dead zones, excessive padding, wasted space? 6) CONTROLS: buttons flat or 3D/chrome? 7) ACCENTS: red used tastefully (rare) or as default everywhere? 8) TOP-3 cheapest-looking elements on this screen and why. 9) Score /10 for premium feel."

run d-home "$CRIT" $B/d1440-01-home.png
run d-wave "$CRIT" $B/d1440-02-wave.png
run d-search "$CRIT" $B/d1440-03-search.png
run d-artist "$CRIT Art critique focus: artist page hero, tracklist rows, action buttons." $B/d1440-12-artist.png
run d-library "$CRIT" $B/d1440-04-library.png
run d-chats "$CRIT" $B/d1440-05-chats.png
run d-settings "$CRIT" $B/d1440-06-settings.png
run d-fullplayer "$CRIT Full player focus: artwork geometry, control sizes, queue/lyrics tabs." $B/d1440-07-fullplayer.png
run d-queue "$CRIT" $B/d1440-08-queue.png
run d-contextmenu "$CRIT Floating menu focus: material quality, spacing, icons." $B/d1440-09-contextmenu.png
run m-home "$CRIT This is MOBILE 390px. Extra: one-hand reach, nav weight, hero size vs content visible, compact+premium?" $B/m390-01-home.png
run m-wave "$CRIT This is MOBILE 390px. Extra: artwork size vs screen, composition balance, next-up compactness." $B/m390-02-wave.png
run m-fullplayer "$CRIT This is MOBILE 390px fullscreen player." $B/m390-fullplayer.png
run m-library "$CRIT This is MOBILE 390px." $B/m390-library.png
run m-search "$CRIT This is MOBILE 390px." $B/m390-search.png
run m-artist "$CRIT This is MOBILE 390px." $B/m390-artist.png
run m-settings "$CRIT This is MOBILE 390px." $B/m390-settings.png
run m-chats "$CRIT This is MOBILE 390px." $B/m390-chats.png

echo ALL-DONE
