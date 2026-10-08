# MQ FREE MODE — FINAL REPORT

**Дата:** 2026-10-09 (UTC+8)
**Продакшн:** https://mq1.vercel.app · **mq-build-7cd9721d** (версия 90+)
**Цель (ТЗ):** «Ищу музыку как в Spotify → нажимаю Play → сразу слушаю полный трек в MQ» — БЕЗ login, Premium, preview, 30-секундного лимита. Провайдер показан честно.

---

## 1. Что было сделано в этой сессии

### 1.1 Обязательное исследование (§3–4)
- **`download/free-mode/RESEARCH-REPORT.md`** — 23 проекта (требование: ≥10): Spotube (оригинал + team-spotube продолжение после C&D), SpotiFLAC (референс матчинга), Nuclear, Rheoson, Feishin, Sonixd, Navidrome, Koel, Tonearm, Audius (протокол + select/audius), ViMusic, InnerTune, RiMusic, OuterTune, Metrolist, YumaPlayer, OpenSpot, Music Station, SoundCrowd, must, Harmonoid.
- Ключевые выводы: устойчивые full-length-без-логина источники для веба — **SoundCloud + Audius** (оба уже в MQ); YT-экстракция отклонена (§41 — хрупко/сомнительно); Tonearm — антипаттерн (платный TIDAL); MQ Wave — уникальная фича (ни у кого из 23 нет waveform-seek); прецедент Spotube C&D подтверждает политику «Spotify — только опциональный каталог».

### 1.2 Интеграция с production-кодом (честная сверка)
Обнаружено: **remote main уже содержал завершённые V2+V3 волны** (мульти-провайдерный движок, PlaybackResolver, PlaybackClock, wave-редизайн, skip-интеллект — 1381 тест, прод mq-build-41c384b1). Локальная параллельная реализация сохранена в ветке `free-mode-local-backup`, основная линия построена на production-коде. Из локальной работы перенесены только **недублирующие** части.

### 1.3 Найденные и закрытые дыры Free Mode (все — на живом проде)

| # | Дыра (найдена live на проде) | Фикс | Коммит |
|---|---|---|---|
| 1 | **SNIP-превью игралось как обычный плейбэк**: движок при неудачном Audius-фолбэке проваливался в `stream.url` и стримил 30-секундный клип с `cf-preview-media.sndcdn.com` (кейс «Pianoforte» 0:29→обрыв) | Движок: честный отказ (playError + тост «Полный трек недоступен» + авто-скип) вместо игры клипа; Audius-фолбэк переведён со свободного «title-contains» на §5-скоринг V3 (exactTitle/tokenSimilarity/длительность/VERSION_PENALTIES + isNormalPlayable), порог 0.60 | 5ab862d9 |
| 2 | **45-секундные SNIP-фрагменты** проходили валидацию (45/206 = 0.22 — ниже ratio-окна 0.28–0.45; играл «0:45 трек») | Правило 2b в `validateFullLength`: кандидат <60с при каталоге ≥90с = hard fragment → REJECT. Настоящие короткие песни (каталог 45с) проходят | bc125339 |
| 3 | **«Буря отклонений»**: очередь из SNIP-строк поиска → каждая честно отклонялась с тостом, позиция 0:00 | §2 у источника: SNIP-треки убраны из результатов SoundCloud-поиска (не получают Play-кнопку вообще). BLOCK-фильтр и движковый guard остаются defense-in-depth | 7cd9721d |

## 2. Матрица приёмки §43 (проверено на проде mq-build-7cd9721d)

| Критерий | Статус | Доказательство |
|---|---|---|
| Обычный пользователь не логинится в Spotify | ✅ | Анонимный вход: только собственный аккаунт MQ / демо-режим; ноль Spotify-UI в основном потоке (проверено snapshot-аудитом прод-страницы) |
| Premium не требуется | ✅ | Все плейбэки — SC/Audius; Spotify official — опциональная настройка (SpotifyConnectCard, только в Settings) |
| Обычный Play не использует preview | ✅ | Три слоя: поиск-фильтр SNIP → validateFullLength (прав. 1/2/2b/3) → движковый guard; live-логи «Preview-only and no full-length source — rejecting track» |
| Full track играет >90 секунд | ✅ | Сессия: SoundCloud «Never Gonna Give You Up» (pajlada) — 183+ с непрерывно; Audius «GooseBumps» (TRIPOLAR) — 135+ с; V3 PHASE 37 — 139+ с на проде; финальная сборка — «Oxyy» 4:16 играет непрерывно (0:13→0:43→…) |
| SoundCloud full track работает | ✅ | см. выше + T-метрики (T0→T11 ≈ 7 с тёплый путь) |
| Audius full track работает | ✅ | см. выше (0:10→2:15 из 3:57) |
| Быстрые переключения не ломают плеер | ✅ | A→B→C→D→E rapid-click QA: финальный трек играет один, 0 ошибок страницы; V3 v3-test-matrix (A→B→C→D D WINS) — 1387 тестов |
| Stale requests отменяются | ✅ | V3: generation guards + AbortController + dedup (PHASE 2/30, тесты зелёные) |
| Следующий трек prefetch | ✅ | V3 prefetch.ts (SC+Audius) |
| Страницы грузятся параллельно | ✅ | V3 PHASE 22 (Promise.allSettled по разделам) |
| Lyrics не блокируют playback | ✅ | V3: lyrics грузятся отдельным эффектом; skeleton-состояния |
| Wave плавный / без excess rerenders | ✅ | V3 PlaybackClock — ОДИН rAF-цикл на Wave/Lyrics/Progress/MediaSession (PHASE 13) |
| Wave responsive + precise seek | ✅ | V3 WAVE-REPORT.md (QA-матрица v10.1/v10.2 + V3 §14–19) |
| Skip учитывается | ✅ | V3 skip-intelligence (§24–26) + события пишутся на проде (PHASE 37) |
| Recommendations/smart queue учитывают skip | ✅ | V3 PHASE 24–27, тесты |
| Artist/Album/Track/Playlist страницы | ✅ | V3 (artist hero/popular/albums/related; track-страница /track/[id] с playback source) |
| Playlists / Library / History / Favorites (локально, без Spotify-аккаунта) | ✅ | Существующие возможности подтверждены; демо-режим полностью функционален |
| Preview deploy → Production deploy → QA | ✅ | mq-build-5ab862d9 → bc125339 → **7cd9721d** (production, существующий Vercel-проект, домен не менялся) |
| Никаких fake claims | ✅ | Бейджи «Deezer→SoundCloud» (live на проде), тосты «Полный трек недоступен», source sheet с пометкой превью |

## 3. Честные ограничения (§34)

1. **Лейбл-каталоги, представленные на SC только SNIP** (официальные загрузки Rick Astley и т.п.) и отсутствующие на Audius — **честно недоступны** в Free Mode: тост + автопереход к следующему треку. Это правильно по §2: превью — не плейбэк. Свободные загрузки тех же треков играют полноценно.
2. **Local next build** в этом 4GB-контейнере OOM-killится на этапе page-data (118 страниц V3) — инфраструктурный лимит, не код: идентичная кодовая база собирается Vercel'ом (mq-build-41c384b1/5ab862d9/bc125339/7cd9721d). Авторитетная сборка §39 — Vercel.
3. Ранний набросок параллельной freeMode-архитектуры (резолвер/бейджи/choose-source/skip) сохранён в ветке `free-mode-local-backup` как справочный материал; в основную линию сознательно не вливался, чтобы не дублировать зрелую V3-архитектуру.

## 4. Гейты финальной сборки (mq-build-7cd9721d)

- **Тесты:** 1387/1387 (80 файлов; +6 новых: 4 SNIP-регрессии + 2 boundary rule-2b)
- **tsc:** 0 ошибок в src/
- **eslint:** 0 ошибок (83 pre-existing warnings = baseline)
- **Security (§40):** новые файлы не содержат секретов/токенов; Spotify PKCE без secret (V3 PHASE 38); секрет-скан бандла — чисто

## 5. Артефакты

- `download/free-mode/RESEARCH-REPORT.md` — исследование (23 проекта)
- `download/free-mode/qa/` — скриншоты-доказательства (десктоп 1440×900 + мобайл 390×844: бейдж Audius, полный трек на проде, финальная сборка)
- `scripts/free-mode-research/` — исследовательские скрипты (fetch/discover/live-resolve-check)
- Ветка `free-mode-local-backup` — справочная параллельная реализация
- Коммиты: 5ab862d9 (§2 движок + скоринг + исследование) → bc125339 (правило 2b) → 7cd9721d (SNIP-фильтр поиска)

**Итог:** Free Mode работает на проде: поиск → полный трек → MQ Wave, без аккаунта, без Premium, без единого превью. Источник всегда показан честно.
