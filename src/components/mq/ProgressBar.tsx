"use client";

import { useRef, useState, useCallback, useEffect, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDuration } from "@/lib/musicApi";

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
  /** Optional formatter override — honored since v69 (was ignored). */
  formatTime?: (s: number) => string;
  variant?: "playerbar" | "fulltrack" | "mobile";
}

// v69 duration contract: ONE canonical formatter (musicApi). Local copy removed.

function ProgressBarBase({
  progress,
  duration,
  isPlaying,
  isDragging: externalDragging,
  onSeek,
  onDragStart,
  onDragEnd,
  formatTime,
  variant = "playerbar",
}: ProgressBarProps) {
  // Canonical formatting (h:mm:ss + guards) — the formatTime prop, when
  // provided, is now actually honored instead of silently ignored.
  const fmt = formatTime ?? formatDuration;
  const trackRef = useRef<HTMLDivElement>(null);
  const [internalDragging, setInternalDragging] = useState(false);
  const [hoveredPct, setHoveredPct] = useState<number | null>(null);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [isFocused, setIsFocused] = useState(false);
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

  // ── Cleanup RAF on unmount + safety mouseup/touchend to release drag
  // if component unmounts mid-drag (otherwise isDragging stays true
  // and the bar appears "stuck") ──
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // Safety: if component unmounts while dragging, release the drag
      // state so it doesn't get stuck. This is a fallback — the normal
      // mouseup/touchend handlers in the drag effect above should fire first.
      if (internalDragging) {
        setInternalDragging(false);
        onDragEnd();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Touch handlers ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    setInternalDragging(true);
    onDragStart();
    if (e.touches[0]) onSeek(clientXToTime(e.touches[0].clientX));
  }, [clientXToTime, onSeek, onDragStart]);

  // ── Keyboard seek (Phase M #8/#42): slider semantics + arrow seeking ──
  // Arrow ±5s, Shift+Arrow ±1s (precise), Home/End = track bounds.
  // The container keeps its 16px height — mobile touch targets untouched.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!duration) return;
      let target: number | null = null;
      const step = e.shiftKey ? 1 : 5;
      switch (e.key) {
        case "ArrowRight":
          target = progress + step; break;
        case "ArrowLeft":
          target = progress - step; break;
        case "Home":
          target = 0; break;
        case "End":
          target = duration; break;
        default:
          return; // not our key — let it bubble
      }
      e.preventDefault();
      e.stopPropagation();
      const clamped = Math.max(0, Math.min(duration, target));
      setHoveredPct(null);
      setHoveredTime(null);
      onSeek(clamped);
    },
    [duration, progress, onSeek]
  );

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
  // playerbar: compact vertical padding (8px hit area) so the docked bar
  // stays at ~72px total height (var(--mq-player-height-desktop)).
  const trackHeight = variant === "fulltrack" ? 6 : 4;
  const thumbSize = 16;
  const hitPadding = variant === "playerbar" ? 8 : 12;
  const alwaysShowThumb = variant === "mobile";

  const isHot = isDragging || hoveredPct !== null || isFocused;
  const hotTrackHeight = trackHeight + 2;

  const displayPct = isDragging ? progressPct : (hoveredPct ?? progressPct);

  return (
    <div className="flex items-center gap-2 w-full select-none">
      {/* Current time — shrink-0, min-width (not fixed) so h:mm:ss fits */}
      <span
        className="mq-t-num mq-t-meta-2 text-right flex-shrink-0 whitespace-nowrap"
        style={{ color: "var(--mq-text-muted)", minWidth: 36 }}
      >
        {fmt(Math.max(0, progress))}
      </span>

      {/* Track container — slider semantics for keyboard users */}
      <div
        ref={trackRef}
        className="flex-1 relative cursor-pointer group focus-visible:outline-2 focus-visible:outline-offset-4 rounded-full"
        style={{
          height: trackHeight + hitPadding,
          display: "flex",
          alignItems: "center",
          touchAction: "none",
        }}
        role="slider"
        tabIndex={0}
        aria-label="Позиция воспроизведения"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration) || 0}
        aria-valuenow={Math.round(progress) || 0}
        aria-valuetext={`${formatDuration(progress)} из ${formatDuration(duration)}`}
        aria-orientation="horizontal"
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Track rail — capsule, glass surface + inner glow.
            Grows 2px while hot (hover/drag) — grab affordance, not a
            press flash. */}
        <div
          className="absolute left-0 right-0 rounded-full transition-all duration-150"
          style={{
            height: isHot ? hotTrackHeight : trackHeight,
            backgroundColor: "var(--mq-glass-bg)",
            boxShadow: "var(--mq-shadow-inner-glow)",
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

        {/* Progress fill — solid accent capsule */}
        <div
          className="absolute left-0 rounded-full pointer-events-none"
          style={{
            height: isHot ? hotTrackHeight : trackHeight,
            width: `${progressPct}%`,
            backgroundColor: "var(--mq-accent)",
            transition: isDragging ? "none" : "width 0.1s linear, height 0.15s ease",
          }}
        />

        {/* Fader cap — MQ signature (v71): 16px rounded-square cap,
            card surface + 2px border (muted rest → accent hot) + center
            line. Hidden at rest on desktop (fill IS the value); reveals on
            hover/grab/keyboard-focus; always visible on touch. No
            scale-on-press — the accent halo is grab state. */}
        <div
          className="absolute rounded-[5px] pointer-events-none flex items-center justify-center"
          style={{
            left: `${displayPct}%`,
            marginLeft: -thumbSize / 2,
            top: "50%",
            width: thumbSize,
            height: thumbSize,
            marginTop: -thumbSize / 2,
            backgroundColor: "var(--mq-card)",
            backgroundImage:
              "linear-gradient(var(--mq-text-muted), var(--mq-text-muted))",
            backgroundSize: "8px 2px",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            border: `2px solid ${
              isHot
                ? "var(--mq-accent)"
                : "color-mix(in srgb, var(--mq-text-muted) 55%, var(--mq-card))"
            }`,
            boxShadow: isDragging
              ? "var(--mq-shadow-accent-hover), 0 0 0 5px color-mix(in srgb, var(--mq-accent) 16%, transparent)"
              : "var(--mq-shadow-sm)",
            opacity: isHot || alwaysShowThumb ? 1 : 0,
            transition:
              "opacity 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
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
              className="absolute pointer-events-none z-10 px-2 py-1 rounded-md mq-t-num whitespace-nowrap"
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

      {/* Duration — "—" while metadata is unknown (never a fake 0:00 total) */}
      <span
        className="mq-t-num mq-t-meta-2 flex-shrink-0 whitespace-nowrap"
        style={{ color: "var(--mq-text-muted)", minWidth: 36 }}
      >
        {duration > 0 ? fmt(duration) : "—"}
      </span>
    </div>
  );
}

export const ProgressBar = memo(ProgressBarBase);
