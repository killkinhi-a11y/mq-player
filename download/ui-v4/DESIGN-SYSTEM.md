# MQ Design System — V4 «Obsidian Prime»

> Спецификация редизайна V4. **Принцип: не новая библиотека, а дисциплинированное применение и усиление существующей системы** (design-tokens.css + mq-t-типографика + themes.ts). 25 тем продолжают работать через CSS-переменные — V4 меняет default-тему и общие слои, не хардкодя цвета в компонентах.

---

## 1. Цвет

### 1.1 Default-тема «Obsidian» → V4 (премиальная глубина)

| Токен | Текущее | V4 | Обоснование |
|---|---|---|---|
| `background` | `#0e0e0e` (плоский) | `#0b0b0e` | Чуть глубже, холодный подтон вместо серой плоскости |
| `card` | `#1a1a1a` | `#15151a` | Едва заметный тёпло-фиолетовый подтон — «сложный» фон |
| `cardHover` | `#252525` | `#1d1d24` | Мягче дельта hover (спокойная роскошь) |
| `border` | `#333333` | `#2a2a33` | Тоньше визуально, тот же подтон |
| `text` | `#f5f5f5` | `#f4f4f6` | Нейтральнее |
| `textMuted` | `#b8b8b8` | `#a3a3ae` | Контроль контраста: AA на мелких |
| `accent` | `#e03131` | `#e03131` (сохраняем бренд) | Дисциплина применения (см. 1.3) |
| `gradient` | один radial | двухточечный ambient: акцент 8% слева-сверху + холодный 4% справа | Живая глубина фона |

### 1.2 Слои поверхности (elevation ramp)

Поверх системы `--mq-surface-0…4` вводим дисциплину: фон страницы = `surface-0`; карточки = `surface-2`; elevated (меню, drawer, модалки) = `surface-3`; toast = `surface-4`. Hover карточек — `color-mix(card 92%, text 8%)`, не отдельный hex.

### 1.3 Дисциплина акцента (главное изменение восприятия)

Красный `#e03131` остаётся брендом, но получает **роли**:
- **Primary action** (Play CTA, active-nav): заливка + мягкая тень `--mq-shadow-accent`; для hero-CTA — вертикальный градиент `#e23b3b → #c92626` + inner-highlight `inset 0 1px 0 rgba(255,255,255,.18)` — «дорогая кнопка».
- **Soft surface** (active-строки, чипы, selected): `color-mix(accent 12%, transparent)` фон + `color-mix(accent 28%)` рамка — никогда не сплошной красный.
- **Focus** (замена X1): `box-shadow: 0 0 0 1.5px color-mix(accent 55%), 0 0 0 5px color-mix(accent 12%)` — тонкая сердцевина + широкое тихое гало; иконка поиска окрашивается в акцент.
- **Не акцент**: валидация ошибок остаётся `--mq-error`, success `--mq-success`.

### 1.4 Контраст-партитура

- Заголовки/primary текст: ≥ 7:1 · Secondary (mq-t-artist/meta): ≥ 4.6:1 · Caption (mq-t-meta-2): ≥ 4.5:1 (поднять с 0.78 opacity) · Иконки действий: ≥ 3.2:1.
- Проверка на «сложном» фоне (ambient gradient) — muted не ниже AA на любом пятне фона.

## 2. Типографика

Manrope (единственный; алиасы mono/serif уже ведут в него). Шкалаmq-t сохраняется, уточняем:

| Роль | Класс | Кегль/вес | Изменение V4 |
|---|---|---|---|
| Display (hero-моменты) | `mq-t-display` | 30→**clamp(28px, 3vw, 38px)** / 800 / -0.03em | Адаптивный display |
| Page title | `mq-t-page` | 22 / 800 | Без изменений |
| Section | `mq-t-section` | 15→**16** / 650 | Чуть крупнее — яснее иерархия секций |
| Track / Card title | `mq-t-track(-sm)` | 14/13 / 600 | Без изменений |
| Artist / Secondary | `mq-t-artist` | 13 / 500 | Контраст-апгрейд (1.4) |
| Meta / Caption | `mq-t-meta(-2)` | 12/11 / 500 | meta-2: opacity 0.78→0.9 |
| Timecodes | `mq-t-time` | 12 / 600 / tabular-nums | **Везде tabular-nums, моно-классы упразднить** |

Правило: никаких inline `font-size` вне mq-t-классов в новых строках; legacy-места не трогаем без нужды.

## 3. Отступы и сетка

- Существующая шкала `--mq-space-1…32` (4px-база) — канон. Новое правило ритма секций: **page padding 20px (mobile) / 24px (≥lg)**, **section gap 32px**, **card gap 16px**, **inner card padding 16px**.
- Сетки карточек: `grid-template-columns: repeat(auto-fill, minmax(X, 1fr))` — 168px треки, 12px gap; artwork — `aspect-ratio: 1`, `object-fit: cover`, радиус `--mq-radius-lg` (12px) → hover `--mq-radius-xl` (16px) с 220ms.
- Ни одного магического числа в отступах в новых компонентах — только `var(--mq-space-*)`.

## 4. Компоненты (стандартизация)

| Компонент | Спека V4 |
|---|---|
| **Button** | Primary = градиент-accent (1.3) + `mq-t-btn`; Secondary = glass `--mq-glass-bg` + рамка border-default; Ghost = без рамки, hover `--mq-glass-bg-hover`. Высоты: 40 (CTA) / 32 (compact) / 44 (mobile min). Активная: scale(0.97) 100ms. |
| **IconButton** | 40×40 (hit 44 на touch), радиус full; hover — `--mq-glass-bg-hover` 150ms; active-состояние (toggle) — accent-soft фон 12% + accent-иконка; aria-label обязателен. |
| **Input / SearchField** | Фокус из 1.3; фон `--mq-surface-1`; рамка `--mq-border`; высота 44+; иконка окрашивается в accent при фокусе. |
| **TrackRow** | Высота 56–60; grid: `[index/artwork 44] [title/artist 1fr] [album, ≥lg] [duration] [source-badge] [like] [⋯]`; hover: фон `--mq-glass-bg-hover`, artwork→play-fab 200ms; active-track: accent-рамка-слева 2px + таймкод accent. На мобиле: скрыть album+badge, оставить artwork+meta+duration+⋯. |
| **AlbumCard / PlaylistCard** | Artwork 1:1, radius 12, hover: подъём translateY(-3px) + `--mq-shadow-card-hover` + play-fab по центру (opacity 0→1, 180ms); title `mq-t-track`, artist `mq-t-artist`. Плейлисты: user — рамка-градиент аватар-типа; system — бейдж. |
| **ArtistCard** | Изображение 1:1 в круге (radius full); hover — кольцо `border-accent 40%`. |
| **ProviderBadge** | Компактный чип 16px-иконка+имя `mq-t-badge`; только там, где источник реален и неочевиден (строки поиска, очередь); не дублировать в каждой строке библиотеки. |
| **ContextMenu** | Существующий MenuCore (glass 84% + анимация 180ms) — уже премиальный; только консистентное применение. |
| **Dialog / Drawer** | Overlay `--mq-overlay-scrim`; панель `--mq-surface-3` + `--mq-blur-md`; вход 220ms `cubic-bezier(0.22,1,0.36,1)`. |
| **Skeleton** | Единый shimmer (`mq-shimmer` уже есть) с aria-busy; скелет повторяет геометрию контента (строки 56–60px, карточки 1:1). |
| **EmptyState v2** | Композиция: мягкая иконка-плитка 56px (accent 10% фон, radius 16) → заголовок `mq-t-display 20px` → текст `mq-t-meta` → **CTA-кнопка реального действия** («Перейти в поиск», «Открыть библиотеку»). Не голая иконка. |
| **ErrorState** | Иконка + заголовок + причина + Retry-кнопка; при network-offline — OfflineBanner уже есть. |
| **Toast** | surface-4 + blur, 260ms вход, автоскрытие. |

## 5. Motion

- Длительности: instant 100 / fast 200 / normal 350 / slow 500 (токены уже есть) — UI-переходы ≤ 220ms.
- Easing: `--mq-spring-smooth` (0.22, 1, 0.36, 1) для входов; `--mq-spring-bounce` — только player-моменты (play-scale, like).
- Hover: только bg/border-color/box-shadow/transform — никогда layout.
- Списки > 50 строк — без per-row mount-анимаций (progressive уже есть).
- `prefers-reduced-motion` + store `reduceMotion` — уже сквозные; все новые анимации через MotionConfig/CSS-пары.

## 6. Shell-геометрия

- Веб NavBar-карточка: высота ~56px, остаётся fixed-top карточкой (брендовая фишка MQ) — V4: спокойнее тень, чище скругление, nav-пилюли с active-подложкой accent-soft.
- PlayerBar-капсула: 72–80px; grid 3 зоны (meta 1fr / транспорт auto / действия 1fr); tabular-таймкоды с полем 8px от полосы.
- MobileDock: единая glass-капсула; мини-плеер 56px + nav 50px; тач ≥ 44px; safe-area через `env()`.
- Контейнер контента: max-width `--mq-container-wide` (1024) для main/messenger; `base` (768) для library/search; на ≥1440 — до 1200 с центр. выравниванием.

## 7. Атрибутация источников (честность)

`Catalog: X / Playback: Y` сохраняется как есть (принцип FREE MODE). В V4 — provider-бейджи единые: SoundCloud / Audius иконка+имя, тихий цвет (не отвлекающий), tooltip с полным названием источника.

## 8. Доступность

- Все icon-only — aria-label (уже大部分); фокус видим (1.3); Escape закрывает верхний оверлей (layering уже есть); tab-order семантичен (main → nav → player).
- Контраст по 1.4; reduced-motion по 5.

## 9. Запреты (anti-паттерны V4)

1. Сплошной красный на больших поверхностях (только CTA ≤ 48px высотой).
2. Blur > 24px, glow без функции, particles.
3. `transition: all`; анимация layout-свойств.
4. Inline hex-цвета и магические px в новых местах (только токены).
5. Пустые секции «для заполнения» и кнопки без действия.
6. Одинаковые карточки-плитки на весь экран — разнообразие блоков (hero-ряд / сетка / список / аккордеон).
