# MQ UI V4 — PRODUCTION REPORT

> **Production URL: https://mq1.vercel.app**
> **Deployment: `mq-build-516e728a`** (commit `516e728a`, pushed to `main` → Vercel auto-deploy, released 2026-10-11T22:47:53Z)
> База: free-mode `ae1a7ee7` (53835547 FINAL FREE PLAYBACK) — UI V4 ребейзнут поверх без изменения playback-архитектуры.

---

## 1. Что изменено (сводка)

Полный профессиональный UI-редизайн-слой **V4 «Obsidian Prime»**: единая дизайн-система premium-dark, применённая поверх работающего музыкального движка. Подход — **дисциплинированное усиление существующей системы токенов** (не переписывание приложения): 25 тем продолжают работать через CSS-переменные.

### Дизайн-ядро
- **Тема default «Obsidian» → V4**: глубокий около-чёрный `#0b0b0e` с фиолетовым подтоном (вместо плоского `#0e0e0e`), поверхность `#15151a`, тише hover-дельты, двухточечный ambient-градиент. Атмосферные слои free-mode (ambient) сохранены и сосуществуют.
- **Дисциплина акцента** (ключевое изменение восприятия): красный бренд остаётся только в ролях — Primary CTA (градиент + inner-highlight + акцент-тень), Soft surface (12%/28% миксы для active-строк/чипов/selected), Focus (тихое гало). Запрет сплошного красного на больших поверхностях.
- **Calm focus system (X1)**: убирана «тревожная» красная обводка поиска (глобальный a11y-outline + 3px red-ring) — заменена на подъём поверхности + тёмный drop + акцент-гало 9%; a11y-правило :focus-visible сохранено для всех остальных элементов (opt-out `.mq-v4-quiet-focus`).
- **EmptyState v2 (X4)**: глобально (через CSS-классы `.mq-empty`/`.mq-empty-state`) — акцентная плитка-иконка, display-заголовок, подсказка, **реальная CTA** («Найти музыку» → поиск в очереди; EmptyState-компонент с action).
- **Типографика (X2/X3)**: display-приветствие clamp(30–38px)/800/-0.03em; mq-t-section 16px; meta-2 контраст ↑ (opacity 0.78→0.9); tabular-nums везде подтверждены.

### Компоненты
- **NavBar**: активная вкладка = soft-accent поверхность + акцент-иконка/текст + тонкое кольцо (вместо нейтральной заливки).
- **PlayerBar-капсула**: Play = V4 CTA (градиент, 3D-нажимаемость — подтверждено VLM).
- **FullTrackView Classic**: композиция отцентрирована (пара artwork+инфо как группа — было смещение влево); hotkeys-подсказки = читаемые чипы.
- **QueueView**: empty state с CTA; grip остаётся hover-тихим.
- **SearchView**: calm-focus + чипы-подсказки с hover-оживлением; V4 empty-структура.
- **MainView**: display-приветствие; нулевые счётчики быстрых карточек больше не рисуют сломанное «—».

### Состояния
Скелетоны, оверлеи, меню — не тронуты (уже соответствовали); все ошибки/пустоты/загрузки наследуют V4 через CSS-слой.

## 2. Переработанные поверхности

Home (главная) · Search (+пустое состояние, +фокус) · Library/Favorites (empty states) · Queue · Full Player (Classic desktop) · PlayerBar · NavBar · Auth (наследует тему) · Settings (наследует) · мобильные композиции (MobileDock/FullPlayerMobile — тема+токены) · EmptyState (все вью).

## 3. Функциональные проблемы, найденные и исправленные

1. Красная «ошибочная» обводка поиска (a11y-outline конфликт) — исправлено.
2. «—» на нулевых счётчиках (выглядело сломанным) — исправлено.
3. Лево-смещение полного плеера — исправлено (центрированная группа).
4. Два unclosed CSS-блока после ребейза — исправлено (build зелёный).
5. Dev-артефакты задокументированы: AudioDebugPanel «Issue»-бейдж — dev-only; SW-кэш в dev — разрегистрирован.

## 4. Результаты проверок (полный вывод — UI-QA-REPORT.md)

- **Тесты: 1358/1358 PASS** (79 файлов)
- **TypeScript: src/ чисто** (16 вне-src + 18 desktop — pre-existing базлайн)
- **ESLint: 565/57 — ровно базлайн, 0 новых** (A/B git stash)
- **Build: ✓ Compiled successfully**
- **Visual QA**: до/после матрицы + VLM-вердикты (home 8/10 premium, fullplayer «clear upgrade», empty state структура ✓, CTA «premium 3D»)
- **Пиксельная верификация**: calm-focus (0 alarm-пикселей), тема (#0b0b0e live)
- **Mobile**: 360/390/430 — overflowX=false на всех ключевых видах

## 5. Production E2E (живой деплой)

| Проверка | Результат |
|---|---|
| Версия | `/version.json` → `mq-build-516e728a`, commit 516e728a ✓ |
| Тема V4 live | `--mq-bg: rgb(11,11,14)` ✓ |
| Воспроизведение | Старт → **непрерывно >90 сек** (0:06→1:53→2:25, трек 3:05, реальный SoundCloud full-length) ✓ |
| Непрерывность при навигации | Главная→Поиск→результаты: трек продолжал играть ✓ |
| Поиск | «muse» → реальные результаты ✓ |
| Очередь / Полный плеер | Открытие, Escape-закрытие ✓ |
| Mobile 390 | overflowX=false, мини-плеер играет ✓ |
| Console | 0 JS-ошибок ✓ |

## 6. Production URL / Deployment ID

- **URL: https://mq1.vercel.app** (существующий project, домен не менялся, rollback сохранён)
- **Deployment buildId: `mq-build-516e728a`** · commit `516e728a` на `main`

## 7. Что НЕ изменилось (гарантии)

- Бесплатное воспроизведение (FREE MODE): PlaybackResolver → SoundCloud/Audius, без Spotify Login/Premium/OAuth — нетронуто.
- Аудио-движок (WASM), очередь, lyrics, история, избранное, плейлисты, чаты — нетронуты.
- 25 тем + стили — работают через переменные (V4 меняет default и общие слои).
- Данные пользователей — не мигрировали, не трогали.

## 8. Остаточные проблемы / следующие шаги

1. **V4.1-кандидаты**: полировка continue-listening карточки (VLM: «чуть generic»); Top Result hero-карточка в поиске; wave-artwork hover-превью на карточках home.
2. pre-existing вне-src tsc ошибки (scripts/debug-resolve.ts, skills/*, yandex/store.ts, desktop/) — отдельная техдолг-задача.
3. Spatial full player — намеренно не тронут в этом проходе (своя зрелая дизайн-система).
4. Artist/Album/Playlist — наследуют тему/токены; их собственная композиционная полировка — следующий итерационный раунд (V4.1) в силу размера god-компонентов.

## 9. Артефакты

- Документы: `download/ui-v4/UI-RESEARCH.md`, `UI-AUDIT.md`, `DESIGN-SYSTEM.md`, `UI-QA-REPORT.md`, `PRODUCTION-REPORT.md`
- Скриншоты: `screens-before/` (20), `screens-after/` (13 local + 8 prod)
- Скрипты: `scripts/ui-v4-before-shots.sh`, `scripts/ui-v4-after-shots.sh`
- Коммиты: `bc028798` (V4 layer) → `516e728a` (rebase-fix) на `main`
