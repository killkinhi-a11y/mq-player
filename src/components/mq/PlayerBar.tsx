"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward,
  Repeat, Repeat1, Shuffle, Music, Heart, ListMusic, User,
  Loader2, ThumbsDown, Volume2, VolumeX, Volume1, Sliders, Waves,
  Share2, MoreHorizontal,
} from "lucide-react";
import { getAudioElement } from "@/lib/audioEngine";
import { seekPlayback } from "@/lib/wasm-audio";
import { formatDuration } from "@/lib/musicApi";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWaveEngine } from "@/hooks/useWaveEngine";
import { hapticLike, hapticDislike, hapticSkip, hapticPlay } from "@/lib/haptics";
import { useToast } from "@/hooks/use-toast";
import { shareTrackUrl, openInAppTrackUrl } from "@/lib/share-urls";
import QueueView from "./QueueView";
import { ProgressBar } from "./ProgressBar";
import { TextSwap } from "./ui/TextSwap";
import { NowPlayingEqualizer } from "./NowPlayingEqualizer";
import MenuCore, { MenuHeader } from "./ui/MenuCore";

// ═════════════════════════════════════════════════════════════════════════
// PLAYER BAR — desktop floating glass capsule (v72 desktop redesign).
//
// Design — "a physical control surface hovering over the app":
// NOW PLAYING → LEFT: artwork + track identity (click → full player)
// PLAYBACK → CENTER: shuffle / prev / play / next / repeat + progress
// SECONDARY → RIGHT: like, wave, volume, queue, more (⋯)
// ADVANCED → More menu: EQ, dislike, share — NOT on the play level
//
// Playback contracts UNCHANGED: same store actions, same ProgressBar
// memoized callbacks, same RAF progress channel. Only the container
// geometry changed (docked full-width bar → floating capsule with 20px
// clearance from the viewport edge).
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
  const setSelectedArtist = useAppStore((s) => s.setSelectedArtist);
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
  // v68: More menu = unified MenuCore (portal, keyboard, Escape, flip).
  // PlayerBar sits at the bottom → menu opens ABOVE the trigger.
  const [moreMenu, setMoreMenu] = useState<{ x: number; y: number } | null>(null);

  // ── Progress bar callbacks (memoized to prevent ProgressBar's drag
  // useEffect from re-running on every render — inline arrow functions
  // create new identities each render, causing the effect to tear down
  // and re-add window listeners mid-drag, which loses mouseup events
  // and leaves the bar "stuck" in dragging state) ──
  const handleProgressSeek = useCallback((time: number) => {
    seekPlayback(time);
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

  // Sync fill/thumb from store volume when not dragging.
  // E2 fix: use transform: scaleX (GPU) instead of width (layout reflow).
  // Thumb uses translateX (GPU) instead of left (layout). Same pattern as
  // MobileDock progress bar.
  useEffect(() => {
    if (isVolDragging) return;
    if (volFillRef.current) volFillRef.current.style.transform = `scaleX(${volume / 100})`;
    // CRITICAL fix: translateX(-50%) centers thumb on the position,
    // not translateX(${volume}%) which shifts by thumb's own width.
    // left: ${volume}% positions the thumb, translateX(-50%) centers it.
    if (volThumbRef.current) {
      volThumbRef.current.style.left = `${volume}%`;
      volThumbRef.current.style.transform = `translateX(-50%) translateY(-50%)`;
    }
  }, [volume, isVolDragging]);

  const seekVolume = useCallback((clientX: number) => {
    if (!volTrackRef.current) return;
    const rect = volTrackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    if (volFillRef.current) volFillRef.current.style.transform = `scaleX(${pct / 100})`;
    if (volThumbRef.current) {
      volThumbRef.current.style.left = `${pct}%`;
      volThumbRef.current.style.transform = `translateX(-50%) translateY(-50%)`;
    }
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
    setMoreMenu(null);
  }, [currentTrack, toggleDislike, toast]);

  const handleShare = useCallback(() => {
    if (!currentTrack) return;
    setMoreMenu(null);
    // v78/v72: global QR share sheet, canonical URL (null = honest no-link
    // state) + the in-app deep-link hand-off for the QR loop.
    useAppStore.getState().openShareSheet({
      url: shareTrackUrl(currentTrack),
      title: currentTrack.title,
      subtitle: currentTrack.artist,
      cover: currentTrack.cover,
      openInAppUrl: openInAppTrackUrl(currentTrack) || undefined,
    });
  }, [currentTrack]);

  const openFullPlayer = useCallback(() => {
    if (currentTrack) setFullTrackViewOpen(true);
  }, [currentTrack, setFullTrackViewOpen]);

  // ── Derived ──
  const isLiked = currentTrack ? likedTrackIds.includes(currentTrack.id) : false;
  const isDisliked = currentTrack ? dislikedTrackIds.includes(currentTrack.id) : false;
  const isLoading = playbackState === "loading" || playbackState === "buffering";
  const VolIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  const anyAdvancedActive = eqEnabled || isDisliked;

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
  // track, second press stops wave entirely.
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
        className="fixed z-[55] left-0 right-0 flex justify-center pointer-events-none"
        style={{
          bottom: "var(--mq-player-float-m)",
          paddingLeft: "max(16px, var(--mq-shell-gap))",
          paddingRight: "max(16px, var(--mq-shell-gap))",
        }}
      >
        {/* Floating glass capsule — a physical object hovering over the
            interface (v72 desktop redesign): detached from the viewport
            edge, 24px radius, frosted surface, one soft shadow. The wrapper
            stays pointer-transparent; only the capsule is interactive. */}
        <div
          className="mq-player-capsule pointer-events-auto"
          style={{
            width: "min(920px, 100%)",
            backgroundColor: "var(--mq-glass-strong)",
            backdropFilter: "var(--mq-blur-md)",
            WebkitBackdropFilter: "var(--mq-blur-md)",
            border: "1px solid var(--mq-glass-border)",
            boxShadow: "var(--mq-shadow-glass), inset 0 1px 0 rgba(255,255,255,0.07)",
          }}
        >
          <div className="relative flex items-center gap-4 px-5 py-2.5">
            {/* ═══ LEFT: Cover + info (NOW PLAYING) ═══ */}
            <button
              onClick={openFullPlayer}
              aria-label="Открыть полный плеер"
              className="flex items-center gap-3 min-w-0 cursor-pointer text-left"
              style={{ width: "calc(100% / 3 - 16px)" }}
            >
              <div
                className="w-11 h-11 rounded-[var(--mq-r-art)] overflow-hidden flex-shrink-0 relative mq-art"
              >
                {currentTrack.cover ? (
                  <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" loading="eager" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--mq-surface-2)" }}>
                    <Music className="w-5 h-5" style={{ color: "var(--mq-text-on-accent, rgba(255,255,255,0.7))" }} />
                  </div>
                )}
                {/* Playing indicator — overlay only when playing.
                    When paused, cover art is fully visible (no overlay). */}
                {(isPlaying || isLoading) && (
                  <div
                    className="absolute inset-0 flex items-end justify-center pb-1"
                    style={{
                      backgroundColor: "var(--mq-overlay-scrim)",
                      opacity: isPlaying ? 1 : 0.5,
                      transition: "opacity 0.25s ease-out",
                    }}
                  >
                    <NowPlayingEqualizer
                      size="sm"
                      variant="overlay"
                      paused={!isPlaying || isLoading}
                    />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  {/* UX Core #5 (Эффект контекста): показываем индикатор
                      "Волна" когда radio mode активен — единый контекст
                      "откуда играет трек". Статичный бейдж, без анимации. */}
                  {radioMode && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded mq-t-meta-2 font-bold uppercase tracking-wider flex-shrink-0"
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
                  <TextSwap
                    text={currentTrack.title}
                    swapKey={currentTrack.id}
                    distance={4}
                    duration={0.24}
                    className="text-sm font-semibold truncate"
                    style={{ color: "var(--mq-text)" }}
                  />
                </div>
                <TextSwap
                  text={currentTrack.artist}
                  swapKey={currentTrack.id}
                  distance={3}
                  duration={0.22}
                  className="text-xs truncate"
                  style={{ color: "var(--mq-text-muted)" }}
                />
              </div>
            </button>

            {/* ═══ CENTER: Controls + progress (PRIMARY PLAYBACK) ═══ */}
            <div className="flex flex-col items-center gap-1 flex-1 max-w-md">
              {/* Control buttons — one clear hierarchy:
                  shuffle/repeat quiet (32px), prev/next (36px), play (44px accent) */}
              <div className="flex items-center gap-2 relative">
                <button onClick={toggleShuffle} className="w-8 h-8 rounded-full flex items-center justify-center mq-icon-btn" data-active={shuffle} title="Перемешать" aria-label="Перемешать" aria-pressed={shuffle}>
                  <Shuffle className="w-3.5 h-3.5" style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                </button>

                <button onClick={() => { prevTrack(); hapticSkip(); }} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-overlay-hover)]" title="Предыдущий" aria-label="Предыдущий трек">
                  <SkipBack className="w-4 h-4" style={{ color: "var(--mq-text)" }} fill="currentColor" />
                </button>

                <motion.button

                  onClick={() => { togglePlay(); hapticPlay(); }}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-[filter] duration-100 hover:brightness-110"
                  style={{ backgroundColor: "var(--mq-accent)" }}
                  title={isPlaying ? "Пауза" : "Воспроизвести"}
                  aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-text-on-accent, #fff)" }} />
                    : isPlaying ? <Pause className="w-4 h-4" fill="var(--mq-text-on-accent, #fff)" style={{ color: "var(--mq-text-on-accent, #fff)" }} />
                    : <Play className="w-4 h-4 ml-0.5" fill="var(--mq-text-on-accent, #fff)" style={{ color: "var(--mq-text-on-accent, #fff)" }} />}
                </motion.button>

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
                  <button onClick={() => { nextTrack(); hapticSkip(); }} className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-overlay-hover)]" title="Следующий" aria-label="Следующий трек">
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
                          backgroundColor: "var(--mq-surface-1)",
                          border: "1px solid var(--mq-edge-strong)",
                          boxShadow: "var(--mq-elev-dialog)",
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
                          <p className="mq-t-meta-2 font-semibold uppercase tracking-wider" style={{ color: "var(--mq-accent)" }}>
                            Далее
                          </p>
                          <p className="text-xs font-semibold truncate" style={{ color: "var(--mq-text)" }}>
                            {nextTrackPreview.title}
                          </p>
                          <p className="mq-t-meta-2 truncate" style={{ color: "var(--mq-text-muted)" }}>
                            {nextTrackPreview.artist}
                          </p>
                        </div>
                        {nextTrackPreview.duration > 0 && (
                          <span
                            className="mq-t-meta-2 font-medium flex-shrink-0 self-center px-1.5 py-0.5 rounded-md"
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

                <button onClick={toggleRepeat} className="w-8 h-8 rounded-full flex items-center justify-center mq-icon-btn" data-active={repeat !== "off"} title="Повтор" aria-label="Повтор" aria-pressed={repeat !== "off"}>
                  {repeat === "one" ? <Repeat1 className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                    : <Repeat className="w-3.5 h-3.5" style={{ color: repeat === "all" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />}
                </button>
              </div>

              {/* Progress bar — the single time-keeping surface.
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

            {/* ═══ RIGHT: Like, Wave, Volume, Queue, More (SECONDARY) ═══ */}
            <div className="flex items-center gap-0.5 justify-end min-w-0" style={{ width: "calc(100% / 3 - 16px)" }}>
              {/* Like */}
              <button
                onClick={() => handleLike()}
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors hover:bg-[var(--mq-overlay-hover)]"
                title="Нравится"
                aria-label={isLiked ? "Убрать из любимых" : "Добавить в любимые"}
                aria-pressed={isLiked}
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
              </button>

              {/* Wave toggle — static accent state when active (no pulse dot).
                  Tooltip explains toggle behavior. */}
              <button
                onClick={handleStartRadio}
                disabled={wave.waveLoading}
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 relative mq-icon-btn"
                data-active={radioMode}
                style={{ ["--mq-active-bg" as string]: "color-mix(in srgb, var(--mq-accent) 14%, transparent)" }}
                title={radioMode ? "Выключить волну" : "Радио от этого трека"}
                aria-label={radioMode ? "Выключить волну" : "Радио от этого трека"}
                aria-pressed={radioMode}
              >
                {wave.waveLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--mq-accent)" }} />
                ) : (
                  <Waves
                    className="w-4 h-4"
                    style={{
                      color: radioMode ? "var(--mq-accent)" : "var(--mq-text-muted)",
                      transition: "color 0.15s",
                    }}
                  />
                )}
              </button>

              {/* Volume — compact custom slider */}
              <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                <button onClick={handleVolMute} aria-label={volume === 0 ? "Включить звук" : "Выключить звук"} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors hover:bg-[var(--mq-overlay-hover)]" style={{ border: "none", cursor: "pointer", padding: 0 }}>
                  <VolIcon className="w-3.5 h-3.5" style={{ color: "var(--mq-text-muted)" }} />
                </button>
                <div
                  ref={volTrackRef}
                  onMouseDown={handleVolDown}
                  role="slider"
                  tabIndex={0}
                  aria-label="Громкость"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={volume}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); setVolume(Math.max(0, volume - 5)); }
                    else if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); setVolume(Math.min(100, volume + 5)); }
                    else if (e.key === "Home") { e.preventDefault(); setVolume(0); }
                    else if (e.key === "End") { e.preventDefault(); setVolume(100); }
                    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); setVolume(volume > 0 ? 0 : (prevVolumeRef.current > 0 ? prevVolumeRef.current : 70)); }
                  }}
                  className="mq-pb-vol relative cursor-pointer rounded-full group/vol focus-visible:outline-2 focus-visible:outline-[var(--mq-accent)]"
                  style={{
                    width: 88,
                    height: 6,
                    backgroundColor: "var(--mq-glass-bg)",
                    boxShadow: "var(--mq-shadow-inner-glow)",
                  }}
                >
                  <div
                    ref={volFillRef}
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: "100%",
                      transform: `scaleX(${volume / 100})`,
                      transformOrigin: "left center",
                      backgroundColor: "var(--mq-accent)",
                    }}
                  />
                  {/* MQ fader cap (v71) — same DNA as EQ/settings sliders.
                      Hidden at rest, reveals on hover/focus (group/vol). */}
                  <div
                    ref={volThumbRef}
                    className="mq-pb-vol-cap absolute left-0 top-1/2 rounded-[5px] pointer-events-none"
                    style={{
                      left: `${volume}%`,
                      width: 16,
                      height: 16,
                      transform: "translate(-50%, -50%)",
                      backgroundColor: "var(--mq-card)",
                      backgroundImage: "linear-gradient(var(--mq-text-muted), var(--mq-text-muted))",
                      backgroundSize: "8px 2px",
                      backgroundPosition: "center",
                      backgroundRepeat: "no-repeat",
                      border: "2px solid color-mix(in srgb, var(--mq-text-muted) 55%, var(--mq-card))",
                      boxShadow: "var(--mq-shadow-sm)",
                    }}
                  />
                </div>
              </div>

              {/* Queue */}
              <button onClick={() => setShowQueue(true)} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 relative transition-colors hover:bg-[var(--mq-overlay-hover)]" title="Очередь" aria-label="Очередь воспроизведения">
                <ListMusic className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
              </button>

              {/* More — advanced controls live here, not on the play level:
                  EQ, dislike, share, artist. Static accent dot when on.
                  v68: unified MenuCore, opens ABOVE (bar is at the bottom). */}
              <div className="relative flex-shrink-0">
                <button
                  onClick={(e) => {
                    if (moreMenu) {
                      setMoreMenu(null);
                    } else {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setMoreMenu({ x: Math.max(8, rect.right - 250), y: rect.top - 6 });
                    }
                  }}
                  className="w-9 h-9 rounded-full flex items-center justify-center relative mq-icon-btn"
                  data-active={!!moreMenu}
                  style={{ ["--mq-active-bg" as string]: "var(--mq-overlay-hover)" }}
                  title="Дополнительно"
                  aria-label="Дополнительные действия"
                  aria-haspopup="menu"
                  aria-expanded={!!moreMenu}
                >
                  <MoreHorizontal className="w-4 h-4" style={{ color: anyAdvancedActive ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                  {anyAdvancedActive && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--mq-accent)" }} />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
      {/* v68: unified More menu (portal) — opens above the bar */}
      {moreMenu && currentTrack && (
        <MenuCore
          anchor={moreMenu}
          onClose={() => setMoreMenu(null)}
          side="above"
          width={250}
          ariaLabel="Действия с треком"
          header={
            <MenuHeader
              cover={currentTrack.cover}
              title={currentTrack.title}
              subtitle={currentTrack.artist}
              fallbackIcon={Music}
            />
          }
          elements={[
            {
              type: "item",
              id: "eq",
              icon: Sliders,
              label: "Эквалайзер",
              active: eqEnabled,
              hint: eqEnabled ? "ВКЛ" : undefined,
              onSelect: () => {
                setMoreMenu(null);
                setEqOpen(true);
              },
            },
            {
              type: "item",
              id: "dislike",
              icon: ThumbsDown,
              label: isDisliked ? "Убрать дизлайк" : "Не нравится",
              active: isDisliked,
              onSelect: handleDislike,
            },
            {
              type: "item",
              id: "share",
              icon: Share2,
              label: "Поделиться",
              onSelect: handleShare,
            },
            ...(currentTrack.artist
              ? [
                  {
                    type: "item" as const,
                    id: "artist",
                    icon: User,
                    label: "К артисту",
                    onSelect: () => {
                      setSelectedArtist({ name: currentTrack.artist, avatar: currentTrack.cover || undefined });
                      setMoreMenu(null);
                    },
                  },
                ]
              : []),
          ]}
        />
      )}
      <QueueView isOpen={showQueue} onClose={() => setShowQueue(false)} />
    </>
  );
}
