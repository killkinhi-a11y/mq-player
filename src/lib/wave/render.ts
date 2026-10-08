/**
 * MQ Wave render core — V3 PHASE 14-17 (полная переработка Wave).
 *
 * Pure drawing + geometry helpers for the redesigned waveform. The component
 * (WaveformView) owns the canvas and the PlaybackClock subscription; this
 * module owns the PIXEL MATH so it stays unit-testable without a DOM.
 *
 * RENDERING REDESIGN (§14-15):
 *  - TWO-LAYER cache: the full bar field is pre-rendered ONCE into two
 *    offscreen layers (unplayed style + played style). Per frame the
 *    compositor does 2 drawImage + 1 clip + playhead — O(bars) work happens
 *    only on data/size/palette changes, not at 60fps (§17).
 *  - Played bars: vertical gradient artwork-accent → deep tone + subtle
 *    glow (restrained, premium — not a disco).
 *  - Unplayed bars: quiet translucent; BUFFERED region gets a slightly
 *    brighter tint so loading progress is visible (§15 buffer visualization).
 *  - Rounded mirrored bars, DPR-aware, professional typography via
 *    tabular-nums labels in the component.
 *
 * STATE MODEL (§16): IDLE / LOADING / BUFFERING / PLAYING / PAUSED / SEEKING
 * / ERROR / ENDED — derived in the component; this module maps each state
 * to its visual parameters (opacity, pulse, placeholder style).
 */

/* ── Geometry ───────────────────────────────────────────────────────── */

export interface BarGeometry {
  barCount: number;
  barW: number;
  gap: number;
  usableW: number;
  x0: number;
  mid: number;
  maxBarH: number;
  step: number;
}

export function computeBarGeometry(width: number, height: number): BarGeometry {
  // Adaptive bar width: narrow screens get thinner bars so the field stays
  // detailed on mobile (§15 responsive scaling).
  const barW = width < 480 ? 2 : 3;
  const gap = width < 480 ? 2 : 2;
  const step = barW + gap;
  const barCount = Math.max(8, Math.floor(width / step));
  const usableW = barCount * step - gap;
  const x0 = (width - usableW) / 2;
  const mid = height / 2;
  const maxBarH = height - 4;
  return { barCount, barW, gap, usableW, x0, mid, maxBarH, step };
}

/* ── State visuals (§16) ────────────────────────────────────────────── */

export type WaveState =
  | "idle"
  | "loading"
  | "buffering"
  | "playing"
  | "paused"
  | "seeking"
  | "error"
  | "ended";

export interface StateVisual {
  /** Opacity of the whole field. */
  fieldOpacity: number;
  /** Played-layer opacity multiplier. */
  playedOpacity: number;
  /** Subtle breathing pulse (applied to buffer strip / placeholders). */
  pulse: boolean;
  /** Show the playhead. */
  playhead: boolean;
  /** Placeholder bars (skeleton) instead of real peaks. */
  placeholder: boolean;
}

export const STATE_VISUALS: Record<WaveState, StateVisual> = {
  idle:      { fieldOpacity: 0.45, playedOpacity: 0,    pulse: false, playhead: false, placeholder: true },
  loading:   { fieldOpacity: 0.55, playedOpacity: 0.4,  pulse: true,  playhead: false, placeholder: true },
  buffering: { fieldOpacity: 0.75, playedOpacity: 0.75, pulse: true,  playhead: true,  placeholder: false },
  playing:   { fieldOpacity: 1.0,  playedOpacity: 1.0,  pulse: false, playhead: true,  placeholder: false },
  paused:    { fieldOpacity: 0.95, playedOpacity: 0.9,  pulse: false, playhead: true,  placeholder: false },
  seeking:   { fieldOpacity: 1.0,  playedOpacity: 1.0,  pulse: false, playhead: true,  placeholder: false },
  error:     { fieldOpacity: 0.5,  playedOpacity: 0,    pulse: false, playhead: false, placeholder: true },
  ended:     { fieldOpacity: 0.85, playedOpacity: 0.8,  pulse: false, playhead: false, placeholder: false },
};

/** Derive the §16 state from macro signals. Pure. */
export function deriveWaveState(input: {
  hasTrack: boolean;
  hasDuration: boolean;
  loading: boolean;
  buffering: boolean;
  playing: boolean;
  scrubbing: boolean;
  error: boolean;
  nearEnd: boolean;
}): WaveState {
  if (input.error) return "error";
  if (!input.hasTrack || !input.hasDuration) return "idle";
  if (input.scrubbing) return "seeking";
  if (input.loading) return "loading";
  if (input.buffering && input.playing) return "buffering";
  if (input.playing) return "playing";
  if (input.nearEnd) return "ended";
  return "paused";
}

/* ── Colors (artwork-aware, §15) ────────────────────────────────────── */

export interface WaveColors {
  /** Played bar gradient top — artwork highlight / platinum. */
  playedHi: string;
  /** Played bar gradient bottom — deep artwork tone. */
  playedLo: string;
  /** Unplayed bar fill. */
  quiet: string;
  /** Buffered (but unplayed) tint. */
  buffered: string;
  /** Placeholder (unknown/skeleton) fill. */
  placeholder: string;
  /** Playhead line. */
  playhead: string;
  /** Slim track fallback color. */
  track: string;
}

export interface PaletteInput {
  /** Artwork accent [r,g,b] (dominant color) — null → platinum default. */
  accent: [number, number, number] | null;
  /** Deep tone [r,g,b] from the same artwork. */
  deep: [number, number, number] | null;
}

export function buildWaveColors(p: PaletteInput): WaveColors {
  const accent = p.accent ?? [215, 226, 255]; // platinum-hi default
  const deep = p.deep ?? [24, 34, 58];
  const accentCss = `rgb(${accent[0]},${accent[1]},${accent[2]})`;
  const deepCss = `rgb(${Math.round(deep[0])},${Math.round(deep[1])},${Math.round(deep[2])})`;
  const mix = (a: [number, number, number], b: [number, number, number], t: number) =>
    `rgb(${Math.round(a[0] * (1 - t) + b[0] * t)},${Math.round(a[1] * (1 - t) + b[1] * t)},${Math.round(a[2] * (1 - t) + b[2] * t)})`;
  return {
    playedHi: accentCss,
    playedLo: mix(accent, deep, 0.55),
    // §15 QA (VLM feedback): the unplayed field must READ as a waveform,
    // not a flat dark track — keep artwork hue but lift the lightness.
    quiet: mix(accent, deep, 0.64),
    buffered: mix(accent, deep, 0.5), // clearly brighter than quiet
    placeholder: mix(accent, deep, 0.78),
    playhead: accentCss,
    track: mix(accent, deep, 0.6),
  };
}

/* ── Bar field pre-render (two-layer cache, §17) ────────────────────── */

export interface LayerSpec {
  geom: BarGeometry;
  /** Peak per bar (0..1), length === geom.barCount. */
  bars: Float32Array;
  /** Per bar: is the value REAL (known) vs placeholder-derived. */
  known: Uint8Array | null;
  colors: WaveColors;
  state: WaveState;
  /** Extra vertical glow for played layer (restrained). */
  withGlow: boolean;
}

/** Draw ONE bar field style into a (DPR-scaled) 2D context. */
export function drawBarLayer(ctx: CanvasRenderingContext2D, spec: LayerSpec, played: boolean): void {
  const { geom, bars, known, colors } = spec;
  const visual = STATE_VISUALS[spec.state];
  const w = geom.x0 * 2 + geom.usableW; // full css width
  ctx.clearRect(0, 0, w, geom.mid * 2);

  // Placeholder bars (no data yet) — even ghost field for idle/loading/error.
  if (visual.placeholder && !played) {
    ctx.fillStyle = colors.placeholder;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < geom.barCount; i++) {
      const x = geom.x0 + i * geom.step;
      const v = placeholderHeight(i, geom.barCount);
      const bh = Math.max(2, v * geom.maxBarH);
      ctx.beginPath();
      ctx.roundRect(x, geom.mid - bh / 2, geom.barW, bh, geom.barW / 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  if (played && visual.playedOpacity === 0) return; // nothing played yet

  // Real bars.
  for (let i = 0; i < geom.barCount; i++) {
    const x = geom.x0 + i * geom.step;
    const isKnown = !known || known[i] > 0;
    let v = bars[i];
    if (!isKnown) v = placeholderHeight(i, geom.barCount);
    const bh = Math.max(2, Math.max(0, v) * geom.maxBarH);

    if (played) {
      // Vertical gradient — signature "instrument" look, subtle glow.
      const g = ctx.createLinearGradient(0, geom.mid - bh / 2, 0, geom.mid + bh / 2);
      g.addColorStop(0, colors.playedHi);
      g.addColorStop(1, colors.playedLo);
      ctx.fillStyle = g;
      if (spec.withGlow) {
        ctx.save();
        ctx.shadowColor = colors.playedHi;
        ctx.shadowBlur = 4; // restrained — premium, not a disco
        ctx.beginPath();
        ctx.roundRect(x, geom.mid - bh / 2, geom.barW, bh, geom.barW / 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.roundRect(x, geom.mid - bh / 2, geom.barW, bh, geom.barW / 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = isKnown ? colors.quiet : colors.placeholder;
      ctx.globalAlpha = isKnown ? 1 : 0.45;
      ctx.beginPath();
      ctx.roundRect(x, geom.mid - bh / 2, geom.barW, bh, geom.barW / 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

/** Deterministic gentle hill placeholder (so idle/loading looks designed). */
export function placeholderHeight(i: number, count: number): number {
  const t = count <= 1 ? 0.5 : i / (count - 1);
  // Smooth hill with a touch of ripple — no randomness between frames.
  const hill = Math.sin(Math.PI * t) * 0.55 + 0.18;
  const ripple = Math.sin(t * Math.PI * 7) * 0.06;
  return Math.max(0.12, Math.min(1, hill + ripple));
}

/* ── Buffer visualization (§15) ─────────────────────────────────────── */

/**
 * Fraction (0..1) of the track that is buffered ahead of `pos`.
 * Reads the ACTIVE transport: WASM backend stats or the audio element's
 * buffered TimeRanges. Honest 0 when nothing measurable.
 */
export function bufferedAheadRatio(pos: number, dur: number, wasmBufferedSec?: number | null, elementBuffered?: { start: number; end: number }[] | null): number {
  if (!(dur > 0) || !(pos >= 0)) return 0;

  if (typeof wasmBufferedSec === "number" && wasmBufferedSec > 0) {
    return Math.max(0, Math.min(1, (pos + wasmBufferedSec) / dur));
  }
  if (elementBuffered && elementBuffered.length > 0) {
    // Find the range containing pos; take its end.
    let end = pos;
    for (const r of elementBuffered) {
      if (r.start <= pos + 0.25 && r.end > end) end = r.end;
    }
    return Math.max(0, Math.min(1, end / dur));
  }
  return 0;
}

/** Draw the buffer indicator strip (below the bar field, ultra-subtle). */
export function drawBufferStrip(
  ctx: CanvasRenderingContext2D,
  geom: BarGeometry,
  playedX: number,
  bufferedX: number,
  colors: WaveColors,
  pulsePhase: number,
): void {
  if (!(bufferedX > playedX + 1)) return;
  const y = geom.mid * 2 - 1.5;
  ctx.fillStyle = colors.buffered;
  ctx.globalAlpha = 0.28 + 0.12 * Math.sin(pulsePhase); // gentle breathing
  ctx.beginPath();
  ctx.roundRect(playedX, y, Math.max(1, bufferedX - playedX), 2, 1);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Slim progress track fallback (no waveform data — honest, still seekable). */
export function drawSlimTrack(
  ctx: CanvasRenderingContext2D,
  geom: BarGeometry,
  playedX: number,
  colors: WaveColors,
): void {
  const y = geom.mid;
  ctx.fillStyle = colors.track;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.roundRect(geom.x0, y - 1.5, geom.usableW, 3, 1.5);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.playedHi;
  const fillW = Math.max(2, Math.min(geom.usableW, playedX - geom.x0));
  ctx.beginPath();
  ctx.roundRect(geom.x0, y - 1.5, fillW, 3, 1.5);
  ctx.fill();
}
