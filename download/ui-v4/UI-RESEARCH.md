# MQ UI Research — V4 Redesign

> Дата: 2026-10-12 · Базовая линия: commit `aad898cd` (production `mq-build-aad898cd`, mq1.vercel.app)
> Метод: анализ 7 open-source плееров + актуальных коммерческих сервисов. Код/ассеты не копируются — только паттерны.

---

## 1. Исследованные проекты

| Проект | Стек | Что взято на заметку | Что НЕ берём |
|---|---|---|---|
| **Feishin** | Electron/React | Сайдбар → сворачиваемый icon-rail; command palette (⌘K) + страница поиска; 4 режима списков (grid/table); очередь в 3 вариантах размещения (drawer/popover/sidebar); karaoke-подсветка текста; error boundary на каждый маршрут | Табличная плотность десктопа; sprawling-настройки |
| **Nuclear** | Tauri/React | Recent searches; drag-and-drop в очереди; named-темы парами light/dark; переводы текста песни | Дублирование одного трека из нескольких источников (паралич выбора) |
| **Koel** | Laravel/Vue | Правый side-sheet с 64px icon-rail (Lyrics/Artist/Album) — музыка не прерывается; skeleton+aria-busy дисциплина; responsive-инверсия: side-sheet → bottom sheet на мобиле | Очередь как главная поверхность браузинга |
| **Harmonoid** | Flutter | Фанатичная геометрическая последовательность отступов; анимация как часть бренда | Material-3 целиком (конфликтует с glass-брендом); лицензия PolyForm Strict — код не трогаем |
| **Spotube** | Flutter | Табы в плеере (Lyrics/Queue/Sources); mini-lyrics прямо в баре; onboarding-визард | Клонирование Spotify один-в-один |
| **Music Station** | Next 14 + shadcn | Glass-нижний бар (`bg-card/95 backdrop-blur-md border-t`); waveform-скраббер (Wavesurfer.js); счётчики-бейджи в навигации; ближайший к MQ стек | Светло-серая тема + `hover:scale-105` в навигации (consumer-cute, не premium); state-навигация без URL |
| **Rheoson** | React+Vite+Howler | Pre-warm топ-3 результатов поиска; вставка URL → резолв трека; artwork-scale-on-play (spring); swipe-down-dismiss; 7 accent-тем с live-preview | Пиксельное клонирование Spotify |

## 2. Коммерческие сервисы (актуальные паттерны 2024–2026)

**Spotify**: сайдбар Home+Search + Your Library с filter-chips, in-library поиском, sort, grid/list; Top Result hero-карточка в поиске; полноширинный нижний плеер (слева art+title+heart, центр транспорт+прогресс, справа now-playing/queue/volume/fullscreen); правая Now Playing-панель; градиенты, производные от обложки; near-black тема 2024+.

**Apple Music**: editorial-hero с крупной типографикой; mini-капсула в хедере раскрывается в full overlay; очередь рядом с now playing. Слабость — спрятанный плеер (низкая discoverability) — не берём.

**SoundCloud**: waveform как скраббер и как идентичность (прямо релевантно MQ — источник SoundCloud); «Next up» правый рельс; круглые аватары артистов; теги/жанры на поверхности.

**YouTube Music (2026)**: split-view Now Playing (нижняя половина = очередь, свайп вверх на половину); утолщающийся при скраббе прогресс-бар. Ошибка, которую не повторяем: lyrics/queue утоплены в чипы-карусели.

## 3. Тема-организованный синтез паттернов

### Layout
- **Формула-победитель (10/11 источников)**: постоянный сайдбар слева + основной скролл + полноширинный нижний плеер.
- Ширины: full 248–288px → collapsed 56–78px icon-rail. У MQ уже есть NavBar-карточка (веб) и Sidebar (desktop Tauri) — веб-шелл оставляем NavBar, но доводим до премиума.
- Glass-нижний бар валидирован Music Station — у MQ капсула уже есть (`mq-player-capsule`), усиливаем.
- Правый док 320–400px для очередь/лирика → на <1024px инвертируется в bottom sheet (паттерн Koel). У MQ QueueView уже drawer — полируем.

### Navigation
- Группировка: Discover (Home/Search) → Library (Liked pinned top) → utility (Settings) + user снизу.
- Счётчики на элементах библиотеки (Music Station) — дешёвая премиальная деталь, у MQ уже есть бейджи unread.
- Переходы без перезагрузки приложения, playback не прерывается — у MQ это уже так (SPA view-switch), сохраняем как инвариант.

### Search
- Гибрид: ⌘K command palette + полная страница поиска (Feishin) — у MQ есть и то, и другое (`CommandPalette`, SearchView) — поднимаем качество обоих.
- Recent searches на пустом состоянии (Nuclear, Spotify) — у MQ уже есть история поиска — выводим на поверхность.
- Tabs/секции: All / Tracks / Artists / Albums / Playlists; Top Result hero-карточка (Spotify).
- **Pre-warm топ-3** (Rheoson) — воспринимаемая скорость.

### Player
- Анатомия бара: слева art+title/artist+like · центр транспорт+прогресс · справа lyrics/queue/volume/fullscreen — у MQ соответствует; полируем типографику (tabular-nums для времени).
- Fullscreen: фон из обложки + градиент, spring-scale artwork, табы Lyrics/Queue, swipe-down-dismiss — у MQ FullTrackView/Spatial уже имеют многое; выравниваем качество деталей.
- Waveform-скраббер — дифференциатор MQ (SoundCloud источник); тонкий fallback-бар обязателен.

### Artist/Album
- Album: градиентный hero + трек-таблица; варьировать высоту hero (не чрезмерную).
- Artist: hero → Top Tracks (5–10 + «показать ещё») → Discography (chips фильтры Albums/Singles/EP) → Related artists.
- Имена артиста/альбома в плеере кликабельны (Koel) — навигация без потери контекста.

### Library / States
- Filter chips + поиск + sort + grid/list — Spotify-стек.
- Empty states с иллюстрацией/CTA, не «висящая иконка» (VLM-аудит MQ это подтвердил).
- Skeleton + `aria-busy` (Koel) вместо спиннеров — у MQ Skeleton.tsx есть, унифицируем.
- Route-level error boundaries + retry — у MQ ViewErrorBoundary есть.

### Motion
- 150–250ms, только transform/opacity; spring на player-state; cover-scale-on-play; swipe-down-dismiss.
- `prefers-reduced-motion` обязателен — у MQ уже есть `mq-reduce-motion` + MotionConfig — сохраняем.

### Mobile
- Bottom nav + mini-player над ней + fullscreen player со swipe-down — консенсус; у MQ MobileDock объединяет player+nav в glass-контейнер — это ОК, полируем тач-таргеты ≥44px.
- Горизонтальные коллекции без overflow; safe areas; никакого горизонтального скролла страницы.

## 4. Что current MQ уже делает хорошо (не ломать)

1. SPA-архитектура: playback живёт в store/AudioEngine — переживает переходы видов (главное требование V4).
2. Капсула плеера с glass — VLM назвал её сильнейшим элементом.
3. Settings «Very Premium» (master-detail) — только микро-полировка.
4. Контекстные меню с реальными действиями, skeletons, error boundaries, reduce-motion.
5. Очередь как drawer — правильный паттерн.

## 5. Итоговые принципы V4

1. **Один визуальный язык** — tokens v4 как единственный источник (цвет/тип/отступ/радиус/motion).
2. **Глубина, а не украшение** — многослойные поверхности, «дорогой» тёмный фон со сложными оттенками, аккуратные градиенты от обложек; никакого blur/glow ради эффекта.
3. **Типографика как иерархия** — display/headline/title/body/caption/numerals (tabular).
4. **Честные состояния** — empty с CTA, loading skeleton, error с retry; без фиктивных данных.
5. **Функция каждого элемента** — никаких кнопок без действия, никаких бейджей без смысла.
6. **Мобильный = отдельный дизайн**, не ужатый десктоп (390×844 / 360×800 / 430×932).
7. **Производительность** — transform/opacity анимации, без глобальных rerender на каждый кадр playback.

## 6. Источники

- Feishin — github.com/jeffvli/feishin · Nuclear — github.com/nukeop/nuclear · Koel — github.com/koel/koel
- Harmonoid — github.com/harmonoid/harmonoid (только паттерны; код под PolyForm Strict)
- Spotube — github.com/KRTirtho/spotube · Music Station — github.com/huangcheng/music-station · Rheoson — github.com/picklem0b/Rheoson
- Spotify/Apple Music/SoundCloud/YouTube Music — публичные веб-интерфейсы 2024–2026.
