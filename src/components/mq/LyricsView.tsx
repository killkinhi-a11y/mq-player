"use client";

import { useState, useCallback, useEffect, memo } from "react";
import { LiquidLyrics } from "./LiquidLyrics";
import type { LiquidLyricsProps } from "./LiquidLyrics";

/**
 * LyricsView — premium synced lyrics container for MQ Player.
 *
 * v78: the synced view is now LiquidLyrics — MQ's signature
 * water-fill typography. The active line's glyphs fill with liquid in
 * sync with real playback progress (line-level timing from lrclib;
 * the per-word cascade is a deterministic distribution of that real
 * line progress — no invented timing). See LiquidLyrics.tsx.
 *
 * Contract preserved from previous versions:
 * - Props: lines / plainText / currentTime / isLoading / error / onSeek / cover
 * - Retry dispatches the "mq-lyrics-retry" window event (parents listen)
 * - Plain (unsynced) lyrics render as readable text — never a fake sync
 * - Loading skeleton + empty state with retry
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
  /** Track duration — bounds the last line's fill window. */
  duration?: number;
  /** panel = desktop inline card, full = wide aside / mobile overlay. */
  variant?: LiquidLyricsProps["variant"];
}

// ─── Plain text lyrics (no sync — never a fake sync) ────────────────────────

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

function LyricsViewBase({
  lines,
  plainText,
  currentTime,
  isLoading,
  error,
  onSeek,
  duration,
  variant,
}: LyricsViewProps) {
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
    <div className={variant === "full" ? "w-full flex flex-col flex-1 min-h-0" : "w-full"}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3" style={variant === "full" ? { flexShrink: 0 } : undefined}>
        <p className="mq-text-eyebrow mq-t-badge uppercase tracking-widest flex items-center gap-1.5">
          <span style={{ color: "var(--mq-accent)" }}>♪</span>
          Текст песни
          {hasSynced && (
            <span
              className="mq-t-badge px-1.5 py-0.5 rounded-full font-medium"
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
        <LiquidLyrics
          lines={lines}
          currentTime={currentTime}
          onSeek={onSeek}
          duration={duration}
          variant={variant}
        />
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
            className="px-3 py-1.5 rounded-full mq-t-meta-2 font-semibold transition-colors"
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
