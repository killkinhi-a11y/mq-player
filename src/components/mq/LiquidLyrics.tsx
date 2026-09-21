"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo, memo } from "react";
import { currentPlaybackPosition } from "@/lib/wasm-audio";
import { useAppStore } from "@/store/useAppStore";
import { formatDuration } from "@/lib/musicApi";
import { type LyricLine } from "./LyricsView";
import "./liquid-lyrics.css";

/**
 * LiquidLyrics — MQ's signature synced-lyrics view.
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
 * the backend provides no word timestamps — lrclib is line-level only).
 * Sequence: previous words stay full, the current word fills, upcoming
 * words wait.
 *
 * Re-render policy: React state changes only when the ACTIVE LINE
 * changes (once every few seconds). Per-frame work = one style var
 * write. Decorative motion is pure CSS. prefers-reduced-motion /
 * store reduceMotion: the writer STEPs (~4 Hz) instead of animating.
 */

export interface LiquidLyricsProps {
  lines: LyricLine[];
  /** Coarse store progress (~1 Hz) — used for the FIRST render only. */
  currentTime: number;
  onSeek: (time: number) => void;
  /** Track duration — bounds the last line's fill window. */
  duration?: number;
  /** panel = desktop inline card (max-height), full = wide aside / mobile. */
  variant?: "panel" | "full";
}

/** Window params per word: [start, reciprocalSpan] in 0..100 space. */
export type WordWin = [number, number];

const WORD_SPAN = 55; // each word fills over ~55% of the line duration
const MIN_SPAN = 10;

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

/** Binary search: last line whose time <= t. */
export function findActiveIdx(lines: LyricLine[], t: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= t) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/** Real line progress 0..1 — bounds the last line with duration. */
export function lineFill(lines: LyricLine[], idx: number, pos: number, duration: number): number {
  const start = lines[idx].time;
  let end = idx + 1 < lines.length ? lines[idx + 1].time : 0;
  if (!end || end <= start + 0.05) {
    end = duration > start + 0.05 ? Math.min(duration, start + 6) : start + 5;
  }
  const span = end - start;
  if (span <= 0.05) return pos >= end ? 1 : 0;
  const p = (pos - start) / span;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

function LiquidLyricsBase({ lines, currentTime, onSeek, duration = 0, variant = "panel" }: LiquidLyricsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeElRef = useRef<HTMLButtonElement | null>(null);

  const reduceMotion = useAppStore((s) => s.reduceMotion);

  // Latest values for the rAF loop — synced in effects (never during
  // render) so the loop never re-subscribes.
  const linesRef = useRef(lines);
  const durationRef = useRef(duration);
  const reduceMotionRef = useRef(reduceMotion);
  useEffect(() => { linesRef.current = lines; }, [lines]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { reduceMotionRef.current = reduceMotion; }, [reduceMotion]);

  const [activeIdx, setActiveIdx] = useState(() => findActiveIdx(lines, currentTime));
  const [afterIdx, setAfterIdx] = useState(-1);

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

  // ── The one rAF loop (mount-lifetime, never resubscribes) ───────────
  useEffect(() => {
    let raf = 0;
    let lastWritten = -1;
    let lastStepAt = 0;
    let forceWrite = true;
    let localIdx = idxRef.current;

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
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

      let fill = lineFill(ls, idx, pos, durationRef.current) * 100;
      // Organic surface breathing — tiny, mid-fill only, never in
      // reduced-motion mode, never enough to disturb reading.
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

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // New lyrics (track change) — loop resyncs on the next frame.
  useEffect(() => {
    linesChangedRef.current = true;
  }, [lines]);

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
      className={`ll-scroll${variant === "full" ? " ll-full" : ""}`}
      onTouchStart={pauseAutoScroll}
      onTouchEnd={pauseAutoScroll}
      onMouseDown={pauseAutoScroll}
      onMouseUp={pauseAutoScroll}
      onWheel={pauseAutoScroll}
    >
      {lines.map((line, i) => {
        const isActive = i === activeIdx;
        const isAfter = i === afterIdx;
        const isPast = i < activeIdx;
        const distance = Math.abs(i - anchor);
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
            key={`${i}-${line.time}`}
            ref={isActive ? (el) => { activeElRef.current = el; } : undefined}
            className={isActive ? "ll-line ll-on" : "ll-line"}
            data-past={isPast && !isAfter ? "" : undefined}
            data-after={isAfter ? "" : undefined}
            data-t={formatDuration(line.time)}
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
            title={`Перейти к ${formatDuration(line.time)}`}
            onClick={() => {
              onSeek(line.time);
              resumeAutoScroll();
            }}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

export const LiquidLyrics = memo(LiquidLyricsBase);
