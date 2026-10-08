# MQ V3 — ARCHITECTURE AUDIT (PHASE 1)

Дата: 2026-10-08 · Область: /providers (spotify, deezer), /player (useAudioEngine,
PlayerBar, FullPlayer), /audio (audioEngine + WASM), /wave (waveform + wave),
/store (useAppStore), /search (SearchView), /lyrics, /api.
Принцип: **расширять, не переписывать** — всё перечисленное ниже чинится точечно.

## A. Что УЖЕ хорошо (сохранить и не трогать)

| Область | Что есть | Оценка |
|---|---|---|
| Play flow | `playTrack` мгновенно ставит currentTrack + `_playLock` + T0-инструментация | ✓ instant UI reaction |
| Engine race | `loadGenerationRef` (generation++) + `cancelled` флаг в loadTrack; stale-результаты отбрасываются | ✓ базовая защита есть |
| Search | debounce 300ms + AbortController + параллельный catalog/music запрос | ✓ |
| Resolver server | /api/resolve ищет SoundCloud+Audius **параллельно** (Promise.all), ISRC-скоринг, версии | ✓ |
| Resolver cache | серверный match-cache 7 дней + клиентский 30 мин | ✓ |
| Gapless | WASM next-track регистрация + SC stream prefetch (4s deferred) | ✓ |
| Wave рендер | Canvas 2D, DPR-aware, refs + один rAF, ZERO re-render на кадр, keyboard slider | ✓ фундамент |
| Skip core | wave/events.ts classifySkip по глубине прослушивания + 4-слойный taste profile + /api/wave/feedback | ✓ заготовка |
| Attribution | ProviderBadge/PlaybackSourceBadge, low-confidence sheet, SourceSheet | ✓ честность |
| Spotify Official | PKCE + Web Playback SDK уже PRIORITY 1 при Premium, авто-fallback на resolver | ✓ §8 уже почти готов |

## B. Найденные проблемы (чинить по фазам)

### P1 — CRITICAL: preview может попасть в auto-play (§3/§6)
`resolver.ts`: preview-кандидат получает лишь −25 и остаётся играемым при
confidence ≥ 0.60. Нет поля `isFullLength`, нет REJECT-правила для ~30-секундных
источников. → PHASE 4-6: FullLengthSourceResolver + validation, preview
исключается из обычного Play.

### P2 — Нет request dedup / in-flight cache / SWR (§23)
`resolveCatalogTrack` не дедуплицируется (2 вызова = 2 запроса); /api/artist,
/api/catalog/* из Home/Search/Artist друг друга не дедуплицируют; нет общего
TTL-кэша. Мелкий race: SearchView ставит `setSearchResults` после `res.json()`
без повторной проверки aborted (окно ~мс). → PHASE 2: requestRegistry
(generation + abort + dedup + TTL + SWR).

### P3 — Resolver-запрос не привязан к generation (§28)
`AbortSignal.timeout(25s)` — по времени, не по поколению: при rapid A→B→C→D
запросы A/B/C продолжают жить (трафик), а `catalogResolving:false` в конце
старого resolve сбрасывает флаг нового (мелкий state-glitch). → PHASE 2+28:
передавать AbortSignal поколения; проверять generation после каждого await.

### P4 — Несколько независимых таймеров (§13/§19)
Сейчас: engine progress-RAF registry + WaveformView rAF + LiquidLyrics **3 своих
rAF** + FullscreenLyrics rAF + ProgressBar rAF + PlayerBar volume rAF. Часы
смешаны (кто-то currentPlaybackPosition, кто-то свой). → PHASE 13: единый
`PlaybackClock` (один rAF, подписчики: Wave/Lyrics/Progress/MediaSession).

### P5 — Wave-состояния неполные (§15/§16)
`data-status` = loading/ready/partial/unavailable — нет BUFFERING / SEEKING /
ERROR / ENDED с визуальным различием; нет buffer-визуализации (buffered ranges);
нет artwork-aware окраски; плоские бары без глубины. → PHASE 14-17: полная
переработка рендера при сохранении canvas+rAF-контракта.

### P6 — Prefetch только для уже-разрешённых SC-треков (§12)
`prefetchNextTrackStream` работает только при `next.scTrackId > 0`. Следующий в
очереди каталог-трек (source "spotify"/deezer, неразрешённый) НЕ резолвится
заранее; lyrics-доступность и artwork не префетчатся. → PHASE 12: каталог-prefetch
(metadata → match → artwork → lyrics availability) без скачивания аудио.

### P7 — Страничные запросы не всегда параллельны (§21)
ArtistDetailView: Promise.allSettled ✓; SpotifyArtistView — два независимых
useEffect (последовательно); AlbumDetailView — один запрос. Общей дедупликации
нет (P2). → PHASE 21 + P2.

### P8 — Skip-модель только по фракции; события не для всех плеев (§24/§25)
classifySkip — по % (10/30/70/95), а ТЗ требует секунды (<10s / 10-30s /
30-60s / 60%+ / 90%+ / 100%) + time decay + поля события (trackId, artistId,
albumId, provider, startedAt, skippedAt, playedSeconds, duration,
completionRatio, skipPosition). Wave-события эмитятся в основном в wave-radio
ветках store (2803-2922) — обычные play/skip очереди шлют не всё. → PHASE 24-26:
seconds-модель + decay + единый ListeningEvents для ВСЕХ воспроизведений.

### P9 — Smart queue только в Wave Radio (§27)
Продолжение очереди с taste-скорингом есть (wave/engine + /api/wave/next), но
включается только в режиме волны. Обычная очередь при исчерпании просто
останавливается (upNext ручной). → PHASE 27: autoplay/smart-queue для обычной
очереди с negative-сигналами + diversity.

### P10 — Метрики без имён ТЗ (§29)
playbackTimeline (pbStart/pbMark T0-T5) есть, но нет TTPlayIntent/
TTSourceResolve/TTFirstAudio/TTReady как отдельных сущностей с агрегацией;
AudioDebugPanel не показывает resolver time / match confidence / aborted /
prefetch / lyrics status. → PHASE 29.

### P11 — Кандидаты resolver не показаны в Source Sheet (§5 Nuclear-паттерн)
SourceSheet показывает провайдеров, но не список альтернатив с confidence —
Nuclear-style «stream sources for a queued track» отсутствует. → PHASE 5/9.

### P12 — Изображения (§22)
`loading="lazy"` в списках есть; hero-изображения без `fetchPriority="high"`,
нет единых `sizes`, декодирование не всегда `decoding="async"`. → PHASE 22.

## C. Карта «фаза → файлы»

| Фаза | Файлы (существующие) | Новые |
|---|---|---|
| 2 | playback/client.ts, SearchView, useAudioEngine (resolve block) | lib/net/requestRegistry.ts |
| 3 | useAudioEngine, store | — (верификация + параллелизация вторичных) |
| 4-6 | playback/resolver.ts, /api/resolve, client.ts, SourceSheet | playback/fullLength.ts |
| 7 | /api/catalog/*, spotify/catalog.ts, deezer/*, userCatalog.ts | /api/catalog/artist, album, related |
| 8 | spotify/playbackAdapter.ts (готово, priority tune) | — |
| 9 | Artist/Album/Track/Playlist views | — |
| 10 | LibraryView, SpotifyLibraryView | — |
| 11 | useAppStore queue-поля (уже есть) | — |
| 12 | useAudioEngine prefetch block | playback/prefetch.ts |
| 13 | LiquidLyrics, FullscreenLyrics, WaveformView, ProgressBar | playback/clock.ts |
| 14-19 | WaveformView, waveform/*, computePeaks | wave/ (новый рендер-модуль) |
| 24-27 | wave/events.ts, profile.ts, relevance, queue, store 2803-2922 | listening/skipStore.ts |
| 29 | playbackTimeline.ts, AudioDebugPanel | — |

TEST GATE PHASE 1: **PASS** (изменений кода не требуется; все 1306 тестов зелёные
из PHASE 0).
