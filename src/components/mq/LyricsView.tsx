"use client";

import { useState, useCallback, useEffect, useRef, memo } from "react";
import { AnimatePresence } from "framer-motion";
import { Maximize2, FileUp, X, Languages } from "lucide-react";
import { LiquidLyrics } from "./LiquidLyrics";
import type { LiquidLyricsProps } from "./LiquidLyrics";
import { FullscreenLyrics } from "./lyrics/FullscreenLyrics";
import type { LyricLine, LyricsError } from "@/lib/lyrics/types";
import { lyricsErrorText, syncLevelOf } from "@/lib/lyrics/types";
import { parseLrc } from "@/lib/lyrics/lrclib";
import {
  translateLyrics,
  detectLyricsLanguage,
} from "@/lib/lyricsTranslation";
import {
  saveLocalLyrics,
  deleteLocalLyrics,
  getLocalLyricsMeta,
} from "@/lib/lyrics/lyricsStore";
import { invalidateLyricsCache, lyricsIdentity } from "@/lib/lyrics-client";

/**
 * LyricsView — premium synced lyrics container for MQ Player.
 *
 * v11: consumes the normalized ms-timing format (LyricLine from
 * lib/lyrics/types — legacy {time,text} arrays are normalized on entry so
 * every mount site and old mock keeps working). Adds the fullscreen stage
 * toggle (portal overlay with Fullscreen + Focus modes, spec §2) and
 * normalized error mapping (spec §12 — no raw exceptions in the UI).
 *
 * Contract preserved from previous versions:
 * - Props: lines / plainText / currentTime / isLoading / error / onSeek / cover
 * - Retry dispatches the "mq-lyrics-retry" window event (parents listen)
 * - Plain (unsynced) lyrics render as readable text — never a fake sync
 * - Loading skeleton + empty state with retry
 */

export type { LyricLine };
export type { LyricsError };

interface LyricsViewProps {
  lines: LyricLine[];
  plainText: string;
  currentTime: number;
  isLoading: boolean;
  error: string | LyricsError | null;
  onSeek: (time: number) => void;
  cover?: string;
  /** Track duration — bounds the last line's fill window. */
  duration?: number;
  /** panel = desktop inline card, full = wide aside / mobile overlay. */
  variant?: LiquidLyricsProps["variant"];
  /** Track identity for the fullscreen stage header + local import key. */
  trackTitle?: string;
  trackArtist?: string;
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
  cover,
  duration,
  variant,
  trackTitle,
  trackArtist,
}: LyricsViewProps) {
  const hasSynced = lines.length > 0;
  const hasPlain = plainText.length > 0;
  const [retryCount, setRetryCount] = useState(0);
  // Fullscreen is KEYED by track identity — a track change naturally closes
  // the stage (derived, no synchronous setState in effects).
  const [fsFor, setFsFor] = useState<string | null>(null);
  const trackKey = `${trackTitle ?? ""}|${trackArtist ?? ""}`;
  const fullscreen = fsFor !== null && fsFor === trackKey;

  // Honest sync granularity of what is actually rendered (spec §4.4:
  // line-level data is never dressed up as word-synced).
  const syncLevel = syncLevelOf(lines, hasPlain);

  // ── Local synced-document import (TTML / QRC / enhanced LRC / SRT) ──
  // Real word-level karaoke for any track the user has a synced file for.
  const [hasLocal, setHasLocal] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!trackTitle || !trackArtist) {
      setHasLocal(false);
      return;
    }
    const id = lyricsIdentity(trackArtist, trackTitle);
    getLocalLyricsMeta(id.artist, id.title)
      .then((meta) => {
        if (!cancelled) setHasLocal(!!meta);
      })
      .catch(() => {
        if (!cancelled) setHasLocal(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trackTitle, trackArtist, retryCount]);

  const handleImportFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file || !trackTitle || !trackArtist) return;
      setImportBusy(true);
      setImportError(null);
      // Canonical identity: the SAME cleaning fetchLyrics applies, so the
      // import is always found by the Hop 0 lookup regardless of how the
      // track title is decorated (feat/remix/official…).
      const id = lyricsIdentity(trackArtist, trackTitle);
      try {
        const raw = await file.text();
        if (!raw.trim()) {
          setImportError("Файл пуст");
          return;
        }
        const saved = await saveLocalLyrics(
          id.artist,
          id.title,
          raw,
          duration && duration > 0 ? Math.round(duration * 1000) : undefined,
        );
        if (!saved) {
          setImportError("Не удалось распознать формат файла");
          return;
        }
        // Drop cached provider results so the next fetch prefers the import.
        await invalidateLyricsCache(trackArtist, trackTitle);
        setHasLocal(true);
        // Parents listen and re-fetch (fetchLyrics now hits the local doc).
        window.dispatchEvent(new CustomEvent("mq-lyrics-retry"));
      } catch {
        setImportError("Не удалось загрузить файл");
      } finally {
        setImportBusy(false);
      }
    },
    [trackTitle, trackArtist, duration],
  );

  const handleRemoveLocal = useCallback(async () => {
    if (!trackTitle || !trackArtist) return;
    const id = lyricsIdentity(trackArtist, trackTitle);
    try {
      await deleteLocalLyrics(id.artist, id.title);
      await invalidateLyricsCache(trackArtist, trackTitle);
      setHasLocal(false);
      window.dispatchEvent(new CustomEvent("mq-lyrics-retry"));
    } catch {
      /* IDB hiccup — the badge stays, no user-visible error */
    }
  }, [trackTitle, trackArtist]);

  // ── Line-by-line RU translation (Z-AI, IDB-cached 30 days) ──
  // Rebuilt from the CURRENT lines: LRC-style text is sent (the API
  // preserves the tags), the translated LRC is re-parsed and matched back
  // per line start — so a translation never mis-aligns with its line.
  const [translationOn, setTranslationOn] = useState(false);
  const [translations, setTranslations] = useState<string[] | null>(null);
  const [transLoading, setTransLoading] = useState(false);
  const [transFailed, setTransFailed] = useState(false);

  const canTranslate =
    hasSynced &&
    detectLyricsLanguage(lines.map((l) => l.text).join("\n")) !== "russian";

  useEffect(() => {
    if (!translationOn) {
      setTranslations(null);
      setTransFailed(false);
      return;
    }
    if (!lines.length) return;
    let cancelled = false;
    setTransLoading(true);
    setTransFailed(false);

    const msToTag = (ms: number) => {
      const total = Math.max(0, Math.round(ms));
      const m = Math.floor(total / 60000);
      const s = Math.floor((total % 60000) / 1000);
      const cs = Math.floor((total % 1000) / 10);
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
    };
    const lrcBody = lines
      .map((l) => `[${msToTag(l.startMs ?? 0)}]${l.text}`)
      .join("\n");
    const lang = detectLyricsLanguage(lines.map((l) => l.text).join("\n"));

    translateLyrics(lrcBody, lang)
      .then((out) => {
        if (cancelled) return;
        if (!out) {
          setTranslations(null);
          setTransFailed(true);
          return;
        }
        // Match translated lines back by their (preserved) start tag.
        const byTime = new Map<number, string>();
        for (const l of parseLrc(out)) {
          if (l.startMs !== undefined && l.text) byTime.set(l.startMs, l.text);
        }
        setTranslations(lines.map((l) => byTime.get(l.startMs ?? -1) ?? ""));
      })
      .catch(() => {
        if (!cancelled) setTransFailed(true);
      })
      .finally(() => {
        if (!cancelled) setTransLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [translationOn, lines]);

  // A track change invalidates the previous translation — reset cleanly.
  useEffect(() => {
    setTranslations(null);
    setTransFailed(false);
    setTransLoading(false);
    // Keep the user's preference ON across tracks; the effect above re-runs
    // for the new lines and re-translates (IDB cache makes repeats instant).
  }, [trackKey]);

  // Normalized error text — accepts legacy string messages AND LyricsError
  // codes (typed or as strings); codes always map to human RU text (spec §12).
  const errorText = lyricsErrorText(error);

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
        <p className="mq-text-eyebrow mq-t-badge uppercase tracking-widest flex items-center gap-1.5 flex-wrap">
          <span style={{ color: "var(--mq-accent)" }}>♪</span>
          Текст песни
          {hasSynced && syncLevel === "word" && (
            <span
              className="mq-t-badge px-1.5 py-0.5 rounded-full font-medium"
              title="Файл содержит таймкоды отдельных слов — караоке-подсветка пословная"
              style={{
                backgroundColor: "color-mix(in srgb, var(--mq-accent) 16%, transparent)",
                color: "var(--mq-accent)",
              }}
            >
              Пословная
            </span>
          )}
          {hasSynced && syncLevel === "line" && (
            <span
              className="mq-t-badge px-1.5 py-0.5 rounded-full font-medium"
              title="Источник даёт таймкоды строк — подсветка построчная"
              style={{
                backgroundColor: "color-mix(in srgb, var(--mq-text) 7%, transparent)",
                color: "var(--mq-text-muted)",
              }}
            >
              Построчная
            </span>
          )}
          {hasLocal && (
            <span
              className="mq-t-badge px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1"
              title="Локальный файл синхронизации, загруженный вами"
              style={{
                backgroundColor: "color-mix(in srgb, var(--mq-platinum-lift, #c7d2ea) 14%, transparent)",
                color: "var(--mq-platinum-lift, #c7d2ea)",
              }}
            >
              Локальный файл
              <button
                type="button"
                onClick={handleRemoveLocal}
                aria-label="Удалить локальный файл синхронизации"
                title="Удалить локальный файл"
                className="w-4 h-4 rounded-full flex items-center justify-center hover:opacity-80"
                style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 12%, transparent)" }}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          )}
        </p>
        <div className="flex items-center gap-1.5">
          {canTranslate && (
            <button
              type="button"
              onClick={() => setTranslationOn((v) => !v)}
              disabled={transLoading}
              aria-pressed={translationOn}
              aria-label="Показать перевод текста"
              title={transFailed ? "Перевод недоступен — попробуйте позже" : "Перевод текста на русский"}
              className="mq-icon-btn w-8 h-8 rounded-lg flex items-center justify-center transition-opacity"
              style={{
                color: translationOn
                  ? "var(--mq-accent)"
                  : transFailed
                    ? "color-mix(in srgb, var(--mq-accent) 60%, transparent)"
                    : "var(--mq-text-muted)",
                backgroundColor: translationOn
                  ? "color-mix(in srgb, var(--mq-accent) 12%, transparent)"
                  : "transparent",
                opacity: transLoading ? 0.6 : 1,
              }}
            >
              <Languages
                className="w-4 h-4"
                style={transLoading ? { animation: "mq-pulse-glow 1.2s ease-in-out infinite" } : undefined}
              />
            </button>
          )}
          {trackTitle && trackArtist && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".ttml,.lrc,.qrc,.srt,.txt,.xml"
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => {
                  void handleImportFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={importBusy}
                aria-label="Загрузить файл синхронизации (TTML, LRC, QRC, SRT)"
                title="Загрузить файл синхронизации — TTML, QRC или LRC с пословными таймкодами дают караоке-режим"
                className="mq-icon-btn w-8 h-8 rounded-lg flex items-center justify-center transition-opacity"
                style={{ color: importBusy ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
              >
                <FileUp className="w-4 h-4" style={importBusy ? { animation: "mq-pulse-glow 1.2s ease-in-out infinite" } : undefined} />
              </button>
            </>
          )}
          {(hasSynced || hasPlain) && (
            <button
              type="button"
              onClick={() => setFsFor(trackKey)}
              aria-label="Текст песни на весь экран"
              title="На весь экран"
              className="mq-icon-btn w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ color: "var(--mq-text-muted)" }}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {importError && (
        <p className="text-xs mb-2" style={{ color: "var(--mq-accent)" }} role="alert">
          {importError}
        </p>
      )}

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
          translations={translations ?? undefined}
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
            {errorText || "Текст не найден"}
          </p>
          <button
            onClick={handleRetry}
            aria-label="Повторить загрузку текста"
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

      {/* Fullscreen / Focus stage (portal above every player layer) */}
      <AnimatePresence>
        {fullscreen && (
          <FullscreenLyrics
            lines={lines}
            plainText={plainText}
            isLoading={isLoading}
            errorText={errorText}
            cover={cover}
            title={trackTitle}
            artist={trackArtist}
            translations={translations ?? undefined}
            onSeek={onSeek}
            onClose={() => setFsFor(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export const LyricsView = memo(LyricsViewBase);
