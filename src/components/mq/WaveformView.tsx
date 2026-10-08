"use client";

/**
 * WaveformView — MQ WAVE V3 (PHASE 14-19). ПОЛНАЯ ПЕРЕРАБОТКА.
 *
 * What changed vs the V2 wave (not cosmetic — rendering + interaction +
 * performance + state redesign):
 *
 * RENDERING (§14-15): two-layer offscreen bar cache — the full bar field is
 * pre-rendered once (unplayed layer + played layer with artwork-aware
 * vertical gradients + restrained glow); per frame the compositor does
 * 2 drawImage + a clip + the playhead. O(bars) work happens only on
 * data/size/palette changes, never at 60fps.
 *
 * STATE MODEL (§16): eight visually distinct states exposed as
 * data-wave-state: idle · loading · buffering · playing · paused · seeking ·
 * error · ended — placeholder hills while idle/loading, breathing buffer
 * strip while buffering, motion freeze on pause, instant feedback on seek.
 *
 * BUFFER (§15): a subtle strip under the bars shows buffered-ahead data
 * (WASM bufferedFrames / element TimeRanges; honest nothing on SDK paths).
 *
 * ARTWORK-AWARE (§15): the played gradient derives from the CURRENT track's
 * dominant artwork color (race-guarded per track id §18); no artwork → the
 * signature platinum.
 *
 * PERFORMANCE (§17): NO private rAF — the component subscribes to THE
 * PlaybackClock (one loop for Wave + Lyrics + Progress + engine). React
 * state changes only on macro events; the playhead rides refs.
 *
 * INTERACTION (§15): click-to-seek, drag-scrub with commit on release,
 * hover time bubble, keyboard ±5s/±1s/Home/End with window-capture slider
 * semantics (kept from V2 — tested contract).
 *
 * HONEST FALLBACKS: no data (DRM/SDK/unknown) → slim seekable progress
 * track; loading → shimmer; every state is visible, nothing faked.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { currentPlaybackPosition, seekPlayback, getActiveWasmBackend } from "@/lib/wasm-audio";
import { getAudioElement } from "@/lib/audioEngine";
import { subscribeClock, wakeClock } from "@/lib/playback/clock";
import { useAppStore } from "@/store/useAppStore";
import { formatDuration } from "@/lib/musicApi";
import { useWaveform } from "@/lib/waveform/useWaveform";
import { getLiveSampled } from "@/lib/waveform/liveSampler";
import { rebucketPeaks, timeToX, xToTime } from "@/lib/waveform/computePeaks";
import { extractColors, DEFAULT_COLORS } from "@/hooks/useDominantColor";
import {
  buildWaveColors,
  bufferedAheadRatio,
  computeBarGeometry,
  deriveWaveState,
  drawBarLayer,
  drawBufferStrip,
  drawSlimTrack,
  placeholderHeight,
  type BarGeometry,
  type WaveColors,
  type WaveState,
} from "@/lib/wave/render";
import type { Track } from "@/lib/musicApi";

export interface WaveformViewProps {
  track: Track | null;
  /** Track duration (seconds) — the store's live-corrected value. */
  duration: number;
  /** Canvas CSS height. */
  height?: number;
  /** Seek with store update (players' seekToTime); defaults to the global router. */
  onSeek?: (t: number) => void;
  /** Compact = less height, no hover bubble (mobile bars). */
  variant?: "player" | "compact";
  ariaLabel?: string;
  /** Extra time labels row (current / remaining). */
  showTimeLabels?: boolean;
}

/* ── Palette race guard (§18): stale artwork colors must not leak onto a
   new track. Extraction keyed by track id; late results dropped. ───────── */
interface PaletteState {
  accent: [number, number, number] | null;
  deep: [number, number, number] | null;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const isDefaultColors = (c: { primary: string; dark: string }) =>
  c.primary === DEFAULT_COLORS.primary && c.dark === DEFAULT_COLORS.dark;

export function WaveformView({
  track,
  duration,
  height,
  onSeek,
  variant = "player",
  ariaLabel = "Позиция воспроизведения",
  showTimeLabels = false,
}: WaveformViewProps) {
  const waveformEnabled = useAppStore((s) => s.waveformEnabled);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const isBuffering = useAppStore((s) => s.isBuffering);
  const playbackState = useAppStore((s) => s.playbackState);
  const setProgress = useAppStore((s) => s.setProgress);

  const canvasH = height ?? (variant === "compact" ? 34 : 52);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { status, data } = useWaveform(track, waveformEnabled);

  /* ── Latest-values refs (macro updates in, zero re-renders out) ────── */
  const dataRef = useRef(data);
  const durationRef = useRef(duration);
  const scrubRef = useRef<number | null>(null);
  const hoverRef = useRef<number | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const colorsRef = useRef<WaveColors>(buildWaveColors({ accent: null, deep: null }));
  const bufferXRef = useRef(0); // 0..1 buffered-ahead ratio
  const pulseRef = useRef(0);
  const geomRef = useRef<BarGeometry | null>(null);
  const layersRef = useRef<{ played: HTMLCanvasElement | null; unplayed: HTMLCanvasElement | null; key: string }>({ played: null, unplayed: null, key: "" });
  const needsDrawRef = useRef(true);

  useEffect(() => { dataRef.current = data; needsDrawRef.current = true; wakeClock(); }, [data]);
  useEffect(() => { durationRef.current = duration; needsDrawRef.current = true; wakeClock(); }, [duration]);
  useEffect(() => { needsDrawRef.current = true; wakeClock(); }, [isPlaying, isBuffering, playbackState]);

  /* ── Artwork-aware palette (§15/§18) ───────────────────────────────── */
  useEffect(() => {
    let stale = false;
    const cover = track?.cover;
    const trackId = track?.id ?? null;
    if (!cover || !trackId) {
      colorsRef.current = buildWaveColors({ accent: null, deep: null });
      needsDrawRef.current = true;
      wakeClock();
      return;
    }
    extractColors(cover).then((c) => {
      if (stale) return; // §18: a later track won — drop the stale palette
      let palette: PaletteState = { accent: null, deep: null };
      if (!isDefaultColors(c)) {
        const accent: [number, number, number] = [c.rgb.r, c.rgb.g, c.rgb.b];
        const deep = hexToRgb(c.dark) ?? hexToRgb(c.secondary);
        palette = { accent, deep };
      }
      colorsRef.current = buildWaveColors(palette);
      needsDrawRef.current = true;
      wakeClock();
    });
    return () => { stale = true; };
  }, [track?.id, track?.cover]);

  /* ── Theme invalidation (CSS-var swaps) ───────────────────────────── */
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;
    const root = document.documentElement;
    const mo = new MutationObserver(() => {
      needsDrawRef.current = true;
      wakeClock();
    });
    mo.observe(root, { attributes: true, attributeFilter: ["style", "class"] });
    return () => mo.disconnect();
  }, []);

  const seek = useCallback(
    (t: number) => {
      const dur = durationRef.current;
      const clamped = Math.max(0, Math.min(dur > 0 ? dur : t, t));
      if (onSeek) onSeek(clamped);
      else {
        seekPlayback(clamped);
        setProgress(clamped);
      }
      wakeClock();
    },
    [onSeek, setProgress],
  );

  /* ── Sizing (DPR aware) ────────────────────────────────────────────── */
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const apply = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const w = Math.max(10, Math.floor(rect.width));
      const h = canvasH;
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      geomRef.current = computeBarGeometry(w, h);
      needsDrawRef.current = true;
      wakeClock();
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [canvasH]);

  /* ── Buffer refresh (cheap, 2 Hz — §15) ───────────────────────────── */
  useEffect(() => {
    const read = () => {
      const dur = durationRef.current || 0;
      if (!(dur > 0)) { bufferXRef.current = 0; return; }
      const pos = currentPlaybackPosition();
      let ratio = 0;
      try {
        const wasm = getActiveWasmBackend();
        const stats = (wasm as unknown as { stats?: { bufferedFrames?: number }; ctx?: { sampleRate?: number } } | null);
        if (wasm && stats?.stats?.bufferedFrames != null && stats.ctx?.sampleRate) {
          ratio = bufferedAheadRatio(pos, dur, stats.stats.bufferedFrames / stats.ctx.sampleRate, null);
        } else {
          const el = getAudioElement();
          if (el && el.src) {
            const ranges: { start: number; end: number }[] = [];
            for (let i = 0; i < el.buffered.length; i++) {
              ranges.push({ start: el.buffered.start(i), end: el.buffered.end(i) });
            }
            ratio = bufferedAheadRatio(pos, dur, null, ranges);
          }
        }
      } catch { /* honest nothing */ }
      if (Math.abs(ratio - bufferXRef.current) > 0.001) {
        bufferXRef.current = ratio;
        needsDrawRef.current = true;
        if (!isPlaying) wakeClock();
      }
    };
    read();
    const iv = setInterval(read, 500);
    return () => clearInterval(iv);
  }, [isPlaying]);

  /* ── Layer cache build (O(bars) — only on real changes, §17) ──────── */
  const rebuildLayers = useCallback(() => {
    const geom = geomRef.current;
    const { w, h, dpr } = sizeRef.current;
    if (!geom || w <= 0) return;
    const d = dataRef.current;

    let bars: Float32Array;
    let known: Uint8Array | null = null;
    if (d) {
      let peaks = d.peaks;
      if (!d.complete) {
        const live = getLiveSampled();
        if (live && live.key === d.key && live.peaks.length === d.bucketCount) {
          const merged = new Float32Array(d.peaks.length);
          for (let i = 0; i < merged.length; i++) merged[i] = Math.max(d.peaks[i], live.peaks[i]);
          peaks = merged;
        }
      }
      bars = peaks.length === geom.barCount ? peaks : rebucketPeaks(peaks, geom.barCount);
      if (!d.complete) {
        const live = getLiveSampled();
        const liveBars = live && live.key === d.key
          ? (live.peaks.length === geom.barCount ? live.peaks : rebucketPeaks(live.peaks, geom.barCount))
          : null;
        known = new Uint8Array(geom.barCount);
        for (let i = 0; i < geom.barCount; i++) {
          known[i] = (liveBars ? liveBars[i] > 0 : bars[i] > 0) ? 1 : 0;
        }
      }
    } else {
      // No data — placeholder hill drives the ghost field.
      bars = new Float32Array(geom.barCount);
      for (let i = 0; i < geom.barCount; i++) bars[i] = placeholderHeight(i, geom.barCount);
      known = null;
    }

    const dataKey = d ? `${d.key}|${d.complete ? 1 : 0}` : "none";
    const key = `${dataKey}|${w}x${h}|${dpr}|${colorsRef.current.playedHi}`;
    const current = layersRef.current;
    if (current.key === key && current.played && current.unplayed) return; // cache valid

    const mk = () => {
      const c = document.createElement("canvas");
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
      return c;
    };
    const played = current.played && current.key.startsWith(dataKey) ? current.played : mk();
    const unplayed = current.unplayed && current.key.startsWith(dataKey) ? current.unplayed : mk();

    const stateForLayers: WaveState = d ? "playing" : "idle"; // layers hold full style; state modulates at composite time
    for (const [canvas, isPlayed] of [[unplayed, false], [played, true]] as const) {
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBarLayer(ctx, { geom, bars, known, colors: colorsRef.current, state: stateForLayers, withGlow: true }, isPlayed);
    }
    layersRef.current = { played, unplayed, key };
  }, []);

  /* ── The composite draw (per active frame — cheap: 2 drawImage + playhead) ── */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { w, h, dpr } = sizeRef.current;
    const dur = durationRef.current || 0;
    const d = dataRef.current;
    const colors = colorsRef.current;
    const geom = geomRef.current ?? computeBarGeometry(w, h);

    const pos = scrubRef.current ?? currentPlaybackPosition();
    const playX = dur > 0 ? timeToX(pos, geom.usableW, dur) + geom.x0 : geom.x0;

    // State-derived visual params (§16).
    const nearEnd = !isPlaying && dur > 0 && pos >= dur - 0.6;
    const waveState: WaveState = deriveWaveState({
      hasTrack: !!track,
      hasDuration: dur > 0,
      loading: status === "loading",
      buffering: isBuffering && isPlaying,
      playing: isPlaying,
      scrubbing: scrubRef.current !== null,
      error: playbackState === "error",
      nearEnd,
    });
    // Expose for CSS/tests without React churn.
    if (containerRef.current && containerRef.current.getAttribute("data-wave-state") !== waveState) {
      containerRef.current.setAttribute("data-wave-state", waveState);
    }

    const pulseActive = waveState === "buffering" || (waveState === "loading" && isPlaying);
    pulseRef.current += pulseActive ? 0.09 : 0;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!d) {
      // Honest slim track — still fully seekable.
      drawSlimTrack(ctx, geom, playX, colors);
      return;
    }

    rebuildLayers();
    const layers = layersRef.current;

    // Unplayed field.
    if (layers.unplayed) {
      ctx.globalAlpha = 1;
      ctx.drawImage(layers.unplayed, 0, 0, w, h);
    }
    // Played field — clipped at the playhead.
    if (layers.played && pos > 0 && dur > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, Math.max(0, playX), h);
      ctx.clip();
      ctx.drawImage(layers.played, 0, 0, w, h);
      ctx.restore();
    }

    // Buffer strip (§15) — ahead of the playhead, behind nothing.
    const bufferedX = geom.x0 + timeToX(bufferXRef.current * dur, geom.usableW, dur);
    drawBufferStrip(ctx, geom, playX, Math.min(bufferedX, geom.x0 + geom.usableW), colors, pulseRef.current);

    // Playhead — hairline + glow bead (essential motion; reduce-motion never
    // disables the playhead — it is information, not decoration).
    if (waveState !== "idle" && waveState !== "error") {
      const px = Math.max(geom.x0, Math.min(geom.x0 + geom.usableW, playX));
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillRect(px - 0.75, 1, 1.5, h - 2);
      const g = ctx.createRadialGradient(px, h - 3, 0, px, h - 3, 7);
      g.addColorStop(0, "rgba(255,255,255,0.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(px - 7, h - 10, 14, 14);
    }

    // Hover marker (fine pointers) — thin guide line.
    if (hoverRef.current !== null && scrubRef.current === null && dur > 0) {
      const hx = geom.x0 + timeToX(hoverRef.current, geom.usableW, dur);
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(hx - 0.5, 2, 1, h - 4);
    }
  }, [isPlaying, isBuffering, playbackState, status, track, rebuildLayers]);

  /* ── THE clock subscription — no private rAF (§13/§17/§19) ────────── */
  useEffect(() => {
    const unsub = subscribeClock(() => {
      if (document.hidden) return;
      draw();
      needsDrawRef.current = false;
    }, { throttleMs: 0 });
    wakeClock(); // first paint
    return unsub;
  }, [draw]);

  /* ── Hover bubble state (declared BEFORE the handlers that set it) ─── */
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  /* ── Pointer interactions (click / drag to seek) ───────────────────── */
  const pointerTime = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const { w } = sizeRef.current;
    const geom = geomRef.current;
    const x = clientX - rect.left;
    const usableW = geom ? geom.usableW : w;
    const x0 = geom ? geom.x0 : 0;
    return xToTime(x - x0, usableW, durationRef.current || 0);
  }, []);

  const draggingRef = useRef(false);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* synthetic pointer */ }
    draggingRef.current = true;
    setIsScrubbing(true);
    scrubRef.current = pointerTime(e.clientX);
    wakeClock();
  }, [pointerTime]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const t = pointerTime(e.clientX);
    if (draggingRef.current) {
      scrubRef.current = t; // instant position feedback (§16 SEEKING)
      wakeClock();
    } else {
      hoverRef.current = t;
      setHoverTime(t); // rare, cheap — only while hovering
    }
  }, [pointerTime]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsScrubbing(false);
    const t = pointerTime(e.clientX);
    scrubRef.current = null;
    seek(t);
    wakeClock();
  }, [pointerTime, seek]);

  const onPointerCancel = useCallback(() => {
    draggingRef.current = false;
    setIsScrubbing(false);
    scrubRef.current = null;
    wakeClock();
  }, []);

  const onPointerLeave = useCallback(() => {
    hoverRef.current = null;
    setHoverTime(null);
    wakeClock();
  }, []);

  /* ── Keyboard slider semantics (WINDOW-CAPTURE ownership — V2 contract) ── */
  const seekRef = useRef(seek);
  useEffect(() => { seekRef.current = seek; }, [seek]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = canvasRef.current;
      if (!c || document.activeElement !== c) return;
      const dur = durationRef.current || 0;
      const pos = currentPlaybackPosition();
      let next: number | null = null;
      if (e.key === "ArrowRight") next = pos + (e.shiftKey ? 1 : 5);
      else if (e.key === "ArrowLeft") next = pos - (e.shiftKey ? 1 : 5);
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = dur;
      if (next === null) return;
      e.preventDefault();
      e.stopPropagation();
      seekRef.current(Math.max(0, Math.min(dur, next)));
      wakeClock();
    };
    window.addEventListener("keydown", onKey, true); // CAPTURE
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  /* ── Live ARIA value (throttled to ~4 Hz — not per frame) ──────────── */
  const [ariaNow, setAriaNow] = useState(0);
  useEffect(() => {
    const i = setInterval(() => {
      setAriaNow(Math.floor(currentPlaybackPosition()));
    }, 250);
    return () => clearInterval(i);
  }, []);

  const loading = status === "loading";

  const ariaValueText = useMemo(
    () => `${formatDuration(ariaNow)} из ${formatDuration(duration)}`,
    [ariaNow, duration],
  );

  return (
    <div
      ref={containerRef}
      className="w-full select-none"
      data-mq-waveform=""
      data-status={loading ? "loading" : data ? (data.complete ? "ready" : "partial") : "unavailable"}
      data-wave-state="idle"
    >
      <div
        ref={wrapRef}
        className="relative"
        style={{ height: canvasH, touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, Math.round(duration))}
          aria-valuenow={Math.max(0, Math.round(ariaNow))}
          aria-valuetext={ariaValueText}
          onKeyDown={undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={onPointerLeave}
          className="block w-full outline-none"
          style={{ cursor: "pointer", touchAction: "none" }}
        />
        <style>{`
          [data-mq-waveform] canvas:focus-visible {
            border-radius: 10px;
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--mq-text, #f0f0f0) 55%, transparent);
          }
          [data-mq-waveform][data-wave-state="buffering"] canvas,
          [data-mq-waveform][data-wave-state="loading"] canvas {
            animation: mq-wave-breathe 1.6s ease-in-out infinite;
          }
          @keyframes mq-wave-breathe {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.82; }
          }
          @media (prefers-reduced-motion: reduce) {
            [data-mq-waveform][data-wave-state="buffering"] canvas,
            [data-mq-waveform][data-wave-state="loading"] canvas {
              animation: none;
            }
          }
        `}</style>
        {loading && (
          <div className="absolute inset-0 pointer-events-none rounded-lg mq-shimmer" aria-hidden="true" />
        )}
        {/* Hover time bubble — hidden while scrubbing (state, not ref) */}
        {hoverTime !== null && !isScrubbing && (
          <div
            aria-hidden="true"
            className="absolute pointer-events-none px-1.5 py-0.5 rounded-md mq-t-num text-[11px] whitespace-nowrap"
            style={{
              left: `min(calc(100% - 44px), max(0px, ${duration > 0 ? (hoverTime / duration) * 100 : 0}% - 22px))`,
              top: -20,
              backgroundColor: "color-mix(in srgb, var(--mq-surface-3) 88%, transparent)",
              border: "1px solid var(--mq-border-thin)",
              color: "var(--mq-text)",
            }}
          >
            {formatDuration(hoverTime)}
          </div>
        )}
      </div>
      {showTimeLabels && (
        <div className="flex items-center justify-between mt-1" aria-hidden="true">
          <span className="mq-t-time text-[11px]" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(ariaNow)}</span>
          <span className="mq-t-time text-[11px]" style={{ color: "var(--mq-text-muted)" }}>−{formatDuration(Math.max(0, duration - ariaNow))}</span>
        </div>
      )}
    </div>
  );
}
