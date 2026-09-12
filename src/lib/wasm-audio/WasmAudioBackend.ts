/**
 * WasmAudioBackend v2 — orchestrates the Rust/WASM playback pipeline.
 *
 *   fetch (worker, Range windows + segment cache) → Symphonia decode
 *   (codec_wasm, 2 decoder slots) → MessagePort → planar ring (worklet)
 *   → Rust DSP (audio_wasm) → AudioContext.destination
 *
 * v2 architecture (audio-engine/docs/engine-v2-architecture.md):
 *  - ONE persistent worklet node + wasm engine per AudioContext session:
 *    track changes are generation-bumped flushes, NOT node recreations
 *    (v1 compiled the wasm module per track inside the worklet).
 *  - Gapless continuation: the hook registers the next track
 *    (`setNextTrack`); the worker prefetches + decodes it in a second
 *    decoder slot; at the boundary the ring is NEVER flushed — the worklet
 *    emits `trackEnded` when the playhead crosses, the backend advances the
 *    UI (`onAdvanced`) with zero audible discontinuity.
 *  - Explicit lifecycle state machine (IDLE→LOADING→PRIMING→PLAYING…).
 *  - Authoritative clock: Rust playheadFrames, interpolated between 10 Hz
 *    stats with a performance.now anchor (clamped) — zero React renders.
 *  - Optimistic same-rate loads: the session node is reused immediately;
 *    the worklet's PCM rate guard makes wrong-rate audio impossible and
 *    triggers a session rebuild at the content's true rate.
 *  - Any failure at ANY stage calls onFatal → the caller falls back to the
 *    element path (§35.22). The player never dies.
 *  - version.json is the single source of asset URLs (§35.10); the runtime
 *    ABI check (§35.9) refuses mismatched JS/WASM pairs.
 */
import type {
  AudioEngineManifest, WasmEngineStats, NextTrackStatus,
  AudioHealth, ControllerSnapshot, BenchEvent, EngineLifecycle,
} from "./types";
import { EXPECTED_WASM_ABI } from "./types";
import { fetchAudioEngineManifest, assetUrl } from "./manifest";
import { markDiag, pushProcessNsSample, resetDiagTrackCounters, wasmDiagnostics } from "./diagnostics";
import { setActiveAnalyser, getAudioElement } from "@/lib/audioEngine";
import { estimateSeekByte } from "./decide";

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
const CLOCK_EXTRAPOLATION_MS = 250; // clamp between 10 Hz stats
const TIMELINE_CAP = 600;

export interface WasmLoadOptions {
  url: string;
  durationSec: number;
  autoplay: boolean;
  trackId: string;
}

export interface NextTrackRegistration {
  trackId: string;
  url: string;
  durationSec: number;
  /** Prefetch lead in seconds (from the predictive pipeline, A10). */
  leadSec?: number;
}

export interface WasmBackendCallbacks {
  /** ~10 Hz progress updates (seconds, position WITHIN the current track). */
  onProgress?: (positionSec: number, durationSec: number, stats: WasmEngineStats) => void;
  /** Track finished (ring drained + EOF). */
  onEnded?: () => void;
  /** First audio frames processed → loading → playing transition. */
  onPlaying?: () => void;
  /**
   * v2 GAPLESS ADVANCE: the playhead crossed the track boundary — the NEXT
   * track is already audible. The hook updates the store WITHOUT reloading
   * (the engine keeps playing; a load would cut the audio).
   */
  onAdvanced?: (nextTrackId: string, positionSec: number) => void;
  /** v2: next-track prefetch status (gapless committed / fell through). */
  onNextStatus?: (status: NextTrackStatus) => void;
  /** v2: buffer state transitions for UI (isBuffering). */
  onBufferingChange?: (buffering: boolean) => void;
  /** Fatal error — caller MUST fall back to the element path. */
  onFatal?: (reason: string, positionSec?: number) => void;
}

// ── module-level singletons (compiled once per page) ──
let manifest: AudioEngineManifest | null = null;
let coreBytes: ArrayBuffer | null = null; // raw bytes → compiled INSIDE the worklet
let codecModule: WebAssembly.Module | null = null;
let worker: Worker | null = null;
let engineReady: Promise<void> | null = null;
let wasmUnsupported = false;
const ctxCache = new Map<number, AudioContext>();
const ctxAnalyser = new Map<number, AnalyserNode>();
const ctxModuleLoaded = new Set<AudioContext>();
let activeBackend: WasmAudioBackend | null = null;

// ── v2 session state: ONE persistent node per AudioContext ──
interface SessionNode {
  ctx: AudioContext;
  rate: number;
  node: AudioWorkletNode;
  channel: MessageChannel;
  createdAt: number;
  loads: number;
}
let session: SessionNode | null = null;
let sessionGen = 0;

// ── v2 benchmark timeline (A12) ──
const benchTimeline: BenchEvent[] = [];
function benchEvent(k: string, d?: number | string | boolean): void {
  benchTimeline.push({ t: Math.round(performance.now()), k, d });
  if (benchTimeline.length > TIMELINE_CAP) benchTimeline.shift();
}

// ── DSP state snapshot (module level: survives track changes) ──
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

/** Replay the recorded DSP state into the given (fresh) engine. */
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

/**
 * Get (or create) a context running exactly at the content's rate.
 * v2: LRU eviction of INACTIVE contexts (the session owns one; older
 * rate-locked contexts are closed to make room instead of failing).
 */
function contextForRate(rate: number): AudioContext | null {
  if (!rate || !isFinite(rate) || rate < 8000 || rate > 96000) return null;
  const hit = ctxCache.get(rate);
  if (hit) {
    if (hit.state === "closed") ctxCache.delete(rate);
    else return hit;
  }
  if (ctxCache.size >= MAX_CONTEXTS) {
    // Evict the oldest context that is NOT the current session's context.
    let evictKey: number | null = null;
    for (const [r, c] of ctxCache) {
      if (session && c === session.ctx) continue;
      if (c.state === "closed") { ctxCache.delete(r); continue; }
      // insertion-order Map: first eligible key is the oldest
      evictKey = r;
      break;
    }
    if (evictKey !== null) {
      const c = ctxCache.get(evictKey)!;
      ctxCache.delete(evictKey);
      const an = ctxAnalyser.get(evictKey);
      if (an) { try { an.disconnect(); } catch {} ctxAnalyser.delete(evictKey); }
      try { c.close(); } catch {}
    }
    if (ctxCache.size >= MAX_CONTEXTS) return null;
  }
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

// ── node message routing (session node → ACTIVE backend) ──
const ctxEventWired = new WeakSet<AudioContext>();

function routeNodeMessage(ev: MessageEvent): void {
  const m = ev.data;
  if (!m || typeof m !== "object") return;
  // Session bootstrap resolves through the module-level pending handle
  // (the creating backend may not be attached yet).
  if (m.type === "ready") {
    pendingSessionReady?.resolve(m as { abiVersion: number; simd: boolean });
    return;
  }
  if (m.type === "error" && (!activeBackend || activeBackend.disposed)) {
    markDiag({ lastError: `worklet ${m.stage}: ${m.message}` });
    return;
  }
  activeBackend?.onNodeMessage(m);
}
function routeWorkerMessage(ev: MessageEvent): void {
  const m = ev.data;
  if (!m || typeof m !== "object") return;
  // 'ready'/'abi-mismatch' are handled at bootstrap; route the rest.
  activeBackend?.handleWorkerMessage(m);
}

function setActiveBackendInstance(b: WasmAudioBackend | null): void {
  activeBackend = b;
}

// ── session node lifecycle (module-level: shared across backends) ──
let sessionInitInFlight: Promise<SessionNode> | null = null;

async function createSession(rate: number): Promise<SessionNode> {
  const ctx = contextForRate(rate);
  if (!ctx) throw new Error(`no AudioContext for ${rate}Hz`);
  const analyser = analyserFor(ctx);
  await ensureWorkletModule(ctx, assetUrl(manifest!, manifest!.worklet));
  const channel = new MessageChannel();
  const node = new AudioWorkletNode(ctx, "mq-audio-processor", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
  });
  node.port.onmessage = routeNodeMessage;
  node.port.onmessageerror = () => {
    markDiag({ lastError: "node messageerror" });
  };

  const nodeReady = new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => {
      pendingSessionReady = null;
      reject(new Error("worklet init timeout"));
    }, 6000);
    pendingSessionReady = {
      resolve: (m: { abiVersion: number; simd: boolean }) => {
        clearTimeout(to);
        pendingSessionReady = null;
        if (m.abiVersion !== EXPECTED_WASM_ABI) {
          reject(new Error(`WASM_VERSION_MISMATCH(core abi ${m.abiVersion} != ${EXPECTED_WASM_ABI})`));
          return;
        }
        markDiag({ abiVersion: m.abiVersion, simd: m.simd, contextSampleRate: ctx.sampleRate });
        resolve();
      },
      reject: (e: Error) => { clearTimeout(to); pendingSessionReady = null; reject(e); },
    };
  });
  // Transfer DETACHES the ArrayBuffer — send a fresh copy per session (the
  // module-level original stays intact). WebAssembly.Module is NOT reliably
  // cloneable into the AudioWorklet context (messageerror on Chrome) —
  // bytes + in-worklet compile is the portable path.
  const wasmBytesForWorklet = coreBytes!.slice(0);
  node.port.postMessage(
    { type: "init", wasmBytes: wasmBytesForWorklet, pcmPort: channel.port2, channels: 2, ringFrames: RING_FRAMES },
    [wasmBytesForWorklet, channel.port2]
  );
  await nodeReady;

  // Bind the worker's PCM port (data plane) — ONCE per session.
  worker!.postMessage({ type: "bindPort", pcmPort: channel.port1 }, [channel.port1]);

  node.connect(analyser);
  const s: SessionNode = { ctx, rate, node, channel, createdAt: Date.now(), loads: 0 };
  benchEvent("session-create", rate);
  return s;
}
let pendingSessionReady: { resolve: (m: { abiVersion: number; simd: boolean }) => void; reject: (e: Error) => void } | null = null;

async function ensureSession(rate: number | null): Promise<SessionNode> {
  if (session) return session;
  if (rate === null) {
    // No rate known yet — wait for the worker's stream info to create the
    // session at the content's exact rate.
    throw new Error("ensureSession requires a rate");
  }
  if (!sessionInitInFlight) {
    sessionInitInFlight = createSession(rate).catch((e) => {
      sessionInitInFlight = null;
      throw e;
    });
  }
  session = await sessionInitInFlight;
  sessionInitInFlight = null;
  return session;
}

function disposeSession(): void {
  if (!session) return;
  const s = session;
  session = null;
  sessionInitInFlight = null;
  try { s.node.port.postMessage({ type: "destroy" }); } catch {}
  try { s.node.disconnect(); } catch {}
  try { s.channel.port1.close(); } catch {}
  try { s.channel.port2.close(); } catch {}
  if (activeBackend && activeBackend.ctx === s.ctx) activeBackend.ctx = null;
  setActiveAnalyser(null);
  benchEvent("session-dispose", s.rate);
}

export class WasmAudioBackend {
  node: AudioWorkletNode | null = null; // the SESSION node while attached
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
  /** v2: true after a gapless advance fired for the current track. */
  gaplessAdvanced = false;

  stats: WasmEngineStats | null = null;
  private playingEmitted = false;
  private pcmGen = 0;
  disposed = false; // module-level router + bench API read this
  private loading = false;
  private rebuilding = false;
  private lastLoadOpts: WasmLoadOptions | null = null;

  // Clock interpolation anchor (A6).
  private statsAtMs = 0;
  // Lifecycle machine (A3).
  private lifecycle: EngineLifecycle = "IDLE";
  private lastBuffering = false;
  // Seek benchmark resolution (A12).
  private pendingSeekTarget: number | null = null;
  // Next-track registry (gapless) — read by the bench/QA surface.
  nextReg: NextTrackRegistration | null = null;

  cb: WasmBackendCallbacks = {};

  get active(): boolean {
    return !this.disposed && !!session && !!this.node;
  }

  get lifecycleState(): EngineLifecycle {
    return this.lifecycle;
  }

  private setState(s: EngineLifecycle): void {
    if (this.lifecycle === s) return;
    const legal: Record<string, string[]> = {
      IDLE: ["LOADING"],
      LOADING: ["PRIMING", "PLAYING", "PAUSED", "SEEKING", "STARVED", "ERROR", "IDLE"],
      PRIMING: ["PLAYING", "PAUSED", "SEEKING", "STARVED", "ERROR", "ENDED"],
      PLAYING: ["PAUSED", "SEEKING", "STARVED", "ENDED", "ERROR", "LOADING"],
      SEEKING: ["PRIMING", "PLAYING", "PAUSED", "SEEKING", "LOADING", "ERROR"],
      STARVED: ["RECOVERING", "PRIMING", "PLAYING", "PAUSED", "SEEKING", "ENDED", "LOADING", "ERROR"],
      RECOVERING: ["PLAYING", "STARVED", "PAUSED", "SEEKING", "LOADING", "ERROR"],
      PAUSED: ["PLAYING", "SEEKING", "LOADING", "ERROR"],
      ENDED: ["LOADING", "IDLE", "ERROR"],
      ERROR: ["IDLE"],
    };
    if (!legal[this.lifecycle]?.includes(s)) {
      // Defensive: log + still apply — a state machine must never crash
      // playback; the transition table exists to surface design bugs.
      benchEvent("lifecycle-illegal", `${this.lifecycle}->${s}`);
    }
    this.lifecycle = s;
    markDiag({ lifecycle: s });
    benchEvent("lifecycle", s);
  }

  // ── engine bootstrap (once per page) ──
  static async ensureEngine(): Promise<void> {
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
    this.lastLoadOpts = opts;
    this.currentUrl = opts.url;
    this.currentDuration = opts.durationSec;
    this.currentTrackId = opts.trackId;
    this.playingEmitted = false;
    this.gaplessAdvanced = false;
    this.stats = null;
    this.totalBytes = 0;
    this.supportsRange = false;
    this.nextReg = null;
    setActiveBackendInstance(this);
    this.setState("LOADING");
    markDiag({
      active: true, backend: "wasm", totalBytes: null, supportsRange: false,
      framesProcessed: 0, underruns: 0, overruns: 0, bufferLevel: 0,
      lastError: null, currentTrackId: opts.trackId, next: null,
    });
    benchEvent("load-start", opts.trackId);

    await WasmAudioBackend.ensureEngine();

    const gen = ++sessionGen;
    this.pcmGen = gen;
    markDiag({ generation: gen });

    // 1) start the fetch+decode in the worker immediately — the credit
    //    protocol keeps it from sending PCM until the worklet is bound and
    //    generation-aligned (race-free by construction).
    worker!.postMessage({
      type: "load",
      url: opts.url,
      trackId: opts.trackId,
      durationSec: opts.durationSec,
      autoplay: opts.autoplay,
      gen,
    });

    // 2) session node: reuse (same-rate fast path) or create (info-gated).
    if (session) {
      this.attachSession(session);
      // Optimistic: seek-to-0 + generation for the fresh track. If the
      // content's rate differs, the worklet's PCM rate guard drops it and
      // we rebuild the session at the true rate (rare path).
      this.node!.port.postMessage({ type: "cmd", opcode: OP.SEEK, gen, a: 0, trackId: opts.trackId });
      // STOP (from the previous dispose) reset the engine's DSP state —
      // replay the snapshot + volume so nothing sounds flat/reset.
      this.node!.port.postMessage({ type: "cmd", opcode: OP.SET_VOLUME, a: this.volume });
      replayDspState(this);
      if (opts.autoplay) this.play();
      else this.pause();
      this.loading = false;
      benchEvent("load-attached", gen);
      return;
    }

    // Fresh session: await stream info (rate) → context → node → init.
    const info = await this.awaitInfo(deadline);
    this.totalBytes = info.totalBytes;
    this.supportsRange = info.supportsRange;
    this.contentRate = info.sampleRate;
    this.channels = info.channels;
    markDiag({
      totalBytes: info.totalBytes || null, supportsRange: info.supportsRange,
      contentSampleRate: info.sampleRate, channels: info.channels,
    });

    const s = await ensureSession(info.sampleRate);
    this.attachSession(s);

    // 3) seed the boundary map + generation, volume, DSP, transport.
    this.node!.port.postMessage({ type: "cmd", opcode: OP.SEEK, gen, a: 0, trackId: opts.trackId });
    this.node!.port.postMessage({ type: "cmd", opcode: OP.SET_VOLUME, a: this.volume });
    replayDspState(this);
    resetDiagTrackCounters();
    if (opts.autoplay) this.play();
    this.loading = false;
    benchEvent("load-ready", gen);
  }

  private attachSession(s: SessionNode): void {
    this.node = s.node;
    this.channel = s.channel;
    this.ctx = s.ctx;
    this.analyser = analyserFor(s.ctx);
    s.loads++;
    if (typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__mqAudioCtx = s.ctx;
      (window as unknown as Record<string, unknown>).__mqAudioAnalyser = this.analyser;
    }
    setActiveAnalyser(this.analyser);
  }

  /** Send a DSP/transport command to the session engine (numeric opcodes). */
  sendDsp(op: number, a = 0, b = 0, c = 0): void {
    if (!this.node || this.disposed) return;
    this.node.port.postMessage({ type: "cmd", opcode: op, a, b, c });
  }

  private pendingInfo: { resolve: (v: { sampleRate: number; channels: number; totalBytes: number; supportsRange: boolean }) => void; reject: (e: Error) => void } | null = null;

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

  private wireSessionEvents(): void {
    // iOS interruption / visibility suspend sync (§13 of the arch doc).
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!ctxEventWired.has(ctx)) {
      ctxEventWired.add(ctx);
      ctx.addEventListener("statechange", () => {
        const st = ctx.state;
        const b = activeBackend;
        if ((st === "interrupted" || st === "suspended") && b && b.playing && b.ctx === ctx) {
          b.playing = false;
          benchEvent("ctx-interrupted", st || "");
          // Keep the engine paused-consistent; the UI resumes on gesture.
          b.sendDsp(OP.PAUSE);
        }
      });
    }
  }
  private ctxInterruptionWired = false;

  onNodeMessage(m: Record<string, unknown>): void {
    if (!m || typeof m !== "object" || this.disposed) return;
    switch (m.type) {
      case "stats": {
        const s = m as unknown as WasmEngineStats & { type: string; _flow?: unknown };
        this.stats = s;
        this.statsAtMs = performance.now();
        if (s._flow) {
          (wasmDiagnostics as unknown as Record<string, unknown>)._workletFlow = s._flow;
        }
        markDiag({
          framesProcessed: s.blocksProcessed,
          bufferLevel: s.bufferedFrames,
          underruns: s.underruns,
          overruns: s.overruns,
          avgProcessNs: s.avgProcessNs,
          maxProcessNs: s.maxProcessNs,
          lastProcessNs: s.lastProcessNs,
          engineState: s.engineState,
          currentTrackId: s.trackId ?? this.currentTrackId,
          rms: s.rms,
          peak: s.peak,
          gainReductionDb: s.gainReductionDb,
          truePeakDb: s.truePeakDb,
          lufsShort: s.lufsShort,
        });
        pushProcessNsSample(s.lastProcessNs);
        this.wireSessionEvents();

        // Lifecycle + buffering transitions (RT view → authoritative map).
        const ws = s.engineState;
        if (this.playing) {
          if (ws === 4 /* STARVED */) this.setState("STARVED");
          else if (this.lifecycle === "STARVED" || this.lifecycle === "RECOVERING") {
            if (s.bufferedFrames > 4096) this.setState("PLAYING");
            else this.setState("RECOVERING");
          } else if (this.lifecycle !== "PLAYING" && s.blocksProcessed > 0 && this.playingEmitted) {
            this.setState("PLAYING");
          }
        }
        const buffering = this.playing && (ws === 1 || ws === 4 || ws === 6);
        if (buffering !== this.lastBuffering) {
          this.lastBuffering = buffering;
          this.cb.onBufferingChange?.(buffering);
        }

        if (this.playing && s.blocksProcessed > 0 && !this.playingEmitted) {
          this.playingEmitted = true;
          this.setState("PRIMING");
          benchEvent("first-audio", Math.round(this.positionSec * 1000) / 1000);
          this.cb.onPlaying?.();
        }

        // Seek resolution benchmark (A12): first stats past the target.
        if (this.pendingSeekTarget !== null && this.playing) {
          const pos = s.trackOffsetFrames / (this.ctx?.sampleRate || 44100);
          if (pos >= this.pendingSeekTarget - 0.25) {
            benchEvent("seek-resolved", Math.round(pos * 1000) / 1000);
            this.pendingSeekTarget = null;
          }
        }

        if (this.currentDuration > 0) {
          const pos = s.trackOffsetFrames / (this.ctx?.sampleRate || 44100);
          this.cb.onProgress?.(Math.min(pos, this.currentDuration), this.currentDuration, s);
        }
        break;
      }
      case "trackEnded": {
        // GAPLESS ADVANCE: the playhead crossed into the next track — it is
        // ALREADY audible. Update bookkeeping, notify the hook (store
        // advance WITHOUT reload).
        const nextTrackId = (m.nextTrackId as string) || null;
        const reg = this.nextReg;
        if (nextTrackId && reg && reg.trackId === nextTrackId) {
          this.currentTrackId = nextTrackId;
          this.currentUrl = reg.url;
          this.currentDuration = reg.durationSec;
          this.totalBytes = 0;
          this.supportsRange = false;
          this.gaplessAdvanced = true;
          this.nextReg = null;
          markDiag({ currentTrackId: nextTrackId, next: null });
          benchEvent("gapless-advance", nextTrackId);
          const pos = (m.playheadFrames as number) / (this.ctx?.sampleRate || 44100);
          this.cb.onAdvanced?.(nextTrackId, pos);
        } else {
          // Boundary without a matching registration (defensive) — treat as
          // informational only; the drained 'ended' path will advance.
          benchEvent("boundary-unregistered", String(nextTrackId));
        }
        break;
      }
      case "rateMismatch": {
        // The session is rate-locked; the content decodes at another rate.
        // Rebuild the session at the content's rate and reload (bounded once).
        if (this.rebuilding || this.disposed || !this.lastLoadOpts) return;
        this.rebuilding = true;
        benchEvent("rate-mismatch", `${m.got}≠${m.expected}`);
        try { worker?.postMessage({ type: "abort" }); } catch {}
        disposeSession();
        this.disposeNode();
        this.rebuilding = false;
        // Reload through the info-gated path (session is null now).
        this.load(this.lastLoadOpts).catch((e) => {
          this.fatal(`session rebuild failed: ${e instanceof Error ? e.message : e}`);
        });
        break;
      }
      case "ended": {
        if (this.playing) {
          this.playing = false;
          this.setState("ENDED");
          benchEvent("ended", Math.round(this.positionSec * 1000) / 1000);
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
        markDiag({ totalBytes: this.totalBytes || null, supportsRange: this.supportsRange });
        break;
      }
      case "info": {
        this.contentRate = (m.sampleRate as number) || this.contentRate;
        this.channels = (m.channels as number) || this.channels;
        markDiag({ contentSampleRate: this.contentRate, channels: this.channels });
        this.pendingInfo?.resolve({
          sampleRate: m.sampleRate as number,
          channels: m.channels as number,
          totalBytes: this.totalBytes,
          supportsRange: this.supportsRange,
        });
        this.pendingInfo = null;
        break;
      }
      case "stageDone": {
        benchEvent("stage-done", (m.trackId as string) || "");
        break;
      }
      case "fetchDone": {
        // Stream fully pushed AND the continuation chain is exhausted —
        // tell the worklet the ring will not refill (drain → final ended).
        this.node?.port.postMessage({ type: "eof", value: true });
        benchEvent("fetch-done", (m.trackId as string) || "");
        break;
      }
      case "nextReady": {
        const status: NextTrackStatus = {
          trackId: m.trackId as string,
          gapless: !!m.gapless,
          sampleRate: m.sampleRate as number,
          queuedFrames: m.queuedFrames as number,
          reason: (m.reason as string) || undefined,
        };
        markDiag({ next: status });
        benchEvent("next-ready", m.gapless ? "gapless" : `no:${m.reason || ""}`);
        this.cb.onNextStatus?.(status);
        break;
      }
      case "nextFailed": {
        const status: NextTrackStatus = {
          trackId: m.trackId as string,
          gapless: false,
          reason: String(m.reason || "failed"),
        };
        markDiag({ next: status });
        benchEvent("next-failed", status.reason || "");
        this.cb.onNextStatus?.(status);
        break;
      }
      case "nextCleared": {
        markDiag({ next: null });
        break;
      }
      case "trackSent": {
        benchEvent("track-sent", (m.trackId as string) || "");
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
    if (this.lifecycle === "PAUSED" || this.lifecycle === "ENDED") this.setState(this.lifecycle === "ENDED" ? "LOADING" : "PLAYING");
  }

  pause(): void {
    if (!this.node || this.disposed) return;
    this.playing = false;
    worker?.postMessage({ type: "pause" });
    this.node.port.postMessage({ type: "cmd", opcode: OP.PAUSE });
    if (this.lifecycle === "PLAYING" || this.lifecycle === "PRIMING" || this.lifecycle === "STARVED" || this.lifecycle === "RECOVERING") {
      this.setState("PAUSED");
    }
  }

  setVolume(v01: number): void {
    this.volume = Math.max(0, Math.min(1.5, v01));
    this.node?.port.postMessage({ type: "cmd", opcode: OP.SET_VOLUME, a: this.volume });
  }

  /**
   * v2 GAPLESS: register the next track (the hook resolves its stream URL
   * from the prefetch cache). The worker fetches+decodes it into a second
   * decoder slot by `leadSec`; at the boundary the ring is never flushed.
   */
  setNextTrack(reg: NextTrackRegistration): void {
    if (!worker || this.disposed) return;
    this.nextReg = reg;
    worker.postMessage({
      type: "next",
      trackId: reg.trackId,
      url: reg.url,
      durationSec: reg.durationSec,
      leadSec: reg.leadSec,
    });
    benchEvent("next-registered", reg.trackId);
  }

  /** Cancel a registered continuation (queue changed / repeat-one). */
  cancelNextTrack(): void {
    if (!worker || this.disposed) return;
    this.nextReg = null;
    worker.postMessage({ type: "cancelNext" });
  }

  canSeek(): boolean {
    return this.active && this.totalBytes > 0 && this.currentDuration > 0;
  }

  /** Seek by byte estimate + decoder reset (returns false when impossible). */
  seek(seconds: number): boolean {
    if (!this.canSeek()) return false;
    const target = Math.max(0, seconds);
    const byte = estimateSeekByte(target, this.currentDuration, this.totalBytes);
    // Optimistic playhead so the UI jumps immediately; real frames follow.
    if (this.ctx) {
      const rate = this.ctx.sampleRate;
      this.stats = {
        ...(this.stats || ({} as WasmEngineStats)),
        playheadFrames: target * rate,
        trackOffsetFrames: target * rate,
      } as WasmEngineStats;
      this.statsAtMs = performance.now();
    }
    this.pendingSeekTarget = target;
    this.setState("SEEKING");
    benchEvent("seek-issued", Math.round(target * 1000) / 1000);
    // Worklet: flush ring + move playhead; worker: reset decoder, refetch.
    // Order matters: the worklet learns the NEW generation first, so any
    // stale in-flight PCM is dropped by the generation guard; credit gating
    // then guarantees the worker cannot pump until the flush was applied.
    //
    // The SEEK target is expressed in the ENGINE's absolute playhead space
    // (continuous across flushes): trackStart + target. trackStart comes
    // from the last stats (playhead − current offset); the worklet KEEPS the
    // current track's boundary, so the reported offset jumps to `target`.
    this.pcmGen = ++sessionGen;
    const gen = this.pcmGen;
    const rate = this.ctx?.sampleRate || 44100;
    const trackStart = this.stats
      ? (this.stats.playheadFrames || 0) - (this.stats.trackOffsetFrames ?? (this.stats.playheadFrames || 0))
      : 0;
    const a = Math.max(0, trackStart + target * rate);
    this.node!.port.postMessage({ type: "cmd", opcode: OP.FLUSH, gen });
    this.node!.port.postMessage({ type: "cmd", opcode: OP.SEEK, gen, a });
    // posSec: the worker's prefetch scheduler needs the ABSOLUTE seek target
    // (after the flush, its sent-frames counter restarts at 0 — without the
    // anchor, remaining-time is overestimated and prefetch never fires).
    worker?.postMessage({ type: "seek", url: this.currentUrl, byte, gen, posSec: Math.round(target * 1000) / 1000 });
    return true;
  }

  setQualityMode(mode: number): void {
    this.node?.port.postMessage({ type: "cmd", opcode: OP.SET_QUALITY_MODE, a: mode });
  }

  /**
   * Current playback position (seconds) — the AUTHORITATIVE clock (A6):
   * Rust playhead frames, interpolated between 10 Hz stats with a clamped
   * performance.now anchor. Zero React renders; safe from RAF at 60 fps.
   */
  get positionSec(): number {
    if (!this.stats || !this.ctx) return 0;
    const rate = this.ctx.sampleRate;
    let frames = this.stats.trackOffsetFrames ?? this.stats.playheadFrames;
    if (this.playing) {
      const dt = Math.min((performance.now() - this.statsAtMs) / 1000, CLOCK_EXTRAPOLATION_MS / 1000);
      frames += dt * rate;
    }
    const pos = frames / rate;
    if (this.currentDuration > 0 && pos > this.currentDuration) return this.currentDuration;
    return Math.max(0, pos);
  }

  /** Raw (non-interpolated) per-track position — for tests/diagnostics. */
  get positionSecRaw(): number {
    if (!this.stats || !this.ctx) return 0;
    return (this.stats.trackOffsetFrames ?? this.stats.playheadFrames) / this.ctx.sampleRate;
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
    this.setState("ERROR");
    this.dispose();
    this.cb.onFatal?.(reason, pos);
  }

  /**
   * v2 semantics: DETACH from the session without destroying it. The
   * persistent engine (node + wasm instance + DSP + volume) stays alive for
   * the next track — this is the warm-switch latency win. Only the worker's
   * active stream is aborted (the shared worker must not be killed when a
   * superseding backend already started — hence the active-instance guard).
   */
  disposeNode(): void {
    if (activeBackend === this && this.node) {
      // Stop the old track's audio NOW (hard cut is unacceptable — the
      // engine's fade machinery makes STOP inaudible).
      try { this.node.port.postMessage({ type: "cmd", opcode: OP.STOP }); } catch {}
      try { worker?.postMessage({ type: "abort" }); } catch {}
    }
    this.node = null;
    this.channel = null;
    this.ctx = null;
    if (activeBackend === this) {
      setActiveBackendInstance(null);
      setActiveAnalyser(null);
      markDiag({ active: false, backend: "element", next: null });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingInfo?.reject(new Error("disposed"));
    this.pendingInfo = null;
    this.pendingSeekTarget = null;
    this.disposeNode();
    benchEvent("backend-dispose", this.currentTrackId);
  }

  /** Full teardown INCLUDING the session node (fatal / rate rebuild). */
  disposeSessionHard(): void {
    this.dispose();
    disposeSession();
  }

  get isLoading(): boolean {
    return this.loading;
  }
}

// ── v2.1 QA: independent OUTPUT-side signal tap (bench-only surface) ──
// The worker's PCM validator scans pre-ring data; this tap reads the FINAL
// post-DSP output at the session node — the signal the user actually hears.
// Sliding-window analyser coverage: 2048-sample window polled every 30 ms
// (46 ms of audio per read) → contiguous samples, zero gaps.
export interface TapViolation {
  tMs: number;
  kind: string;
  detail: string;
  context: {
    trackId: string | null;
    positionSec: number;
    generation: number;
    bufferedSec: number;
    underruns: number;
    engineState: number | null;
    lifecycle: string;
    timelineTail: BenchEvent[];
  };
}
export interface TapReport {
  durationMs: number;
  samples: number;
  windows: number;
  maxAbs: number;
  minAbs: number;
  rmsMax: number;
  rmsAvg: number;
  peak: number;
  maxDelta: number;
  nanInf: number;
  dcOffset: number;
  /** TRUE DC fault: consistent running window mean (asymmetry averages out). */
  dcFault: boolean;
  maxZeroRunMs: number;
  gainJumps: number;
  silenceRatio: number;
  violations: TapViolation[];
}
interface TapState {
  analyser: AnalyserNode;
  timer: number;
  startedAt: number;
  buf: Float32Array;
  lastSample: number;
  lastRms: number;
  windows: number;
  samples: number;
  silentWindows: number;
  maxAbs: number;
  minAbs: number;
  rmsSum: number;
  rmsMax: number;
  maxDelta: number;
  nanInf: number;
  dcSum: number;
  zeroRunMax: number;
  gainJumps: number;
  violations: TapViolation[];
}
let tapState: TapState | null = null;

function tapContext(kind: string, detail: string): TapViolation {
  const b = activeBackend;
  const s = b?.stats || null;
  return {
    tMs: Math.round(performance.now()),
    kind,
    detail,
    context: {
      trackId: s?.trackId ?? b?.currentTrackId ?? null,
      positionSec: +((s?.trackOffsetFrames ?? s?.playheadFrames ?? 0) / (b?.ctx?.sampleRate || 44100)).toFixed(2),
      generation: wasmDiagnostics.generation ?? 0,
      bufferedSec: +(((s?.bufferedFrames ?? 0) / (b?.ctx?.sampleRate || 44100))).toFixed(2),
      underruns: s?.underruns ?? 0,
      engineState: s?.engineState ?? null,
      lifecycle: b?.lifecycleState || "IDLE",
      timelineTail: benchTimeline.slice(-12),
    },
  };
}

function tapTick(): void {
  const t = tapState;
  if (!t) return;
  t.analyser.getFloatTimeDomainData(t.buf as Float32Array<ArrayBuffer>);
  const n = t.buf.length;
  let maxA = 0, minA = 0, sum = 0, sumSq = 0, nan = 0, zeroRun = 0, zeroRunMax = 0, dMax = 0;
  let prev = t.lastSample;
  let hasSignal = false;
  for (let i = 0; i < n; i++) {
    const x = t.buf[i];
    if (typeof x !== "number" || !Number.isFinite(x)) { nan++; continue; }
    if (x > maxA) maxA = x;
    if (x < minA) minA = x;
    sum += x;
    sumSq += x * x;
    const d = Math.abs(x - prev);
    if (d > dMax) dMax = d;
    prev = x;
    if (Math.abs(x) < 1e-5) {
      zeroRun++;
      if (zeroRun > zeroRunMax) zeroRunMax = zeroRun;
    } else {
      zeroRun = 0;
      hasSignal = true;
    }
  }
  const rms = Math.sqrt(sumSq / n);
  t.windows++;
  t.samples += n - (nan || 0);
  t.silentWindows += hasSignal ? 0 : 1;
  if (maxA > t.maxAbs) t.maxAbs = maxA;
  if (minA < t.minAbs) t.minAbs = minA;
  if (rms > t.rmsMax) t.rmsMax = rms;
  t.rmsSum += rms;
  if (dMax > t.maxDelta) t.maxDelta = dMax;
  t.nanInf += nan;
  t.dcSum += sum / n;
  if (zeroRunMax > t.zeroRunMax) t.zeroRunMax = zeroRunMax;
  t.lastSample = prev;

  // Gain-jump detector (both windows carrying signal; silence↔signal
  // transitions are normal at seeks/underruns — recorded, not flagged).
  if (t.lastRms > 1e-3 && rms > 1e-3) {
    const ratio = Math.max(rms / t.lastRms, t.lastRms / rms);
    if (ratio > 20) {
      t.gainJumps++;
      t.violations.push(tapContext("gain-jump", `rms ${t.lastRms.toFixed(3)}→${rms.toFixed(3)} ratio ${ratio.toFixed(1)}`));
    }
  }
  t.lastRms = rms;

  // Hard pathologies — immediate violation + context capture.
  if (nan > 0) t.violations.push(tapContext("nan-inf", `${nan} non-finite samples`));
  if (maxA > 1.02 || minA < -1.02) t.violations.push(tapContext("clip", `max=${maxA.toFixed(3)} min=${minA.toFixed(3)} (limiter ceiling exceeded)`));
  if (dMax > 1.4 && hasSignal) t.violations.push(tapContext("discontinuity", `inter-sample |Δ|=${dMax.toFixed(3)}`));
  // Window DC: real music (kick/sub-bass) legitimately shows ±0.04 window
  // means over 46 ms; a TRUE DC fault is a CONSISTENT offset — checked via
  // the running average at tapStop (|avg| > 0.02) instead of per-window.
  const dc = Math.abs(sum / n);
  if (dc > 0.06 && hasSignal) t.violations.push(tapContext("dc-window", `window mean=${(sum / n).toFixed(4)} (sustained > 0.06)`));
}

function tapStart(): boolean {
  if (tapState) return true;
  if (!session || !session.node) return false;
  try {
    const analyser = session.ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;
    session.node.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    tapState = {
      analyser, timer: 0, startedAt: performance.now(), buf,
      lastSample: 0, lastRms: 0, windows: 0, samples: 0, silentWindows: 0,
      maxAbs: 0, minAbs: 0, rmsSum: 0, rmsMax: 0, maxDelta: 0, nanInf: 0,
      dcSum: 0, zeroRunMax: 0, gainJumps: 0, violations: [],
    };
    (tapState as { timer: number }).timer = window.setInterval(tapTick, 30);
    return true;
  } catch {
    return false;
  }
}

function tapStop(): TapReport | null {
  const t = tapState;
  if (!t) return null;
  window.clearInterval(t.timer);
  try { t.analyser.disconnect(); } catch { /* already detached */ }
  tapState = null;
  const rate = session?.ctx?.sampleRate || 44100;
  return {
    durationMs: Math.round(performance.now() - t.startedAt),
    samples: t.samples,
    windows: t.windows,
    maxAbs: +t.maxAbs.toFixed(4),
    minAbs: +t.minAbs.toFixed(4),
    rmsMax: +t.rmsMax.toFixed(4),
    rmsAvg: +(t.rmsSum / Math.max(1, t.windows)).toFixed(4),
    peak: +Math.max(t.maxAbs, -t.minAbs).toFixed(4),
    maxDelta: +t.maxDelta.toFixed(4),
    nanInf: t.nanInf,
    dcOffset: +(t.dcSum / Math.max(1, t.windows)).toFixed(4),
    // TRUE DC fault: consistent running mean (musical asymmetry averages out)
    dcFault: Math.abs(t.dcSum / Math.max(1, t.windows)) > 0.02,
    maxZeroRunMs: +((t.zeroRunMax / rate) * 1000).toFixed(1),
    gainJumps: t.gainJumps,
    silenceRatio: +(t.silentWindows / Math.max(1, t.windows)).toFixed(3),
    violations: t.violations,
  };
}

// ── v2 benchmark + QA surface (A11/A12): window.__mqAudioBench ──
interface BenchApi {
  timeline: () => BenchEvent[];
  resetTimeline: () => void;
  health: () => AudioHealth | null;
  controller: () => ControllerSnapshot | null;
  stats: () => WasmEngineStats | null;
  lifecycle: () => string;
  gapless: () => { advanced: boolean; next: NextTrackStatus | null; registered: string | null };
  session: () => { rate: number; loads: number } | null;
  load: (url: string, opts?: { durationSec?: number; trackId?: string; autoplay?: boolean }) => Promise<void>;
  play: () => void;
  pause: () => void;
  seek: (sec: number) => boolean;
  setNext: (reg: NextTrackRegistration) => void;
  position: () => number;
  tapStart: () => boolean;
  tapStop: () => TapReport | null;
}

function workerFlow(): Record<string, unknown> | null {
  const f = (wasmDiagnostics as unknown as Record<string, unknown>)._workerFlow;
  return (f as Record<string, unknown>) || null;
}

export function ensureBenchApi(): void {
  if (typeof window === "undefined") return;
  if ((window as unknown as Record<string, unknown>).__mqAudioBench) return;
  const api: BenchApi = {
    timeline: () => benchTimeline.slice(),
    resetTimeline: () => { benchTimeline.length = 0; },
    health: () => {
      const f = workerFlow();
      return f ? ((f.health as AudioHealth) || null) : null;
    },
    controller: () => {
      const f = workerFlow();
      return f ? ((f.controller as ControllerSnapshot) || null) : null;
    },
    stats: () => activeBackend?.stats || null,
    lifecycle: () => activeBackend?.lifecycleState || "IDLE",
    gapless: () => ({
      advanced: activeBackend?.gaplessAdvanced || false,
      next: wasmDiagnostics.next || null,
      registered: activeBackend?.nextReg?.trackId || null,
    }),
    session: () => (session ? { rate: session.rate, loads: session.loads } : null),
    load: (url, opts = {}) => {
      const b = getActiveWasmBackend() || createWasmBackend({
        onFatal: (reason) => console.warn("[bench] fatal:", reason),
      });
      return b.load({
        url,
        durationSec: opts.durationSec || 300,
        trackId: opts.trackId || `bench-${Date.now()}`,
        autoplay: opts.autoplay !== false,
      });
    },
    play: () => getActiveWasmBackend()?.play(),
    pause: () => getActiveWasmBackend()?.pause(),
    seek: (sec) => getActiveWasmBackend()?.seek(sec) || false,
    setNext: (reg) => getActiveWasmBackend()?.setNextTrack(reg),
    position: () => getActiveWasmBackend()?.positionSec ?? 0,
    tapStart,
    tapStop,
  };
  (window as unknown as Record<string, unknown>).__mqAudioBench = api;
}

export function getActiveWasmBackend(): WasmAudioBackend | null {
  return activeBackend && !activeBackend.disposed && activeBackend.active ? activeBackend : null;
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

/**
 * IDLE ENGINE WARM-UP (track-loading optimization).
 *
 * The first play used to pay the full engine bootstrap on the critical
 * click→audio path: manifest fetch + ~1.4 MB of wasm bytes + compile +
 * worker init (~0.5-2 s cold). This pre-fetches/pre-compiles the engine
 * singleton at app idle time, so the first play only pays the track's own
 * network cost. Idempotent: shares the same `engineReady` promise as a real
 * load; failures arm the session kill-switch exactly like a real load
 * would (no behavior change, just earlier).
 */
export function warmUpWasmEngine(): void {
  if (typeof window === "undefined") return;
  if (wasmUnsupported || engineReady) return;
  if (!browserGlobals()) return;
  try {
    const run = () => { WasmAudioBackend.ensureEngine().catch(() => {}); };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (typeof ric === "function") {
      ric(run, { timeout: 4000 });
    } else {
      setTimeout(run, 1500);
    }
  } catch {
    // warm-up is best-effort — never block or crash the app
  }
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

/** Current playback position (seconds) — WASM interpolated clock or element. */
export function currentPlaybackPosition(): number {
  const b = getActiveWasmBackend();
  if (b && b.active) return b.positionSec;
  try {
    const a = getAudioElement();
    if (a && a.src) return a.currentTime;
  } catch {}
  return 0;
}
