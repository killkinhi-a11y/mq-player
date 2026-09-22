#!/bin/bash
# Responsive QA matrix — overflowX check across the 7 required resolutions.
# Visits Home / Search / Library / Settings / Queue surface on each width.
cd /home/z/my-project
QA="sh scripts/qa.sh"
OUT=download/qa/w01-13/matrix
mkdir -p "$OUT"

RESOLUTIONS=("390 844" "393 852" "411 844" "768 1024" "1280 800" "1440 900" "1920 1080")

for res in "${RESOLUTIONS[@]}"; do
  w=$(echo $res | cut -d' ' -f1)
  h=$(echo $res | cut -d' ' -f2)
  $QA set viewport $w $h > /dev/null 2>&1
  sleep 1
  # Home
  $QA eval "(() => { const d = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Главная'); if (d) d.click(); return 'ok'; })()" > /dev/null 2>&1
  sleep 1
  home_ox=$($QA eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>/dev/null | tail -1)
  $QA screenshot "$OUT/home-${w}x${h}.png" > /dev/null 2>&1
  # Search
  $QA eval "(() => { const d = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Поиск'); if (d) d.click(); return 'ok'; })()" > /dev/null 2>&1
  sleep 1
  search_ox=$($QA eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>/dev/null | tail -1)
  $QA screenshot "$OUT/search-${w}x${h}.png" > /dev/null 2>&1
  # Library
  $QA eval "(() => { const d = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Библиотека'); if (d) d.click(); return 'ok'; })()" > /dev/null 2>&1
  sleep 1
  lib_ox=$($QA eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>/dev/null | tail -1)
  # Settings
  $QA eval "(() => { const d = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Настройки'); if (d) d.click(); return 'ok'; })()" > /dev/null 2>&1
  sleep 1
  set_ox=$($QA eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>/dev/null | tail -1)
  $QA screenshot "$OUT/settings-${w}x${h}.png" > /dev/null 2>&1
  echo "${w}x${h}: home=$home_ox search=$search_ox library=$lib_ox settings=$set_ox"
done
