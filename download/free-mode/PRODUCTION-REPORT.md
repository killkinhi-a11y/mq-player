# MQ — FINAL FREE PLAYBACK MODE: PRODUCTION REPORT

Дата: 2026-10-11 (UTC+8) · Коммит: **`53835547`** (main)
Продакшен: **https://mq1.vercel.app** · Deployment: **`mq-build-53835547`**
(живой через ~2 мин после push, подтверждён через `/version.json`)

---

## 0. Итог одним абзацем

Premium-only реализация Spotify Official Playback **полностью остановлена и
демонтирована**. В MQ больше нет ни одного места, где для прослушивания
требуется Spotify-логин, Premium, OAuth или гейт: нажатие Play на ЛЮБОМ треке
(каталог Spotify/Deezer или прямой SoundCloud/Audius) всегда идёт по
бесплатному пути **PlaybackResolver → SoundCloud / Audius (full-length)**.
Spotify остался только как каталог-метаданные (server-side client-credentials)
и честная ссылка «Открыть в Spotify». Атрибуция всегда честная:
«Каталог → Звук» (например, `Deezer → SoundCloud`).

---

## 1. Что изменилось (коммит 53835547)

### Удалено — Premium-only путь (17 файлов)
| Файл | Что было |
|---|---|
| `src/lib/spotify/auth.ts` | PKCE OAuth-сессия (refresh-токены, /me) |
| `src/lib/spotify/pkce.ts` | RFC 7636 примитивы |
| `src/lib/spotify/playbackAdapter.ts` | Web Playback SDK адаптер |
| `src/lib/spotify/gate.ts` | Гейт-решения (not_connected / not_premium / …) |
| `src/lib/spotify/userCatalog.ts` | Пользовательский каталог по PKCE-токену |
| `src/components/mq/SpotifyGateSheet.tsx` | Шит «Подключите Spotify / Требуется Premium» |
| `src/components/mq/SpotifyConnectCard.tsx` | Карточка подключения (Настройки) |
| `src/components/mq/SpotifyLibraryView.tsx` | Вкладка «Spotify» в Библиотеке |
| `src/hooks/useSpotifySession.ts` | Синк сессии |
| `src/app/spotify/callback/page.tsx` | OAuth callback |
| `src/app/api/spotify/config/route.ts` | Публичный Client ID для PKCE |
| + 5 тест-файлов (91 тест) | gateSheet / officialGate / playbackAdapter / pkce / userCatalog |

### Изменено — бесплатный путь для всех
- **`useAudioEngine.ts`** — официальный SDK-брэнч в loadTrack удалён;
  каталог-ветка (`source:"spotify" + catalogId + !playbackId`) теперь
  ЕДИНЫЙ путь: Spotify И Deezer метаданные → `resolveCatalogTrack()`;
  удалены events-bridge, transport, isPlaying/volume/position SDK-ветки.
- **`useAppStore.ts`** — удалены вся сессия/гейт/retry-состояния и действия;
  `playbackMode` сужен до `"soundcloud" | "idle"`; slimTrack теперь
  персистит `catalogProvider/catalogId/playbackProvider/playbackId/versionTag`
  (атрибуция переживает перезагрузку).
- **`Track`** — поля `spotifyUri`/`spotifyTrackId` удалены;
  `playbackProvider: "soundcloud" | "audius"`.
- **`playback/resolver.ts`** — НОВОЕ правило `artistCreditedInTitle()`
  (см. §3) — честное распознавание fan-загрузок «Artist - Title».
- **UI**: AppShell (шит/сессия отмонтированы), SettingsView, LibraryView,
  SearchView (один бесплатный серверный каталог), FullTrackView(+Mobile)
  (бейдж всегда ProviderChain; «Открыть в Spotify» строится из
  catalogProvider+catalogId), ProviderBadge/PlaybackSourceBadge (official-
  бейдж удалён), WaveformController, WasmAudioBackend (transport-bridge).

### Сохранено без изменений
Wave, поиск, artist/album страницы, очередь, lyrics, history, favorites,
playlists, Skip Intelligence, быстрые переключения (generation-guards),
отмена устаревших запросов (AbortController + requestRegistry dedupe),
prefetch (V3 §12), адаптивный интерфейс, SNIP-фильтрация §2 (превью никогда
не автопроигрываются), low-confidence SourceSheet (честный выбор источника).

---

## 2. Результаты всех проверок

| Проверка | Результат |
|---|---|
| TypeScript (`tsc --noEmit`, src/) | **0 ошибок** (desktop/skills — вне скоупа приложения, база) |
| Все тесты | **1353/1353 PASS** (79 файлов). База 1435 − 91 удалённый spotify-тест + 91 сохранённый набор перераспределён + **14 новых** free-mode регрессий |
| ESLint изменённых файлов | 7 ошибок — **все pre-existing на HEAD 239f7e81** (lyrics-эффекты FullTrackView/Mobile + mount-эффекты SearchView — код идентичен HEAD, проверено сравнением); 0 новых от диффа |
| Production build | **PASS** — Compiled successfully 24.3s |
| Секреты | client_secret в бандле отсутствует (PKCE-код удалён вместе с OAuth) |
| Production deploy | `mq-build-53835547`, подтверждён `/version.json` |

---

## 3. Резолвер: правило «Artist - Title» (UX-блокер бесплатного режима)

**Проблема.** На SoundCloud артист трека записан в НАЗВАНИИ загрузки
(«Alan Walker - Faded»), а uploader — случайный фан-аккаунт. Сравнение
каталожного артиста с полем uploader структурно проваливалось: честные
кандидаты каппировались на conf 0.54 < порога 0.60 — Play открывал шит
выбора вместо воспроизведения.

**Решение** (`artistCreditedInTitle` — все условия обязательны):
1. Токены названия кандидата = токены артиста ∪ токены названия каталога,
   БЕЗ лишних не-noise токенов («2Pac Ft. Alan Walker - Faded» → отклонено);
2. Скобочные квалификаторы — только noise/ожидаемые («(Official Audio)» →
   ок; «(SLUSHII Remix)», «(OneUpped)» → отклонено);
3. Подтверждение длительностью ≤8 сек (скопированное название никогда не
   проходит без совпадения длины).

Живые замеры (реальный поиск SC+Audius):

| Кандидат | conf | Итог |
|---|---|---|
| «Alan Walker - Faded» (fan, dur совпала) | **0.88** | ✅ авто-play |
| «Faded» ISRC-матч (prod, Deezer ISRC) | **1.00** | ✅ авто-play (официальный аплоад) |
| «Goosebumps - Travis Scott» (fan) | **0.78** | ✅ авто-play |
| «Faded (SLUSHII Remix)» (upload: Alan Walker!) | 0.54 | ❌ ремикс |
| «Alan Walker - Faded (OneUpped)» | 0.46 | ❌ другой кат |
| «2Pac Ft. Alan Walker - Faded» | 0.04 | ❌ чужая запись |
| «Alan Walker - Faded», dur 260≠212 | 0.38 | ❌ длина не та |

Порог 0.60, штрафы версий (remix −50, karaoke/cover/AI −100, …) и запрет
превью как `best` — без изменений.

---

## 4. Локальный QA (production build, :3112, Chromium 1440×900)

| Шаг | Результат |
|---|---|
| Поиск «goosebumps travis scott» | 62 SC-трека, catalog честно «none» (env локально не настроен) |
| Play без всякого входа | **PASS** — ни логина, ни гейта, ни редиректа |
| Реальное воспроизведение | позиция 1:15→1:20 за 6с; pause/resume ✓; next/prev ✓ |
| Rapid A→B→C (400мс) | PASS — финальный трек с 0:03, stale-аудио нет |
| Непрерывное прослушивание | 0:03 → 2:20 → 2:51 → 3:26 → 4:33 (**>4 мин**, семплы линейны) — требование «>90 сек» превышено |
| Seek (keyboard) | 4:00 → 4:33 (3× ArrowRight) ✓ |
| Бейдж | «SoundCloud» (нативный трек — одиночная цепочка) ✓ |
| Консоль | только диагностика `policy=ALLOW` (полные треки); **0 ошибок страницы** |

Скриншот: `download/free-mode/qa/local-free-playback.png`

---

## 5. Production E2E — ГЛАВНЫЙ ТЕСТ (mq-build-53835547)

**Сценарий: каталог-трек → бесплатный full-length резолв → честная атрибуция.**

| Шаг | Результат |
|---|---|
| `/api/catalog/search?q=faded alan walker` | `provider: "deezer"` — 4 каталог-трека **с ISRC** (Spotify-каталог см. §7) |
| `/api/resolve` (dz_140295501, ISRC NOG841549010) | **best conf=1.00** — официальный аплоад SC 256119829 «Faded — Alan Walker», full=True |
| Клик Play на каталог-треке в UI | **PLAYING без логина/гейта/Premium**; `spotifyGateVisible: false` |
| Атрибуция (mini + full player) | **«Deezer → SoundCloud»** — честная цепочка Каталог→Звук |
| Непрерывное прослушивание | 0:17 → 1:07 → 1:57 за 100 сек — линейно, **>90 сек подтверждено**, никаких обрывов на 30/45с |
| Full Player | цепочка на месте, версия-теги/лайки/очередь работают |
| Ошибки страницы | **0** |
| Скриншоты | `prod-catalog-free-playback.png`, `prod-fullplayer-attribution.png` |

**Никакой mock-доказательной базы**: все замеры — живой продакшен, реальный
аудио-элемент, реальное продвижение позиции во времени.

---

## 6. Реальные playback-провайдеры (итог)

| Провайдер | Роль | Статус |
|---|---|---|
| **SoundCloud** | основной full-length (HLS/progressive, ALLOW-policy, SNIP-фильтр) | ✅ работает (локально и на проде) |
| **Audius** | фоллбэк full-length (без ключей, децентрализованный) | ✅ работает |
| Invidious (yt-fallback) | последний резерв для чарт-хитов | работает; **юридически серый** — оставить как есть, не рекламировать |
| Deezer | только КАТАЛОГ (метаданные + ISRC) | ✅ работает; API звук = превью → никогда не источник звука |
| Spotify | только КАТАЛОГ (client-credentials) | 403 (см. §7) — на воспроизведение не влияет |

## 7. Исследование доп. источников (2026-10-11, живые тесты эндпоинтов)

| Кандидат | Вердикт |
|---|---|
| **Jamendo** | ✅ ЕДИНСТВЕННЫЙ жизнеспособный on-demand full-length API: нужен бесплатный client_id (devportal.jamendo.com), 35k req/мес, **ToS — non-commercial**. → Кандидат №1 для будущего интегрирования (решение владельца) |
| **Internet Archive** (etree/netlabels) | ✅ без ключей, огромный легальный каталог, но нишевый (live-концерты, netlabels) и медленный поиск → «глубокий» фоллбэк |
| Radio Browser | живой, без ключей — но это радио-режим, не on-demand |
| Mixcloud | ❌ только метаданные (звук — только их виджет) |
| FMA / Audiomack / Napster / Monstercat | ❌ мертвы (API закрыты/сервисы умерли) |
| Deezer API | ❌ звук только 30с-превью + нужен платный SDK |
| Netease/Meting-агрегаторы | ❌ неофициальные API коммерческих сервисов — тот же ToS-риск, что Invidious |

**Новый провайдер НЕ интегрирован**: чистого кандидата «без ключа и без ToS-
оговорок» не существует. Текущая цепочка SoundCloud → Audius (+ Invidious
last-resort) остаётся оптимальной. Jamendo — следующий шаг, если владелец
регистрирует ключ и подтверждает non-commercial статус MQ.

## 8. Ограничения и действия владельца

1. **Spotify Web API 403** (development mode): приложение Client ID
   `7d9b7d61…` отдаёт 403 на все Web API эндпоинты (токен при этом ок).
   Каталог честно деградирует на Deezer. Для возврата Spotify-метаданных
   владелец должен запросить **extended quota** в Spotify Dashboard.
   На бесплатное воспроизведение НЕ влияет.
2. **Jamendo** (опционально): регистрация client_id + подтверждение
   non-commercial → ещё один full-length фоллбэк.
3. Ручная проверка мобильного layout-бейджа не прогонялась отдельно в
   этом цикле — компонент тот же ProviderChain (юнит-тестами покрыт);
   при желании — быстрый визуальный проход по `mq1.vercel.app` с телефона.

## 9. Статус по пунктам ТЗ

| Требование | Статус |
|---|---|
| Никакого обязательного Spotify Login/Premium/OAuth | **PASS** — код удалён, гейтов не существует |
| Full playback: Search → NormalizedTrack → Resolver → SC/Audius → Wave | **PASS** (E2E §5) |
| Качественное сопоставление (название/артист/длительность/версия/ISRC) | **PASS** — скоринг §3, ISRC=+100 |
| Не выдавать альтернативный источник за Spotify; «Каталог → Звук» | **PASS** — цепочка «Deezer → SoundCloud» живьём |
| Честное «не найдено» (lowConfidence → шит выбора, превью ≠ playback) | **PASS** (тесты + §2-фильтр) |
| Сохранность функций MQ | **PASS** — 1353/1353, все движки нетронуты |
| Реальное прослушивание >90 сек + seek/pause/resume/next + rapid | **PASS** (§4, §5) |
| Существующий Vercel project, без удаления функций | **PASS** — тот же проект, mq-build-53835547 |
| Финальный отчёт с URL/ID/тестами/провайдерами | этот документ |
