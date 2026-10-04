"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Focus, Maximize2, Type, Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { currentPlaybackPosition } from "@/lib/wasm-audio";
import { formatDuration } from "@/lib/musicApi";
import type { LyricLine } from "@/lib/lyrics/types";
import { LiquidLyrics } from "@/components/mq/LiquidLyrics";
import { LyricsAppearanceControls } from "@/components/mq/lyrics/LyricsAppearanceControls";

/**
 * FullscreenLyrics — the immersive lyrics stage (spec §2 modes):
 *   - "fullscreen": big lyrics over an ambient cover-washed backdrop
 *   - "focus":      spotlight — non-active lines dim + blur harder
 * Both are the SAME timeline (LiquidLyrics reads the audio clock); the
 * mode only changes typography scale and context dimming.
 *
 * Portal-rendered above every player (z-[120] > player z-[100]).
 * Escape closes (layered AFTER any in-player panel), transport stays
 * minimal: prev / play-pause / next + live time.
 */

export interface FullscreenLyricsProps {
  lines: LyricLine[];
  plainText: string;
  isLoading: boolean;
  errorText: string | null;
  cover?: string;
  title?: string;
  artist?: string;
  onSeek: (t: number) => void;
  onClose: () => void;
}

function useLiveTime(active: boolean) {
  const [time, setTime] = useState(0);
  const rafRef = useRef(0);
  useEffect(() => {
    if (!active) return;
    let latched = -1;
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      if (document.hidden) return;
      const pos = currentPlaybackPosition();
      const sec = Math.floor(pos);
      if (sec !== latched) {
        latched = sec;
        setTime(sec);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);
  return time;
}

export function FullscreenLyrics({
  lines,
  plainText,
  isLoading,
  errorText,
  cover,
  title,
  artist,
  onSeek,
  onClose,
}: FullscreenLyricsProps) {
  const [focusMode, setFocusMode] = useState(false);
  const [fontPopover, setFontPopover] = useState(false);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const nextTrack = useAppStore((s) => s.nextTrack);
  const prevTrack = useAppStore((s) => s.prevTrack);
  const duration = useAppStore((s) => s.duration);
  const reduceMotion = useAppStore((s) => s.reduceMotion);
  const liveSec = useLiveTime(true);

  // Escape closes the stage (before any parent layer — keydown fires on
  // the topmost element first; stopPropagation keeps player handlers out).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === " " && (e.target as HTMLElement)?.tagName !== "BUTTON") {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, togglePlay]);

  const toggleFontPopover = useCallback(() => setFontPopover((v) => !v), []);

  const hasSynced = lines.length > 0;
  const hasPlain = plainText.length > 0;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[120] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Текст песни на весь экран"
      data-mq-fullscreen-lyrics=""
      data-mode={focusMode ? "focus" : "fullscreen"}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      style={{
        backgroundColor: "rgba(4,4,8,0.82)",
        backdropFilter: "blur(34px) saturate(130%)",
        WebkitBackdropFilter: "blur(34px) saturate(130%)",
      }}
    >
      {/* Ambient cover wash */}
      {cover && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url(${cover})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            opacity: focusMode ? 0.06 : 0.13,
            filter: "blur(60px)",
            transform: "scale(1.4)",
            transition: "opacity 0.6s var(--ease-premium, ease)",
          }}
        />
      )}

      {/* Header */}
      <header className="relative flex items-center gap-3 px-4 sm:px-6 py-4" style={{ flexShrink: 0 }}>
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            className="w-11 h-11 rounded-xl object-cover"
            style={{ boxShadow: "0 6px 24px rgba(0,0,0,0.5)" }}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="mq-t-badge text-[11px] uppercase tracking-widest" style={{ color: "var(--mq-accent)" }}>
            {focusMode ? "Фокус · текст песни" : "Текст песни"}
          </p>
          <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>
            {title || "—"}
          </p>
          <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
            {artist || ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFocusMode((v) => !v)}
          aria-pressed={focusMode}
          aria-label={focusMode ? "Обычный полноэкранный режим" : "Режим фокуса"}
          title={focusMode ? "Обычный режим" : "Режим фокуса"}
          className="mq-icon-btn w-11 h-11 rounded-xl flex items-center justify-center"
          style={{
            color: focusMode ? "var(--mq-accent)" : "var(--mq-text-muted)",
            backgroundColor: focusMode ? "color-mix(in srgb, var(--mq-accent) 12%, transparent)" : "transparent",
          }}
        >
          {focusMode ? <Focus className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>
        <button
          type="button"
          onClick={toggleFontPopover}
          aria-pressed={fontPopover}
          aria-label="Настройки шрифта текста"
          title="Шрифт и размер"
          className="mq-icon-btn w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ color: fontPopover ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
        >
          <Type className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть текст песни"
          title="Закрыть (Esc)"
          className="mq-icon-btn w-11 h-11 rounded-xl flex items-center justify-center"
          style={{ color: "var(--mq-text)" }}
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Body */}
      <div className="relative flex-1 min-h-0 flex flex-col px-4 sm:px-10">
        {hasSynced ? (
          <LiquidLyrics
            lines={lines}
            currentTime={liveSec}
            onSeek={onSeek}
            duration={duration}
            variant={focusMode ? "focus" : "full"}
          />
        ) : hasPlain ? (
          <div className="flex-1 min-h-0 overflow-y-auto py-6">
            <p
              className="max-w-2xl mx-auto text-center whitespace-pre-wrap"
              style={{
                color: "var(--mq-text)",
                fontSize: "clamp(16px, 2.4vw, 22px)",
                lineHeight: 1.7,
                fontFamily: "var(--ll-font-family, var(--mq-font-primary, sans-serif))",
                maskImage: "linear-gradient(180deg, transparent 0, #000 6%, #000 94%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(180deg, transparent 0, #000 6%, #000 94%, transparent 100%)",
              }}
            >
              {plainText}
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex-1 flex flex-col gap-2.5 justify-center px-2" aria-label="Загрузка текста">
            {[0.72, 0.5, 0.84, 0.62, 0.78, 0.44, 0.68, 0.55, 0.74, 0.4].map((w, i) => (
              <div
                key={i}
                className="h-4 rounded-lg mq-shimmer mx-auto"
                style={{ width: `${w * 70}%` }}
              />
            ))}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 10%, transparent)" }}
            >
              <span style={{ color: "var(--mq-accent)", fontSize: 24 }}>♪</span>
            </div>
            <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>{errorText || "Текст не найден"}</p>
          </div>
        )}
      </div>

      {/* Minimal transport */}
      <footer className="relative flex items-center justify-center gap-3 px-6 pb-6 pt-2" style={{ flexShrink: 0 }}>
        <span className="mq-t-num text-xs absolute left-6" style={{ color: "var(--mq-text-muted)" }}>
          {formatDuration(liveSec)}
        </span>
        <button
          type="button"
          onClick={prevTrack}
          aria-label="Предыдущий трек"
          className="mq-icon-btn w-11 h-11 rounded-full flex items-center justify-center"
          style={{ color: "var(--mq-text)" }}
        >
          <SkipBack className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
          className="w-14 h-14 rounded-full flex items-center justify-center transition-transform"
          style={{
            backgroundColor: "var(--mq-accent)",
            color: "var(--mq-text-on-accent, #fff)",
            boxShadow: "var(--mq-shadow-accent)",
          }}
        >
          {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" style={{ marginLeft: 2 }} />}
        </button>
        <button
          type="button"
          onClick={nextTrack}
          aria-label="Следующий трек"
          className="mq-icon-btn w-11 h-11 rounded-full flex items-center justify-center"
          style={{ color: "var(--mq-text)" }}
        >
          <SkipForward className="w-5 h-5" />
        </button>
        <span className="mq-t-num text-xs absolute right-6" style={{ color: "var(--mq-text-muted)" }}>
          −{formatDuration(Math.max(0, duration - liveSec))}
        </span>
      </footer>

      {/* Font quick-popover */}
      <AnimatePresence>
        {fontPopover && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
            role="dialog"
            aria-label="Настройки шрифта"
            className="absolute right-4 sm:right-6 top-[72px] w-[300px] max-w-[calc(100vw-32px)] rounded-2xl p-3 overflow-y-auto"
            style={{
              maxHeight: "min(560px, 70vh)",
              backgroundColor: "color-mix(in srgb, var(--mq-surface-2) 92%, transparent)",
              backdropFilter: "var(--mq-blur-lg)",
              WebkitBackdropFilter: "var(--mq-blur-lg)",
              border: "1px solid var(--mq-border-thin)",
              boxShadow: "var(--mq-shadow-glass, 0 18px 48px rgba(0,0,0,0.45))",
              zIndex: 10,
            }}
          >
            <LyricsAppearanceControls variant="popover" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}
