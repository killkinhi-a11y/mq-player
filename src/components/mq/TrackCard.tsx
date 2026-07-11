"use client";

import { useState, useCallback, useMemo, memo } from "react";
import { type Track } from "@/lib/musicApi";
import { useAppStore } from "@/store/useAppStore";
import { Play, Pause, Heart, ThumbsDown, MoreHorizontal, Music } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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

  // B1 fix: use design tokens (--mq-radius-xl=16px, --mq-radius-lg=12px)
  // instead of hardcoded px literals — keeps 1500+ card instances consistent.
  const cardRadius = isMobile ? "var(--mq-radius-xl)" : "var(--mq-radius-lg)";

  // P4.3: Subscribe to likedTrackIds array reference (not .includes() per render).
  // The selector returns a boolean — Zustand only re-renders when the boolean
  // changes (liked → unliked or vice versa), NOT on every store update.
  const isActive = currentTrackId === track.id;
  // The .includes() still runs, but only when likedTrackIds array identity
  // changes (which happens only on like/unlike, not on progress ticks etc).
  const isLiked = useAppStore((s) =>
    Array.isArray(s.likedTrackIds) && s.likedTrackIds.includes(track.id)
  );
  const isDisliked = useAppStore((s) =>
    Array.isArray(s.dislikedTrackIds) && s.dislikedTrackIds.includes(track.id)
  );

  // Track like/dislike animation state
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

  const handleClick = useCallback((e: React.MouseEvent) => {
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
        className={`
          group flex items-center
          ${compactMode ? "gap-2.5 px-2.5 py-1.5" : "gap-3 sm:gap-3.5 px-3 py-2 sm:px-3.5 sm:py-2.5"}
          cursor-pointer relative overflow-hidden
          transition-[background-color] duration-300 ease-out
          select-none
          focus-visible:outline-2 focus-visible:outline-offset-2
        `}
        style={{
          borderRadius: cardRadius,
          backgroundColor: isActive
            ? `color-mix(in srgb, var(--mq-accent) ${isMobile ? 6 : 8}%, transparent)`
            : "transparent",
          boxShadow: isActive
            ? `0 0 ${isMobile ? 12 : 16}px color-mix(in srgb, var(--mq-accent) ${isMobile ? 6 : 10}%, transparent)${isMobile ? "" : ", inset 0 1px 0 rgba(255,255,255,0.04)"}`
            : isMobile ? "none" : "inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
        whileHover={{
          y: isMobile ? -1 : -2,
          boxShadow: isActive
            ? `0 0 ${isMobile ? 20 : 24}px color-mix(in srgb, var(--mq-accent) ${isMobile ? 10 : 15}%, transparent), 0 ${isMobile ? 2 : 4}px ${isMobile ? 12 : 16}px rgba(0,0,0,0.15)`
            : `0 ${isMobile ? 2 : 4}px ${isMobile ? 12 : 16}px rgba(0,0,0,0.1), 0 0 ${isMobile ? 16 : 20}px color-mix(in srgb, var(--mq-accent) ${isMobile ? 4 : 6}%, transparent)`,
          transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] },
        }}
        whileTap={{ scale: 0.995 }}
      >
        {/* Ambient glow layer — accent color on hover */}
        <div
          className="absolute inset-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-500 pointer-events-none -z-10"
          style={{
            borderRadius: cardRadius,
            boxShadow: `0 0 ${isMobile ? 16 : 20}px color-mix(in srgb, var(--mq-accent) ${isMobile ? 8 : 15}%, transparent)`,
            filter: `blur(${isMobile ? 16 : 20}px)`,
          }}
        />

        {/* Border glow ring — appears on hover */}
        <div
          className={`
            absolute inset-0 pointer-events-none
            border transition-colors duration-300
            ${isActive
              ? `border-[color-mix(in_srgb,var(--mq-accent)_${isMobile ? 18 : 25}%,transparent)]`
              : `border-transparent group-hover:border-[color-mix(in_srgb,var(--mq-accent)_${isMobile ? 10 : 15}%,transparent)]`
            }
          `}
        />

        {/* Active track left accent bar */}
        {isActive && (
          <div className={`absolute left-0 ${isMobile ? "top-3 bottom-3 w-[2px]" : "top-2 bottom-2 w-[3px]"} rounded-full overflow-visible`}>
            <div
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: "var(--mq-accent)", opacity: isMobile ? 0.7 : 1 }}
            />
            <div
              className="absolute inset-0 rounded-full"
              style={{
                backgroundColor: "var(--mq-accent)",
                boxShadow: isMobile
                  ? "0 0 6px var(--mq-accent)"
                  : "0 0 8px var(--mq-accent), 0 0 16px color-mix(in srgb, var(--mq-accent) 40%, transparent)",
                animation: "mqBreathe 2s ease-in-out infinite",
                opacity: isMobile ? 0.5 : 1,
              }}
            />
          </div>
        )}

        {/* Pulsing background tint when active */}
        {isActive && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              borderRadius: cardRadius,
              backgroundColor: "var(--mq-accent)",
              animation: "mqPulseTint 2.5s ease-in-out infinite",
              opacity: isMobile ? 0.03 : undefined,
            }}
          />
        )}

        {/* ── Cover art ── */}
        <div
          className={`
            ${compactMode ? "w-9 h-9" : "w-11 h-11 sm:w-12 sm:h-12"}
            rounded-lg overflow-hidden flex-shrink-0 relative
            mq-cover-shadow
            transition-transform duration-300 ease-out
            group-hover:scale-[1.05]
          `}
          style={{
            boxShadow: isActive
              ? `0 2px ${isMobile ? 8 : 12}px color-mix(in srgb, var(--mq-accent) ${isMobile ? 15 : 25}%, transparent)`
              : undefined,
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
            {/* Play / pause circle button — glass background with spring animation */}
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              className={`
                flex items-center justify-center
                rounded-full
                ${compactMode ? "w-7 h-7" : "w-8 h-8"}
                sm:opacity-0 sm:group-hover:opacity-100
                transition-opacity duration-200 ease-out
                ${isActive && isPlaying ? "!opacity-100" : ""}
              `}
              style={{
                backgroundColor: "rgba(0,0,0,0.45)",
                backdropFilter: "blur(12px) saturate(180%)",
                WebkitBackdropFilter: "blur(12px) saturate(180%)",
                border: "1px solid var(--mq-border-medium)",
              }}
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
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
            </motion.div>
          </div>

          {/* Mini equalizer bars on cover (when playing) — with subtle glow */}
          {isActive && isPlaying && (
            <div className="absolute bottom-1 left-1 right-1 flex items-end justify-center gap-[1.5px] h-3.5">
              {/* Glow layer behind eq bars */}
              <div
                className="absolute inset-0 rounded-sm"
                style={{
                  background: "radial-gradient(ellipse at center, color-mix(in srgb, var(--mq-accent) 30%, transparent), transparent 70%)",
                  filter: "blur(4px)",
                }}
              />
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="mq-cover-eq w-[1.5px] rounded-full origin-bottom relative z-10"
                  style={{
                    backgroundColor: "#fff",
                    boxShadow: "0 0 4px rgba(255,255,255,0.5), 0 0 8px color-mix(in srgb, var(--mq-accent) 30%, transparent)",
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
                textShadow: isActive ? "0 0 12px color-mix(in srgb, var(--mq-accent) 25%, transparent)" : "none",
              }}
            >
              <span title={`${track.title} — ${track.artist}`}>{track.title}</span>
            </p>
            {/* Gradient fade on long titles */}
            <span
              className="absolute right-8 top-0 bottom-0 w-8 pointer-events-none"
              style={{
                background: isActive
                  ? "linear-gradient(to right, transparent, color-mix(in srgb, var(--mq-accent) 8%, transparent))"
                  : "linear-gradient(to right, transparent, var(--mq-bg, #0e0e0e))",
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

          {/* More button — rotate 90deg on hover */}
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
            whileHover={{ rotate: 90 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
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
