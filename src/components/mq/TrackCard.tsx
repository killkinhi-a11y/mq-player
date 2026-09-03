"use client";

import { useState, useCallback, useMemo, memo } from "react";
import { type Track } from "@/lib/musicApi";
import { useAppStore } from "@/store/useAppStore";
import { Play, Pause, Heart, ThumbsDown, MoreHorizontal, Music } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";
import ContextMenu from "./ContextMenu";
import { formatDuration } from "@/lib/musicApi";
import { useLongPress } from "@/hooks/useLongPress";
import { useIsMobile } from "@/hooks/use-mobile";

interface TrackCardProps {
  track: Track;
  index?: number;
  queue?: Track[];
  onArtistClick?: (artistName: string, coverUrl?: string) => void;
}

import { NowPlayingEqualizer } from "./NowPlayingEqualizer";

/* ══════════════════════════════════════════════════════════════════════════
   PHASE 4B — TrackCard, unified card language.
   Rest: transparent (list context) — content sits directly on the page.
   Hover: surface-1 + hairline edge (no lift, no glow).
   Active: accent tint 6% + static 2px accent bar + accent title + eq.
   Play affordance: solid accent circle. No tilt, no blur, no pulse.
   ══════════════════════════════════════════════════════════════════════════ */

const TrackCard = memo(function TrackCard({ track, index = 0, queue, onArtistClick }: TrackCardProps) {
  // Use Zustand selectors to minimize re-renders — only subscribe to needed slices
  const currentTrackId = useAppStore((s) => s.currentTrack?.id);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const playTrack = useAppStore((s) => s.playTrack);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const toggleDislike = useAppStore((s) => s.toggleDislike);
  const compactMode = useAppStore((s) => s.compactMode);
  const isMobile = useIsMobile();

  const isActive = currentTrackId === track.id;
  // P4.3: Subscribe to likedTrackIds array reference (not .includes() per render).
  // The selector returns a boolean — Zustand only re-renders when the boolean
  // changes (liked → unliked or vice versa), NOT on every store update.
  const isLiked = useAppStore((s) =>
    Array.isArray(s.likedTrackIds) && s.likedTrackIds.includes(track.id)
  );
  const isDisliked = useAppStore((s) =>
    Array.isArray(s.dislikedTrackIds) && s.dislikedTrackIds.includes(track.id)
  );

  const [likePulse, setLikePulse] = useState(false);
  const [dislikeShake, setDislikeShake] = useState(false);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; show: boolean }>({
    x: 0, y: 0, show: false,
  });

  const queueFallback = useMemo(() => queue || [track], [queue, track]);

  // Long-press handler — opens the same context menu on mobile
  const handleLongPress = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    let clientX: number;
    let clientY: number;
    if ("touches" in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ("changedTouches" in e && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else if ("clientX" in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      clientX = 0;
      clientY = 0;
    }
    setContextMenu({ x: clientX, y: clientY, show: true });
  }, []);

  const playAction = useCallback(() => {
    if (isActive) {
      togglePlay();
    } else {
      playTrack(track, queueFallback);
    }
  }, [isActive, track, queueFallback, togglePlay, playTrack]);

  const { wasLongPress: longPressWasActive, ...longPressHandlers } = useLongPress(handleLongPress, {
    delay: 500,
    onShortPress: playAction,
  });

  const handleClick = useCallback((_e?: React.MouseEvent) => {
    if (longPressWasActive()) return;
    playAction();
  }, [playAction, longPressWasActive]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, show: true });
  }, []);

  const handleMoreClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, show: true });
  }, []);

  const handleLikeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleLike(track.id, track);
    setLikePulse(true);
    setTimeout(() => setLikePulse(false), 400);
  }, [track.id, track, toggleLike]);

  const handleDislikeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleDislike(track.id, track);
    setDislikeShake(true);
    setTimeout(() => setDislikeShake(false), 400);
  }, [track.id, track, toggleDislike]);

  const closeContextMenu = useCallback(() => setContextMenu((prev) => ({ ...prev, show: false })), []);

  const cardRadius = isMobile ? "var(--mq-r-card-lg)" : "var(--mq-r-card)";

  return (
    <>
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 6 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(index * 0.025, 0.4), duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        // A1 fix: keyboard a11y — Enter/Space triggers click, screen reader
        // announces track title + artist + active state.
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Слушать ${track.title} — ${track.artist}${isActive ? " (играет сейчас)" : ""}`}
        onMouseDown={longPressHandlers.onMouseDown}
        onMouseUp={longPressHandlers.onMouseUp}
        onMouseLeave={longPressHandlers.onMouseLeave}
        onTouchStart={longPressHandlers.onTouchStart}
        onTouchEnd={longPressHandlers.onTouchEnd}
        onTouchMove={longPressHandlers.onTouchMove}
        className="mq-card-track group"
        data-active={isActive || undefined}
        style={{ borderRadius: cardRadius }}
      >
        {/* ── Cover art — artwork is the loud element ── */}
        <div
          className={`
            ${compactMode ? "w-9 h-9" : "w-11 h-11 sm:w-12 sm:h-12"}
            rounded-[var(--mq-r-art)] overflow-hidden flex-shrink-0 relative mq-art
          `}
        >
          {track.cover ? (
            <Image
              src={track.cover}
              alt={track.album || ""}
              className="w-full h-full object-cover"
              width={48}
              height={48}
              loading="lazy"
              draggable={false}
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music
                className={`${compactMode ? "w-3.5 h-3.5" : "w-4 h-4"}`}
                style={{ color: isActive ? "var(--mq-accent)" : "var(--mq-text-muted)", opacity: isActive ? 0.8 : 0.45 }}
              />
            </div>
          )}

          {/* Hover play overlay — solid accent, appears on hover (desktop) */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/45 transition-colors duration-200">
            <div
              className={`
                flex items-center justify-center rounded-full
                ${compactMode ? "w-7 h-7" : "w-8 h-8"}
                sm:opacity-0 sm:group-hover:opacity-100
                transition-opacity duration-200 ease-out
                ${isActive && isPlaying ? "!opacity-100" : ""}
              `}
              style={{ backgroundColor: "var(--mq-accent)" }}
            >
              {isActive && isPlaying ? (
                <Pause
                  className={`${compactMode ? "w-3.5 h-3.5" : "w-4 h-4"}`}
                  style={{ color: "#fff" }}
                  fill="#fff"
                />
              ) : (
                <Play
                  className={`${compactMode ? "w-3.5 h-3.5 ml-0.5" : "w-4 h-4 ml-0.5"}`}
                  style={{ color: "#fff" }}
                  fill="#fff"
                />
              )}
            </div>
          </div>

          {/* Mini equalizer bars on cover (when playing) — flat white, no glow */}
          {isActive && isPlaying && (
            <div className="absolute bottom-1 left-1 right-1 flex items-end justify-center gap-[1.5px] h-3.5 z-10 pointer-events-none">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="mq-cover-eq w-[1.5px] rounded-full origin-bottom"
                  style={{
                    backgroundColor: "#fff",
                    animationName: `coverEq${i}`,
                    animationDuration: "0.45s",
                    animationDelay: `${i * 0.06}s`,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Track info ── */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          {/* Title row */}
          <div className="flex items-center min-w-0 relative">
            <p
              className={`
                truncate
                ${compactMode ? "text-xs font-semibold" : "text-sm sm:text-[14px] font-semibold"}
              `}
              style={{
                color: isActive ? "var(--mq-accent)" : "var(--mq-text)",
                letterSpacing: "-0.01em",
              }}
            >
              <span title={`${track.title} — ${track.artist}`}>{track.title}</span>
            </p>
            {/* Gradient fade on long titles */}
            <span
              className="absolute right-8 top-0 bottom-0 w-8 pointer-events-none"
              style={{
                background: "linear-gradient(to right, transparent, var(--mq-bg, #0e0e0e))",
              }}
            />
            {/* Now-playing equalizer next to title — shown when active,
                animated when playing, paused state when active but paused. */}
            {isActive && !compactMode && (
              <NowPlayingEqualizer size="sm" variant="inline" paused={!isPlaying} />
            )}
          </div>

          {/* Artist row */}
          <p
            className={`truncate mt-0.5 ${compactMode ? "text-[11px]" : "text-xs"}`}
            style={{ color: "var(--mq-text-muted)" }}
            title={track.artist}
          >
            {onArtistClick ? (
              <span
                className="cursor-pointer hover:underline hover:text-[var(--mq-text)] transition-colors duration-150"
                onClick={(e) => {
                  e.stopPropagation();
                  onArtistClick(track.artist, track.cover);
                }}
              >
                {track.artist}
              </span>
            ) : (
              track.artist
            )}
          </p>
        </div>

        {/* ── Actions ── */}
        <div className="flex items-center gap-0 flex-shrink-0">
          {/* Duration — mono numerals, right-aligned */}
          {track.duration > 0 && (
            <span
              className={`
                mq-t-num text-[11px] text-right
                ${compactMode ? "w-8 mr-0.5" : "w-10 mr-0.5"}
              `}
              style={{ color: "var(--mq-text-muted)", opacity: 0.75 }}
            >
              {formatDuration(track.duration)}
            </span>
          )}

          {/* Like button — heart pulse animation when toggled */}
          <motion.button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleLikeClick}
            className={`
              ${compactMode ? "w-7 h-7" : "w-8 h-8"}
              flex items-center justify-center
              rounded-full
              transition-colors duration-150
              sm:opacity-0 sm:group-hover:opacity-100
              hover:bg-white/10
            `}
            style={{ color: isLiked ? "#ef4444" : "var(--mq-text-muted)" }}
            animate={likePulse ? { scale: [1, 1.3, 0.9, 1.1, 1] } : { scale: 1 }}
            transition={likePulse ? { duration: 0.4, ease: "easeInOut" } : { duration: 0.15 }}
          >
            <Heart
              className={`${compactMode ? "w-3.5 h-3.5" : "w-4 h-4"}`}
              style={isLiked ? { fill: "#ef4444" } : {}}
            />
          </motion.button>

          {/* Dislike button — shake animation when toggled */}
          <motion.button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleDislikeClick}
            className={`
              w-8 h-8
              hidden sm:flex items-center justify-center
              rounded-full
              transition-colors duration-150
              sm:opacity-0 sm:group-hover:opacity-100
              hover:bg-white/10
            `}
            style={{ color: isDisliked ? "#ef4444" : "var(--mq-text-muted)" }}
            animate={dislikeShake ? { x: [0, -3, 3, -2, 2, 0] } : { x: 0 }}
            transition={dislikeShake ? { duration: 0.35, ease: "easeInOut" } : { duration: 0.15 }}
          >
            <ThumbsDown className="w-3.5 h-3.5" style={isDisliked ? { fill: "#ef4444" } : {}} />
          </motion.button>

          {/* More button */}
          <motion.button
            onClick={handleMoreClick}
            className={`
              ${compactMode ? "w-7 h-7" : "w-8 h-8"}
              flex items-center justify-center
              rounded-full
              sm:opacity-0 sm:group-hover:opacity-100
              hover:bg-white/10
              transition-colors duration-150
            `}
            style={{ color: "var(--mq-text-muted)" }}
          >
            <MoreHorizontal className={`${compactMode ? "w-3.5 h-3.5" : "w-4 h-4"}`} />
          </motion.button>
        </div>
      </motion.div>

      {/* Context Menu */}
      {contextMenu.show && (
        <ContextMenu
          track={track}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
        />
      )}
    </>
  );
});

export default TrackCard;
