#!/bin/bash
# VLM audit of BEFORE screenshots — results extracted to readable text.
DIR=/home/z/my-project/download/screens/before-v2-audit
OUT="$DIR/vlm-analysis.txt"
> "$OUT"

run() {
  local file="$1"; local label="$2"; local prompt="$3"
  local jf="/tmp/vlm-$file.json"
  echo "=========== $label ===========" >> "$OUT"
  z-ai vision -p "$prompt" -i "$DIR/$file" -o "$jf" >/dev/null 2>&1 || { echo "(VLM FAILED)" >> "$OUT"; echo "" >> "$OUT"; return; }
  python3 -c "
import json
try:
    d = json.load(open('$jf'))
    print(d['choices'][0]['message']['content'][:1500])
except Exception as e:
    print('(parse error)', e)
" >> "$OUT"
  echo "" >> "$OUT"
}

run home-390.png "HOME MOBILE 390" "Оцени экран Home музыкального плеера (мобильный 390px) как строгий дизайнер: 1) иерархия и фокус; 2) цельная композиция или набор карточек; 3) типографика; 4) премиально или generic; 5) дефекты верстки. Оценка X/10 + 3 замечания + 3 улучшения."

run fullplayer-390.png "FULL PLAYER MOBILE 390" "Оцени полноэкранный плеер (мобильный 390px): 1) композиция (artwork/заголовок/транспорт/секбар/действия); 2) иерархия и ритм; 3) профессиональный плеер или generic; 4) дефекты. Оценка X/10 + 3 замечания + 3 улучшения."

run fullplayer-1440.png "FULL PLAYER DESKTOP 1440" "Оцени полноэкранный плеер на десктопе 1440px: 1) ОТДЕЛЬНАЯ desktop-композиция или растянутая мобильная; 2) использование ширины (пустоты, узкие колонки); 3) иерархия; 4) дефекты. Оценка X/10 + 3 замечания + 3 улучшения."

run search-idle-390.png "SEARCH IDLE 390" "Оцени экран поиска (idle, 390px): 1) структура (подсказки/популярные/недавние); 2) музыкальность vs generic; 3) иерархия; 4) дефекты. Оценка X/10 + 3 замечания."

run search-results-390.png "SEARCH RESULTS 390" "Оцени выдачу поиска (390px): 1) строки результатов (artwork/заголовок/мета/действия); 2) группировка и фильтры; 3) читаемость; 4) дефекты. Оценка X/10 + 3 замечания."

run settings-390.png "SETTINGS 390" "Оцени настройки (390px): 1) информационная архитектура (табы/секции); 2) иерархия контролов; 3) premium vs generic; 4) дефекты. Оценка X/10 + 3 замечания."

run theme-settings-390.png "THEME SETTINGS 390" "Оцени выбор темы (390px): 1) сразу ли видна текущая тема; 2) превью тем различимы; 3) selected/hover; 4) дефекты. Оценка X/10 + 3 замечания."

run playlist-open-390.png "OPEN PLAYLIST 390" "Оцени открытый плейлист (390px): 1) hero (artwork/заголовок/мета/владелец); 2) действия play/shuffle; 3) список треков; 4) иерархия; 5) дефекты. Оценка X/10 + 3 замечания."

run eq-view-390.png "EQ/MIXER 390" "Оцени эквалайзер (390px) как аудио-профессионал: 1) professional audio UI или toy; 2) слайдеры/пресеты/метки/состояния; 3) читаемость дБ; 4) дефекты. Оценка X/10 + 3 замечания."

run artist-390.png "ARTIST 390" "Оцени страницу артиста (390px): 1) hero; 2) популярные треки; 3) иерархия; 4) дефекты. Оценка X/10 + 3 замечания."

run home-1440.png "HOME DESKTOP 1440" "Оцени Home десктоп 1440px: 1) использование ширины (узкая колонка? пустоты?); 2) композиция; 3) иерархия; 4) дефекты. Оценка X/10 + 3 замечания."

run home-wave-active-390.png "HOME WAVE ACTIVE 390" "Оцени Home с активной Волной: 1) понятно ли что играет и почему; 2) состояние волны; 3) дефекты. Оценка X/10 + 3 замечания."

echo "DONE"
