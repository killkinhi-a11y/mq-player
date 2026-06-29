"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, ChevronDown, Heart,
  Shuffle, Repeat, Repeat1, Volume2, VolumeX,
  Music, ListMusic, Share2, Loader2, Clock, Mic2,
  ThumbsDown, AirVent, Gauge, MoreHorizontal, Timer, ChevronLeft,
} from "lucide-react";
import { getAudioElement } from "@/lib/audioEngine";
import { formatDuration } from "@/lib/musicApi";
import type { Track } from "@/lib/musicApi";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";

// ═════════════════════════════════════════════════════════════════════════
// FULL TRACK VIEW — full-screen player
// ═════════════════════════════════════════════════════════════════════════

export default function FullTrackView() {
  const isOpen = useAppStore((s) => s.isFullTrackViewOpen);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const progress = useAppStore((s) => s.progress);
  const duration = useAppStore((s) => s.duration);
  const volume = useAppStore((s) => s.volume);
  const shuffle = useAppStore((s) => s.shuffle);
  const repeat = useAppStore((s) => s.repeat);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const dislikedTrackIds = useAppStore((s) => s.dislikedTrackIds);
  const queue = useAppStore((s) => s.queue);
  const queueIndex = useAppStore((s) => s.queueIndex);
  const playbackState = useAppStore((s) => s.playbackState);
  const radioMode = useAppStore((s) => s.radioMode);
  const spatialAudioEnabled = useAppStore((s) => s.spatialAudioEnabled);
  const setSpatialAudioEnabled = useAppStore((s) => s.setSpatialAudioEnabled);
  const playbackRate = useAppStore((s) => s.playbackRate);
  const setPlaybackRate = useAppStore((s) => s.setPlaybackRate);
  const sleepTimerActive = useAppStore((s) => s.sleepTimerActive);
  const startSleepTimer = useAppStore((s) => s.startSleepTimer);
  const stopSleepTimer = useAppStore((s) => s.stopSleepTimer);

  const setOpen = useAppStore((s) => s.setFullTrackViewOpen);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const nextTrack = useAppStore((s) => s.nextTrack);
  const prevTrack = useAppStore((s) => s.prevTrack);
  const setVolume = useAppStore((s) => s.setVolume);
  const setProgress = useAppStore((s) => s.setProgress);
  const toggleShuffle = useAppStore((s) => s.toggleShuffle);
  const toggleRepeat = useAppStore((s) => s.toggleRepeat);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const toggleDislike = useAppStore((s) => s.toggleDislike);
  const setView = useAppStore((s) => s.setView);
  const setSelectedArtist = useAppStore((s) => s.setSelectedArtist);

  const isMobile = useIsMobile();
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [showQueue, setShowQueue] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const [lastTapTime, setLastTapTime] = useState(0);
  const [lastTapSide, setLastTapSide] = useState<"left" | "right" | null>(null);
  const [seekFeedback, setSeekFeedback] = useState<{ side: "left" | "right"; amount: number } | null>(null);

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

  const getHoverTime = useCallback((clientX: number): number => {
    if (!progressBarRef.current || !duration) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    return (pct / 100) * duration;
  }, [duration]);

  const handleProgressMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    seekTo(e.clientX);
  }, [seekTo]);

  const handleProgressMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) return;
    setHoveredTime(getHoverTime(e.clientX));
  }, [isDragging, getHoverTime]);

  const handleProgressTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    seekTo(e.touches[0].clientX);
  }, [seekTo]);

  useEffect(() => {
    if (!isDragging) return;
    const onMouseMove = (e: MouseEvent) => seekTo(e.clientX);
    const onMouseUp = () => setIsDragging(false);
    const onTouchMove = (e: TouchEvent) => seekTo(e.touches[0].clientX);
    const onTouchEnd = () => setIsDragging(false);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDragging, seekTo]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(e.target.value));
  }, [setVolume]);

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
      navigator.clipboard.writeText(url).then(() => toast({ title: "Ссылка скопирована" }));
    }
  }, [currentTrack, toast]);

  const handleArtistClick = useCallback(() => {
    if (currentTrack?.artist) {
      setSelectedArtist({ name: currentTrack.artist });
      setOpen(false);
    }
  }, [currentTrack, setSelectedArtist, setOpen]);

  // ── Double-tap to seek (YouTube-style) ──
  const handleCoverAreaTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const isLeft = clientX < rect.left + rect.width / 2;
    const now = Date.now();

    const tapSide = isLeft ? "left" : "right";
    if (now - lastTapTime < 300 && lastTapSide === tapSide) {
      // Double tap — seek ±10s
      const seekAmount = isLeft ? -10 : 10;
      const audio = getAudioElement();
      if (audio && audio.src) {
        audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seekAmount));
        setProgress(Math.max(0, Math.min(duration, progress + seekAmount)));
      }
      // Show feedback
      setSeekFeedback({ side: isLeft ? "left" : "right", amount: seekAmount });
      setTimeout(() => setSeekFeedback(null), 600);
    }
    setLastTapTime(now);
    setLastTapSide(isLeft ? "left" : "right");
  }, [lastTapTime, lastTapSide, duration, progress, setProgress]);

  // ── Swipe to change track (mobile) ──
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const handleCoverTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);
  const handleCoverTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx > 0) prevTrack();
      else nextTrack();
    }
  }, [prevTrack, nextTrack]);

  // ── Playback speed ──
  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackRate(speed);
    const audio = getAudioElement();
    if (audio) audio.playbackRate = speed;
    setShowSpeedMenu(false);
  }, [setPlaybackRate]);

  // ── Sleep timer ──
  const sleepOptions = [5, 10, 15, 30, 45, 60];
  const handleSleepSet = useCallback((minutes: number) => {
    startSleepTimer(minutes);
    setShowSleepMenu(false);
    toast({ title: `Таймер сна: ${minutes} мин` });
  }, [startSleepTimer, toast]);

  // ── Derived ──
  const isLiked = currentTrack ? likedTrackIds.includes(currentTrack.id) : false;
  const isDisliked = currentTrack ? dislikedTrackIds.includes(currentTrack.id) : false;
  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;
  const hoveredPct = hoveredTime !== null && duration > 0 ? (hoveredTime / duration) * 100 : 0;
  const isLoading = playbackState === "loading" || playbackState === "buffering";
  const VolumeIcon = volume === 0 ? VolumeX : Volume2;

  // ── Upcoming tracks ──
  const upcoming = useMemo(() => {
    if (queue.length === 0) return [];
    return queue.slice(queueIndex + 1, queueIndex + 6);
  }, [queue, queueIndex]);

  // ── Lyrics ──
  useEffect(() => {
    if (!showLyrics || !currentTrack) return;
    setLyrics(null);
    setLyricsLoading(true);
    const controller = new AbortController();
    fetch(`/api/music/lyrics?artist=${encodeURIComponent(currentTrack.artist)}&title=${encodeURIComponent(currentTrack.title)}`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => {
        if (data.plainText) setLyrics(data.plainText);
        else if (Array.isArray(data.lyrics) && data.lyrics.length > 0) setLyrics(data.lyrics.map((l: any) => l.text).filter(Boolean).join("\n"));
        else setLyrics(null);
      })
      .catch(() => setLyrics(null))
      .finally(() => setLyricsLoading(false));
    return () => controller.abort();
  }, [showLyrics, currentTrack]);

  return (
    <AnimatePresence>
      {isOpen && currentTrack && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed inset-0 z-[100]"
          style={{
            background: currentTrack.cover
              ? `linear-gradient(180deg, color-mix(in srgb, var(--mq-accent) 15%, var(--mq-bg)) 0%, var(--mq-bg) 50%)`
              : "var(--mq-bg)",
          }}
        >
          {/* Blurred cover background */}
          {currentTrack.cover && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" style={{ filter: "blur(80px) saturate(180%)", opacity: 0.25, transform: "scale(1.3)" }} />
              <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 0%, var(--mq-bg) 60%)" }} />
            </div>
          )}

          <div className="relative z-10 h-full flex flex-col">
            {/* ── Header ── */}
            <div className="flex items-center justify-between p-4 sm:p-6">
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => setOpen(false)} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                <ChevronDown className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
              </motion.button>
              <div className="text-center">
                <p className="mq-text-eyebrow text-[10px]">{radioMode ? "Волна" : "Играет"}</p>
                <p className="text-xs font-medium truncate max-w-[200px] sm:max-w-xs" style={{ color: "var(--mq-text-muted)" }}>
                  {currentTrack.album || currentTrack.artist}
                </p>
              </div>
              <motion.button whileTap={{ scale: 0.9 }} onClick={handleShare} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                <Share2 className="w-4 h-4" style={{ color: "var(--mq-text)" }} />
              </motion.button>
            </div>

            {/* ── Main content ── */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 pb-6 overflow-y-auto">
              <div className={`w-full max-w-5xl flex ${isMobile ? "flex-col items-center" : "flex-row items-center gap-12"}`}>
                {/* Cover */}
                <motion.div
                  key={currentTrack.id}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="relative mb-6 sm:mb-0 flex-shrink-0"
                  style={{ width: isMobile ? "min(75vw, 320px)" : "min(35vw, 380px)", aspectRatio: "1 / 1" }}
                  onClick={handleCoverAreaTap}
                  onTouchStart={(e) => { handleCoverTouchStart(e); }}
                  onTouchEnd={handleCoverTouchEnd}
                >
                  <div className="w-full h-full rounded-3xl overflow-hidden" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>
                    {currentTrack.cover ? (
                      <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}>
                        <Music className="w-16 h-16" style={{ color: "rgba(255,255,255,0.5)" }} />
                      </div>
                    )}
                  </div>
                  {/* Glow */}
                  <div className="absolute -inset-4 rounded-3xl pointer-events-none -z-10"
                    style={{ background: currentTrack.cover ? `url(${currentTrack.cover}) center/cover` : "var(--mq-accent)", filter: "blur(40px)", opacity: 0.3 }} />
                  {/* Double-tap seek feedback */}
                  <AnimatePresence>
                    {seekFeedback && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="absolute top-1/2 -translate-y-1/2 px-4 py-2 rounded-2xl pointer-events-none"
                        style={{
                          [seekFeedback.side]: "20%",
                          backgroundColor: "rgba(0,0,0,0.7)",
                          backdropFilter: "blur(10px)",
                          color: "#fff",
                          fontSize: 14,
                          fontWeight: 600,
                        } as React.CSSProperties}
                      >
                        {seekFeedback.amount > 0 ? `+${seekFeedback.amount}s` : `${seekFeedback.amount}s`}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {/* Hint text for double-tap */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] pointer-events-none" style={{ color: "rgba(255,255,255,0.3)" }}>
                    ← двойной тап →
                  </div>
                </motion.div>

                {/* Right side */}
                <div className={`flex-1 ${isMobile ? "w-full" : "min-w-0"} flex flex-col ${isMobile ? "items-center" : "items-start"}`}>
                  {/* Track info */}
                  <div className={`w-full ${isMobile ? "text-center" : "text-left"} mb-4`}>
                    <h1 className="mq-text-display text-xl sm:text-2xl lg:text-4xl mb-1.5" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</h1>
                    <button onClick={handleArtistClick} className={`text-sm sm:text-base lg:text-lg hover:underline ${isMobile ? "" : "text-left"}`} style={{ color: "var(--mq-text-muted)" }}>{currentTrack.artist}</button>
                    <div className={`flex items-center gap-3 mt-2 text-[11px] ${isMobile ? "justify-center" : ""}`} style={{ color: "var(--mq-text-muted)" }}>
                      {duration > 0 && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(duration)}</span>}
                      {currentTrack.genre && <span>·</span>}
                      {currentTrack.genre && <span>{currentTrack.genre}</span>}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className={`flex items-center gap-2 mb-6 ${isMobile ? "" : "justify-start"}`}>
                    <motion.button whileTap={{ scale: 0.9 }} onClick={handleLike} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: isLiked ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }}>
                      <Heart className="w-4 h-4" style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }} fill={isLiked ? "currentColor" : "none"} />
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.9 }} onClick={handleDislike} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: isDisliked ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)" }}>
                      <ThumbsDown className="w-4 h-4" style={{ color: isDisliked ? "#ef4444" : "var(--mq-text-muted)" }} fill={isDisliked ? "currentColor" : "none"} />
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setShowQueue(!showQueue); setShowLyrics(false); }} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: showQueue ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }}>
                      <ListMusic className="w-4 h-4" style={{ color: showQueue ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setShowLyrics(!showLyrics); setShowQueue(false); }} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: showLyrics ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }}>
                      <Mic2 className="w-4 h-4" style={{ color: showLyrics ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => setSpatialAudioEnabled(!spatialAudioEnabled)} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: spatialAudioEnabled ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }} title="Пространственное аудио">
                      <AirVent className="w-4 h-4" style={{ color: spatialAudioEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                    </motion.button>
                    {/* Playback speed */}
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setShowSpeedMenu(!showSpeedMenu); setShowSleepMenu(false); }} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: playbackRate !== 1 ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }} title="Скорость">
                      <span className="text-[10px] font-bold" style={{ color: playbackRate !== 1 ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>{playbackRate}x</span>
                    </motion.button>
                    {/* Sleep timer */}
                    <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setShowSleepMenu(!showSleepMenu); setShowSpeedMenu(false); }} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: sleepTimerActive ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }} title="Таймер сна">
                      <Timer className="w-4 h-4" style={{ color: sleepTimerActive ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                    </motion.button>
                  </div>

                  {/* Speed menu */}
                  <AnimatePresence>
                    {showSpeedMenu && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="w-full mb-4 overflow-hidden">
                        <div className="flex items-center gap-2 flex-wrap">
                          {speedOptions.map(speed => (
                            <button key={speed} onClick={() => handleSpeedChange(speed)} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ backgroundColor: playbackRate === speed ? "var(--mq-accent)" : "var(--mq-card)", color: playbackRate === speed ? "#fff" : "var(--mq-text-muted)" }}>
                              {speed}x
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Sleep timer menu */}
                  <AnimatePresence>
                    {showSleepMenu && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="w-full mb-4 overflow-hidden">
                        <div className="flex items-center gap-2 flex-wrap">
                          {sleepOptions.map(min => (
                            <button key={min} onClick={() => handleSleepSet(min)} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ backgroundColor: "var(--mq-card)", color: "var(--mq-text-muted)" }}>
                              {min} мин
                            </button>
                          ))}
                          {sleepTimerActive && (
                            <button onClick={() => { stopSleepTimer(); setShowSleepMenu(false); toast({ title: "Таймер отменён" }); }} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                              Отменить
                            </button>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Queue panel */}
                  <AnimatePresence>
                    {showQueue && upcoming.length > 0 && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="w-full mb-6 overflow-hidden">
                        <p className="mq-text-eyebrow text-[10px] mb-2">Далее в очереди</p>
                        <div className="space-y-1">
                          {upcoming.map((track, i) => (
                            <button key={track.id + "_" + i} onClick={() => { for (let j = 0; j <= i; j++) nextTrack(); setShowQueue(false); }} className="w-full flex items-center gap-3 p-2 rounded-xl text-left hover:bg-white/[0.04] transition-colors">
                              <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                                {track.cover ? <img src={track.cover} alt="" className="w-full h-full object-cover" />
                                  : <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}><Music className="w-4 h-4" style={{ color: "rgba(255,255,255,0.5)" }} /></div>}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>{track.title}</p>
                                <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{track.artist}</p>
                              </div>
                              <span className="text-[10px] font-mono" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(track.duration)}</span>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Lyrics panel */}
                  <AnimatePresence>
                    {showLyrics && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="w-full mb-6 overflow-hidden">
                        <p className="mq-text-eyebrow text-[10px] mb-2">Текст песни</p>
                        {lyricsLoading ? (
                          <div className="flex items-center gap-2 py-4"><Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-accent)" }} /><span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Поиск текста...</span></div>
                        ) : lyrics ? (
                          <div className="text-sm leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto p-3 rounded-xl" style={{ color: "var(--mq-text-muted)", backgroundColor: "rgba(255,255,255,0.03)" }}>{lyrics}</div>
                        ) : (
                          <p className="text-xs py-4" style={{ color: "var(--mq-text-muted)" }}>Текст не найден для этого трека</p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Progress bar with hover preview */}
                  <div className="w-full mb-6">
                    <div
                      ref={progressBarRef}
                      className="h-1.5 rounded-full cursor-pointer relative group mb-2"
                      onMouseDown={handleProgressMouseDown}
                      onTouchStart={handleProgressTouchStart}
                      onMouseEnter={() => setIsHovering(true)}
                      onMouseLeave={() => { setIsHovering(false); setHoveredTime(null); }}
                      onMouseMove={handleProgressMouseMove}
                    >
                      <div className="absolute inset-0 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
                      {isHovering && hoveredPct > progressPct && (
                        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${hoveredPct}%`, backgroundColor: "rgba(255,255,255,0.12)" }} />
                      )}
                      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${progressPct}%`, backgroundColor: "var(--mq-accent)", transition: isDragging ? "none" : "width 0.1s linear" }} />
                      {isHovering && (
                        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full pointer-events-none"
                          style={{ left: `${isDragging ? progressPct : hoveredPct}%`, backgroundColor: "var(--mq-accent)", boxShadow: "0 0 12px color-mix(in srgb, var(--mq-accent) 50%, transparent)" }} />
                      )}
                      {isHovering && hoveredTime !== null && !isDragging && (
                        <div className="absolute -top-7 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-mono pointer-events-none whitespace-nowrap"
                          style={{ left: `${hoveredPct}%`, backgroundColor: "var(--mq-card)", color: "var(--mq-text)", border: "1px solid var(--mq-border-thin)" }}>
                          {formatDuration(hoveredTime)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono tabular-nums" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(progress)}</span>
                      <span className="text-[11px] font-mono tabular-nums" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(duration)}</span>
                    </div>
                  </div>

                  {/* Main controls */}
                  <div className={`flex items-center gap-4 sm:gap-6 mb-6 ${isMobile ? "" : "justify-start"}`}>
                    <motion.button whileTap={{ scale: 0.9 }} onClick={toggleShuffle} className="w-10 h-10 rounded-full flex items-center justify-center">
                      <Shuffle className="w-5 h-5" style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.9 }} onClick={prevTrack} className="w-12 h-12 rounded-full flex items-center justify-center">
                      <SkipBack className="w-6 h-6" style={{ color: "var(--mq-text)" }} fill="currentColor" />
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.05 }} onClick={togglePlay}
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: "var(--mq-accent)", boxShadow: "0 8px 32px color-mix(in srgb, var(--mq-accent) 40%, transparent)" }}>
                      {isLoading ? <Loader2 className="w-7 h-7 sm:w-8 sm:h-8 animate-spin" style={{ color: "#fff" }} />
                        : isPlaying ? <Pause className="w-7 h-7 sm:w-8 sm:h-8" fill="#fff" style={{ color: "#fff" }} />
                        : <Play className="w-7 h-7 sm:w-8 sm:h-8 ml-1" fill="#fff" style={{ color: "#fff" }} />}
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.9 }} onClick={nextTrack} className="w-12 h-12 rounded-full flex items-center justify-center">
                      <SkipForward className="w-6 h-6" style={{ color: "var(--mq-text)" }} fill="currentColor" />
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.9 }} onClick={toggleRepeat} className="w-10 h-10 rounded-full flex items-center justify-center">
                      {repeat === "one" ? <Repeat1 className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
                        : <Repeat className="w-5 h-5" style={{ color: repeat === "all" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />}
                    </motion.button>
                  </div>

                  {/* Volume (desktop only) */}
                  {!isMobile && (
                    <div className="flex items-center gap-2 w-full max-w-xs">
                      <Volume2 className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
                      <input type="range" min={0} max={100} value={volume} onChange={handleVolumeChange} className="flex-1 h-1.5 rounded-full cursor-pointer" style={{ accentColor: "var(--mq-accent)" }} />
                      <VolumeIcon className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
