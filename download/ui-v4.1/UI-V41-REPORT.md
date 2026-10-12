# MQ UI V4.1 — FINAL REPORT (PREMIUM POLISH PASS)

> **Production URL: https://mq1.vercel.app**
> **Production deployment: `mq-build-7e44ecd3`** (commit `7e44ecd3` на `main`, GitHub→Vercel auto-deploy, live 2026-10-12)
> Preview (QA): `https://mq1-5jvuo9jun-killkinhi-5353s-projects.vercel.app` (build `mq-build-18b73e18`, код UI идентичен прод-коммиту)
> База: UI V4 «Obsidian Prime» (`mq-build-b7b79da4` = функционально `mq-build-516e728a`). Никаких новых редизайнов — точечный polish pass.

---

## 1. Состояние до начала (PHASE 0 — BASELINE.md)

- Production при старте обслуживал **`mq-build-b7b79da4`** (на один docs-коммит впереди последнего известного пользователю `mq-build-516e728a`; код идентичен).
- Baseline: тесты **1358/1358**, tsc **src/ = 0**, build PASS, 24 BEFORE-скриншота с production (4 вьюпорта), VLM-аудит подтвердил реальные проблемы (см. §2).
- Локальный Deezer-каталог недоступен из песочницы (egress блокируется) → Artist/Album QA проводился на production (BEFORE) и preview (AFTER).

## 2. Найденные проблемы «ДО» (только подтверждённые)

| # | Проблема | Источник |
|---|---|---|
| P1 | Search Top Result: artwork 104px — не доминирует; CTA выглядит второстепенным; eyebrow-иерархия слабая; нет альбома/duration/бейджа/context menu; album не бывает hero | код + VLM (02b) |
| P2 | Continue Listening: **карточка без обложки** — VLM: «читается как skeleton-placeholder»; нет альбома/бейджа; пустое состояние без CTA; текущий трек дублируется в «Недавно» | код + VLM (01b) |
| P3 | SpotifyArtistView: **фейковый бейдж verified** (BadgeCheck рисовался всегда; в `CatalogArtistDTO` нет поля `verified`) | код (types.ts:118) |
| P4 | SpotifyArtistView: 10 популярных треков целиком — альбомы за fold; related-сетка одного веса с контентом | код + VLM |
| P5 | ArtistDetailView (SC): desktop hero 380px + pt-24 + artwork 288px — популярные треки далеко вниз | код |
| P6 | Album hero ~40–45% первого экрана; **нет Add to Playlist и More**; дубль заголовков «Треки»/«Трек»; touch-таргеты 32px на mobile | код + VLM (04) |

## 3. Изменения по фазам

### PHASE 1 — Search Top Result Hero (`SearchView.tsx`)
- **Entity-aware hero**: track / artist / **album** (тип сущности никогда не подменяется). Выбор: name-match против запроса (нормализация пунктуации/diacritics; word-boundary containment — только сигнал артиста; длинный префикс ≥12 симв.) → при конфликте artist-vs-album решают **реальные сигналы** (followers ≥1000 или доминирование ≥3 треков) — 43-подписочный тёзка-«Random Access Memories» больше не крадёт hero у альбома Daft Punk; далее прежняя V2-лестница.
- Композиция desktop: artwork **168px** (круг для артиста), eyebrow «ТОП-РЕЗУЛЬТАТ» + чип типа, display-заголовок (clamp 2 строки), честная meta-лестница (артист · слушатели/треки в результатах · альбом · год · длительность — каждая строка только при наличии данных), provider-бейдж, platinum CTA «Слушать/Пауза/Продолжить» (живое состояние — без ложного Playing), вторичные действия: **context menu** (трек — полный ContextMenu; артист — ArtistActionsMenu; album — честное «Открыть альбом» без фейковых действий).
- Mobile: своя композиция (artwork 112px + текстовая колонка + full-width CTA), без горизонтального сжатия desktop.
- Дедупликация: hero-трек больше не повторяется первой строкой превью-результатов.
- Клавиатурная навигация/aria сохранены; пустое состояние и превью-загрузка не тронуты; повторных запросов к каталогу нет.

### PHASE 2 — Continue Listening (`MainView.tsx`)
- Карточка перестроена: **artwork 88px** (клик открывает полный плеер), eyebrow → title → артист·альбом → provider-бейдж, **живой прогресс** (реальная позиция аудио-элемента) + tabular-таймкоды, platinum Play/Resume 48px (inline glass blur по контракту V2 §10.5), TrackMoreButton.
- **Честность Resume**: позиция хранится только у текущего трека (HistoryEntry не содержит позиций) — «Продолжить» реально возобновляет аудио-элемент; для треков истории — честный Play (без фиктивных Resume).
- Пустое состояние: V4-структура с **реальной CTA «Найти музыку»** (→ поиск).
- **Дедупликация «Недавно»**: текущий трек исключается по ID **и по канонической паре title+artist** (резолвер легитимно подменяет каталог-строку dzl_/spl_ на SC-близнеца с другим id — id-only фильтр пропускал бы дубль).

### PHASE 3 — Artist
- **SpotifyArtistView**: убран фейковый BadgeCheck (honesty fix); популярные треки **5 + «Показать все N»** (альбомы доступны без глубокой прокрутки); related — компактные чип-тайлы (max-104px, без сетки «ещё одного контента»); в строках треков индекс→Play на hover + живой эквалайзер активной строки; мобильный hero компактнее (аватар max-180px).
- **ArtistDetailView (SC)**: desktop hero **380→300px** (pt-24→14, artwork 288→232, заголовок clamp 4.5vw/3.6rem) — популярные треки сразу достижимы.

### PHASE 4 — Album (`AlbumDetailView.tsx`)
- Hero компактнее (обложка lg:w-52→48, паддинги py-7→6, заголовок clamp 44px + **2-строчный clamp** для длинных названий), Play с честными состояниями (Слушать/Пауза/**Продолжить**).
- Ряд действий = Play · Shuffle · **Add to Playlist** (MenuCore-пикер: все треки альбома в существующий/новый плейлист — реальное действие с toast) · **More** (Добавить в очередь / Открыть у провайдера) — вместо четырёх равных серых кнопок.
- Треклист: убрана строка-заголовок колонок (дубль «Треки»/«Трек»/«Действия»); индекс→Play на hover + эквалайзер активного ряда; mobile touch-таргеты like/queue/menu **40px** (mq-hit44).

### PHASE 5 — Согласованность
- Единая грамматика hero на 4 страницах: eyebrow (11px bold caps tracking) → display-заголовок → meta-лестница → действия (platinum primary + surface-1 icon-buttons 44px).
- Радиусы по семействам: featured-карточки `--mq-mat-radius-float`, artwork `--mq-r-art` (Continue-карточка приведена к featured-семейству).
- Секционные головы: `mq-t-shelf` + счётчик на всех detail-страницах.

## 4. Изменённые компоненты

| Файл | Суть |
|---|---|
| `src/components/mq/SearchView.tsx` | Top Result Hero (переписан), name-matching, дедупликация превью, `openAlbumFromSearch` (шарится с плитками альбомов) |
| `src/components/mq/MainView.tsx` | ContinueListeningCard (переписан), канонический дедуп «Недавно», empty CTA |
| `src/components/mq/SpotifyArtistView.tsx` | honesty fix BadgeCheck, popular 5+expand, related-компакт, hover/эквалайзер строк, mobile hero |
| `src/components/mq/ArtistDetailView.tsx` | компактный desktop hero |
| `src/components/mq/AlbumDetailView.tsx` | hero-компакт + clamp, Add-to-Playlist/More (MenuCore), треклист |

Новые QA-скрипты: `scripts/ui-v41/{before-capture,local-smoke,prod-continuity}.py`. **Не изменялись**: audio engine, resolver, store-экшены playback, Wave, provider-архитектура, темы/токены.

## 5. Performance impact

- Hero/карточки — чистая деривация уже загруженных данных (`useMemo`), **0 новых запросов**; повторной загрузки ради визуала нет.
- Дедуп «Недавно» — фильтр в существующем memo (зависимости `[history, currentTrack]` — обновление только при реальном изменении).
- Локальный smoke: непрерывность воспроизведения при навигации (pct 5→7 при 4.5s wall), 0 page errors; A/B против исходной сборки (stash) — поведение «Недавно» идентично (ленивый ScrollReveal-монтаж секций — штатный паттерн, не регрессия).
- Все ограничения из UI-AUDIT §3 соблюдены (playback вне React-видов, VISITED_VIEW_COMPONENTS, lazy-импорты).

## 6. Visual QA

- **BEFORE**: `download/ui-v4.1/screens-before/` — 24 скриншота с production (1440×900, 1280×800, 390×844, 360×800).
- **AFTER**: `download/ui-v4.1/screens-after/` — 24 скриншота с preview-деплоя (реальный каталог) + element-shot карточки Continue (`01c`).
- Матрица покрыта: Home/Continue, Search (пусто/Top Result/без результатов/hover), Artist (полная и неполная metadata), Album (длинное название, большой треклист, mobile tracklist), мини-плеер при навигации, 4 вьюпорта.
- **0 page errors** в обоих проходах; overflowX=false на 390 (smoke) — 360/430 унаследованы от V4-геометрии без изменений сеток.
- VLM-вердикты AFTER: Search hero — artwork 8/10, типографика 9/10, CTA 8/10 (доминанта и лестница подтверждены); Continue card — 9/10 премиальности (обложка, живой прогресс 0:04/3:31, бейджи); Artist — «компактный сбалансированный hero, 5 треков сразу, аккуратные ряды»; Album — «оптимальная высота, треклист сразу под hero, первые 5–6 треков без прокрутки».

## 7. Результаты проверок

| Проверка | Результат |
|---|---|
| Тесты (vitest, полный набор) | **1358/1358 PASS** (79 файлов) — включая 3 design-contract suite, случайно нарушенные правками и восстановленные (inline glass blur на hero-play, solid content cards, геометрия hero-сетки 5/7) |
| TypeScript | **src/ = 0 ошибок** (вне-src 19 — pre-existing базлайн: desktop/tauri 15, skills 2, scripts 1) |
| ESLint (5 изменённых файлов) | 4 errors — **ровно pre-existing** (SearchView mount-эффекты, задокументированы ещё в V4); +2 warnings (raw `<img>` в новых artwork — тот же паттерн, что 64 существующих) — A/B stash-сравнение: baseline 68 → 70 проблем, 0 новых ошибок |
| Production build | PASS (25–30s) |
| Локальный smoke (production build :3112) | **17/17 PASS** |
| Preview smoke (строгий) | **20/20 PASS** (mq-build-18b73e18) |
| Production smoke (строгий) | **20/20 PASS** (mq-build-7e44ecd3) |
| Production continuity E2E | **PASS — 91s воспроизведения за 90s wall** (0:01→1:32 из 3:31), каталог-трек (Deezer→SoundCloud), через 3 навигации (Поиск→Главная→Библиотека), 0 page errors |
| Бесплатный playback | Работает без Spotify login/Premium (hero-клик → полный трек через resolver) |
| Быстрые переключения | next-track в smoke — «последний выбор побеждает», без stale-audio |

## 8. Deploy

- Ветка `ui-v41` → 5 preview-деплоев в существующем Vercel-проекте (mq1); финальный preview `mq-build-18b73e18` — 20/20.
- `main` `7e44ecd3` → **production `mq-build-7e44ecd3`**, https://mq1.vercel.app — версия подтверждена `/version.json`, строгий smoke 20/20 + continuity 91s.
- Новый проект/домен не создавались; rollback-история Vercel сохранена.

## 9. IMPLEMENTED / TESTED / NOT VERIFIED / BLOCKED

**IMPLEMENTED**
- Search Top Result hero: entity-aware (track/artist/album), name-matching + popularity tiebreak, 168/112px artwork, meta-лестница, provider-бейдж, CTA + context menus, mobile-композиция, дедуп превью.
- Continue Listening: artwork-карточка, живой прогресс, честный Resume, empty CTA; канонический дедуп «Недавно».
- Artist: honesty-fix BadgeCheck; popular 5+expand (каталог-вариант); компактный hero (SC-вариант); related-чипы; hover/эквалайзер строк; компактный mobile hero.
- Album: hero-компакт + 2-line clamp; Play/Shuffle/Add-to-Playlist/More (реальные MenuCore-действия); треклист без дубля заголовков, mobile-таргеты 40px.
- Согласованность токенов/радиусов/действий на 4 страницах.

**TESTED** (все выше — с evidences в `download/ui-v4.1/qa/`)
- 1358/1358 тестов; tsc; eslint A/B; build; локальный smoke 17/17; preview smoke 20/20; production smoke 20/20; production continuity 91s; 24+24 скриншота; VLM-аудит до/после.

**NOT VERIFIED**
- Каталог-Spotify как активный провайдер (production использует Deezer-fallback из-за extended-quota ограничения Spotify-приложения — известно с free-mode раунда, не относится к V4.1).
- Полный жестовый drag-and-drop очереди и Wave-интерactions — вне четырёх страниц V4.1 (не менялись).
- 430×932 вьюпорт явно в этом проходе не снимался (360/390 покрыты; 430 проверен в V4, сетки V4.1 не меняли mobile-геометрию).

**BLOCKED**
- Нет блокеров. (CSP не включает `challenges.cloudflare.com`/`telegram.org` — виджет Turnstile и Telegram-логин блокируются на ВСЕХ деплоях; pre-existing, вне четырёх страниц V4.1 — рекомендация на следующий раунд.)

## 10. Остаточные проблемы / рекомендации

1. **CSP-пропуски** (pre-existing): добавить `challenges.cloudflare.com` (Turnstile) и `telegram.org` в `script-src` — иначе captcha/Telegram-виджет на странице входа не работают (консоль-ошибки на каждом деплое).
2. **Engine-диагностика в console.error**: `[Player]`/`[Gapless]`/`[resolveStream]` логи (keySystem-пробы, отклонённые кандидаты резолвера) — честные, но шумные; перевести в warn/debug — отдельная задача по движку (не трогали).
3. Движок self-recovery: пауза во время разрешения каталог-трека может быть перекрыта recovery-перезапуском (позиция не «убегает», состояние согласовано) — поведение движка со времён free-mode, вне V4.1.
4. VLM-микрозаметки: тень/свечение под круглым artwork hero-артиста; контур у platinum CTA на тёмной карточке — кандидаты в V4.2.
5. Вне-src tsc ошибки (desktop/skills/scripts) — техдолг с V4.

## 11. Артефакты

- Отчёты: `BASELINE.md`, этот отчёт; evidence: `qa/` (smoke-логи 20/20 + continuity), `qa-local/`, `screens-before/` (24), `screens-after/` (24 + element-shot).
- Скрипты: `scripts/ui-v41/{before-capture,local-smoke,prod-continuity}.py`.
- Коммиты `main`: `3da90338` (polish pass) → `81455e79` (name-matching) → `ffd22867` (tiebreak) → `f3e3351b` (artist-only containment) → `18b73e18` (canonical dedupe) → `7e44ecd3` (QA).
- Production: **https://mq1.vercel.app**, deployment **`mq-build-7e44ecd3`**, commit `7e44ecd3`.
