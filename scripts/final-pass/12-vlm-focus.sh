#!/bin/bash
# RED FOCUS FIX — VLM visual proof of focus states (local, then production).
cd /home/z/my-project
mkdir -p /tmp/vlm-focus
B="${1:-/home/z/my-project/download/qa-red-focus/local}"
run() {
  local name="$1"; local prompt="$2"; local img="$3"
  if [ -s "/tmp/vlm-focus/$name.json" ]; then echo "skip $name"; return; fi
  z-ai vision -p "$prompt" -i "$img" -o "/tmp/vlm-focus/$name.json" >/dev/null 2>&1
  if [ -s "/tmp/vlm-focus/$name.json" ]; then echo "ok $name"; else echo "FAIL $name"; fi
}

PROMPT="This is a screenshot of a dark-theme music app where an input field or control has KEYBOARD/CLICK FOCUS. Look at the focused element (search input / slider / button / menu item). Answer precisely: 1) Is there a VISIBLE focus indication (outline ring, border lift, halo)? Describe its color. 2) Is the focus ring RED or red-orange anywhere (like #e03131)? YES/NO + where. 3) Does the focus styling look premium-neutral (soft white / silver / cool light) or like a CSS validation error? 4) One-line verdict: PREMIUM-NEUTRAL or RED-ERROR or INVISIBLE."

run search-click "$PROMPT" $B/d1440-01-search-click-focus.png
run search-tab "$PROMPT" $B/d1440-02-search-tab-focus.png
run settings-slider "$PROMPT This is a settings screen with an EQ/sliders section; one slider has focus." $B/d1440-04-settings-slider-focus.png
run button-focus "$PROMPT A nav/settings button has keyboard focus." $B/d1440-05-button-focus.png
run menu-item "$PROMPT A context menu is open; the first menu item has focus." $B/d1440-06-menu-item-focus.png
run mobile-search "$PROMPT This is MOBILE 390px; the search input has focus (keyboard may be closed)." $B/m390-01-search-focus.png

echo "=== verdicts ==="
for f in /tmp/vlm-focus/*.json; do
  echo "--- $(basename $f .json) ---"
  cat "$f" | python3 -c "import json,sys; d=json.load(sys.stdin); print(str(d.get('content') or d.get('data') or d)[:600])" 2>/dev/null || head -c 400 "$f"
done
