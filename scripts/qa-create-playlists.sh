#!/bin/bash
# Create N playlists via the real UI flow: track context menu →
# "Добавить в плейлист" → "Новый плейлист" → "Создать плейлист" → back Home.
set -u
getref() {
  agent-browser snapshot -i | grep -o "$1 \[ref=[a-z0-9]*\]" | head -1 | grep -o 'ref=[a-z0-9]*' | cut -d= -f2
}
for track_ref in "$@"; do
  echo "=== playlist from $track_ref ==="
  agent-browser click "@$track_ref" >/dev/null || { echo "FAIL click actions"; exit 1; }
  agent-browser wait 700 >/dev/null
  r=$(getref 'menuitem "Добавить в плейлист"')
  [ -z "$r" ] && { echo "FAIL: no add-to-playlist item"; exit 1; }
  agent-browser click "@$r" >/dev/null
  agent-browser wait 700 >/dev/null
  r=$(getref 'menuitem "Новый плейлист"')
  [ -z "$r" ] && { echo "FAIL: no new-playlist item"; exit 1; }
  agent-browser click "@$r" >/dev/null
  agent-browser wait 700 >/dev/null
  r=$(getref 'button "Создать плейлист"')
  [ -z "$r" ] && { echo "FAIL: no create button"; exit 1; }
  agent-browser click "@$r" >/dev/null
  agent-browser wait 1600 >/dev/null
  # back to Home
  r=$(getref 'button "Главная"')
  [ -n "$r" ] && agent-browser click "@$r" >/dev/null
  agent-browser wait 2200 >/dev/null
  echo "OK"
done
echo "ALL_DONE"
