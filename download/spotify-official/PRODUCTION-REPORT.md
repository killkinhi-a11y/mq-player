# MQ — SPOTIFY OFFICIAL PLAYBACK: PRODUCTION REPORT

Дата: 2026-10-09 (UTC+8) · Коммиты: `b8678076` + `f5f02572` (main)
Продакшен: **https://mq1.vercel.app** · Deployment: **mq-build-f5f02572** (v90,
releasedAt 2026-10-09T15:37:23Z, живой через 140 c после push)
Preview: **https://mq1-ltyqfgl7k-killkinhi-5353s-projects.vercel.app**
(коммит `f5f02572`, build SUCCESS → QA → только после этого push в main)

---

## 1. Изменённые файлы (2 коммита этой сессии)

| Файл | Изменение |
|---|---|
| `src/lib/spotify/gate.ts` | NEW — чистое решение гейта (4 состояния) + копирайт; `isSpotifyOfficialTrack` |
| `src/components/mq/SpotifyGateSheet.tsx` | NEW — honest no-substitution sheet: Retry / Reconnect / Connect / Понятно |
| `src/__tests__/spotify/gateSheet.test.tsx` | NEW — 12 компонентных тестов (createRoot + act, IS_REACT_ACT_ENVIRONMENT) |
| `src/__tests__/spotify/officialGate.test.ts` | NEW — 30 тестов: гейт-решения, OAuth state, store-действия + 6 регрессий этой сессии |
| `src/lib/spotify/auth.ts` | PKCE-сессия: state/verifier single-use, refreshInFlight single-flight, honest logout |
| `src/lib/spotify/pkce.ts` | RFC 7636 примитивы, origin-derived redirect URI, 30s expiry skew |
| `src/lib/spotify/playbackAdapter.ts` | WPSDK-адаптер: dedup инстанса, playSeq-поколения, 404/403/401, 1Hz polling, end-of-track |
| `src/components/mq/useAudioEngine.ts` | Official-only ветка (без подмены), двойная защита от double-audio, режим только при подтверждённом успехе |
| `src/store/useAppStore.ts` | `spotifyGate` + retry-nonce; гейт → mode idle + SDK pause; togglePlay re-attempt официального пути |
| `src/components/mq/AppShell.tsx` | Монтирование SpotifyGateSheet (одна точка, App-уровень) |
| `src/components/mq/SpotifyConnectCard.tsx` | Честные состояния (unconfigured / connected+Premium / Free / unsupported) |
| `src/components/mq/FullTrackView.tsx` | Developer Policy §II — кнопка «Открыть в Spotify» (link-back) |
| `src/components/mq/WaveformController.tsx` | Сэмплер полностью остановлен в spotify-режиме (никакой фейковой волны) |
| `src/app/spotify/callback/page.tsx` | OAuth callback: очистка URL, честные ошибки, state-проверка до обмена кода |
| `src/hooks/useSpotifySession.ts` | Честный toast при ненастроенном сервере (SPOTIFY_NOT_CONFIGURED) |
| `scripts/vercel_preview_url.py` | NEW — GitHub API helper для preview-URL |

## 2. Результаты всех проверок

| Проверка | Результат |
|---|---|
| TypeScript (`tsc --noEmit`, scope `src/`) | **0 ошибок** (ошибки `desktop/`/`skills/` существовали до сессии, вне скоупа приложения) |
| ESLint изменённых файлов | **0 ошибок**; новые Spotify-файлы — 0 ошибок / 0 предупреждений. Pre-existing на HEAD: 2 ошибки `react-hooks/set-state-in-effect` в FullTrackView (строки 505/549, не затронуты диффом — доказано lint-ом HEAD-версии через stdin) + 156 предупреждений (no-console / unused-vars — исторический паттерн) |
| Все unit/integration тесты | **1435/1435 PASS** (83 файла). Baseline сессии: 1387 → +48. Регрессий 0 |
| Spotify-наборы | 91/91 (gateSheet 12, playbackAdapter 31, officialGate 30, pkce 10, catalog 8) |
| Production build (локальный, `next build`) | **PASS** — Compiled successfully 24.4s, 118/118 static pages (OOM прошлых сессий не воспроизвёлся, heap capped 3328MB) |
| Сборка Vercel | **PASS** — preview и production, без изменений конфигурации |
| Секреты в бандле | **CLEAN** — 0 попаданий `client_secret` в HTML + чанках; в браузере только публичный Client ID (PKCE) |

## 3. Полный аудит потока (Connect → OAuth → SDK → Play → State)

| Требование | Статус | Механизм |
|---|---|---|
| `state` проверяется в callback | **PASS** | `takeOAuthState()` — single-use, сравнение ДО обмена кода; mismatch → честная ошибка «подключиться заново» |
| Обработка ошибок OAuth / re-auth | **PASS** | `?error=` (access_denied и др.), отсутствие кода, `OAUTH_STATE_MISMATCH`, HTTP-ошибки обмена — все с конкретным сообщением; URL с кодом стирается из истории немедленно |
| Нет повторных SDK-инстансов | **PASS** | `loadSdk()`: reuse `player` / share `sdkLoading` promise; `connect()` идемпотентен; 31 тест адаптера |
| Безопасное обновление токена | **PASS** | `refreshInFlight` single-flight (без race), ротация refresh_token, 30s skew, 400/401 → честный logout; секрет в браузере отсутствует |
| Быстрые Play A→B→C не запускают устаревший трек | **PASS** | Три уровня: generation-guards движка (`loadGenerationRef`+AbortController), `playSeq` адаптера (устаревший ответ не эмитит ошибку), stale-URI guard в onState |
| При сбое Spotify НЕТ автоперехода на SC/Audius | **PASS** | Все 4 пути сбоя → SpotifyGate (останов), resolver никогда не вызывается для official-треков; тесты пинят контракт по исходнику движка |
| UI показывает реальное состояние SDK | **PASS (исправлено в этой сессии)** | 3 фикса честности: (1) гейт сбрасывает режим в idle + ставит SDK на pause; (2) режим «spotify» ставится ТОЛЬКО при подтверждённом успехе play; (3) togglePlay на остановленном official-треке перезапускает официальный путь (было: мёртвый resume). Бейдж «Spotify • Official» = только реальное воспроизведение |
| Очередь хранит исходный Spotify URI | **PASS** | `slimTrack` persist сохраняет `spotifyUri`/`spotifyTrackId`; очередь не переписывает идентичность; SDK играет ровно выбранный URI |
| Навигация не разрушает плеер | **PASS** | Адаптер — модульный синглтон; движок/шита/контроллер смонтированы один раз в AppShell; внутренние вью не размонтируют его |
| Double-audio при выходе из spotify-режима | **PASS (исправлено)** | Deezer-каталог тоже несёт `source:"spotify"` — раньше SDK не ставился на pause; теперь пауза всегда, кроме случая, когда следующий трек сам идёт официальным путём |

## 4. Wave и атрибуция

- `Spotify • Official` — только при подтверждённом официальном воспроизведении
  (PlayerBar, FullTrackView, FullTrackViewMobile — все гейтятся по режиму; см. фиксы выше).
- **Никакой Spotify-волны**: сэмплер остановлен в spotify-режиме; WaveformView
  рисует честный slim-seekable прогресс для треков без данных (DRM/SDK).
  PCM не извлекается, DRM не обходится, Web Audio к Spotify-аудио не подключается
  (политика §III Synchronization — см. RESEARCH-REPORT).
- Mini Player / Full Player / Queue / Artist / Album / mobile — бейджи честные
  на всех поверхностях (проверено код-аудитом + скриншоты QA).

## 5. Preview QA — PASS (https://mq1-ltyqfgl7k-…vercel.app, f5f02572)

| Шаг | Результат |
|---|---|
| Загрузка приложения (demo) | PASS, 0 ошибок страницы |
| `version.json` | `mq-build-f5f02572` — правильный коммит |
| `/api/spotify/config` на preview | `clientId: null` — env var Production-scoped; **честно** обработано: карточка «Приложение MQ ещё не сконфигурировано… После настройки в панели Vercel появится кнопка подключения» |
| Кнопка «Подключить Spotify» (Библиотека) | **Честный toast** «Spotify не настроен — сервер не вернул публичный Client ID» (добавлено в этой сессии; раньше — молчаливый клик) |
| `/spotify/callback` без `?code` | Честная ошибка + «Вернуться в MQ», URL очищен |
| Free-flow регрессия | Поиск → «Слушать» → полный трек играл непрерывно (0:14→0:25 / 3:21), честный бейдж Deezer — правки движка свободный режим не сломали |
| OAuth на preview | **НЕ ПРОВЕРЕН end-to-end** — причина: clientId отсутствует в Preview-окружении Vercel (владелец должен добавить SPOTIFY_CLIENT_ID в Preview env; сам redirect_uri выводится из origin и требует регистрации точного preview-URL в Dashboard) |
| Скриншоты | `qa-preview-01…06` в этой папке |

## 6. Production QA — PASS (https://mq1.vercel.app, mq-build-f5f02572)

| Шаг | Результат |
|---|---|
| `/api/spotify/config` | `{"clientId":"7d9b7d61…","pkce":true}` |
| **OAuth live-redirect** | **PASS** — «Подключить Spotify» → `accounts.spotify.com` показал СТРАНИЦУ ВХОДА (запрос принят): scope = все 12 (streaming, playback state, library…), `response_type=code`, `redirect_uri=https://mq1.vercel.app/spotify/callback`, `state`, `code_challenge_method=S256`, 43-символьный challenge. **Отображение login-страницы доказывает, что redirect URI зарегистрирован в Dashboard** (иначе Spotify ответил бы INVALID_CLIENT/redirect_uri_mismatch). Скриншот: `qa-prod-01-oauth-redirect-live.png` |
| Free-flow smoke | Полный трек играл непрерывно 0:10→0:21 / 4:16 (Oxyy), честный бейдж Deezer; SNIP-only каталоги честно отклонялись + skip («Preview-only and no full-length source — rejecting track») — §2 работает |
| Ошибки страницы | 0 |
| Секреты в бандле | 0 (client_secret отсутствует — PKCE не требует) |

## 7. Полный E2E Premium-тест: **NOT VERIFIED**

Автоматическая остановка — на странице входа Spotify (нет доступа к авторизованному
Premium-аккаунту в этой среде). Mock-SDK как доказательство не используется (запрещено ТЗ).

**MANUAL SPOTIFY PREMIUM TEST — протокол для владельца (≈5 минут):**

1. **Allowlist**: Spotify Developer Dashboard → приложение MQ (Client ID `7d9b7d61…`) →
   User Management → добавить Spotify-аккаунт с Premium (Development Mode: максимум
   5 пользователей; аккаунт-владелец приложения тоже должен быть Premium).
2. Открыть **https://mq1.vercel.app/app** в десктопном Chrome/Edge/Firefox → Настройки →
   Звук → Источник музыки → «Подключить Spotify» → войти → разрешить → возврат в MQ
   (`/app?spotify=connected`), карточка: «Spotify connected · официальное воспроизведение активно».
3. Поиск (каталог теперь авторизованный) → трек The Weeknd → Play:
   - бейдж **«Spotify • Official»**; никаких «Deezer → SoundCloud» для Spotify-треков;
   - **непрерывно >90 секунд** (позиция растёт, звук не прерывается);
   - Seek (перетащить прогресс), Pause/Resume, Next/Previous — работают через UI MQ;
   - переход Главная → Библиотека → Поиск во время игры — звук не останавливается;
   - очередь сохраняет исходный трек (следующий Spotify-трек играет официально).
4. Негативные проверки: disconnect Spotify → Play того же трека → гейт
   «Подключите Spotify» (НЕ SoundCloud); Free-аккаунт → гейт «Требуется Premium».

## 8. Ограничения Spotify для этого проекта (проверено 2026-10-09)

| Ограничение | Класс / действие |
|---|---|
| Web Playback SDK требует Premium (Developer Policy §IV) | Реализовано: гейт Premium, Free-гейт честный |
| Feb 2026: Development Mode требует Premium у владельца, 1 Client ID, **макс. 5 авторизованных пользователей** | **NEEDS OWNER ACTION**: allowlist в Dashboard; расширение — Extended Quota request (не обходится) |
| Коммерциализация MQ запретит Spotify-streaming без письменного разрешения (§IV Commercial) | **BLOCKED BY SPOTIFY POLICY** (условный production-gate): пока MQ не монетизируется — допустимо; при коммерциализации — удалить интеграцию или получить разрешение |
| §II Attribution: ссылка на контент Spotify при метаданных | Реализовано: «Открыть в Spotify» в полном плеере + бейджи |
| §III Synchronization: никакого синхронного визуала со Spotify-аудио | Реализовано: spotify-режим — только state-driven UI |
| Preview-окружения: SPOTIFY_CLIENT_ID не задан (Production-only) | **NEEDS OWNER ACTION**: добавить env var в Preview environment, если нужен preview-OAuth |
| Safari/mobile: WPSDK не поддержан | Честный гейт «браузер не поддерживается» |

Совместимость планируемого использования MQ с Developer Policy: **базово
соответствует** (Premium-only стриминг, атрибуция, отсутствие подмен и смешивания,
независимая ценность продукта), с двумя задокументированными условиями:
(а) некоммерческий характер ИЛИ письменное разрешение Spotify для стриминга;
(б) Development Mode-лимит 5 пользователей до Extended Quota. Оба —
NEEDS OWNER ACTION / POLICY GATE, не обходятся.

## 9. Что нужно от владельца (сводка)

1. **Premium E2E по протоколу §7** (5 шагов выше) — единственная непроверенная часть.
2. **Allowlist** пользователя(ей) в Dashboard → User Management (если ещё не сделано).
3. При необходимости preview-тестов OAuth: добавить `SPOTIFY_CLIENT_ID` в Preview environment Vercel.
4. При коммерциализации MQ: решение по Spotify-интеграции (удалить / письменное разрешение).
