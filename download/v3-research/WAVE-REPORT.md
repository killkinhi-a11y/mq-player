# MQ V3 — WAVE REPORT (PHASE 40)

Дата: 2026-10-08 · Файлы: `WaveformView.tsx` (переработан), `src/lib/wave/render.ts` (новый), `src/lib/playback/clock.ts` (новый)

## Current architecture (что было, V2)

Canvas 2D + DPR, один приватный rAF в компоненте, полная перерисовка всех
баров каждый кадр, статус-атрибут loading/ready/partial/unavailable,
плоские бары одного цвета (platinum), чтение позиции напрямую из
`currentPlaybackPosition()`. Технически корректно, но: состояния не
различались визуально, буфер не показывался, стилистика не связана с
артворком, рендер — O(bars) на каждый кадр.

## Problems found (§14)

1. Нет §16-состояний (BUFFERING/SEEKING/ERROR/ENDED отсутствовали).
2. Нет buffer-визуализации.
3. Плоский цвет — никакой связи с обложкой трека.
4. Полная перерисовка поля баров на каждом кадре.
5. Свой rAF-цикл (параллельно с 4-5 другими таймерами приложения).
6. Маппинг клика — по полной ширине канвы, а не по видимому полю баров.

## Root causes

Рендер-логика была монолитом внутри компонента; не было разделения
«статичное поле баров» / «динамический playhead»; состояние волны
не моделировалось как отдельная сущность.

## New architecture

```
PlaybackClock (один rAF на всё приложение, §13/§19)
   ↓ subscribeClock(fn, throttleMs)
WaveformView (композитор)
   ├─ useWaveform(track)          — данные пиков (существующий конвейер)
   ├─ extractColors(track.cover)  — палитра артворка (race-guard §18)
   ├─ Layer cache (offscreen ×2): unplayed-стиль + played-стиль
   │    rebuild только при data/size/palette change — O(bars) редко
   └─ draw(): drawImage(unplayed) → clip(playX) → drawImage(played)
        → buffer strip → playhead+glow → hover guide
src/lib/wave/render.ts — чистые функции: computeBarGeometry,
   deriveWaveState (8 состояний), buildWaveColors, drawBarLayer,
   bufferedAheadRatio, placeholderHeight — всё юнит-тестируемо.
```

## Rendering method

Слои: полный бар-филд дважды пререндерится в offscreen-canvas
(unplayed-стиль quiet/buffered-tint; played-стиль — вертикальный градиент
акцент→глубина + restrained glow 4px). На кадр: 2 drawImage + rect-clip +
hairline-playhead с мягким огоньком. DPR-aware, ResizeObserver.

## PlaybackClock

Единый источник времени: ОДИН rAF, пока playing; wake-burst на
seek/resize/theme; slow-poll 250ms на паузе (внешние seek из lyrics/
Media Session подхватываются без 60fps-цикла). Подписчики: Wave,
LiquidLyrics (fill), FullscreenLyrics (время), engine progress-registry.

## State model (§16 — все восемь различимы)

| Состояние | Визуал |
|---|---|
| IDLE | ghost-hill placeholder, opacity 0.45, без playhead |
| LOADING | shimmer + дышащая анимация canvas |
| BUFFERING | bars 0.75 + пульсирующая buffer-полоса |
| PLAYING | полный рендер, плавное движение playhead |
| PAUSED | полный рендер, движение остановлено (CSS-анимаций нет) |
| SEEKING | мгновенный scrub-preview (drag) + усиленный playhead |
| ERROR | ghost-поле 0.5, recovery через родительский UI |
| ENDED | заполнено 100%, playhead скрыт, лёгкое затухание |

QA-подтверждение (production): `playing → paused → seek → playing → scrub`
все состояния наблюдались живьём; preview-деплой показал живой `buffering`.

## Performance changes

- O(bars)-перерисовка → O(1)-композит на кадр (§17).
- Один общий rAF вместо личного (−1 цикл из 6).
- React-state только на макро-события; ARIA обновляется на 4Hz.
- Палитра извлекается один раз на трек (кэш useDominantColor).

## Responsive + Interaction

- `<480px`: barW 2px (плотнее поле), mobile touch (pointer events,
  touch-action none), capture-drag.
- Клик/драг seek, hover-бабл времени, keyboard ±5s/±1s/Home/End
  (window-capture slider), точный маппинг по видимому полю баров.
- artwork-aware: градиент played-баров из доминантного цвета обложки;
  нет обложки → сигнатурный platinum.

## Wave provider behavior

- SoundCloud/WASM: реальные пики (decode → peaks), buffer strip из
  bufferedFrames/TimeRanges.
- Spotify Official (SDK): supportsWaveform=false → честный slim-track
  (никаких фейковых волн).
- DRM/HLS недекодируемые: liveSampler partials → merged peaks; нет
  данных → slim seekable track (honest fallback).

## Tests

- render.ts: 8 состояний deriveWaveState, геометрия desktop/mobile,
  buffer ratio (WASM/element), placeholder-детерминизм.
- WaveformView.test.tsx: ARIA-слайдер, клик/драг/клавиатура seek,
  single-owner клавиатура, точный бар-филд маппинг.
- v3-test-matrix: clock-подписки/throttle/wake, wave race (useWaveform
  stale-key защита сохранена).

## QA (скриншоты в download/qa-v3/)

Desktop 1440×900 + mobile 390×844: full player premium (VLM: «defect-free,
premium aesthetic»), played/unplayed контраст (VLM-фидбек учтён —
lightness unplayed поднята), состояния playing/paused/buffering живьём,
seek/scrub работают, lyrics-синхронизация через общий clock.
