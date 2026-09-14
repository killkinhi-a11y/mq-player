#!/bin/bash
# WEB vs ANDROID parity comparison — all screens (batch VLM)
cd /home/z/my-project
mkdir -p download/screens/parity/reports
declare -A pairs=(
  [search]="web-search-375.png android-search-375.png"
  [search-results]="web-search-375.png android-search-results-375.png"
  [library]="web-library-375.png android-library-375.png"
  [chats]="web-chats-375.png android-chats-375.png"
  [settings]="web-settings-375.png android-settings-375.png"
  [profile]="web-profile-375.png android-profile-375.png"
  [fullplayer]="web-fullplayer-375.png android-fullplayer-375.png"
  [mixer]="web-mixer-375.png android-mixer-375.png"
  [contextmenu]="web-contextmenu-375.png android-contextmenu-375.png"
)
for name in "${!pairs[@]}"; do
  set -- ${pairs[$name]}
  web=$1; android=$2
  out=download/screens/parity/reports/$name.json
  if [ ! -f "$out" ]; then
    timeout 150 z-ai vision \
      -p "Image 1 = web reference, image 2 = Android implementation of the same screen. Compare visual parity: layout structure, typography, colors, icon style, corner radii, spacing. List remaining differences ranked by visual impact (max 5, ignore data-content differences like different track names). End with a line exactly like 'PARITY: NN' where NN is a 0-100 score." \
      -i "download/screens/parity/$web" \
      -i "download/screens/parity/$android" \
      -o "$out" >/dev/null 2>&1
    echo "compared: $name"
  fi
done
echo "---SCORES---"
for f in download/screens/parity/reports/*.json; do
  n=$(basename "$f" .json)
  score=$(python3 -c "
import json
try:
    c = json.load(open('$f'))['choices'][0]['message']['content']
    import re
    m = re.search(r'PARITY:?\s*(\d+)', c)
    print(m.group(1) if m else '??')
except Exception:
    print('ERR')
")
  echo "$n: $score"
done
