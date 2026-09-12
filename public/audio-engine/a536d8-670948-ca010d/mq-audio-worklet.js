/**
 * MQ Audio Engine v2 — AudioWorklet processor (realtime DSP).
 *
 * v2 architecture (audio-engine/docs/engine-v2-architecture.md):
 *  - ONE persistent engine per AudioContext session. The wasm module is
 *    compiled HERE once (raw bytes transfer — Module clone into the worklet
 *    context is unreliable on Chrome); the engine instance, DSP state and
 *    volume SURVIVE track changes (flush+generation, not node recreation).
 *  - PCM path: Decode Worker ──[MessagePort, transferred Float32Array]──▶
 *    planar ring write (wasm memory) → process() pops → Rust DSP → output.
 *  - Track boundaries arrive as "trackStart" messages on the SAME port
 *    (MessagePort FIFO ⇒ boundary order == PCM order). The worklet maps
 *    them into the engine playhead coordinate space and emits "trackEnded"
 *    when the playhead crosses — the UI advance for gapless playback.
 *  - Seek/lifecycle: generation-guarded FLUSH/SEEK (from the main thread,
 *    in that order) reset the ring, credit space and boundary map
 *    atomically. Stale-generation PCM is dropped BEFORE touching the ring.
 *  - Rate guard: PCM messages carry their source sample rate; anything
 *    that does not match THIS context's rate is dropped and reported —
 *    wrong-rate audio can never be played (context is rate-locked).
 *  - Realtime hygiene: steady-state process() performs no allocation; the
 *    DSP-timing window is a pre-allocated ring; percentiles are computed on
 *    the MAIN thread from 10 Hz samples; stats posts are time-throttled.
 *
 * Transport/controls: numeric opcodes via mq_cmd() — never JSON in the
 * realtime path. Plain ES2019, AudioWorkletGlobalScope, no bundler.
 */
/* eslint-disable */

const nowMs = () =>
  (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();

const OP = {
  PLAY: 1, PAUSE: 2, STOP: 3, SEEK: 4, FLUSH: 5,
  SET_VOLUME: 10, SET_PAN: 11,
};

const RING_FRAMES = 32768;      // ~0.74 s at 44.1 kHz — underrun safety vs latency
const OUT_SCRATCH_BYTES = 2048; // 2 lanes × 256 frames × f32
const STATS_FLOATS = 16;
const STATS_POST_INTERVAL = 0.1; // s of context time — ~10 posts/s

// Worklet-side engine state (numeric, published in stats; the BACKEND owns
// the authoritative lifecycle machine — this is the realtime view of it).
const ST = {
  IDLE: 0, LOADING: 1, PLAYING: 2, PAUSED: 3, STARVED: 4, ENDED: 5, SEEKING: 6,
};

// DSP timing window — fixed pre-allocated ring (no push/shift/sort on the RT
// thread; the main thread keeps its own 10 Hz sample window for percentiles).
const PROC_WIN = 256;

class MqAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ready = false;
    this.handle = -1;
    this.mem = null;
    this.exports = null;
    this.pcmPort = null;
    this.outPtr = 0;
    this.statsPtr = 0;
    this.outView0 = null;
    this.outView1 = null;
    this.statsView = null;
    this.lastStatsTime = -1;
    this.endedSent = false;
    this.seenPcm = false;
    this.destroyed = false;

    // DSP timing (µs-resolution from JS; wasm32 has no Instant).
    this.procWin = new Float64Array(PROC_WIN);
    this.procWinIdx = 0;
    this.procWinCount = 0;
    this.procNsAvg = 0;
    this.procNsMax = 0;
    this.procNsLast = 0;

    // Transport mirror (RT view of the engine's playing flag).
    this.playing = false;
    this.seekFlag = false;

    // Flow diagnostics (§35.18).
    this.pcmIn = 0;
    this.pcmInFrames = 0;
    this.creditOut = 0;
    this.pcmDropped = 0;
    this.gen = 0;           // expected generation (set by the main thread)
    this.pcmStale = 0;      // stale frames dropped BEFORE writing
    this.rateMismatchSent = false;

    // Flow control — cumulative sliding window (Phase F §C):
    // Invariant: buffered + (grantedTotal − arrivedTotal) ≤ capacity.
    this.grantedTotal = 0;
    this.arrivedTotal = 0;

    // Rolling event log (bounded; PCM/credit cadence, not per-block).
    this.evLog = [];
    this.ev = (kind, n) => {
      if (this.evLog.length > 200) this.evLog.shift();
      this.evLog.push([Math.round(currentTime * 1000), kind, n]);
    };

    // ── v2 gapless boundary map ──
    // boundaries[i] = { trackId, abs } in the ENGINE playhead coordinate
    // space. After a SEEK(base) the worker's sent-space starts at 0, so
    // abs = playheadBase + cumSent. Credit gating guarantees arrival order
    // == play order (no drops), so crossing detection is frame-exact.
    this.boundaries = [];
    this.trackIdx = 0;
    this.playheadBase = 0;

    this.port.onmessage = (ev) => this.onMainMessage(ev.data);
    this.port.onmessageerror = () => {
      this.port.postMessage({ type: 'error', stage: 'worklet-port', message: 'messageerror' });
    };
  }

  // ── messages from the MAIN thread (control plane) ──
  async onMainMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    try {
      switch (msg.type) {
        case 'init': {
          const { wasmBytes, pcmPort, channels, ringFrames } = msg;
          this.pcmPort = pcmPort;
          if (pcmPort) pcmPort.onmessage = (ev) => this.onPortData(ev.data);

          const { instance } = await WebAssembly.instantiate(wasmBytes, {});
          this.exports = instance.exports;
          this.mem = this.exports.memory;

          const h = this.exports.mq_engine_new(
            sampleRate, channels || 2, 1 /* Stream */, ringFrames || RING_FRAMES
          );
          if (h < 0) {
            this.port.postMessage({ type: 'error', stage: 'engine-new', code: h });
            return;
          }
          this.handle = h;

          // Scratch layout (allocated AFTER engine_new → views stay valid):
          //   [0, 2048)  process() output lanes (2 × 256 frames)
          //   [2048, 2112) stats block (16 f32)
          const base = this.exports.mq_scratch_ptr(OUT_SCRATCH_BYTES + STATS_FLOATS * 4);
          this.outPtr = base;
          this.statsPtr = base + OUT_SCRATCH_BYTES;
          this.outView0 = new Float32Array(this.mem.buffer, this.outPtr, 256);
          this.outView1 = new Float32Array(this.mem.buffer, this.outPtr + 1024, 256);
          this.statsView = new Float32Array(this.mem.buffer, this.statsPtr, STATS_FLOATS);

          this.ready = true;
          this.port.postMessage({
            type: 'ready',
            handle: h,
            abiVersion: this.exports.mq_abi_version(),
            version: this.exports.mq_version(),
            simd: this.exports.mq_has_simd() === 1,
            ringCapacity: this.exports.mq_ring_capacity(h),
            contextSampleRate: sampleRate,
          });
          this.postCredit();
          break;
        }
        case 'cmd': {
          if (!this.ready) return;
          // Generation advances BEFORE the command runs: any PCM arriving
          // after a FLUSH/SEEK/STOP must carry the new generation or be
          // dropped as stale (the ring was just reset for new content).
          if (typeof msg.gen === 'number' && msg.gen > this.gen) this.gen = msg.gen | 0;
          const rc = this.exports.mq_cmd(this.handle, msg.opcode | 0, +msg.a || 0, +msg.b || 0, +msg.c || 0);
          if (msg.opcode === OP.SEEK || msg.opcode === OP.FLUSH || msg.opcode === OP.STOP) {
            this.endedSent = false;
            this.seenPcm = false;
            this.grantedTotal = 0;
            this.arrivedTotal = 0;
            this.trackIdx = 0;
            this.rateMismatchSent = false;
            if (msg.opcode === OP.SEEK) {
              // Engine playhead is CONTINUOUS across flushes (Rust Flush
              // never resets it; SeekFrames sets it).
              //  - Fresh-track load (SEEK carries trackId): seed the new
              //    track's boundary at the playhead target (offset = 0).
              //  - Mid-track seek (no trackId): KEEP the current track's
              //    boundary (where its offset = 0) — the reported
              //    trackOffsetFrames stays absolute-in-track after the
              //    jump. Only future (continuation) boundaries drop.
              this.playheadBase = Math.max(0, +msg.a || 0);
              if (typeof msg.trackId === 'string') {
                this.boundaries = [{ trackId: msg.trackId, abs: this.playheadBase }];
              } else {
                const cur = this.boundaries[this.boundaries.length - 1] || { trackId: null, abs: this.playheadBase };
                this.boundaries = [cur];
              }
              this.trackIdx = 0;
              this.seekFlag = true;
            } else if (msg.opcode === OP.FLUSH) {
              // FLUSH discards ring DATA, not the track identity: keep the
              // current track's boundary (the SEEK that follows relies on
              // it), drop only future (continuation) boundaries.
              const cur = this.boundaries[this.boundaries.length - 1] || null;
              this.boundaries = cur ? [cur] : [];
            } else {
              this.boundaries = [];
            }
            this.postCredit();
          }
          if (msg.opcode === OP.PLAY) { this.playing = true; this.endedSent = false; }
          if (msg.opcode === OP.PAUSE) this.playing = false;
          if (msg.opcode === OP.STOP) this.playing = false;
          if (rc !== 0 && msg.opcode !== undefined) {
            /* -4 = queue full: the engine retries on the next block; benign */
          }
          break;
        }
        case 'eof': {
          if (!this.ready) return;
          this.exports.mq_set_eof(this.handle, msg.value ? 1 : 0);
          break;
        }
        case 'destroy': {
          this.destroyInternal();
          break;
        }
      }
    } catch (e) {
      this.port.postMessage({ type: 'error', stage: 'worklet-message', message: String(e && e.message || e) });
    }
  }

  destroyInternal() {
    if (this.destroyed) return;
    this.destroyed = true;
    try { if (this.ready && this.exports) this.exports.mq_engine_drop(this.handle); } catch (e) {}
    try { if (this.pcmPort) this.pcmPort.close(); } catch (e) {}
    this.ready = false;
  }

  // ── data plane: PCM + boundary control from the Decode Worker ──
  onPortData(msg) {
    if (!this.ready || !msg || typeof msg !== 'object') return;
    try {
      if (msg.type === 'trackStart') {
        // Boundary marker — FIFO-ordered with the PCM that follows it.
        if (typeof msg.gen === 'number' && (msg.gen | 0) !== this.gen) return; // stale
        const abs = this.playheadBase + (msg.cumSent | 0);
        const trackId = typeof msg.trackId === 'string' ? msg.trackId : null;
        // Coalesce duplicates defensively (worker contract: exactly once).
        const last = this.boundaries[this.boundaries.length - 1];
        if (!last || last.abs !== abs) {
          this.boundaries.push({ trackId: trackId, abs: abs });
          this.ev('bnd', abs);
        }
        return;
      }
      if (msg.type !== 'pcm' || !msg.ch0) return;
      // Seek-race guard: frames popped under a dead generation are dropped
      // BEFORE touching the ring (they would otherwise be written into the
      // freshly flushed buffer and play as stale audio + a discontinuity).
      if (typeof msg.gen === 'number' && (msg.gen | 0) !== this.gen) {
        this.pcmStale += msg.frames | 0;
        this.ev('stale', msg.frames | 0);
        return;
      }
      // Rate guard (v2): the context is rate-locked; wrong-rate PCM must
      // never reach the engine (it would play pitch-shifted).
      if (msg.rate && (msg.rate | 0) !== (sampleRate | 0)) {
        if (!this.rateMismatchSent) {
          this.rateMismatchSent = true;
          this.port.postMessage({ type: 'rateMismatch', got: msg.rate | 0, expected: sampleRate | 0, gen: this.gen });
        }
        this.pcmDropped += msg.frames | 0;
        return;
      }
      this.onPcm(msg);
    } catch (e) {
      this.port.postMessage({ type: 'error', stage: 'worklet-port-data', message: String(e && e.message || e) });
    }
  }

  onPcm(msg) {
    this.pcmIn++;
    const frames = msg.frames | 0;
    if (frames <= 0) return;
    this.arrivedTotal += frames;
    this.ev('pcm', frames);
    const avail = this.exports.mq_ring_write_available(this.handle);
    const n = Math.min(frames, avail);
    if (n <= 0) {
      // Ring full — the worker's credit gating should prevent this.
      // Frames are dropped and counted by the engine's overrun stat.
      // (Boundary math depends on no-drops; flag the invariant break.)
      if (this.boundaries.length > 1) {
        this.port.postMessage({ type: 'error', stage: 'worklet-overrun', message: 'ring overrun with active boundaries — gapless map invalidated' });
        this.boundaries = [this.boundaries[this.trackIdx] || { trackId: null, abs: this.playheadBase }];
        this.trackIdx = 0;
      }
      this.pcmDropped += frames;
      return;
    }
    this.pcmInFrames += n;
    const cap = this.exports.mq_ring_capacity(this.handle);
    // ABI v3: offsets are ABSOLUTE (f32 elements into linear memory).
    const off0 = this.exports.mq_ring_write_offset(this.handle, 0);
    const off1 = this.exports.mq_ring_write_offset(this.handle, 1);
    const base0 = this.exports.mq_ring_lane_base(this.handle, 0);
    const base1 = this.exports.mq_ring_lane_base(this.handle, 1);
    this.writeLane(off0, base0, cap, msg.ch0, n);
    this.writeLane(off1, base1, cap, msg.ch1, n);
    this.exports.mq_ring_commit_write(this.handle, n);
    this.seenPcm = true;
    this.endedSent = false;
    if (this.seekFlag) this.seekFlag = false;
  }

  /** Wrap-aware planar lane write. off/base = ABSOLUTE f32 element offsets. */
  writeLane(off, laneBase, cap, src, n) {
    const pos = off - laneBase;
    const first = Math.min(n, cap - pos);
    const v1 = new Float32Array(this.mem.buffer, off * 4, first);
    v1.set(src.subarray(0, first));
    if (n > first) {
      const v2 = new Float32Array(this.mem.buffer, laneBase * 4, n - first);
      v2.set(src.subarray(first, n));
    }
  }

  /** Tell the worker its cumulative send allowance (sliding window). */
  postCredit() {
    if (!this.pcmPort || !this.ready) return;
    try {
      const avail = this.exports.mq_ring_write_available(this.handle);
      const target = this.arrivedTotal + avail;
      if (target > this.grantedTotal) this.grantedTotal = target;
      this.ev('grant', this.grantedTotal);
      this.creditOut++;
      this.pcmPort.postMessage({ type: 'credit', total: this.grantedTotal, gen: this.gen });
    } catch (e) {}
  }

  /** Publish stats — the stats block is refreshed per block (cheap memcpy),
   *  posted at 10 Hz. Boundary crossing is checked per block for frame-exact
   *  trackEnded events (gapless advance). */
  publishStats() {
    this.exports.mq_stats(this.handle, this.statsPtr);
    const s = this.statsView;
    const playhead = s[0];
    const b = this.boundaries;
    let idx = this.trackIdx;
    // Advance across every boundary the playhead has passed (each event
    // carries the PREVIOUS track + the track that starts at the boundary).
    while (idx + 1 < b.length && playhead >= b[idx + 1].abs) {
      const prev = b[idx];
      const started = b[idx + 1];
      idx++;
      this.port.postMessage({
        type: 'trackEnded',
        index: idx - 1,
        trackId: prev.trackId,
        nextTrackId: started.trackId,
        playheadFrames: playhead,
      });
    }
    this.trackIdx = idx;
    const cur = b[idx] || { trackId: null, abs: this.playheadBase };
    const offsetFrames = Math.max(0, playhead - cur.abs);
    const drained = this.exports.mq_is_drained(this.handle) === 1;
    if (drained && !this.endedSent) {
      this.endedSent = true;
      this.seenPcm = false;
      this.playing = false;
      this.port.postMessage({ type: 'ended', playheadFrames: playhead });
    }
    // RT state view (the backend owns the authoritative machine).
    let state = ST.IDLE;
    if (this.endedSent) state = ST.ENDED;
    else if (!this.seenPcm) state = this.seekFlag ? ST.SEEKING : ST.LOADING;
    else if (!this.playing) state = ST.PAUSED;
    else if (s[1] <= 0) state = ST.STARVED;
    else state = ST.PLAYING;
    this.port.postMessage({
      type: 'stats',
      playheadFrames: playhead,
      trackOffsetFrames: offsetFrames,
      trackIndex: idx,
      trackId: cur.trackId,
      engineState: state,
      bufferedFrames: s[1],
      underruns: s[2],
      overruns: s[3],
      blocksProcessed: s[4],
      avgProcessNs: this.procNsAvg,
      maxProcessNs: this.procNsMax,
      lastProcessNs: this.procNsLast,
      peak: s[8],
      rms: s[9],
      lufsShort: s[10],
      lufsIntegrated: s[11],
      gainReductionDb: s[12],
      truePeakDb: s[13],
      _flow: {
        pcmIn: this.pcmIn, pcmInFrames: this.pcmInFrames, creditOut: this.creditOut,
        pcmDropped: this.pcmDropped, pcmStale: this.pcmStale, gen: this.gen,
        granted: this.grantedTotal, arrived: this.arrivedTotal,
        boundaries: b.length, trackIdx: idx,
        evLog: this.evLog.slice(-200),
      },
    });
    this.postCredit();
  }

  // ── realtime hot path ──
  process(_inputs, outputs) {
    const out = outputs[0];
    const ch0 = out && out[0];
    const ch1 = out && out[1];
    const frames = ch0 ? ch0.length : 0;
    if (frames === 0) return true;

    if (!this.ready || !this.exports) {
      if (ch0) ch0.fill(0);
      if (ch1) ch1.fill(0);
      return true;
    }

    try {
      // DSP into wasm-memory output lanes, then copy to the worklet buffers.
      const t0 = nowMs();
      this.exports.mq_process_out(this.handle, this.outPtr, this.outPtr + 1024, frames);
      const dtNs = (nowMs() - t0) * 1e6;
      this.procWin[this.procWinIdx] = dtNs;
      this.procWinIdx = (this.procWinIdx + 1) % PROC_WIN;
      if (this.procWinCount < PROC_WIN) this.procWinCount++;
      this.procNsCountTotal = (this.procNsCountTotal || 0) + 1;
      this.procNsAvg += (dtNs - this.procNsAvg) / Math.min(this.procNsCountTotal, 1024);
      if (dtNs > this.procNsMax) this.procNsMax = dtNs;
      this.procNsLast = dtNs;
      ch0.set(this.outView0.subarray(0, frames));
      if (ch1) ch1.set(this.outView1.subarray(0, frames));

      // Stats + boundary checks + worker credit — time-throttled (never
      // per-block message chatter; the stats block itself is cheap).
      if (currentTime - this.lastStatsTime >= STATS_POST_INTERVAL) {
        this.lastStatsTime = currentTime;
        this.publishStats();
      }
    } catch (e) {
      if (ch0) ch0.fill(0);
      if (ch1) ch1.fill(0);
      // A trap inside process() is fatal for the engine — report once.
      this.port.postMessage({ type: 'error', stage: 'worklet-process', message: String(e && e.message || e) });
      this.ready = false;
    }
    return true;
  }
}

registerProcessor('mq-audio-processor', MqAudioProcessor);
