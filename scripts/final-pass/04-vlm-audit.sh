#!/bin/bash
# VLM audit runner — sequential, resilient
cd /home/z/my-project
mkdir -p /tmp/vlm
run() {
  local name="$1"; local prompt="$2"; local img="$3"
  if [ -s "/tmp/vlm/$name.json" ]; then echo "skip $name (exists)"; return; fi
  z-ai vision -p "$prompt" -i "$img" -o "/tmp/vlm/$name.json" >/dev/null 2>&1
  if [ -s "/tmp/vlm/$name.json" ]; then echo "ok $name"; else echo "FAIL $name"; fi
}

run home "Music app HOME screen (desktop 1440x900), dark theme. Brutal design audit: 1) Is the page background totally flat black/empty, or is there visible atmospheric depth (soft light pools, gradients, texture)? 2) Cards: solid opaque or transparent/blurry? All the same or varied? Rounded how much? 3) Typography hierarchy clean? red/accent labels noisy? 4) Dead zones, box-in-box, oversized elements, cheap details — list each with location." download/qa-final-pass/before/d1440-01-home.png

run chats "Music app CHATS screen (desktop 1440x900), dark theme. Brutal audit: 1) Background flat black or atmospheric? 2) Chat surfaces: solid or glass? radius? 3) Empty state premium or cheap? 4) Issues with locations?" download/qa-final-pass/before/d1440-05-chats.png

run settings "Music app SETTINGS screen (desktop 1440x900), dark theme. Brutal audit: 1) Background flat or atmospheric? 2) Setting cards: solid or glass? radius? 3) Active tab styling tasteful or noisy? 4) Issues with locations?" download/qa-final-pass/before/d1440-06-settings.png

run fullplayer "Music app FULL PLAYER overlay (desktop 1440x900), dark theme. Brutal audit: 1) Artwork geometry: rounded cleanly? box-in-box? 2) Controls: FLAT or 3D-looking (bevel, chrome, specular)? 3) Typography sizing sane? 4) Background treatment: flat or atmospheric? 5) Cheap details with locations?" download/qa-final-pass/before/d1440-07-fullplayer.png

run queue "Music app QUEUE panel (desktop 1440x900), dark theme. Brutal audit: 1) Queue rows: compact? solid? 2) Now-playing row labels: any decorative status badges like ИГРАЕТ / Сейчас играет that look noisy? 3) Background/hierarchy issues? List with locations." download/qa-final-pass/before/d1440-08-queue.png

run wave "Music app WAVE radio hero (desktop 1440x900), dark liquid background. THE key question: the main WAVE content block (artwork + title + controls) — does it sit inside a visible rounded container/surface, or float with NO defined geometry? Is there any rectangle that reads as an unrounded/invisible card? 2) Artwork rounding clean? 3) Controls flat? 4) 'Дальше в WAVE' shelf compact? 5) What looks cheap/unpolished? Locations." download/qa-final-pass/before/d1440-02-wave.png

run mhome "Music app MOBILE HOME (390x844). Brutal audit: 1) Is the hero/heading oversized for mobile? How much of the screen does the top content consume? 2) Cards oversized? 3) Bottom navigation: visually compact or heavy? 4) Typography: desktop-scale? 5) One-hand friendly? 6) Cheap details with locations." download/qa-final-pass/before/m390-01-home.png

run mwave "Music app MOBILE WAVE screen (390x844). Brutal audit: 1) Main WAVE content surface: visible rounded container or undefined geometry? 2) Artwork size vs screen — oversized? corners clean? 3) Title too big? 4) Controls flat? 5) 'Дальше в WAVE' compact? 6) Bottom nav footprint? 7) Cheap details with locations." download/qa-final-pass/before/m390-02-wave.png

run mlibrary "Music app MOBILE LIBRARY (390x844). Audit: background, cards solid/glass, radius, compactness, cheap details with locations." download/qa-final-pass/before/m390-library.png

run msettings "Music app MOBILE SETTINGS (390x844). Audit: background, cards, tabs styling, compactness, cheap details with locations." download/qa-final-pass/before/m390-settings.png

run msearch "Music app MOBILE SEARCH with results (390x844). Audit: background, result rows, radius, typography, cheap details with locations." download/qa-final-pass/before/m390-search.png

run mchats "Music app MOBILE CHATS (390x844). Audit: background, surfaces, empty state, cheap details with locations." download/qa-final-pass/before/m390-chats.png

echo ALL-DONE
