#!/bin/bash
# FINAL DESIGN COMPLETION — VLM visual audit of the local QA matrix.
cd /home/z/my-project
mkdir -p /tmp/vlm-fdc
L="/home/z/my-project/download/qa-final-design/local"
C="/home/z/my-project/download/qa-final-design/compare"

run() {
  local name="$1"; local prompt="$2"; local img="$3"
  if [ -s "/tmp/vlm-fdc/$name.json" ]; then echo "skip $name"; return; fi
  z-ai vision -p "$prompt" -i "$img" -o "/tmp/vlm-fdc/$name.json" >/dev/null 2>&1
  if [ -s "/tmp/vlm-fdc/$name.json" ]; then echo "ok $name"; else echo "FAIL $name"; fi
}

THEME_P="Grid of 6 screenshots (2 rows x 3 cols) of the SAME premium music app home screen under 6 DIFFERENT color themes. For EACH cell (number them 1-6 left-to-right, top-to-bottom) name the dominant background atmosphere in 3-6 words (e.g. 'graphite + cold navy', 'emerald teal', 'warm amber', 'light silver paper'). Then answer: A) Do the 6 atmospheres look VISUALLY DISTINCT from each other (different hue/mood), while the UI structure stays recognizably the same product? B) Are any two cells nearly identical in background mood? Which? C) Do cards stay solid/readable in all 6? D) Verdict: THEMES-DISTINCT or THEMES-SAME."

run theme-normal "$THEME_P" $C/theme-normal-grid.jpg
run theme-wave "Grid of 6 screenshots (2x3) of a music app with a WAVE liquid-ambient mode ON, under 6 different color themes. For each cell (1-6) name the liquid scene mood in 3-6 words. A) Are the WAVE scenes distinct per theme? B) Do they all stay DARK and calm (no neon)? C) Is the rounded WAVE hero surface visible in all? D) Verdict: WAVE-THEME-AWARE or WAVE-SAME." $C/theme-wave-grid.jpg

run transition "Screenshot taken MID-TRANSITION while the app cross-fades between two color themes. A) Does it look like a smooth blend of two atmospheres (no hard split line, no white flash frame, no broken layout)? B) Any rendering artifacts (clipped gradients, bands, unstyled flash)? C) Verdict: SMOOTH or GLITCHY." $L/theme-transition-mid-abyss.png

run theme-daylight "Screenshot of a LIGHT theme (paper white) music app home screen. A) Does the background have soft atmospheric depth (not flat white)? B) Are cards, text and contrast readable? C) Any dark-theme leftovers (dark box, white-on-white text)? D) Verdict: LIGHT-THEME-OK or LIGHT-THEME-BROKEN." $L/theme-daylight-normal-home.png
run theme-daylight-wave "WAVE liquid mode on a LIGHT theme. A) Does the liquid scene stay dark and readable with light UI on top? B) Verdict: OK or BROKEN." $L/theme-daylight-wave-home.png

run search-results "Search results screen of a music app (query 'кино'). A) Is there a TOP RESULT hero card (bigger, with artwork and a play button) separate from the rest? B) Does the page use DIFFERENT layouts for different content (hero card / clean track rows / artist rows / album tiles) instead of one uniform card list? C) Describe the typography hierarchy in one sentence (is there a clear title/section/track/artist ladder?). D) Is the search field compact and solid (not a giant glass pill)? E) Verdict: EDITORIAL-MIXED or UNIFORM-LIST." $L/search-d-results-kino.png
run search-discovery "Music app search screen BEFORE any query. A) Does it show real discovery content (quick picks / recent chips / recently played rows / popular queries) instead of an empty screen? B) Is the composition editorial and calm, not overloaded? C) Verdict: DISCOVERY-STATE or EMPTY-SCREEN." $L/search-d-discovery.png
run search-focus "Music app search screen, the input HAS focus. A) Describe the focus indication color. B) Is it RED anywhere? YES/NO. C) Verdict: PREMIUM-NEUTRAL or RED-ERROR or INVISIBLE." $L/search-d-focus.png
run search-mobile "MOBILE 390px music app search RESULTS (query 'кино'). A) Is there a top-result card followed by clean track rows? B) Does the layout feel specially composed for mobile (compact field, readable rows, no cramped desktop feel)? C) Verdict: MOBILE-COMPOSED or CRAMPED." $L/search-m-results-kino.png

run before-after-results "Two screenshots of a music app SEARCH RESULTS screen side by side: LEFT = BEFORE (old design), RIGHT = AFTER (new design). A) Which side has a clearer hierarchy (hero top result + mixed layouts vs one uniform list)? B) Which looks more modern/premium overall? C) Name the single biggest improvement. D) Verdict: AFTER-BETTER or BEFORE-BETTER." $C/search-d-before-after.jpg

run tabs-desktop "Grid of screenshots of one music app: Home, Search, Library, Playlists, Chats, Settings, Queue, WAVE, Full Player, Context Menu, Player Bar. A) Do all screens share ONE design language (same card style, spacing, typography, background)? B) Name any screen that looks OLDER / less polished than the rest. C) Verdict: UNIFIED or LIST-LAGGARDS(name them)." $C/tabs-desktop-grid.jpg
run tabs-mobile "Grid of MOBILE screenshots of one music app: Home, Search, Library, Settings, WAVE, Full Player. A) Is the mobile UI compact and touch-friendly (no oversized blocks)? B) Any screen that feels cramped or overflowing? C) Verdict: MOBILE-PREMIUM or ISSUES(name them)." $C/tabs-mobile-grid.jpg

echo ""
echo "=== verdicts ==="
for f in /tmp/vlm-fdc/*.json; do
  echo "--- $(basename $f .json) ---"
  cat "$f" | python3 -c "import json,sys; d=json.load(sys.stdin); print(str(d.get('content') or d.get('data') or d)[:900])" 2>/dev/null || head -c 500 "$f"
  echo ""
done
