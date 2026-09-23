#!/bin/bash
# Robust batch: fresh page → demo login → create N playlists via real UI flow.
# All refs extracted inline (never across invocations), with retry helpers.
set -u
PAGE="http://localhost:3111/play"

snap() { agent-browser snapshot -i 2>/dev/null; }
ref_of() { grep -oE "$1 \[ref=[a-z0-9]+\]" | head -1 | grep -oE 'e[0-9]+'; }
click_ref() { # click_ref <snapshot-grep-pattern>
  local r
  for i in 1 2 3; do
    r=$(snap | ref_of "$1")
    if [ -n "$r" ]; then
      agent-browser click "@$r" >/dev/null 2>&1 && return 0
    fi
    agent-browser wait 800 >/dev/null 2>&1
  done
  return 1
}

# 1. ensure the app page is loaded (relaunch if browser reset)
URL=$(agent-browser eval "location.href" 2>/dev/null)
if [ "$URL" != "\"$PAGE\"" ]; then
  agent-browser open "$PAGE" >/dev/null 2>&1
  agent-browser wait 3000 >/dev/null 2>&1
  agent-browser set viewport 1440 900 >/dev/null 2>&1
fi

# 2. demo login (skip if already home)
if ! snap | grep -q "Добрый вечер"; then
  click_ref 'button "Демо-режим"' || { echo "FAIL: demo login"; exit 1; }
  agent-browser wait 4000 >/dev/null 2>&1
fi
# dismiss update dialog if present
if snap | grep -q "Отложить обновление"; then
  click_ref 'button "Отложить обновление и продолжить прослушивание"' && agent-browser wait 1500 >/dev/null 2>&1
fi
snap | grep -q "Добрый вечер" && echo "LOGIN_OK" || { echo "FAIL: no home"; exit 1; }

# 3. create N playlists from N track action buttons
N="${1:-4}"
CREATED=0
for i in $(seq 1 "$N"); do
  # find an unused track's Действия button (prefer variety by rotating index)
  ACT=$(snap | grep -oE 'button "Действия: [^"]+" \[ref=[a-z0-9]+\]' | grep -oE 'e[0-9]+' | sed -n "$((i + 1))p")
  [ -z "$ACT" ] && ACT=$(snap | grep -oE 'button "Действия: [^"]+" \[ref=[a-z0-9]+\]' | grep -oE 'e[0-9]+' | tail -1)
  [ -z "$ACT" ] && { echo "no track buttons"; break; }
  agent-browser click "@$ACT" >/dev/null 2>&1
  agent-browser wait 800 >/dev/null 2>&1
  click_ref 'menuitem "Добавить в плейлист"' || { echo "playlist $i: no add item (retry next)"; continue; }
  agent-browser wait 700 >/dev/null 2>&1
  click_ref 'menuitem "Новый плейлист"' || { echo "playlist $i: no new item"; continue; }
  agent-browser wait 800 >/dev/null 2>&1
  # some builds show a create dialog, some create immediately
  if click_ref 'button "Создать плейлист"'; then
    agent-browser wait 1500 >/dev/null 2>&1
  else
    agent-browser wait 1200 >/dev/null 2>&1
  fi
  CREATED=$((CREATED + 1))
  # back home if navigated away
  if ! snap | grep -q "Добрый вечер"; then
    click_ref 'button "Главная"' && agent-browser wait 2200 >/dev/null 2>&1
  fi
  echo "playlist_batch_$i done"
done
echo "CREATED=$CREATED"
# 4. final state
CHIP=$(snap | grep -oE 'button "ПЛЕЙЛИСТЫ [0-9]+"' | head -1)
echo "CHIP=$CHIP"
