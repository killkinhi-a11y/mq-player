# MQ UI QA Report — V4 «Obsidian Prime»

> Дата: 2026-10-12 · Коммит: `516e728a` (поверх free-mode базы `ae1a7ee7`) · Production: `mq-build-516e728a`
> Методология: до/после скриншот-матрицы (desktop 1440×900, mobile 390×844) + VLM-аудит + пиксельная верификация + E2E-интеракции + гейты.

---

## 1. Скриншот-матрицы

**BEFORE** (`download/ui-v4/screens-before/`, 20 шотов): auth, home (+scrolled), search (+results), library, playerbar, fullplayer, lyrics, queue, settings (+scrolled), profile, messenger, mobile home/search/library/settings/fullplayer.

**AFTER** (`download/ui-v4/screens-after/`, 13 локальных + 8 production): те же ключевые поверхности + search-focus + merged-home + prod-версии (home, search, search-focus, search-results, queue, fullplayer, mobile home).

## 2. VLM-верификация ключевых изменений

| Проверка | Вердикт VLM |
|---|---|
| Home V4 (после редизайна) | «background feels deep and premium», greeting typography «excellent», активная пилюля «soft red tint» подтверждена. Общий premium-балл **8/10** (было: «flat», «template-like» элементы) |
| Full player баланс (было: контент смещён влево) | «significantly better balanced… stable, symmetrical, visually pleasing focal point»; hotkeys-чипы «much more readable… look like interactive UI elements». Итог: «a clear visual upgrade» |
| Empty state (поиск) | Иконка в тонированной плитке ✓, bold-заголовок ✓, подсказка ✓, чипы-сuggestions ✓ |
| Play-кнопка (капсула) | «premium; vibrant red circle with subtle gradient and inner shadow, pressable 3D quality» |

## 3. Пиксельная верификация (объективная, сверх VLM)

- **Фокус поиска (X1)**: до — сплошная красная обводка 2px (134 «тревожных» пикселя в строке, `outline: 2px solid #e03131 !important` от глобального a11y-правила, которое текстовые инпуты получают даже при mouse-фокусе). После — 0 сплошных красных строк в зоне инпута: computed `border: rgb(42,42,51)` (нейтраль), тень = тёмный drop + акцент-гало 9%. Введён `mq-v4-quiet-focus` (opt-out для элементов со своим фокус-тритментом; глобальное a11y-правило :focus-visible сохранено для всех остальных элементов).
- **Тема V4**: `--mq-bg: #0b0b0e`, `--mq-card: #15151a` применены на живой странице (до: #0e0e0e/#1a1a1a).

## 4. E2E-интеракции (local dev + production)

**Local (merged код)**: demo-вход → «Слушать» → воспроизведение реального трека SoundCloud (Jane! — The Long Faces, 3:04) → play/pause toggle ✓ → next track ✓ → капсула live-обновляется ✓ → очередь ✓ → полный плеер ✓ → Escape ✓.

**Production (mq1.vercel.app, mq-build-516e728a)**:
- Воспроизведение: старт (Space, trusted-событие) → **непрерывно >90 сек** (0:06 → 1:53 → 2:25, трек 3:05) ✓
- **Непрерывность при навигации**: переход Главная → Поиск → ввод запроса «muse» → результаты — трек продолжал играть (2:25) ✓ (главный инвариант)
- Поиск: «muse» → реальные результаты ✓
- Очередь: открытие ✓; Полный плеер: открытие/закрытие ✓
- Mobile 390×844: `overflowX = false`, мини-плеер присутствует, играет ✓
- Console: **0 JS-ошибок** за сессию ✓

**Отдельно проверено (local)**: мобильные ширины 360×800 / 390×844 / 430×932 — `overflowX = false` на home/search/library/settings/fullplayer.

## 5. Гейты

| Гейт | Результат |
|---|---|
| Тесты (vitest) | **1358/1358 PASS** (79 файлов; NB: база выросла с 565 до 1358 после слияния с free-mode) |
| TypeScript | src/ чисто; 16 pre-existing ошибок вне src (scripts/debug-resolve.ts от free-mode, skills/*, yandex/store.ts) + 18 в desktop/ (Tauri) — все базлайн |
| ESLint | 565 problems / 57 errors — **побайтово равно базлайну** (проверено git stash A/B), 0 новых |
| Production build | ✓ Compiled successfully (27–28s); version.json/.mq-build-id артефакты откачены |
| CSS-валидность | баланс скобок globals.css = 0 (после починки двух стыковых блоков ребейза) |
| Rebase-целостность | конфликты с free-mode (themes/SearchView/NavBar/PlayerBar/EmptyState/FullTrackView/globals) разрешены с сохранением обеих систем: ambient-атмосфера free-mode + V4-поверхности; platinum/neutral-кнопки free-mode сохранены для вторичных действий |

## 6. Найденные и исправленные дефекты в ходе QA

1. **globals.css unclosed blocks ×2** (стыки ребейза: `mq-wave-art-layer img`, `mq-hit44 @media`) — починены, build зелёный.
2. **Красный a11y-outline поверх инпута поиска** (глобальный `*:focus-visible` с `!important`) — решено opt-out классом с сохранением a11y везде.
3. **Dev-сервер умирал при `next build`** (общий `.next`) — воркфлоу-заметка: не запускать build при живом dev.
4. **Локальный SW кэш ломал boot в dev** (stale `mq-static-v4` shell) — разрегистрирован; в production SW инвалидируется BUILD_ID-механизмом штатно.

## 7. Остаточные известные некриты

- «N Issue»-бейдж AudioDebugPanel — **dev-only** (в production отсутствует), задокументирован в UI-AUDIT §X6.
- VLM-замечания средней важности (не блокеры): загруженность верхней зоны home при виджете обновления (UpdateBanner — штатный транзиентный механизм, исчезает после обновления); продолжить-слушать карточка «чуть generic» — кандидат на V4.1 полировку.
- 16+18 pre-existing tsc-ошибок вне src — унаследованный базлайн, не входил в скоуп UI-редизайна.
