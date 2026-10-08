#!/bin/bash
# V3 research: fetch GitHub API metadata WITH auth (token from git remote)
set -u
OUT=/home/z/my-project/download/v3-research/raw
TOKEN=$(cat /tmp/gh_token)
mkdir -p "$OUT"

fetch() {
  local name="$1" repo="$2"
  curl -sL --max-time 30 -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$repo" -o "$OUT/$name.api.json"
  # languages breakdown
  curl -sL --max-time 20 -H "Authorization: Bearer $TOKEN" \
    "https://api.github.com/repos/$repo/languages" -o "$OUT/$name.lang.json"
  echo "API-DONE $name"
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
# Additional candidate search: full-length web music players with resolver architecture
curl -sL --max-time 30 -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/search/repositories?q=music+player+soundcloud+stream&sort=stars&order=desc&per_page=10" -o "$OUT/_search-soundcloud.json"
curl -sL --max-time 30 -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/search/repositories?q=spotify+youtube+music+player&sort=stars&order=desc&per_page=10" -o "$OUT/_search-spotube-like.json"
echo "ALL API FETCHES COMPLETE"
