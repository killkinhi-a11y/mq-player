"use client";

import { useRef, useMemo, useEffect, useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * LyricsView — premium synced lyrics component for MQ Player.
 *
 * Features:
 * - Karaoke-style active line with glow + scale animation
 * - Tap-to-seek: tapping any line seeks the track to that timestamp
 * - Auto-scroll with smooth centering (active line stays centered)
 * - Fade mask at top/bottom for cinematic depth
 * - Past lines fade out, future lines dim — focus on "now"
 * - Plain text fallback when synced lyrics unavailable
 * - Loading skeleton + error state
 *
 * Design system:
 * - Accent: var(--mq-accent) = #e03131
 * - Text: var(--mq-text) = #f0f0f0
 * - Muted: var(--mq-text-muted) = #9a9a9a
 * - Card: var(--mq-card) = #1a1a1a
 * - Bg: var(--mq-bg) = #0e0e0e
 */

export interface LyricLine {
  time: number;
  text: string;
}

interface LyricsViewProps {
  lines: LyricLine[];
  plainText: string;
  currentTime: number;
  isLoading: boolean;
  error: string | null;
  onSeek: (time: number) => void;
  cover?: string;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ─── Synced lyrics with karaoke effect ─────────────────────────────────────

function SyncedLyrics({ lines, currentTime, onSeek }: {
  lines: LyricLine[];
  currentTime: number;
  onSeek: (t: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const isUserInteracting = useRef(false);
  const interactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Find active line index — binary search for O(log n)
  const activeIdx = useMemo(() => {
    if (lines.length === 0) return -1;
    let lo = 0, hi = lines.length - 1, result = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].time <= currentTime) { result = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return result;
  }, [lines, currentTime]);

  // Auto-scroll: ALWAYS keep active line visible (unless user is interacting)
  useEffect(() => {
    const container = containerRef.current;
    const lineEl = lineRefs.current[activeIdx];
    if (!container || !lineEl || activeIdx < 0) return;

    // Don't scroll if user is interacting (tapping/scrolling)
    if (isUserInteracting.current) return;

    const lTop = lineEl.offsetTop;
    // Position active line at ~20% from top of container
    const targetScroll = lTop - container.clientHeight * 0.2;

    container.scrollTo({
      top: Math.max(0, targetScroll),
      behavior: "smooth",
    });
  }, [activeIdx]);

  // User interaction handlers — pause auto-scroll for 2s after interaction
  const handleInteractionStart = useCallback(() => {
    isUserInteracting.current = true;
    if (interactionTimer.current) clearTimeout(interactionTimer.current);
  }, []);

  const handleInteractionEnd = useCallback(() => {
    if (interactionTimer.current) clearTimeout(interactionTimer.current);
    // Resume auto-scroll after 2 seconds of no interaction
    interactionTimer.current = setTimeout(() => {
      isUserInteracting.current = false;
    }, 2000);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (interactionTimer.current) clearTimeout(interactionTimer.current);
    };
  }, []);

  if (lines.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="text-base leading-relaxed max-h-[320px] overflow-y-auto px-2 py-4 space-y-0.5 scroll-smooth"
      style={{
        scrollbarWidth: "none",
        maskImage: "linear-gradient(180deg, transparent 0%, #000 15%, #000 85%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(180deg, transparent 0%, #000 15%, #000 85%, transparent 100%)",
      }}
      onTouchStart={handleInteractionStart}
      onTouchEnd={handleInteractionEnd}
      onMouseDown={handleInteractionStart}
      onMouseUp={handleInteractionEnd}
    >
      {lines.map((line, i) => {
        const isActive = i === activeIdx;
        const isPast = i < activeIdx;
        const isHovered = hoveredIdx === i;

        // If no active line yet (activeIdx = -1, e.g. track just started),
        // highlight the first line as a fallback
        const isEffectivelyActive = isActive || (activeIdx === -1 && i === 0);

        // Distance-based opacity — closer to active = more visible
        const distance = Math.abs(i - (activeIdx >= 0 ? activeIdx : 0));
        const opacity = isEffectivelyActive ? 1 : isPast ? Math.max(0.25, 0.5 - distance * 0.08) : Math.max(0.2, 0.55 - distance * 0.06);

        return (
          <motion.button
            key={i}
            ref={(el) => { lineRefs.current[i] = el; }}
            onClick={() => onSeek(line.time)}
            onHoverStart={() => setHoveredIdx(i)}
            onHoverEnd={() => setHoveredIdx(null)}
            className="block w-full text-left px-3 py-2 rounded-xl cursor-pointer transition-colors"
            animate={{
              scale: isEffectivelyActive ? 1.0 : 0.97,
              opacity: isHovered ? Math.max(opacity, 0.85) : opacity,
            }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{
              color: isEffectivelyActive ? "var(--mq-text)" : "var(--mq-text-muted)",
              fontWeight: isEffectivelyActive ? 700 : 400,
              fontSize: isEffectivelyActive ? "1.1rem" : "0.95rem",
              background: isEffectivelyActive
                ? "linear-gradient(90deg, color-mix(in srgb, var(--mq-accent) 15%, transparent), color-mix(in srgb, var(--mq-accent) 5%, transparent))"
                : "transparent",
              boxShadow: isEffectivelyActive
                ? "0 0 24px color-mix(in srgb, var(--mq-accent) 20%, transparent)"
                : "none",
              borderLeft: isEffectivelyActive ? "3px solid var(--mq-accent)" : "3px solid transparent",
            }}
          >
            {/* Active line gets a glow text shadow */}
            <span style={{
              textShadow: isEffectivelyActive ? "0 0 12px color-mix(in srgb, var(--mq-accent) 40%, transparent)" : "none",
              transition: "text-shadow 0.3s ease",
            }}>
              {line.text || "♪"}
            </span>

            {/* Hover timestamp indicator */}
            <AnimatePresence>
              {isHovered && !isEffectivelyActive && (
                <motion.span
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  className="ml-2 text-[10px] font-mono align-middle"
                  style={{ color: "var(--mq-accent)" }}
                >
                  → {formatTime(line.time)}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}

// ─── Plain text lyrics (no sync) ───────────────────────────────────────────

function PlainLyrics({ text }: { text: string }) {
  return (
    <div
      className="text-sm leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto p-4 rounded-xl"
      style={{
        color: "var(--mq-text-muted)",
        backgroundColor: "rgba(255,255,255,0.02)",
        scrollbarWidth: "none",
        maskImage: "linear-gradient(180deg, transparent 0%, #000 10%, #000 90%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(180deg, transparent 0%, #000 10%, #000 90%, transparent 100%)",
      }}
    >
      {text}
    </div>
  );
}

// ─── Loading skeleton ──────────────────────────────────────────────────────

function LyricsSkeleton() {
  return (
    <div className="space-y-2 px-2 py-4">
      {[0.9, 0.7, 0.85, 0.6, 0.75, 0.5, 0.8, 0.65].map((w, i) => (
        <div
          key={i}
          className="h-4 rounded-lg mq-shimmer"
          style={{ width: `${w * 100}%` }}
        />
      ))}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

function LyricsViewBase({ lines, plainText, currentTime, isLoading, error, onSeek }: LyricsViewProps) {
  const hasSynced = lines.length > 0;
  const hasPlain = plainText.length > 0;
  const [retryCount, setRetryCount] = useState(0);

  // Retry handler — triggers parent to re-fetch by changing key
  const handleRetry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  // Expose retry via window event — parent listens
  useEffect(() => {
    if (retryCount > 0) {
      window.dispatchEvent(new CustomEvent("mq-lyrics-retry"));
    }
  }, [retryCount]);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="mq-text-eyebrow text-[10px] uppercase tracking-widest flex items-center gap-1.5">
          <span style={{ color: "var(--mq-accent)" }}>♪</span>
          Текст песни
          {hasSynced && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)",
                color: "var(--mq-accent)",
              }}
            >
              Synced
            </span>
          )}
        </p>
      </div>

      {/* Content */}
      {isLoading ? (
        <LyricsSkeleton />
      ) : hasSynced ? (
        <SyncedLyrics lines={lines} currentTime={currentTime} onSeek={onSeek} />
      ) : hasPlain ? (
        <PlainLyrics text={plainText} />
      ) : (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 8%, transparent)" }}
          >
            <span style={{ color: "var(--mq-accent)", fontSize: 18 }}>♪</span>
          </div>
          <p className="text-xs text-center" style={{ color: "var(--mq-text-muted)" }}>
            {error || "Текст не найден"}
          </p>
          <button
            onClick={handleRetry}
            className="px-3 py-1.5 rounded-full text-[10px] font-semibold transition-colors"
            style={{
              backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)",
              color: "var(--mq-accent)",
              border: "1px solid color-mix(in srgb, var(--mq-accent) 20%, transparent)",
            }}
          >
            ↻ Попробовать снова
          </button>
        </div>
      )}
    </div>
  );
}

export const LyricsView = memo(LyricsViewBase);
