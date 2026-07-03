"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, ChevronDown, Heart,
  Shuffle, Repeat, Repeat1, Volume2, VolumeX, Volume1,
  Music, ListMusic, Share2, Loader2, Clock, Mic2,
  ThumbsDown, AirVent, Gauge, Timer,
  History, Sparkles, X, ListPlus, Plus,
} from "lucide-react";
import { getAudioElement } from "@/lib/audioEngine";
import { formatDuration } from "@/lib/musicApi";
import type { Track } from "@/lib/musicApi";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import VolumeSlider from "@/components/ui/volume-slider";
import { fetchLyrics } from "@/lib/lyrics-client";
import { LyricsView, type LyricLine } from "./LyricsView";

// ═════════════════════════════════════════════════════════════════════════
// FULL TRACK VIEW — full-screen premium player
// ═════════════════════════════════════════════════════════════════════════

interface SyncedLyricLine {
  time: number;
  text: string;
}

// ── Synced lyrics renderer ──────────────────────────────────────────────
function SyncedLyrics({
  lines,
  currentTime,
  onSeek,
}: {
  lines: SyncedLyricLine[];
  currentTime: number;
  onSeek: (t: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const activeIdx = useMemo(() => {
    if (lines.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= currentTime) idx = i;
      else break;
    }
    return idx;
  }, [lines, currentTime]);

  useEffect(() => {
    const container = containerRef.current;
    const lineEl = lineRefs.current[activeIdx];
    if (!container || !lineEl) return;
    const cTop = container.scrollTop;
    const cBot = cTop + container.clientHeight;
    const lTop = lineEl.offsetTop;
    const lBot = lTop + lineEl.offsetHeight;
    if (lTop < cTop + 40 || lBot > cBot - 40) {
      container.scrollTo({
        top: lTop - container.clientHeight / 2 + lineEl.offsetHeight / 2,
        behavior: "smooth",
      });
    }
  }, [activeIdx]);

  if (lines.length === 0) {
    return (
      <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>
        Текст не найден для этого трека
      </p>
    );
  }

  return (
    <div
      ref={containerRef}
      className="text-base leading-relaxed max-h-[280px] overflow-y-auto px-2 py-2 space-y-1 scroll-smooth"
      style={{
        scrollbarWidth: "thin",
        maskImage: "linear-gradient(180deg, transparent 0%, #000 12%, #000 88%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(180deg, transparent 0%, #000 12%, #000 88%, transparent 100%)",
      }}
    >
      {lines.map((line, i) => {
        const isActive = i === activeIdx;
        const isPast = i < activeIdx;
        return (
          <button
            key={i}
            ref={(el) => { lineRefs.current[i] = el; }}
            onClick={() => onSeek(line.time)}
            className="block w-full text-left px-2 py-1.5 rounded-lg transition-all duration-300 cursor-pointer"
            style={{
              color: isActive ? "var(--mq-text)" : isPast ? "color-mix(in srgb, var(--mq-text-muted) 50%, transparent)" : "var(--mq-text-muted)",
              fontWeight: isActive ? 600 : 400,
              fontSize: isActive ? "1.05rem" : "0.95rem",
              transform: isActive ? "scale(1.0)" : "scale(0.98)",
              opacity: isActive ? 1 : isPast ? 0.55 : 0.7,
              background: isActive ? "color-mix(in srgb, var(--mq-accent) 8%, transparent)" : "transparent",
            }}
          >
            {line.text || "♪"}
          </button>
        );
      })}
    </div>
  );
}

// ── Heart particle burst on like ─────────────────────────────────────────
function HeartBurst({ trigger }: { trigger: number }) {
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; r: number; delay: number }[]>([]);
  useEffect(() => {
    if (trigger === 0) return;
    const count = 8;
    const newParts = Array.from({ length: count }, (_, i) => ({
      id: trigger * 100 + i,
      x: (Math.random() - 0.5) * 80,
      y: -30 - Math.random() * 60,
      r: (Math.random() - 0.5) * 60,
      delay: Math.random() * 0.1,
    }));
    setParticles(newParts);
    const t = setTimeout(() => setParticles([]), 1000);
    return () => clearTimeout(t);
  }, [trigger]);

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <AnimatePresence>
        {particles.map(p => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0], x: p.x, y: p.y, scale: [0, 1, 0.4], rotate: p.r }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, delay: p.delay, ease: "easeOut" }}
            className="absolute"
          >
            <Heart className="w-4 h-4" style={{ color: "var(--mq-accent)", fill: "var(--mq-accent)" }} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
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
  const sleepTimerRemaining = useAppStore((s) => s.sleepTimerRemaining);
  const startSleepTimer = useAppStore((s) => s.startSleepTimer);
  const stopSleepTimer = useAppStore((s) => s.stopSleepTimer);
  const history = useAppStore((s) => s.history);

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
  const setSelectedArtist = useAppStore((s) => s.setSelectedArtist);
  const playTrack = useAppStore((s) => s.playTrack);
  const playlists = useAppStore((s) => s.playlists);
  const addToPlaylist = useAppStore((s) => s.addToPlaylist);
  const createPlaylist = useAppStore((s) => s.createPlaylist);

  const isMobile = useIsMobile();
  const progressBarRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [activePanel, setActivePanel] = useState<"queue" | "lyrics" | "history" | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState<string>("");
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [showVolumePopup, setShowVolumePopup] = useState(false);
  const [lastTapTime, setLastTapTime] = useState(0);
  const [lastTapSide, setLastTapSide] = useState<"left" | "right" | null>(null);
  const [seekFeedback, setSeekFeedback] = useState<{ side: "left" | "right"; amount: number } | null>(null);
  const [heartBurstTrigger, setHeartBurstTrigger] = useState(0);
  // Cover parallax tilt — ref-based, NO re-render on mousemove
  const tiltRef = useRef<HTMLDivElement>(null);
  // Pull-down-to-close state (mobile)
  const [pullDownY, setPullDownY] = useState(0);

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

  const seekToTime = useCallback((time: number) => {
    const audio = getAudioElement();
    if (audio && audio.src) audio.currentTime = time;
    setProgress(time);
  }, [setProgress]);

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

  const handleProgressTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
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

  // ── Cover parallax tilt (desktop hover) — ref-based, NO React re-render ──
  const handleCoverMouseMove = useCallback((e: React.MouseEvent) => {
    if (!coverRef.current || isMobile || !tiltRef.current) return;
    const rect = coverRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    tiltRef.current.style.transform = `rotateX(${-dy * 8}deg) rotateY(${dx * 8}deg)`;
  }, [isMobile]);

  const handleCoverMouseLeave = useCallback(() => {
    if (tiltRef.current) tiltRef.current.style.transform = "rotateX(0) rotateY(0)";
  }, []);

  // ── Volume wheel (anywhere in FullTrackView) ──────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    const target = e.target as HTMLElement;
    if (target && target.closest('[data-scrollable="true"]')) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -4 : 4;
    // Read from store directly — avoids stale closure + listener re-subscription
    const v = useAppStore.getState().volume;
    useAppStore.getState().setVolume(Math.max(0, Math.min(100, v + delta)));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [isOpen, handleWheel]);

  // ── Pull-down to close (mobile) ───────────────────────────────────────
  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    // Swipe down → close
    if (info.offset.y > 120 && Math.abs(info.offset.y) > Math.abs(info.offset.x) * 1.5) {
      setOpen(false);
    }
    setPullDownY(0);
  }, [setOpen]);

  const handleDrag = useCallback((_: any, info: PanInfo) => {
    // Only track downward drag
    if (info.offset.y > 0) {
      setPullDownY(Math.min(200, info.offset.y));
    } else {
      setPullDownY(0);
    }
  }, []);

  // ── Volume ──────────────────────────────────────────────────────────────
  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
  }, [setVolume]);

  const toggleMute = useCallback(() => {
    setVolume(volume > 0 ? 0 : 70);
  }, [volume, setVolume]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleLike = useCallback(() => {
    if (currentTrack) {
      toggleLike(currentTrack.id, currentTrack);
      const isLikedNow = likedTrackIds.includes(currentTrack.id);
      if (!isLikedNow) setHeartBurstTrigger(t => t + 1);
    }
  }, [currentTrack, toggleLike, likedTrackIds]);

  const handleDislike = useCallback(() => {
    if (currentTrack) {
      toggleDislike(currentTrack.id, currentTrack);
      // toggleDislike already calls nextTrack() internally if it's the current track
    }
  }, [currentTrack, toggleDislike]);

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

  // ── Double-tap to seek (YouTube-style) ──────────────────────────────────
  const handleCoverAreaTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const isLeft = clientX < rect.left + rect.width / 2;
    const now = Date.now();
    const tapSide = isLeft ? "left" : "right";
    if (now - lastTapTime < 300 && lastTapSide === tapSide) {
      const seekAmount = isLeft ? -10 : 10;
      const audio = getAudioElement();
      if (audio && audio.src) {
        audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + seekAmount));
        setProgress(Math.max(0, Math.min(duration, progress + seekAmount)));
      }
      setSeekFeedback({ side: isLeft ? "left" : "right", amount: seekAmount });
      setTimeout(() => setSeekFeedback(null), 600);
    }
    setLastTapTime(now);
    setLastTapSide(isLeft ? "left" : "right");
  }, [lastTapTime, lastTapSide, duration, progress, setProgress]);

  // ── Swipe to change track (mobile) ──────────────────────────────────────
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

  // ── Playback speed ──────────────────────────────────────────────────────
  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackRate(speed);
    const audio = getAudioElement();
    if (audio) audio.playbackRate = speed;
    setShowSpeedMenu(false);
  }, [setPlaybackRate]);

  // ── Sleep timer ─────────────────────────────────────────────────────────
  const sleepOptions = [5, 10, 15, 30, 45, 60];
  const handleSleepSet = useCallback((minutes: number) => {
    startSleepTimer(minutes);
    setShowSleepMenu(false);
    toast({ title: `Таймер сна: ${minutes} мин` });
  }, [startSleepTimer, toast]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) nextTrack();
          else {
            const audio = getAudioElement();
            if (audio && audio.src) {
              audio.currentTime = Math.min(duration, audio.currentTime + 5);
              setProgress(audio.currentTime);
            }
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) prevTrack();
          else {
            const audio = getAudioElement();
            if (audio && audio.src) {
              audio.currentTime = Math.max(0, audio.currentTime - 5);
              setProgress(audio.currentTime);
            }
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume(Math.min(100, useAppStore.getState().volume + 5));
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume(Math.max(0, useAppStore.getState().volume - 5));
          break;
        case "KeyM":
          e.preventDefault();
          { const v = useAppStore.getState().volume; setVolume(v > 0 ? 0 : 70); }
          break;
        case "KeyL":
          e.preventDefault();
          handleLike();
          break;
        case "KeyN":
          e.preventDefault();
          nextTrack();
          break;
        case "KeyP":
          e.preventDefault();
          prevTrack();
          break;
        case "KeyS":
          e.preventDefault();
          toggleShuffle();
          break;
        case "KeyR":
          e.preventDefault();
          toggleRepeat();
          break;
        case "KeyF":
          e.preventDefault();
          setActivePanel(p => p === "lyrics" ? null : "lyrics");
          break;
        case "KeyQ":
          e.preventDefault();
          setActivePanel(p => p === "queue" ? null : "queue");
          break;
        case "KeyH":
          e.preventDefault();
          setActivePanel(p => p === "history" ? null : "history");
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, togglePlay, nextTrack, prevTrack, setProgress, setVolume, handleLike, toggleShuffle, toggleRepeat, setOpen, duration]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const isLiked = currentTrack ? likedTrackIds.includes(currentTrack.id) : false;
  const isDisliked = currentTrack ? dislikedTrackIds.includes(currentTrack.id) : false;
  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;
  const hoveredPct = hoveredTime !== null && duration > 0 ? (hoveredTime / duration) * 100 : 0;
  const isLoading = playbackState === "loading" || playbackState === "buffering";
  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  // ── Upcoming tracks ─────────────────────────────────────────────────────
  const upcoming = useMemo(() => {
    if (queue.length === 0) return [];
    return queue.slice(queueIndex + 1, queueIndex + 6);
  }, [queue, queueIndex]);

  // ── Recently played (deduped, exclude current) ──────────────────────────
  const recent = useMemo(() => {
    if (!currentTrack) return [];
    const seen = new Set<string>([currentTrack.id]);
    const out: Track[] = [];
    for (let i = history.length - 1; i >= 0 && out.length < 5; i--) {
      const t = history[i].track;
      if (!seen.has(t.id)) {
        seen.add(t.id);
        out.push(t);
      }
    }
    return out;
  }, [history, currentTrack]);

  // ── Lyrics fetching ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !currentTrack) return;
    if (activePanel !== "lyrics") return;

    setLyrics([]);
    setPlainLyrics("");
    setLyricsError(null);
    setLyricsLoading(true);

    let cancelled = false;
    // Direct client-side fetch from lrclib.net (CORS-enabled) — bypasses
    // Vercel serverless which is IP-blocked by lrclib.net's WAF.
    fetchLyrics(currentTrack.artist, currentTrack.title)
      .then(result => {
        if (cancelled || !result) return;
        if (result.lyrics.length > 0) {
          setLyrics(result.lyrics);
        } else if (result.plainText) {
          setPlainLyrics(result.plainText);
        } else {
          setLyricsError("Текст не найден");
        }
      })
      .catch(() => {
        if (!cancelled) setLyricsError("Ошибка загрузки текста");
      })
      .finally(() => {
        if (!cancelled) setLyricsLoading(false);
      });
    return () => { cancelled = true; };
  }, [activePanel, isOpen, currentTrack]);

  // Reset lyrics when track changes
  useEffect(() => {
    setLyrics([]);
    setPlainLyrics("");
    setLyricsError(null);
  }, [currentTrack?.id]);

  // ── Sleep timer display formatting ──────────────────────────────────────
  const sleepRemainingMin = Math.ceil(sleepTimerRemaining / 60);

  // Close volume popup when clicking outside
  const volumePopupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showVolumePopup) return;
    const onDown = (e: MouseEvent) => {
      if (volumePopupRef.current && !volumePopupRef.current.contains(e.target as Node)) {
        setShowVolumePopup(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [showVolumePopup]);

  return (
    <AnimatePresence>
      {isOpen && currentTrack && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: pullDownY }}
          exit={{ y: "100%" }}
          drag={isMobile ? "y" : false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.6 }}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          transition={{ type: "spring", stiffness: 300, damping: 32 }}
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
              <img
                src={currentTrack.cover}
                alt=""
                className="w-full h-full object-cover"
                style={{ filter: "blur(80px) saturate(180%)", opacity: 0.25, transform: "scale(1.3)" }}
              />
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(180deg, transparent 0%, var(--mq-bg) 60%)" }}
              />
            </div>
          )}

          <div className="relative z-10 h-full flex flex-col">
            {/* ── Header ── */}
            <div className="flex items-center justify-between p-4 sm:p-6">
              <button
                onClick={() => setOpen(false)}
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                aria-label="Закрыть"
              >
                <ChevronDown className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
              </button>
              <div className="text-center">
                <p className="mq-text-eyebrow text-[10px] uppercase tracking-widest">{radioMode ? "Волна" : "Играет"}</p>
                <p className="text-xs font-medium truncate max-w-[200px] sm:max-w-xs" style={{ color: "var(--mq-text-muted)" }}>
                  {currentTrack.album || currentTrack.artist}
                </p>
              </div>
              <button
                onClick={handleShare}
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                aria-label="Поделиться"
              >
                <Share2 className="w-4 h-4" style={{ color: "var(--mq-text)" }} />
              </button>
            </div>

            {/* ── Main content ── */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 pb-6 overflow-y-auto" data-scrollable="true">
              <div className={`w-full max-w-5xl flex ${isMobile ? "flex-col items-center" : "flex-row items-center gap-12"}`}>
                {/* ═══ COVER (with parallax tilt on desktop) ═══ */}
                <motion.div
                  key={currentTrack.id}
                  initial={{ scale: 0.92, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  ref={coverRef}
                  className="relative mb-6 sm:mb-0 flex-shrink-0"
                  style={{
                    width: isMobile ? "min(75vw, 320px)" : "min(35vw, 380px)",
                    aspectRatio: "1 / 1",
                    perspective: "1000px",
                  }}
                  onMouseMove={handleCoverMouseMove}
                  onMouseLeave={handleCoverMouseLeave}
                  onClick={handleCoverAreaTap}
                  onTouchStart={handleCoverTouchStart}
                  onTouchEnd={handleCoverTouchEnd}
                >
                  <div
                    ref={tiltRef}
                    className="w-full h-full"
                    style={{ transformStyle: "preserve-3d", transition: "transform 0.2s ease-out" }}
                  >
                    <div
                      className="w-full h-full rounded-3xl overflow-hidden relative"
                      style={{
                        boxShadow: "0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
                      }}
                    >
                      {currentTrack.cover ? (
                        <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}>
                          <Music className="w-16 h-16" style={{ color: "rgba(255,255,255,0.5)" }} />
                        </div>
                      )}
                      {/* Subtle playing indicator — pulsing border (CSS) */}
                      {isPlaying && (
                        <div
                          className="absolute inset-0 rounded-3xl pointer-events-none mq-pulse-border"
                          style={{ boxShadow: "inset 0 0 0 2px color-mix(in srgb, var(--mq-accent) 35%, transparent)" }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Glow */}
                  <div
                    className="absolute -inset-4 rounded-3xl pointer-events-none -z-10"
                    style={{ background: currentTrack.cover ? `url(${currentTrack.cover}) center/cover` : "var(--mq-accent)", filter: "blur(40px)", opacity: 0.3 }}
                  />

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

                {/* ═══ RIGHT SIDE: info, controls, panels ═══ */}
                <div className={`flex-1 ${isMobile ? "w-full" : "min-w-0"} flex flex-col ${isMobile ? "items-center" : "items-start"}`}>
                  {/* Track info */}
                  <div className={`w-full ${isMobile ? "text-center" : "text-left"} mb-4`}>
                    <h1 className="mq-text-display text-xl sm:text-2xl lg:text-4xl mb-1.5 truncate w-full" style={{ color: "var(--mq-text)" }}>
                      {currentTrack.title}
                    </h1>
                    <button
                      onClick={handleArtistClick}
                      className={`text-sm sm:text-base lg:text-lg hover:underline truncate w-full ${isMobile ? "" : "text-left"}`}
                      style={{ color: "var(--mq-text-muted)" }}
                    >
                      {currentTrack.artist}
                    </button>
                    <div className={`flex items-center gap-3 mt-2 text-[11px] ${isMobile ? "justify-center" : ""}`} style={{ color: "var(--mq-text-muted)" }}>
                      {duration > 0 && (
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(duration)}</span>
                      )}
                      {currentTrack.genre && <span>·</span>}
                      {currentTrack.genre && <span>{currentTrack.genre}</span>}
                      {playbackRate !== 1 && <span>·</span>}
                      {playbackRate !== 1 && <span className="flex items-center gap-1"><Gauge className="w-3 h-3" />{playbackRate}x</span>}
                      {sleepTimerActive && <span>·</span>}
                      {sleepTimerActive && (
                        <span className="flex items-center gap-1" style={{ color: "var(--mq-accent)" }}><Timer className="w-3 h-3" />{sleepRemainingMin}м</span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons row */}
                  <div className={`flex items-center gap-2 mb-4 flex-wrap ${isMobile ? "justify-center" : "justify-start"}`}>
                    <div className="relative">
                      <button onClick={handleLike} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: isLiked ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }} title="Нравится (L)">
                        <Heart className="w-4 h-4" style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }} fill={isLiked ? "currentColor" : "none"} />
                      </button>
                      <HeartBurst trigger={heartBurstTrigger} />
                    </div>
                    <button onClick={handleDislike} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: isDisliked ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)" }} title="Не нравится">
                      <ThumbsDown className="w-4 h-4" style={{ color: isDisliked ? "#ef4444" : "var(--mq-text-muted)" }} fill={isDisliked ? "currentColor" : "none"} />
                    </button>
                    <button
                      onClick={() => setShowPlaylistPicker(v => !v)}
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: showPlaylistPicker ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }}
                      title="Добавить в плейлист"
                    >
                      <ListPlus className="w-4 h-4" style={{ color: showPlaylistPicker ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                    </button>
                    <div className="w-px h-5 mx-1" style={{ backgroundColor: "var(--mq-border-thin)" }} />
                    <button
                      onClick={() => setActivePanel(p => p === "queue" ? null : "queue")}
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: activePanel === "queue" ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }}
                      title="Очередь (Q)"
                    >
                      <ListMusic className="w-4 h-4" style={{ color: activePanel === "queue" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                    </button>
                    <button
                      onClick={() => setActivePanel(p => p === "lyrics" ? null : "lyrics")}
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: activePanel === "lyrics" ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }}
                      title="Текст песни (F)"
                    >
                      <Mic2 className="w-4 h-4" style={{ color: activePanel === "lyrics" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                    </button>
                    <button
                      onClick={() => setActivePanel(p => p === "history" ? null : "history")}
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: activePanel === "history" ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }}
                      title="История (H)"
                    >
                      <History className="w-4 h-4" style={{ color: activePanel === "history" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                    </button>
                    <div className="w-px h-5 mx-1" style={{ backgroundColor: "var(--mq-border-thin)" }} />
                    <button onClick={() => setSpatialAudioEnabled(!spatialAudioEnabled)} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: spatialAudioEnabled ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }} title="Пространственное аудио">
                      <AirVent className="w-4 h-4" style={{ color: spatialAudioEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                    </button>
                    <button onClick={() => { setShowSpeedMenu(!showSpeedMenu); setShowSleepMenu(false); }} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: playbackRate !== 1 ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }} title="Скорость">
                      <span className="text-[10px] font-bold" style={{ color: playbackRate !== 1 ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>{playbackRate}x</span>
                    </button>
                    <button onClick={() => { setShowSleepMenu(!showSleepMenu); setShowSpeedMenu(false); }} className="w-10 h-10 rounded-full flex items-center justify-center relative" style={{ backgroundColor: sleepTimerActive ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }} title="Таймер сна">
                      <Timer className="w-4 h-4" style={{ color: sleepTimerActive ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                      {sleepTimerActive && (
                        <span className="absolute -bottom-0.5 -right-0.5 text-[8px] font-mono px-1 rounded-full" style={{ background: "var(--mq-accent)", color: "#fff" }}>{sleepRemainingMin}м</span>
                      )}
                    </button>
                  </div>

                  {/* Playlist picker — add current track to a playlist */}
                  <AnimatePresence>
                    {showPlaylistPicker && currentTrack && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="w-full mb-3 rounded-2xl overflow-hidden"
                        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border-hairline)" }}
                      >
                        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--mq-border-thin)" }}>
                          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                            Добавить в плейлист
                          </span>
                          <button
                            onClick={() => {
                              if (!currentTrack) return;
                              createPlaylist(currentTrack.artist);
                              const state = useAppStore.getState();
                              const newPl = [...state.playlists].reverse().find(p => p.name === currentTrack.artist);
                              if (newPl) addToPlaylist(newPl.id, currentTrack);
                              setShowPlaylistPicker(false);
                            }}
                            className="flex items-center gap-1 text-xs font-semibold"
                            style={{ color: "var(--mq-accent)" }}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Новый
                          </button>
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {playlists.length === 0 ? (
                            <div className="px-4 py-6 text-center">
                              <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                                У вас пока нет плейлистов
                              </p>
                            </div>
                          ) : (
                            playlists.map(pl => (
                              <button
                                key={pl.id}
                                onClick={() => {
                                  if (currentTrack) addToPlaylist(pl.id, currentTrack);
                                  setShowPlaylistPicker(false);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/5"
                              >
                                <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: "var(--mq-bg)" }}>
                                  {pl.cover ? (
                                    <img src={pl.cover} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <ListMusic className="w-3.5 h-3.5" style={{ color: "var(--mq-text-muted)" }} />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate" style={{ color: "var(--mq-text)" }}>
                                    {pl.name}
                                  </p>
                                  <p className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                                    {pl.tracks.length} треков
                                  </p>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Speed menu */}
                  <AnimatePresence>
                    {showSpeedMenu && (
                      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="w-full mb-3 overflow-hidden">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>Скорость:</span>
                          {speedOptions.map(speed => (
                            <button key={speed} onClick={() => handleSpeedChange(speed)} className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors" style={{ backgroundColor: playbackRate === speed ? "var(--mq-accent)" : "var(--mq-card)", color: playbackRate === speed ? "#fff" : "var(--mq-text-muted)" }}>
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
                      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="w-full mb-3 overflow-hidden">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>Сон через:</span>
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

                  {/* ═══ PANELS: Queue / Lyrics / History ═══ */}
                  <AnimatePresence mode="wait">
                    {activePanel === "lyrics" && (
                      <motion.div
                        key="lyrics-panel"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="w-full mb-4 overflow-hidden"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="mq-text-eyebrow text-[10px] uppercase tracking-widest flex items-center gap-1.5">
                            <Sparkles className="w-3 h-3" style={{ color: "var(--mq-accent)" }} /> Текст песни
                          </p>
                          <button onClick={() => setActivePanel(null)} aria-label="Закрыть" className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                            <X className="w-3 h-3" style={{ color: "var(--mq-text-muted)" }} />
                          </button>
                        </div>
                        {lyricsLoading ? (
                          <div className="flex items-center gap-2 py-6 justify-center">
                            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-accent)" }} />
                            <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Поиск текста...</span>
                          </div>
                        ) : (
                          <LyricsView
                            lines={lyrics}
                            plainText={plainLyrics}
                            currentTime={progress}
                            isLoading={false}
                            error={lyricsError}
                            onSeek={seekToTime}
                            cover={currentTrack?.cover}
                          />
                        )}
                      </motion.div>
                    )}

                    {activePanel === "queue" && (
                      <motion.div
                        key="queue-panel"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="w-full mb-4 overflow-hidden"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="mq-text-eyebrow text-[10px] uppercase tracking-widest">Далее в очереди</p>
                          <button onClick={() => setActivePanel(null)} aria-label="Закрыть" className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                            <X className="w-3 h-3" style={{ color: "var(--mq-text-muted)" }} />
                          </button>
                        </div>
                        {upcoming.length === 0 ? (
                          <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>Очередь пуста</p>
                        ) : (
                          <div className="space-y-1 max-h-[240px] overflow-y-auto" data-scrollable="true">
                            {upcoming.map((track, i) => (
                              <button
                                key={track.id + "_" + i}
                                onClick={() => { playTrack?.(track, queue); setActivePanel(null); }}
                                className="w-full flex items-center gap-3 p-2 rounded-xl text-left hover:bg-white/[0.04] transition-colors"
                              >
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
                        )}
                      </motion.div>
                    )}

                    {activePanel === "history" && (
                      <motion.div
                        key="history-panel"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="w-full mb-4 overflow-hidden"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="mq-text-eyebrow text-[10px] uppercase tracking-widest">Недавно играло</p>
                          <button onClick={() => setActivePanel(null)} aria-label="Закрыть" className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                            <X className="w-3 h-3" style={{ color: "var(--mq-text-muted)" }} />
                          </button>
                        </div>
                        {recent.length === 0 ? (
                          <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>История пуста</p>
                        ) : (
                          <div className="space-y-1 max-h-[240px] overflow-y-auto" data-scrollable="true">
                            {recent.map((track, i) => (
                              <button
                                key={track.id + "_h_" + i}
                                onClick={() => { playTrack?.(track, [track]); setActivePanel(null); }}
                                className="w-full flex items-center gap-3 p-2 rounded-xl text-left hover:bg-white/[0.04] transition-colors"
                              >
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
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* ═══ PROGRESS BAR ═══ */}
                  <div className="w-full mb-4">
                    <div
                      ref={progressBarRef}
                      className="h-1.5 rounded-full cursor-pointer relative group mb-2"
                      onMouseDown={handleProgressMouseDown}
                      onTouchStart={handleProgressTouchStart}
                      onMouseLeave={() => setHoveredTime(null)}
                      onMouseMove={handleProgressMouseMove}
                    >
                      <div className="absolute inset-0 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
                      {hoveredPct > progressPct && (
                        <div className="absolute inset-y-0 left-0 rounded-full opacity-0 group-hover:opacity-100" style={{ transform: `scaleX(${hoveredPct / 100})`, transformOrigin: "left", width: "100%", backgroundColor: "rgba(255,255,255,0.12)" }} />
                      )}
                      <div className="absolute inset-y-0 left-0 rounded-full" style={{ transform: `scaleX(${progressPct / 100})`, transformOrigin: "left", width: "100%", backgroundColor: "var(--mq-accent)", willChange: "transform", transition: isDragging ? "none" : "transform 0.1s linear" }} />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ left: `${isDragging ? progressPct : hoveredPct}%`, backgroundColor: "var(--mq-accent)", boxShadow: "0 0 12px color-mix(in srgb, var(--mq-accent) 50%, transparent)" }}
                      />
                      {hoveredTime !== null && !isDragging && (
                        <div
                          className="absolute -top-7 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-mono pointer-events-none whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ left: `${Math.max(10, Math.min(90, hoveredPct))}%`, backgroundColor: "var(--mq-card)", color: "var(--mq-text)", border: "1px solid var(--mq-border-thin)" }}
                        >
                          {formatDuration(hoveredTime)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono tabular-nums" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(progress)}</span>
                      <span className="text-[11px] font-mono tabular-nums" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(duration)}</span>
                    </div>
                  </div>

                  {/* ═══ MAIN CONTROLS ═══ */}
                  <div className={`flex items-center gap-3 sm:gap-5 mb-4 ${isMobile ? "" : "justify-start"}`}>
                    <button onClick={toggleShuffle} className="w-10 h-10 rounded-full flex items-center justify-center" title="Перемешать (S)">
                      <Shuffle className="w-5 h-5" style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                    </button>
                    <button onClick={prevTrack} className="w-12 h-12 rounded-full flex items-center justify-center" title="Предыдущий (P)">
                      <SkipBack className="w-6 h-6" style={{ color: "var(--mq-text)" }} fill="currentColor" />
                    </button>
                    <button
                      onClick={togglePlay}
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center relative"
                      style={{ backgroundColor: "var(--mq-accent)", boxShadow: "0 8px 32px color-mix(in srgb, var(--mq-accent) 40%, transparent)" }}
                      title="Play/Pause (Space)"
                    >
                      {isLoading ? <Loader2 className="w-7 h-7 sm:w-8 sm:h-8 animate-spin" style={{ color: "#fff" }} />
                        : isPlaying ? <Pause className="w-7 h-7 sm:w-8 sm:h-8" fill="#fff" style={{ color: "#fff" }} />
                        : <Play className="w-7 h-7 sm:w-8 sm:h-8 ml-1" fill="#fff" style={{ color: "#fff" }} />}
                      {/* Pulse ring when playing (CSS) */}
                      {isPlaying && (
                        <div
                          className="absolute inset-0 rounded-full pointer-events-none mq-pulse-ring"
                          style={{ border: "2px solid var(--mq-accent)" }}
                        />
                      )}
                    </button>
                    <button onClick={nextTrack} className="w-12 h-12 rounded-full flex items-center justify-center" title="Следующий (N)">
                      <SkipForward className="w-6 h-6" style={{ color: "var(--mq-text)" }} fill="currentColor" />
                    </button>
                    <button onClick={toggleRepeat} className="w-10 h-10 rounded-full flex items-center justify-center" title="Повтор (R)">
                      {repeat === "one" ? <Repeat1 className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
                        : <Repeat className="w-5 h-5" style={{ color: repeat === "all" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />}
                    </button>
                  </div>

                  {/* ═══ VOLUME (desktop — single horizontal slider with icon) ═══ */}
                  {!isMobile && (
                    <div className="flex items-center gap-2 w-full max-w-xs">
                      <VolumeSlider volume={volume} onChange={setVolume} showIcon={true} showValue={true} className="flex-1" />
                    </div>
                  )}

                  {/* ═══ Keyboard shortcuts hint (desktop, small) ═══ */}
                  {!isMobile && (
                    <div className="mt-4 flex items-center gap-2 flex-wrap text-[9px] opacity-50" style={{ color: "var(--mq-text-muted)" }}>
                      <kbd className="px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>Space</kbd>
                      <span>play</span>
                      <kbd className="px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>←/→</kbd>
                      <span>seek 5s</span>
                      <kbd className="px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>↑/↓</kbd>
                      <span>vol</span>
                      <kbd className="px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>scroll</kbd>
                      <span>vol</span>
                      <kbd className="px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>L</kbd>
                      <span>like</span>
                      <kbd className="px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>F</kbd>
                      <span>lyrics</span>
                      <kbd className="px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>Esc</kbd>
                      <span>close</span>
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
