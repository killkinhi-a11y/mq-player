/**
 * MQ Audio Engine — AudioWorklet processor (realtime DSP).
 *
 * Loaded via audioWorklet.addModule('/audio-engine/<tag>/mq-audio-worklet.js').
 * The main thread hands us:
 *   - the raw audio_wasm BYTES (compiled inside the worklet — passing a
 *     WebAssembly.Module across the worklet port throws messageerror on
 *     Chrome; raw ArrayBuffer transfer + in-scope compile is the portable path),
 *   - a MessagePort connected directly to the Decode Worker.
 *
 * PCM path (stream mode):
 *   Decode Worker ──[MessagePort, Transferable Float32Array]──▶ this worklet
 *   ▶ planar write into the Rust ring lanes (wasm linear memory)
 *   ▶ process() pops from ring → Rust DSP → output channels
 *
 * Transport/controls: numeric opcodes via mq_cmd() — never JSON in the
 * realtime path. Stats are published to the main thread ~10 Hz.
 *
 * This file is plain ES2019 (no imports, no bundler) — it runs in the
 * AudioWorkletGlobalScope on every target browser.
 */
/* eslint-disable */

// AudioWorkletGlobalScope in some engines (older/headless Chrome) lacks
// `performance` — fall back to Date.now (ms resolution: coarse avg only).
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
    // Flow diagnostics (§35.18)
    this.pcmIn = 0;
    this.pcmInFrames = 0;
    this.creditOut = 0;
    this.pcmDropped = 0;
    // DSP timing (§35.19): wasm32 has no Instant — measure the export call
    // from JS with performance.now() (same thread, µs resolution).
    this.procNsWindow = [];
    this.procNsCount = 0;
    this.procNsAvg = 0;
    this.procNsMax = 0;
    this.procNsLast = 0;

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
          if (pcmPort) pcmPort.onmessage = (ev) => this.onPcm(ev.data);

          // Raw bytes: WebAssembly.Module is not reliably cloneable into the
          // AudioWorklet context — compile here instead.
          // instantiate(bytes) resolves to { module, instance }.
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

          // Scratch layout (allocated AFTER engine_new → all big allocations
          // done; views created now stay valid — nothing grows post-init):
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
          const rc = this.exports.mq_cmd(this.handle, msg.opcode | 0, +msg.a || 0, +msg.b || 0, +msg.c || 0);
          // Flush/Seek/Stop reset the ring → worker credit changes immediately
          if (msg.opcode === OP.SEEK || msg.opcode === OP.FLUSH || msg.opcode === OP.STOP) {
            this.endedSent = false;
            this.postCredit();
          }
          if (msg.opcode === OP.PLAY) this.endedSent = false;
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

  // ── PCM from the Decode Worker (data plane, transferred buffers) ──
  onPcm(msg) {
    if (!this.ready || !msg || msg.type !== 'pcm' || !msg.ch0) return;
    this.pcmIn++;
    const frames = msg.frames | 0;
    if (frames <= 0) return;
    try {
      const avail = this.exports.mq_ring_write_available(this.handle);
      const n = Math.min(frames, avail);
      if (n <= 0) {
        // Ring full — the worker's credit gating should prevent this.
        // Frames are dropped and counted by the engine's overrun stat.
        this.pcmDropped += frames;
        return;
      }
      this.pcmInFrames += n;
      const cap = this.exports.mq_ring_capacity(this.handle);
      // ABI v3: offsets are ABSOLUTE (f32 elements into linear memory),
      // and each lane's start comes from mq_ring_lane_base — the old code
      // derived the base as (off % cap), which only worked if the ring
      // happened to live at memory 0 (it does not — the Vec sits ~1 MB into
      // the heap, so decoded PCM was written into the wrong memory and the
      // engine played silence).
      const off0 = this.exports.mq_ring_write_offset(this.handle, 0);
      const off1 = this.exports.mq_ring_write_offset(this.handle, 1);
      const base0 = this.exports.mq_ring_lane_base(this.handle, 0);
      const base1 = this.exports.mq_ring_lane_base(this.handle, 1);
      this.writeLane(off0, base0, cap, msg.ch0, n);
      this.writeLane(off1, base1, cap, msg.ch1, n);
      this.exports.mq_ring_commit_write(this.handle, n);
      this.seenPcm = true;
      this.endedSent = false;
    } catch (e) {
      this.port.postMessage({ type: 'error', stage: 'worklet-pcm', message: String(e && e.message || e) });
    }
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

  /** Tell the worker how many ring frames it may send (flow control). */
  postCredit() {
    if (!this.pcmPort || !this.ready) return;
    try {
      this.creditOut++;
      this.pcmPort.postMessage({ type: 'credit', frames: this.exports.mq_ring_write_available(this.handle) });
    } catch (e) {}
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
      this.procNsCount++;
      this.procNsAvg += (dtNs - this.procNsAvg) / Math.min(this.procNsCount, 256);
      if (dtNs > this.procNsMax) this.procNsMax = dtNs;
      this.procNsLast = dtNs;
      this.procNsWindow.push(dtNs);
      if (this.procNsWindow.length > 300) this.procNsWindow.shift();
      ch0.set(this.outView0.subarray(0, frames));
      if (ch1) ch1.set(this.outView1.subarray(0, frames));

      // Track end: ring drained + EOF set.
      if (this.exports.mq_is_drained(this.handle) === 1 && !this.endedSent) {
        this.endedSent = true;
        this.seenPcm = false;
        this.port.postMessage({ type: 'ended' });
      }

      // Stats + worker credit — time-throttled (never per-block chatter).
      if (currentTime - this.lastStatsTime >= STATS_POST_INTERVAL) {
        this.lastStatsTime = currentTime;
        this.exports.mq_stats(this.handle, this.statsPtr);
        const s = this.statsView;
        this.port.postMessage({
          type: 'stats',
          playheadFrames: s[0],
          bufferedFrames: s[1],
          underruns: s[2],
          overruns: s[3],
          blocksProcessed: s[4],
          avgProcessNs: this.procNsAvg,
          maxProcessNs: this.procNsMax,
          lastProcessNs: this.procNsLast,
          _p95ProcessNs: (() => {
            const w = this.procNsWindow;
            if (w.length < 20) return 0;
            const sorted = [...w].sort((a, b) => a - b);
            return sorted[Math.floor(sorted.length * 0.95)];
          })(),
          peak: s[8],
          rms: s[9],
          lufsShort: s[10],
          lufsIntegrated: s[11],
          gainReductionDb: s[12],
          truePeakDb: s[13],
          _flow: { pcmIn: this.pcmIn, pcmInFrames: this.pcmInFrames, creditOut: this.creditOut, pcmDropped: this.pcmDropped },
        });
        this.postCredit();
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
