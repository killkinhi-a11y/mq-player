# MQ V3 — DEEP GITHUB RESEARCH REPORT

Дата: 2026-10-08 · Метод: живые GitHub API + README + LICENSE каждого репозитория
(метаданные зафиксированы в `download/v3-research/raw/*.{api,readme,license}`).
Правило: **никакого копирования кода вслепую, каждая лицензия проверена.**

## Почему этот research меняет концепцию

Главный подтверждённый паттерн индустрии open-source музыки — **«Catalog ≠ Playback»**:
метаданные берутся у одного провайдера (чаще Spotify), а full-length аудио — у другого
(YouTube Music / SoundCloud / свой сервер). Так работают Spotube (49.7k⭐), Rheoson,
Nuclear, cliamp, spotatui. Именно это пользователь требует для MQ. Второй подтверждённый
паттерн — **Spotify Web Playback SDK = опциональный официальный путь для Premium**
(Kopuz, spotiamp), никогда не единственный. Третий — **никто не использует preview
как playback**; 30-секундные источники не считаются воспроизведением.

## RESEARCH TABLE

Легенда: ✓ да · ✗ нет · ◐ частично/через плагин · N/A неприменимо

| Project | URL | License | Language | Architecture | Full Track Playback | Requires Login | Requires Premium | Preview Only | Search | Artist | Album | Playlist | Lyrics | Queue | Wave | Playback Method | Useful For MQ | Main Limitation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Spotube** | github.com/KRTirtho/spotube | BSD-4-Clause | Dart/Flutter | Plugin-архитектура: metadata-provider ≠ audio-source-provider; Riverpod + drift; media_kit (mpv) | ✓ (YouTube/Piped/Invidious и др. аудио-источники) | ◐ (аккаунт для user-данных) | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ synced (LRCLib «regardless of plugin») | ✗ | Стриминг аудио из YT-источников через нативный плеер | **Эталон catalog≠playback**; независимость lyrics от источника; честные бейджи источника | Flutter, не web; YouTube-зависимость |
| **Rheoson** | github.com/picklem0b/Rheoson | Apache-2.0 | TS front + Python FastAPI | Spotify-like UI; Spotify API ТОЛЬКО metadata; аудио = YouTube Music через yt-dlp; MongoDB (accounts, recommendations, analytics); Clerk auth | ✓ (yt-dlp, full) | ◐ (есть локальный режим) | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | Серверный yt-dlp → локальные файлы | Модель listening-аналитики/skip-сигналов; позиционирование «Spotify никогда не трогаем аудио» | Серверный yt-dlp тяжёл/ToS-grey — не для Vercel; self-host |
| **Feishin** | github.com/jeffvli/feishin | GPL-3.0 | TypeScript/Electron | Navidrome/Subsonic/Jellyfin клиент; ДВА player-бэкенда за одним интерфейсом (MPV desktop + Web/HTML5) | ✓ (своя библиотека) | ✓ (к своему серверу) | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ synced+unsynced | ✗ | MPV или HTML5 audio (selectable backend) | Абстракция «один интерфейс — много бэкендов» (= MQ WASM engine vs Spotify SDK); state machine lyrics | GPL (код нельзя); Electron; библиотека = свои файлы |
| **Tonearm** | github.com/j4ckxyz/navidrome-client-web | **НЕТ ЛИЦЕНЗИИ** | TypeScript (Vite, web) | Браузерный клиент Navidrome/Jellyfin; без своей БД; queue drag-reorder; crossfade; ReplayGain; 10-band EQ; music-reactive visualizer; **infinite radio** | ✓ (своя библиотека) | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ synced + **LRCLIB fallback** | ✓ visualizer | Прямой Subsonic/Jellyfin REST | Visualizer/wave UX; LRCLIB-фолбэк; **infinite radio = smart queue** | **Нет LICENSE — только идеи, 0 кода**; desktop-only |
| **Nuclear** | github.com/nukeop/nuclear | AGPL-3.0 | TypeScript/Electron | Агрегатор-плеер: поиск по нескольким стрим-источникам; **кандидаты источников на каждый трек очереди**; plugin store; synced lyrics + переводы + фуригана; listening history+stats | ✓ (стрим-источники) | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ synced+translation | ✗ | Стриминговые плагины (YT и др.) | UX выбора источника для трека (у MQ есть SourceSheet — расширить кандидатами); lyrics-переводы; stats | AGPL (код нельзя); Electron |
| **Navidrome** | github.com/navidrome/navidrome | GPL-3.0 | Go (server) | Персональный музыкальный сервер, Subsonic-совместимый API | ✓ (свои файлы) | ✓ | ✗ | N/A | ✓ | ✓ | ✓ | ✓ | ◐ | ✗ | Транскодинг/стриминг своих файлов | Серверные паттерны кэша/транскодинга | GPL; модель «свои файлы» ≠ MQ |
| **Koel** | github.com/koel/koel | MIT | PHP Laravel + Vue | Сервер личной музыки; плейлисты, smart playlists, подкасты, радио, Last.fm/MusicBrainz; Koel Plus (premium фичи) | ✓ (свои файлы) | ✓ | ✗ (Plus — за деньги) | N/A | ✓ | ✓ | ✓ | ✓ | ◐ | ✗ | Стриминг своих файлов | Smart playlist концепты; MIT-референс | PHP; модель «свои файлы» |
| **Harmonoid** | github.com/harmonoid/harmonoid | **PolyForm Strict 1.0.0** | Dart/Flutter | Локальный плеер-библиотека; LRC/tags/online lyrics, переводы, notification lyrics; gapless; speed/pitch; crossfade; ReplayGain | ✓ (локальные файлы) | ✗ | ✗ | N/A | ◐ | ✓ | ✓ | ✓ | ✓ + переводы | ✗ | Локальные файлы | UX переводов lyrics | **PolyForm Strict: КОД КОПИРОВАТЬ НЕЛЬЗЯ ВООБЩЕ** |
| **Sonixd** | github.com/jeffvli/sonixd | GPL-3.0 | TS/Electron | Предшественник Feishin; Navidrome/Jellyfin | ✓ | ✓ | ✗ | N/A | ✓ | ✓ | ✓ | ✓ | ◐ | ✗ | Свои файлы | Историческая ценность только | **АРХИВ (2024)**; заменён Feishin |
| **Music Station** | github.com/huangcheng/music-station | MIT | **TS / Next.js + Prisma** | Self-hosted сервер личной музыки; **Wavesurfer.js** волны; Radix UI; i18n; Vitest+Playwright | ✓ (свои файлы) | ✓ | ✗ | N/A | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ Wavesurfer | Стриминг своих файлов | **Ближайший к MQ стек** (Next+Prisma+Radix+Vitest): структурный MIT-референс | Мелкий проект; нет resolver/стриминговых источников |
| **wavesurf** | github.com/TheDecipherist/wavesurfer-react-player | MIT | TypeScript React | Production-ready React audio player на **WaveSurfer.js**: global state (один трек), persistent mini-player, volume fade-in, lazy loading, markers/regions, Media Session, **доступная keyboard-seekable волна** | ✓ | ✗ | ✗ | N/A | ✗ | ✗ | ✗ | ◐ | ✗ | ✓ | WaveSurfer.js (Canvas) | **Прямой референс для PHASE 14–19 (Wave)**: доступность, регионы, RAF-паттерны | WaveSurfer.js требует raw audio для пиков (у MQ свой WASM-конвейер пиков); нет каталога |
| **Kopuz** | github.com/Kopuz-org/kopuz | EUPL-1.2 | Rust (Tauri) + React | Spotify metadata + **Web Playback SDK (Premium)** + SoundCloud fallback; PKCE; lyrics Musixmatch/LRCLib | ✓ (SDK Premium / SoundCloud) | ✓ Spotify | ◐ (для официального) | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | Spotify Web Playback SDK → <video> элемент; SoundCloud fallback | **Уже интегрирован в MQ V2** (PKCE, adapter, end-of-track эвристики) — продолжаем использовать | Tauri desktop, не web |
| **Spotiamp** (YANIV3487) | github.com/YANIV3487/spotiamp | **НЕТ ЛИЦЕНЗИИ** (оригинал tedsteen/Spotiamp — MIT) | JavaScript | Браузерный Winamp-скин поверх Web Playback SDK | ◐ Premium через SDK | ✓ | ✓ | ✗ | ◐ | ✗ | ✗ | ◐ | ✗ | ◐ | ✗ (визуализатор Winamp) | Spotify Web Playback SDK | Минимальный пример бутстрапа SDK (брать оригинал tedsteen/Spotiamp, MIT) | Фork без LICENSE — код не брать |
| **Spotiamp+** | github.com/fdeox/spotiamp-plus | MIT | Rust desktop | Winamp-плеер: **нативный librespot (Ogg 320)** для Premium + свои локальные файлы; MilkDrop; lyrics; Free Mode = пульт официального приложения | ✓ | ✓ Spotify OAuth | ✓ (нативный стрим) / Free = remote | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ MilkDrop | librespot → аудио-бэкенды | Референс desktop-интеграции librespot; визуализатор | Desktop Rust; librespot-аудио **нельзя** легально вести в браузер |
| **librespot** | github.com/librespot-org/librespot | MIT | Rust | Open-source Spotify клиент-библиотека: auth, Connect-устройство, стриминг/декодирование Ogg | ✓ (Premium) | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ◐ | ✗ | ✗ | Собственный протокол Spotify | Знание протокола/семантики Connect; **подтверждение: серверный gateway c аудио в браузер — вне правил** | ToS Spotify: неофициальные клиенты; **§2 пользователя запрещает**; аудио в web не легально |
| **spotify-player** | github.com/aome510/spotify-player | MIT | Rust TUI | Терминальный клиент: Web API + librespot playback; synced lyrics (Musixmatch); popup+TUI | ✓ (Premium) | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ synced | ✗ | librespot | Чистая компоновка Web API + player-бэкенд; lyrics-провайдеры | TUI; librespot (те же ограничения) |
| **go-librespot** | github.com/devgianlu/go-librespot | GPL-3.0 | Go | Spotify Connect устройство: Premium; аудио-бэкенды (ALSA/Pulse/pipe); **−14 LUFS loudness norm**; crossfade; REST API + WebSocket; LRU audio cache | ✓ (Premium) | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ◐ | ◐ | ✗ | librespot-протокол | Дизайн REST/WS диагностического API (для PHASE 29); цель −14 LUFS | GPL; Go-бинарник; Premium; ToS |
| **Pear (ex youtube-music)** | github.com/th-ch/youtube-music | MIT | TS/Electron | YouTube Music десктоп с плагинами: полный трек YT Music, lyrics, visualizer, last.fm | ✓ (YT Music) | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ | Стриминг YT Music (web-эндпоинты) | Плагин-архитектура; lyrics-интеграция | Electron; YT-эндпоинты из web = ToS-риск; тяжёлый путь для Vercel |
| **cliamp** *(доп.)* | github.com/bjarneo/cliamp | MIT | Rust TUI | Мульти-источник: local/streams/YouTube/YT Music/**SoundCloud**/Mixcloud/Spotify/Qobuz/Tidal/Navidrome…; spectrum visualizer; parametric EQ | ✓ | ◐ (Spotify/Qobuz да) | ◐ (Spotify) | ✗ | ✓ | ◐ | ◐ | ✓ | ✗ | ◐ spectrum | Beep (audio) + go-librespot для Spotify | Мульти-источник с приоритетами; **SoundCloud как первого класса** | TUI; Rust |
| **spotatui** *(доп.)* | github.com/LargeModGames/spotatui | MIT | Rust TUI | «Native Spotify streaming, synced lyrics, visualizer, local, Subsonic, Radio, YouTube, Qobuz — **Spotify is optional**» | ✓ | ◐ | ◐ (Spotify опционален) | ✗ | ✓ | ◐ | ◐ | ✓ | ✓ synced | ◐ | librespot + другие бэкенды | Модель «**Spotify опционален**» — ровно философия MQ V3 | TUI; librespot для Spotify |

## Ответы на обязательные вопросы

### 1. Что взять у Spotube?
**Архитектурный паттерн №1 — plugin-разделение metadata-provider и audio-source-provider.**
Это ровно `Catalog ≠ Playback` из ТЗ. Конкретно переносим в MQ:
- контракт провайдера, у которого отдельно capabilities метаданных и отдельно capabilities аудио;
- независимость lyrics от источника звука (у Spotube LRCLib работает «regardless of the plugin» — у MQ lyrics уже отдельный конвейер, усиливаем);
- честное отображение источника (у MQ уже есть ProviderBadge — сохраняем).
Не берём: Flutter-код, YouTube-источники (ToS-риск, не разрешённые sources по ТЗ).

### 2. Что взять у Rheoson?
**Модель listening-аналитики**: MongoDB-схема событий прослушивания (plays, skips, completion,
replays, likes) → рекомендации. Это фундамент для PHASE 24–27 (Skip Intelligence):
у MQ уже есть `src/lib/wave/*` движок — обогащаем его skip-событиями по типу Rheoson.
Также: честное позиционирование «Spotify API — только метаданные, аудио — другие источники».
Не берём: серверный yt-dlp (тяжело, ToS-grey, не для serverless Vercel).

### 3. Что взять у Feishin?
**Абстракцию «один player-интерфейс — несколько бэкендов»** (MPV vs Web). У MQ аналог:
WASM Audio Engine ↔ SpotifyPlaybackAdapter ↔ HTMLAudio fallback. Унифицируем transport
в PlayerController (у MQ уже сделано в V2 — сохраняем). Также state machine synced/unsynced
lyrics. Не берём: код (GPL-3.0), Electron-специфику.

### 4. Что взять у Tonearm?
- **Infinite radio** — продолжение очереди треками, реально совпадающими с текущим
  прослушиванием (это точное ТЗ PHASE 27 Smart Queue; у MQ есть заготовка в wave/engine).
- **LRCLIB fallback** для lyrics, когда основной провайдер пуст (у MQ lrclib уже есть —
  укрепляем цепочку провайдеров).
- Music-reactive visualizer и ReplayGain-подход как ориентиры Wave/громкости.
⚠️ **NO LICENSE — только идеи, ни строчки кода.**

### 5. Что взять у Nuclear?
**UX «Stream sources for a queued track»** — список кандидатов-источников на каждый трек:
у MQ уже есть SourceSheet + provider badges; расширяем до списка кандидатов resolver'а
с confidence-score (PHASE 5). Также lyrics-переводы и listening stats. Не берём: код (AGPL).

### 6. Что взять у Kopuz?
Уже интегрировано в V2 (PKCE S256, Web Playback SDK adapter, end-of-track эвристики,
session downgrade). Продолжаем использовать как есть. Лицензия EUPL-1.2 позволяет
референс; наш код самостоятельный.

### 7. Что взять у Spotiamp?
**Минимальный бутстрап Web Playback SDK** (load SDK → create player → activateElement).
Брать оригинал **tedsteen/Spotiamp (MIT)**, а не форк YANIV3487 (нет LICENSE).
Для MQ это уже реализовано в `spotify/playbackAdapter.ts` — ссылка для регрессионных
сценариев (activation token, device_id timeout).

### 8. Что взять у librespot?
**Только знания, не реализацию в продукте.** Research подтвердил:
- librespot/go-librespot = Premium-требующие неофициальные клиенты; Spotify ToS это
  ограничивает, а §2 ТЗ прямо запрещает обход DRM и приватных эндпоинтов;
- серверная схема «MQ → gateway → librespot → аудио в браузер» **отвергается**: это
  извлечение/ретрансляция расшифрованного Spotify-аудио без официально поддерживаемого
  пути. Единственный официальный web-путь — Web Playback SDK (уже в MQ как опция);
- берём из go-librespot только дизайн **диагностического REST/WS API** (PHASE 29) и
  цель нормализации громкости −14 LUFS (у нашего WASM-движка есть loudness-модуль).

### 9. Что НЕЛЬЗЯ использовать (проверено по LICENSE/ToS)
| Запрещено | Причина |
|---|---|
| librespot/spotatui/Spotiamp+/cliamp **playback-код в продукт** | Неофициальный Spotify-клиент = ToS-риск; §2 ТЗ запрещает обход. Audio-to-browser gateway отвергнут |
| Код Nuclear (AGPL), Navidrome (GPL), Feishin (GPL), Sonixd (GPL, архив), go-librespot (GPL) | Copyleft — нельзя вливать в MQ |
| Код Harmonoid | **PolyForm Strict** — некоммерческий, копирование запрещено |
| Код Tonearm, форк YANIV3487/spotiamp | **Нет LICENSE** = all rights reserved |
| yt-dlp серверный аудио-путь (Rheoson/Pear) | ToS-grey, не для serverless, ТЗ требует разрешённых источников |
| Spotify/Deezer/iTunes preview как playback | §3 ТЗ: категорически; preview ≠ playback provider |
| Копирование UI Spotify/Kopuz/Lumen | ТЗ v2 §10 сохраняется: MQ UI — свой |

Разрешённые к заимствованию идей (не слепого копирования): Spotube (BSD-4), Rheoson (Apache-2),
Koel (MIT), Music Station (MIT), wavesurf (MIT), librespot/spotify-player (MIT — знания),
Spotiamp+ (MIT — знания), Kopuz (EUPL), cliamp (MIT), spotatui (MIT — знания).

## Вывод для архитектуры MQ V3

Research **подтверждает выбранное направление**:

```
CATALOG (Spotify catalog при наличии API / Deezer fallback / demo)
  → NORMALIZED TRACK (isrc, title, artist, album, duration)
  → FULL-LENGTH SOURCE RESOLVER (scoring: ISRC/title/artist/duration/album/version)
  → FULL-LENGTH VALIDATION (preview ≤35s — REJECT; supportsFullLength и т.д.)
  → PLAYABLE PROVIDER (SoundCloud / Audius / Spotify Official для Premium-Optional)
  → PLAYER CONTROLLER → PLAYBACK CLOCK → { WAVE, LYRICS, QUEUE, MEDIA SESSION }
```

Это пересекается с существующей цепочкой MQ ( Deezer → PlaybackResolver → SoundCloud ),
то есть **V3 = эволюция, не переписывание**: добавляем FullLengthSourceResolver +
validation + skip-intelligence + Wave-переработку + performance-фундамент.
