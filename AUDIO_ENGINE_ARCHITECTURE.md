# MQ PLAYER — RUST/WASM AUDIO ENGINE ARCHITECTURE

> Phase A (Audit) → итоговый архитектурный документ.
> Реальная интеграция профессионального аудио-движка в существующий плеер.
> НЕ второй плеер. НЕ демо. Новый низкоуровневый audio backend под существующий UI.

---

## 1. Найденная текущая playback-архитектура (аудит)

Стек: **Next.js App Router + Vercel** (не Vite — подтверждено аудитом `package.json`).

### 1.1 Playback path (сегодня)

```
Track (store.currentTrack)
   │
   ▼
useAudioEngine.ts (React hook, 2255 строк) — loadTrack effect
   │
   ├─ SoundCloud: /api/music/soundcloud/stream → StreamResult
   │    ├─ isHls=true   → hls.js → MSE → HTMLAudioElement (A/B слот)
   │    │                  + EME/Widevine/FairPlay при isEncrypted
   │    └─ isHls=false  → progressive URL → /api/music/soundcloud/proxy (CORS)
   ├─ Audius: getAudiusStream() → прямой progressive mp3 URL
   └─ local_*: blob: URL (клиентская загрузка)
   │
   ▼
Dual HTMLAudioElement (A/B) + GainNodes — crossfade 0.5–8s / gapless
   │  (crossfade/gapless OFF на mobile)
   ▼
MediaElementAudioSourceNode ×2
   │
   ▼
GainA/GainB → [10-band BiquadFilter EQ (dormant→enabled)] → AnalyserNode (fft 2048)
   → [DynamicsCompressorNode?] → [ConvolverNode + dry/wet?] → AudioContext.destination
```

### 1.2 Ключевые файлы (найдены, не предполагались)

| Файл | Роль |
|---|---|
| `src/lib/audioEngine.ts` (1076) | AudioContext, dual-element crossfade, EQ biquad, compressor, reverb, analyser, CORS-детект |
| `src/components/mq/useAudioEngine.ts` (2255) | loadTrack-оркестрация, HLS attach, gapless preload, retry/circuit-breaker |
| `src/lib/streamResolver.ts` (473) | resolveSoundCloudStream, EME/DRM helpers, Widevine PSSH, HLS config |
| `src/lib/eq.ts` (76) | 10-band defs + пресеты (данные) |
| `src/lib/spatialAudio.ts` (535) | 5-band splitter→panner цепочка, mood presets |
| `src/lib/replayGain.ts` (148) | genre-based громкость (упрощённая, честно задокументирована) |
| `src/lib/audius.ts` | progressive mp3 streaming URL |
| `src/store/useAppStore.ts` (3075) | currentTrack/queue/isPlaying/volume/progress/repeat/shuffle/playbackRate |
| `src/components/mq/useMediaSession.ts` | MediaSession web + Capacitor native |
| `src/components/mq/AudioVisualizer.tsx`, `NowPlayingEqualizer.tsx` | реальный AnalyserNode + fallback-симуляция при CORS-block |
| `public/sw.js` | SW: Range-запросы проходят насквозь; .wasm → cache-first (для versioned-путей это корректно) |

### 1.3 Реальные форматы продакшена

- **SoundCloud HLS**: m3u8 → AAC-in-TS сегменты; **часть треков DRM (Widevine/FairPlay)** — лицензия через `/api/music/soundcloud/license-proxy`.
- **SoundCloud progressive (hlsless)**: mp3/aac progressive.
- **Audius**: progressive mp3.
- **local_***: blob-URL пользовательских файлов (mp3/flac/wav/…).

### 1.4 Ограничения, которые диктует архитектура

1. **DRM-контент не может идти через PCM-пайплайн** — CDM дешифрует внутри media element.
   → DRM-треки остаются на HTMLMediaElement-пути (байпас WASM DSP, честно отражено в capabilities).
2. **HLS-контент** уже демультиплексируется hls.js → MSE → декодируется браузером.
   Полный WASM-пайплайн для HLS требует собственного HLS-клиента (playlist management + TS-demux) —
   это отдельный большой слой. → HLS non-DRM: элемент остаётся источником, но **PCM после
   MediaElementAudioSourceNode проходит через Rust/WASM DSP** в AudioWorklet (реальный DSP на пути к destination).
3. **COOP/COEP**: глобальные заголовки могут сломать внешние ресурсы продакшена.
   → Выбран транспорт **MessagePort + Transferable ArrayBuffer** (реальный, работает везде,
   не требует SharedArrayBuffer / crossOriginIsolated). SAB+threads — задокументированная
   future-оптимизация при включении изоляции; capabilities() отражает статус.

---

## 2. Целевая архитектура

```
                     СУЩЕСТВУЮЩИЙ MQ PLAYER (React UI, store, queue)
                                      │
                        useAudioEngine.loadTrack (точка выбора)
                                      │
                       ┌──────────────┴───────────────┐
                       ▼                              ▼
             WasmAudioBackend               MediaElementBackend
             (новый, production-path)        (существующий путь, fallback)
                       │
        ┌──────────────┼─────────────────┐
        ▼              ▼                 ▼
   progressive      HLS non-DRM       DRM
   non-DRM          (hls.js element   (элемент напрямую,
   (MP3/FLAC/WAV     + WASM DSP        без Web Audio,
    + AAC-ADTS)       insert)           без DSP)
        │
        ▼
  MQ Decode Worker (DedicatedWorker)
   fetch (Range) → Symphonia demux/decode (WASM #1: codec) → PCM f32
        │  postMessage(transfer) — real, no setTimeout
        ▼
  MQAudioWorkletProcessor (AudioWorklet)
   ring buffer в WASM-памяти → Rust DSP (WASM #2: core) → output
        │
        ▼
  AudioContext.destination (+ существующий AnalyserNode для визуализатора)
```

### Два WASM-модуля (§45 «разделить core / codec»)

| Модуль | Crates | Где живёт | Размер-цель |
|---|---|---|---|
| `mq_audio_core.wasm` | audio-core, audio-dsp, audio-memory, audio-analysis, audio-wasm | AudioWorklet (реалтайм) | < 200 KB |
| `mq_audio_codec.wasm` | audio-codec (Symphonia mp3+flac+wav+aac-adts) | Decode Worker | < 500 KB |

Транспорт PCM worker→worklet: `MessagePort` + `Transferable` (zero-copy ownership move,
работает без COOP/COEP). Command queue JS→worklet: numeric opcodes (никакого JSON в реалтайме).
Состояние (playhead, underruns, buffer level): worklet публикует агрегаты ~20–30 Гц.

### Realtime-правила (§5)

AudioWorklet `process()`: только чтение ring buffer → Rust DSP → запись output.
Вся аллокация — при инициализации (FFT-планы, коэффициенты, scratch-буферы).
Никаких malloc/Vec/String/JSON внутри колбэка. Изменения графа — command queue,
применяются между блоками.

---

## 3. Cargo workspace

```
mq-player/audio-engine/
├── Cargo.toml                    # workspace
├── crates/
│   ├── audio-core/               # engine, transport, planar-буферы, ABI-типы
│   ├── audio-dsp/                # eq/ dynamics/ spatial/ modulation/ saturation/ restoration/ limiter/ analyzer/
│   ├── audio-codec/              # Symphonia: demux + decode + Range-reader
│   ├── audio-memory/             # ring buffer, buffer pool, arena, scratch
│   ├── audio-analysis/           # fft, rms, peak, LUFS, spectrum
│   └── audio-wasm/               # flat C-ABI exports (#[wasm_bindgen] + extern "C")
├── tests/                        # integration: golden master fixtures
└── fixtures/                     # sine/impulse/noise/pink/multitone
```

Сборка: `wasm-pack build --release` + `RUSTFLAGS="-C target-feature=+simd128"`,
`opt-level=3, lto=true, codegen-units=1, panic=abort`, `wasm-opt -O4`.

## 4. DSP-граф (§26)

PreGain → EQ (parametric min-phase | graphic | linear-phase FIR) → Dynamics
(compressor/expander/gate) → Saturation (tube/transistor, oversampling 1–8×) →
Spatial (ER + FDN-reverb + binaural pan + width) → Modulation (chorus/flanger/
phaser/tremolo) → Restoration (опционально) → Master → Limiter (lookahead,
true-peak, oversampling) → Output. Каждое звено bypass-уемо командой;
конфигурация пресетами (JSON валидируется в JS → typed commands → WASM).

## 5. Качество-режимы (§35)

Direct (полный bypass, PCM as-is) / Clean (limiter-only safety) / Studio /
Dynamic / Immersive / Master (linear-phase EQ + oversampling + true-peak).

## 6. Интеграция в MQ Player (§33, §87)

- `AudioBackend` TS-интерфейс; `WasmAudioBackend` и существующий путь как fallback.
- Выбор backend'а в `loadTrack`: capabilities + формат + non-DRM + флаг настройки.
- Любая ошибка WASM-пути → автоматический откат на существующий путь (плеер не ломается).
- EQ/Spatial/Compressor UI продолжают работать: адаптер направляет команды либо в JS-узлы
  (element-путь), либо в Rust DSP (WASM-путь). UI не перестраивается.
- MediaSession, queue, seek, next/prev, volume — через существующий store без изменений.

## 7. Кэш/SW-совместимость (§80)

Все wasm/worker/worklet ассеты кладутся в `public/audio-engine/<BUILD_TAG>/`,
`<BUILD_TAG>` генерируется сборочным скриптом и пишется в
`public/audio-engine/version.json`. SW cache-first для versioned-иммутабельных путей —
корректно. Range-запросы decode-worker'а SW не перехватывает (проверено аудитом sw.js).

## 8. Приоритет конфликтов (§89)

Audio correctness → Realtime stability → Existing MQ functionality →
Production reliability → Low latency → CPU → Memory → Quality → Browsers → UI.
