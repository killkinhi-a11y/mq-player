#!/bin/bash
# Fetch missing readmes (second batch repos)
set -u
OUT=/home/z/my-project/download/v3-research/raw
fetch() {
  local name="$1" repo="$2"
  for br in master main; do
    curl -sL --max-time 30 "https://raw.githubusercontent.com/$repo/$br/README.md" -o "$OUT/$name.readme.md"
    if [ -s "$OUT/$name.readme.md" ] && ! head -c 40 "$OUT/$name.readme.md" | grep -q "404: Not Found"; then break; fi
  done
  echo "README $name: $(wc -c < $OUT/$name.readme.md) bytes"
}
fetch koel           "koel/koel" &
fetch harmonoid      "harmonoid/harmonoid" &
fetch sonixd         "jeffvli/sonixd" &
fetch musicstation   "huangcheng/music-station" &
fetch wavesurf       "TheDecipherist/wavesurfer-react-player" &
wait
fetch kopuz          "Kopuz-org/kopuz" &
fetch spotiamp       "YANIV3487/spotiamp" &
fetch spotiampplus   "fdeox/spotiamp-plus" &
fetch librespot      "librespot-org/librespot" &
fetch spotifyplayer  "aome510/spotify-player" &
wait
fetch golibrespot    "devgianlu/go-librespot" &
fetch youtubemusic   "th-ch/youtube-music" &
wait
echo "MISSING READMES DONE"
