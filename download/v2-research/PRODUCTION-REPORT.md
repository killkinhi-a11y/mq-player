# MQ V2 — SPOTIFY OFFICIAL PLAYBACK
## PRODUCTION REPORT (§29)

Дата: 2026-10-08 · Production: **mq1.vercel.app** · Build: **mq-build-3da014de** (version 88) · Commit: 3da014de

---

## RESEARCH → РЕШЕНИЕ (§1–§5)

Полный отчёт: `download/v2-research/RESEARCH-REPORT.md` (данные: `*.json` из GitHub API + чтение исходников).

**Вердикт**: Spotify **Web Playback SDK + OAuth PKCE** — единственный легальный web-native
путь полного воспроизведения Spotify. Подтверждён тремя живыми web-референсами
(Kopuz, Lumen, Spotiamp) + официальным example. Семейство librespot отклонено:
собственный disclaimer «probably forbidden», GPL (go-librespot), нет браузерного
пути аудио. Deezer оставлен ТОЛЬКО как анонимный серверный каталог-fallback и
НИКОГДА не подменяет Spotify при подключённом пользователе (§25–26).

## ПРОИЗВОДСТВЕННЫЙ ОТЧЁТ

| Пункт | Статус | Доказательство |
|---|---|---|
| **Архитектура исследования → выбор** | ✅ PASS | Research table §3 (8 проектов), решение задокументировано |
| **Spotify OAuth (PKCE, без секрета)** | ✅ PASS | Прод: клик «Подключить Spotify» → live-redirect на `accounts.spotify.com/authorize` со всеми scopes, `code_challenge_method=S256`, `redirect_uri=https://mq1.vercel.app/spotify/callback` (скриншот 06). Секрет в браузере отсутствует вообще (secret-scan бандла CLEAN — только публичные URL) |
| **Spotify Premium detection** | ⏳ PENDING OWNER | Код: `/v1/me` → `product` (гейт `isOfficialAvailable`). Живая проверка требует входа Premium-аккаунта |
| **Spotify Web Playback (полный трек)** | ⏳ PENDING OWNER | Реализовано полностью: `SpotifyPlaybackAdapter` (§13 API), приоритет №1 в движке. 43 unit-теста (RFC 7636 вектор, browser-гейт, §13 surface, end-of-track эвристики, ошибки DRM). Живой тест >30/>90 сек требует Premium-аккаунт + зарегистрированный redirect URI (см. OWNER ACTIONS) |
| **FULL TRACK >30 sec / >90 sec / Seek** | ⏳ PENDING OWNER | Протокол теста выдан (ниже). Автоплей-заглушка не требуется — клик «Слушать» и есть user gesture |
| **MQ Player (UI сохранён)** | ✅ PASS | Прод-смоук: Mini-капсула, Full Player, бейджи «Deezer → SoundCloud», Settings, Library — всё на месте, дизайн MQ не менялся (§10) |
| **MQ Wave** | ✅ PASS (Mode B) / ⏳ Mode A | SoundCloud/Audius путь — полный waveform как раньше. Spotify Official — state-driven визуал (без PCM, §12: SDK не отдаёт raw audio — доказано research) |
| **Spotify search (каталог)** | ✅ PASS | При подключённом PKCE — прямые запросы к api.spotify.com от пользователя (userCatalog, раздел «Spotify · официальный каталог» первым). Анонимно — серверный каталог (сейчас отдаёт Deezer — диагностика Spotify client-credentials недоступна из датацентра) |
| **Spotify library** | ✅ PASS (UI) | Library → таб Spotify: Liked/Плейлисты/Альбомы/Исполнители/Недавно/Топ. Живые данные появляются после подключения |
| **Artist / Album** | ✅ PASS | Страницы исполнителя/альбома работают (серверный каталог + их SpotifyArtistView/AlbumDetailView) |
| **Lyrics** | ✅ PASS | Существующая MQ-система сохранена (Spotify не отдаёт lyrics третьим лицам — research §8) |
| **Queue** | ✅ PASS | Прод: авто-переход SNIP(0:29) → следующий трек (Starboy, полный 3:51, позиция шла 0:01→0:07+) |
| **Alternative resolver (Mode B)** | ✅ PASS | Прод: `/api/resolve` 200, цепочка Deezer-каталог → SoundCloud аудио с честными бейджами |
| **SoundCloud** | ✅ PASS | Аудио шло через SC-кандидата resolver'а |
| **Приоритет Spotify Official (§16)** | ✅ PASS (код+тесты) | Движок: official FIRST → их PlaybackResolver (ISRC/версии/штрафы) fallback. Мид-плей DRM-ошибка → авто-фолбэк с сохранением позиции |
| **Vercel** | ✅ PASS | mq-build-3da014de live, version 88, деплой через git push (проект не менялся) |
| **Тесты/типы/линт** | ✅ PASS | **1306/1306** (76 файлов; +43 Spotify-теста, деградации нет) · tsc src/ 0 · eslint 0 новых |

## ЧЕСТНЫЕ ОГРАНИЧЕНИЯ

1. **Серверный Spotify client-credentials каталог** из Vercel-окружения недоступен
   (диагностика параллельных агентов: token-http-NNN) → анонимный поиск отдаёт
   Deezer. Это НЕ влияет на подключённых пользователей: их каталог идёт напрямую
   из браузера с их PKCE-токеном (мимо серверных ограничений). Возможные причины
   для владельца: приложение в Development Mode / не добавлены пользователи /
   региональные ограничения Spotify.
2. **Safari и мобильные браузеры** не поддерживают Web Playback SDK (официальное
   ограничение) → там автоматически работает Mode B (SoundCloud/Audius) с честным
   бейджем — UI сообщает это явно.
3. Полный live-тест официального воспроизведения (>90 сек) **невозможен без
   реального Premium-аккаунта** — я не подделываю PASS (§6 правил).

## OWNER ACTIONS (для полного §20–21 теста)

1. **Spotify Developer Dashboard** (существующее MQ-приложение) → Edit Settings →
   **Redirect URIs**: добавить `https://mq1.vercel.app/spotify/callback`
   (и `http://127.0.0.1:3000/spotify/callback` для локальной разработки).
   Client Secret не нужен и нигде не запрашивается (PKCE).
2. В том же Dashboard → **User Management**: добавить Spotify-аккаунт(ы), с которых
   будет вход (Development Mode лимит — 25 пользователей).
3. На mq1.vercel.app: **Настройки → Звук → Источник музыки → Подключить Spotify** →
   войти с Premium-аккаунтом → подтвердить разрешения.
4. Тест §20–21: поиск трека (раздел «Spotify») → Слушать → бейдж «Spotify • Official»
   → дать играть ≥90 сек (0:00→0:30→1:00→1:30+) → Seek → Pause → Resume → Next →
   Queue → Artist → Album → Library → Lyrics. Если трек играет после 30-й секунды —
   это FULL TRACK (preview = ровно 30 сек и стоп).
5. (Опционально) Extended Quota Mode запрос в Dashboard, если нужен доступ 25+ аккаунтов.

## АРХИТЕКТУРА (итог)

```
Mode A — Spotify Official (приоритет при Premium + Chromium/Firefox/Edge desktop):
  Каталог Spotify (PKCE, от пользователя) ─→ NormalizedTrack (spotifyUri + catalogId)
    → SpotifyPlaybackAdapter (Web Playback SDK) ─→ PlayerController
    → MQ UI: прогресс/скраб/анимации по player_state (без PCM, честный бейдж)

Mode B — Alternative (fallback: Free / не подключён / Safari / mobile / SDK error):
  Каталог (Spotify-PKCE | серверный Spotify→Deezer) ─→ PlaybackResolver
    (ISRC → title/artist → duration → альбом → версии; karaoke/cover −100,
     live −50, remix −40…; SNIP −25; порог автоплея 0.60; выбор источника вручную
     с сохранением позиции) ─→ SoundCloud/Audius ─→ MQ Wave (полный waveform)
```

Две параллельные V2-линии (multi-provider engine + этот Spotify Official)
слиты в один коммит 3da014de: 8 конфликтов разрешены, их наработки
(resolver с ISRC-скорингом, provider-бейджи, low-confidence sheet,
source switcher, Deezer-каталог) сохранены как Mode B.

## Артефакты

- `download/v2-research/RESEARCH-REPORT.md` + `*.json` — research
- `download/qa-v2-spotify/01–06*.png` — прод-скриншоты (settings-карточка, library-таб, поиск, playing, OAuth-redirect)
- Тесты: `src/__tests__/spotify/{pkce,playbackAdapter,catalog}.test.ts` — 43
- Ворота: 1306/1306 · tsc 0 · eslint 0 новых · build PASS · secret-scan CLEAN
