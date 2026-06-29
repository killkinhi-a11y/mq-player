"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1,
  Repeat, Repeat1, Shuffle, Music, Heart, ListMusic, ChevronUp,
  Loader2, X,
} from "lucide-react";
import { getAudioElement } from "@/lib/audioEngine";
import { formatDuration } from "@/lib/musicApi";
import type { Track } from "@/lib/musicApi";
import { useIsMobile } from "@/hooks/use-mobile";
import QueueView from "./QueueView";

// ═════════════════════════════════════════════════════════════════════════
// PLAYER BAR — mini player at bottom
// ═════════════════════════════════════════════════════════════════════════

export default function PlayerBar() {
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const progress = useAppStore((s) => s.progress);
  const duration = useAppStore((s) => s.duration);
  const volume = useAppStore((s) => s.volume);
  const shuffle = useAppStore((s) => s.shuffle);
  const repeat = useAppStore((s) => s.repeat);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const miniPlayerHidden = useAppStore((s) => s.miniPlayerHidden);
  const playbackState = useAppStore((s) => s.playbackState);
  const isFullTrackViewOpen = useAppStore((s) => s.isFullTrackViewOpen);

  const togglePlay = useAppStore((s) => s.togglePlay);
  const nextTrack = useAppStore((s) => s.nextTrack);
  const prevTrack = useAppStore((s) => s.prevTrack);
  const setVolume = useAppStore((s) => s.setVolume);
  const setProgress = useAppStore((s) => s.setProgress);
  const toggleShuffle = useAppStore((s) => s.toggleShuffle);
  const toggleRepeat = useAppStore((s) => s.toggleRepeat);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const setFullTrackViewOpen = useAppStore((s) => s.setFullTrackViewOpen);
  const setView = useAppStore((s) => s.setView);

  const isMobile = useIsMobile();
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  // ── Seek ──
  const seekTo = useCallback((clientX: number) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const time = (pct / 100) * duration;
    const audio = getAudioElement();
    if (audio && audio.src) audio.currentTime = time;
    setProgress(time);
  }, [duration, setProgress]);

  const handleProgressClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    seekTo(e.clientX);
  }, [seekTo]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    seekTo(e.clientX);
  }, [seekTo]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => seekTo(e.clientX);
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, seekTo]);

  // ── Touch seek ──
  const handleProgressTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    seekTo(e.touches[0].clientX);
  }, [seekTo]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: TouchEvent) => seekTo(e.touches[0].clientX);
    const onUp = () => setIsDragging(false);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [isDragging, seekTo]);

  // ── Volume ──
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(e.target.value));
  }, [setVolume]);

  const handleVolumeMute = useCallback(() => {
    setVolume(volume > 0 ? 0 : 70);
  }, [volume, setVolume]);

  // ── Like ──
  const handleLike = useCallback(() => {
    if (currentTrack) toggleLike(currentTrack.id, currentTrack);
  }, [currentTrack, toggleLike]);

  // ── Open full player ──
  const openFullPlayer = useCallback(() => {
    if (currentTrack) setFullTrackViewOpen(true);
  }, [currentTrack, setFullTrackViewOpen]);

  // ── Derived ──
  const isLiked = currentTrack ? likedTrackIds.includes(currentTrack.id) : false;
  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;
  const isLoading = playbackState === "loading" || playbackState === "buffering";

  if (!currentTrack || miniPlayerHidden || isFullTrackViewOpen) return null;

  // Mobile: player is rendered inside MobileDock (unified with nav)
  if (isMobile) return null;

  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  // ════════════════════════════════════════════════════════════════
  // MOBILE LAYOUT — integrated with MobileNav as a single glass stack
  // ════════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
        className="fixed z-[55] left-3 right-3"
        style={{ bottom: "calc(68px + env(safe-area-inset-bottom, 0px))" }}
      >
        {/* Player section — flush with MobileNav below */}
        <div
          className="rounded-t-[24px] overflow-hidden"
          style={{
            background: "color-mix(in srgb, var(--mq-bg) 65%, transparent)",
            backdropFilter: "blur(40px) saturate(200%)",
            WebkitBackdropFilter: "blur(40px) saturate(200%)",
            border: "1px solid var(--mq-border-thin)",
            borderBottom: "none",
            boxShadow: "0 -4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          {/* Progress bar — top edge, thin accent line */}
          <div
            ref={progressBarRef}
            className="h-[3px] w-full cursor-pointer relative"
            onMouseDown={handleProgressMouseDown}
            onTouchStart={handleProgressTouchStart}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            <div className="absolute inset-0" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: `${progressPct}%`,
                backgroundColor: "var(--mq-accent)",
                transition: isDragging ? "none" : "width 0.1s linear",
              }}
            />
          </div>

          {/* Content — compact, touch-friendly */}
          <div className="flex items-center gap-2.5 px-3 py-2">
            {/* Cover + info — tap opens full player */}
            <button
              onClick={openFullPlayer}
              className="flex items-center gap-2.5 flex-1 min-w-0 text-left cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ boxShadow: "var(--mq-shadow-premium-sm)" }}>
                {currentTrack.cover ? (
                  <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}>
                    <Music className="w-4 h-4" style={{ color: "rgba(255,255,255,0.7)" }} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold truncate leading-tight" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</p>
                <p className="text-[11px] truncate leading-tight mt-0.5" style={{ color: "var(--mq-text-muted)" }}>{currentTrack.artist}</p>
              </div>
            </button>

            {/* Like */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={handleLike}
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            >
              <Heart
                className="w-[18px] h-[18px]"
                style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
                fill={isLiked ? "currentColor" : "none"}
              />
            </motion.button>

            {/* Play/Pause — accent circle */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={togglePlay}
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: "var(--mq-accent)",
                boxShadow: "0 2px 8px color-mix(in srgb, var(--mq-accent) 30%, transparent)",
              }}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#fff" }} />
              ) : isPlaying ? (
                <Pause className="w-4 h-4" fill="#fff" style={{ color: "#fff" }} />
              ) : (
                <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
              )}
            </motion.button>

            {/* Next */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={nextTrack}
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            >
              <SkipForward className="w-[18px] h-[18px]" style={{ color: "var(--mq-text-muted)" }} fill="currentColor" />
            </motion.button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // DESKTOP LAYOUT
  // ════════════════════════════════════════════════════════════════
  return (
    <>
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: "spring", stiffness: 350, damping: 30 }}
      className="fixed z-[55] left-4 right-4"
      style={{ bottom: "12px" }}
    >
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "color-mix(in srgb, var(--mq-player-bg) 75%, transparent)",
          backdropFilter: "blur(40px) saturate(200%)",
          WebkitBackdropFilter: "blur(40px) saturate(200%)",
          border: "1px solid var(--mq-border-thin)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex items-center gap-4 p-3">
          {/* Cover + info — click opens full player */}
          <button
            onClick={openFullPlayer}
            className="flex items-center gap-3 min-w-0 cursor-pointer"
            style={{ width: "calc(100% / 3 - 16px)" }}
          >
            <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0" style={{ boxShadow: "var(--mq-shadow-premium-sm)" }}>
              {currentTrack.cover ? (
                <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}>
                  <Music className="w-5 h-5" style={{ color: "rgba(255,255,255,0.7)" }} />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</p>
              <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{currentTrack.artist}</p>
            </div>
            <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
          </button>

          {/* Controls — center */}
          <div className="flex flex-col items-center gap-1.5 flex-1 max-w-md">
            <div className="flex items-center gap-4">
              {/* Shuffle */}
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={toggleShuffle}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                title="Перемешать"
              >
                <Shuffle className="w-4 h-4" style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
              </motion.button>

              {/* Previous */}
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={prevTrack}
                className="w-9 h-9 rounded-full flex items-center justify-center"
              >
                <SkipBack className="w-5 h-5" style={{ color: "var(--mq-text)" }} fill="currentColor" />
              </motion.button>

              {/* Play/Pause */}
              <motion.button
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.05 }}
                onClick={togglePlay}
                className="w-11 h-11 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: "var(--mq-accent)",
                  boxShadow: "0 4px 16px color-mix(in srgb, var(--mq-accent) 35%, transparent)",
                }}
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#fff" }} />
                ) : isPlaying ? (
                  <Pause className="w-5 h-5" fill="#fff" style={{ color: "#fff" }} />
                ) : (
                  <Play className="w-5 h-5 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
                )}
              </motion.button>

              {/* Next */}
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={nextTrack}
                className="w-9 h-9 rounded-full flex items-center justify-center"
              >
                <SkipForward className="w-5 h-5" style={{ color: "var(--mq-text)" }} fill="currentColor" />
              </motion.button>

              {/* Repeat */}
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={toggleRepeat}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                title="Повтор"
              >
                {repeat === "one" ? (
                  <Repeat1 className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
                ) : (
                  <Repeat className="w-4 h-4" style={{ color: repeat === "all" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                )}
              </motion.button>
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-2 w-full">
              <span className="text-[10px] font-mono tabular-nums w-9 text-right" style={{ color: "var(--mq-text-muted)" }}>
                {formatDuration(progress)}
              </span>
              <div
                ref={progressBarRef}
                className="flex-1 h-1.5 rounded-full cursor-pointer relative group"
                onMouseDown={handleProgressMouseDown}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
              >
                <div className="absolute inset-0 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${progressPct}%`,
                    backgroundColor: "var(--mq-accent)",
                    transition: isDragging ? "none" : "width 0.1s linear",
                  }}
                />
                {isHovering && (
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full pointer-events-none"
                    style={{
                      left: `${progressPct}%`,
                      backgroundColor: "var(--mq-accent)",
                      boxShadow: "0 0 8px color-mix(in srgb, var(--mq-accent) 50%, transparent)",
                    }}
                  />
                )}
              </div>
              <span className="text-[10px] font-mono tabular-nums w-9" style={{ color: "var(--mq-text-muted)" }}>
                {formatDuration(duration)}
              </span>
            </div>
          </div>

          {/* Right — like + volume */}
          <div className="flex items-center gap-2 justify-end" style={{ width: "calc(100% / 3 - 16px)" }}>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleLike}
              className="w-9 h-9 rounded-full flex items-center justify-center"
            >
              <Heart
                className="w-4 h-4"
                style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
                fill={isLiked ? "currentColor" : "none"}
              />
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleVolumeMute}
              className="w-9 h-9 rounded-full flex items-center justify-center"
            >
              <VolumeIcon className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
            </motion.button>

            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={handleVolumeChange}
              className="w-20 h-1.5 rounded-full cursor-pointer"
              style={{ accentColor: "var(--mq-accent)" }}
            />

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowQueue(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              title="Очередь"
            >
              <ListMusic className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
    <QueueView isOpen={showQueue} onClose={() => setShowQueue(false)} />
    </>
  );
}
