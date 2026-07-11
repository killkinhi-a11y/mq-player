"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward,
  Repeat, Repeat1, Shuffle, Music, Heart, ListMusic, ChevronUp,
  Loader2, ThumbsDown, Volume2, VolumeX, Volume1, Radio, Sliders, Waves,
} from "lucide-react";
import { getAudioElement } from "@/lib/audioEngine";
import { formatDuration } from "@/lib/musicApi";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWaveEngine } from "@/hooks/useWaveEngine";
import { hapticLike, hapticDislike, hapticSkip, hapticPlay } from "@/lib/haptics";
import { useToast } from "@/hooks/use-toast";
import QueueView from "./QueueView";
import { ProgressBar } from "./ProgressBar";
import { NowPlayingEqualizer } from "./NowPlayingEqualizer";

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
  const queue = useAppStore((s) => s.queue);
  const queueIndex = useAppStore((s) => s.queueIndex);
  const upNext = useAppStore((s) => s.upNext);
  const radioMode = useAppStore((s) => s.radioMode);
  const peekNextTrack = useAppStore((s) => s.peekNextTrack);

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
  const setEqOpen = useAppStore((s) => s.setEqOpen);
  const eqEnabled = useAppStore((s) => s.eqEnabled);

  // Wave engine — used for "Радио от трека" button (starts wave seeded by current track)
  const wave = useWaveEngine();
  const { toast } = useToast();
  const [showUpNext, setShowUpNext] = useState(false);
  // Hover timer for Up Next tooltip — 150ms open delay prevents flicker when
  // sweeping the mouse across the controls. Cleared on unmount.
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const isMobile = useIsMobile();
  const [isDragging, setIsDragging] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  // ── Progress bar callbacks (memoized to prevent ProgressBar's drag
  // useEffect from re-running on every render — inline arrow functions
  // create new identities each render, causing the effect to tear down
  // and re-add window listeners mid-drag, which loses mouseup events
  // and leaves the bar "stuck" in dragging state) ──
  const handleProgressSeek = useCallback((time: number) => {
    const audio = getAudioElement();
    if (audio && audio.src) audio.currentTime = time;
    setProgress(time);
  }, [setProgress]);

  const handleProgressDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleProgressDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // ── Volume ──
  const volTrackRef = useRef<HTMLDivElement>(null);
  const volFillRef = useRef<HTMLDivElement>(null);
  const volThumbRef = useRef<HTMLDivElement>(null);
  const [isVolDragging, setIsVolDragging] = useState(false);
  const volRafRef = useRef(0);
  const volRef = useRef(volume);
  useEffect(() => { volRef.current = volume; }, [volume]);

  // Sync fill/thumb from store volume when not dragging
  useEffect(() => {
    if (isVolDragging) return;
    if (volFillRef.current) volFillRef.current.style.width = `${volume}%`;
    if (volThumbRef.current) volThumbRef.current.style.left = `${volume}%`;
  }, [volume, isVolDragging]);

  const seekVolume = useCallback((clientX: number) => {
    if (!volTrackRef.current) return;
    const rect = volTrackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    if (volFillRef.current) volFillRef.current.style.width = `${pct}%`;
    if (volThumbRef.current) volThumbRef.current.style.left = `${pct}%`;
    volRef.current = pct;
    if (volRafRef.current) cancelAnimationFrame(volRafRef.current);
    volRafRef.current = requestAnimationFrame(() => setVolume(pct));
  }, [setVolume]);

  const handleVolDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsVolDragging(true);
    seekVolume(e.clientX);
  }, [seekVolume]);

  useEffect(() => {
    if (!isVolDragging) return;
    const onMove = (e: MouseEvent) => seekVolume(e.clientX);
    const onUp = () => { setIsVolDragging(false); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isVolDragging, seekVolume]);

  const prevVolumeRef = useRef(70);
  const handleVolMute = useCallback(() => {
    // Mute: save current volume to prevVolumeRef so we can restore it.
    // Unmute: restore from prevVolumeRef (was buggy before — always
    // restored to 70 even if user had set a different volume).
    const cur = volRef.current;
    if (cur > 0) {
      prevVolumeRef.current = cur;
      setVolume(0);
    } else {
      setVolume(prevVolumeRef.current > 0 ? prevVolumeRef.current : 70);
    }
  }, [setVolume]);

  // ── Actions (with haptic feedback + toast notifications) ──
  const handleLike = useCallback(() => {
    if (currentTrack) {
      const wasLiked = likedTrackIds.includes(currentTrack.id);
      toggleLike(currentTrack.id, currentTrack);
      hapticLike();
      toast({
        title: wasLiked ? "Убрано из избранного" : "Добавлено в избранное",
        duration: 2000,
      });
    }
  }, [currentTrack, toggleLike, likedTrackIds, toast]);

  const handleDislike = useCallback(() => {
    if (currentTrack) {
      toggleDislike(currentTrack.id, currentTrack);
      hapticDislike();
      toast({
        title: "Не нравится",
        description: "Больше не будет попадаться",
        duration: 2000,
      });
    }
  }, [currentTrack, toggleDislike, toast]);

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
  const isLoading = playbackState === "loading" || playbackState === "buffering";
  const VolIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  // ── Next track preview (Up Next) ──
  // Show preview when there is a next track in queue OR an upNext entry.
  // Respects shuffle (no preview in shuffle — next is random).
  const nextTrackPreview = useMemo(() => {
    // Use store action via peekNextTrack
    return peekNextTrack();
  }, [peekNextTrack, queue, queueIndex, upNext, shuffle, repeat]);
  const hasNextTrack = !!nextTrackPreview;

  // ── "Радио от трека" — start wave seeded by current track ──
  // Radio button acts as TOGGLE: first press starts wave from current
  // track, second press stops wave entirely. Previously the button only
  // started the wave and was a no-op when wave was already active — user
  // had no way to turn it off from the player bar (Stop button was on
  // Wave Card, now removed). Now toggle behavior is the single control.
  const handleStartRadio = useCallback(() => {
    if (radioMode) {
      // Wave is active → stop it
      wave.stopWave();
      return;
    }
    if (currentTrack) {
      wave.startWaveFromCurrentTrack();
    }
  }, [currentTrack, wave, radioMode]);

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
          className="rounded-2xl relative"
          style={{
            backgroundColor: "color-mix(in srgb, var(--mq-player-bg) 75%, transparent)",
            backdropFilter: "blur(40px) saturate(200%)",
            WebkitBackdropFilter: "blur(40px) saturate(200%)",
            border: "1px solid var(--mq-border-thin)",
            boxShadow: "var(--mq-shadow-float), var(--mq-shadow-inner-glow)",
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
                {/* Playing indicator on cover — overlay variant
                    (white bars, drop-shadow glow). When paused OR loading,
                    animation freezes and bars dim to 50% opacity.
                    Overlay opacity itself is reduced when paused so the
                    cover art stays more visible in idle state. */}
                <div
                  className="absolute inset-0 flex items-end justify-center pb-1.5"
                  style={{
                    backgroundColor: "var(--mq-overlay-scrim)",
                    opacity: isPlaying ? 1 : 0.65,
                    transition: "opacity 0.25s ease-out",
                  }}
                >
                  <NowPlayingEqualizer
                    size="sm"
                    variant="overlay"
                    paused={!isPlaying || isLoading}
                  />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {/* UX Core #5 (Эффект контекста): показываем индикатор
                      "Волна" когда radio mode активен — единый контекст
                      "откуда играет трек". Без этого пользователь не
                      понимает что трек из волны а не из плейлиста/поиска. */}
                  {radioMode && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider flex-shrink-0"
                      style={{
                        color: "var(--mq-accent)",
                        backgroundColor: "color-mix(in srgb, var(--mq-accent) 14%, transparent)",
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: "var(--mq-accent)" }}
                      />
                      Волна
                    </span>
                  )}
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</p>
                </div>
                <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{currentTrack.artist}</p>
              </div>
              <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
            </button>

            {/* ═══ CENTER: Controls + progress ═══ */}
            <div className="flex flex-col items-center gap-1.5 flex-1 max-w-md">
              {/* Control buttons */}
              <div className="flex items-center gap-3 relative">
                <button onClick={toggleShuffle} className="w-7 h-7 rounded-full flex items-center justify-center" title="Перемешать" aria-label="Перемешать">
                  <Shuffle className="w-3.5 h-3.5" style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                </button>

                <button onClick={() => { prevTrack(); hapticSkip(); }} className="w-8 h-8 rounded-full flex items-center justify-center" title="Предыдущий" aria-label="Предыдущий трек">
                  <SkipBack className="w-4 h-4" style={{ color: "var(--mq-text)" }} fill="currentColor" />
                </button>

                <button
                  onClick={() => { togglePlay(); hapticPlay(); }}
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "var(--mq-accent)", boxShadow: "0 4px 16px color-mix(in srgb, var(--mq-accent) 35%, transparent)" }}
                  title="Play/Pause"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#fff" }} />
                    : isPlaying ? <Pause className="w-4 h-4" fill="#fff" style={{ color: "#fff" }} />
                    : <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />}
                </button>

                {/* SkipForward with hover-triggered Up Next preview.
                    150ms open delay prevents flicker when sweeping the mouse
                    across the controls. Close is instant so the tooltip
                    disappears immediately when the user moves away. */}
                <div
                  className="relative"
                  onMouseEnter={() => {
                    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                    hoverTimerRef.current = setTimeout(() => setShowUpNext(true), 150);
                  }}
                  onMouseLeave={() => {
                    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
                    setShowUpNext(false);
                  }}
                >
                  <button onClick={() => { nextTrack(); hapticSkip(); }} className="w-8 h-8 rounded-full flex items-center justify-center" title="Следующий" aria-label="Следующий трек">
                    <SkipForward className="w-4 h-4" style={{ color: "var(--mq-text)" }} fill="currentColor" />
                  </button>

                {/* Up Next preview — shown on hover over the SkipForward area.
                    Positioned ABOVE the player bar (player bar is at the bottom
                    of the viewport, so a top-full tooltip would be off-screen).
                    Not in shuffle (next is random) and only when there is a next track. */}
                <AnimatePresence>
                  {showUpNext && hasNextTrack && nextTrackPreview && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.96 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none"
                      style={{ width: 240 }}
                    >
                      <div
                        className="rounded-xl overflow-hidden flex items-center gap-2.5 p-2"
                        style={{
                          backgroundColor: "color-mix(in srgb, var(--mq-player-bg) 92%, #000)",
                          backdropFilter: "blur(24px) saturate(180%)",
                          WebkitBackdropFilter: "blur(24px) saturate(180%)",
                          border: "1px solid var(--mq-border-thin)",
                          boxShadow: "var(--mq-shadow-lg)",
                        }}
                      >
                        <div className="w-9 h-9 rounded-md overflow-hidden flex-shrink-0" style={{ backgroundColor: "var(--mq-card)" }}>
                          {nextTrackPreview.cover ? (
                            <img src={nextTrackPreview.cover} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--mq-accent)" }}>
                            Далее
                          </p>
                          <p className="text-xs font-semibold truncate" style={{ color: "var(--mq-text)" }}>
                            {nextTrackPreview.title}
                          </p>
                          <p className="text-[11px] truncate" style={{ color: "var(--mq-text-muted)" }}>
                            {nextTrackPreview.artist}
                          </p>
                        </div>
                        {nextTrackPreview.duration > 0 && (
                          <span
                            className="text-[10px] font-medium flex-shrink-0 self-center px-1.5 py-0.5 rounded-md"
                            style={{
                              color: "var(--mq-text-muted)",
                              backgroundColor: "color-mix(in srgb, var(--mq-text-muted) 10%, transparent)",
                            }}
                          >
                            {formatDuration(nextTrackPreview.duration)}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                </div>

                <button onClick={toggleRepeat} className="w-7 h-7 rounded-full flex items-center justify-center" title="Повтор" aria-label="Повтор">
                  {repeat === "one" ? <Repeat1 className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                    : <Repeat className="w-3.5 h-3.5" style={{ color: repeat === "all" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />}
                </button>
              </div>

              {/* Progress bar — premium redesign.
                  Memoized callbacks (handleProgressSeek/DragStart/DragEnd)
                  prevent ProgressBar's drag useEffect from re-running on
                  every render — inline arrows would create new function
                  identities each render, tearing down window listeners
                  mid-drag and losing mouseup events. */}
              <ProgressBar
                progress={progress}
                duration={duration}
                isPlaying={isPlaying}
                isDragging={isDragging}
                onSeek={handleProgressSeek}
                onDragStart={handleProgressDragStart}
                onDragEnd={handleProgressDragEnd}
                formatTime={formatDuration}
                variant="playerbar"
              />
            </div>

            {/* ═══ RIGHT: Like, Dislike, Radio, Volume, Queue ═══ */}
            <div className="flex items-center gap-1 justify-end min-w-0" style={{ width: "calc(100% / 3 - 16px)" }}>
              {/* Like — bounce animation on tap */}
              <motion.button
                whileTap={{ scale: 0.7 }}
                whileHover={{ scale: 1.1 }}
                onClick={handleLike}
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                title="Нравится"
              >
                <Heart
                  className="w-4 h-4"
                  style={{
                    color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)",
                    transition: "color 0.15s, transform 0.15s",
                    transform: isLiked ? "scale(1.1)" : "scale(1)",
                  }}
                  fill={isLiked ? "currentColor" : "none"}
                />
              </motion.button>

              {/* Dislike — bounce on tap */}
              <motion.button
                whileTap={{ scale: 0.7 }}
                whileHover={{ scale: 1.1 }}
                onClick={handleDislike}
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                title="Не нравится"
              >
                <ThumbsDown
                  className="w-4 h-4"
                  style={{
                    color: isDisliked ? "#ef4444" : "var(--mq-text-muted)",
                    transition: "color 0.15s",
                  }}
                  fill={isDisliked ? "currentColor" : "none"}
                />
              </motion.button>

              {/* Radio toggle button — starts Wave from current track on
                  first press, stops Wave on second press. The pulsing dot
                  indicates wave is active; tooltip explains toggle behavior. */}
              <motion.button
                whileTap={{ scale: 0.8 }}
                whileHover={{ scale: 1.1 }}
                onClick={handleStartRadio}
                disabled={wave.waveLoading}
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 relative"
                title={radioMode ? "Выключить волну" : "Радио от этого трека"}
              >
                {wave.waveLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--mq-accent)" }} />
                ) : (
                  /* Tip 3 (Visual rhyming from video): use Waves icon instead
                     of Radio — repeats the wave motif from Wave Card so the
                     whole app feels like it's from the same universe. */
                  <Waves
                    className="w-4 h-4"
                    style={{
                      color: radioMode ? "var(--mq-accent)" : "var(--mq-text-muted)",
                      transition: "color 0.15s",
                    }}
                  />
                )}
                {radioMode && !wave.waveLoading && (
                  <motion.span
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                    style={{ backgroundColor: "var(--mq-accent)", boxShadow: "0 0 6px var(--mq-accent)" }}
                    animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
              </motion.button>

              {/* Divider */}
              <div className="w-px h-5 mx-0.5 flex-shrink-0" style={{ backgroundColor: "var(--mq-border-thin)" }} />

              {/* Volume — compact custom slider */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={handleVolMute} aria-label="Mute" className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }}>
                  <VolIcon className="w-3.5 h-3.5" style={{ color: "var(--mq-text-muted)" }} />
                </button>
                <div
                  ref={volTrackRef}
                  onMouseDown={handleVolDown}
                  className="relative cursor-pointer rounded-full group/vol"
                  style={{ width: 56, height: 4, backgroundColor: "var(--mq-glass-bg-hover)" }}
                >
                  <div
                    ref={volFillRef}
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${volume}%`, backgroundColor: "var(--mq-accent)" }}
                  />
                  <div
                    ref={volThumbRef}
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full opacity-0 group-hover/vol:opacity-100 pointer-events-none"
                    style={{ left: `${volume}%`, backgroundColor: "#fff", boxShadow: "0 0 0 1.5px var(--mq-accent)", transition: "opacity 0.15s" }}
                  />
                </div>
              </div>

              {/* Divider */}
              <div className="w-px h-5 mx-0.5 flex-shrink-0" style={{ backgroundColor: "var(--mq-border-thin)" }} />

              {/* Equalizer */}
              <motion.button
                whileTap={{ scale: 0.85 }}
                whileHover={{ scale: 1.1 }}
                onClick={() => setEqOpen(true)}
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 relative"
                title="Эквалайзер"
                aria-label="Эквалайзер"
              >
                <Sliders
                  className="w-4 h-4"
                  style={{
                    color: eqEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)",
                    transition: "color 150ms",
                  }}
                />
                {eqEnabled && (
                  <motion.span
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                    style={{ backgroundColor: "var(--mq-accent)", boxShadow: "0 0 6px var(--mq-accent)" }}
                    animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
              </motion.button>

              {/* Queue */}
              <button onClick={() => setShowQueue(true)} className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" title="Очередь" aria-label="Очередь воспроизведения">
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
