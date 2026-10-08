#!/usr/bin/env bash
# Free Mode research: fetch READMEs (+LICENSE heads) of candidate projects
# Results -> scripts/free-mode-research/cache/<owner>__<repo>.{md,license}
set -u
CACHE=/home/z/my-project/scripts/free-mode-research/cache
mkdir -p "$CACHE"

REPOS=(
  # Mandatory list (user-specified)
  "KRTirtho/spotube"
  "spotbye/spotiflac"
  "nukeop/nuclear"
  "jeffvli/feishin"
  "tamland/navidrome-client-web"
  "navidrome/navidrome"
  "koel/koel"
  "jeffvli/sonixd"
  "harmonoid/harmonoid"
  "AudiusProject/audius-protocol"
  # YouTube-Music no-login full-track clients (candidates)
  "vfsfitvnm/ViMusic"
  "z-huang/InnerTune"
  "fast4x/RiMusic"
  # Extra candidates to verify
  "ungive/music-station"
  "Spotube-Reloaded/spotube"
)

for repo in "${REPOS[@]}"; do
  name="${repo//\//__}"
  for br in main master; do
    if [ ! -s "$CACHE/$name.md" ]; then
      curl -sL -m 20 "https://raw.githubusercontent.com/$repo/$br/README.md" -o "$CACHE/$name.md" 2>/dev/null
      if [ -s "$CACHE/$name.md" ] && head -c 60 "$CACHE/$name.md" | grep -qi "404: Not Found"; then
        rm -f "$CACHE/$name.md"
      fi
    fi
    if [ ! -s "$CACHE/$name.license" ]; then
      curl -sL -m 20 "https://raw.githubusercontent.com/$repo/$br/LICENSE" -o "$CACHE/$name.license" 2>/dev/null
      if [ -s "$CACHE/$name.license" ] && head -c 60 "$CACHE/$name.license" | grep -qi "404: Not Found"; then
        rm -f "$CACHE/$name.license"
      fi
    fi
  done
  if [ ! -s "$CACHE/$name.license" ]; then
    for br in main master; do
      curl -sL -m 20 "https://raw.githubusercontent.com/$repo/$br/LICENSE.md" -o "$CACHE/$name.license" 2>/dev/null
      if [ -s "$CACHE/$name.license" ] && head -c 60 "$CACHE/$name.license" | grep -qi "404: Not Found"; then
        rm -f "$CACHE/$name.license"
      fi
    done
  fi
  echo "== $repo: readme=$( [ -s "$CACHE/$name.md" ] && echo YES || echo no ) license=$( [ -s "$CACHE/$name.license" ] && echo YES || echo no )"
done
echo DONE
