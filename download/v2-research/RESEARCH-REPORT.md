# MQ V2 — DEEP RESEARCH REPORT
## Full Spotify Track Playback: GitHub Project Analysis

Дата: 2026-10-08
Метод: GitHub REST API (метаданные/коммиты/деревья) + чтение исходного кода (clone) + официальная документация Spotify developer.
Все данные — из первоисточников (README, код, docs), собраны в `download/v2-research/*.json`.

---

## 1. RESEARCH TABLE (§3)

| | **Kopuz** | **Lumen** | **Spotiamp** | **Spotiamp+** | **librespot** | **spotify-player** | **go-librespot** | **Spotify WPS example (official)** |
|---|---|---|---|---|---|---|---|---|
| **GitHub** | Kopuz-org/kopuz | id-fant/apple-music-liquidglass | YANIV3487/spotiamp | fdeox/spotiamp-plus | librespot-org/librespot | aome510/spotify-player | devgianlu/go-librespot | spotify/spotify-web-playback-sdk-example |
| **Last activity** | 2026-10-07 (очень активен) | 2026-05-17 (5 мес.) | 2026-07-04 | 2026-10-07 (очень активен) | 2026-10-05 | 2026-09-19 | 2026-10-03 | коммит 2022, push 2024 |
| **Язык** | Rust + Dioxus | JS (vanilla) + Vite/React | Чистый HTML/CSS/JS | Rust | Rust | Rust (TUI) | Go | JS (React + Node) |
| **Frontend/backend** | Desktop (Linux/macOS/Win, Flathub, GPlay); daemon + gRPC | Browser-only, без бэкенда | Browser-only (static) | Desktop native | Library/daemon, без UI | Terminal UI | Daemon/speaker, REST+WS | Web (React + Express) |
| **Spotify auth** | OAuth Authorization Code + **PKCE**, user-supplied Client ID, loopback redirect | **PKCE** (VITE_SPOTIFY_CLIENT_ID; README: «PKCE doesn't need a client secret — don't add one») | Authorization Code + **PKCE**, без сервера и секрета; Client ID в localStorage | OAuth через страницу Spotify | Password / Zeroconf-blob / Device Auth (реверс-протокол AP) | OAuth (+ streaming через librespot) | Zeroconf / OAuth / access token | Authorization Code **с client secret** (устаревший стиль) |
| **Full track playback** | ✅ ДА | ✅ ДА | ✅ ДА | ✅ ДА | ✅ ДА (декодирует поток) | ✅ ДА (через librespot) | ✅ ДА | ✅ ДА |
| **Premium required** | Да (playback); каталог — любой аккаунт | Да (playback/like/queue/library) | Да («SDK refuses to stream for free») | Да (Premium — librespot; Free Mode = пульт офиц. приложения) | Да («only works with Premium. Will remain so») | Да | Да | Да |
| **Playback method** | **Официальный Web Playback SDK** в браузере пользователя (WebView без Widevine → localhost WS мост) или Connect-устройство | **Web Playback SDK** (браузер = Connect device) | **Web Playback SDK** + Web API (`PUT /me/player/play?device_id`) | **librespot** (Ogg 320kbps, нативно) | Реверс-инжиниринг AP-протокола, декодирование Ogg Vorbis | librespot (streaming feature) | Реверс-протокол, ALSA/Pulse/pipe | Web Playback SDK |
| **Search** | ✅ (Web API) | ✅ (iTunes + Spotify) | ✅ (Web API `/search`) | ✅ (каталог Spotify) | ✗ (нет UI) | ✅ | ✗ (нет UI) | мин. |
| **Artists** | ✅ | ✅ (hero, top tracks, discography) | ✗ | ✅ | ✗ | ✅ | ✗ | ✗ |
| **Albums** | ✅ | ✅ | ✗ | ✅ | ✗ | ✅ | ✗ | ✗ |
| **Playlists** | ✅ | ✅ (user playlists) | ✗ | ✅ (browser+Library) | ✗ | ✅ | ✗ | ✗ |
| **Lyrics** | ✗ (scrobbling есть) | ✗ | ✅ через lyrics.ovh (не Spotify) | ✅ | ✗ | ✅ (synced) | ✗ | ✗ |
| **Queue** | своя (gRPC); SDK держит 1 трек | ✅ | Spotify shuffle/repeat | ✅ (Winamp playlist) | — | ✅ | — | ✗ |
| **Library** | ✅ saved tracks/albums/playlists | ✅ Liked/Albums/Artists/Playlists/Recently Added | ✗ | ✅ (+ Recently/Most played, Loved) | — | ✅ | — | ✗ |
| **Интеграция в MQ?** | Архитектурный референс (Rust desktop — код не переиспользуем) | ✅ Да — ближайший web-референс | ✅ Да — эталонный адаптер (player.js = требуемый API 1:1) | ❌ Desktop + librespot | ❌ ToS-риск (см. §24) | ❌ TUI + librespot | ❌ GPL + ToS-риск | Референс scopes/lifecycle |
| **MQ сохранит Wave UI?** | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| **Main limitation** | Desktop; SDK требует Widevine → мост в браузер | Нет лицензии (0★, личный проект); iTunes preview как fallback | Личный проект без лицензии; UI Winamp (не берём UI — берём адаптер) | Desktop-only; librespot | **«Using this code to connect to Spotify's API is probably forbidden by them»** (собственный disclaimer); Premium-only; нет браузера | Terminal; librespot | GPL-3.0; нет легального пути аудио в браузер | Не поддерживается; auth с secret |

---

## 2. Вердикт по web-native (§4)

Все три живых **web-native** проекта (Kopuz — production-класс, Lumen, Spotiamp) используют **одну и ту же архитектуру**:

```
OAuth Authorization Code + PKCE  (client_id публичный, секрета НЕТ)
        ↓
Spotify Web Playback SDK  (браузер становится Spotify Connect device)
        ↓
PUT /me/player/play?device_id=X  { uris: [spotify:track:...] }   ← запуск трека
        ↓
SDK: pause/resume/seek/nextTrack/previousTrack/setVolume/getCurrentState
     события: ready / not_ready / player_state_changed / autoplay_failed
     ошибки: initialization / authentication / account / playback
```

**Это ровно вариант §7. Подтверждён тремя независимыми реализациями + официальным example.**

## 3. Ответ на §11 — отдаёт ли SDK raw audio URL?

**НЕТ.** Подтверждено кодом Spotiamp (README, «Known limitations»):
> «Spotify's Web Playback SDK streams DRM-protected audio through a sandboxed decoder and never exposes raw samples or an insertible Web Audio node.»

Следствия для MQ (§12):
- Никакого `Spotify → raw URL → HTMLAudioElement → waveform` — архитектурно невозможно.
- Правильно: `SDK → Spotify-managed playback → MQ Player Controls` + визуальный слой MQ поверх player state.
- Waveform в режиме Spotify Official: без PCM — прогресс/скраб/анимации по position_ms из state (честно, без фейка).
- Bitrate/sample rate Spotify не раскрывает (§22): бейдж только «Spotify Official», без «320 kbps».

## 4. Ответ на §5/§24 — librespot как серверный playback engine

Изучены: librespot (Rust, MIT), spotify-player (Rust TUI, MIT), go-librespot (Go, GPL-3.0), Spotiamp+ (Rust desktop).

- **Авторизация**: password / Zeroconf DH-blob / Device Auth — реверенс-инжиниринг протокола Spotify AP, НЕ официальный OAuth Web API.
- **Playback**: декодирование зашифрованного аудиопотока (Ogg Vorbis 96–320 kbps). Premium only.
- **Audio backends**: rodio/ALSA/PulseAudio/JACK/pipe — все системные (десктоп/сервер), ни один не браузерный.
- **Легальность**: собственный disclaimer librespot: **«Using this code to connect to Spotify's API is probably forbidden by them. Use at your own risk.»** — то есть сам проект признаёт вероятный запрет ToS.
- **Проксирование расшифрованного аудио в браузер MQ** = stream ripping → прямо запрещено ТЗ (§6) и условиями Spotify.
- **GPL-3.0 go-librespot** — вирусная лицензия, несовместима с закрытым MQ.
- **Verdict: ❌ НЕ интегрируем.** Playback Gateway на librespot не проходит ни одну проверку §24 (лицензия, auth, Spotify requirements, security, production).

## 5. Критические технические ограничения для реализации MQ

Зафиксировано из кода референсов (первоисточники):

1. **Браузеры**: Web Playback SDK = desktop Chromium/Firefox/Edge (EME/Widevine). Safari и мобильные браузеры не поддерживаются → авто-fallback на Alternative Playback (SoundCloud/Audius) с честным бейджем. (Официальные docs: mobile autoplay restrictions.)
2. **Premium**: SDK требует Premium (account_error у Free). Каталог (search/library/artist/album) работает на любом аккаунте.
3. **Development Mode приложения Spotify**: пока app в dev-режиме, входить могут только allowlisted аккаунты (до 25, «Users and Access» в dashboard) — нужно добавить аккаунт владельца. Extended Quota Mode — по запросу.
4. **Redirect URI**: точное совпадение, HTTPS (127.0.0.1 допустим; `localhost` новые app-ы отклоняют — факт из Lumen README).
5. **Autoplay policy**: запуск воспроизведения требует user gesture (`activateElement`); Kopuz имеет отдельное событие Activated.
6. **SDK держит один трек** (Kopuz: «the SDK only ever holds one track — kopuz routes it through its own queue») → MQ queue остаётся source of truth, end-of-track → MQ nextTrack().
7. **DRM license failures**: треки могут умереть ~10 сек после старта (Kopuz host.rs, kind=license) → нужен retry/fallback на альтернативный источник.
8. **Lyrics**: Spotify не отдаёт lyrics сторонним приложениям (Spotiamp: «Spotify's own API doesn't expose lyrics to any third-party app») → MQ сохраняет собственную lyrics-систему (lrclib), и это соответствует ТЗ.
9. **Scopes** (официальный example + Spotiamp): `streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state user-read-currently-playing` + library-скоупы для Library.
10. **Connect device видно другим клиентам** — воспроизведение может «увести» другое устройство; нужен listener not_ready + честная обработка.

## 6. ИТОГОВОЕ АРХИТЕКТУРНОЕ РЕШЕНИЕ

**Main variant §7 ПОДТВЕРЖДЁН исследованием:**

```
Режим A — Spotify Official Playback (приоритет при Premium + поддерживаемом браузере):
  Spotify Catalog (Web API, PKCE token)
        ↓ NormalizedTrack (source: "spotify")
  SpotifyPlaybackAdapter (Web Playback SDK)
        ↓ connect/play/pause/resume/seek/setVolume/getState
  PlayerController (useAudioEngine — новый маршрут)
        ↓ position_ms / duration / paused из player_state_changed
  MQ UI (Wave-визуал по state, без PCM; бейдж «Spotify Official»)

Режим B — Alternative Playback (fallback, уже работает):
  Spotify Catalog → PlaybackResolver → SoundCloud/Audius → MQ Wave (полный waveform)

Priority (§16): A первым; авто-fallback на B при: не подключён / Free / Safari|mobile /
SDK error. Ручной выбор источника — вручную, с сохранением позиции.
```

- Client Secret: **не нужен вовсе** (PKCE), не создаём (§9).
- Клиентский ID: публичный по дизайну OAuth; берём из существующего env SPOTIFY_CLIENT_ID (уже в Vercel для charts) через публичный config-endpoint.
- Deezer: остаётся только в существующем charts-fallback (метаданные), НЕ участвует в Spotify-пути (§25-26).
- UI MQ не меняется: Mini Player / Fullscreen / Queue / Lyrics / Wave / темы (§10).
