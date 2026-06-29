"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1,
  Repeat, Repeat1, Shuffle, Music, Heart, ListMusic, ChevronUp,
  Loader2, ThumbsDown, Clock, Mic2, Share2, AirVent, Gauge,
  Radio, Disc3,
} from "lucide-react";
import { getAudioElement } from "@/lib/audioEngine";
import { formatDuration } from "@/lib/musicApi";
import type { Track } from "@/lib/musicApi";
import { useIsMobile } from "@/hooks/use-mobile";
import QueueView from "./QueueView";

// ═════════════════════════════════════════════════════════════════════════
// PLAYER BAR — desktop mini player
// Premium features:
//  - Hover-preview on progress bar with mini cover thumbnail + timestamp
//  - "Now playing from" context badge (Wave / playlist name / queue)
//  - Ambient cover glow + playing equalizer on cover
//  - Dislike → auto-skip
//  - Quick access to Queue panel
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
  const dislikedTrackIds = useAppStore((s) => s.dislikedTrackIds);
  const miniPlayerHidden = useAppStore((s) => s.miniPlayerHidden);
  const playbackState = useAppStore((s) => s.playbackState);
  const isFullTrackViewOpen = useAppStore((s) => s.isFullTrackViewOpen);
  const radioMode = useAppStore((s) => s.radioMode);
  const currentPlaylistId = useAppStore((s) => s.currentPlaylistId);
  const playlists = useAppStore((s) => s.playlists);

  const togglePlay = useAppStore((s) => s.togglePlay);
  const nextTrack = useAppStore((s) => s.nextTrack);
  const prevTrack = useAppStore((s) => s.prevTrack);
  const setVolume = useAppStore((s) => s.setVolume);
  const setProgress = useAppStore((s) => s.setProgress);
  const toggleShuffle = useAppStore((s) => s.toggleShuffle);
  const toggleRepeat = useAppStore((s) => s.toggleRepeat);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const toggleDislike = useAppStore((s) => s.toggleDislike);
  const setFullTrackViewOpen = useAppStore((s) => s.setFullTrackViewOpen);
  const setView = useAppStore((s) => s.setView);

  const isMobile = useIsMobile();
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [hoveredX, setHoveredX] = useState(0); // px position of thumb/tooltip

  // ── Seek ────────────────────────────────────────────────────────────────
  const seekTo = useCallback((clientX: number) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const time = (pct / 100) * duration;
    const audio = getAudioElement();
    if (audio && audio.src) audio.currentTime = time;
    setProgress(time);
  }, [duration, setProgress]);

  const getHoverData = useCallback((clientX: number): { time: number; pct: number; x: number } => {
    if (!progressBarRef.current || !duration) return { time: 0, pct: 0, x: 0 };
    const rect = progressBarRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    return {
      time: (pct / 100) * duration,
      pct,
      x: clientX - rect.left,
    };
  }, [duration]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    seekTo(e.clientX);
  }, [seekTo]);

  const handleProgressMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) return;
    const data = getHoverData(e.clientX);
    setHoveredTime(data.time);
    setHoveredX(data.x);
  }, [isDragging, getHoverData]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const data = getHoverData(e.clientX);
      setHoveredTime(data.time);
      setHoveredX(data.x);
      seekTo(e.clientX);
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, seekTo, getHoverData]);

  // ── Volume ──
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(e.target.value));
  }, [setVolume]);

  const handleVolumeMute = useCallback(() => {
    setVolume(volume > 0 ? 0 : 70);
  }, [volume, setVolume]);

  // ── Actions ──
  const handleLike = useCallback(() => {
    if (currentTrack) toggleLike(currentTrack.id, currentTrack);
  }, [currentTrack, toggleLike]);

  const handleDislike = useCallback(() => {
    if (currentTrack) {
      toggleDislike(currentTrack.id, currentTrack);
      nextTrack();
    }
  }, [currentTrack, toggleDislike, nextTrack]);

  const handleShare = useCallback(async () => {
    if (!currentTrack) return;
    const url = `${window.location.origin}/track/${currentTrack.scTrackId || currentTrack.id}`;
    if (navigator.share) {
      try { await navigator.share({ title: currentTrack.title, url }); } catch {}
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
    }
  }, [currentTrack]);

  const openFullPlayer = useCallback(() => {
    if (currentTrack) setFullTrackViewOpen(true);
  }, [currentTrack, setFullTrackViewOpen]);

  // ── Derived ──
  const isLiked = currentTrack ? likedTrackIds.includes(currentTrack.id) : false;
  const isDisliked = currentTrack ? dislikedTrackIds.includes(currentTrack.id) : false;
  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;
  const hoveredPct = hoveredTime !== null && duration > 0 ? (hoveredTime / duration) * 100 : 0;
  const isLoading = playbackState === "loading" || playbackState === "buffering";

  // ── "Now playing from" context badge ──
  const contextLabel = useMemo(() => {
    if (radioMode) return { label: "Волна", icon: Radio };
    if (currentPlaylistId) {
      const pl = playlists.find(p => p.id === currentPlaylistId);
      if (pl) return { label: pl.name, icon: Disc3 };
    }
    return null;
  }, [radioMode, currentPlaylistId, playlists]);

  if (!currentTrack || miniPlayerHidden || isFullTrackViewOpen) return null;
  if (isMobile) return null;

  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

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
          className="rounded-2xl overflow-hidden relative"
          style={{
            backgroundColor: "color-mix(in srgb, var(--mq-player-bg) 75%, transparent)",
            backdropFilter: "blur(40px) saturate(200%)",
            WebkitBackdropFilter: "blur(40px) saturate(200%)",
            border: "1px solid var(--mq-border-thin)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          {/* Ambient cover glow */}
          {currentTrack.cover && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
              <img
                src={currentTrack.cover}
                alt=""
                className="w-full h-full object-cover"
                style={{ filter: "blur(40px) saturate(180%)", opacity: 0.06 }}
              />
            </div>
          )}

          {/* "Now playing from" badge — floating at top center of bar */}
          {contextLabel && (
            <div
              className="absolute left-1/2 -translate-x-1/2 -top-2.5 px-2 py-0.5 rounded-full flex items-center gap-1.5 pointer-events-none"
              style={{
                background: "color-mix(in srgb, var(--mq-accent) 18%, var(--mq-bg))",
                border: "1px solid color-mix(in srgb, var(--mq-accent) 25%, transparent)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
              }}
            >
              <contextLabel.icon className="w-2.5 h-2.5" style={{ color: "var(--mq-accent)" }} />
              <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--mq-accent)" }}>
                {contextLabel.label}
              </span>
            </div>
          )}

          <div className="relative flex items-center gap-4 p-3">
            {/* ═══ LEFT: Cover + info ═══ */}
            <button
              onClick={openFullPlayer}
              className="flex items-center gap-3 min-w-0 cursor-pointer"
              style={{ width: "calc(100% / 3 - 16px)" }}
            >
              <div
                className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 relative"
                style={{ boxShadow: "var(--mq-shadow-premium-sm)" }}
              >
                {currentTrack.cover ? (
                  <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}>
                    <Music className="w-5 h-5" style={{ color: "rgba(255,255,255,0.7)" }} />
                  </div>
                )}
                {/* Playing indicator on cover */}
                {isPlaying && (
                  <div className="absolute inset-0 bg-black/30 flex items-end p-1">
                    <div className="flex items-end gap-[1px] h-3 w-full justify-center">
                      {[0,1,2,3].map(i => (
                        <motion.div
                          key={i}
                          className="w-[2px] rounded-full"
                          style={{ backgroundColor: "#fff", height: "100%", originY: 1 }}
                          animate={{ scaleY: [0.3, 1, 0.3] }}
                          transition={{ duration: 0.5 + i * 0.1, repeat: Infinity, delay: i * 0.08 }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</p>
                <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{currentTrack.artist}</p>
              </div>
              <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
            </button>

            {/* ═══ CENTER: Controls + progress ═══ */}
            <div className="flex flex-col items-center gap-1.5 flex-1 max-w-md">
              {/* Control buttons */}
              <div className="flex items-center gap-3">
                <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.1 }} onClick={toggleShuffle} className="w-7 h-7 rounded-full flex items-center justify-center" title="Перемешать">
                  <Shuffle className="w-3.5 h-3.5" style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                </motion.button>

                <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.1 }} onClick={prevTrack} className="w-8 h-8 rounded-full flex items-center justify-center" title="Предыдущий">
                  <SkipBack className="w-4 h-4" style={{ color: "var(--mq-text)" }} fill="currentColor" />
                </motion.button>

                <motion.button
                  whileTap={{ scale: 0.9 }}
                  whileHover={{ scale: 1.06 }}
                  onClick={togglePlay}
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "var(--mq-accent)", boxShadow: "0 4px 16px color-mix(in srgb, var(--mq-accent) 35%, transparent)" }}
                  title="Play/Pause"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#fff" }} />
                    : isPlaying ? <Pause className="w-4 h-4" fill="#fff" style={{ color: "#fff" }} />
                    : <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />}
                </motion.button>

                <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.1 }} onClick={nextTrack} className="w-8 h-8 rounded-full flex items-center justify-center" title="Следующий">
                  <SkipForward className="w-4 h-4" style={{ color: "var(--mq-text)" }} fill="currentColor" />
                </motion.button>

                <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.1 }} onClick={toggleRepeat} className="w-7 h-7 rounded-full flex items-center justify-center" title="Повтор">
                  {repeat === "one" ? <Repeat1 className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                    : <Repeat className="w-3.5 h-3.5" style={{ color: repeat === "all" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />}
                </motion.button>
              </div>

              {/* Progress bar with hover preview thumbnail */}
              <div className="flex items-center gap-2 w-full">
                <span className="text-[10px] font-mono tabular-nums w-9 text-right" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(progress)}</span>
                <div
                  ref={progressBarRef}
                  className="flex-1 h-1.5 rounded-full cursor-pointer relative group"
                  onMouseDown={handleProgressMouseDown}
                  onMouseEnter={() => setIsHovering(true)}
                  onMouseLeave={() => { setIsHovering(false); setHoveredTime(null); }}
                  onMouseMove={handleProgressMouseMove}
                >
                  {/* Track */}
                  <div className="absolute inset-0 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
                  {/* Hover preview fill */}
                  {isHovering && hoveredPct > progressPct && (
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${hoveredPct}%`, backgroundColor: "rgba(255,255,255,0.12)" }} />
                  )}
                  {/* Progress fill */}
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${progressPct}%`, backgroundColor: "var(--mq-accent)", transition: isDragging ? "none" : "width 0.1s linear" }} />
                  {/* Thumb */}
                  {isHovering && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full pointer-events-none"
                      style={{
                        left: `${isDragging ? progressPct : hoveredPct}%`,
                        backgroundColor: "var(--mq-accent)",
                        boxShadow: "0 0 8px color-mix(in srgb, var(--mq-accent) 50%, transparent)",
                      }}
                    />
                  )}
                  {/* Hover preview: mini cover + timestamp */}
                  {isHovering && hoveredTime !== null && (
                    <div
                      className="absolute pointer-events-none flex flex-col items-center gap-1"
                      style={{
                        left: `${hoveredX}px`,
                        bottom: "100%",
                        transform: "translateX(-50%)",
                        marginBottom: "8px",
                      }}
                    >
                      {/* Mini cover thumbnail */}
                      <div
                        className="w-14 h-14 rounded-lg overflow-hidden relative"
                        style={{
                          boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                          border: "1px solid rgba(255,255,255,0.1)",
                        }}
                      >
                        {currentTrack.cover ? (
                          <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" style={{ filter: "saturate(120%)" }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}>
                            <Music className="w-4 h-4" style={{ color: "rgba(255,255,255,0.6)" }} />
                          </div>
                        )}
                        {/* Timestamp pill at the bottom of thumbnail */}
                        <div
                          className="absolute bottom-0 inset-x-0 text-center py-0.5"
                          style={{
                            background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.85))",
                            color: "#fff",
                            fontSize: 9,
                            fontWeight: 600,
                            fontVariantNumeric: "tabular-nums",
                            fontFamily: "monospace",
                          }}
                        >
                          {formatDuration(hoveredTime)}
                        </div>
                      </div>
                      {/* Pointer triangle */}
                      <div
                        style={{
                          width: 0,
                          height: 0,
                          borderLeft: "4px solid transparent",
                          borderRight: "4px solid transparent",
                          borderTop: "5px solid rgba(0,0,0,0.6)",
                        }}
                      />
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-mono tabular-nums w-9" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(duration)}</span>
              </div>
            </div>

            {/* ═══ RIGHT: Like, Dislike, Volume, Queue ═══ */}
            <div className="flex items-center gap-1.5 justify-end" style={{ width: "calc(100% / 3 - 16px)" }}>
              {/* Like */}
              <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.1 }} onClick={handleLike} className="w-8 h-8 rounded-full flex items-center justify-center" title="Нравится">
                <Heart className="w-4 h-4" style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }} fill={isLiked ? "currentColor" : "none"} />
              </motion.button>

              {/* Dislike */}
              <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.1 }} onClick={handleDislike} className="w-8 h-8 rounded-full flex items-center justify-center" title="Не нравится">
                <ThumbsDown className="w-4 h-4" style={{ color: isDisliked ? "#ef4444" : "var(--mq-text-muted)" }} fill={isDisliked ? "currentColor" : "none"} />
              </motion.button>

              {/* Divider */}
              <div className="w-px h-5 mx-1" style={{ backgroundColor: "var(--mq-border-thin)" }} />

              {/* Volume */}
              <motion.button whileTap={{ scale: 0.9 }} onClick={handleVolumeMute} className="w-8 h-8 rounded-full flex items-center justify-center" title="Звук">
                <VolumeIcon className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
              </motion.button>
              <input type="range" min={0} max={100} value={volume} onChange={handleVolumeChange} className="w-16 h-1 rounded-full cursor-pointer" style={{ accentColor: "var(--mq-accent)" }} />

              {/* Divider */}
              <div className="w-px h-5 mx-1" style={{ backgroundColor: "var(--mq-border-thin)" }} />

              {/* Queue */}
              <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.1 }} onClick={() => setShowQueue(true)} className="w-8 h-8 rounded-full flex items-center justify-center" title="Очередь">
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
