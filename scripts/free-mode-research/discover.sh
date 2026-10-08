#!/usr/bin/env bash
# Discovery searches for free-mode research
set -u
OUT=/home/z/my-project/scripts/free-mode-research/cache
mkdir -p "$OUT"

run() {
  local file="$1"; shift
  local query="$1"; shift
  local num="${1:-8}"
  if [ -s "$OUT/$file.json" ]; then echo "skip $file"; return; fi
  z-ai function -n web_search -a "{\"query\": $(python3 -c "import json,sys;print(json.dumps(sys.argv[1]))" "$query"), \"num\": $num}" -o "$OUT/$file.json" >/dev/null 2>&1 || echo "FAIL $file"
  echo "done $file"
}

run q01-tonearm          "Tonearm Navidrome web client github tamland"
run q02-music-station    "Music Station github music player ungive tui"
run q03-rheoson          "Rheoson github music streaming web app"
run q04-spotube-forks    "Spotube fork github active 2025 alternative audio source no login"
run q05-audius-player    "Audius music player open source github client"
run q06-soundcloud-player "SoundCloud open source web player github full tracks"
run q07-anonymous-music  "open source music player full songs without login github 2025"
run q08-spotube-status   "Spotube discontinued archived 2025"
run q09-audius-api       "Audius API full track stream anonymous developer docs"
run q10-ytmusic-clients  "InnerTune RiMusic ViMusic youtube music client no login github"

echo ALL-DONE
