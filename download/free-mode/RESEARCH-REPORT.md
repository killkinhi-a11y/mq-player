# MQ Free Mode — Research Report

**Дата:** 2026-10-09
**Задача:** Deep research GitHub-проектов, которые дают реальное воспроизведение полных треков (FULL-LENGTH) без обязательного входа в Spotify, без Premium и без 30-секундных preview. Основа для архитектуры MQ Free Mode: `CATALOG → NORMALIZED TRACK → FULL-LENGTH SOURCE RESOLVER → PLAYBACK PROVIDER → MQ WAVE`.

**Методология.** Исследование выполнено 2026-10-09 через: (1) веб-поиск (10+ запросов: Spotube и форки, Audius/SoundCloud клиенты, anonymous music clients, YT Music клиенты); (2) загрузку и чтение README напрямую с `raw.githubusercontent.com` / Codeberg для каждого проекта; (3) проверку LICENSE-файлов каждого репозитория; (4) сопоставление с фактическим кодом MQ (`src/lib/soundcloud.ts`, `src/lib/audius.ts`, `src/app/api/music/*`). Найдено и проанализировано **23 проекта** (требование — минимум 10). Никакой код из исследованных проектов не копируется — только архитектурные паттерны.

---

## 1. Сводная таблица проектов

Легенда: ✅ — да; ❌ — нет; ⚠️ — с оговорками; n/d — нет данных из README. «No Login» = не требует входа в сторонний музыкальный сервис для прослушивания.

| Project | No Login | No Premium | Full Track | Preview Only | Audio Provider | Catalog Provider | Search | Artists | Albums | Lyrics | Queue | Wave | License | MQ usefulness |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Spotube** (KRTirtho, оригинал) | ✅ | ✅ | ✅ | ❌ | YouTube Music / JioSaavn (альтернативные источники) | Spotify (метаданные) | ✅ | ✅ | ✅ | ✅ synced | ✅ | ❌ | BSD-4-Clause | Эталон разделения catalog/playback; **прецедент C&D от Spotify (09.2025) — причина не трогать Spotify audio** |
| **Spotube** (team-spotube, продолжение) | ✅ | ✅ | ✅ (через plugin) | ❌ | Community-плагины (YT, Piped, кастомные) | Community-плагины метаданных | ✅ | ✅ | ✅ | ✅ synced (не зависит от источника) | ✅ | ❌ | BSD-4-Clause | Живое продолжение (возрождён 14.11.2025): plugin-архитектура, выбор audio-source на трек |
| **SpotiFLAC** (spotbye) | ✅ | ✅ | ✅ (скачивание) | ❌ | Tidal/Qobuz/Amazon через сторонние API | Spotify (реверс веб-плеера) + MusicBrainz | ⚠️ по ссылке | ❌ | ❌ | ✅ (LRCLIB) | ❌ | ❌ | MIT | **ТОЛЬКО референс**: идея matching'a треков между сервисами, Odesli/LRCLIB. Механизмы обхода НЕ берём |
| **Nuclear** (nukeop) | ✅ | ✅ | ✅ | ❌ | Несколько бесплатных источников через plugins | Те же + metadata-плагины | ✅ | ✅ (био, дискографии) | ✅ | ✅ synced | ✅ | ❌ | AGPL-3.0 | UX «Stream sources for a queued track» = наш Choose Source sheet; plugin-sdk паттерн |
| **Rheoson** (picklem0b) | ⚠️ (свой аккаунт self-hosted) | ✅ | ✅ (скачивает) | ❌ | YouTube Music через yt-dlp | **Spotify API — ТОЛЬКО метаданные** | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | Apache-2.0 | Точный паттерн «Catalog: Spotify / Playback: другой источник» + честные подписи. Скачивание (ripping) НЕ берём |
| **Feishin** (jeffvli) | ⚠️ (свой сервер) | ✅ | ✅ (своя библиотека) | ❌ | Свой Navidrome/Jellyfin/Subsonic | Тот же сервер | ✅ | ✅ | ✅ | n/d | ✅ | ❌ | GPL-3.0 | UX очереди/плейлистов, работа с большими списками |
| **Sonixd** (jeffvli) | ⚠️ (свой сервер) | ✅ | ✅ (своя библиотека) | ❌ | Subsonic-совместимый сервер | Тот же сервер | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | GPL-3.0 | Maintenance mode; предшественник Feishin. Историческая ценность |
| **Navidrome** | ⚠️ (свой сервер) | ✅ | ✅ (своя библиотека) | ❌ | Свой сервер (OpenSubsonic API) | Своя коллекция | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | GPL-3.0 | Кандидат на будущий коннектор «MQ/local server» (OpenSubsonic) |
| **Koel** | ⚠️ (свой сервер) | ✅ | ✅ (своя библиотека) | ❌ | Свой сервер (Laravel) | Своя коллекция | ✅ | ✅ | ✅ | ⚠️ | ✅ | ❌ | MIT | Smart playlists (в MQ уже есть); лёгкая лицензия |
| **Tonearm** (dergs, Codeberg) | ❌ (нужен TIDAL) | ❌ (платный TIDAL) | ✅ | ❌ | TIDAL (неофиц. клиент, GTK4) | TIDAL | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | GPL-3.0 | Контрпример: «premium required» — ровно то, что MQ Free Mode отвергает |
| **Audius** (протокол + офиц. клиенты) | ✅ | ✅ | ✅ (каталог artist-uploaded) | ❌ | Audius API (`/v1/tracks/{id}/stream`, app_name) | Audius | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | Apache-2.0 | **2-й playback-провайдер MQ (уже интегрирован)**; @audius/sdk; ISRC отсутствует |
| **Audius web player** (select/audius) | ✅ | ✅ | ✅ (YouTube URL) | ❌ | YouTube/Vimeo/прямые ссылки | Нет (свой индекс) | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | **LICENSE-файл не найден** | Паттерн no-login персистентности (IndexedDB, single-file PWA). Совпадение имени с протоколом Audius — случайность |
| **ViMusic** | ✅ | ✅ | ✅ | ❌ | YouTube Music | YouTube Music | ✅ | ✅ | ✅ | ✅ synced | ✅ | ❌ | GPL-3.0 | Проект-первопроходец «full track без аккаунта»; оригинал не развивается |
| **InnerTune** | ✅ (login опционален) | ✅ | ✅ | ❌ | YouTube Music | YouTube Music | ✅ | ✅ | ✅ | ✅ synced + перевод | ✅ | ❌ | GPL-3.0 | Synced-lyrics + переводы (в MQ уже есть); проект остановлен |
| **RiMusic** | ✅ | ✅ | ✅ | ❌ | YouTube Music | YouTube Music | ✅ | ✅ | ✅ | ✅ synced + перевод | ✅ | ⚠️ аудио-визуализатор (микрофон, не seek) | GPL-3.0 | Статистика прослушиваний, кастомизация; **проект закрыт** |
| **OuterTune** | ✅ | ✅ | ✅ (теперь local-only) | ❌ | local + ранее YT Music | local | ✅ | ✅ | ✅ | ✅ synced | ✅ | ❌ | GPL-3.0 | Не в активной разработке; вернулся к local-only |
| **Metrolist** | ✅ | ✅ | ✅ | ❌ | YouTube Music | YouTube Music | ✅ | ✅ | ✅ | ✅ synced | ✅ | ❌ | GPL-3.0 | Maintenance mode; региональные ограничения YT |
| **YumaPlayer** | ✅ (работает из коробки) | ✅ | ✅ (YT Music + local FLAC) | ❌ | YouTube Music + локальные файлы | YT Music + Spotify-подобные алгоритмы | ✅ | ✅ | ✅ | ✅ 3-уровневые synced | ✅ | ❌ | GPL-3.0 | Активный гибрид; планка UX-качества; шифрование кредов AES-256-GCM (нам не нужно — нет кредов) |
| **OpenSpot Music** | ✅ | ✅ | ✅ | ❌ | Не указан в README (вероятно YT-экстракция) | Не указан | ✅ | ✅ | n/d | ✅ | ✅ | ❌ | MIT | **REJECT как источник (§41: сомнительный/нестабильный)**; watchlist |
| **Music Station** (mj-gowda) | ⚠️ (свой аккаунт) | ✅ | ✅ (свои загрузки) | ❌ | Загруженные пользователем файлы (Supabase) | Своя коллекция | ✅ | n/d | n/d | ❌ | ✅ | ❌ | n/d (repo) | Личный облачный плеер; в MQ этот сценарий уже закрыт local uploads |
| **SoundCrowd** | ✅ | ✅ | ✅ (ALLOW-политики) | ❌ | SoundCloud public API | SoundCloud | ✅ | ✅ | n/d | ❌ | ✅ | ❌ | GPL-3.0 | Подтверждает жизнеспособность нашего основного пути (SoundCloud без логина) |
| **must** (pdfrg) | ⚠️ (свой сервер) | ✅ | ✅ (local + Subsonic) | ❌ | local + Subsonic | local | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | n/d | TUI; снова Subsonic-коннектор идея |
| **Harmonoid** | ✅ | ✅ | ✅ (local + YT Music) | ❌ | local library + YouTube Music | local + YT | ✅ | ✅ | ✅ | ✅ (+переводы) | ✅ | ❌ | **PolyForm Strict (NOT open source)** | Код использовать НЕЛЬЗЯ; только UX-референс |

**Wave-колонка, главный вывод:** ни один из 23 проектов не имеет полноценного waveform-seek (волновой шкалы перемотки). У RiMusic есть только микрофонный визуализатор. **MQ Wave — уникальная фича**, которую сохраняем и развиваем (§16–18 ТЗ).

---

## 2. Кто действительно даёт FULL TRACK + NO LOGIN + NO PREMIUM

### Группа A — «работает из коробки, без своего сервера» (целевая категория MQ Free Mode)

| Проект | Каталог покрывает мейнстрим (чарты, лейблы)? | Источник аудио | Риски |
|---|---|---|---|
| team-spotube/spotube | ✅ через metadata-плагины | community-плагины (YT и др.) | Зависимость от сторонних плагинов; сам оригинал получил C&D от Spotify за связку «метаданные Spotify + аудио с других сервисов» |
| Nuclear | частично | встроенные бесплатные источники (YT и др.) | Неофициальная экстракция YT; стабильность источников |
| Audius (протокол/API) | ❌ (только artist-uploaded: электроника/инди) | официальный публичный API | Не мейнстрим-каталог; нет ISRC |
| select/audius | ❌ | YouTube-ссылки | ToS YouTube; LICENSE не найден |
| ViMusic / InnerTune / RiMusic / OuterTune / Metrolist / YumaPlayer | ✅ (полный YT Music каталог) | YouTube Music (неофиц. экстракция) | **Все оригиналы закрыты/в maintenance** — жизненный урок: экстракция одного сервиса = хрупкая база |
| OpenSpot | n/d | не указан | источник не задокументирован — не берём |

### Группа B — «нужен свой сервер/библиотека» (не источник для MQ, но валидные плееры)
Navidrome, Koel, Feishin, Sonixd, must, Music Station — full track да, но это СВОЯ музыка (self-hosted). Логин — в свой сервер, не в Spotify. Для MQ это сценарий «MQ/local» (уже реализован через local uploads; Navidrome/OpenSubsonic — возможный будущий коннектор).

### Группа C — «требуют платный сторонний аккаунт»
**Tonearm** — единственный в выборке: неофициальный TIDAL-клиент, прямо пишет «A paid TIDAL account is required for full-length playback». Это антипаттерн для Free Mode — подтверждает правильность отказа от «официального premium-пути» как основного.

### Группа D — «скачиватели/metadata-мосты»
**SpotiFLAC** (Tidal/Qobuz/Amazon, «no account required» у их сторонних API) и **Rheoson** (YT Music через yt-dlp + Spotify-метаданные). Оба = stream ripping для конечного пользователя. Для MQ: **механизмы НЕ берём** (запрет ТЗ: никакой экстракции/обхода). Берём только: (1) идею скоринга матчинга между сервисами, (2) явное разделение «каталог ≠ источник», (3) API-кредиты: MusicBrainz, LRCLIB, Odesli (song.link) — легальные публичные metadata-сервисы.

### Итоговый вердикт по формуле «FULL TRACK + NO LOGIN + NO PREMIUM»
Реально устойчивых вариантов для **веб-приложения** два: **SoundCloud (public API, ALLOW-политики)** и **Audius (публичный API)** — оба уже интегрированы в MQ. Все «третьи» пути (YT-экстракция, скачиватели, premium-клиенты) либо хрупки, либо нарушают принципы ТЗ. Это подтверждает приоритет §5: SoundCloud → Audius → MQ/local.

---

## 3. Детальные выводы по ключевым проектам

### 3.1 Spotube — оригинал и продолжение (главный кейс)
**Оригинал** (KRTirtho/spotube, BSD-4): Flutter-приложение, работавшее по схеме «каталог/метаданные Spotify (без входа пользователя) + аудио с альтернативных источников (YouTube Music, JioSaavn)». Пользователь не логинился в Spotify и не нуждался в Premium. **В сентябре 2025 Spotify направил cease & desist** — проект официально прекращён, из Play Market удалён. Причина: использование данных Spotify API в связке с чужим аудио. **Урок для MQ:** (а) никогда не завязывать работоспособность на Spotify — у нас Spotify-каталог строго опционален с fallback на Deezer/MusicBrainz/SoundCloud-поиск; (б) в UI никогда не называть плейбэк «Spotify», только честные бейджи «Catalog: X / Playback: Y» (§34 ТЗ); (в) никакой экстракции Spotify-аудио — это и есть предмет C&D.
**Продолжение** (team-spotube/spotube, возрождено 14.11.2025): переписано на plugin-архитектуру — «Bring your own music metadata/playlist/audio-source with plugins». Метаданные и аудио физически разделены плагинами; тайм-синкронизированные тексты работают независимо от источника (синхронизируются с часами воспроизведения). Это зрелое подтверждение архитектуры MQ: CATALOG PROVIDER и PLAYBACK PROVIDER — независимые слои. Паттерны, которые берём: разделение слоёв, выбор источника на уровне трека, синхронизация lyrics от PlaybackClock, а не от источника.

### 3.2 SpotiFLAC — референс матчинга (без копирования механик)
MIT, активно развивается (копирайт 2026). По их FAQ: «audio is fetched using third-party APIs» (Tidal/Qobuz/Amazon через hifi-api), «Spotify data is obtained through reverse engineering of the Spotify Web Player, not through user authentication». В API-кредитах: MusicBrainz, LRCLIB, Odesli (song.link), Songstats. **Что берём:** (1) саму идею скоринга при сопоставлении трека из каталога с кандидатом в другом сервисе (ISRC → точное совпадение; далее title/artist/album/duration — ровно формула §9 ТЗ); (2) Odesli как публичный легальный сервис кросс-сервисного соответствия ID (Spotify↔Deezer↔YT↔Tidal) — потенциальный источник подсказок для матчинга; (3) LRCLIB для текстов (уже используем). **Что НЕ берём:** реверс Spotify Web Player, скачивание/расшифровку аудио, обход любого DRM — прямо запрещено ТЗ.

### 3.3 Nuclear — UX выбора источника
AGPL-3 (код не копируем — только паттерны). Electron-плеер без аккаунта: поиск/стриминг из нескольких бесплатных источников через плагины (@nuclearplayer/plugin-sdk). Ключевая фича для нас: **«Stream sources for a queued track»** — для трека в очереди показывается список доступных источников. Это в точности наш «Choose Source» (§9 ТЗ): при низком confidence матчинга НЕ играем автоматически, а показываем выбор источников. Также: artist-страницы с био/дискографиями, album-страницы — подтверждение полноты §27–29 ТЗ.

### 3.4 Rheoson — эталон честного разделения Catalog/Playback
Apache-2.0, self-hosted (FastAPI + React 18). Прямо в README: «Spotify's API is used **only** for metadata (titles, artwork, durations) when you paste a Spotify link. Rheoson never touches Spotify's audio». UI «mirrors Spotify Premium». То есть проект живёт по формуле: **Catalog: Spotify → Playback: YouTube Music** — и открыто это декларирует. Берём: принцип честного разделения и подписи источника. Не берём: yt-dlp скачивание (stream ripping), обязательность своего сервера.

### 3.5 Audius — второй playback-провайдер
Официальная экосистема (Apache-2.0): монорепо audius-protocol (web/mobile/SDK), `@audius/sdk` (TypeScript), публичный REST API без ключей и без авторизации для чтения (параметр `app_name`), host-discovery через `api.audius.co`, стрим `/v1/tracks/{id}/stream` (301 → CDN). Каталог — только artist-uploaded (много электроники/инди, мало мейнстрима), **ISRC отсутствует** (подтверждено review API). У MQ интеграция уже есть (`src/lib/audius.ts`): поиск, trending, прямые stream URL. Роль в Free Mode: второй full-length источник и fallback, когда SoundCloud SNIP/DRM блокирует трек.

### 3.6 Семейство YouTube Music клиентов (ViMusic → RiMusic/Metrolist/YumaPlayer; InnerTune → OuterTune)
Все дают «full track без логина» и все построены на неофициальной экстракции YT Music. Хронология: ViMusic (оригинал, остановлен) → RiMusic (закрыт: «This project, is closed») / Metrolist (maintenance) / OuterTune (перестал быть YT-клиентом, local-only) → YumaPlayer (активный, гибрид local+YT+Spotify-подобные алгоритмы). **Два урока:** (1) спрос на «ищу как в Spotify → слушаю полный трек без аккаунта» огромен — это ровно продукт MQ Free Mode; (2) привязка к экстракции одного сервиса убивает проекты один за другим. **Решение:** YT Music как источник в MQ НЕ добавляем (§41 — не добавлять сомнительные/нестабильные источники ради количества). Берём UX-находки: persistent queue, synced lyrics с переводом, статистика прослушиваний, sleep timer, skip silence (часть уже есть в MQ).

### 3.7 Self-hosted семья (Navidrome, Koel, Feishin, Sonixd, must, Music Station)
Полные треки из собственной библиотеки, логин в свой сервер. Для Free Mode это «MQ/local»: локальные загрузки MQ уже поддерживаются. Navidrome/OpenSubsonic API — кандидат на будущий опциональный коннектор (за рамками этой версии). Feishin — референс производительности больших очередей/плейлистов.

### 3.8 Прочие
- **Tonearm** (GPL-3, Codeberg): неофиц. GTK4-клиент TIDAL; нужен платный аккаунт. Антипаттерн для нас; MPRIS-референс.
- **select/audius**: одноимённый с протоколом, но другой проект — no-login PWA-плеер YouTube/прямых ссылок с IndexedDB-плейлистами; LICENSE-файл не найден → код не используем вовсе.
- **SoundCrowd** (GPL-3): Android-клиент SoundCloud на public API — подтверждает, что наш основной путь (SoundCloud без логина пользователя) легитимен и проверен сообществом.
- **OpenSpot** (MIT): «no ads, no login», но источник аудио не задокументирован — отклонён по §41 (watchlist).
- **Harmonoid**: PolyForm Strict — код закрыт к использованию; только визуальный референс.

---

## 4. Лицензионная сводка (что можно и что нельзя)

| Лицензия | Проекты | Можно ли брать код в MQ (MIT-подобный проект) |
|---|---|---|
| BSD-4 / MIT / Apache-2.0 | Spotube (оба), SpotiFLAC, Rheoson, Koel, Audius, OpenSpot | Да, с атрибуцией — но код не копируем, только паттерны (разные стеки) |
| GPL-3.0 / AGPL-3.0 | Nuclear, Feishin, Sonixd, Navidrome, ViMusic, InnerTune, RiMusic, OuterTune, Metrolist, YumaPlayer, Tonearm, SoundCrowd | **Код не копируем** (copyleft несовместим); изучаем только поведение/UX |
| PolyForm Strict | Harmonoid | Код использовать запрещено |
| LICENSE отсутствует | select/audius | Код не используем |

---

## 5. Правовые/ToS границы (зафиксировано для честности)

1. **Spotify audio не добываем** — ни через Web Playback SDK без Premium, ни через реверс (прецедент Spotube C&D). Spotify — только опциональный catalog/metadata (легальный client_credentials API с квотами, fallback при недоступности).
2. **Никаких preview как плейбэка**: 30-секундные отрывки Spotify/Deezer/iTunes не воспроизводятся в MQ Wave (§2, §13 ТЗ). Deezer — только catalog-метаданные (MQ так и использует: import-playlist, charts fallback).
3. **Никакого stream ripping**: механики SpotiFLAC/Rheoson (скачивание, расшифровка) не переносим.
4. **SoundCloud**: используем публичные эндпоинты так же, как SoundCrowd и десятки клиентов; политики треков уважаем: SNIP (30с) → REJECT, Go+ DRM → честная пометка/отказ, а не обход.
5. **Audius**: официальный публичный API, параметр app_name, без ключей — полностью в рамках ToS.

---

## 6. Выбор playback-провайдеров для MQ Free Mode (§5 ТЗ)

| Приоритет | Провайдер | supportsFullLength | supportsSeek | supportsBackgroundPlay | Вердикт |
|---|---|---|---|---|---|---|
| 1 | **SoundCloud** | ✅ для ALLOW-политик (SNIP→REJECT; Go+→DRM/отказ) | ✅ | ✅ | Основной. Учитывая HLS+progressive и детект политик — уже лучший доступный мейнстрим-каталог без логина |
| 2 | **Audius** | ✅ (весь каталог стримится целиком) | ✅ | ✅ | Второй/fallback. Слабее мейнстрим, зато нулевые барьеры |
| 3 | другие «проверенные допустимые» | — | — | — | **Кандидатов не найдено** (YT-экстракция, Piped, скачиватели — отклонены по §41/правовым причинам). Слот остаётся открытым для будущих легальных источников |
| 4 | **MQ/local** | ✅ (локальные загрузки пользователя) | ✅ | ✅ | Уже реализовано в MQ |

Metadata-only сервисы (MusicBrainz, Odesli, LRCLIB, Songstats) в playback не добавляются — по §5 «не добавляй provider, если он только metadata».

## 7. Каталог-провайдеры (§6 ТЗ)

| Провайдер | Роль | ISRC | Без логина | Статус в MQ |
|---|---|---|---|---|
| Spotify API (client_credentials) | опциональный catalog: чарты/плейлисты | ✅ external_ids | ✅ (серверный токен; квоты) | Уже есть (`/api/music/spotify-charts`), quota-limited → честный fallback |
| Deezer public API | catalog fallback: поиск/чарты/альбомы | ✅ в объекте трека | ✅ (без ключа) | Уже есть (charts fallback, import-playlist) — останется ТОЛЬКО метаданными |
| MusicBrainz | открытые метаданные + ISRC-реестр, нормализация | ✅ recordings/ISRC | ✅ (1 req/s по вежливости) | **Новый кандидат** для ISRC-матчинга и обогащения; добавить в resolver |
| LRCLIB | тексты (synced + plain) | — | ✅ | Уже есть |
| SoundCloud / Audius search | нативный поиск (playback-каталоги) | ❌ | ✅ | Уже есть |

Каталог остаётся provider-agnostic: NormalizedTrack не зависит от Spotify; при полном отказе Spotify API поиск и playback продолжают работать на SoundCloud/Audius (уже так и есть в `/api/music/search`).

---

## 8. Что из этого реализуем в MQ (мост к фазам)

1. **FullLengthSourceResolver** (§8): вход NormalizedTrack → выход PlaybackSource `{catalogProvider, catalogId, playbackProvider, playbackId, title, artist, duration, isFullLength, confidence}` — паттерн подтверждён Spotube-continued (разделение слоёв) и Rheoson (честный Catalog≠Playback).
2. **Скоринг матчинга** (§9): ISRC +100 (через Deezer/MusicBrainz, где достижимо), title +40, artist +40, duration +20, album +10, version +10; штрафы LIVE −60, REMIX −50, KARAOKE/COVER/AI COVER/REACTION −100, SLOWED/REVERB/SPED UP −70, ACOUSTIC −50, RADIO EDIT −30. Формула совпадает с практикой SpotiFLAC (сервисы без ISRC матчятся по title/artist/duration — Audius/SC ISRC не имеют).
3. **Choose Source** при confidence < threshold (§9) — UX из Nuclear.
4. **Валидация full-length** (§10): capability-флаги провайдера + дельта длительности (226 vs 228 → PASS; 30с → FAIL; 500с live → FAIL).
5. **Честные бейджи** Catalog/Playback (§34–35) — паттерн Rheoson/Spotube.
6. **Lyrics от PlaybackClock** (§18, §32) — паттерн Spotube-continued («time synced lyrics regardless of the plugin support»).
7. **PlaybackClock единый** (§18) — подтверждено всеми: время — свойство плеера, не источника.

## 9. Источники

- Spotube (оригинал): github.com/KRTirtho/spotube · продолжение: github.com/team-spotube/spotube · сайт: spotube.cc
- SpotiFLAC: github.com/spotbye/spotiflac
- Nuclear: github.com/nukeop/nuclear
- Rheoson: github.com/picklem0b/Rheoson
- Feishin: github.com/jeffvli/feishin · Sonixd: github.com/jeffvli/sonixd
- Navidrome: github.com/navidrome/navidrome · Koel: github.com/koel/koel
- Tonearm: codeberg.org/dergs/Tonearm · Flathub: dev.dergs.Tonearm
- Audius: github.com/AudiusProject/audius-protocol · docs.audius.org · select/audius: github.com/select/audius
- YT-семейство: github.com/vfsfitvnm/ViMusic · github.com/z-huang/InnerTune · github.com/fast4x/RiMusic · github.com/OuterTune/OuterTune · github.com/MetrolistGroup/Metrolist · github.com/MuwMx/YumaPlayer
- OpenSpot: github.com/blackhatdevx/openspot-music-app · Music Station: github.com/mj-gowda/Music-Station
- SoundCrowd: github.com/soundcrowd/soundcrowd · must: github.com/pdfrg/must · Harmonoid: github.com/harmonoid/harmonoid
- Новостной фон: «RIP Spotube… Cease and desist from Spotify AB» (r/Piracy, 09.2025); «Spotify contacts the Spotube developer…» (Linux Adictos); релиз team-spotube 14.11.2025 «Spotube is officially back».

*Все README и LICENSE скачаны и проверены 2026-10-09; копии — в `scripts/free-mode-research/cache/`. Никакой код из проектов не переносится в MQ.*

