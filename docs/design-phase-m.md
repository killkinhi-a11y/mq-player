# Phase M — Design Audit

Дата: 2026-09-04. База: production `mq1.vercel.app`, commit `4ab8a56`.
Метод: чтение исходников ключевых поверхностей + трассировка использования декоративных компонентов.

Аудит охватывает: AppShell, MainView, SearchView, LibraryView, QueueView,
FullTrackView, FullTrackViewMobile, PlayerBar, NavBar, MobileDock, ProfileView,
SettingsView, FriendsView, MessengerView, NotificationPanel, TrackCard,
SearchTrackRow, EmptyState, loading/error states.

---

## A. Глобальный уровень (AppShell + globals.css)

### A1. Always-on ambient decorations
- **BEFORE**: `AnimatedGradientBg` (плавающие blur-блобы), `CursorParticleField`
  (canvas RAF-цикл за курсором), `CinematicAtmosphere` (mouse-follow градиент)
  рендерятся в AppShell постоянно на desktop.
- **PROBLEM**: три бесконечных анимации/RAF-цикла одновременно; blur-фильтры
  каждый кадр; ровно те паттерны, которые Phase M запрещает (backdrop/blur
  stacks, infinite breathing, per-frame canvas). Стоимость растёт с временем
  сессии, польза для задачи «слушать музыку» — нулевая.
- **CHANGE**: убрать все три из AppShell. Фон = плоский `--mq-surface-base`.
- **REASON**: LESS EFFECTS, MORE DESIGN. Спокойный editorial фон, ресурс на
  аудио, а не на декор.

### A2. TrackCard — Phase 2B рудимент
- **BEFORE**: `useTilt3D` (3D-tilt обложки), ambient glow слой `filter: blur(20px)`,
  `animation: mqBreathe 2s infinite` на accent-баре, `mqPulseTint 2.5s infinite`
  фон, `textShadow` glow на заголовке, `backdropFilter: blur(12px) saturate(180%)`
  на play-кнопке, `whileHover` y-lift + два box-shadow glow.
- **PROBLEM**: магнитный 3D-tilt и infinite breathing — прямо из запретного
  списка Phase M (#1, #7, #43). Card — самый массовый компонент (сотни
  инстансов в Wave/рекомендациях) → стоимость умножается на N.
- **CHANGE**: убрать tilt/glow/breathe/pulse/textShadow. Active state =
  accent-бар слева + типографика (title акцентом, mono-метаданные) + NowPlaying
  equalizer. Hover = плоская surface-подложка + hairline border.
- **REASON**: active state должен читаться даже без цвета (#9) — иерархия,
  а не свечение.

### A3. useMagnetic в PlayerBar/MainView
- **BEFORE**: магнитные кнопки (кнопки притягиваются к курсору).
- **PROBLEM**: «magnetic 3D tilt» — запрещён явно; RAF на каждый mousemove.
- **CHANGE**: удалить usage из PlayerBar/MainView (хук остаётся неиспользуемым).
- **REASON**: предсказуемость > трюк (#7: predictable, GPU-cheap).

## B. Типографика

### B1. Иерархия не выражена системой
- **BEFORE**: размеры заданы ad-hoc (`text-sm`, `text-[14px]`, `text-[11px]`,
  inline `fontSize: 13/14`). Нет ролей Display/Headline/Section/Body/Metadata/
  Numeric; serif (Playfair Display) подключён, но применяется точечно.
- **PROBLEM**: без ролей каждая поверхность решает сама → плотность и вес
  «пляшут» между видами; numeric (duration, BPM, bitrate) не стабилен по ширине.
- **CHANGE**: ввести утилиты `.mq-display/.mq-headline/.mq-section-label/
  .mq-body/.mq-metadata/.mq-numeric` (mono + tabular-nums) поверх
  существующих шрифтовых переменных. Применить в Player/Queue/UpdateBanner.
- **REASON**: осознанная иерархия (#5), визуально стабильные числа.

## C. Player (главный UX-элемент)

### C1. ProgressBar — нет клавиатурного seek
- **BEFORE**: мышь/тач drag, hover tooltip с временем. Нет `role="slider"`,
  `tabIndex`, стрелок.
- **PROBLEM**: keyboard-пользователь не может seek; a11y-семантика слайдера
  отсутствует. Tooltip с `hoveredTime` уже есть — preview сделан.
- **CHANGE**: `role="slider"` + `aria-valuemin/max/now/aria-valuetext` +
  `tabIndex={0}`; ArrowLeft/Right ±5s (Shift ±1s), Home/End. Touch target
  уже ≥ 16px по высоте контейнера — не уменьшать.
- **REASON**: #8 keyboard seek + #42 keyboard navigation.

### C2. PlayerBar — визуальный шум в transport-зоне
- **BEFORE**: useMagnetic, LikeBurst частицы, множественные glow-тени.
- **PROBLEM**: главные элементы (track identity, transport, progress) должны
  доминировать; свечения конкурируют с ними.
- **CHANGE**: убрать магнитику; secondary actions (like/queue/effects) —
  quiet (muted, hover → text-primary); сохранить LikeBurst как короткий
  функциональный micro-interaction (#7 разрешает like-анимацию).
- **REASON**: strong hierarchy + quiet secondary actions (#6).

## D. Queue

### D1. Нет смысловой группировки
- **BEFORE**: единый список; current track выделен фоном, но «NOW PLAYING /
  UP NEXT» не подписаны семантически.
- **PROBLEM**: пользователь не видит структуру очереди; active row и обычные
  различаются только оттенком.
- **CHANGE**: секции «Сейчас играет» / «Далее», mono uppercase section labels,
  `data-active` на текущем ряду = accent bar + типографика (как TrackCard A2).
- **REASON**: #12 очевидная иерархия; active без цвета.

## E. Обновление deployment (НОВАЯ фича)

### E1. Пользователь не узнаёт о новом deployment
- **BEFORE**: `generateBuildId` fallback `mq-build-v58` — все деплои Vercel
  без `BUILD_ID` env получают ОДИНАКОВЫЙ buildId. Inline-скрипт в layout
  сравнивает `localStorage['mq-build-id']` с `__NEXT_DATA__.buildId` —
  на Vercel сравнение всегда равно → детект никогда не срабатывает.
  `useAppUpdate` работает только в Capacitor (APK). Web-механизма нет.
- **PROBLEM**: после деплоя пользователь сидит на старых чанках до жёсткого
  Ctrl+Shift+R; mix old-JS + new-API → chunk errors, лечится только
  аварийным recovery-скриптом.
- **CHANGE**: полный UpdateManager (см. раздел F) + `version.json` +
  UpdateBanner + «Обновить».
- **REASON**: #19–#34 — обязательная production feature.

## F. Loading / Error / Empty states

### F1. Loading
- **BEFORE**: `ViewSkeleton` «Загрузка…», Skeleton.tsx, progressive lists.
  Fake-progress не обнаружен в основном пути (ProgressBar показывает только
  реальный progress).
- **PROBLEM**: нет unified статусов stream-load (Buffering/Decoding не
  выражены на уровне UI-обвязки аудио; аудиодвижок = HTML5 Audio, т.е.
  «WASM engine UI» из секций #15–16 неприменим к реальной архитектуре —
  см. NOT VERIFIED в финальном отчёте).
- **CHANGE**: UpdateBanner показывает честные состояния
  (Проверка/Доступна/Обновление…/Ошибка) — без fake progress (#31–#32).

### F2. Error
- **BEFORE**: ViewErrorBoundary на каждый view + аварийные inline-скрипты
  (TDZ/chunk/React #300).
- **PROBLEM**: chunk-error recovery молча перезагружает страницу — без
  коммуникации с пользователем.
- **CHANGE**: при chunk-ошибке сначала version-check → если есть новый
  deployment → показать banner «приложение обновилось» (действие
  пользователя), аварийный одноразовый reload остаётся last-resort.
- **REASON**: #47 — контроль у пользователя; #18 error surface с retry.

## G. Settings

### G1. Группировка
- **BEFORE**: табы account/appearance/playback/notifications/more.
- **PROBLEM**: аудио-настройки размазаны; нет явной секции качества.
- **CHANGE**: в playback-табе семантические секции «Воспроизведение» /
  «Качество и движок» (честные поля: backend, buffer strategy) +
  «Диагностика» (advanced, свёрнуто). НЕ выдумывать WASM/codec/SIMD поля,
  которых нет в реальной архитектуре.
- **REASON**: #14 grouping; честность > имитация (#48 NOT VERIFIED).

## H. Update Banner (новая поверхность)

### H1. Размещение
- **BEFORE**: Offline/Maintenance banners — top full-width.
- **PROBLEM**: full-width top banner перекрывает навигацию/контент.
- **CHANGE**: UpdateBanner — компактная карточка top-right (desktop) под
  NavBar; top full-width с safe-area на mobile, НЕ поверх player/nav/seek
  (player снизу). `role="status"`, focusable кнопки, лёгкое появление
  (opacity+translateY 0.25s), отключение под prefers-reduced-motion.
- **REASON**: #22, #35, #36, #42.

---

## Приоритет изменений

1. **UpdateManager + version.json + Banner** (E1, H1) — новая фича, ядро Phase M.
2. **TrackCard A2** — самый массовый компонент, максимум Phase 2B рудиментов.
3. **AppShell A1** — always-on декоративный шум.
4. **ProgressBar C1** — a11y + keyboard seek.
5. **Типографика B1** — системная основа.
6. **Queue D1, PlayerBar C2, Settings G1** — иерархия.
