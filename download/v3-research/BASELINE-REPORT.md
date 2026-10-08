# MQ V3 — BASELINE REPORT (PHASE 0)

Дата: 2026-10-08
Ветка: `main` (рабочее дерево чистое)

## Git / Deploy

| Параметр | Значение |
|---|---|
| HEAD commit | `28472273` (worklog+qa: v2 spotify official) |
| Remote | github.com/killkinhi-a11y/mq-player |
| Production (Vercel) | `mq-build-3da014de`, commit `3da014de`, v88 (по данным QA из worklog) |
| Предыдущий prod buildId в repo | `mq-build-c1920732` (v87, стейл — регенерится prebuild-скриптом) |

## Gates (baseline)

| Gate | Результат |
|---|---|
| Tests (vitest) | **1306/1306 PASS** (76 файлов, 78s) |
| Typecheck `src/` | **0 errors** (ошибки только в `desktop/` Tauri-оболочке и `skills/` — вне скоупа, пре-существующие) |
| Lint `src/` | **55 errors / 536 warnings — ВСЕ пре-существующие** (в основном react-hooks/exhaustive-deps в admin-страницах и тестах). Gate для V3: 0 НОВЫХ |
| Production build | **PASS** — 118 страниц, compiled 24.6s |

## Package scripts

`dev` / `build` (prisma generate && next build) / `start` / `lint` / `test` (vitest run) /
`test:watch` / `db:*` (prisma) / `preview|deploy|upload` (opennextjs-cloudflare — legacy путь, деплой идёт через Vercel) / `analyze`.

## Env names (только имена, значения не раскрываются)

`DATABASE_URL`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET`,
`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SOUNDCLOUD_CLIENT_IDS`,
`YANDEX_ADAPTER_URL`, `LASTFM_API_KEY`, `LASTFM_SHARED_SECRET`,
`GOOGLE_CLIENT_ID/SECRET`, `TELEGRAM_BOT_TOKEN/BOT_NAME/WEBHOOK_SECRET`,
`UPSTASH_REDIS_REST_URL/TOKEN`, `BREVO_*`, `ADMIN_USERNAMES`,
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_BASE_URL`, `QA_BASE`, `VERCEL_URL`, …

## Существующая архитектура (зафиксировано, НЕ переписывать)

```
Catalog Provider (Deezer lib, Spotify userCatalog/pkce, demo)
  → NormalizedTrack (src/lib/music-utils, deezer/normalize, spotify-normalize)
  → PlaybackResolver (src/lib/playback/resolver.ts + /api/resolve — ISRC + scoring, версии)
  → Audio Provider (SoundCloud /api/music, Audius src/lib/audius.ts, local/demo)
  → Audio Engine (src/lib/audioEngine.ts + WASM audio-engine/, HTMLAudio + WebAudio)
  → MQ Wave (WaveformView.tsx + waveform/{computePeaks,liveSampler,waveformCache})
  → Player UI (PlayerBar, FullPlayer, SpatialFullPlayer, FullTrackView, MobileDock)
```

- **Store**: `src/store/useAppStore.ts` (zustand, 3903 строк) — queue, playlists, history,
  favorites, library, playback state, Media Session.
- **Engine hook**: `src/components/mq/useAudioEngine.ts` (3177 строк) — Spotify Official
  (PRIORITY 1, PKCE+Premium) → PlaybackResolver (fallback) уже реализовано в V2.
- **Wave engine (smart queue v1)**: `src/lib/wave/*` (clusters, diversity, relevance,
  scoring, profile) — уже есть рекомендательный движок «MQ Wave Radio».
- **Lyrics**: `src/lib/lyrics/{lrclib,types}` + lyrics-client + LiquidLyrics + FullscreenLyrics.
- **API**: /api/{catalog, resolve, music, lyrics, wave/*, playlists, smart-playlists,
  spotify/*, yandex/*, …} — большой существующий набор.
- **Тесты**: 76 файлов / 1306 тестов, включая v2-набор (spotify pkce/adapter/catalog),
  playback-resolver, wave engine, queue-ops, waveform, lyrics и т.д.

## Известные ограничения baseline (из QA v2)

- Spotify server-side catalog (client credentials) недоступен для анонимных запросов
  (quota/access) → Deezer catalog как fallback; UI честно показывает бейджи.
- 30-секундные SNIP встречаются у части SoundCloud-источников (resolver пока не
  отсекает их как preview) — это один из главных предметов V3 (PHASE 6).

TEST GATE PHASE 0: **PASS** (1306/1306).
