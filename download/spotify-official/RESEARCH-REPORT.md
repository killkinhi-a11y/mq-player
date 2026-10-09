# MQ — SPOTIFY OFFICIAL PLAYBACK: RESEARCH REPORT

Дата: 2026-10-09 (UTC+8) · Источники: официальные страницы Spotify for Developers
(прочитаны полностью, сырые HTML-снимки: `scripts/policy-raw.html`,
`scripts/blog-feb2026-raw.html`, `scripts/quota-raw.html`, `scripts/wpsdk-gs.html`)
+ ранее выполненный глубокий GitHub-анализ `download/v2-research/RESEARCH-REPORT.md` (2026-10-08).

---

## 1. GitHub-исследование (§2 ТЗ) — статус: ВЫПОЛНЕНО РАНЕЕ, актуально

Полный анализ 8 проектов по первоисточникам (код/README/коммиты через GitHub API)
сделан 2026-10-08 и не устарел: `download/v2-research/RESEARCH-REPORT.md` + 8 JSON-дампов
(`download/v2-research/*.json`). Требуемые ТЗ проекты покрыты:

| Проект | Настоящий Spotify playback | Auth | Premium | Архитектура применима в Next.js | Лицензия |
|---|---|---|---|---|---|
| **spotify-web-playback-sdk-example** (официальный) | ✅ Web Playback SDK | Auth Code (+устаревший secret-стиль; MQ использует PKCE-вариант из официального PKCE-tutorial) | Да | ✅ референс lifecycle/scopes | — |
| **Kopuz** | ✅ Web Playback SDK (+WS-мост для WebView без Widevine) | OAuth PKCE | Да | ✅ архитектурный референс | — |
| **Lumen** | ✅ Web Playback SDK | OAuth PKCE | Да | ✅ ближайший web-референс | нет (личный) |
| **Spotiamp** | ✅ Web Playback SDK + `PUT /me/player/play` | OAuth PKCE, без сервера | Да | ✅ эталон адаптера (API 1:1) | нет (личный) |
| **Spotiamp+** | ✅ librespot (desktop) | OAuth | Да | ❌ desktop | — |
| **librespot** | ✅ реверс AP-протокола | Zeroconf/блоб | Да | ❌ «probably forbidden» (собственный disclaimer), нет браузерного пути | MIT |
| **spotify-player** | ✅ через librespot | OAuth | Да | ❌ TUI | — |
| (go-librespot) | ✅ реверс | Zeroconf | Да | ❌ GPL + ToS-риск | GPL-3.0 |

**Вердикт подтверждён:** единственный легальный web-native путь полного Spotify
воспроизведения — **OAuth PKCE + Web Playback SDK + `PUT /me/player/play?device_id=`**
(браузер становится Spotify Connect device). Семейство librespot отклонено.
Desktop-only архитектуры в браузер не переносятся — MQ уже использует правильный путь.

Официальный PKCE-flow: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow —
MQ реализует его точно (S256, verifier 64, state через localStorage verifier-presence,
browser→accounts.spotify.com token exchange — CORS официально поддержан).

## 2. ПРОВЕРКА ПОЛИТИКИ SPOTIFY (§3 ТЗ) — актуально на 2026-10-09

### 2.1 Spotify Developer Policy (действует с 15 May 2025) — прочитана полностью

| Пункт политики | Требование | Статус MQ |
|---|---|---|
| **§IV Streaming** | «Streaming of music sound recordings through the Spotify Platform shall only be made available to subscribers to the **Premium** Spotify Service» | ✅ Гейт `isOfficialAvailable()` требует Premium; Free-аккаунт получает честное «Premium is required» |
| **§IV Commercial** | «The Spotify Platform **can not be used to develop commercial streaming integrations**»: запрещены продажа Streaming SDA, e-commerce/монетизация внутри него, продажа рекламы НА Streaming SDA | ⚠️ **PRODUCTION GATE**: MQ не монетизируется → допустимо. Если MQ станет коммерческим — Spotify Official playback должен быть удалён или получено письменное разрешение. Зафиксировано как условие |
| **§II Attribution** | Spotify Content атрибутируется Spotify Marks; metadata/cover art сопровождаются ссылкой на контент Spotify; запрещён standalone-сервис из metadata | ⚠️ Частично: бейдж «Spotify • Official» есть; **нужен link-back на Spotify** (трек/альбом) на поверхностях с Spotify-контентом → добавлено в этой сессии (кнопка «Открыть в Spotify» в Full Player) |
| **§II Metadata when streaming** | «no playback of Spotify Content without showing relevant cover art and metadata» | ✅ MQ показывает title/artist/album/artwork всегда |
| **§III Synchronization** | «Do not synchronize any sound recordings with any visual media» + (WPSDK getting-started): «Do not synchronize Spotify content» | ✅ Для Spotify: **никакого PCM/waveform/визуализатора синхронного с аудио** — только state-driven UI (позиция/длительность). MQ Wave для Spotify уже state-driven; PCM-анализ других провайдеров НЕ подключается к Spotify аудио |
| **§III Mixing** | «Do not permit any device or system to segue, mix, re-mix, or overlap any Spotify Content with any other audio content» | ✅ Кроссфейд — только на WASM/element пути; при Spotify-режиме element-движок ставится на pause; **новая строгая изоляция режимов (PHASE 8) усиливает соответствие** |
| **§III Integration with another service** | «Do not create any product or service which is integrated with streams or content from another service» | ⚠️ **Главная серая зона**: MQ — мульти-провайдерный плеер. Митигация: (а) Spotify-контент воспроизводится ТОЛЬКО официальным SDK в выделенном режиме; (б) никакой подмены/смешивания контента Spotify с SoundCloud/Audius (новое ТЗ PHASE 8 = движение к соответствию); (в) честная атрибуция обоих; (г) альтернативные провайдеры — самостоятельные источники поиска. Риск задокументирован; при коммерциализации — письменное разрешение |
| **§III Core UX** | Запрет «mimic, replicate or attempt to replace a core user experience of Spotify» без письменного разрешения; продукт должен добавлять независимую ценность | ✅ MQ добавляет: Wave-UI, lyrics, мессенджер, smart queue, skip-intelligence, мульти-каталог. UI — собственный дизайн MQ |
| **§I Users & Data** | Disconnect-механизм в любой момент; удаление данных пользователя после disconnect; privacy policy; минимум данных | ✅ «Отключить Spotify» в настройках очищает ВСЕ ключи (clearAllSpotifyStorage) + сброс адаптера; MQ запрашивает только нужные scopes |
| **§VII Quotas** | Квоты/ограничения платформы соблюдаются | ✅ Обходов квот нет; кэш поиска с TTL; dedupe запросов |

### 2.2 КРИТИЧЕСКОЕ ОБНОВЛЕНИЕ: February 2026 Developer Access Changes

Источник: официальный блог «Update on Developer Access and Platform Security»
(06.02.2026, прочитан полностью) + migration guide «Migration: February 2026 Dev Mode Changes»:

**С 11 февраля 2026 (новые Client ID) и с 9 марта 2026 (ВСЕ существующие Development Mode интеграции):**
1. **Development Mode требует Spotify Premium аккаунт** (аккаунт разработчика-владельца Client ID);
2. **Один Development Mode Client ID** на разработчика;
3. **Каждый Client ID — максимум 5 авторизованных пользователей** (было 25 — цифра из V2-отчёта устарела!);
4. Ограничение API меньшим набором supported endpoints — **отложено** для существующих интеграций (update от 9 марта), Premium-требование + лимит 5 пользователей + 1 Client ID действуют.

**Следствия для MQ (честно, без обхода):**
- Существующий Client ID `7d9b7d61…` = Development Mode → **Spotify-интеграция MQ доступна максимум 5 Spotify-аккаунтам** (allowlist в Dashboard → User Management).
- Владелец MQ обязан иметь Premium на аккаунте-владельце приложения.
- Расширение доступа: Extended Quota Mode / verification request через Dashboard (заявка владельца; MQ не пытается обойти).
- Это ограничение НЕ касается остальных функций MQ (SoundCloud/Audius/локальные треки работают без Spotify).

### 2.3 Web Playback SDK технические требования (проверено)

- Access token «from your personal Spotify **Premium** account» (getting-started) — подтверждено.
- SDK грузится с `https://sdk.scdn.co/spotify-player.js` — MQ использует ровно этот URL.
- Браузеры: десктопные Chromium/Firefox/Edge с EME/Widevine; Safari и мобильные браузеры не поддержаны (MQ показывает честное сообщение).
- DRM: SDK стримит через собственный sandboxed-декодер; **raw PCM / stream URL недоступны** (подтверждено research §12 V2) → waveform для Spotify невозможен легально.

## 3. РЕШЕНИЕ ПО АРХИТЕКТУРЕ (новое ТЗ: без подмены)

```
Spotify-трек выбран (catalogProvider "spotify", spotifyUri присутствует):
  ├─ connected + Premium + supported browser → Web Playback SDK (единый путь)
  ├─ не подключён        → гейт «Connect Spotify to play full tracks» (кнопка PKCE-connect)
  ├─ подключён, Free     → гейт «Spotify Premium is required for full playback»
  ├─ Safari/mobile       → гейт «браузер не поддерживает Web Playback SDK»
  └─ SDK/play error      → «Spotify playback unavailable» + Retry + Reconnect Spotify
  ВЕТКА RESOLVER (SoundCloud/Audius) ДЛЯ SPOTIFY-ТРЕКОВ АВТОМАТИЧЕСКИ НЕ ВЫЗЫВАЕТСЯ.

Не-Spotify-треки (подмены нет по определению):
  ├─ Deezer-каталог (анонимный fallback, БЕЗ spotifyUri) → resolver (Free Mode, честный бейдж)
  ├─ SoundCloud / Audius прямые треки → нативные пути
  └─ Явный переключатель источника из плеера (SourceSheet) — действие ПОЛЬЗОВАТЕЛЯ, честные бейджи
```

- Retry: повторный `adapter.play(spotifyUri)` с текущей позиции; Reconnect: полный reset сессии + PKCE-логин.
- Спецификация Quick Play API не используется; очередь ведёт MQ (SDK держит 1 трек) — как в референсах.
- Ошибки SDK (`authentication_error`, `account_error`, `initialization_error`, `playback_error`, `autoplay_failed`) отображаются пользователю конкретной причиной; подмена источником не выполняется.

## 4. Честные ограничения (зафиксировано)

| Ограничение | Класс |
|---|---|
| Полный live-тест >90 сек требует реальный Premium-аккаунт из allowlist приложения | NEEDS USER ACTION |
| Development Mode: ≤5 авторизованных пользователей (Feb 2026) | NEEDS USER ACTION (Extended Quota при необходимости) |
| Коммерциализация MQ запрещает Spotify streaming без письменного разрешения | BLOCKED BY SPOTIFY POLICY (условный gate) |
| Safari/mobile: Web Playback SDK не поддержан — там Spotify-треки не играют (честный гейт) | Технологическое ограничение SDK |
| Серверный client-credentials каталог из Vercel недоступен (diagnosed V2) | NEEDS USER ACTION (Dashboard) |
| PCM/waveform для Spotify аудио невозможен (DRM + §III Synchronization) | Принципиально (политика) |

## 5. Приоритет

Официальный Web Playback SDK — основной путь (ТЗ). Desktop-only архитектуры
(librespot/spotiamp+) в браузер не переносятся. Обходы DRM/квот/allowlist не реализуются.
