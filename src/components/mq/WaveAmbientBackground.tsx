"use client";

/*
 * WaveAmbientBackground — the LIVING LIQUID backdrop for the Wave mode.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS
 * A fullscreen, GPU-native animated liquid scene (dark "liquid glass /
 * liquid platinum") that fades in behind ALL app UI while the Wave
 * (radio mode) is playing, and dissolves back to the normal page when it
 * stops. NOT an image, NOT a GIF — a WebGL fragment shader (domain-warped
 * fbm noise) with a graceful composited-CSS fallback when WebGL is gone.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LAYERS (per spec — each moves at its OWN speed, no visible cycle)
 *   1. Large liquid light body  — warped fbm, clock tA
 *   2. Darker depth field       — separate fbm phase, clock tB (slower)
 *   3. Narrow platinum streaks  — noise-gated gaussian bands, clock tC;
 *      the "silver → blue reflection → white highlight" pass
 *   4. Atmospheric noise        — ±0.7% luma grain
 *   5. Softness                 — everything is inherently smooth fbm and
 *      the scene renders at a reduced backing-store resolution that is
 *      linearly upscaled (invisible for this content, big GPU win)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PERFORMANCE CONTRACT
 *   - ZERO React re-renders in the animation path: the render loop lives
 *     in the LiquidEngine class on requestAnimationFrame, outside React.
 *   - Compositor-friendly: the only animated DOM property is the wrapper's
 *     `opacity` (mount/unmount fades). The scene itself is one <canvas>.
 *   - 30 fps cap on desktop / 24 fps on mobile (the motion is glacial —
 *     indistinguishable from 60 fps, half the GPU cost).
 *   - Adaptive resolution governor with hysteresis: 2 consecutive slow
 *     per-second samples step the render scale DOWN (0.72→0.56→0.44→0.36);
 *     8 consecutive healthy samples step it back UP. Exposed as
 *     data-scale + window.__mqWaveAmbient for QA.
 *   - Context attributes: alpha:false, depth:false, stencil:false,
 *     antialias:false, powerPreference:"low-power", desynchronized:true.
 *   - rAF stops when the tab is hidden, when the Wave is off (after the
 *     fade-out) and in reduced-motion mode (single static frame; palette
 *     changes still run a short transition-only loop, then park).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ARTWORK INTEGRATION
 * Dominant colours of the CURRENT track's cover (useDominantColor's
 * canvas k-means, cached per track) → deriveWavePalette() → a palette
 * that ALWAYS stays dark while keeping the artwork's hue (blue → navy,
 * red → burgundy, green → deep teal). Published as CSS custom properties
 *     --wave-color-1 / -2 / -3 / --wave-highlight
 * on <html> (registered via @property so the CSS fallback cross-fades).
 * Track change → uniforms lerp to the new palette over ~950 ms inside the
 * engine — old colours dissolve into the new scene, no hard cut, in sync
 * with the artwork swap as one "scene".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * REDUCED MOTION (prefers-reduced-motion / store reduceMotion / interface
 * animations disabled): the scene is NOT switched off — a static
 * composition is rendered once (same gradients, light, depth, grain) and
 * palette changes still cross-fade; only the continuous movement dies.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MOUNT / LIFECYCLE
 * Mounted once at the AppShell level. `active` drives:
 *   ON  → wrapper opacity 0→1 (950 ms) while the app root's opaque
 *         background fades to transparent (.mq-app-root) — the page
 *         visually "becomes" the liquid;
 *   OFF → wrapper opacity →0 and the engine parks itself ~1.2 s later.
 * Unmount cancels rAF, removes listeners and releases the GL context.
 */

import { memo, useEffect, useRef, useState } from "react";
import { extractColors } from "@/hooks/useDominantColor";
import type { DominantColors } from "@/hooks/useDominantColor";
import { useAppStore } from "@/store/useAppStore";
import type { Track } from "@/lib/musicApi";
import {
  DEFAULT_WAVE_PALETTE,
  deriveWavePalette,
  lerpPalette,
  paletteToCss,
  type WavePalette,
} from "./wave-ambient-palette";

/* ═══════════════════════════════════════════════════════════════════════
   GLSL — one fullscreen triangle, everything happens in the fragment
   ═══════════════════════════════════════════════════════════════════════ */

const VERT_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SRC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2  u_res;
uniform float u_time;
uniform vec3  u_c1;   // deep base
uniform vec3  u_c2;   // liquid mid
uniform vec3  u_c3;   // accent depth
uniform vec3  u_hl;   // platinum highlight

float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.53);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.02 + vec2(13.7, 7.1);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / u_res;
  vec2 p = (frag - 0.5 * u_res) / min(u_res.x, u_res.y);

  float t  = u_time;
  float tA = t * 0.020;   // liquid light clock
  float tB = t * 0.0125;  // depth clock
  float tC = t * 0.031;   // platinum clock

  /* ── domain warp — the liquid deformation of the material ── */
  vec2 q = vec2(
    fbm(p * 1.15 + vec2(tA * 0.8, -tA * 0.5)),
    fbm(p * 1.15 + vec2(4.7 - tA * 0.6, 2.3 + tA * 0.7))
  );
  vec2 r = vec2(
    fbm(p * 1.6 + q * 2.4 + vec2(1.7 - tB * 0.5, 9.2 + tB * 0.4)),
    fbm(p * 1.6 + q * 2.4 + vec2(8.3 + tB * 0.4, 2.8 - tB * 0.6))
  );
  float f = fbm(p * 1.25 + r * 2.2 + tA * 0.35);

  /* ── layer 2: darker depth field — big slow shapes, own phase ── */
  float depth = fbm(p * 0.72 + vec2(-tB * 0.55, tB * 0.35) + r * 0.8);

  /* ── layer 1: the liquid light body ── */
  float lightBody = smoothstep(0.38, 0.92, f);
  float ridge     = smoothstep(0.60, 1.05, f);

  /* ── layer 3: narrow platinum streaks — soft bands, noise-gated so they
        appear occasionally and travel along their own slow clocks ── */
  vec2 pd = vec2(p.x * 1.9 - p.y * 0.8, p.x * 0.6 + p.y * 2.2);
  float s1 = pd.x * 0.9 + fbm(p * 0.9 + vec2(tC * 0.7, -tC * 0.4)) * 2.6 - tC * 1.6;
  float s2 = pd.y * 0.7 + fbm(p * 0.8 + vec2(3.1 - tC * 0.5, tC * 0.6)) * 2.2 - tC * 1.1;
  float band1 = exp(-s1 * s1 * 5.5);
  float band2 = exp(-s2 * s2 * 9.0);
  float gate1 = smoothstep(0.42, 0.72, fbm(vec2(tC * 0.5, 3.7)));
  float gate2 = smoothstep(0.50, 0.78, fbm(vec2(7.3, tC * 0.42)));
  float streak = band1 * gate1 * 0.46 + band2 * gate2 * 0.26;

  /* ── compose: everything sits on a near-black floor ── */
  vec3 col = u_c1 * (0.85 + depth * 0.9);
  col += u_c2 * lightBody * 1.15;
  col += u_c3 * ridge * 0.75;
  col = min(col, vec3(0.30));            // hard darkness cap for the body
  col += u_hl * streak;                  // platinum reflections rise above
  col += u_hl * ridge * 0.05;            // faint rim on the brightest ridges

  /* ── layer 4: atmospheric noise (barely there) ── */
  float g = hash(frag + fract(t) * 61.7);
  col += (g - 0.5) * 0.014;

  /* ── depth shaping: vignette + edge darkening under the UI bars ── */
  float vig = smoothstep(1.35, 0.35, length(p * vec2(0.8, 1.05)));
  col *= mix(0.68, 1.0, vig);
  float edge = min(smoothstep(0.0, 0.14, uv.y), smoothstep(1.0, 0.86, uv.y));
  col *= mix(0.52, 1.0, edge);

  gl_FragColor = vec4(col, 1.0);
}
`;

/* ═══════════════════════════════════════════════════════════════════════
   LiquidEngine — WebGL renderer, 100% outside the React render cycle
   ═══════════════════════════════════════════════════════════════════════ */

const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

const SCALE_STEPS = [0.72, 0.56, 0.44, 0.36] as const;

/** Fixed composition time for the reduced-motion static frame. */
const STATIC_T = 97.3;

export interface WaveEngineStats {
  scale: number;
  fps: number;
  mode: "live" | "static";
}

export class LiquidEngine {
  /** true when the GL context + program are alive */
  public ok = false;
  /** current render scale step (index into SCALE_STEPS) */
  public scaleStep = 0;
  /** last measured effective fps (engine-side, for QA) */
  public fps = 0;

  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private raf = 0;
  private running = false;
  private disposed = false;
  private lastDraw = 0;
  private emaFrame = 16;
  private staticMode = false;
  private transitionOnly = false;
  private mobile: boolean;
  private dprCap: number;
  private onStats?: (s: WaveEngineStats) => void;

  // per-second sample accounting for the quality governor
  private fpsAcc = 0;
  private fpsCount = 0;
  private lastFpsT = 0;
  private slowSamples = 0;
  private healthySamples = 0;

  private palFrom: WavePalette = DEFAULT_WAVE_PALETTE;
  private palTo: WavePalette = DEFAULT_WAVE_PALETTE;
  private palCur: WavePalette = DEFAULT_WAVE_PALETTE;
  private palStart = 0;
  private palDur = 950;
  private palT = 1;

  private readonly onResizeBound = () => this.resize();
  private readonly onVisBound = () => {
    if (this.disposed) return;
    if (document.hidden) {
      this.halt();
    } else if (this.running || this.transitionOnly) {
      this.kick();
    }
  };

  constructor(
    canvas: HTMLCanvasElement,
    opts?: { staticMode?: boolean; onStats?: (s: WaveEngineStats) => void },
  ) {
    this.canvas = canvas;
    this.staticMode = !!opts?.staticMode;
    this.onStats = opts?.onStats;
    this.mobile =
      typeof window !== "undefined" &&
      !!window.matchMedia &&
      window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
    this.dprCap = this.mobile ? 1.25 : 1.5;

    try {
      const attrs: WebGLContextAttributes = {
        alpha: false,
        depth: false,
        stencil: false,
        antialias: false,
        powerPreference: "low-power",
        desynchronized: true,
      };
      const gl = (canvas.getContext("webgl", attrs) ||
        canvas.getContext("experimental-webgl", attrs)) as WebGLRenderingContext | null;
      if (!gl) return;
      this.gl = gl;

      const compile = (type: number, src: string): WebGLShader => {
        const sh = gl.createShader(type);
        if (!sh) throw new Error("createShader failed");
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          throw new Error(gl.getShaderInfoLog(sh) || "shader compile failed");
        }
        return sh;
      };

      const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
      const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
      const prog = gl.createProgram();
      if (!prog) throw new Error("createProgram failed");
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(prog) || "link failed");
      }
      gl.useProgram(prog);

      // Fullscreen triangle
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(prog, "a_pos");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      this.loc = {
        u_res: gl.getUniformLocation(prog, "u_res"),
        u_time: gl.getUniformLocation(prog, "u_time"),
        u_c1: gl.getUniformLocation(prog, "u_c1"),
        u_c2: gl.getUniformLocation(prog, "u_c2"),
        u_c3: gl.getUniformLocation(prog, "u_c3"),
        u_hl: gl.getUniformLocation(prog, "u_hl"),
      };
      this.ok = true;

      this.resize();
      window.addEventListener("resize", this.onResizeBound, { passive: true });
      window.addEventListener("orientationchange", this.onResizeBound, { passive: true });
      document.addEventListener("visibilitychange", this.onVisBound);
    } catch {
      this.ok = false;
      this.gl = null;
    }
  }

  /** Palette target — the engine cross-fades uniforms over durationMs. */
  setPalette(p: WavePalette, durationMs = 950): void {
    const now = this.now();
    this.palFrom = { ...this.palCur };
    this.palTo = p;
    this.palStart = now;
    this.palDur = Math.max(1, durationMs);
    this.palT = 0;
    if (this.staticMode && this.ok) {
      // No continuous loop allowed: run a short transition-only loop that
      // parks itself once the colour lerp completes.
      this.transitionOnly = true;
      this.kick();
    }
  }

  /** Live/static mode can be flipped mid-session (settings toggle). */
  setStaticMode(v: boolean): void {
    if (this.staticMode === v) return;
    this.staticMode = v;
    this.transitionOnly = false;
    if (v) {
      this.renderStatic();
    } else if (this.running) {
      this.start();
    }
  }

  /** Start the living loop (static mode → just renders the frame). */
  start(): void {
    if (!this.ok || this.disposed) return;
    if (this.staticMode) {
      this.renderStatic();
      return;
    }
    this.running = true;
    this.kick();
  }

  /** Stop the loop (freeze last frame — the wrapper's CSS fades it out). */
  stop(): void {
    this.running = false;
    this.transitionOnly = false;
    this.halt();
  }

  private kick(): void {
    if (this.raf === 0 && this.ok && !this.disposed) {
      this.lastDraw = 0;
      this.lastFpsT = 0;
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  private halt(): void {
    if (this.raf !== 0) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private now(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  private loop = (now: number): void => {
    if (this.disposed) return;
    if (this.staticMode && !this.transitionOnly) {
      this.halt();
      return;
    }
    this.raf = requestAnimationFrame(this.loop);

    const minDelta = this.mobile ? 1000 / 24 : 1000 / 30;
    if (this.lastDraw > 0 && now - this.lastDraw < minDelta - 1.5) return;
    const delta = this.lastDraw > 0 ? now - this.lastDraw : minDelta;
    this.lastDraw = now;

    /* ── per-second fps accounting + adaptive quality governor ──
       Downgrade after 2 consecutive slow seconds; upgrade only after 8
       consecutive healthy seconds (strong hysteresis — no oscillation). */
    this.fpsAcc += delta;
    this.fpsCount++;
    if (this.lastFpsT === 0) this.lastFpsT = now;
    if (now - this.lastFpsT >= 1000) {
      this.fps = Math.round((this.fpsCount * 1000) / this.fpsAcc);
      const slow = this.fpsAcc / this.fpsCount > minDelta * 1.9;
      if (slow) {
        this.slowSamples++;
        this.healthySamples = 0;
        if (this.slowSamples >= 2 && this.scaleStep < SCALE_STEPS.length - 1) {
          this.scaleStep++;
          this.slowSamples = 0;
          this.emaFrame = minDelta;
          this.resize();
        }
      } else {
        this.healthySamples++;
        this.slowSamples = 0;
        if (this.healthySamples >= 8 && this.scaleStep > 0) {
          this.scaleStep--;
          this.healthySamples = 0;
          this.emaFrame = minDelta;
          this.resize();
        }
      }
      this.fpsAcc = 0;
      this.fpsCount = 0;
      this.lastFpsT = now;
      this.onStats?.({
        scale: SCALE_STEPS[this.scaleStep],
        fps: this.fps,
        mode: this.staticMode ? "static" : "live",
      });
    }

    // scene clock — continuous across halt/kick cycles (no scene jump)
    const sceneT = this.staticMode ? STATIC_T : this.now() / 1000;

    // palette lerp
    if (this.palT < 1) {
      this.palT = Math.min(1, (now - this.palStart) / this.palDur);
      const e = easeInOutCubic(this.palT);
      this.palCur = lerpPalette(this.palFrom, this.palTo, e);
      if (this.palT >= 1 && this.staticMode) {
        this.draw(sceneT);
        this.transitionOnly = false;
        this.halt();
        return;
      }
    }

    this.draw(sceneT);
  };

  private draw(t: number): void {
    const gl = this.gl;
    if (!gl) return;
    const p = this.palT < 1 ? this.palCur : this.palTo;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.loc.u_res, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.loc.u_time, t);
    gl.uniform3f(this.loc.u_c1, p.c1[0] / 255, p.c1[1] / 255, p.c1[2] / 255);
    gl.uniform3f(this.loc.u_c2, p.c2[0] / 255, p.c2[1] / 255, p.c2[2] / 255);
    gl.uniform3f(this.loc.u_c3, p.c3[0] / 255, p.c3[1] / 255, p.c3[2] / 255);
    gl.uniform3f(this.loc.u_hl, p.hl[0] / 255, p.hl[1] / 255, p.hl[2] / 255);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** (Re)compute the backing store from the current viewport + scale. */
  resize(): void {
    if (!this.ok || this.disposed) return;
    const vw =
      this.canvas.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 0);
    const vh =
      this.canvas.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 0);
    const dpr = Math.min(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      this.dprCap,
    );
    const scale = SCALE_STEPS[this.scaleStep];
    const w = Math.max(2, Math.round(vw * dpr * scale));
    const h = Math.max(2, Math.round(vh * dpr * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (this.staticMode && !this.transitionOnly) this.draw(STATIC_T);
  }

  /** Render exactly one static frame (reduced-motion composition). */
  renderStatic(): void {
    if (!this.ok || this.disposed) return;
    this.resize();
    this.draw(STATIC_T);
  }

  dispose(): void {
    this.disposed = true;
    this.halt();
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", this.onResizeBound);
      window.removeEventListener("orientationchange", this.onResizeBound);
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisBound);
    }
    const gl = this.gl;
    if (gl) {
      const lose = gl.getExtension("WEBGL_lose_context");
      lose?.loseContext();
      this.gl = null;
    }
    this.ok = false;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   The component
   ═══════════════════════════════════════════════════════════════════════ */

export interface WaveAmbientBackgroundProps {
  /** Wave on/off (radioMode). Fades the whole layer in/out. */
  active: boolean;
  /** Currently playing track — drives the palette via its artwork. */
  currentTrack: Track | null;
}

/** Per-track derived palette cache (extraction + k-means is not free). */
const paletteCache = new Map<string, WavePalette>();

export const WaveAmbientBackground = memo(function WaveAmbientBackground({
  active,
  currentTrack,
}: WaveAmbientBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<LiquidEngine | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const reduceMotion = useAppStore((s) => s.reduceMotion);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const mediaReduce = usePrefersReducedMotion();
  const staticMode = !animationsEnabled || reduceMotion || mediaReduce;

  const [mode, setMode] = useState<"webgl" | "css">("webgl");
  const [scaleInfo, setScaleInfo] = useState<{ scale: number; fps: number }>({
    scale: SCALE_STEPS[0],
    fps: 0,
  });

  /* ── palette: artwork → dark liquid colours (kept fresh even while
        inactive, so the scene is instantly ready when the Wave turns on).
        The DEFAULT is DERIVED at render (no state) — only real extractions
        go through state, always asynchronously (no sync setState in
        effects → no cascading renders). ── */
  const trackId = currentTrack?.id ?? null;
  const coverUrl = currentTrack?.cover ?? null;
  const [extracted, setExtracted] = useState<{ id: string; p: WavePalette } | null>(null);
  const palette = extracted && extracted.id === trackId ? extracted.p : DEFAULT_WAVE_PALETTE;

  useEffect(() => {
    if (!trackId || !coverUrl) return; // no track → derived DEFAULT, nothing to do
    const cached = paletteCache.get(trackId);
    if (cached) {
      // async publish (microtask) — keeps effects free of sync setState
      queueMicrotask(() => {
        setExtracted((prev) => (prev?.id === trackId ? prev : { id: trackId, p: cached }));
      });
      return;
    }
    let cancelled = false;
    extractColors(coverUrl).then((dc: DominantColors) => {
      if (cancelled) return;
      const p = deriveWavePalette(dc);
      paletteCache.set(trackId, p);
      setExtracted({ id: trackId, p });
    });
    return () => {
      cancelled = true;
    };
  }, [trackId, coverUrl]);

  /* ── publish CSS variables (fallback layer + future Wave UI hooks) ── */
  useEffect(() => {
    if (typeof document === "undefined") return;
    const css = paletteToCss(palette);
    const root = document.documentElement;
    root.style.setProperty("--wave-color-1", css.c1);
    root.style.setProperty("--wave-color-2", css.c2);
    root.style.setProperty("--wave-color-3", css.c3);
    root.style.setProperty("--wave-highlight", css.hl);
  }, [palette]);

  /* ── engine lifecycle ──
     Created lazily on first activation; parked when inactive (the CSS
     wrapper fades the frozen frame out, then we stop burning GPU).
     Palette changes ride the same effect: setPalette (idempotent) +
     start (no-op while running) — so a track change mid-Wave dissolves
     the colours inside the engine without extra wiring. */
  useEffect(() => {
    if (!active) {
      if (engineRef.current) {
        if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = window.setTimeout(() => {
          engineRef.current?.stop();
          stopTimerRef.current = null;
        }, 1200);
      }
      return;
    }
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }

    if (!engineRef.current && canvasRef.current) {
      const eng = new LiquidEngine(canvasRef.current, {
        staticMode,
        onStats: (s) => setScaleInfo({ scale: s.scale, fps: s.fps }),
      });
      if (eng.ok) {
        engineRef.current = eng;
      } else {
        eng.dispose();
        setMode("css");
      }
    }
    const eng = engineRef.current;
    if (eng) {
      eng.setPalette(palette, 950);
      eng.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, palette]);

  /* ── static-mode switches mid-session (user toggles the setting) ── */
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng || !active) return;
    eng.setStaticMode(staticMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staticMode]);

  /* ── QA hook: tiny, inert, useful for tests + visual QA ── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as unknown as Record<string, unknown>).__mqWaveAmbient = {
      mode,
      motion: staticMode ? "static" : "live",
      active,
      scale: mode === "webgl" ? scaleInfo.scale : 1,
      fps: scaleInfo.fps,
      palette: paletteToCss(palette),
    };
  }, [mode, staticMode, active, scaleInfo, palette]);

  /* ── unmount: full cleanup ── */
  useEffect(() => {
    return () => {
      if (stopTimerRef.current !== null) window.clearTimeout(stopTimerRef.current);
      engineRef.current?.dispose();
      engineRef.current = null;
      if (typeof window !== "undefined") {
        delete (window as unknown as Record<string, Record<string, unknown>>).__mqWaveAmbient;
      }
    };
  }, []);

  return (
    <div
      className="mq-wave-ambient"
      data-active={active ? "true" : "false"}
      data-mode={mode}
      data-wave-motion={staticMode ? "static" : "live"}
      data-scale={mode === "webgl" ? String(scaleInfo.scale) : "css"}
      aria-hidden="true"
    >
      {mode === "webgl" ? (
        <canvas ref={canvasRef} className="mq-wave-canvas" />
      ) : (
        /* CSS fallback — the same scene, composed from soft radial
           gradients + slow compositor drift (registered colors cross-fade) */
        <div className="mq-wave-fallback" data-wave-motion={staticMode ? "static" : "live"}>
          <div className="mq-wf-base" />
          <div className="mq-wf-liquid" />
          <div className="mq-wf-depth" />
          <div className="mq-wf-streak" />
          <div className="mq-wf-grain" />
        </div>
      )}
      {/* readability scrims — darken only where UI bars sit */}
      <div className="mq-wave-scrim mq-wave-scrim-top" />
      <div className="mq-wave-scrim mq-wave-scrim-bottom" />
    </div>
  );
});

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduce;
}

export default WaveAmbientBackground;
