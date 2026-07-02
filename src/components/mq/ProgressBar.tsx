"use client";

import { useRef, useState, useCallback, useEffect, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ═════════════════════════════════════════════════════════════════════════
// PROGRESS BAR — premium redesign
// Design principles:
// - Thin elegant track (4px default, expands to 6px on hover)
// - Gradient fill with accent color
// - Glow effect on fill edge
// - Smooth thumb with shadow ring
// - Hover preview position with tooltip
// - Full touch support (drag to seek)
// - Buffered indicator (if available)
// ═════════════════════════════════════════════════════════════════════════

interface ProgressBarProps {
  progress: number;
  duration: number;
  isPlaying: boolean;
  isDragging: boolean;
  onSeek: (time: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  formatTime: (s: number) => string;
  variant?: "playerbar" | "fulltrack" | "mobile";
}

function formatDuration(sec: number): string {
  if (!sec || !isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ProgressBarBase({
  progress,
  duration,
  isPlaying,
  isDragging: externalDragging,
  onSeek,
  onDragStart,
  onDragEnd,
  variant = "playerbar",
}: ProgressBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [internalDragging, setInternalDragging] = useState(false);
  const [hoveredPct, setHoveredPct] = useState<number | null>(null);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const rafRef = useRef(0);

  const isDragging = internalDragging || externalDragging;
  const progressPct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  // ── Position → time ──
  const clientXToTime = useCallback((clientX: number): number => {
    if (!trackRef.current || !duration) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    return (pct / 100) * duration;
  }, [duration]);

  const clientXToPct = useCallback((clientX: number): number => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  }, []);

  // ── Desktop handlers ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setInternalDragging(true);
    onDragStart();
    onSeek(clientXToTime(e.clientX));
  }, [clientXToTime, onSeek, onDragStart]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) return;
    const x = e.clientX;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const pct = clientXToPct(x);
      setHoveredPct(pct);
      setHoveredTime(clientXToTime(x));
    });
  }, [isDragging, clientXToPct, clientXToTime]);

  const handleMouseLeave = useCallback(() => {
    setHoveredPct(null);
    setHoveredTime(null);
  }, []);

  // ── Global mousemove/mouseup during drag ──
  useEffect(() => {
    if (!internalDragging) return;
    const onMove = (e: MouseEvent) => {
      onSeek(clientXToTime(e.clientX));
    };
    const onUp = () => {
      setInternalDragging(false);
      onDragEnd();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [internalDragging, clientXToTime, onSeek, onDragEnd]);

  // ── Touch handlers ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    setInternalDragging(true);
    onDragStart();
    if (e.touches[0]) onSeek(clientXToTime(e.touches[0].clientX));
  }, [clientXToTime, onSeek, onDragStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (e.touches[0]) onSeek(clientXToTime(e.touches[0].clientX));
  }, [clientXToTime, onSeek]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    setInternalDragging(false);
    onDragEnd();
  }, [onDragEnd]);

  // ── Styling based on variant ──
  const trackHeight = variant === "fulltrack" ? 6 : 4;
  const thumbSize = variant === "fulltrack" ? 14 : 12;
  const showThumbOnMobile = variant === "mobile" || variant === "fulltrack";

  const displayPct = isDragging ? progressPct : (hoveredPct ?? progressPct);

  return (
    <div className="flex items-center gap-2 w-full select-none">
      {/* Current time */}
      <span
        className="text-[10px] font-mono tabular-nums text-right flex-shrink-0"
        style={{ color: "var(--mq-text-muted)", width: 36 }}
      >
        {formatDuration(progress)}
      </span>

      {/* Track container */}
      <div
        ref={trackRef}
        className="flex-1 relative cursor-pointer group"
        style={{
          height: trackHeight + 12,
          display: "flex",
          alignItems: "center",
          touchAction: "none",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Track background */}
        <div
          className="absolute left-0 right-0 rounded-full transition-all duration-150"
          style={{
            height: isDragging ? trackHeight + 2 : trackHeight,
            backgroundColor: "rgba(255,255,255,0.08)",
          }}
        />

        {/* Hover preview (ghost fill) */}
        <AnimatePresence>
          {hoveredPct !== null && hoveredPct > progressPct && !isDragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute left-0 rounded-full pointer-events-none"
              style={{
                height: trackHeight,
                width: `${hoveredPct}%`,
                backgroundColor: "rgba(255,255,255,0.1)",
              }}
            />
          )}
        </AnimatePresence>

        {/* Progress fill — gradient with glow */}
        <div
          className="absolute left-0 rounded-full pointer-events-none"
          style={{
            height: isDragging ? trackHeight + 2 : trackHeight,
            width: `${progressPct}%`,
            background: `linear-gradient(90deg,
              color-mix(in srgb, var(--mq-accent) 70%, transparent) 0%,
              var(--mq-accent) 100%)`,
            boxShadow: isPlaying
              ? `0 0 6px color-mix(in srgb, var(--mq-accent) 40%, transparent)`
              : "none",
            transition: isDragging ? "none" : "width 0.1s linear, height 0.15s ease",
          }}
        />

        {/* Thumb */}
        <div
          className="absolute rounded-full pointer-events-none transition-all duration-150"
          style={{
            left: `${displayPct}%`,
            marginLeft: -thumbSize / 2,
            width: thumbSize,
            height: thumbSize,
            backgroundColor: "#fff",
            boxShadow: `0 0 0 2px var(--mq-accent), 0 2px 6px rgba(0,0,0,0.4)`,
            opacity: isDragging ? 1 : (hoveredPct !== null ? 1 : (showThumbOnMobile ? 0.7 : 0)),
            transform: isDragging ? "scale(1.2)" : "scale(1)",
            transition: "opacity 0.15s ease, transform 0.15s ease",
          }}
        />

        {/* Hover tooltip */}
        <AnimatePresence>
          {hoveredTime !== null && !isDragging && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.1 }}
              className="absolute pointer-events-none z-10 px-2 py-1 rounded-md text-[10px] font-mono tabular-nums whitespace-nowrap"
              style={{
                left: `${Math.max(8, Math.min(92, hoveredPct ?? 0))}%`,
                transform: "translateX(-50%)",
                bottom: "100%",
                marginBottom: 6,
                backgroundColor: "var(--mq-card)",
                color: "var(--mq-text)",
                border: "1px solid var(--mq-border-thin)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              }}
            >
              {formatDuration(hoveredTime)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Duration */}
      <span
        className="text-[10px] font-mono tabular-nums flex-shrink-0"
        style={{ color: "var(--mq-text-muted)", width: 36 }}
      >
        {formatDuration(duration)}
      </span>
    </div>
  );
}

export const ProgressBar = memo(ProgressBarBase);
