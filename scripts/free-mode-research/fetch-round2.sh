#!/usr/bin/env bash
# Round 2: fetch newly discovered repos + docs
set -u
CACHE=/home/z/my-project/scripts/free-mode-research/cache
mkdir -p "$CACHE"

fetch() { # fetch <owner/repo> [README.md]
  local repo="$1"; local doc="${2:-README.md}"
  local name="${repo//\//__}"
  local out="$CACHE/$name.md"
  [ -s "$out" ] && { echo "skip $repo"; return; }
  for br in main master dev; do
    curl -sL -m 20 "https://raw.githubusercontent.com/$repo/$br/$doc" -o "$out" 2>/dev/null
    if [ -s "$out" ] && head -c 60 "$out" | grep -qi "404: Not Found"; then rm -f "$out"; else [ -s "$out" ] && { echo "OK $repo ($br)"; return; }; fi
  done
  echo "MISS $repo"
}

fetch "team-spotube/spotube"
fetch "picklem0b/Rheoson"
fetch "select/audius"
fetch "Malopieds/OuterTune"
fetch "blackhatdevx/openspot-music-app"
fetch "MuwMx/YumaPlayer"
fetch "soundcrowd/soundcrowd"
fetch "chayotic/Open-Source-Music-Streaming-Apps"
fetch "ungive/music-station"
fetch "pdfrg/must"

# Licenses for new finds
for repo in team-spotube/spotube picklem0b/Rheoson select/audius Malopieds/OuterTune blackhatdevx/openspot-music-app MuwMx/YumaPlayer; do
  name="${repo//\//__}"
  [ -s "$CACHE/$name.license" ] && continue
  for br in main master dev; do
    for lic in LICENSE LICENSE.md; do
      curl -sL -m 20 "https://raw.githubusercontent.com/$repo/$br/$lic" -o "$CACHE/$name.license" 2>/dev/null
      if [ -s "$CACHE/$name.license" ] && head -c 60 "$CACHE/$name.license" | grep -qi "404: Not Found"; then rm -f "$CACHE/$name.license"; else [ -s "$CACHE/$name.license" ] && break 2; fi
    done
  done
done

# Docs: Audius API streaming + navidrome apps page (find Tonearm)
curl -sL -m 20 "https://docs.audius.org/api" -o "$CACHE/doc-audius-api.html" && echo "audius api doc: $(wc -c < $CACHE/doc-audius-api.html) bytes"
curl -sL -m 20 "https://www.navidrome.org/apps/" -o "$CACHE/doc-navidrome-apps.html" && echo "navidrome apps: $(wc -c < $CACHE/doc-navidrome-apps.html) bytes"

# Tonearm search on navidrome apps page
grep -oiE 'href="[^"]*"[^>]*>[^<]*onearm[^<]*' "$CACHE/doc-navidrome-apps.html" | head -5
grep -oiE 'tonearm[^<]*' "$CACHE/doc-navidrome-apps.html" | head -5

echo ALL-DONE
