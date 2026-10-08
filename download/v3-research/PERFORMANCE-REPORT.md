# MQ V3 — PERFORMANCE REPORT (PHASE 39)

Дата: 2026-10-08 · Production: `mq-build-2c7e1aab` (v90) · mq1.vercel.app

## BEFORE / AFTER

| Метрика | BEFORE (V2) | AFTER (V3) | Изменение |
|---|---|---|---|
| Запросов /api/resolve на один трек при гонках | N (каждый play = свой запрос) | 1 (dedup in-flight) | **−(N−1) сетевых** |
| Поздние (stale) resolve-запросы | доезжали до конца, занимали канал | abort по generation (§2/§28) | **сеть останавливается** |
| `catalogResolving` флаг при rapid A→B→C | мог быть сброшен старым запросом | защищён generation-проверкой | **state-glitch устранён** |
| rAF-циклов воспроизведения одновременно | до 6 (engine + Wave + LiquidLyrics×3 + FullscreenLyrics + ProgressBar-hover) | **1 PlaybackClock** + slow-poll 250ms на паузе | **−5 циклов** |
| Re-render дерева плеера на кадр | 0 (было и в V2 — сохранено) | 0 (refs + canvas) | держится |
| Отрисовка Wave на кадр | полная перерисовка всех баров | 2 drawImage + clip + playhead (двухслойный offscreen-кэш) | **O(bars)→O(1) на кадр** |
| Resolve следующего трека при переключении | 700–900ms round-trip в тёплом случае | prefetch за 4s до переключения (§12): resolve+artwork+lyrics | **~0ms на горячем свитче** |
| Стоп трека на 30s (SNIP) в resolver-цепочке | возможен (penalty −25, но играл) | структурный REJECT (§6) | **исключено в обычном Play** |
| Skip-сигналов записывалось | только wave-radio + media-keys | все play/skip/complete/replay/favorite (§24) | **полное покрытие** |

## Замеры с production (timeline, реально измерено)

Игровой прогон (production smoke, трек «Blinding Lights»):
```
T0-click            +0ms
T1-track-selected   +125ms      ← мгновенная UI-реакция (playTrack)
T4-url-resolved     +1020ms     ← resolver: SoundCloud, confidence 1.0 (TTSourceResolve)
T3-api-headers      +1779ms     ← HTTP 200 стрим-API
T5-network-start    +2859ms
T6-first-byte       +2861ms     ← TTFirstAudio
T7-audio-metadata   +3163ms     ← метаданные потока
TOTAL               ~3.2s до звука (холодный resolve)
```
Тёплый путь (prefetch §12): resolve-время на свитче → **~0ms** (результат в кэше).

## Diagnostics (§29 — доступно в dev-панели + window.__mqTimeline.metrics())

TTPlayIntent · TTSourceResolve · TTFirstAudio · TTReady · TTPlaybackStart ·
Match Confidence · Full-length verdict · Current Time / Buffer ·
Requests in-flight · Dedup hits · Cache hits · Aborted (stale) ·
Prefetch hits/misses · PlaybackClock subscribers · Skip events count.

## Остаточные ограничения (честно)

- Холодный resolve через серверный search (SoundCloud+Audius) — 0.8–1.5s:
  это внешний поиск провайдера; кэшируется 30 мин (клиент) / 7 дней (сервер).
- Spotify server-catalog (client credentials) недоступен — Deezer каталог
  остаётся fallback с честным бейджем (без изменений из V2).
- Dedup/TTL-кэш применён на resolver + playback путях; каталогные страницы
  используют свои локальные кэши (без регрессий; расширение — следующий шаг).
