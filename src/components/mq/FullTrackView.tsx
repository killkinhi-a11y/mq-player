"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, ChevronDown, Heart,
  Shuffle, Repeat, Repeat1, Volume2, VolumeX, Volume1,
  Music, ListMusic, Share2, Loader2, Clock, Mic2,
  ThumbsDown, AirVent, Gauge, Timer,
  History, Sparkles, X, ListPlus, Plus, Sliders, MoreHorizontal,
} from "lucide-react";
import { getAudioElement } from "@/lib/audioEngine";
import { seekPlayback, currentPlaybackPosition, isWasmActive } from "@/lib/wasm-audio";
import { formatDuration } from "@/lib/musicApi";
import type { Track } from "@/lib/musicApi";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import VolumeSlider from "@/components/ui/volume-slider";
import { fetchLyrics } from "@/lib/lyrics-client";
import { LyricsView, type LyricLine } from "./LyricsView";
import { AudioVisualizer } from "./AudioVisualizer";
import { ShareSheet } from "./ShareSheet";
import { waveReasonText } from "./MainView";

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

// ── Heart particle burst on like ── REMOVED in Phase 2B (decorative).
// Toast + heart state change is sufficient feedback for a like action.

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
  const setEqOpen = useAppStore((s) => s.setEqOpen);
  const eqEnabled = useAppStore((s) => s.eqEnabled);
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
  // Wide 3-column composition (artwork | center | context panel) kicks in at
  // ≥1024px. Below that (768–1023) the centered 2-column layout is kept.
  // JS-level branch (not CSS lg:hidden) so refs (progressBarRef, coverRef,
  // moreMenuRef) attach to the actually-mounted tree.
  const [isWide, setIsWide] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsWide(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [activePanel, setActivePanel] = useState<"queue" | "lyrics" | "history" | null>(null);
  // On wide layouts the context panel is persistent — a null activePanel
  // falls back to the queue tab instead of hiding content.
  const panelTab = isWide ? (activePanel ?? "queue") : activePanel;
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState<string>("");
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showDoubleTapHint, setShowDoubleTapHint] = useState(true);
  const [showVisualizer, setShowVisualizer] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [showVolumePopup, setShowVolumePopup] = useState(false);
  const [lastTapTime, setLastTapTime] = useState(0);
  const [lastTapSide, setLastTapSide] = useState<"left" | "right" | null>(null);
  const [seekFeedback, setSeekFeedback] = useState<{ side: "left" | "right"; amount: number } | null>(null);
  // Pull-down-to-close state (mobile)
  const [pullDownY, setPullDownY] = useState(0);

  // ── Seek ────────────────────────────────────────────────────────────────
  const seekTo = useCallback((clientX: number) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const time = (pct / 100) * duration;
    seekPlayback(time);
    setProgress(time);
  }, [duration, setProgress]);

  const seekToTime = useCallback((time: number) => {
    seekPlayback(time);
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
  useEffect(() => () => { if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current); }, []);
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
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDragging, seekTo]);

  // ── Cover 3D parallax tilt — REMOVED in Phase 2B (decorative motion).
  // The artwork stays static and calm; tap/double-tap/swipe remain.

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
    }
  }, [currentTrack, toggleLike]);

  const handleDislike = useCallback(() => {
    if (currentTrack) {
      toggleDislike(currentTrack.id, currentTrack);
      // toggleDislike already calls nextTrack() internally if it's the current track
    }
  }, [currentTrack, toggleDislike]);

  const handleShare = useCallback(() => {
    if (!currentTrack) return;
    setShowShareSheet(true);
  }, [currentTrack]);

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
      if ((audio && audio.src) || isWasmActive()) {
        const target = Math.max(0, Math.min(duration, currentPlaybackPosition() + seekAmount));
        seekPlayback(target);
        setProgress(target);
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
            if ((audio && audio.src) || isWasmActive()) {
              const target = Math.min(duration, currentPlaybackPosition() + 5);
              seekPlayback(target);
              setProgress(target);
            }
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) prevTrack();
          else {
            const audio = getAudioElement();
            if ((audio && audio.src) || isWasmActive()) {
              const target = Math.max(0, currentPlaybackPosition() - 5);
              seekPlayback(target);
              setProgress(target);
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

  // Upcoming — long window for the persistent desktop context panel
  const upcomingAll = useMemo(() => {
    if (queue.length === 0) return [];
    return queue.slice(queueIndex + 1, queueIndex + 51);
  }, [queue, queueIndex]);

  // ── Recently played (deduped, exclude current) ──
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

  // Recent — long window (persistent desktop panel)
  const recentAll = useMemo(() => {
    const seen = new Set<string>(currentTrack ? [currentTrack.id] : []);
    const out: Track[] = [];
    for (let i = history.length - 1; i >= 0 && out.length < 30; i--) {
      const t = history[i].track;
      if (!seen.has(t.id)) {
        seen.add(t.id);
        out.push(t);
      }
    }
    return out;
  }, [history, currentTrack]);

  // ── Lyrics fetching ─────────────────────────────────────────────────────
  const [lyricsRetryKey, setLyricsRetryKey] = useState(0);

  // Listen for retry event from LyricsView
  useEffect(() => {
    const onRetry = () => setLyricsRetryKey((k) => k + 1);
    window.addEventListener("mq-lyrics-retry", onRetry);
    return () => window.removeEventListener("mq-lyrics-retry", onRetry);
  }, []);

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
      .catch((e) => {
        if (!cancelled) {
          console.warn("[FullTrackView] lyrics fetch failed:", e);
          setLyricsError("Ошибка загрузки текста");
        }
      })
      .finally(() => {
        if (!cancelled) setLyricsLoading(false);
      });
    return () => { cancelled = true; };
  }, [activePanel, isOpen, currentTrack, lyricsRetryKey]);

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

  // Close More menu on outside click
  const moreMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showMoreMenu) return;
    const onDown = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [showMoreMenu]);
  // ── Shared layout nodes ───────────────────────────────────────────────────
  // The classic (≤1023px) and wide (≥1024px) compositions render from the
  // same node trees below; only ONE composition is mounted at a time, so
  // shared refs (coverRef / progressBarRef / moreMenuRef) always attach to
  // live DOM.
  const coverBox = currentTrack ? (
    <>
      {/* Phase 4B: artwork depth = grounded shadow + inner hairline.
          No premium shadow stack. */}
      <div
        className="w-full h-full rounded-3xl overflow-hidden relative"
        style={{
          boxShadow: "var(--mq-art-shadow), var(--mq-art-edge)",
        }}
      >
          {currentTrack.cover ? (
            <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" loading="eager" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}>
              <Music className="w-16 h-16" style={{ color: "var(--mq-text-on-accent, rgba(255,255,255,0.7))" }} />
            </div>
          )}
          {/* Audio Visualizer overlay — WebGL-style particle sphere */}
          {showVisualizer && (
            <div className="absolute inset-0 rounded-3xl overflow-hidden" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
              <AudioVisualizer isPlaying={isPlaying} />
            </div>
          )}
          {/* Subtle playing indicator — static accent ring (CSS) */}
          {isPlaying && (
            <div
              className="absolute inset-0 rounded-3xl pointer-events-none"
              style={{ boxShadow: "inset 0 0 0 2px color-mix(in srgb, var(--mq-accent) 30%, transparent)" }}
            />
          )}
        </div>

      {/* Glow — REMOVED in Phase 2B (decorative bloom behind artwork) */}

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
              backgroundColor: "rgba(10,10,12,0.85)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
            } as React.CSSProperties}
          >
            {seekFeedback.amount > 0 ? `+${seekFeedback.amount}s` : `${seekFeedback.amount}s`}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hint text for double-tap — auto-hides after 4 seconds */}
      {showDoubleTapHint && (
        <motion.div
          className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[11px] pointer-events-none"
          style={{ color: "var(--mq-text-muted)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0.5, 0] }}
          transition={{ duration: 4, times: [0, 0.1, 0.8, 1] }}
          onAnimationComplete={() => setShowDoubleTapHint(false)}
        >
          ← двойной тап →
        </motion.div>
      )}
    </>
  ) : null;
  const trackInfoNode = currentTrack ? (
    <>
      {/* Track info */}
      <div className={`w-full ${isMobile ? "text-center" : "text-left"} mb-4`}>
        <h1 className="mq-text-display text-xl sm:text-2xl lg:text-4xl mb-1.5 leading-tight line-clamp-2 w-full" style={{ color: "var(--mq-text)" }}>
          {currentTrack.title}
        </h1>
        <button
          onClick={handleArtistClick}
          className={`text-sm sm:text-base lg:text-lg hover:underline truncate w-full ${isMobile ? "" : "text-left"}`}
          style={{ color: "var(--mq-text-muted)" }}
        >
          {currentTrack.artist}
        </button>
        {currentTrack.album && currentTrack.album !== currentTrack.title && (
          <p className={`text-xs sm:text-sm mt-0.5 truncate w-full ${isMobile ? "text-center" : "text-left"}`} style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
            {currentTrack.album}
          </p>
        )}
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] ${isMobile ? "justify-center" : ""}`} style={{ color: "var(--mq-text-muted)" }}>
          {duration > 0 && (
            <span className="flex items-center gap-1 shrink-0"><Clock className="w-3 h-3" />{formatDuration(duration)}</span>
          )}
          {currentTrack.genre && <span className="shrink-0">·</span>}
          {currentTrack.genre && <span className="min-w-0 max-w-[220px] truncate">{currentTrack.genre}</span>}
          {playbackRate !== 1 && <span className="shrink-0">·</span>}
          {playbackRate !== 1 && <span className="flex items-center gap-1 shrink-0"><Gauge className="w-3 h-3" />{playbackRate}x</span>}
          {sleepTimerActive && <span className="shrink-0">·</span>}
          {sleepTimerActive && (
            <span className="flex items-center gap-1 shrink-0" style={{ color: "var(--mq-accent)" }}><Timer className="w-3 h-3" />{sleepRemainingMin}м</span>
          )}
        </div>
      </div>

    </>
  ) : null;
  const actionsNode = currentTrack ? (
    <>
      {/* Action buttons row */}
      <div className={`flex items-center gap-2 mb-4 flex-wrap ${isMobile ? "justify-center" : "justify-start"}`}>
        <button onClick={handleLike} className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-overlay-hover)]" style={{ backgroundColor: isLiked ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "transparent" }} title="Нравится (L)">
          <Heart className="w-4 h-4" style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }} fill={isLiked ? "currentColor" : "none"} />
        </button>
        <button onClick={handleDislike} className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-overlay-hover)]" style={{ backgroundColor: isDisliked ? "rgba(239,68,68,0.15)" : "transparent" }} title="Не нравится">
          <ThumbsDown className="w-4 h-4" style={{ color: isDisliked ? "var(--mq-error, #ef4444)" : "var(--mq-text-muted)" }} fill={isDisliked ? "currentColor" : "none"} />
        </button>
        <button
          onClick={() => setShowPlaylistPicker(v => !v)}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: showPlaylistPicker ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "transparent" }}
          title="Добавить в плейлист"
        >
          <ListPlus className="w-4 h-4" style={{ color: showPlaylistPicker ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
        </button>
        <div className="w-px h-5 mx-1" style={{ backgroundColor: "var(--mq-border-thin)" }} />
        <button
          onClick={() => setActivePanel(p => p === "queue" ? null : "queue")}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: panelTab === "queue" ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "transparent" }}
          title="Очередь (Q)"
        >
          <ListMusic className="w-4 h-4" style={{ color: panelTab === "queue" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
        </button>
        <button
          onClick={() => setActivePanel(p => p === "lyrics" ? null : "lyrics")}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: panelTab === "lyrics" ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "transparent" }}
          title="Текст песни (F)"
        >
          <Mic2 className="w-4 h-4" style={{ color: panelTab === "lyrics" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
        </button>
        <button
          onClick={() => setActivePanel(p => p === "history" ? null : "history")}
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: panelTab === "history" ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "transparent" }}
          title="История (H)"
        >
          <History className="w-4 h-4" style={{ color: panelTab === "history" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
        </button>
        {/* More button — replaces 4 secondary buttons (EQ, Spatial, Speed, Sleep) */}
        {/* Reduces action row from 11 buttons to 8 — cleaner UX */}
        <div className="relative" ref={moreMenuRef}>
          <button
            onClick={() => { setShowMoreMenu(!showMoreMenu); setShowSpeedMenu(false); setShowSleepMenu(false); }}
            aria-label="Дополнительные настройки"
            className="w-10 h-10 rounded-full flex items-center justify-center relative"
            style={{
              backgroundColor: (eqEnabled || spatialAudioEnabled || playbackRate !== 1 || sleepTimerActive || showVisualizer)
                ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)"
                : "transparent"
            }}
            title="Дополнительно"
          >
            <MoreHorizontal className="w-4 h-4" style={{ color: (eqEnabled || spatialAudioEnabled || playbackRate !== 1 || sleepTimerActive || showVisualizer) ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
            {/* Active indicator dot */}
            {(eqEnabled || spatialAudioEnabled || playbackRate !== 1 || sleepTimerActive || showVisualizer) && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ backgroundColor: "var(--mq-accent)" }} />
            )}
          </button>
          <AnimatePresence>
            {showMoreMenu && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="absolute top-full right-0 mt-2 z-50 rounded-[var(--mq-r-card)] overflow-hidden min-w-[200px]"
                style={{
                  backgroundColor: "var(--mq-surface-1)",
                  border: "1px solid var(--mq-edge-strong)",
                  boxShadow: "var(--mq-elev-dialog)",
                }}
              >
                <button
                  onClick={() => { setEqOpen(true); setShowMoreMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--mq-overlay-hover)]"
                >
                  <Sliders className="w-4 h-4" style={{ color: eqEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                  <span className="text-sm flex-1" style={{ color: "var(--mq-text)" }}>Эквалайзер</span>
                  {eqEnabled && <span className="text-[11px] font-semibold" style={{ color: "var(--mq-accent)" }}>ON</span>}
                </button>
                <button
                  onClick={() => setSpatialAudioEnabled(!spatialAudioEnabled)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--mq-overlay-hover)]"
                  style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
                >
                  <AirVent className="w-4 h-4" style={{ color: spatialAudioEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                  <span className="text-sm flex-1" style={{ color: "var(--mq-text)" }}>Пространственное аудио</span>
                  {spatialAudioEnabled && <span className="text-[11px] font-semibold" style={{ color: "var(--mq-accent)" }}>ON</span>}
                </button>
                <button
                  onClick={() => { setShowSpeedMenu(!showSpeedMenu); setShowMoreMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--mq-overlay-hover)]"
                  style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
                >
                  <Gauge className="w-4 h-4" style={{ color: playbackRate !== 1 ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                  <span className="text-sm flex-1" style={{ color: "var(--mq-text)" }}>Скорость</span>
                  <span className="text-xs font-mono" style={{ color: playbackRate !== 1 ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>{playbackRate}x</span>
                </button>
                <button
                  onClick={() => { setShowSleepMenu(!showSleepMenu); setShowMoreMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--mq-overlay-hover)]"
                  style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
                >
                  <Timer className="w-4 h-4" style={{ color: sleepTimerActive ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                  <span className="text-sm flex-1" style={{ color: "var(--mq-text)" }}>Таймер сна</span>
                  {sleepTimerActive && <span className="text-xs font-mono" style={{ color: "var(--mq-accent)" }}>{sleepRemainingMin}м</span>}
                </button>
                <button
                  onClick={() => { setShowVisualizer(!showVisualizer); setShowMoreMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--mq-overlay-hover)]"
                  style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
                >
                  <Sparkles className="w-4 h-4" style={{ color: showVisualizer ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                  <span className="text-sm flex-1" style={{ color: "var(--mq-text)" }}>Визуализатор</span>
                  {showVisualizer && <span className="text-[11px] font-semibold" style={{ color: "var(--mq-accent)" }}>ВКЛ</span>}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
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
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--mq-overlay-hover)]"
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
                      <p className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
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
              <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>Скорость:</span>
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
              <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>Сон через:</span>
              {sleepOptions.map(min => (
                <button key={min} onClick={() => handleSleepSet(min)} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ backgroundColor: "var(--mq-card)", color: "var(--mq-text-muted)" }}>
                  {min} мин
                </button>
              ))}
              {sleepTimerActive && (
                <button onClick={() => { stopSleepTimer(); setShowSleepMenu(false); toast({ title: "Таймер отменён" }); }} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "var(--mq-error, #ef4444)" }}>
                  Отменить
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </>
  ) : null;
  const inlinePanelsNode = (
    <>
      {/* ═══ PANELS: Queue / Lyrics / History ═══ */}
      <AnimatePresence mode="wait">
        {activePanel === "lyrics" && (
          <motion.div
            key="lyrics-panel"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="w-full mb-4 overflow-hidden rounded-[var(--mq-r-card-lg)]"
            style={{ backgroundColor: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)" }}
          >
            <div className="flex items-center justify-end mb-2">
              <button onClick={() => setActivePanel(null)} aria-label="Закрыть" className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-overlay-hover)]" style={{ backgroundColor: "transparent" }}>
                <X className="w-3.5 h-3.5" style={{ color: "var(--mq-text-muted)" }} />
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
            className="w-full mb-4 overflow-hidden rounded-[var(--mq-r-card-lg)]"
            style={{ backgroundColor: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="mq-text-eyebrow text-[11px] uppercase tracking-widest">Далее в очереди</p>
              <button onClick={() => setActivePanel(null)} aria-label="Закрыть" className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-overlay-hover)]" style={{ backgroundColor: "transparent" }}>
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
                    className="mq-row !min-h-[52px] w-full text-left"
                  >
                    <div className="w-10 h-10 rounded-[var(--mq-r-art)] overflow-hidden flex-shrink-0 mq-art">
                      {track.cover ? <img src={track.cover} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>{track.title}</p>
                      <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{track.artist}</p>
                    </div>
                    <span className="text-[11px] font-mono" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(track.duration)}</span>
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
            className="w-full mb-4 overflow-hidden rounded-[var(--mq-r-card-lg)]"
            style={{ backgroundColor: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="mq-text-eyebrow text-[11px] uppercase tracking-widest">Недавно играло</p>
              <button onClick={() => setActivePanel(null)} aria-label="Закрыть" className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-overlay-hover)]" style={{ backgroundColor: "transparent" }}>
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
                    className="mq-row !min-h-[52px] w-full text-left"
                  >
                    <div className="w-10 h-10 rounded-[var(--mq-r-art)] overflow-hidden flex-shrink-0 mq-art">
                      {track.cover ? <img src={track.cover} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>{track.title}</p>
                      <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{track.artist}</p>
                    </div>
                    <span className="text-[11px] font-mono" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(track.duration)}</span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

    </>
  );
  const progressNode = (
    <>
      {/* ═══ PROGRESS BAR ═══ */}
      <div className="w-full mb-4">
        <div
          ref={progressBarRef}
          className="relative cursor-pointer group mb-2"
          style={{ height: "24px", display: "flex", alignItems: "center" }}
          onMouseDown={handleProgressMouseDown}
          onTouchStart={handleProgressTouchStart}
          onMouseLeave={() => setHoveredTime(null)}
          onMouseMove={handleProgressMouseMove}
          role="slider"
          aria-label="Прогресс воспроизведения"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration || 0)}
          aria-valuenow={Math.round(progress || 0)}
          tabIndex={0}
        >
          {/* Touch target overlay — 24px tall transparent area for easy touch drag.
              Visual bar stays 6px (h-1.5), but touch area is 24px (WCAG 2.5.8). */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full">
            <div className="absolute inset-0 rounded-full" style={{ backgroundColor: "var(--mq-glass-bg-hover)" }} />
            {hoveredPct > progressPct && (
              <div className="absolute inset-y-0 left-0 rounded-full opacity-0 group-hover:opacity-100" style={{ transform: `scaleX(${hoveredPct / 100})`, transformOrigin: "left", width: "100%", backgroundColor: "var(--mq-glass-bg-active)" }} />
            )}
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ transform: `scaleX(${progressPct / 100})`, transformOrigin: "left", width: "100%", backgroundColor: "var(--mq-accent)", transition: isDragging ? "none" : "transform 0.1s linear" }} />
            {/* Drag handle — visible on mobile (touch devices don't have hover) */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full pointer-events-none transition-opacity"
              style={{
                left: `${isDragging ? progressPct : (hoveredPct || progressPct)}%`,
                backgroundColor: "var(--mq-accent)",
                                            opacity: isDragging ? 1 : (isMobile ? 0.7 : 0),
              }}
            />
            {/* Hover-only handle on desktop */}
            {!isMobile && (
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${hoveredPct}%`, backgroundColor: "var(--mq-accent)" }}
              />
            )}
          </div>
          {/* Hover tooltip — inside progressBarRef div for correct positioning */}
          {hoveredTime !== null && !isDragging && (
            <div
              className="absolute -top-7 -translate-x-1/2 px-1.5 py-0.5 rounded text-[11px] font-mono pointer-events-none whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity"
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

    </>
  );
  const transportNode = (
    <>
      {/* ═══ MAIN CONTROLS ═══ */}
      <div className={`flex items-center gap-3 sm:gap-5 mb-4 ${isMobile ? "justify-center" : "justify-start"}`}>
        <button onClick={toggleShuffle} aria-label="Перемешать" className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-overlay-hover)]" style={{ backgroundColor: shuffle ? "color-mix(in srgb, var(--mq-accent) 14%, transparent)" : "transparent" }} title="Перемешать (S)">
          <Shuffle className="w-5 h-5" style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
        </button>
        <button onClick={prevTrack} aria-label="Предыдущий трек" className="w-12 h-12 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-overlay-hover)]" title="Предыдущий (P)">
          <SkipBack className="w-6 h-6" style={{ color: "var(--mq-text)" }} fill="currentColor" />
        </button>
        <motion.button
          onClick={togglePlay}
          whileTap={{ scale: 0.94 }}
          aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center relative"
          style={{ backgroundColor: "var(--mq-accent)" }}
          title="Play/Pause (Space)"
        >
          {isLoading ? <Loader2 className="w-7 h-7 sm:w-8 sm:h-8 animate-spin" style={{ color: "var(--mq-text-on-accent, #fff)" }} />
            : isPlaying ? <Pause className="w-7 h-7 sm:w-8 sm:h-8" fill="var(--mq-text-on-accent, #fff)" style={{ color: "var(--mq-text-on-accent, #fff)" }} />
            : <Play className="w-7 h-7 sm:w-8 sm:h-8" fill="var(--mq-text-on-accent, #fff)" style={{ color: "var(--mq-text-on-accent, #fff)", transform: "translateX(1px)" }} />}
        </motion.button>
        <button onClick={nextTrack} aria-label="Следующий трек" className="w-12 h-12 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-overlay-hover)]" title="Следующий (N)">
          <SkipForward className="w-6 h-6" style={{ color: "var(--mq-text)" }} fill="currentColor" />
        </button>
        <button onClick={toggleRepeat} aria-label="Повтор" className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-overlay-hover)]" style={{ backgroundColor: repeat !== "off" ? "color-mix(in srgb, var(--mq-accent) 14%, transparent)" : "transparent" }} title="Повтор (R)">
          {repeat === "one" ? <Repeat1 className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
            : <Repeat className="w-5 h-5" style={{ color: repeat === "all" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />}
        </button>
      </div>

    </>
  );
  const volumeNode = (
    <>
      {/* ═══ VOLUME (desktop — single horizontal slider with icon) ═══ */}
      {!isMobile && (
        <div className="flex items-center gap-2 w-full max-w-xs">
          <VolumeSlider volume={volume} onChange={setVolume} showIcon={true} showValue={true} className="flex-1" />
        </div>
      )}

    </>
  );
  const hintsNode = (
    <>
      {/* ═══ Keyboard shortcuts hint (desktop, top 3 only) ═══ */}
      {!isMobile && (
        <div className="mt-4 flex items-center gap-3 flex-wrap text-[11px] opacity-70" style={{ color: "var(--mq-text-muted)" }}>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded font-mono text-[11px]" style={{ backgroundColor: "var(--mq-card)", color: "var(--mq-text)", border: "1px solid var(--mq-border-hairline)" }}>Space</kbd>
            play/pause
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded font-mono text-[11px]" style={{ backgroundColor: "var(--mq-card)", color: "var(--mq-text)", border: "1px solid var(--mq-border-hairline)" }}>←/→</kbd>
            seek
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded font-mono text-[11px]" style={{ backgroundColor: "var(--mq-card)", color: "var(--mq-text)", border: "1px solid var(--mq-border-hairline)" }}>Esc</kbd>
            close
          </span>
        </div>
      )}
    </>
  );

  return (
    <>
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
          // A4 fix: WCAG 2.4.3 + frontend-patterns Focus Management — mark
          // as modal dialog so screen readers trap focus and announce it.
          role="dialog"
          aria-modal="true"
          aria-label={`Полноэкранный плеер: ${currentTrack.title} - ${currentTrack.artist}`}
          style={{
            background: currentTrack.cover
              ? "var(--mq-bg)"
              : "var(--mq-bg)",
          }}
        >
          {/* Blurred cover background — the single ambient layer that makes
              the full player feel like the album. Phase 2B: blur 40→28px,
              opacity 0.25→0.2, accent tint removed (neutral, calmer). */}
          {currentTrack.cover && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <img
                src={currentTrack.cover}
                alt=""
                className="w-full h-full object-cover"
                style={{ filter: "blur(28px) saturate(130%)", opacity: 0.2, transform: "scale(1.15)" }}
                loading="eager"
              />
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(180deg, transparent 0%, var(--mq-bg) 55%)" }}
              />
            </div>
          )}

          <div className="relative z-10 h-full flex flex-col">
            {/* ── Header ── */}
            <div className="flex items-center justify-between p-4 sm:p-6">
              <button
                onClick={() => setOpen(false)}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-overlay-hover)]"
                style={{ backgroundColor: "transparent" }}
                aria-label="Закрыть"
              >
                <ChevronDown className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
              </button>
              <div className="text-center">
                <p className="mq-text-eyebrow text-[11px] uppercase tracking-widest">{radioMode ? "Волна" : isPlaying ? "Играет" : "Пауза"}</p>
                <p className="text-xs font-medium truncate max-w-[200px] sm:max-w-xs" style={{ color: "var(--mq-text-muted)" }}>
                  {currentTrack.album || currentTrack.artist}
                </p>
              </div>
              <button
                onClick={handleShare}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-overlay-hover)]"
                style={{ backgroundColor: "transparent" }}
                aria-label="Поделиться"
              >
                <Share2 className="w-4 h-4" style={{ color: "var(--mq-text)" }} />
              </button>
            </div>

            {/* ── Main content ── */}
            {!isWide ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6 pb-6 overflow-y-auto" data-scrollable="true">
              <div className={`w-full max-w-5xl flex ${isMobile ? "flex-col items-center" : "flex-row items-center gap-12"}`}>
                {/* ═══ COVER (with parallax tilt on desktop) ═══ */}
                <motion.div
                  key={currentTrack.id}
                  initial={{ scale: 0.92, opacity: 0, y: 10 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  ref={coverRef}
                  className="relative mb-6 sm:mb-0 flex-shrink-0 cursor-pointer"
                  style={{
                    width: isMobile ? "min(75vw, 320px)" : "min(35vw, 380px)",
                    aspectRatio: "1 / 1",
                  }}
                  onClick={handleCoverAreaTap}
                  onTouchStart={handleCoverTouchStart}
                  onTouchEnd={handleCoverTouchEnd}
                >
                  {coverBox}
                </motion.div>

                {/* ═══ RIGHT SIDE: info, controls, panels ═══ */}
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                  className={`flex-1 ${isMobile ? "w-full" : "min-w-0"} flex flex-col ${isMobile ? "items-center" : "items-start"}`}
                >
                  {trackInfoNode}
                  {actionsNode}
                  {inlinePanelsNode}
                  {progressNode}
                  {transportNode}
                  {volumeNode}
                  {hintsNode}
                </motion.div>
              </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 w-full flex items-stretch justify-center overflow-hidden">
                <div className="w-full h-full max-w-[1408px] flex items-stretch gap-6 xl:gap-8 px-8 xl:px-10 pb-6 pt-1">

                  {/* ═══ LEFT — large artwork ═══ */}
                  <div
                    className="flex-shrink-0 flex items-center justify-center min-h-0"
                    style={{ width: "min(clamp(300px, 30vw, 420px), calc(100vh - 220px))" }}
                  >
                    <motion.div
                      key={currentTrack.id}
                      initial={{ scale: 0.96, opacity: 0, y: 8 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                      ref={coverRef}
                      className="relative w-full cursor-pointer"
                      style={{ aspectRatio: "1 / 1" }}
                      onClick={handleCoverAreaTap}
                      onTouchStart={handleCoverTouchStart}
                      onTouchEnd={handleCoverTouchEnd}
                    >
                      {coverBox}
                    </motion.div>
                  </div>

                  {/* ═══ CENTER — identity / progress / transport / actions ═══ */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                    className="flex-1 min-w-0 max-w-[520px] flex flex-col justify-center items-start py-2 overflow-y-auto"
                    data-scrollable="true"
                  >
                    {trackInfoNode}
                    {progressNode}
                    {transportNode}
                    <div className="w-full mt-1 mb-2">
                      {actionsNode}
                    </div>
                    {volumeNode}
                    {hintsNode}
                  </motion.div>

                  {/* ═══ RIGHT — persistent queue / context panel ═══ */}
                  <aside className="flex-shrink-0 w-[300px] xl:w-[340px] min-h-0 flex flex-col py-1">
                    <div
                      className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-[var(--mq-r-card-lg)]"
                      style={{ backgroundColor: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)" }}
                    >
                      {/* Tab switcher */}
                      <div
                        role="tablist"
                        aria-label="Контекст воспроизведения"
                        className="flex items-center gap-1 p-1.5"
                        style={{ borderBottom: "1px solid var(--mq-edge)" }}
                      >
                        <button
                          role="tab"
                          aria-selected={panelTab === "queue"}
                          onClick={() => setActivePanel("queue")}
                          className="flex-1 h-9 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors hover:bg-[var(--mq-overlay-hover)]"
                          style={{ color: panelTab === "queue" ? "var(--mq-text)" : "var(--mq-text-muted)", backgroundColor: panelTab === "queue" ? "var(--mq-overlay-hover)" : "transparent" }}
                          title="Очередь (Q)"
                        >
                          Очередь
                          {upcomingAll.length > 0 && (
                            <span className="text-[11px] font-semibold px-1.5 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 15%, transparent)", color: "var(--mq-accent)" }}>
                              {upcomingAll.length}
                            </span>
                          )}
                        </button>
                        <button
                          role="tab"
                          aria-selected={panelTab === "lyrics"}
                          onClick={() => setActivePanel("lyrics")}
                          className="flex-1 h-9 rounded-xl flex items-center justify-center text-xs font-medium transition-colors hover:bg-[var(--mq-overlay-hover)]"
                          style={{ color: panelTab === "lyrics" ? "var(--mq-text)" : "var(--mq-text-muted)", backgroundColor: panelTab === "lyrics" ? "var(--mq-overlay-hover)" : "transparent" }}
                          title="Текст песни (F)"
                        >
                          Текст
                        </button>
                        <button
                          role="tab"
                          aria-selected={panelTab === "history"}
                          onClick={() => setActivePanel("history")}
                          className="flex-1 h-9 rounded-xl flex items-center justify-center gap-1.5 text-xs font-medium transition-colors hover:bg-[var(--mq-overlay-hover)]"
                          style={{ color: panelTab === "history" ? "var(--mq-text)" : "var(--mq-text-muted)", backgroundColor: panelTab === "history" ? "var(--mq-overlay-hover)" : "transparent" }}
                          title="История (H)"
                        >
                          История
                          {recentAll.length > 0 && (
                            <span className="text-[11px] font-semibold px-1.5 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 15%, transparent)", color: "var(--mq-accent)" }}>
                              {recentAll.length}
                            </span>
                          )}
                        </button>
                      </div>

                      {/* Wave context — why this track is playing */}
                      {radioMode && currentTrack?._reason && (
                        <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid var(--mq-edge)" }}>
                          <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
                          <span className="text-[11px] leading-snug truncate" style={{ color: "var(--mq-text-muted)" }}>
                            {waveReasonText(currentTrack) || currentTrack._reason}
                          </span>
                        </div>
                      )}

                      {/* Tab content */}
                      <div className="flex-1 min-h-0 overflow-y-auto" data-scrollable="true">
                        {panelTab === "queue" && (
                          <div className="py-2">
                            {/* Now playing */}
                            {currentTrack && (
                              <div className="px-3 pb-2">
                                <p className="mq-text-eyebrow text-[11px] uppercase tracking-widest px-1 pb-2" style={{ color: "var(--mq-text-muted)" }}>Сейчас играет</p>
                                <div className="flex items-center gap-3 px-2.5 py-2 rounded-xl" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 8%, transparent)" }}>
                                  <div className="w-10 h-10 rounded-[var(--mq-r-art)] overflow-hidden flex-shrink-0 mq-art">
                                    {currentTrack.cover ? (
                                      <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} /></div>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</p>
                                    <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{currentTrack.artist}</p>
                                  </div>
                                  {isPlaying && (
                                    <div className="flex items-end gap-[3px] h-4 flex-shrink-0" aria-hidden="true">
                                      <span className="w-[3px] h-full rounded-sm" style={{ transformOrigin: "bottom", backgroundColor: "var(--mq-accent)", animation: "playerEq0 0.9s ease-in-out infinite alternate" }} />
                                      <span className="w-[3px] h-full rounded-sm" style={{ transformOrigin: "bottom", backgroundColor: "var(--mq-accent)", animation: "playerEq1 0.8s ease-in-out infinite alternate" }} />
                                      <span className="w-[3px] h-full rounded-sm" style={{ transformOrigin: "bottom", backgroundColor: "var(--mq-accent)", animation: "playerEq2 1s ease-in-out infinite alternate" }} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Upcoming */}
                            <div className="px-4 flex items-center justify-between pb-1">
                              <p className="mq-text-eyebrow text-[11px] uppercase tracking-widest" style={{ color: "var(--mq-text-muted)" }}>{radioMode ? "Волна · далее" : "Далее"}</p>
                            </div>
                            {upcomingAll.length === 0 ? (
                              <div className="px-4 py-8 text-center">
                                <ListMusic className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--mq-text-muted)", opacity: 0.5 }} />
                                <p className="text-xs leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
                                  {radioMode ? "Волна подберёт следующий трек автоматически" : "Очередь пуста — добавь треки из поиска или плейлистов"}
                                </p>
                              </div>
                            ) : (
                              <div className="px-2">
                                {upcomingAll.map((track, i) => (
                                  <button
                                    key={track.id + "_q_" + i}
                                    onClick={() => { playTrack?.(track, queue); }}
                                    className="mq-row !min-h-[52px] w-full text-left"
                                    title={track.title}
                                  >
                                    <div className="w-10 h-10 rounded-[var(--mq-r-art)] overflow-hidden flex-shrink-0 mq-art">
                                      {track.cover ? <img src={track.cover} alt="" className="w-full h-full object-cover" />
                                        : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} /></div>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>{track.title}</p>
                                      <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{track.artist}</p>
                                      {radioMode && track._reason && (
                                        <p className="text-[11px] truncate" style={{ color: "var(--mq-accent)", opacity: 0.75 }}>{waveReasonText(track) || track._reason}</p>
                                      )}
                                    </div>
                                    <span className="text-[11px] font-mono" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(track.duration)}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {panelTab === "lyrics" && (
                          <div className="px-2 py-3">
                            {lyricsLoading ? (
                              <div className="flex items-center gap-2 py-8 justify-center">
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
                          </div>
                        )}

                        {panelTab === "history" && (
                          <div className="py-2">
                            {recentAll.length === 0 ? (
                              <div className="px-4 py-8 text-center">
                                <History className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--mq-text-muted)", opacity: 0.5 }} />
                                <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>История пуста</p>
                              </div>
                            ) : (
                              <div className="px-2">
                                <p className="mq-text-eyebrow text-[11px] uppercase tracking-widest px-2 pb-1" style={{ color: "var(--mq-text-muted)" }}>Недавно играло</p>
                                {recentAll.map((track, i) => (
                                  <button
                                    key={track.id + "_h_" + i}
                                    onClick={() => { playTrack?.(track, [track]); }}
                                    className="mq-row !min-h-[52px] w-full text-left"
                                    title={track.title}
                                  >
                                    <div className="w-10 h-10 rounded-[var(--mq-r-art)] overflow-hidden flex-shrink-0 mq-art">
                                      {track.cover ? <img src={track.cover} alt="" className="w-full h-full object-cover" />
                                        : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} /></div>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>{track.title}</p>
                                      <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{track.artist}</p>
                                    </div>
                                    <span className="text-[11px] font-mono" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(track.duration)}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </aside>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    <ShareSheet
      isOpen={showShareSheet}
      onClose={() => setShowShareSheet(false)}
      url={typeof window !== "undefined" && currentTrack ? `${window.location.origin}/track/${currentTrack.scTrackId || currentTrack.id}` : ""}
      title={currentTrack?.title || ""}
      subtitle={currentTrack?.artist}
      cover={currentTrack?.cover}
    />
    </>
  );
}
