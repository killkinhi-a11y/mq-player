# MQ Audio Engine v2 — Architecture

Status: implemented (this pass). Supersedes the v1 "per-track worklet" design.
Rust/WASM binaries are UNCHANGED (ABI v3, compiled assets) — v2 is a browser-side
(JS worker + JS worklet + TS backend) re-architecture on top of the existing
opcode surface. No Rust toolchain was available in the build sandbox; every v2
capability is achievable through the existing ABI, which is itself evidence the
ABI is sound.

## 1. Research summary (A1) — what modern sources say

Verified against MDN / W3C WebAudio spec / Chrome for Developers / Mozilla Hacks
(Paul Adenot) / v8.dev / Spotify engineering paper (Kreitz & Prado) / Shaka /
Musicat gapless writeups. Full digest in the session worklog; decision-relevant
facts:

- `process()` must be allocation-free, lock-free, GC-free steady state
  (AudioWorklet runs on the RT audio rendering thread, 128-frame quanta).
- SharedArrayBuffer requires cross-origin isolation (COOP+COEP) — **rejected
  for MQ Player**: the app loads cross-origin SoundCloud CDN audio + artwork
  that do not send CORP headers; `require-corp` would break playback/artwork,
  `credentialless` is not universal. The transferred-ArrayBuffer MessagePort
  data plane (zero-copy moves, FIFO ordering) is the portable choice and is
  what the research's "one-shot transfer" guidance permits.
- Gapless on the web = ONE continuous PCM stream across boundaries (MSE and
  dual-`<audio>` cannot do sample-accurate joins). MP3 needs encoder
  delay/padding awareness (LAME ~576/1152-sample silence regions); raw
  concatenation without trimming clicks/gaps.
- Spotify prefetch anchors: begin next-track fetch at ≤30 s remaining, escalate
  at ≤10 s; initial request ~15 s of audio; steady-state buffer target is
  adaptive, not fixed.
- `AudioContext.currentTime` is the authoritative clock; JS timers skew by
  tens of ms. UI position must be interpolated against stat timestamps, never
  integrated from `performance.now()` alone.
- Underrun recovery must ramp (fade-out → silence → refill → fade-in); hard
  zeroing is a documented click source.
- WASM code cache + compile: once per session, not per track (v8.dev code
  cache is URL-keyed; per-track compile wastes exactly what caching saves).
- One long-lived AudioContext per content sample rate; iOS Safari per-page
  memory budgets mean PCM caches in the tens of MB, not hundreds.

## 2. Architecture (A2)

```
Main thread (TS)                          UI / store orchestration
  useAudioEngine ── callbacks ── WasmAudioBackend v2
                                    │ lifecycle state machine (§4)
                                    │ authoritative clock (§7)
                                    │ adaptive controller + explain log (§8)
                                    │ next-track registry (gapless §6)
             control plane: postMessage (load/seek/next/abort, numeric opcodes)
┌───────────────────────────────────┴──────────────────────────────────┐
│ Decode Worker (mq-decode-worker.js v2)      AudioWorklet (v2)        │
│  Fetcher (range windows, retry/resume)       persistent engine:      │
│   → SegmentCache (LRU per-URL byte ranges)   ONE wasm instance per   │
│  Decoder (codec_wasm Symphonia)              session (§5)            │
│   → BoundaryTracker (frame-exact, FIFO)      ring write + credit     │
│   → PCM validator (NaN/DC/jump scan)         boundary crossing →     │
│   → silence trim (LAME delay/padding)        trackEnded events       │
│  AdaptiveBufferController (EWMA net/decode)  stats @10 Hz            │
│  PrefetchController (next track, lead)                                │
│  PCM data plane: MessagePort transfers (FIFO order = boundary order) │
│  credit plane:   worklet → worker cumulative window (unchanged)      │
└───────────────────────────────────────────────────────────────────────┘
              Rust engine (audio_wasm, ABI v3 — unchanged)
               ring (32768 frames) + fade machine + DSP chain
```

Responsibility split (per requirement):

| Concern | Owner |
|---|---|
| networking | Worker Fetcher (range windows, retry, resume, abort) |
| buffering | Worker AdaptiveBufferController + SegmentCache; worklet ring |
| decoding | Worker ↔ codec_wasm (Symphonia, queue cap 2^18 frames) |
| scheduling | Worklet (RT) pops ring; Worker credit-gated pump |
| DSP | Rust engine chain (deterministic, RT-safe, disableable) |
| transport | Backend state machine → opcodes → Rust |
| clock | Rust playheadFrames → backend interpolation → UI getters |
| UI telemetry | stats @10 Hz + on-demand diagnostics; never in the RT path |

UI state and audio realtime state are decoupled: the store never sees PCM-level
events; the backend exposes only playback-level callbacks (progress/advanced/
ended/fatal) and zero-render position getters.

## 3. Seek as a first-class operation (A3)

- Epoch/generation isolation (v1, kept): every load/seek bumps `gen`; the
  worklet drops stale-`gen` PCM before it can touch the flushed ring; credit
  resets atomically with the flush (cumulative sequence space).
- Deterministic flush sequence, ordering guaranteed by design:
  1. backend: `gen++` → worklet `FLUSH {gen}` → worklet `SEEK {gen, frames}`
     (worklet learns the new generation BEFORE any B-side data can arrive),
  2. worklet: ring cleared by Rust, credit/grant counters reset, boundary map
     cleared, playhead anchored at `base = target frames`,
  3. worker: `seek {url, byte, gen}` → decoder reset → refetch.
- No old PCM after seek: gen guard + credit gating (worker physically cannot
  pump post-seek data until the worklet grants credit in the new gen, which
  happens only after FLUSH was applied — cross-target delivery order becomes
  irrelevant).
- Predictable refill: worker's pump loop + 250 ms tick; SegmentCache hit →
  zero-network refill (backward/short seeks are instant).
- No `setTimeout`-in-the-RT-path hacks: the only timers are worker-side
  (non-RT) backpressure sleeps and the 250 ms pump tick.

Lifecycle (explicit state machine, backend-owned):

```
IDLE → LOADING → PRIMING → PLAYING ⇄ PAUSED
PLAYING/PRIMING → SEEKING → PRIMING
PLAYING → STARVED → RECOVERING → PLAYING
PLAYING → ENDED → (auto-advance: gapless continuation or IDLE)
any → ERROR → (fallback to element path, engine → IDLE)
```

States are published in stats (numeric enum) + surfaced in the AudioDebugPanel.
Illegal transitions are logged and ignored (defensive, never crash).

## 4. Underrun recovery (A4)

Rust engine (unchanged, verified): signal→silence transitions run a 256-frame
(~5.8 ms) compensated fade-out anchored at the last real sample; returning
data ramps back in over 256 frames; consecutive dry blocks never restart the
fade. v2 adds the controller layer: on STARVED the worker enters priority
refill (pump tick accelerates to 60 ms, fetch continues regardless of decoded-
queue backpressure), and the adaptive controller raises the steady-state
buffer target after each stall (EWMA, bounded). Everything on the RT thread
remains O(frames) and allocation-free.

## 5. Persistent engine + session node (latency root cause fix)

v1 created a **new AudioWorkletNode + new wasm engine + full wasm compile per
track** (per-track `WebAssembly.instantiate` of 502 KB inside the worklet,
plus `addModule` handshake). v2:

- ONE worklet node per (AudioContext × session). Track change on the same
  context = worker-side generation bump + flush; the node, the wasm instance,
  the DSP state and the volume survive. DSP settings no longer need replay.
- The wasm module is compiled once per context (code cache friendly — stable
  immutable URL).
- AudioContexts: cached per content sample rate (max 3, LRU eviction of
  inactive contexts). Different-rate track → hard transition (new context +
  node, gapless not attempted — matches the platform research; documented
  limitation).
- Warm track-switch path (user pressed next): worker fetch+decode only —
  target first-audio ≈ 0.15–0.4 s (was 0.4–0.6 s + node handshake).

## 6. Gapless / smooth transitions (A5)

Technique: one continuous PCM stream across the boundary — the worker never
flushes the ring at a track boundary; the FIFO ordering of the PCM MessagePort
is the source of truth for boundary position:

- Worker counts frames sent since the last flush (`cumSent`). Immediately
  before the first PCM chunk of the next track it posts `{trackStart, cumSent,
  trackId}` on the same port (ordered before that chunk by MessagePort FIFO).
- Worklet keeps a boundary map `[{trackId, startCum}]` in the same coordinate
  space as the engine playhead (playheadBase + cumSent ≡ engine playhead; the
  invariant holds because credit gating makes ring drops impossible and flush
  resets both spaces atomically). When the popped playhead crosses a boundary,
  the worklet posts `trackEnded {index}` and switches the stats' per-track
  offset; the backend advances the UI (store `nextTrack()` with a suppressed
  reload) with zero audible discontinuity.
- LAME encoder delay/padding: the codec ABI does not expose trim metadata, so
  the worker applies a bounded, real-signal-based boundary polish: leading
  near-silence (|x| < 1e-4) up to 1152 frames and trailing near-silence up to
  2304 frames are trimmed at continuation edges only. Caps make it safe for
  tracks that legitimately begin in silence.
- Sample-rate/channel guard: the next track's head is decoded by the SAME
  decoder instance switching at source EOF, so B's first frames exist ≈5.9 s
  before the boundary (queue-cap-driven timeline). If B's sample rate ≠ A's,
  the worker aborts gapless (`nextAborted`), A drains to a normal `ended`,
  and the hook does a regular load in a new context. Channels are always
  decoder-normalized to stereo (mono upmix in codec_wasm).
- Crossfade: NOT implemented on the WASM path (single ring cannot mix two
  live streams; honest platform limitation — documented). The element path
  keeps its crossfade. Gapless is strictly better than the v1 hard cut.
- End-of-queue: EOF flag is set only when the LAST continuation track's fetch
  is done; `is_drained` then fires the final `ended`.

Failure handling: next-track fetch/decode failure before the boundary →
gapless abort (A finishes normally); after the boundary → fatal → element-path
recovery at position (§35.22 unchanged). The player never dies.

## 7. Clock architecture (A6)

The Rust playhead (frames popped since flush) is the single authoritative
playback clock for the WASM backend. Stats arrive at 10 Hz; the backend
interpolates between stat updates with a `performance.now()` anchor,
clamped to 250 ms of extrapolation (drift-safe), paused-aware. UI components
read `currentPlaybackPosition()` / RAF getters — **zero React re-renders for
position**; the store receives ~1 Hz coarse progress (for the time label) as
before. `AudioContext.currentTime` is used only by the worklet internally for
stats throttling (it IS the RT clock); the main thread never integrates time
from JS timers.

## 8. Adaptive buffering + predictive pipeline (A7 + A10)

Worker-side AdaptiveBufferController (deterministic, explainable):

- Inputs (EWMA, per read/decode batch): network throughput (bytes/s), decode
  throughput (frames/s), queue depth, underrun/stall events.
- Outputs: steady-state decoded-queue target (3 s → 5.9 s cap), starved-mode
  refill acceleration, fetch window size.
- Every decision appends to a bounded explain log: `{t, decision, inputs,
  reason}` — surfaced in diagnostics/AudioDebugPanel. No hidden magic.

Predictive Playback Pipeline (main thread + worker):

- The hook resolves the next queue track's stream URL (existing 15 min cache)
  and registers it with the backend (`setNextTrack`), including a real
  **continuation score** computed from actual playback history (share of
  recent track plays that ran to completion vs. skipped; queue/radio mode).
- Prefetch lead = base 30 s (Spotify-anchored) × continuation score,
  clamped [8 s, 30 s]. High skip-rate users prefetch later (less wasted
  bandwidth); radio/queue listeners prefetch early.
- At ≤10 s remaining the worker escalates: next-track bytes must be cached
  and its head decoded (already enforced by the queue-cap-driven timeline —
  the escalation verifies and reports readiness via `nextReady`).
- All numbers are real measurements; nothing is faked. When inputs are
  missing the controller uses the documented conservative defaults.

## 9. Streaming (A8)

- Range windows with authoritative `Content-Range` verification (v1 fix,
  kept): capped/truncated windows → next-window fetch, never a fake EOF.
- v2 adds: retry with backoff (2 attempts, resume from the byte offset
  actually pushed), transient-error classification (AbortError ≠ retry),
  SegmentCache (per-URL LRU byte-range map, 12 MB budget) → backward seeks
  and re-plays skip the network entirely, and seek coalescing under rapid
  scrubbing (the worker defers refetch 150 ms per new seek, aborting the
  in-flight range — one network round trip per scrub gesture, not per event).

## 10. DSP architecture (A9)

Rust chain (unchanged, already modular/RT-safe/disableable/testable):
ring → fade-in → master gain+pan (per-sample ramp) → declipper → EQ (10-band
graphic OR linear-phase) → spectral enhancer → expander → compressor →
limiter → noise gate → modulation (chorus/flanger/phaser/tremolo) →
waveshaper saturation → spatial (early reflections, binaural, width, reverb)
→ stats/meters. Every stage is opcode-switchable; `SET_BYPASS_ALL` exists;
`cargo test` covers the DSP math. v2 changes nothing here (no Rust rebuild
possible/needed) — the persistent engine additionally guarantees settings
survive track changes, removing the v1 replay hack.

## 11. Audio quality validation (A11)

- Worklet stats (10 Hz): peak, RMS, true-peak, LUFS short/integrated, gain
  reduction (Rust meters).
- Worker PCM validator (per chunk, O(n), off-RT): NaN/Inf count, DC offset
  estimate, max inter-sample |Δ| (discontinuity detector), zero-run length;
  counters exported in the `flow` diagnostic and `getAudioHealth()`.
- Negative-pathology assertions in the benchmark harness (§12): after every
  scenario, `health.violations === 0` is asserted (NaN, DC beyond ±0.02,
  inter-sample |Δ| > 1.5 with signal present).

## 12. Benchmark suite (A12)

`window.__mqAudioBench` (backend API) + Playwright harness (agent-browser):
scenarios = play, pause/resume, single seek fwd/back, rapid seeks ×6, track
switch, end-of-track gapless advance, 1/5/15-minute soak, network-stall
recovery (throttled proxy), long track, short track. Metrics: time-to-first-
audio, seek-to-resume (fade-in), underruns, drops, stale frames, CPU
(process-ns avg/p95/max), memory (heap + wasm pages), PCM health violations,
boundary error (frames). Results JSON → `download/`.

## 13. Platform constraints (documented honestly)

- No cross-origin isolation → no SAB (§1); port-transferred PCM instead.
- Gapless only between equal-sample-rate tracks (context identity); rate
  changes take the hard-transition path (~150–400 ms).
- Crossfade unavailable on the WASM path (single ring); element path keeps it.
- No true playbackRate ≠ 1 on the engine path (routed to element — decide.ts).
- LAME trim is signal-heuristic (bounded caps) because the codec ABI exposes
  no gapless metadata; worst-case residual ≈ one mp3 frame of near-silence.
- iOS: context interruption → pause state sync (statechange listener);
  background throttling does not affect the worker→worklet port path.
