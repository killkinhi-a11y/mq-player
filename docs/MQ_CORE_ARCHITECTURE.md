# MQ Core — целевая архитектура общего ядра (Task E)

> Статус: **проектный документ**, код не меняется. Ни одна аудио-система не переписывается;
> любое переключение на ядро — только за feature-флагом и после A/B-сравнения.
> Все факты ниже проверены по коду репозитория (ветка `main` @ 7d4e2d2 + стек PR #1–#7).

## 0. Что есть сейчас (факты)

| Слой | Web (Next.js) | Desktop (Tauri) | Android (нативный Kotlin/Compose) |
|---|---|---|---|
| UI | `src/components/mq/*` (React) | тот же `src/` через alias `@/* → ../src/*` (`desktop/tsconfig.json`), Vite | Compose `ui/screens`, `ui/theme/MqThemes.kt` |
| Модель Track | `src/lib/musicApi.ts` `interface Track` (+ V2-поля catalogProvider/catalogId, `_src*`) | = Web | `data/api/Models.kt` `data class Track` — **подмножество** (нет `createdAt`, `_src*`, catalog-полей V2) |
| Playback | `src/lib/audioEngine.ts` + `useAudioEngine.ts`: dual HTMLAudioElement A/B, crossfade/gapless, hls.js/EME | = Web (WebView2) + `smtc.rs` (System Media Transport Controls) | Media3/ExoPlayer: `player/PlaybackController.kt` (797 строк), `MqPlaybackService.kt`, `MqAudioProcessor.kt` |
| DSP | WebAudio-граф + опционально Rust/WASM (`src/lib/wasm-audio/*`, `public/audio-engine/<tag>/`) | = Web | своя реализация на Kotlin: `dsp/MixerDsp.kt` (606), `mixer/MixerEngine.kt` |
| Wave | чистый детерминированный движок `src/lib/wave/*` (≈4.1k строк, seeded rng), сервер `/api/wave`, `/api/wave/next`, `/api/wave/feedback` | = Web | `WaveRepository.kt` → **`GET api/music/recommendations?wave=1`** — *другой* пайплайн, без relevance gate/diversity |
| Sync | `store/slices/sync.ts` → `/api/sync` (JSON-blob), SSE `/api/messages/sse`, BroadcastChannel (multi-tab) | = Web | `LocalStore.kt` (DataStore); `/api/sync` **не используется** |
| Темы | `src/styles/design-tokens.css` (134 CSS-переменных) + 8 тем-файлов, `setTheme` в store | = Web | `MqPalette` в `MqThemes.kt` — ручное зеркало `--mq-*` переменных |

Rust-ядро уже есть: `audio-engine/` (workspace, 7 крейтов, 68 тестов, CI job `rust-audio` в PR #4):

```
audio-memory   (arena, pool, lock-free ring buffer)       — без зависимостей
audio-analysis (fft, loudness, meters)                    — rustfft
audio-dsp      (eq, dynamics, spatial, saturation, …)     — memory, analysis
audio-core     (engine, command, quality, error)          — dsp, memory, analysis
audio-codec    (decoder)                                  — symphonia (mp3/flac/wav/aac/mp4)
audio-wasm     cdylib → audio_wasm.wasm (502 KB, SIMD)    — core+dsp+memory+analysis
codec-wasm     cdylib → codec_wasm.wasm (893 KB)          — codec
```

WASM-поставка версионируется: `public/audio-engine/version.json` (`tag`, `coreBytes`, `codecBytes`, `simd`)
— манифест единственный источник URL, старый JS не может получить новый WASM (`src/lib/wasm-audio/manifest.ts`).

**Главный вывод аудита:** «общего ядра» сегодня нет — есть общий *Rust DSP* (только Web/Desktop), а бизнес-логика
(queue, Wave, playback rules, sync, модели) существует в двух независимых реализациях: TypeScript и Kotlin, причём
Android уже расходится по модели Track, по Wave и по sync.

## 1. Целевая структура mq-core

```
mq-core/                         (Cargo workspace; audio-engine/ входит как подкаталог — НЕ переносится сразу)
├── crates/
│   ├── mq-model        Track, Playlist, QueueItem, ProviderId, ошибки; serde; schema-версия
│   ├── mq-queue        очередь: insert/next/prev/shuffle(seeded)/repeat, history window, dedup
│   ├── mq-playback     правила: resolver (catalog→playback candidate), fullLength/preview-policy,
│   │                   версии трека, prefetch-решения, retry/circuit-breaker как чистые функции
│   ├── mq-wave         порт src/lib/wave (engine, scoring, diversity, relevance gate, memory, rng)
│   ├── mq-sync         модель снапшота /api/sync, merge-правила (history, likes, playlists), CRDT-lite
│   ├── mq-protocol     версии API/ABI, DTO для FFI, feature-negotiation
│   ├── audio-*         существующие крейты audio-engine без изменений
│   ├── mq-ffi-uniffi   биндинги Kotlin (Android) + Swift (на будущее)
│   ├── mq-wasm         wasm-bindgen биндинги для Web — только для mq-wave / mq-queue (см. §6)
│   └── mq-tauri        tauri-plugin: команды поверх ядра для Desktop
└── conformance/        golden-фикстуры JSON (вход → ожидаемый выход), общие для TS/Kotlin/Rust
```

Правило: **ядро без I/O**. Сеть, файлы, аудио-устройства, таймеры — у платформы; ядро получает данные и
возвращает решения (functional core / imperative shell). Это уже так устроено в `src/lib/wave/engine.ts`
(«pure orchestrator», детерминизм по seed) — его и стоит портировать первым.

## 2. Ответственность крейтов

| Крейт | Отвечает | Не отвечает |
|---|---|---|
| mq-model | типы, валидация, сериализация, миграции схемы | хранение, сеть |
| mq-queue | состояние очереди и переходы, shuffle с seed | загрузка аудио |
| mq-playback | выбор источника/версии, preview vs full, порядок fallback'ов | HLS/EME/ExoPlayer — это платформа |
| mq-wave | ранжирование, фильтры, gate, причины (`_reason`) | получение кандидатов (сервер/API) |
| mq-sync | формат снапшота, merge и конфликт-правила | транспорт (fetch/SSE/BroadcastChannel) |
| mq-protocol | `CORE_API_VERSION`, capability-флаги, DTO | бизнес-логика |
| audio-* | DSP/анализ/декодирование (как сейчас) | UI, очередь |

## 3. Граница core ↔ platform

- **Core**: чистые функции и state-машины, на входе — модели + время (`now_ms`) + seed, на выходе — новое состояние + список *эффектов* (`Effect::Prefetch(id)`, `Effect::Persist(key)`, `Effect::Report(event)`).
- **Platform**: исполняет эффекты, держит I/O, аудио-устройство, UI, хранилище (Zustand persist / DataStore / Tauri store).
- Zustand остаётся источником правды для React-UI; ядро не владеет store. Подготовка уже сделана в PR #6:
  `src/store/stateDomains.ts` (15 доменов) показывает, какие поля относятся к queue/playback/wave/sync и потенциально
  переходят под ядро, а какие — чистый UI.
- Аудио-рендер (realtime-поток) никогда не вызывает FFI с аллокациями — только существующие lock-free буферы `audio-memory`.

## 4. Взаимодействие с Tauri

- Сейчас Tauri-слой тонкий: `desktop_info`, `auth_store_token`, `smtc_update`, локальный proxy (`proxy.rs`).
- Цель: `mq-tauri` как tauri-plugin, линкующий `mq-core` **нативно** (без WASM): `invoke("core_queue_next", …)`.
- Desktop-UI — общий с Web (`src/`), поэтому выбор бэкенда идёт через один TS-интерфейс `CoreBackend`
  с двумя реализациями: `WasmCore` (браузер) и `TauriCore` (invoke). Выбор — по `isTauri()` из `desktop/src/desktop/env.ts`.
- Ядро на Desktop может работать и через WASM (как сейчас DSP) — нативный путь оправдан только для того, что тяжело
  для WebView (декодирование больших FLAC, анализ библиотеки).

## 5. Android: UniFFI (рекомендуется) или альтернатива

- **UniFFI** (Mozilla): генерирует Kotlin-биндинги из Rust, поддерживает records/enums/errors/async; сборка
  `cargo-ndk` → `jniLibs/{arm64-v8a,armeabi-v7a,x86_64}/libmq_core.so`. Плюс: одна реализация Wave/queue/sync вместо
  `WaveRepository`/`PlaybackController`-логики. Минусы: +размер APK (оценка 1.5–3 MB на ABI для core без codec),
  время сборки, NDK в CI (job `android` в PR #4 надо расширить).
- Альтернатива A: **ручной JNI** — меньше зависимостей, но дорого в поддержке; не рекомендуется.
- Альтернатива B: **оставить Kotlin, но гонять conformance-фикстуры** (`conformance/*.json`) в JVM unit-тестах —
  дешёвый первый шаг, даёт паритет без нативного кода. **Рекомендуется как этап 1**, UniFFI — этап 3.
- ExoPlayer остаётся плеером; `MixerDsp.kt` можно позже заменить на `audio-dsp` через UniFFI только после A/B
  (метрики: CPU, латентность, battery, null-test разницы PCM).

## 6. Web через WASM — где оправдано

| Кандидат | WASM? | Почему |
|---|---|---|
| DSP / анализ / декод | **да (уже)** | CPU-bound, SIMD, AudioWorklet |
| mq-wave | **условно** | сейчас Wave считается на сервере (`/api/wave`, Node) и есть TS-движок; WASM даёт единую реализацию с Android, но +~200–400 KB. Делать только после conformance-паритета |
| mq-queue / mq-playback rules | **нет на этапе 1–2** | логика лёгкая, частые вызовы из React — стоимость JS↔WASM-маршалинга и размер бандла не окупаются; TS-реализация + общие фикстуры |
| mq-sync merge | возможно | если merge-правила станут сложными (CRDT) |

На сервере (Vercel/Node) ядро можно использовать через тот же WASM или napi-rs — но это отдельное решение, не сейчас.

## 7. Версионирование API/ABI

- `mq-protocol::CORE_API_VERSION` (semver). Major — breaking в DTO/семантике; minor — новые поля/функции.
- FFI-поверхность: только сериализуемые DTO с `#[non_exhaustive]`/default-полями; новые поля — опциональные
  (как уже делает Android: kotlinx-serialization игнорирует неизвестные ключи).
- WASM: сохраняется существующая схема `version.json` + content-hash tag; добавить поле `coreApi` и проверку
  совместимости в `manifest.ts` (несовместимо → kill-switch на JS-путь, как уже реализовано для audio).
- UniFFI: версия библиотеки проверяется при `init()`; несовпадение major → fallback на Kotlin-реализацию.
- HTTP API (`src/app/api/*`, 36 групп маршрутов) — отдельный контракт: добавить `X-MQ-Api-Version`
  и contract-тесты Android ↔ сервер (сейчас Android-тесты ходят в продакшен `mq1.vercel.app`, если не задан `-PmqApiBase` — см. docs/CI.md).

## 8. Миграция без остановки разработки (strangler)

1. **Этап 0 (сделано в Stage III/IV):** декомпозиция стора/компонентов, 0 import-циклов (PR #7), карта состояния (PR #6), CI для всех платформ (PR #4).
2. **Этап 1 — контракты:** `conformance/` фикстуры, генерируемые из текущего TS (`lib/wave`, `lib/playback`, queue-actions);
   тот же набор гоняется в Vitest и JVM-тестах Android. Сразу выявит расхождения Wave/Track (см. §0).
3. **Этап 2 — mq-model + mq-wave на Rust**: проходят те же фикстуры; в Web/Node — за флагом, shadow-mode
   (считаем оба, сравниваем, логируем расхождения, отдаём TS-результат).
4. **Этап 3 — Android через UniFFI**: `WaveRepository` получает локальный ранжировщик ядра (кандидаты — с сервера); A/B по метрикам skip-rate/лайков.
5. **Этап 4 — queue/playback rules / sync** — по одному домену, каждый за флагом, с откатом одним переключателем.
Ни один шаг не требует feature-freeze: старый путь остаётся до доказанного паритета.

## 9. Обратная совместимость

- Persist-схема Zustand (70 persisted-ключей, зафиксированы тестом в PR #6) не меняется; при переходе домена под ядро — миграция `version` в persist.
- Формат `/api/sync` (JSON-blob) — читатель ядра принимает старый формат; запись — в старом до перехода всех клиентов.
- Старые APK (v2.2–v2.3.x) продолжают ходить в `api/music/recommendations` — эндпоинт не удаляется.
- WASM-манифест: старые tag-каталоги в `public/audio-engine/` сохраняются минимум на одну версию.

## 10. План тестирования и производительности

- Conformance: golden JSON (≥ 200 кейсов Wave, queue-переходы, resolver), детерминизм по seed — побайтовое сравнение.
- Property-тесты (proptest) для queue/shuffle; fuzz (cargo-fuzz) для декодера и десериализации DTO.
- Perf-бюджеты: Wave rank 500 кандидатов < 5 ms (desktop) / < 15 ms (mid Android); WASM core < 600 KB; APK +≤ 3 MB/ABI.
- Аудио A/B: null-test PCM (разница < −90 dBFS), CPU в AudioWorklet, underrun-счётчик (`wasm-audio/diagnostics.ts` уже есть).
- CI: `rust-audio` (есть) + будущие `core-conformance` (TS+JVM+Rust) и `android-ndk` jobs.

## 11. Риски

| Риск | Митигирование |
|---|---|
| Двойная поддержка TS+Rust в переходный период | shadow-mode, ограниченный срок, домены по одному |
| Размер бандла/APK | WASM только для CPU-bound, ABI-splits в AAB |
| Сложность сборки (NDK, wasm-pack, Windows Tauri) | всё в CI (PR #4 уже собирает Rust/Android/Tauri) |
| Realtime-аудио и FFI | ядро не вызывается из аудио-потока; lock-free буферы |
| Расхождение Android уже сейчас | этап 1 (фикстуры) до любого Rust-кода |
| Регрессии воспроизведения | никаких переключений без A/B и флага; старые пути не удаляются |

## 12. Единая дизайн-система / Liquid Glass / синхронизация тем / WAVE / визуальный паритет (п.9 задания)

Что поддерживает архитектура:
- Web и Desktop делят один UI-код (`src/`) → визуальный паритет Web↔Desktop «бесплатно».
- Есть токены: `src/styles/design-tokens.css` (134 переменные `--mq-*`), темы — отдельные CSS-файлы, `setTheme` в store;
  Android `MqPalette` прямо ссылается на web-переменные в комментариях (`// web --mq-card`).
- Есть visual-parity harness для Android (`ParityHarness`, скриншоты `download/screens/parity/`, sysprop `mq.parityDir` из PR #4).

Препятствия:
1. **Нет единого источника токенов**: CSS-переменные и `MqThemes.kt` синхронизируются вручную → дрейф неизбежен.
   Решение: `design-tokens.json` (W3C DTCG) → генерация CSS и Kotlin (Style Dictionary), проверка в CI.
2. **Liquid Glass** опирается на `backdrop-filter`/полупрозрачность (`materials-v25.css`); в Compose аналог
   (`RenderEffect` blur) доступен только с Android 12 (API 31) — нужен деградационный вариант и токены «material level»,
   а не конкретные значения blur.
3. **Синхронизация темы между устройствами**: тема хранится в persist локально; `/api/sync` её не переносит,
   Android не использует `/api/sync` вовсе. Нужно поле `theme` в схеме mq-sync.
4. **WAVE-паритет**: Android использует `api/music/recommendations?wave=1`, а Web — `/api/wave` с relevance gate и
   diversity → разные очереди при одинаковом профиле. Это не визуальная, а продуктовая несогласованность; устраняется этапами 1–3 §8.
5. **Модель Track на Android — подмножество** (нет catalog V2 / import-атрибуции) → часть UI-бейджей и «why this track» не может совпасть.
6. Parity-скриншоты коммитятся в репозиторий и перезаписываются тестами (см. docs/CI.md) — их стоит перенести в CI-артефакты (см. отчёт об артефактах).
