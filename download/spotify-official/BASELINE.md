# MQ — SPOTIFY OFFICIAL PLAYBACK: BASELINE (PHASE 0)

Дата: 2026-10-09 (UTC+8) · Зафиксировано ДО любых изменений этой сессии.

---

## 1. Git / деплой

| Параметр | Значение |
|---|---|
| Локальная ветка | `main` = `origin/main` = **0b16fd86** (`docs(free-mode): FREE-MODE-REPORT.md + QA evidence + worklog`) |
| Working tree | clean (только untracked `upload/*` — скриншоты прошлых сессий) |
| Production URL | https://mq1.vercel.app |
| Production build | **mq-build-0b16fd86** (version 90, commit 0b16fd86a67fce…) — `/version.json` live-check |
| Соответствие код/прод | **Идентичны** (прод собран из того же коммита 0b16fd86) |
| Vercel проект | существующий MQ (домен не менялся) |
| Remote | github.com/killkinhi-a11y/mq-player |

## 2. Гейты (зафиксированы на baseline-коммите)

| Гейт | Результат |
|---|---|
| Тесты (vitest) | **1387 / 1387 PASS** (81 файл) |
| TypeScript (`tsc --noEmit`) | 18 pre-existing (все вне `src/` — prisma/engine артефакты; **0 в src/**) после `prisma generate` |
| ESLint | 57 errors / 1026 warnings — все pre-existing (= baseline прошлой сессии, 0 новых) |
| Local `next build` | НЕ выполняется локально: 4GB-контейнер OOM-kill на page-data (задокументировано в FREE-MODE-REPORT §3.2). Авторитетная сборка — Vercel |
| Production smoke | `/version.json` 200, `/api/spotify/config` 200 → `{"clientId":"7d9b7d61…","pkce":true}` |

## 3. Существующая архитектура плеера (не переписывать!)

```
useAppStore (zustand, 4131 строк) — queue/currentTrack/playbackMode/spotify*
   └─ useAudioEngine (3235 строк) — единственный движок
        ├─ WASM/element путь (SoundCloud/Audius/demo/local) + gapless + prefetch
        └─ Spotify Official путь (V2 §16):
             catalog track (source "spotify", spotifyUri) 
               → isOfficialAvailable()? 
               → spotifyPlaybackAdapter.play(spotify:track:id)  [Web Playback SDK]
               → playbackMode "spotify", transport bridge (seek/volume/position)
   └─ PlaybackClock (V3) — ОДИН rAF-цикл: Wave/Lyrics/Progress/MediaSession
```

- `SpotifyPlaybackAdapter` (`src/lib/spotify/playbackAdapter.ts`, singleton): connect/disconnect/play/pause/resume/seek/next/previous/setVolume/setShuffle/setRepeat/getState + onReady/onState/onEnded/onError; интерполяция позиции; end-of-track эвристики; error kinds: auth/account/init/playback/network. **Отсутствуют**: transferPlayback (не нужен — устройство уже в сессии), activate() публичный (activateElement вызывается внутри autoplay_failed).
- `SpotifyAuthManager` (`src/lib/spotify/auth.ts`): PKCE S256, browser→accounts.spotify.com token exchange (CORS официально поддержан), refresh с in-flight dedup, /me → product, честный logout при 400/401 refresh.
- `useSpotifySession` (AppShell mount) → store-поля spotifyConnected/Premium/DisplayName/PlaybackSupported.
- Callback: `/spotify/callback` (page.tsx) — code exchange, history clean, `/app?spotify=connected`.
- Redirect URI: `{origin}/spotify/callback` (прод: `https://mq1.vercel.app/spotify/callback` — зарегистрирован владельцем, live-редирект подтверждён в V2 QA).

## 4. Что УЖЕ работает (V2 3da014de + V3 480fef51 + free-mode 7cd9721d)

1. OAuth PKCE полностью (включая live-redirect на проде — V2 QA скриншот 06).
2. Web Playback SDK adapter — полный §13 API, 43 unit-теста.
3. Приоритет Official в движке: connected+Premium+desktop → SDK играет полный трек.
4. Бейдж «Spotify • Official» (SpotifyOfficialBadge) — только при playbackMode==="spotify".
5. Transport: seek/volume/pause/resume/position — SDK-owned.
6. Queue: MQ-очередь ведёт (SDK держит 1 трек), spotifyUri персистится в очереди (store:3606).
7. Каталог от пользователя (PKCE, прямые запросы api.spotify.com) + серверный каталог (client-credentials → Deezer fallback) + Deezer никогда не выдаёт себя за Spotify.
8. Library/Artist/Album/Track страницы (SpotifyLibraryView/SpotifyArtistView/AlbumDetailView).
9. Performance: generation guards, AbortController, dedupe, один PlaybackClock, prefetch.
10. Skip Intelligence + Smart Queue (не влияет на источник плейбэка).

## 5. ЧТО МЕНЯЕТ НОВОЕ ТЗ (единственный архитектурный дельта-блок)

**PHASE 8 — запрет тихой подмены.** Сейчас есть ДВА пути автоподмены Spotify-трека
альтернативным источником, противоречащих новому ТЗ:

| # | Путь | Код | Поведение сейчас | Стало |
|---|---|---|---|---|
| 1 | Load-time fallback | `useAudioEngine.ts:2183–2300` | Official недоступен (не подключён / Free / Safari / mobile) ИЛИ play() упал → автоматически `resolveCatalogTrack()` → SoundCloud/Audius | Spotify-трек (catalogProvider==="spotify", spotifyUri) играет ТОЛЬКО через SDK; иначе честный гейт/UI-стейт, resolver не вызывается |
| 2 | Mid-play error fallback | `useAudioEngine.ts:1039–1058` | Ошибка DRM/стрима в середине трека → тост «Переключаюсь на альтернативный источник» → forceSpotifyFallback → resolver | «Spotify playback unavailable» + Retry + Reconnect Spotify; похожий трек НЕ запускается |

**Остаются без изменений** (не Spotify-треки — подмены нет):
- Deezer-каталог (анонимный fallback-каталог, без spotifyUri) → resolver — это самостоятельный путь Free Mode, честные бейджи «Deezer → SoundCloud»;
- SoundCloud/Audius как прямые провайдеры поиска;
- Явный переключатель источника из плеера (SourceSheet) — действие пользователя, честные бейджи.

**PHASE 7 — новые честные UI-стейты:** `Connect Spotify to play full tracks` (не подключён) · `Spotify Premium is required for full playback` (Free) · браузер не поддержан · `Spotify playback unavailable` + Retry/Reconnect (ошибка).

## 6. Окружение Spotify

- `SPOTIFY_CLIENT_ID` задан в Vercel env (config endpoint отдаёт его публично — PKCE, секрет НЕ нужен и НЕ хранится в браузере).
- Серверный client-credentials каталог из Vercel недоступен (Development Mode / allowlist) — диагностировано в V2; на подключённых пользователей НЕ влияет (прямые запросы из браузера).
- Redirect URI прода зарегистрирован (live-redirect подтверждён). 127.0.0.1:3000 — для локальной разработки (владелец).
- Development Mode: allowlist ≤25 пользователей (OWNER ACTION из V2 отчёта — сохранить).

## 7. Тестовый baseline (не уменьшать)

- 1387 тестов, из них Spotify: `src/__tests__/spotify/{pkce,playbackAdapter,catalog}.test.ts` (43) + playback-resolver + spotify-normalize + auth oauth-providers.
- Все новые тесты этой сессии ДОБАВЛЯЮТСЯ к 1387; существующие ожидания не меняются ради зелёного.
