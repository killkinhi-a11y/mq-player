"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo, memo } from "react";
import { currentPlaybackPosition } from "@/lib/wasm-audio";
import { subscribeClock, wakeClock } from "@/lib/playback/clock";
import { useAppStore } from "@/store/useAppStore";
import { formatDuration } from "@/lib/musicApi";
import type { LyricLine } from "@/lib/lyrics/types";
import "./liquid-lyrics.css";

/**
 * LiquidLyrics — MQ's signature synced-lyrics view (v11: normalized
 * ms-timing format + virtualization + focus/static modes).
 *
 * The active line renders as per-word spans; each word carries a
 * precomputed "window" (start + reciprocal span, in 0..100 line-progress
 * space). A single rAF loop — reading the PLAYBACK-ROUTED position so it
 * is correct on both the WASM and <audio> backends — writes ONE custom
 * property (--ll-fill, 0..100) on the active line element. CSS derives
 * each word's water level from it (see liquid-lyrics.css).
 *
 * Word windows are NOT invented timing: they are a deterministic visual
 * distribution of the REAL line progress (the sanctioned approach when
 * the backend provides no word timestamps — LRCLIB is line-level only).
 * When a line carries an explicit `endMs` (normalized format), the fill
 * window uses it — LRCLIB's tighter timings are honored.
 *
 * Re-render policy: React state changes only when the ACTIVE LINE changes
 * (once every few seconds). Per-frame work = one style var write.
 * Decorative motion is pure CSS. prefers-reduced-motion / store
 * reduceMotion: the writer STEPs (~4 Hz) instead of animating.
 * store lyricsAnimated=false → .ll-static mode: no water layer at all.
 *
 * Virtualization (spec §10): lyrics longer than VIRTUALIZE_THRESHOLD lines
 * render only a window around (active ∪ visible) lines; spacer divs keep
 * the scroll height honest. Typical lyrics (40–120 lines) render fully.
 */

export interface LiquidLyricsProps {
  lines: LyricLine[];
  /** Coarse store progress (~1 Hz) — used for the FIRST render only. */
  currentTime: number;
  onSeek: (time: number) => void;
  /** Track duration — bounds the last line's fill window. */
  duration?: number;
  /** panel = desktop inline card (max-height), full = wide aside / mobile,
   *  focus = fullscreen spotlight (big centered type, blurred context). */
  variant?: "panel" | "full" | "focus";
}

/** Window params per word: [start, reciprocalSpan] in 0..100 space. */
export type WordWin = [number, number];

const WORD_SPAN = 55; // each word fills over ~55% of the line duration
const MIN_SPAN = 10;

/** Lines longer than this switch to windowed rendering. */
export const VIRTUALIZE_THRESHOLD = 320;
/** Extra lines kept above/below the window. */
export const VIRTUALIZE_OVERSCAN = 36;
/** Render-time line-height ESTIMATE for spacer math (scroll handlers use the
 *  measured ref; a constant here keeps refs out of the render path). */
const VIRTUALIZED_LINE_H = 44;

function splitWords(text: string): string[] {
  const words = (text || "").split(/\s+/).filter(Boolean);
  return words.length ? words : ["♪"];
}

export function wordWindows(n: number): WordWin[] {
  if (n <= 1) return [[0, 1]]; // single "word": fills across the whole line
  const out: WordWin[] = [];
  for (let i = 0; i < n; i++) {
    const start = (i / n) * (100 - WORD_SPAN);
    const end = i === n - 1 ? 100 : start + WORD_SPAN;
    const span = Math.max(MIN_SPAN, end - start);
    out.push([Number(start.toFixed(2)), Number((100 / span).toFixed(4))]);
  }
  return out;
}

/** Line start in SECONDS (normalized ms format → engine clock units). */
export function lineStartSec(line: LyricLine): number {
  return (line.startMs ?? 0) / 1000;
}

/** Binary search: last line whose start <= t. */
export function findActiveIdx(lines: LyricLine[], t: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lineStartSec(lines[mid]) <= t) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/**
 * Real line progress 0..1. Uses the line's explicit endMs when present
 * (normalized format), else the next line's start, else a duration-bound
 * guess — never invented beyond that.
 */
export function lineFill(lines: LyricLine[], idx: number, pos: number, duration: number): number {
  const line = lines[idx];
  const start = lineStartSec(line);
  let end: number;
  if (typeof line.endMs === "number" && line.endMs > start * 1000 + 50) {
    end = line.endMs / 1000;
  } else {
    end = idx + 1 < lines.length ? lineStartSec(lines[idx + 1]) : 0;
    if (!end || end <= start + 0.05) {
      end = duration > start + 0.05 ? Math.min(duration, start + 6) : start + 5;
    }
  }
  const span = end - start;
  if (span <= 0.05) return pos >= end ? 1 : 0;
  const p = (pos - start) / span;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/**
 * Virtualization window (pure, unit-tested): the rendered range covers the
 * ACTIVE line and the lines visible at the current scroll offset (the user
 * may read ahead); clamped to [0, count).
 */
export function visibleRange(
  count: number,
  lineHeight: number,
  scrollTop: number,
  viewportH: number,
  activeIdx: number,
  overscan = VIRTUALIZE_OVERSCAN,
): [number, number] {
  if (count <= 0) return [0, 0];
  const safeLh = lineHeight > 4 ? lineHeight : 30;
  const firstVisible = Math.floor(scrollTop / safeLh);
  const lastVisible = Math.ceil((scrollTop + viewportH) / safeLh);
  const anchorLo = Math.min(firstVisible, activeIdx);
  const anchorHi = Math.max(lastVisible, activeIdx + 1);
  const lo = Math.max(0, anchorLo - overscan);
  const hi = Math.min(count, anchorHi + overscan);
  return [lo, hi];
}

function LiquidLyricsBase({ lines, currentTime, onSeek, duration = 0, variant = "panel" }: LiquidLyricsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeElRef = useRef<HTMLButtonElement | null>(null);

  const reduceMotion = useAppStore((s) => s.reduceMotion);
  const animated = useAppStore((s) => s.lyricsAnimated);
  const customWeight = useAppStore((s) => s.lyricsFontWeight);

  // Latest values for the rAF loop — synced in effects (never during
  // render) so the loop never re-subscribes.
  const linesRef = useRef(lines);
  const durationRef = useRef(duration);
  const reduceMotionRef = useRef(reduceMotion);
  const animatedRef = useRef(animated);
  useEffect(() => { linesRef.current = lines; }, [lines]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { reduceMotionRef.current = reduceMotion; }, [reduceMotion]);
  useEffect(() => { animatedRef.current = animated; }, [animated]);

  const [activeIdx, setActiveIdx] = useState(() => findActiveIdx(lines, currentTime));
  const [afterIdx, setAfterIdx] = useState(-1);
  // Virtualization state (only used above VIRTUALIZE_THRESHOLD). The stored
  // range is stamped with the current lyrics identity; a mismatch (track
  // change) falls back to the active-anchored window at render time — no
  // synchronous setState in effects.
  const [vRangeState, setVRangeState] = useState<{
    stamp: string;
    range: [number, number];
  } | null>(null);
  const linesStamp = `${lines.length}:${lines[0]?.startMs ?? "-"}`;
  const vRange = vRangeState?.stamp === linesStamp ? vRangeState.range : null;
  const lineHeightRef = useRef(30);

  // Loop ↔ render handoff mirrors.
  const idxRef = useRef(activeIdx);
  const linesChangedRef = useRef(false);

  // Word lists per active/after line — derived data, memoized (typical
  // lines have < 14 words; recompute only when the line changes).
  const activeWords = useMemo(() => {
    if (activeIdx < 0 || activeIdx >= lines.length) return { words: [] as string[], wins: [] as WordWin[] };
    const words = splitWords(lines[activeIdx].text);
    return { words, wins: wordWindows(words.length) };
  }, [lines, activeIdx]);

  const afterWordList = useMemo(() => {
    if (afterIdx < 0 || afterIdx >= lines.length) return [] as string[];
    return splitWords(lines[afterIdx].text);
  }, [lines, afterIdx]);

  // ── THE unified clock subscription (V3 §13/§19 — no private rAF) ────
  // The fill/active-line loop rides the shared PlaybackClock: one loop for
  // Wave + Lyrics + Progress + engine. Ticks arrive while playing, on wake
  // bursts (seek/resize) and on paused external seeks (clock slow-poll).
  useEffect(() => {
    let lastWritten = -1;
    let lastStepAt = 0;
    let forceWrite = true;
    let localIdx = idxRef.current;

    const tick = () => {
      if (document.hidden) return;
      const ls = linesRef.current;
      if (!ls.length) return;

      // New lyrics arrived (track change): resync without an after-ghost.
      if (linesChangedRef.current) {
        linesChangedRef.current = false;
        localIdx = -999;
        forceWrite = true;
      }

      const pos = currentPlaybackPosition();
      const idx = findActiveIdx(ls, pos);

      if (idx !== localIdx) {
        // Natural advance (+1) keeps the just-sung line's water fading;
        // seeks (jumps) swap instantly with no "after" ghost.
        if (idx === localIdx + 1) setAfterIdx(localIdx);
        else setAfterIdx(-1);
        setActiveIdx(idx);
        localIdx = idx;
        idxRef.current = idx;
        forceWrite = true;
      }

      if (idx < 0) return;

      // Static mode: no per-frame fill writes at all — the CSS solid
      // highlight carries the active state.
      if (!animatedRef.current) return;

      let fill = lineFill(ls, idx, pos, durationRef.current) * 100;
      // Organic surface breathing — tiny, mid-fill only, never in
      // reduced-motion mode, never enough to disturb reading.
      const t = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (!reduceMotionRef.current && fill > 3 && fill < 97) {
        fill += Math.sin(t * 0.0021) * 0.8;
      }

      const el = activeElRef.current;
      if (!el) return;

      const rm = reduceMotionRef.current;
      const changed = Math.abs(fill - lastWritten);
      const shouldWrite = forceWrite
        ? true
        : rm
          ? t - lastStepAt >= 240 && changed > 0.6
          : changed > 0.15;

      if (shouldWrite) {
        el.style.setProperty("--ll-fill", fill.toFixed(2));
        lastWritten = fill;
        lastStepAt = t;
        forceWrite = false;
      }
    };

    const unsub = subscribeClock(tick, { throttleMs: 0 });
    wakeClock(); // initial sync on mount
    return unsub;
  }, []);

  // New lyrics (track change) — the clock loop resyncs on the next frame.
  useEffect(() => {
    linesChangedRef.current = true;
    wakeClock();
  }, [lines]);

  // ── Virtualization (very long lyrics only) ──────────────────────────
  const virtualized = lines.length > VIRTUALIZE_THRESHOLD;

  // Scroll handler (passive, rAF-throttled) — the ONLY writer of the
  // stored window; event-time code may read the measured line-height ref.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !virtualized) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const range = visibleRange(
        lines.length,
        lineHeightRef.current,
        el.scrollTop,
        el.clientHeight,
        idxRef.current,
      );
      setVRangeState((prev) => {
        const stamp = `${lines.length}:${lines[0]?.startMs ?? "-"}`;
        if (prev && prev.stamp === stamp && prev.range[0] === range[0] && prev.range[1] === range[1]) {
          return prev;
        }
        return { stamp, range };
      });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [virtualized, lines.length, lines]);

  // Measure a real line height (ref write only — no render dependency).
  useEffect(() => {
    if (!virtualized) return;
    const el = activeElRef.current;
    if (el) {
      const h = el.offsetHeight + 3; // + margin
      if (h > 10) lineHeightRef.current = h;
    }
  }, [virtualized, activeIdx]);

  // ── Auto-scroll: active line to ~30% from top, paused by interaction ──
  const isUserInteracting = useRef(false);
  const interactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseAutoScroll = useCallback(() => {
    isUserInteracting.current = true;
    if (interactionTimer.current) clearTimeout(interactionTimer.current);
    interactionTimer.current = setTimeout(() => {
      isUserInteracting.current = false;
    }, 2200);
  }, []);
  useEffect(
    () => () => {
      if (interactionTimer.current) clearTimeout(interactionTimer.current);
    },
    []
  );

  const lastScrolledRef = useRef(-1);
  // A tap-to-seek is NAVIGATION, not scroll interaction — auto-scroll must
  // re-follow immediately (the container's mousedown handler fires first
  // and would otherwise pin the pause for 2.2s after every seek tap).
  const resumeAutoScroll = useCallback(() => {
    isUserInteracting.current = false;
    if (interactionTimer.current) {
      clearTimeout(interactionTimer.current);
      interactionTimer.current = null;
    }
  }, []);
  useEffect(() => {
    if (activeIdx < 0 || isUserInteracting.current) return;
    if (lastScrolledRef.current === activeIdx) return;
    lastScrolledRef.current = activeIdx;
    const container = containerRef.current;
    const lineEl = activeElRef.current;
    if (!container || !lineEl) return;
    const target = lineEl.offsetTop - container.clientHeight * 0.3;
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activeIdx]);

  if (lines.length === 0) return null;

  const anchor = activeIdx >= 0 ? activeIdx : 0;
  // Render-time window: the scroll-synced range when it still contains the
  // active line, else an active-anchored estimate (constant line height —
  // refs stay out of the render path; spacers tolerate the estimate).
  const [lo, hi] = virtualized
    ? (vRange && vRange[0] <= anchor && vRange[1] > anchor
        ? vRange
        : visibleRange(lines.length, VIRTUALIZED_LINE_H, 0, 480, anchor))
    : [0, lines.length];
  const beforeCount = virtualized ? lo : 0;
  const afterCount = virtualized ? Math.max(0, lines.length - hi) : 0;

  const renderWords = (words: string[], wins?: WordWin[]) =>
    words.map((w, j) => (
      <React.Fragment key={j}>
        <span
          className="ll-w"
          data-w={w}
          style={
            wins
              ? ({ "--wa": wins[j][0], "--w-inv": wins[j][1] } as React.CSSProperties)
              : ({ "--wa": -200, "--w-inv": 0.01 } as React.CSSProperties)
          }
        >
          {w}
        </span>
        {j < words.length - 1 ? " " : null}
      </React.Fragment>
    ));

  return (
    <div
      ref={containerRef}
      className={`ll-scroll${variant === "full" ? " ll-full" : ""}${variant === "focus" ? " ll-focus" : ""}${animated ? "" : " ll-static"}`}
      data-custom-weight={customWeight > 0 ? "" : undefined}
      onTouchStart={pauseAutoScroll}
      onTouchEnd={pauseAutoScroll}
      onMouseDown={pauseAutoScroll}
      onMouseUp={pauseAutoScroll}
      onWheel={pauseAutoScroll}
      role="list"
      aria-label="Синхронизированный текст песни"
    >
      {beforeCount > 0 && (
        <div aria-hidden="true" style={{ height: beforeCount * VIRTUALIZED_LINE_H }} />
      )}
      {lines.slice(lo, hi).map((line, i) => {
        const realIdx = lo + i;
        const isActive = realIdx === activeIdx;
        const isAfter = realIdx === afterIdx;
        const isPast = realIdx < activeIdx;
        const distance = Math.abs(realIdx - anchor);
        const opacity = isActive
          ? 1
          : isAfter
            ? 0.9
            : isPast
              ? Math.max(0.24, 0.46 - distance * 0.05)
              : Math.max(0.22, 0.6 - distance * 0.07);

        let content: React.ReactNode;
        if (isActive) {
          const { words, wins } = activeWords;
          content = renderWords(words, wins);
        } else if (isAfter) {
          content = renderWords(afterWordList);
        } else {
          content = line.text || "♪";
        }

        return (
          <button
            key={`${realIdx}-${line.startMs ?? 0}`}
            ref={isActive ? (el) => { activeElRef.current = el; } : undefined}
            className={isActive ? "ll-line ll-on" : "ll-line"}
            data-past={isPast && !isAfter ? "" : undefined}
            data-after={isAfter ? "" : undefined}
            data-t={formatDuration(lineStartSec(line))}
            style={{
              opacity,
              // Initial fill derived from props — the rAF loop becomes
              // the writer on the very next frame (and stays the ONLY
              // per-frame writer).
              ...(isActive
                ? ({
                    "--ll-fill": (lineFill(lines, activeIdx, currentTime, duration) * 100).toFixed(2),
                  } as React.CSSProperties)
                : null),
            }}
            aria-current={isActive ? "true" : undefined}
            title={`Перейти к ${formatDuration(lineStartSec(line))}`}
            onClick={() => {
              onSeek(lineStartSec(line));
              resumeAutoScroll();
            }}
          >
            {content}
          </button>
        );
      })}
      {afterCount > 0 && (
        <div aria-hidden="true" style={{ height: afterCount * VIRTUALIZED_LINE_H }} />
      )}
    </div>
  );
}

export const LiquidLyrics = memo(LiquidLyricsBase);
