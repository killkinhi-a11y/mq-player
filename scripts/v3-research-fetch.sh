#!/bin/bash
# V3 research: fetch GitHub metadata + README + LICENSE for all mandated projects
# Output: /home/z/my-project/download/v3-research/raw/<name>.json + <name>.md + <name>.license.txt
set -u
OUT=/home/z/my-project/download/v3-research/raw
mkdir -p "$OUT"

fetch() {
  local name="$1" repo="$2"
  # API metadata (stars, license, language, description, archived, pushed_at)
  curl -sL --max-time 30 -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$repo" -o "$OUT/$name.api.json"
  # README (try main then master)
  curl -sL --max-time 30 "https://raw.githubusercontent.com/$repo/master/README.md" -o "$OUT/$name.readme.md"
  if [ ! -s "$OUT/$name.readme.md" ] || head -1 "$OUT/$name.readme.md" | grep -q "404"; then
    curl -sL --max-time 30 "https://raw.githubusercontent.com/$repo/main/README.md" -o "$OUT/$name.readme.md"
  fi
  # LICENSE (first 60 lines)
  for br in main master; do
    curl -sL --max-time 20 "https://raw.githubusercontent.com/$repo/$br/LICENSE" 2>/dev/null | head -60 > "$OUT/$name.license.txt"
    if [ -s "$OUT/$name.license.txt" ] && ! head -1 "$OUT/$name.license.txt" | grep -q "404"; then break; fi
  done
  echo "DONE $name ($repo)"
}

fetch spotube        "KRTirtho/spotube" &
fetch rheoson        "picklem0b/Rheoson" &
fetch feishin        "jeffvli/feishin" &
fetch tonearm        "j4ckxyz/navidrome-client-web" &
fetch nuclear        "nukeop/nuclear" &
fetch navidrome      "navidrome/navidrome" &
wait
fetch koel           "koel/koel" &
fetch harmonoid      "harmonoid/harmonoid" &
fetch sonixd         "jeffvli/sonixd" &
fetch musicstation   "huangcheng/music-station" &
fetch wavesurf       "TheDecipherist/wavesurfer-react-player" &
fetch kopuz          "Kopuz-org/kopuz" &
wait
fetch spotiamp       "YANIV3487/spotiamp" &
fetch spotiampplus   "fdeox/spotiamp-plus" &
fetch librespot      "librespot-org/librespot" &
fetch spotifyplayer  "aome510/spotify-player" &
fetch golibrespot    "devgianlu/go-librespot" &
fetch youtubemusic   "th-ch/youtube-music" &
wait
echo "ALL FETCHES COMPLETE"
