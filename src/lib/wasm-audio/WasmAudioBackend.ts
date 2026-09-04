/**
 * WasmAudioBackend — orchestrates the Rust/WASM playback pipeline:
 *
 *   fetch (worker, Range) → Symphonia decode (codec_wasm) → MessagePort
 *   → planar ring (worklet) → Rust DSP (audio_wasm) → AudioContext.destination
 *
 * Design invariants:
 *  - ONE active backend at a time; a module-level singleton worker + compiled
 *    wasm modules are shared across loads.
 *  - AudioContext is created at the CONTENT's sample rate (cached per rate)
 *    → no resampling compromise; mismatch construction failures fall back
 *    to the element path (§35.22).
 *  - Any failure at ANY stage calls onFatal → the caller falls back to the
 *    existing HTMLMediaElement path. The player never dies (§35.22).
 *  - version.json is the single source of asset URLs (§35.10); the runtime
 *    ABI check (§35.9) refuses mismatched JS/WASM pairs.
 *  - Transport/controls are numeric opcodes (never JSON in the realtime path).
 */
import type { AudioEngineManifest, WasmEngineStats } from "./types";
import { EXPECTED_WASM_ABI } from "./types";
import { fetchAudioEngineManifest, assetUrl } from "./manifest";
import { markDiag, pushProcessNsSample, resetDiagTrackCounters, wasmDiagnostics } from "./diagnostics";
import { setActiveAnalyser, getAudioElement } from "@/lib/audioEngine";

// Opcodes (audio-core command.rs) — full surface: transport + DSP.
export const OP = {
  // transport
  PLAY: 1, PAUSE: 2, STOP: 3, SEEK: 4, FLUSH: 5,
  // gain / pan
  SET_VOLUME: 10, SET_PAN: 11,
  // EQ (a = band index, b = gain dB)
  SET_EQ_ENABLED: 20, SET_EQ_BAND: 21, SET_EQ_ALL_BANDS: 22, SET_EQ_LINEAR_PHASE: 23,
  // dynamics
  SET_COMPRESSOR_ENABLED: 30, SET_COMPRESSOR_PARAM: 31,
  SET_LIMITER_ENABLED: 32, SET_LIMITER_PARAM: 33,
  SET_GATE_ENABLED: 34, SET_GATE_PARAM: 35,
  // spatial
  SET_REVERB_ENABLED: 40, SET_REVERB_PARAM: 41,
  SET_ER_ENABLED: 42, SET_BINAURAL_ENABLED: 43,
  SET_WIDTH: 45,
  // misc
  SET_QUALITY_MODE: 80, SET_BYPASS_ALL: 81,
} as const;

// Param selectors (command.rs `param` module) for SET_*_PARAM opcodes.
export const PARAM = {
  // limiter
  LP_CEILING: 0, LP_RELEASE: 1, LP_LOOKAHEAD: 2,
  // reverb
  RP_MIX: 0, RP_RT60: 1,
  // compressor
  CP_THRESHOLD: 0, CP_RATIO: 1, CP_ATTACK: 2, CP_RELEASE: 3, CP_KNEE: 4, CP_MAKEUP: 5,
} as const;

const RING_FRAMES = 32768;
const LOAD_DEADLINE_MS = 9000; // must resolve before the hook's 10s timeout
const MAX_CONTEXTS = 3;

export interface WasmLoadOptions {
  url: string;
  durationSec: number;
  autoplay: boolean;
  trackId: string;
}

export interface WasmBackendCallbacks {
  /** ~10 Hz progress updates (seconds). */
  onProgress?: (positionSec: number, durationSec: number, stats: WasmEngineStats) => void;
  /** Track finished (ring drained + EOF). */
  onEnded?: () => void;
  /** First audio frames processed → loading → playing transition. */
  onPlaying?: () => void;
  /** Fatal error — caller MUST fall back to the element path. */
  onFatal?: (reason: string, positionSec?: number) => void;
}

// ── module-level singletons (compiled once per page) ──
let manifest: AudioEngineManifest | null = null;
let coreBytes: ArrayBuffer | null = null; // raw bytes → compiled INSIDE the worklet (module clone to worklet ports is unreliable)
let codecModule: WebAssembly.Module | null = null;
let worker: Worker | null = null;
let engineReady: Promise<void> | null = null;
let wasmUnsupported = false;
const ctxCache = new Map<number, AudioContext>();
const ctxAnalyser = new Map<number, AnalyserNode>();
const ctxModuleLoaded = new Set<AudioContext>();
let activeBackend: WasmAudioBackend | null = null;

// ── DSP state snapshot (module level: survives track changes) ──
// The UI routes every DSP change through the apply* helpers below; they both
// send commands to the ACTIVE engine and record the desired state here so
// each NEW engine (fresh worklet node per track) starts with the same
// EQ/spatial/limiter settings instead of resetting to flat.
export interface DspSnapshot {
  eqEnabled: boolean;
  eqBands: number[]; // 10 gains, dB
  limiterEnabled: boolean;
  limiterCeilingDb: number;
  width: number; // 0..3 (1 = neutral)
  reverbMix: number; // 0..1
}
const dspSnapshot: DspSnapshot = {
  eqEnabled: false,
  eqBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  limiterEnabled: false,
  limiterCeilingDb: -1,
  width: 1,
  reverbMix: 0,
};

/** Send a raw numeric command to the active engine (no state recording). */
export function sendDspCommand(op: number, a = 0, b = 0, c = 0): void {
  activeBackend?.sendDsp(op, a, b, c);
}

/** Replay the recorded DSP state into the given (fresh) backend. */
function replayDspState(backend: WasmAudioBackend): void {
  backend.sendDsp(OP.SET_EQ_ENABLED, dspSnapshot.eqEnabled ? 1 : 0);
  dspSnapshot.eqBands.forEach((gain, i) => {
    if (gain !== 0) backend.sendDsp(OP.SET_EQ_BAND, i, gain);
  });
  backend.sendDsp(OP.SET_LIMITER_ENABLED, dspSnapshot.limiterEnabled ? 1 : 0);
  if (dspSnapshot.limiterEnabled) {
    backend.sendDsp(OP.SET_LIMITER_PARAM, 0, PARAM.LP_CEILING, dspSnapshot.limiterCeilingDb);
  }
  backend.sendDsp(OP.SET_WIDTH, dspSnapshot.width);
  backend.sendDsp(OP.SET_REVERB_ENABLED, dspSnapshot.reverbMix > 0 ? 1 : 0);
  if (dspSnapshot.reverbMix > 0) {
    backend.sendDsp(OP.SET_REVERB_PARAM, 0, PARAM.RP_MIX, dspSnapshot.reverbMix);
  }
}

/** EQ → Rust graphic EQ (records + routes). bands: 10 gains in dB. */
export function applyEqToWasm(enabled: boolean, bands: number[]): void {
  dspSnapshot.eqEnabled = enabled;
  dspSnapshot.eqBands = bands.slice(0, 10);
  if (!activeBackend) return;
  activeBackend.sendDsp(OP.SET_EQ_ENABLED, enabled ? 1 : 0);
  bands.forEach((gain, i) => activeBackend?.sendDsp(OP.SET_EQ_BAND, i, gain));
}

/** Limiter → Rust look-ahead limiter (records + routes). */
export function applyLimiterToWasm(enabled: boolean, ceilingDb: number): void {
  dspSnapshot.limiterEnabled = enabled;
  dspSnapshot.limiterCeilingDb = ceilingDb;
  if (!activeBackend) return;
  activeBackend.sendDsp(OP.SET_LIMITER_ENABLED, enabled ? 1 : 0);
  if (enabled) {
    activeBackend.sendDsp(OP.SET_LIMITER_PARAM, 0, PARAM.LP_CEILING, ceilingDb);
  }
}

/** Spatial → Rust stereo width (+ optional reverb mix) (records + routes). */
export function applySpatialToWasm(width: number, reverbMix = 0): void {
  dspSnapshot.width = Math.max(0, Math.min(3, width));
  dspSnapshot.reverbMix = Math.max(0, Math.min(1, reverbMix));
  if (!activeBackend) return;
  activeBackend.sendDsp(OP.SET_WIDTH, dspSnapshot.width);
  activeBackend.sendDsp(OP.SET_REVERB_ENABLED, dspSnapshot.reverbMix > 0 ? 1 : 0);
  if (dspSnapshot.reverbMix > 0) {
    activeBackend.sendDsp(OP.SET_REVERB_PARAM, 0, PARAM.RP_MIX, dspSnapshot.reverbMix);
  }
}

function browserGlobals(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof AudioContext !== "undefined" &&
    typeof AudioWorkletNode !== "undefined" &&
    typeof WebAssembly !== "undefined" &&
    typeof Worker !== "undefined"
  );
}

/** Get (or create) a context running exactly at the content's rate. */
function contextForRate(rate: number): AudioContext | null {
  if (!rate || !isFinite(rate) || rate < 8000 || rate > 96000) return null;
  const hit = ctxCache.get(rate);
  if (hit) {
    if (hit.state === "closed") ctxCache.delete(rate);
    else return hit;
  }
  if (ctxCache.size >= MAX_CONTEXTS) return null;
  try {
    const ctx = new AudioContext({ sampleRate: rate, latencyHint: "playback" });
    ctxCache.set(rate, ctx);
    return ctx;
  } catch {
    // Constructor with explicit rate unsupported/failed → element path.
    return null;
  }
}

function analyserFor(ctx: AudioContext): AnalyserNode {
  const hit = ctxAnalyser.get(ctx.sampleRate);
  if (hit) return hit;
  const a = ctx.createAnalyser();
  a.fftSize = 2048;
  a.smoothingTimeConstant = 0.75;
  a.connect(ctx.destination);
  ctxAnalyser.set(ctx.sampleRate, a);
  return a;
}

async function ensureWorkletModule(ctx: AudioContext, url: string): Promise<void> {
  if (ctxModuleLoaded.has(ctx)) return;
  await ctx.audioWorklet.addModule(url);
  ctxModuleLoaded.add(ctx);
}

function killSwitch(reason: string): void {
  wasmUnsupported = true;
  markDiag({ lastError: reason });
  console.warn(`[WasmAudio] disabled for this session: ${reason}`);
}

export class WasmAudioBackend {
  node: AudioWorkletNode | null = null;
  channel: MessageChannel | null = null;
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;

  currentUrl = "";
  currentDuration = 0;
  currentTrackId = "";
  totalBytes = 0;
  supportsRange = false;
  contentRate = 0;
  channels = 2;
  volume = 1;
  playing = false;

  stats: WasmEngineStats | null = null;
  private playingEmitted = false;
  // Seek-race guard (Phase F §A): bumped on every seek, sent with the
  // worklet FLUSH/SEEK commands AND the worker 'seek' message. The worklet
  // drops any PCM whose generation ≠ the expected one, so stale in-flight
  // chunks can never land in the freshly flushed ring.
  private pcmGen = 0;
  private disposed = false;
  private loading = false;

  cb: WasmBackendCallbacks = {};

  get active(): boolean {
    return !!this.node && !this.disposed;
  }

  // ── engine bootstrap (once per page) ──
  private static async ensureEngine(): Promise<void> {
    if (engineReady) return engineReady;
    engineReady = (async () => {
      if (!browserGlobals() || wasmUnsupported) throw new Error("unsupported");
      manifest = await fetchAudioEngineManifest();
      const [core, codec] = await Promise.all([
        fetch(assetUrl(manifest, manifest.core)).then((r) => {
          if (!r.ok) throw new Error(`core HTTP ${r.status}`);
          return r.arrayBuffer();
        }),
        fetch(assetUrl(manifest, manifest.codec)).then((r) => {
          if (!r.ok) throw new Error(`codec HTTP ${r.status}`);
          return r.arrayBuffer();
        }),
      ]);
      coreBytes = core; // compiled inside the worklet — see init message
      codecModule = await WebAssembly.compile(codec);

      worker = new Worker(assetUrl(manifest, manifest.worker));
      const workerReady = new Promise<void>((resolve, reject) => {
        const to = setTimeout(() => reject(new Error("worker init timeout")), 5000);
        worker!.addEventListener("message", function onready(ev: MessageEvent) {
          const m = ev.data;
          if (m && m.type === "ready") {
            clearTimeout(to);
            if (m.abiVersion !== EXPECTED_WASM_ABI) {
              reject(new Error(`WASM_VERSION_MISMATCH(codec abi ${m.abiVersion} != ${EXPECTED_WASM_ABI})`));
              return;
            }
            worker!.removeEventListener("message", onready);
            resolve();
          } else if (m && m.type === "abi-mismatch") {
            clearTimeout(to);
            reject(new Error(`WASM_VERSION_MISMATCH(codec abi ${m.got} != ${m.expected})`));
          } else if (m && m.type === "error") {
            clearTimeout(to);
            reject(new Error(`worker: ${m.stage}: ${m.message}`));
          }
        });
        worker!.addEventListener("error", function onerr() {
          clearTimeout(to);
          reject(new Error("worker script failed to load"));
        });
      });
      // WebAssembly.Module is structured-CLONEABLE (not transferable) — no
      // transfer list here; the module is cloned into the worker.
      worker.postMessage({ type: "init", codecModule, expectedAbi: EXPECTED_WASM_ABI });
      await workerReady;
      worker.addEventListener("message", routeWorkerMessage);
      markDiag({ tag: manifest.tag, abiVersion: EXPECTED_WASM_ABI });
    })();
    engineReady.catch((e) => {
      engineReady = null;
      killSwitch(String(e && e.message ? e.message : e));
      throw e;
    });
    return engineReady;
  }

  // ── load a track ──
  async load(opts: WasmLoadOptions): Promise<void> {
    if (wasmUnsupported) throw new Error("unsupported");
    this.disposeNode();
    const deadline = Date.now() + LOAD_DEADLINE_MS;

    this.loading = true;
    this.currentUrl = opts.url;
    this.currentDuration = opts.durationSec;
    this.currentTrackId = opts.trackId;
    this.playingEmitted = false;
    this.stats = null;
    this.totalBytes = 0;
    this.supportsRange = false;
    setActiveBackendInstance(this);
    markDiag({ active: true, backend: "wasm", totalBytes: null, supportsRange: false, framesProcessed: 0, underruns: 0, overruns: 0, bufferLevel: 0, lastError: null });

    await WasmAudioBackend.ensureEngine();

    // 1) start the fetch+decode in the worker (gen 0 on a fresh backend —
    // the worklet node is also fresh, so both sides start aligned)
    worker!.postMessage({
      type: "load",
      url: opts.url,
      durationSec: opts.durationSec,
      autoplay: opts.autoplay,
      gen: this.pcmGen,
    });

    // 2) await stream info (headers + decoder start), bounded by the deadline
    const info = await this.awaitInfo(deadline);
    this.totalBytes = info.totalBytes;
    this.supportsRange = info.supportsRange;
    markDiag({ totalBytes: info.totalBytes || null, supportsRange: info.supportsRange });
    this.contentRate = info.sampleRate;
    this.channels = info.channels;
    markDiag({ contentSampleRate: info.sampleRate, channels: info.channels });

    // 3) context at the content's exact rate
    const ctx = contextForRate(info.sampleRate);
    if (!ctx) throw new Error(`no AudioContext for ${info.sampleRate}Hz`);
    this.ctx = ctx;
    this.analyser = analyserFor(ctx);
    // Debug handle (same pattern as window.__mqWasmAudio): lets automation
    // measure the LIVE post-DSP output (L/R meters) — state only, no logging.
    if (typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__mqAudioCtx = ctx;
      (window as unknown as Record<string, unknown>).__mqAudioAnalyser = this.analyser;
    }

    // 4) worklet node + engine + ABI check
    await ensureWorkletModule(ctx, assetUrl(manifest!, manifest!.worklet));
    this.channel = new MessageChannel();
    this.node = new AudioWorkletNode(ctx, "mq-audio-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.wireNode();
    const nodeReady = new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => {
        this.pendingReady = null;
        reject(new Error("worklet init timeout"));
      }, 5000);
      this.pendingReady = {
        resolve: (m: { abiVersion: number; simd: boolean }) => {
          clearTimeout(to);
          this.pendingReady = null;
          if (m.abiVersion !== EXPECTED_WASM_ABI) {
            reject(new Error(`WASM_VERSION_MISMATCH(core abi ${m.abiVersion} != ${EXPECTED_WASM_ABI})`));
            return;
          }
          markDiag({ abiVersion: m.abiVersion, simd: m.simd, contextSampleRate: ctx.sampleRate });
          resolve();
        },
        reject: (e) => { clearTimeout(to); this.pendingReady = null; reject(e); },
      };
    });
    // Transfer DETACHES the ArrayBuffer — send a fresh copy per load (the
    // module-level original stays intact for subsequent tracks).
    const wasmBytesForWorklet = coreBytes!.slice(0);
    this.node.port.postMessage(
      {
        type: "init",
        wasmBytes: wasmBytesForWorklet,
        pcmPort: this.channel.port2,
        channels: 2,
        ringFrames: RING_FRAMES,
      },
      // Transfer raw wasm bytes + the port (both ArrayBuffer-transferable).
      // NOTE: WebAssembly.Module is NOT reliably cloneable into the
      // AudioWorklet context (messageerror on Chrome) — bytes + in-worklet
      // compile is the portable path.
      [wasmBytesForWorklet, this.channel.port2]
    );
    await nodeReady;

    // 5) connect the worker's PCM directly to the worklet (data plane)
    worker!.postMessage({ type: "bindPort", pcmPort: this.channel.port1 }, [this.channel.port1]);

    // 6) graph + initial state
    this.node.connect(this.analyser);
    setActiveAnalyser(this.analyser);
    this.node.port.postMessage({ type: "cmd", opcode: OP.SET_VOLUME, a: this.volume });
    // Replay the user's DSP state (EQ / spatial / limiter) so a new track
    // does not silently reset the audio processing to flat.
    replayDspState(this);
    resetDiagTrackCounters();
    if (opts.autoplay) this.play();
    this.loading = false;
  }

  /** Send a DSP/transport command to THIS engine instance (numeric opcodes). */
  sendDsp(op: number, a = 0, b = 0, c = 0): void {
    if (!this.node || this.disposed) return;
    this.node.port.postMessage({ type: "cmd", opcode: op, a, b, c });
  }

  private pendingInfo: { resolve: (v: { sampleRate: number; channels: number; totalBytes: number; supportsRange: boolean }) => void; reject: (e: Error) => void } | null = null;
  private pendingReady: { resolve: (m: { abiVersion: number; simd: boolean }) => void; reject: (e: Error) => void } | null = null;

  private awaitInfo(deadline: number): Promise<{ sampleRate: number; channels: number; totalBytes: number; supportsRange: boolean }> {
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => {
        this.pendingInfo = null;
        reject(new Error("decoder start timeout"));
      }, Math.max(500, deadline - Date.now()));
      this.pendingInfo = {
        resolve: (v) => { clearTimeout(to); this.pendingInfo = null; resolve(v); },
        reject: (e) => { clearTimeout(to); this.pendingInfo = null; reject(e); },
      };
    });
  }

  private wireNode(): void {
    const node = this.node!;
    node.port.onmessage = (ev: MessageEvent) => this.onNodeMessage(ev.data);
    node.port.onmessageerror = () => this.fatal("node messageerror");
  }

  private onNodeMessage(m: Record<string, unknown>): void {
    if (!m || typeof m !== "object" || this.disposed) return;
    switch (m.type) {
      case "ready": {
        this.pendingReady?.resolve(m as unknown as { abiVersion: number; simd: boolean });
        break;
      }
      case "stats": {
        const s = m as unknown as WasmEngineStats & { type: string; _flow?: unknown; _p95ProcessNs?: number };
        this.stats = s;
        if (s._flow) {
          (wasmDiagnostics as unknown as Record<string, unknown>)._workletFlow = s._flow;
        }
        if (typeof s._p95ProcessNs === "number") {
          wasmDiagnostics.p95ProcessNs = s._p95ProcessNs;
        }
        markDiag({
          framesProcessed: s.blocksProcessed,
          bufferLevel: s.bufferedFrames,
          underruns: s.underruns,
          overruns: s.overruns,
          avgProcessNs: s.avgProcessNs,
          maxProcessNs: s.maxProcessNs,
          lastProcessNs: s.lastProcessNs,
          // Meters — proof of real signal (§35.18 / Phase-O §10):
          // RMS is windowed (live), peak latches the track max.
          rms: s.rms,
          peak: s.peak,
          gainReductionDb: s.gainReductionDb,
          truePeakDb: s.truePeakDb,
          lufsShort: s.lufsShort,
        });
        pushProcessNsSample(s.lastProcessNs);
        if (this.playing && s.blocksProcessed > 0 && !this.playingEmitted) {
          this.playingEmitted = true;
          this.cb.onPlaying?.();
        }
        if (this.currentDuration > 0) {
          this.cb.onProgress?.(s.playheadFrames / this.ctx!.sampleRate, this.currentDuration, s);
        }
        break;
      }
      case "ended": {
        if (this.playing) {
          this.playing = false;
          this.cb.onEnded?.();
        }
        break;
      }
      case "error": {
        this.fatal(`worklet ${m.stage}: ${m.message}`);
        break;
      }
      default:
        break;
    }
  }

  // ── worker message routing (static worker → active backend) ──
  handleWorkerMessage(m: Record<string, unknown>): void {
    if (!m || typeof m !== "object" || this.disposed) return;
    switch (m.type) {
      case "flow": {
        (wasmDiagnostics as unknown as Record<string, unknown>)._workerFlow = m;
        break;
      }
      case "headers": {
        this.totalBytes = (m.totalBytes as number) || 0;
        this.supportsRange = !!m.supportsRange;
        break;
      }
      case "info": {
        this.pendingInfo?.resolve({
          sampleRate: m.sampleRate as number,
          channels: m.channels as number,
          totalBytes: this.totalBytes,
          supportsRange: this.supportsRange,
        });
        this.pendingInfo = null;
        break;
      }
      case "fetchDone": {
        // Stream fully pushed — tell the worklet the ring will not refill.
        this.node?.port.postMessage({ type: "eof", value: true });
        break;
      }
      case "error": {
        if (this.pendingInfo) {
          this.pendingInfo.reject(new Error(`worker ${m.stage}: ${m.message}`));
          this.pendingInfo = null;
        } else {
          this.fatal(`worker ${m.stage}: ${m.message}`);
        }
        break;
      }
      default:
        break;
    }
  }

  // ── transport ──
  play(): void {
    if (!this.node || this.disposed) return;
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    this.playing = true;
    worker?.postMessage({ type: "play" });
    this.node.port.postMessage({ type: "cmd", opcode: OP.PLAY });
  }

  pause(): void {
    if (!this.node || this.disposed) return;
    this.playing = false;
    worker?.postMessage({ type: "pause" });
    this.node.port.postMessage({ type: "cmd", opcode: OP.PAUSE });
  }

  setVolume(v01: number): void {
    this.volume = Math.max(0, Math.min(1.5, v01));
    this.node?.port.postMessage({ type: "cmd", opcode: OP.SET_VOLUME, a: this.volume });
  }

  canSeek(): boolean {
    return this.active && this.totalBytes > 0 && this.currentDuration > 0;
  }

  /** Seek by byte estimate + decoder reset (returns false when impossible). */
  seek(seconds: number): boolean {
    if (!this.canSeek()) return false;
    const byte = Math.max(
      0,
      Math.min(
        this.totalBytes - 1,
        Math.round((Math.max(0, seconds) / this.currentDuration) * this.totalBytes)
      )
    );
    // Optimistic playhead so the UI jumps immediately; real frames follow.
    if (this.ctx) {
      this.stats = {
        ...(this.stats || ({} as WasmEngineStats)),
        playheadFrames: Math.max(0, seconds) * this.ctx.sampleRate,
      } as WasmEngineStats;
    }
    // Worklet: flush ring + move playhead; worker: reset decoder, refetch.
    // Order matters: the worklet learns the NEW generation first (its FLUSH
    // message), so any stale in-flight PCM arriving afterwards is dropped by
    // the generation guard instead of being written into the reset ring.
    // Credit gating then guarantees correctness regardless of cross-target
    // delivery order: the worker can only pump new data after the worklet
    // grants credit — which happens only after the FLUSH was processed.
    this.pcmGen += 1;
    const gen = this.pcmGen;
    this.node!.port.postMessage({ type: "cmd", opcode: OP.FLUSH, gen });
    this.node!.port.postMessage({
      type: "cmd",
      opcode: OP.SEEK,
      gen,
      a: Math.max(0, seconds) * this.ctx!.sampleRate,
    });
    worker?.postMessage({ type: "seek", url: this.currentUrl, byte, gen });
    return true;
  }

  setQualityMode(mode: number): void {
    this.node?.port.postMessage({ type: "cmd", opcode: OP.SET_QUALITY_MODE, a: mode });
  }

  /** Current playback position (seconds) from engine stats. */
  get positionSec(): number {
    if (!this.stats || !this.ctx) return 0;
    return this.stats.playheadFrames / this.ctx.sampleRate;
  }

  /** Dispose + notify the caller to fall back to the element path. */
  fallbackToElement(reason: string, positionSec?: number): void {
    const pos = positionSec ?? this.positionSec;
    this.dispose();
    this.cb.onFatal?.(reason, pos);
  }

  // ── teardown / fallback ──
  private fatal(reason: string): void {
    if (this.disposed) return;
    markDiag({ lastError: reason });
    const pos = this.positionSec;
    this.dispose();
    this.cb.onFatal?.(reason, pos);
  }

  disposeNode(): void {
    if (this.channel) {
      try { this.channel.port1.close(); } catch {}
      try { this.channel.port2.close(); } catch {}
      this.channel = null;
    }
    if (this.node) {
      try {
        this.node.port.postMessage({ type: "destroy" });
        this.node.disconnect();
      } catch {}
      this.node = null;
    }
    if (this.ctx) this.ctx = null;
    if (activeBackend === this) setActiveBackendInstance(null);
    setActiveAnalyser(null);
    markDiag({ active: false, backend: "element" });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingInfo?.reject(new Error("disposed"));
    this.pendingInfo = null;
    this.pendingReady?.reject(new Error("disposed"));
    this.pendingReady = null;
    worker?.postMessage({ type: "abort" });
    this.disposeNode();
  }

  get isLoading(): boolean {
    return this.loading;
  }
}

function routeWorkerMessage(ev: MessageEvent): void {
  if (activeBackend) activeBackend.handleWorkerMessage(ev.data);
}

function setActiveBackendInstance(b: WasmAudioBackend | null): void {
  activeBackend = b;
}

export function getActiveWasmBackend(): WasmAudioBackend | null {
  return activeBackend && activeBackend.active ? activeBackend : null;
}

export function isWasmActive(): boolean {
  return !!(activeBackend && activeBackend.active);
}

export function createWasmBackend(callbacks: WasmBackendCallbacks, volume01 = 1): WasmAudioBackend {
  const b = new WasmAudioBackend();
  b.cb = callbacks;
  b.volume = volume01;
  return b;
}

/** Session kill-switch state (probe before attempting a load). */
export function isWasmUnsupported(): boolean {
  return wasmUnsupported;
}

/** Diagnostics access for DevTools/automation (§35.18). */
export function getWasmDiagnostics(): typeof wasmDiagnostics {
  return wasmDiagnostics;
}

// Re-export for the element path helper: pause the element while wasm plays.
export function pauseElementAudio(): void {
  try {
    const a = getAudioElement();
    if (a && !a.paused) a.pause();
  } catch {}
}

/**
 * User-facing seek router: WASM backend when active, element otherwise.
 * Used by PlayerBar / FullTrackView / keyboard shortcuts / MediaSession.
 */
export function seekPlayback(time: number): void {
  const b = getActiveWasmBackend();
  if (b) {
    if (b.seek(time)) return;
    // Seek impossible on the wasm path (no totalBytes/duration) — fall back
    // to the element path AT the requested position (§35.22).
    b.fallbackToElement("seek-unsupported", time);
    return;
  }
  const audio = getAudioElement();
  if (audio && audio.src) audio.currentTime = time;
}

/** Current playback position (seconds) — WASM stats or element currentTime. */
export function currentPlaybackPosition(): number {
  const b = getActiveWasmBackend();
  if (b && b.active) return b.positionSec;
  try {
    const a = getAudioElement();
    if (a && a.src) return a.currentTime;
  } catch {}
  return 0;
}
