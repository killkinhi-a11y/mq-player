"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward,
  Repeat, Repeat1, Shuffle, Music, Heart, ListMusic, ChevronUp,
  Loader2, ThumbsDown,
} from "lucide-react";
import { getAudioElement } from "@/lib/audioEngine";
import { formatDuration } from "@/lib/musicApi";
import { useIsMobile } from "@/hooks/use-mobile";
import VolumeSlider from "@/components/ui/volume-slider";
import QueueView from "./QueueView";

// ═════════════════════════════════════════════════════════════════════════
// PLAYER BAR — desktop mini player
// Features:
//  - Ambient cover glow + playing equalizer on cover
//  - Progress bar with hover-preview fill + thumb + timestamp tooltip
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

  const isMobile = useIsMobile();
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);

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

  const getHoverTime = useCallback((clientX: number): number => {
    if (!progressBarRef.current || !duration) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    return (pct / 100) * duration;
  }, [duration]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    seekTo(e.clientX);
  }, [seekTo]);

  const hoverRafRef = useRef(0);
  const handleProgressMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) return;
    const x = e.clientX;
    if (hoverRafRef.current) return;
    hoverRafRef.current = requestAnimationFrame(() => {
      hoverRafRef.current = 0;
      setHoveredTime(getHoverTime(x));
    });
  }, [isDragging, getHoverTime]);

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

  // ── Volume ──
  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
  }, [setVolume]);

  // ── Actions ──
  const handleLike = useCallback(() => {
    if (currentTrack) toggleLike(currentTrack.id, currentTrack);
  }, [currentTrack, toggleLike]);

  const handleDislike = useCallback(() => {
    if (currentTrack) {
      toggleDislike(currentTrack.id, currentTrack);
      // toggleDislike already calls nextTrack() internally
    }
  }, [currentTrack, toggleDislike]);

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

  if (!currentTrack || miniPlayerHidden || isFullTrackViewOpen) return null;
  if (isMobile) return null;

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
                        <span key={i} className="mq-eq-bar w-[2px] rounded-full" style={{ backgroundColor: "#fff", height: "100%" }} />
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
                <button onClick={toggleShuffle} className="w-7 h-7 rounded-full flex items-center justify-center" title="Перемешать">
                  <Shuffle className="w-3.5 h-3.5" style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                </button>

                <button onClick={prevTrack} className="w-8 h-8 rounded-full flex items-center justify-center" title="Предыдущий">
                  <SkipBack className="w-4 h-4" style={{ color: "var(--mq-text)" }} fill="currentColor" />
                </button>

                <button
                  onClick={togglePlay}
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "var(--mq-accent)", boxShadow: "0 4px 16px color-mix(in srgb, var(--mq-accent) 35%, transparent)" }}
                  title="Play/Pause"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#fff" }} />
                    : isPlaying ? <Pause className="w-4 h-4" fill="#fff" style={{ color: "#fff" }} />
                    : <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />}
                </button>

                <button onClick={nextTrack} className="w-8 h-8 rounded-full flex items-center justify-center" title="Следующий">
                  <SkipForward className="w-4 h-4" style={{ color: "var(--mq-text)" }} fill="currentColor" />
                </button>

                <button onClick={toggleRepeat} className="w-7 h-7 rounded-full flex items-center justify-center" title="Повтор">
                  {repeat === "one" ? <Repeat1 className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                    : <Repeat className="w-3.5 h-3.5" style={{ color: repeat === "all" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />}
                </button>
              </div>

              {/* Progress bar with hover preview fill + timestamp tooltip */}
              <div className="flex items-center gap-2 w-full">
                <span className="text-[10px] font-mono tabular-nums w-9 text-right" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(progress)}</span>
                <div
                  ref={progressBarRef}
                  className="flex-1 h-1.5 rounded-full cursor-pointer relative group"
                  onMouseDown={handleProgressMouseDown}
                  onMouseLeave={() => setHoveredTime(null)}
                  onMouseMove={handleProgressMouseMove}
                >
                  {/* Track */}
                  <div className="absolute inset-0 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
                  {/* Hover preview fill */}
                  {hoveredPct > progressPct && (
                    <div className="absolute inset-y-0 left-0 rounded-full opacity-0 group-hover:opacity-100" style={{ transform: `scaleX(${hoveredPct / 100})`, transformOrigin: "left", width: "100%", backgroundColor: "rgba(255,255,255,0.12)" }} />
                  )}
                  {/* Progress fill */}
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ transform: `scaleX(${progressPct / 100})`, transformOrigin: "left", width: "100%", backgroundColor: "var(--mq-accent)", willChange: "transform", transition: isDragging ? "none" : "transform 0.1s linear" }} />
                  {/* Thumb */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{
                      left: `${isDragging ? progressPct : hoveredPct}%`,
                      backgroundColor: "var(--mq-accent)",
                      boxShadow: "0 0 8px color-mix(in srgb, var(--mq-accent) 50%, transparent)",
                    }}
                  />
                  {/* Hover timestamp tooltip */}
                  {hoveredTime !== null && !isDragging && (
                    <div
                      className="absolute -top-7 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-mono pointer-events-none whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{
                        left: `${Math.max(10, Math.min(90, hoveredPct))}%`,
                        backgroundColor: "var(--mq-card)",
                        color: "var(--mq-text)",
                        border: "1px solid var(--mq-border-thin)",
                      }}
                    >
                      {formatDuration(hoveredTime)}
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-mono tabular-nums w-9" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(duration)}</span>
              </div>
            </div>

            {/* ═══ RIGHT: Like, Dislike, Volume, Queue ═══ */}
            <div className="flex items-center gap-1.5 justify-end" style={{ width: "calc(100% / 3 - 16px)" }}>
              {/* Like */}
              <button onClick={handleLike} className="w-8 h-8 rounded-full flex items-center justify-center" title="Нравится">
                <Heart className="w-4 h-4" style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }} fill={isLiked ? "currentColor" : "none"} />
              </button>

              {/* Dislike */}
              <button onClick={handleDislike} className="w-8 h-8 rounded-full flex items-center justify-center" title="Не нравится">
                <ThumbsDown className="w-4 h-4" style={{ color: isDisliked ? "#ef4444" : "var(--mq-text-muted)" }} fill={isDisliked ? "currentColor" : "none"} />
              </button>

              {/* Divider */}
              <div className="w-px h-5 mx-1" style={{ backgroundColor: "var(--mq-border-thin)" }} />

              {/* Volume (premium slider) */}
              <VolumeSlider volume={volume} onChange={handleVolumeChange} className="w-24 lg:w-32" />

              {/* Divider */}
              <div className="w-px h-5 mx-1" style={{ backgroundColor: "var(--mq-border-thin)" }} />

              {/* Queue */}
              <button onClick={() => setShowQueue(true)} className="w-8 h-8 rounded-full flex items-center justify-center" title="Очередь">
                <ListMusic className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
      <QueueView isOpen={showQueue} onClose={() => setShowQueue(false)} />
    </>
  );
}
