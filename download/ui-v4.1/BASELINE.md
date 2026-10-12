# MQ UI V4.1 — BASELINE (PHASE 0)

> Дата: 2026-10-12 · Исполнитель: Super Z (main agent)
> Задача: PREMIUM POLISH PASS — Search Top Result Hero · Continue Listening · Artist · Album композиция.
> Это НЕ новый редизайн: продолжаем дизайн-систему V4 «Obsidian Prime».

---

## 1. Актуальное состояние Git / Production

| Что | Значение | Подтверждение |
|---|---|---|
| origin/main | `b7b79da4` (docs: ui-v4 QA+production reports) | `git log origin/main` |
| Локальный HEAD | `4826a6bc` — технический коммит поверх b7b79da4 (удаляет `upload/*.png`, правит `next-env.d.ts`; **функциональных изменений нет**, не пушнут) | `git show --stat` |
| **Production deployment** | **`mq-build-b7b79da4`** (commit `b7b79da4`, released 2026-10-11T22:59:05Z) — `GET /version.json` | ⚠️ Пользователь знал `mq-build-516e728a`; фактически production на один docs-коммит впереди. Код идентичен 516e728a (b7b79da4 меняет только `download/ui-v4/*.md`) |
| Рабочее дерево | clean, ветка main | `git status` |
| Git push | работает (dry-run OK) — GitHub→Vercel auto-deploy живой (так ушли 516e728a и b7b79da4) | `git push --dry-run` |
| Production URL | https://mq1.vercel.app → HTTP 307 (redirect на приложение), версия 90 | curl |

**Следствие**: baseline для V4.1 = UI V4 «Obsidian Prime» в production. Бесплатный playback (FREE MODE, resolver → SoundCloud/Audius), MQ Wave, 25 тем — всё на месте и является защищаемой базой.

## 2. Изученные материалы V4

- `download/ui-v4/UI-RESEARCH.md` — паттерны 7 open-source плееров + Spotify/AM/SC/YTM.
- `download/ui-v4/UI-AUDIT.md` — инвентаризация поверхностей, X1–X8, инварианты (§3: playback вне React-вида, VISITED_VIEW_COMPONENTS, lazy-импорты god-компонентов, 25 тем, 565→1358 тестов).
- `download/ui-v4/DESIGN-SYSTEM.md` — токены V4: цвет/типографика/отступы/компоненты/motion; запреты (§9).
- `download/ui-v4/UI-QA-REPORT.md`, `PRODUCTION-REPORT.md` — V4 деплой `mq-build-516e728a`, prod E2E green; **V4.1-кандидаты задокументированы**: continue-listening card polish, Top Result hero, artist/album композиционные проходы.
- Скриншоты V4: `screens-before/` (20), `screens-after/` (21) — использованы как контекст.

## 3. Целевые компоненты (реальное состояние кода)

| Компонент | Строк | Текущее состояние |
|---|---|---|
| `SearchView.tsx` | 2144 | `TopResultCard` существует (строки 1950–2051): eyebrow «Топ-результат» 11px, artwork **104px**, одна строка meta, Play («Слушать», mq-platinum-btn) + «К артисту». Нет альбома, нет provider-бейджа, нет context menu, нет album-варианта hero. Рендер: сетка 5/7 с 4 превью-строками. `topResult` = каталог-артист → доминирующий артист (≥2) → первый трек |
| `MainView.tsx` | 2576 | `ContinueListeningCard` (1214–1307): **без artwork**, плоская строка «Продолжить» + title/artist + прогресс + play 48px + more. Только desktop (`hidden lg:block`), только currentTrack. Пустое состояние — dashed-карточка без CTA. Ряд «Недавно» (recentTracks) не исключает текущий трек (дубликат). Mobile: MobileNowHero (свой hero, отдельная композиция) |
| `ArtistDetailView.tsx` (SC-артист) | 648 | Desktop hero: min-height **380px**, pt-24, artwork 288×288 — популярные треки далеко вниз. Sticky mini-header есть. «Релизы» — все как «Сингл» |
| `SpotifyArtistView.tsx` (каталог-артист) | 578 | Hero: круглая обложка w-44/lg:w-52, items-end, p-7. **BadgeCheck показывается всегда (строка 336) — при том, что `CatalogArtistDTO` НЕ имеет поля `verified` (types.ts:118–129) — фейковый бейдж «verified»**. Популярные треки: все 10 строк сразу (нет «показать ещё» — альбомы уезжают за fold). Related: крупная сетка 6 колонок |
| `AlbumDetailView.tsx` | 414 | Hero: обложка w-44/lg:w-52 (p-7) — по VLM-аудиту занимает ~40–45% первого экрана. Действия: Play / Shuffle / Queue / External. **Нет Add to Playlist и More** (заявлены в спеке V4.1). Дублирование заголовков: секция «Треки» + колонка «Трек». Tracklist: mq-row, active = accent; touch-таргеты 32px на mobile |

### История и позиции (для Continue Listening — честность Resume)

- `HistoryEntry = { track, playedAt, playCount }` — **позиция прослушивания НЕ сохраняется** (useAppStore.ts:122–126).
- `playTrack(track, queue?, playlistId?)` — **параметра позиции нет** (useAppStore.ts:417).
- Единственная честная «позиция» — live currentTrack + progress (аудио-элемент держит позицию; togglePlay возобновляет). Resume для историй = честный Play с начала. Фиктивных «Resume»-кнопок не делаем.

## 4. Baseline проверок (HEAD 4826a6bc)

| Проверка | Результат |
|---|---|
| Тесты (vitest, полный набор) | **1358/1358 PASS** (79 файлов), 127s |
| TypeScript | **src/ = 0 ошибок**; вне src/ 19 (desktop/tauri 15, skills 2, scripts 1) — pre-existing базлайн, ровно как в V4-отчёте |
| Production build | PASS, BUILD_ID `mq-build-4826a6bc` |
| Локальный сервер QA | :3112 (production build), SoundCloud search работает (51 трек по «daft punk») |
| Каталог локально | Deezer **недоступен из песочницы** (Access Denied; работает только из Vercel-сети) → Artist/Album QA делаем на production (BEFORE) и preview-деплое (AFTER) |
| Production `/api/catalog/search?q=daft+punk` | provider `deezer`, tracks/artists/albums ≥2 — каталог живой |

## 5. BEFORE-скриншоты (production, 24 шт.)

`download/ui-v4.1/screens-before/` — 1440×900 (01–05), 1280×800 (11–12), 390×844 (20–23), 360×800 (30–31). Реальная demo-сессия, реальный каталог Deezer + SoundCloud. **0 JS-ошибок страницы** за весь проход.

## 6. Реальные проблемы (VLM-аудит + код-ревизия; только подтверждённое)

### Search — Top Result (02b-search-topresult-desktop)
1. Artwork 104px — слишком мал для hero, не доминирует.
2. CTA «Слушать» выглядит второстепенным; приоритет Play неочевиден.
3. Eyebrow «Топ-результат»/«Артист» слишком бледные — теряются.
4. Нет альбома/duration/provider-бейджа в hero; нет вторичных действий (context menu).
5. Hero-тип не отражает сущность: album не бывает hero (только artist/track).

### Home — Continue Listening (01b + код)
1. Карточка **без обложки** — VLM: «выглядит как скелетный placeholder».
2. Нет альбома, нет provider-бейджа.
3. Пустое состояние — dashed-карточка без действия.
4. Дубликат: текущий трек виден и в Continue, и в «Недавно», и (при совпадении) в Featured.
5. Только desktop-полоса; мобильный hero уже занят MobileNowHero (дубль делать нельзя).

### Artist (03, 03c + код)
1. **SpotifyArtistView: фейковый BadgeCheck** (нет данных verified — рисуем бейдж всегда).
2. Популярные треки: 10 строк целиком → альбомы за fold; нет «Показать ещё».
3. SC-ArtistDetailView: desktop hero 380px + pt-24 → популярные треки далеко вниз.
4. «Назад» — слабая текстовая ссылка (обе страницы).
5. Related artists: крупная сетка одинакового веса с музыкой.

### Album (04 + код)
1. Hero ~40–45% первого экрана — вытесняет треклист.
2. **Нет Add to Playlist и More** (в спеке V4.1 заявлены).
3. Дублирование: заголовок секции «Треки» + колонка «Трек».
4. Длинные названия: нет line-clamp — заголовок может распирать hero.
5. Touch-таргеты like/menu 32px на mobile.

## 7. План V4.1 (соответствие фазам задания)

- **PHASE 1**: Search Top Result hero — editorial-композиция (artwork 150–170px, тип-зависимая: track/artist/album, полная честная meta, platinum Play + context menu, provider badge; mobile — отдельная узкая композиция; empty/preview-состояния не трогаем).
- **PHASE 2**: Continue Listening — премиальная карточка с artwork, live-прогрессом (честный Resume для currentTrack), provider-бейджем; empty state с CTA; дедупликация «Недавно».
- **PHASE 3**: Artist — убрать фейковый BadgeCheck; компактнее hero (SC-вариант); popular 5 + «Показать ещё» (каталог-вариант); related второстепенным; stronger back-affordance.
- **PHASE 4**: Album — hero компактнее + line-clamp заголовка; действия Play/Shuffle/Add-to-Playlist/More (реальные); треклист: убрать дубль заголовка, mobile touch-таргеты 40px+.
- **PHASE 5**: согласованность токенов/радиусов/отступов по 4 страницам.
- **PHASE 6–9**: performance-проверки → visual QA (4 вьюпорта) → tests/tsc/eslint/build → preview deploy → QA → production deploy → E2E.

## 8. Инварианты (защищаем)

1. Навигация не прерывает playback; playback вне React-видов.
2. Бесплатное воспроизведение без Spotify login/Premium — не трогаем resolver.
3. Провайдерская архитектура не меняется ради визуала.
4. Каждый элемент UI — реальное действие; никаких моковых данных/прогрессов.
5. Тесты не удаляем; 1358 baseline; tsc src/ = 0.
6. prefers-reduced-motion; keyboard nav; aria-labels.
7. Один деплой-проект (mq1), домен не меняем.
