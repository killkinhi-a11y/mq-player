#!/bin/bash
# V2 — VLM audit of the new SEARCH HOME (before query) states + materials.
cd /home/z/my-project
mkdir -p /tmp/vlm-v2
L="/home/z/my-project/download/qa-v2/local"

run() {
  local name="$1"; local prompt="$2"; local img="$3"
  if [ -s "/tmp/vlm-v2/$name.json" ]; then echo "skip $name"; return; fi
  z-ai vision -p "$prompt" -i "$img" -o "/tmp/vlm-v2/$name.json" >/dev/null 2>&1
  if [ -s "/tmp/vlm-v2/$name.json" ]; then echo "ok $name"; else echo "FAIL $name"; fi
}

COLD_D="Music app search screen BEFORE any query, fresh profile (desktop, full page). A) Is there a featured discovery card with artwork + play? B) Track rows section? C) Genre tiles grid? D) Popular query chips? E) Does it feel like a FINISHED discovery product or an empty/technical state? F) Are headings compact (not giant)? Verdict: COLD-START-PREMIUM or COLD-START-WEAK."

WARM_D="Music app search screen BEFORE any query, user WITH history (desktop, full page). A) Featured card with artwork ('Продолжить слушать')? B) 'Слушали недавно' track rows? C) 'Недавние запросы' as compact ROWS with icons (not pills/chips)? D) 'Быстрый доступ' compact tiles? E) Artist avatar strip? F) Popular chips? G) Different visual densities (hero card vs rows vs tiles vs chips) or one repeated card style? Verdict: DISCOVERY-EDITORIAL or UNIFORM."

WARM_M="MOBILE 390px music app search screen BEFORE any query, full page. A) Compact search field (not giant)? B) Featured card sized for mobile (not huge)? C) Track rows readable + touch friendly? D) Recent queries as rows? E) Genre tiles 2-col? F) Any horizontal overflow or cramped elements? Verdict: MOBILE-COMPOSED or CRAMPED."

AFTER_D="Music app SEARCH RESULTS for 'кино' (desktop). A) TOP RESULT hero card separate from rows? B) Mixed layouts (hero/rows/artist rows/album tiles)? C) Typography ladder (display title vs section vs track vs meta)? D) Is the primary play button on the hero a FLAT translucent glass button (NOT a solid metallic silver disc, NOT 3D chrome)? E) Progress/fill colors: solid light or metallic gradient? Verdict: EDITORIAL-PREMIUM + FLAT-GLASS or ISSUES(name)."

AFTER_M="MOBILE 390px search results for 'кино'. A) Top result card + clean rows? B) Compact composition for one hand? C) Play button flat glass (not metallic)? Verdict: MOBILE-COMPOSED or CRAMPED."

run cold-desktop "$COLD_D" $L/d1440-search-before-cold-full.png
run warm-desktop "$WARM_D" $L/d1440-search-before-warm-full.png
run warm-mobile "$WARM_M" $L/m390-search-before-warm-full.png
run after-desktop "$AFTER_D" $L/d1440-search-after-kino.png
run after-mobile "$AFTER_M" $L/m390-search-after-kino.png

echo ""; echo "=== verdicts ==="
for f in /tmp/vlm-v2/*.json; do
  echo "--- $(basename $f .json) ---"
  cat "$f" | python3 -c "import json,sys; d=json.load(sys.stdin); c=d.get('choices',[{}])[0].get('message',{}).get('content',''); print(c[:800])" 2>/dev/null || head -c 400 "$f"
  echo ""
done
