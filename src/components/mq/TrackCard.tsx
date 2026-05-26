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

interface TrackCardProps {
  track: Track;
  index?: number;
  queue?: Track[];
  onArtistClick?: (artistName: string, coverUrl?: string) => void;
}

/* ── Mini equalizer bars for "now playing" indicator — 60fps CSS animation ── */
const NowPlayingEqualizer = memo(function NowPlayingEqualizer() {
  return (
    <span className="inline-flex items-end gap-[2px] h-3.5 ml-1.5 flex-shrink-0" aria-label="Now playing">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="mq-track-eq w-[2px] rounded-full inline-block origin-bottom"
          style={{
            backgroundColor: "var(--mq-accent)",
            boxShadow: "0 0 4px color-mix(in srgb, var(--mq-accent) 40%, transparent)",
            animationName: `trackEq${i}`,
            animationDuration: "0.5s",
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </span>
  );
});

const TrackCard = memo(function TrackCard({ track, index = 0, queue, onArtistClick }: TrackCardProps) {
  // Use Zustand selectors to minimize re-renders — only subscribe to needed slices
  const currentTrackId = useAppStore((s) => s.currentTrack?.id);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const playTrack = useAppStore((s) => s.playTrack);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const toggleDislike = useAppStore((s) => s.toggleDislike);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const dislikedTrackIds = useAppStore((s) => s.dislikedTrackIds);
  const compactMode = useAppStore((s) => s.compactMode);

  // O(1) Set lookups instead of O(n) .includes() on arrays
  const likedSet = useMemo(() => new Set(Array.isArray(likedTrackIds) ? likedTrackIds : []), [likedTrackIds]);
  const dislikedSet = useMemo(() => new Set(Array.isArray(dislikedTrackIds) ? dislikedTrackIds : []), [dislikedTrackIds]);
  const isActive = currentTrackId === track.id;
  const isLiked = likedSet.has(track.id);
  const isDisliked = dislikedSet.has(track.id);

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

  // playAction for short taps — called directly on touch (via onShortPress)
  // and on mouse click (via onClick). Avoids the unreliable synthetic click
  // dispatch that caused the "double-click" bug on mobile.
  const playAction = useCallback(() => {
    if (isActive) {
      togglePlay();
    } else {
      playTrack(track, queueFallback);
    }
  }, [isActive, track, queueFallback, togglePlay, playTrack]);

  const { wasLongPress: longPressWasActive, ...longPressHandlers } = useLongPress(handleLongPress, {
    delay: 500,
    onShortPress: playAction, // Direct callback on touch short-tap (no setTimeout)
  });

  const handleClick = useCallback((e: React.MouseEvent) => {
    // Mouse click — suppress if a long press just occurred
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
  }, [track.id, track, toggleLike]);

  const handleDislikeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleDislike(track.id, track);
  }, [track.id, track, toggleDislike]);

  const closeContextMenu = useCallback(() => setContextMenu((prev) => ({ ...prev, show: false })), []);

  return (
    <>
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 6 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(index * 0.025, 0.4), duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseDown={longPressHandlers.onMouseDown}
        onMouseUp={longPressHandlers.onMouseUp}
        onMouseLeave={longPressHandlers.onMouseLeave}
        onTouchStart={longPressHandlers.onTouchStart}
        onTouchEnd={longPressHandlers.onTouchEnd}
        onTouchMove={longPressHandlers.onTouchMove}
        className={`
          group flex items-center
          ${compactMode ? "gap-2.5 px-2.5 py-1.5" : "gap-3 sm:gap-3.5 px-3 py-2 sm:px-3.5 sm:py-2.5"}
          rounded-2xl cursor-pointer relative overflow-hidden
          transition-shadow duration-300 ease-out
          hover:bg-[rgba(255,255,255,0.035)]
          select-none
        `}
        style={{
          backgroundColor: isActive ? "color-mix(in srgb, var(--mq-accent) 8%, transparent)" : "transparent",
          boxShadow: isActive
            ? "0 0 16px color-mix(in srgb, var(--mq-accent) 10%, transparent)"
            : "none",
        }}
        whileHover={{
          boxShadow: isActive
            ? "0 0 20px color-mix(in srgb, var(--mq-accent) 15%, transparent), 0 2px 8px rgba(0,0,0,0.15)"
            : "0 2px 12px rgba(0,0,0,0.12), 0 0 8px color-mix(in srgb, var(--mq-accent) 6%, transparent)",
          y: -1,
        }}
        whileTap={{ scale: 0.995 }}
      >
        {/* Active track left accent bar — simple CSS, no layoutId (prevents flying bar bug) */}
        {isActive && (
          <div
            className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
            style={{ backgroundColor: "var(--mq-accent)" }}
          />
        )}

        {/* ── Cover art ── */}
        <div
          className={`
            ${compactMode ? "w-9 h-9" : "w-11 h-11 sm:w-12 sm:h-12"}
            rounded-lg overflow-hidden flex-shrink-0 relative
          `}
          style={{
            boxShadow: isActive
              ? "0 2px 12px color-mix(in srgb, var(--mq-accent) 20%, transparent)"
              : "0 1px 4px rgba(0,0,0,0.15)",
          }}
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
            <div
              className="w-full h-full flex items-center justify-center"
              style={{
                background: isActive
                  ? "linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 30%, transparent), color-mix(in srgb, var(--mq-accent) 12%, transparent))"
                  : "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
              }}
            >
              <Music className={`${compactMode ? "w-3.5 h-3.5" : "w-4 h-4"}`} style={{ color: isActive ? "var(--mq-accent)" : "var(--mq-text-muted)", opacity: isActive ? 0.7 : 0.4 }} />
            </div>
          )}

          {/* Hover / active overlay */}
          <div
            className="absolute inset-0 flex items-center justify-center
              bg-black/0 group-hover:bg-black/45
              transition-colors duration-200 ease-out"
          >
            {/* Play / pause circle button */}
            <div
              className={`
                flex items-center justify-center
                rounded-full backdrop-blur-sm
                ${compactMode ? "w-7 h-7" : "w-8 h-8"}
                opacity-0 group-hover:opacity-100
                scale-75 group-hover:scale-100
                transition-all duration-200 ease-out
                ${isActive && isPlaying ? "!opacity-100 !scale-100" : ""}
              `}
              style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
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

          {/* Mini equalizer bars on cover (when playing) — 60fps CSS animation */}
          {isActive && isPlaying && (
            <div className="absolute bottom-1 left-1 right-1 flex items-end justify-center gap-[1.5px] h-3.5">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="mq-cover-eq w-[1.5px] rounded-full origin-bottom"
                  style={{
                    backgroundColor: "#fff",
                    boxShadow: "0 0 3px rgba(255,255,255,0.4)",
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
          <div className="flex items-center min-w-0">
            <p
              className={`
                truncate
                ${compactMode ? "text-xs font-semibold" : "text-sm sm:text-[14px] font-semibold"}
              `}
              style={{
                color: isActive ? "var(--mq-accent)" : "var(--mq-text)",
                letterSpacing: "-0.01em",
                textShadow: isActive ? "0 0 12px color-mix(in srgb, var(--mq-accent) 25%, transparent)" : "none",
              }}
            >
              {track.title}
            </p>
            {/* Now-playing equalizer next to title */}
            {isActive && isPlaying && !compactMode && <NowPlayingEqualizer />}
          </div>

          {/* Artist row */}
          <p
            className={`truncate mt-0.5 ${compactMode ? "text-[11px]" : "text-xs"}`}
            style={{ color: "var(--mq-text-muted)" }}
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
          {/* Duration — visible on all screen sizes */}
          {track.duration > 0 && (
            <span
              className={`
                text-[11px] tabular-nums text-right font-medium
                ${compactMode ? "w-8 mr-0.5" : "w-10 mr-0.5"}
              `}
              style={{ color: isActive ? "color-mix(in srgb, var(--mq-accent) 60%, var(--mq-text-muted))" : "var(--mq-text-muted)", opacity: 0.7 }}
            >
              {formatDuration(track.duration)}
            </span>
          )}

          {/* Like button — always visible on mobile, hover-visible on desktop */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleLikeClick}
            className={`
              ${compactMode ? "w-7 h-7" : "w-8 h-8"}
              flex items-center justify-center
              rounded-full
              transition-all duration-150
              sm:opacity-0 sm:group-hover:opacity-100
              hover:bg-white/10
              active:scale-90
            `}
            style={{ color: isLiked ? "#ef4444" : "var(--mq-text-muted)" }}
          >
            <Heart className={`${compactMode ? "w-3.5 h-3.5" : "w-4 h-4"}`} style={isLiked ? { fill: "#ef4444" } : {}} />
          </button>

          {/* Dislike button — hidden on mobile, hover-visible on desktop */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleDislikeClick}
            className={`
              w-8 h-8
              hidden sm:flex items-center justify-center
              rounded-full
              transition-all duration-150
              opacity-0 group-hover:opacity-100
              hover:bg-white/10
              active:scale-90
            `}
            style={{ color: isDisliked ? "#ef4444" : "var(--mq-text-muted)" }}
          >
            <ThumbsDown className="w-3.5 h-3.5" style={isDisliked ? { fill: "#ef4444" } : {}} />
          </button>

          {/* More button — only visible on hover */}
          <button
            onClick={handleMoreClick}
            className={`
              ${compactMode ? "w-7 h-7" : "w-8 h-8"}
              flex items-center justify-center
              rounded-full
              opacity-0 group-hover:opacity-100
              hover:bg-white/10
              transition-all duration-150
            `}
            style={{ color: "var(--mq-text-muted)" }}
          >
            <MoreHorizontal className={`${compactMode ? "w-3.5 h-3.5" : "w-4 h-4"}`} />
          </button>
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
