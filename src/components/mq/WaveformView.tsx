"use client";

/**
 * WaveformView — real-signal waveform visualization (spec §5), Yandex-Music
 * style: chunky mirrored bars, played bars in accent, quiet remainder,
 * smooth audio-clock playhead.
 *
 * Data: src/lib/waveform (decode → peaks → IDB cache) + the live sampler's
 * partial peaks merged at draw time for undecodable (HLS/DRM) tracks.
 *
 * Rendering contract (spec §10):
 *  - Canvas 2D, DPR-aware, ZERO React re-renders during playback.
 *  - ONE rAF loop that reads currentPlaybackPosition() (the SAME audio
 *    clock lyrics use — no independent timers), only while playing or
 *    until a redraw settles after seek/resize/data changes.
 *  - Pause → the loop stops after the final draw; resume → restarts.
 *
 * Interaction: click-to-seek, drag-to-seek (scrub preview while dragging,
 * commit on release — no seek spam on mobile), hover time bubble on fine
 * pointers, keyboard ±5s/Home/End with role="slider" (spec §11).
 *
 * Fallbacks (honest): loading → shimmer skeleton; no data (DRM/HLS with no
 * samples yet, expired local blob, unknown duration) → the slim standard
 * progress track, so the player stays fully usable.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { currentPlaybackPosition, seekPlayback } from "@/lib/wasm-audio";
import { useAppStore } from "@/store/useAppStore";
import { formatDuration } from "@/lib/musicApi";
import { useWaveform } from "@/lib/waveform/useWaveform";
import { getLiveSampled } from "@/lib/waveform/liveSampler";
import {
  bucketDisplayValue,
  rebucketPeaks,
  timeToX,
  xToTime,
} from "@/lib/waveform/computePeaks";
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

const BAR_W = 3;
const BAR_GAP = 2;
const MIN_BAR_H = 2;

interface ThemeColors {
  accent: string;
  playedDim: string;
  quiet: string;
  placeholder: string;
}

function readThemeColors(): ThemeColors {
  // DESIGN COMPLETION §20: the played portion is PROGRESS — it speaks the
  // signature platinum material, not the theme accent (red progress bars
  // read as a default player template; red stays rare/semantic).
  const c = { accent: "#d7deea", playedDim: "rgba(255,255,255,0.30)", quiet: "rgba(255,255,255,0.14)", placeholder: "rgba(255,255,255,0.07)" };
  if (typeof window === "undefined") return c;
  try {
    const cs = getComputedStyle(document.documentElement);
    const accent = cs.getPropertyValue("--mq-platinum-hi").trim();
    if (accent) c.accent = accent;
    const text = cs.getPropertyValue("--mq-text").trim() || "#f0f0f0";
    c.quiet = `color-mix(in srgb, ${text} 16%, transparent)`;
    c.playedDim = `color-mix(in srgb, ${text} 34%, transparent)`;
    c.placeholder = `color-mix(in srgb, ${text} 8%, transparent)`;
  } catch { /* defaults */ }
  return c;
}

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
  const setProgress = useAppStore((s) => s.setProgress);
  const reduceMotion = useAppStore((s) => s.reduceMotion);

  const canvasH = height ?? (variant === "compact" ? 34 : 52);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { status, data } = useWaveform(track, waveformEnabled);

  // ── Latest-values refs for the draw loop (never resubscribes) ────────
  const dataRef = useRef(data);
  const durationRef = useRef(duration);
  const playingRef = useRef(isPlaying);
  const scrubRef = useRef<number | null>(null);   // drag preview position (s)
  const hoverRef = useRef<number | null>(null);   // hover position (s)
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const colorsRef = useRef<ThemeColors>(readThemeColors());
  const needsDrawRef = useRef(true);
  useEffect(() => { dataRef.current = data; needsDrawRef.current = true; }, [data]);
  useEffect(() => { durationRef.current = duration; needsDrawRef.current = true; }, [duration]);
  useEffect(() => { playingRef.current = isPlaying; needsDrawRef.current = true; }, [isPlaying]);
  useEffect(() => { needsDrawRef.current = true; }, [reduceMotion]);

  // Theme-color invalidation: <html> style/class mutations (theme/accent
  // switches write CSS vars there).
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;
    const root = document.documentElement;
    const invalidate = () => {
      colorsRef.current = readThemeColors();
      needsDrawRef.current = true;
    };
    const mo = new MutationObserver(invalidate);
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
    },
    [onSeek, setProgress],
  );

  // ── Sizing (DPR aware) ───────────────────────────────────────────────
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
      needsDrawRef.current = true;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [canvasH]);

  // ── The draw loop ────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { w, h, dpr } = sizeRef.current;
    const dur = durationRef.current || 0;
    const d = dataRef.current;
    const colors = colorsRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const barCount = Math.max(8, Math.floor(w / (BAR_W + BAR_GAP)));
    const step = BAR_W + BAR_GAP;
    const usableW = barCount * step - BAR_GAP;
    const x0 = (w - usableW) / 2;
    const mid = h / 2;
    const maxBarH = h - 4;

    const pos = scrubRef.current ?? currentPlaybackPosition();
    const playX = dur > 0 ? timeToX(pos, usableW, dur) + x0 : 0;

    if (!d) {
      // No waveform data — honest slim progress track (still seekable).
      const trackY = mid;
      ctx.fillStyle = colors.quiet;
      ctx.beginPath();
      ctx.roundRect(x0, trackY - 1.5, usableW, 3, 1.5);
      ctx.fill();
      if (dur > 0) {
        ctx.fillStyle = colors.accent;
        const fillW = Math.max(2, Math.min(usableW, timeToX(pos, usableW, dur)));
        ctx.beginPath();
        ctx.roundRect(x0, trackY - 1.5, fillW, 3, 1.5);
        ctx.fill();
      }
      return;
    }

    // Merge the live sampler's freshest partials when keys match.
    let peaks = d.peaks;
    const complete = d.complete;
    if (!complete) {
      const live = getLiveSampled();
      if (live && live.key === d.key && live.peaks.length === d.bucketCount) {
        const merged = new Float32Array(d.peaks.length);
        for (let i = 0; i < merged.length; i++) {
          merged[i] = Math.max(d.peaks[i], live.peaks[i]);
        }
        peaks = merged;
      }
    }

    const bars = peaks.length === barCount ? peaks : rebucketPeaks(peaks, barCount);
    const liveKnown = complete ? null : (getLiveSampled()?.key === d.key ? getLiveSampled()!.peaks : null);
    const knownBars = liveKnown
      ? (liveKnown.length === barCount ? liveKnown : rebucketPeaks(liveKnown, barCount))
      : null;

    for (let i = 0; i < barCount; i++) {
      const x = x0 + i * step;
      const played = x + BAR_W / 2 <= playX;
      let v: number;
      if (d.complete) {
        v = bars[i];
      } else {
        const known = knownBars ? knownBars[i] > 0 : bars[i] > 0;
        v = known ? bars[i] : bucketDisplayValue(bars, i, { complete: false });
        if (!known) {
          ctx.fillStyle = played ? colors.playedDim : colors.placeholder;
          const bh = Math.max(MIN_BAR_H, v * maxBarH);
          ctx.beginPath();
          ctx.roundRect(x, mid - bh / 2, BAR_W, bh, BAR_W / 2);
          ctx.fill();
          continue;
        }
      }
      const bh = Math.max(MIN_BAR_H, Math.max(0, v) * maxBarH);
      ctx.fillStyle = played ? colors.accent : colors.quiet;
      ctx.beginPath();
      ctx.roundRect(x, mid - bh / 2, BAR_W, bh, BAR_W / 2);
      ctx.fill();
    }

    // Playhead — a hairline that rides the audio clock (essential motion;
    // not disabled by reduce-motion, which only kills decorative motion).
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(Math.max(x0, Math.min(x0 + usableW, playX)) - 0.75, 1, 1.5, h - 2);
  }, []);

  useEffect(() => {
    let raf = 0;
    let lastX = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      const pos = scrubRef.current ?? currentPlaybackPosition();
      const dur = durationRef.current || 0;
      const x = dur > 0 ? pos / dur : 0;
      if (playingRef.current || needsDrawRef.current || Math.abs(x - lastX) > 0.00001) {
        draw();
        lastX = x;
        needsDrawRef.current = false;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  // ── Hover bubble state (declared BEFORE the handlers that set it) ────
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // ── Pointer interactions (click / drag to seek) ─────────────────────
  const pointerTime = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    const { w } = sizeRef.current;
    const x = clientX - rect.left;
    return xToTime(x, w, durationRef.current || 0);
  }, []);

  const draggingRef = useRef(false);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    // Capture keeps drag events flowing to the canvas even when the pointer
    // leaves it. Synthetic pointers (tests, some automation layers) have no
    // active pointer entry — setPointerCapture throws NotFoundError there;
    // the seek path must survive that (dragging works without capture, it
    // just loses events that leave the canvas mid-drag).
    try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* synthetic pointer — no capture target */ }
    draggingRef.current = true;
    setIsScrubbing(true);
    scrubRef.current = pointerTime(e.clientX);
    needsDrawRef.current = true;
  }, [pointerTime]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const t = pointerTime(e.clientX);
    if (draggingRef.current) {
      scrubRef.current = t;
      needsDrawRef.current = true;
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
    needsDrawRef.current = true;
  }, [pointerTime, seek]);

  const onPointerCancel = useCallback(() => {
    draggingRef.current = false;
    setIsScrubbing(false);
    scrubRef.current = null;
    needsDrawRef.current = true;
  }, []);

  const onPointerLeave = useCallback(() => {
    hoverRef.current = null;
    setHoverTime(null);
  }, []);

  // ── Keyboard slider semantics (WINDOW-CAPTURE ownership) ───────────
  // A capture-phase window listener runs BEFORE every other handler
  // (React delegation + player window handlers), so the focused canvas
  // seeks exactly ±5 and stopPropagation guarantees nobody double-applies
  // (React-19 synthetic stopPropagation cannot reach native window
  // listeners — measured live; this approach is plain DOM semantics and
  // also covers hosts with no player-level arrow handler, e.g. mobile).
  const seekRef = useRef(seek);
  useEffect(() => { seekRef.current = seek; }, [seek]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = canvasRef.current;
      if (!c || document.activeElement !== c) return; // only while focused
      const dur = durationRef.current || 0;
      const pos = currentPlaybackPosition();
      let next: number | null = null;
      if (e.key === "ArrowRight") next = pos + (e.shiftKey ? 1 : 5);
      else if (e.key === "ArrowLeft") next = pos - (e.shiftKey ? 1 : 5);
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = dur;
      if (next === null) return; // other keys pass through untouched
      e.preventDefault();
      e.stopPropagation(); // capture at window ⇒ no other handler sees it
      seekRef.current(Math.max(0, Math.min(dur, next)));
    };
    window.addEventListener("keydown", onKey, true); // CAPTURE
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // ── Live ARIA value (throttled to ~4 Hz — not per frame) ────────────
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
        {/* Focus ring on the wrapper (canvas outline is ugly at edges) */}
        <style>{`
          [data-mq-waveform] canvas:focus-visible {
            border-radius: 10px;
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--mq-accent) 55%, transparent);
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
