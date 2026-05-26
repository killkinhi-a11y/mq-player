"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence, useSpring } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Volume1, Repeat, Repeat1,
  Shuffle, Music, Loader2, ListMusic,
  Heart, ThumbsDown, Share2,
} from "lucide-react";
import ContextMenu from "./ContextMenu";
import { initSpatialAudio, enableSpatialAudio, setMoodPreset, detectMoodFromTrack } from "@/lib/spatialAudio";
import { formatDuration } from "@/lib/musicApi";
import type { Track } from "@/lib/musicApi";
import Image from "next/image";
import { getAudioElement, getInactiveAudio } from "@/lib/audioEngine";
import QueueView from "./QueueView";
import { useAudioEngine, generateWaveformPeaks } from "./useAudioEngine";
import { useMediaSession } from "./useMediaSession";
import { useProgressDrag } from "./useProgressDrag";
import VisualizerCanvas from "./VisualizerCanvas";

function ShareButton({ scTrackId }: { scTrackId: number }) {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/track/${scTrackId}`;
    // Try Web Share API first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({ title: "mq — трек", url });
        return;
      } catch {
        // User cancelled or error — fall back to clipboard
      }
    }
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [scTrackId]);

  return (
    <div className="relative p-1 flex-shrink-0 flex items-center justify-center">
      <motion.button whileTap={{ scale: 0.85 }} onClick={handleShare}
        style={{ color: "var(--mq-text-muted)" }} title="Поделиться">
        <Share2 className="w-4 h-4" />
      </motion.button>
      {copied && (
        <span
          className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded whitespace-nowrap"
          style={{ background: "var(--mq-accent)", color: "#fff" }}
        >
          Скопировано!
        </span>
      )}
    </div>
  );
}

function MagneticPlayButton({ children, onClick, className, style, disabled }: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}) {
  const contentX = useSpring(0, { stiffness: 400, damping: 25 });
  const contentY = useSpring(0, { stiffness: 400, damping: 25 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const strength = 0.35;
    contentX.set((e.clientX - cx) * strength);
    contentY.set((e.clientY - cy) * strength);
  }, [contentX, contentY]);

  const handleMouseLeave = useCallback(() => {
    contentX.set(0);
    contentY.set(0);
  }, [contentX, contentY]);

  return (
    <motion.button
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={className}
      style={style}
      disabled={disabled}
    >
      <motion.span style={{ x: contentX, y: contentY, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {children}
      </motion.span>
    </motion.button>
  );
}

export default function PlayerBar() {
  const {
    currentTrack, isPlaying, volume, progress, duration,
    shuffle, repeat, togglePlay, nextTrack, prevTrack,
    setVolume, setProgress, setDuration, toggleShuffle, toggleRepeat,
    animationsEnabled, compactMode,
    setFullTrackViewOpen,
    setPlaybackMode, requestShowSimilar, requestShowLyrics,
    toggleLike, toggleDislike, likedTrackIds, dislikedTrackIds,
    upNext, currentStyle, styleVariant, radioMode, smartShuffle, toggleRadioMode,
    spatialAudioEnabled, setSpatialAudioEnabled, setSpatialMood, spatialAutoDetect, spatialMood,
    setSelectedArtist, currentView,
    abRepeat, setAbRepeatPoint, clearAbRepeat,
    miniPlayerHidden, setMiniPlayerHidden,
    playbackRate, setPlaybackRate,
  } = useAppStore();

  const [showQueue, setShowQueue] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Context menu state (right-click on track info)
  const [contextMenu, setContextMenu] = useState<{ track: Track; x: number; y: number } | null>(null);

  // Close queue panel when navigating to main
  useEffect(() => {
    if (currentView === "main") setShowQueue(false);
  }, [currentView]);

  // Handle right-click context menu on track info
  const handleTrackContextMenu = useCallback((e: React.MouseEvent) => {
    if (!currentTrack) return;
    e.preventDefault();
    setContextMenu({ track: currentTrack, x: e.clientX, y: e.clientY });
  }, [currentTrack]);

  const speedMenuRef = useRef<HTMLDivElement>(null);

  // Close speed menu on outside click
  useEffect(() => {
    if (!showSpeedMenu) return;
    const handler = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSpeedMenu]);

  // ── Extracted hooks ──
  const engine = useAudioEngine({
    currentTrack, isPlaying, volume, playbackRate,
    setProgress, setDuration, setPlaybackMode,
    togglePlay, nextTrack, prevTrack,
    miniPlayerHidden, setMiniPlayerHidden,
  });

  const progressDrag = useProgressDrag({
    progressRef: engine.progressRef,
    duration,
  });

  useMediaSession({
    currentTrack, isPlaying, progress, duration, playbackRate,
  });

  // ── Waveform peaks (memoized per track) ──
  const waveformPeaks = useMemo(
    () => (currentTrack?.id ? generateWaveformPeaks(currentTrack.id) : []),
    [currentTrack?.id],
  );

  // ── Hover timestamp tooltip state ──
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);

  const handleProgressHover = useCallback((e: React.MouseEvent) => {
    if (!engine.progressRef.current || !duration) return;
    const rect = engine.progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    setHoverTime(pct * duration);
    setHoverX(e.clientX - rect.left);
  }, [duration, engine.progressRef]);

  // ── Mobile swipe gestures ──
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const SWIPE_THRESHOLD = 50; // min px for swipe

  // ── Gesture hint overlay (first time only) ──
  const [showSwipeHint, setShowSwipeHint] = useState(() => {
    if (typeof window === "undefined") return false;
    return !localStorage.getItem("mq-swipe-hint-seen");
  });

  useEffect(() => {
    if (showSwipeHint) {
      const t = setTimeout(() => {
        setShowSwipeHint(false);
        localStorage.setItem("mq-swipe-hint-seen", "1");
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [showSwipeHint]);

  // ── Spatial Audio: auto-detect mood when track changes ──
  useEffect(() => {
    if (!spatialAudioEnabled || !spatialAutoDetect || !currentTrack) return;
    const mood = detectMoodFromTrack(currentTrack.title, currentTrack.genre);
    setMoodPreset(mood);
    setSpatialMood(mood);
  }, [currentTrack?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Spatial Audio: enable/disable ──
  useEffect(() => {
    if (spatialAudioEnabled) {
      const ok = initSpatialAudio();
      if (ok) {
        enableSpatialAudio(true);
        if (currentTrack) {
          const mood = detectMoodFromTrack(currentTrack.title, currentTrack.genre);
          setMoodPreset(mood);
          setSpatialMood(mood);
        }
      }
    } else {
      enableSpatialAudio(false);
    }
    return () => { enableSpatialAudio(false); };
  }, [spatialAudioEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Volume mouse wheel — works on the whole player bar (native listener) ──────────────
  const volumeSectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = engine.playerBarRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -2 : 2;
      useAppStore.getState().setVolume(Math.round(Math.max(0, Math.min(100, useAppStore.getState().volume + delta))));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [engine.playerBarRef]);

  // ── Volume remember & mute toggle ──────────────────────
  const prevVolumeRef = useRef(70);
  const [isVolumeDragging, setIsVolumeDragging] = useState(false);
  const isVolumeDraggingRef = useRef(false); // ref for drag logic (avoids re-renders during drag)
  // Direct DOM refs for lag-free volume dragging (bypass React re-renders)
  const volumeTrackRef = useRef<HTMLDivElement>(null);
  const volumeThumbRef = useRef<HTMLDivElement>(null);
  const volumePctRef = useRef<number | null>(null); // latest volume during drag
  const volumeSliderWidthRef = useRef(96); // cache slider width for translateX pixel calc
  const [volumeTooltipPct, setVolumeTooltipPct] = useState<number | null>(null); // for tooltip display during drag

  // Keep prevVolumeRef in sync when volume changes (non-zero)
  useEffect(() => {
    if (volume > 0) prevVolumeRef.current = volume;
  }, [volume]);

  const handleMuteToggle = useCallback(() => {
    if (volume > 0) {
      prevVolumeRef.current = volume;
      setVolume(0);
    } else {
      setVolume(prevVolumeRef.current || 70);
    }
  }, [volume, setVolume]);

  // ── Volume drag — direct DOM width manipulation for reliable sync ───
  const updateVolumeDOM = useCallback((pct: number) => {
    // Directly set width on fill bar and left position on thumb
    // This avoids the scaleX vs width conflict that was causing visual bugs
    if (volumeTrackRef.current) {
      volumeTrackRef.current.style.width = `${pct}%`;
      volumeTrackRef.current.style.transition = "none";
    }
    if (volumeThumbRef.current) {
      volumeThumbRef.current.style.left = `${pct}%`;
      volumeThumbRef.current.style.transition = "none";
    }
    volumePctRef.current = pct;
    // Update audio volume in real-time for immediate feedback (quadratic curve)
    const vol = Math.pow(pct / 100, 2);
    const audio = getAudioElement();
    if (audio) audio.volume = vol;
    const secondary = getInactiveAudio();
    if (secondary) secondary.volume = vol;
  }, []);

  const seekVolumeTo = useCallback((clientX: number) => {
    if (!engine.volumeRef.current) return;
    const rect = engine.volumeRef.current.getBoundingClientRect();
    volumeSliderWidthRef.current = rect.width; // cache for translateX calc
    const x = clientX - rect.left;
    const pct = Math.round(Math.max(0, Math.min(100, (x / rect.width) * 100)));
    updateVolumeDOM(pct);
  }, [updateVolumeDOM, engine.volumeRef]);

  const handleVolumeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isVolumeDraggingRef.current = true;
    setIsVolumeDragging(true);
    seekVolumeTo(e.clientX);
    const onMove = (ev: MouseEvent) => {
      seekVolumeTo(ev.clientX);
      // Update tooltip with current drag value
      if (volumePctRef.current !== null) {
        setVolumeTooltipPct(volumePctRef.current);
      }
    };
    const onUp = () => {
      isVolumeDraggingRef.current = false;
      setIsVolumeDragging(false);
      setVolumeTooltipPct(null);
      // Commit the final volume to the store
      if (volumePctRef.current !== null) {
        setVolume(volumePctRef.current);
        volumePctRef.current = null;
      }
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [seekVolumeTo, setVolume]);

  const handleVolumeTouchStart = useCallback((e: React.TouchEvent) => {
    isVolumeDraggingRef.current = true;
    setIsVolumeDragging(true);
    seekVolumeTo(e.touches[0].clientX);
    const onMove = (ev: TouchEvent) => {
      ev.preventDefault();
      seekVolumeTo(ev.touches[0].clientX);
      if (volumePctRef.current !== null) {
        setVolumeTooltipPct(volumePctRef.current);
      }
    };
    const onEnd = () => {
      isVolumeDraggingRef.current = false;
      setIsVolumeDragging(false);
      setVolumeTooltipPct(null);
      if (volumePctRef.current !== null) {
        setVolume(volumePctRef.current);
        volumePctRef.current = null;
      }
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
  }, [seekVolumeTo, setVolume]);

  // Volume icon helper
  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  // ── Volume hover / mobile popup / mute tooltip state ─────
  const [showMobileVolumePopup, setShowMobileVolumePopup] = useState(false);
  const [showMuteTooltip, setShowMuteTooltip] = useState(false);
  const mobileVolumeAutoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const verticalVolumeRef = useRef<HTMLDivElement>(null);

  // ── Volume scroll wheel with quadratic curve ─────────────
  const handleVolumeWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -1 : 1;
    // Quadratic curve for perceptual linear volume change
    const currentVol = useAppStore.getState().volume;
    const perceptual = Math.pow(currentVol / 100, 2) * 100;
    const newPerceptual = Math.max(0, Math.min(100, perceptual + delta * 5));
    const newVolume = Math.round(Math.pow(newPerceptual / 100, 0.5) * 100);
    setVolume(Math.max(0, Math.min(100, newVolume)));
  }, [setVolume]);

  // ── Mobile volume popup toggle ──────────────────────────
  const toggleMobileVolumePopup = useCallback(() => {
    setShowMobileVolumePopup(prev => {
      if (!prev) {
        // Opening: set auto-close timer
        if (mobileVolumeAutoCloseRef.current) clearTimeout(mobileVolumeAutoCloseRef.current);
        mobileVolumeAutoCloseRef.current = setTimeout(() => {
          setShowMobileVolumePopup(false);
        }, 3000);
      } else {
        // Closing: clear timer
        if (mobileVolumeAutoCloseRef.current) {
          clearTimeout(mobileVolumeAutoCloseRef.current);
          mobileVolumeAutoCloseRef.current = null;
        }
      }
      return !prev;
    });
  }, []);

  // Reset auto-close timer on volume interaction in mobile popup
  const resetMobileAutoClose = useCallback(() => {
    if (mobileVolumeAutoCloseRef.current) clearTimeout(mobileVolumeAutoCloseRef.current);
    mobileVolumeAutoCloseRef.current = setTimeout(() => {
      setShowMobileVolumePopup(false);
    }, 3000);
  }, []);

  // ── Vertical volume drag (mobile popup) ─────────────────
  const handleVerticalVolumeStart = useCallback((clientY: number) => {
    if (!verticalVolumeRef.current) return;
    const rect = verticalVolumeRef.current.getBoundingClientRect();
    const y = clientY - rect.top;
    const pct = Math.max(0, Math.min(100, (1 - y / rect.height) * 100));
    setVolume(Math.round(pct));
    resetMobileAutoClose();
  }, [setVolume, resetMobileAutoClose]);

  const handleVerticalVolumeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsVolumeDragging(true);
    handleVerticalVolumeStart(e.clientY);
    const onMove = (ev: MouseEvent) => handleVerticalVolumeStart(ev.clientY);
    const onUp = () => {
      setIsVolumeDragging(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [handleVerticalVolumeStart]);

  const handleVerticalVolumeTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    setIsVolumeDragging(true);
    handleVerticalVolumeStart(e.touches[0].clientY);
    const onMove = (ev: TouchEvent) => {
      ev.preventDefault();
      handleVerticalVolumeStart(ev.touches[0].clientY);
    };
    const onEnd = () => {
      setIsVolumeDragging(false);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    };
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
  }, [handleVerticalVolumeStart]);

  // ── Mute with tooltip ───────────────────────────────────
  const handleMuteToggleWithTooltip = useCallback(() => {
    handleMuteToggle();
    setShowMuteTooltip(true);
    setTimeout(() => setShowMuteTooltip(false), 1200);
  }, [handleMuteToggle]);

  // ── Render ──────────────────────────────────────────────
  // ── Swipe-down gesture handler (improved for mobile) ──
  const swipeStartY = useRef(0);
  const swipeStartX = useRef(0);
  const [swipeY, setSwipeY] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    swipeStartY.current = e.touches[0].clientY;
    swipeStartX.current = e.touches[0].clientX;
    setIsSwiping(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dy = e.touches[0].clientY - swipeStartY.current;
    const dx = Math.abs(e.touches[0].clientX - swipeStartX.current);
    // Only allow downward swipe if mostly vertical
    if (dy > 0 && dy > dx * 0.5) {
      setSwipeY(dy);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    setIsSwiping(false);
    if (swipeY > 40) {
      setMiniPlayerHidden(true);
    }
    setSwipeY(0);
  }, [swipeY, setMiniPlayerHidden]);

  if (!currentTrack) return null;

  const progressPct = duration > 0 ? Math.min((progress / duration) * 100, 100) : 0;
  const isLiked = (Array.isArray(likedTrackIds) ? likedTrackIds : []).includes(currentTrack.id);
  const isDisliked = (Array.isArray(dislikedTrackIds) ? dislikedTrackIds : []).includes(currentTrack.id);

  return (
    <>
      {/* ── Floating mini-player restore bar (visible when player is hidden) ── */}
      <AnimatePresence>
        {miniPlayerHidden && currentTrack && (
          <motion.button
            key="mini-player-restore"
            initial={{ y: 60, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 60, opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 450, damping: 28 }}
            onClick={() => setMiniPlayerHidden(false)}
            className="fixed z-[60] left-3 right-3 flex items-center gap-3 pl-2 pr-3 py-2.5 rounded-2xl cursor-pointer sm:hidden"
            style={{
              bottom: "calc(58px + env(safe-area-inset-bottom, 8px))",
              backgroundColor: "var(--mq-player-bg)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.5), 0 0 24px color-mix(in srgb, var(--mq-accent) 10%, transparent)",
              backdropFilter: "blur(40px) saturate(200%)",
              WebkitBackdropFilter: "blur(40px) saturate(200%)",
            }}
            aria-label="Показать плеер"
          >
            {currentTrack.cover ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 25, delay: 0.05 }}
                className="flex-shrink-0"
              >
                <Image src={currentTrack.cover} alt="" width={40} height={40} className="w-10 h-10 rounded-xl object-cover" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }} unoptimized />
              </motion.div>
            ) : (
              <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)", opacity: 0.4 }}>
                <Music className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold truncate leading-tight" style={{ color: "var(--mq-text)" }}>
                {currentTrack.title}
              </p>
              {currentTrack.artist && (
                <p className="text-[11px] truncate leading-snug" style={{ color: "var(--mq-text-muted)" }}>
                  {currentTrack.artist}
                </p>
              )}
            </div>
            <motion.span
              whileTap={{ scale: 0.85 }}
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
              style={{ color: "var(--mq-accent)" }}
            >
              {isPlaying ? <Pause className="w-[18px] h-[18px]" fill="currentColor" /> : <Play className="w-[18px] h-[18px] ml-[1px]" fill="currentColor" />}
            </motion.span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--mq-text-muted)", opacity: 0.4, flexShrink: 0 }}>
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── Premium Bottom Player Bar ── */}
      {/* ══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {!miniPlayerHidden && (
          <motion.div
            key="player-bar"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: isSwiping ? swipeY * 0.5 : 0, opacity: isSwiping ? Math.max(0, 1 - swipeY / 200) : 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={!isSwiping ? { type: "spring", stiffness: 350, damping: 30 } : { duration: 0 }}
            className="fixed z-[55] left-0 right-0 mobile-player-above-nav"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            ref={engine.playerBarRef}
            data-tour="player"
            role="region"
            aria-label="Плеер"
          >
            <div
              className="relative w-full"
              style={{
                backgroundColor: "var(--mq-player-bg)",
                backdropFilter: "blur(40px) saturate(200%)",
                WebkitBackdropFilter: "blur(40px) saturate(200%)",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                boxShadow: "0 -8px 40px rgba(0,0,0,0.3)",
                borderRadius: "16px 16px 0 0",
                // NOTE: do NOT use contain:layout or contain:paint here — it clips Portal-rendered menus (context menu, more menu)
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
                overflow: "visible",
              }}
            >
              {/* ── Visualizer canvas ── */}
              <VisualizerCanvas currentStyle={currentStyle} styleVariant={styleVariant} trackId={currentTrack?.id} />
              {/* ── Mobile drag handle — tap to minimize ── */}
              <button
                className="sm:hidden flex justify-center pt-2 pb-2 w-full cursor-pointer bg-transparent border-none active:opacity-60"
                onClick={() => setMiniPlayerHidden(true)}
                aria-label="Свернуть плеер"
                style={{ minHeight: 28 }}
              >
                <motion.div
                  initial={{ scaleX: 0.5, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30, delay: 0.1 }}
                  whileTap={{ scaleX: 0.6 }}
                  className="rounded-full"
                  style={{
                    width: 36,
                    height: 4,
                    backgroundColor: "rgba(255,255,255,0.25)",
                    borderRadius: 2,
                  }}
                />
              </button>
              {/* ── Clean progress bar with floating timestamp tooltip ── */}
              <div
                ref={engine.progressRef}
                onMouseDown={progressDrag.handleProgressMouseDown}
                onTouchStart={progressDrag.handleProgressTouchStart}
                onMouseMove={handleProgressHover}
                onMouseLeave={() => setHoverTime(null)}
                className="w-full group/progress"
                style={{
                  height: 24,
                  cursor: "pointer",
                  touchAction: "none",
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 16px",
                  overflow: "visible",
                }}
              >
                <div
                  className="w-full relative"
                  style={{
                    height: 3,
                    borderRadius: 2,
                    backgroundColor: "rgba(255,255,255,0.08)",
                    transition: "height 0.15s ease",
                    overflow: "visible",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.height = "5px";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.height = "3px";
                  }}
                >
                  {/* Hover timestamp tooltip */}
                  {hoverTime !== null && !progressDrag.isDragging && (() => {
                    const rect = engine.progressRef.current?.getBoundingClientRect();
                    const barLeft = rect ? rect.left + 16 : 0; // account for padding
                    const barWidth = rect ? rect.width - 32 : 300;
                    const hoverPx = (hoverTime / (duration || 1)) * barWidth;
                    const clampedLeft = Math.max(20, Math.min(barWidth - 20, hoverPx));
                    return (
                      <div
                        style={{
                          position: "fixed",
                          left: barLeft + clampedLeft,
                          bottom: rect ? window.innerHeight - rect.top + 8 : undefined,
                          transform: "translateX(-50%)",
                          padding: "4px 10px",
                          borderRadius: 8,
                          backgroundColor: "var(--mq-accent)",
                          color: "#fff",
                          fontSize: 12,
                          fontWeight: 600,
                          fontFamily: "var(--font-geist-mono), monospace",
                          whiteSpace: "nowrap",
                          boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
                          pointerEvents: "none",
                          zIndex: 100,
                          letterSpacing: "0.02em",
                        }}
                      >
                        {formatDuration(Math.floor(hoverTime))}
                      </div>
                    );
                  })()}
                  {/* Clean fill bar */}
                  <div
                    ref={progressDrag.progressFillRef}
                    className="h-full"
                    style={{
                      width: `${progressPct}%`,
                      background: engine.playError
                        ? "#ef4444"
                        : "var(--mq-accent)",
                      transition: progressDrag.isDragging ? "none" : "width 0.3s linear",
                      borderRadius: 2,
                      boxShadow: engine.playError
                        ? "none"
                        : "0 0 6px color-mix(in srgb, var(--mq-accent) 30%, transparent)",
                      position: "relative",
                    }}
                  />
                  {/* ── Visible thumb dot — always visible when dragging, hover otherwise ── */}
                  <div
                    ref={progressDrag.progressThumbRef}
                    className="absolute top-1/2 rounded-full"
                    style={{
                      width: progressDrag.isDragging ? 16 : 12,
                      height: progressDrag.isDragging ? 16 : 12,
                      left: `${progressPct}%`,
                      transform: "translate(-50%, -50%)",
                      backgroundColor: "#fff",
                      boxShadow: "0 0 0 3px var(--mq-accent), 0 2px 8px rgba(0,0,0,0.4)",
                      pointerEvents: "none",
                      zIndex: 3,
                      opacity: progressDrag.isDragging ? 1 : 0,
                      transition: progressDrag.isDragging ? "none" : "opacity 0.15s ease, transform 0.15s ease",
                    }}
                  />
                  <div
                    className="absolute top-1/2 rounded-full opacity-0 group-hover/progress:opacity-100"
                    style={{
                      width: 12,
                      height: 12,
                      left: `${progressPct}%`,
                      transform: "translate(-50%, -50%)",
                      backgroundColor: "#fff",
                      boxShadow: "0 0 0 2px var(--mq-accent), 0 2px 6px rgba(0,0,0,0.3)",
                      pointerEvents: "none",
                      zIndex: 3,
                      transition: "opacity 0.15s ease",
                    }}
                  />
                </div>
                {/* ── Drag timestamp — fixed-position floating label during drag ── */}
                {progressDrag.isDragging && (() => {
                  const rect = engine.progressRef.current?.getBoundingClientRect();
                  const barLeft = rect ? rect.left + 16 : 0;
                  const barWidth = rect ? rect.width - 32 : 300;
                  const thumbPx = (progressPct / 100) * barWidth;
                  const clampedLeft = Math.max(24, Math.min(barWidth - 24, thumbPx));
                  return (
                    <div
                      ref={progressDrag.progressTimeRef}
                      style={{
                        position: "fixed",
                        left: barLeft + clampedLeft,
                        bottom: rect ? window.innerHeight - rect.top + 8 : undefined,
                        transform: "translateX(-50%)",
                        padding: "5px 12px",
                        borderRadius: 10,
                        backgroundColor: "var(--mq-accent)",
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 700,
                        fontFamily: "var(--font-geist-mono), monospace",
                        whiteSpace: "nowrap",
                        boxShadow: "0 6px 20px rgba(0,0,0,0.5), 0 0 16px color-mix(in srgb, var(--mq-accent) 30%, transparent)",
                        pointerEvents: "none",
                        zIndex: 100,
                        letterSpacing: "0.03em",
                      }}
                    >
                      {formatDuration(Math.floor((progressPct / 100) * duration))}
                    </div>
                  );
                })()}
              </div>

              {/* ── Desktop: Main content row — clean modern design ── */}
              <div className="hidden sm:flex items-center justify-between px-4 relative z-10" style={{ minHeight: 56, paddingTop: 2, paddingBottom: 4 }}>

                {/* ═══ LEFT (30%): Cover + Track info — stagger entrance ═══ */}
                <div className="flex items-center gap-3 min-w-0 w-[30%]" onContextMenu={handleTrackContextMenu}>
                  {/* Cover art — spring entrance + hover scale */}
                  <motion.button
                    onClick={(e) => {
                      if (e.button === 0) setFullTrackViewOpen(true);
                    }}
                    className="flex-shrink-0 cursor-pointer p-0"
                    style={{ background: "none", border: "none" }}
                    aria-label="Открыть плеер"
                    whileTap={{ scale: 0.92 }}
                  >
                    <motion.div
                      className="relative overflow-hidden"
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 10,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                      }}
                      initial={{ scale: 0.85, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 25 }}
                      whileHover={{ scale: 1.05 }}
                    >
                      {currentTrack.cover ? (
                        <Image src={currentTrack.cover} alt="" width={48} height={48} className="w-full h-full object-cover" unoptimized />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)", opacity: 0.4 }}>
                          <Music className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
                        </div>
                      )}
                    </motion.div>
                  </motion.button>

                  {/* Title + Artist — stagger entrance (x: -8 → 0, delay: 40ms) */}
                  <motion.div
                    className="min-w-0"
                    initial={{ x: -8, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 28, delay: 0.04 }}
                  >
                    <p className="text-[13px] font-medium truncate leading-tight" style={{ color: "var(--mq-text)" }}>
                      {currentTrack.title}
                    </p>
                    <span
                      onClick={() => { if (currentTrack.artist) setSelectedArtist({ name: currentTrack.artist }); }}
                      className="text-[11px] truncate leading-snug block cursor-pointer hover:underline"
                      style={{ color: "var(--mq-text-muted)" }}
                    >
                      {currentTrack.artist}
                    </span>
                  </motion.div>
                </div>

                {/* ═══ CENTER (40%): Transport Controls — stagger entrance (y: 8 → 0, delay: 80ms) ═══ */}
                <motion.div
                  className="flex flex-col items-center justify-center flex-shrink-0 w-[40%]"
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 28, delay: 0.08 }}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    {/* Shuffle */}
                    <motion.button
                      whileTap={{ scale: 0.8 }}
                      onClick={toggleShuffle}
                      className="w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-200"
                      style={{
                        color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)",
                      }}
                      aria-label="Перемешать"
                    >
                      <Shuffle className="w-4 h-4" />
                    </motion.button>

                    {/* Prev */}
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      onClick={engine.handlePrevTrack}
                      className="w-9 h-9 flex items-center justify-center rounded-full transition-colors duration-200"
                      style={{ color: "var(--mq-text)" }}
                      aria-label="Предыдущий трек"
                    >
                      <SkipBack className="w-5 h-5" fill="currentColor" />
                    </motion.button>

                    {/* Play/Pause — accent spring circle with rotate overshoot */}
                    <motion.button
                      whileTap={{ scale: 0.88 }}
                      whileHover={{ scale: 1.05 }}
                      onClick={togglePlay}
                      className="rounded-full flex items-center justify-center"
                      style={{
                        width: 42,
                        height: 42,
                        backgroundColor: "var(--mq-accent)",
                        color: "#fff",
                        boxShadow: "0 2px 12px color-mix(in srgb, var(--mq-accent) 40%, transparent)",
                        transition: "background-color 0.2s, box-shadow 0.2s",
                      }}
                      disabled={engine.isLoadingTrack}
                      aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
                    >
                      <motion.div
                        key={isPlaying ? "playing" : "paused"}
                        initial={{ scale: 0.7, rotate: -15 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 22 }}
                      >
                        {engine.isLoadingTrack ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : isPlaying ? (
                          <Pause className="w-5 h-5" fill="currentColor" />
                        ) : (
                          <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
                        )}
                      </motion.div>
                    </motion.button>

                    {/* Next */}
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      onClick={() => {
                        const st = useAppStore.getState();
                        if (st.currentTrack?.id) st.recordSkip(st.currentTrack.id, st.progress || 0);
                        nextTrack();
                      }}
                      className="w-9 h-9 flex items-center justify-center rounded-full transition-colors duration-200"
                      style={{ color: "var(--mq-text)" }}
                      aria-label="Следующий трек"
                    >
                      <SkipForward className="w-5 h-5" fill="currentColor" />
                    </motion.button>

                    {/* Repeat */}
                    <motion.button
                      whileTap={{ scale: 0.8 }}
                      onClick={toggleRepeat}
                      className="w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-200"
                      style={{
                        color: repeat !== "off" ? "var(--mq-accent)" : "var(--mq-text-muted)",
                      }}
                      aria-label="Повтор"
                    >
                      {repeat === "one" ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                    </motion.button>
                  </div>
                </motion.div>

                {/* ═══ RIGHT (30%): Volume + Actions — stagger entrance (delay: 60ms) ═══ */}
                <motion.div
                  className="flex items-center justify-end flex-shrink-0 gap-0.5 w-[30%]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.06 }}
                >
                  {/* Volume (desktop) */}
                  <div className="flex items-center gap-1 mr-0.5">
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      onClick={handleMuteToggleWithTooltip}
                      className="w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-200"
                      style={{ color: "var(--mq-text-muted)" }}
                      aria-label={volume === 0 ? "Включить звук" : "Без звука"}
                    >
                      <VolumeIcon className="w-4 h-4" />
                    </motion.button>
                    <div
                      ref={engine.volumeRef}
                      onMouseDown={handleVolumeMouseDown}
                      onTouchStart={handleVolumeTouchStart}
                      onWheel={handleVolumeWheel}
                      className="rounded-full cursor-pointer relative group/vol"
                      style={{
                        width: 92,
                        height: 4,
                        backgroundColor: "rgba(255,255,255,0.1)",
                        borderRadius: 2,
                        transition: "height 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.height = "5px";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.height = "4px";
                      }}
                    >
                      {/* Volume fill */}
                      <div
                        ref={volumeTrackRef}
                        className="h-full rounded-full"
                        style={{
                          width: `${volume}%`,
                          background: "var(--mq-accent)",
                          borderRadius: 2,
                        }}
                      />
                      {/* Drag thumb */}
                      <div
                        ref={volumeThumbRef}
                        className="absolute top-1/2 rounded-full"
                        style={{
                          width: 12,
                          height: 12,
                          left: `${volume}%`,
                          transform: "translate(-50%, -50%)",
                          backgroundColor: "#fff",
                          boxShadow: "0 0 0 2px var(--mq-accent), 0 1px 4px rgba(0,0,0,0.3)",
                          pointerEvents: "none",
                          opacity: isVolumeDragging ? 1 : 0,
                          transition: isVolumeDragging ? "none" : "opacity 0.15s ease",
                        }}
                      />
                      {/* Hover thumb */}
                      <div
                        className="absolute top-1/2 rounded-full opacity-0 group-hover/vol:opacity-100"
                        style={{
                          width: 10,
                          height: 10,
                          left: `${volume}%`,
                          transform: "translate(-50%, -50%)",
                          backgroundColor: "#fff",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                          pointerEvents: "none",
                          transition: "opacity 0.15s ease",
                        }}
                      />
                    </div>
                    {/* Volume floating tooltip during drag */}
                    {isVolumeDragging && volumeTooltipPct !== null && (
                      <div
                        style={{
                          position: "fixed",
                          left: (() => {
                            const rect = engine.volumeRef.current?.getBoundingClientRect();
                            if (!rect) return 0;
                            const thumbPx = (volumeTooltipPct / 100) * rect.width;
                            return rect.left + Math.max(14, Math.min(rect.width - 14, thumbPx));
                          })(),
                          bottom: (() => {
                            const rect = engine.volumeRef.current?.getBoundingClientRect();
                            return rect ? window.innerHeight - rect.top + 12 : undefined;
                          })(),
                          transform: "translateX(-50%)",
                          padding: "3px 8px",
                          borderRadius: 6,
                          backgroundColor: "var(--mq-accent)",
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 600,
                          fontFamily: "var(--font-geist-mono), monospace",
                          whiteSpace: "nowrap",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                          pointerEvents: "none",
                          zIndex: 100,
                        }}
                      >
                        {volumeTooltipPct}%
                      </div>
                    )}
                  </div>

                  {/* Like — spring pulse overshoot */}
                  <motion.button
                    whileTap={{ scale: isLiked ? 0.6 : 0.8 }}
                    onClick={() => toggleLike(currentTrack.id, currentTrack)}
                    className="w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-200"
                    style={{ color: isLiked ? "#ef4444" : "var(--mq-text-muted)" }}
                    aria-label={isLiked ? "Убрать из избранного" : "Добавить в избранное"}
                    data-tour="like-dislike"
                  >
                    <motion.div
                      key={isLiked ? "liked" : "unliked"}
                      initial={{ scale: isLiked ? 1.4 : 0.8 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 20 }}
                    >
                      <Heart className={`w-4 h-4 ${isLiked ? "fill-current" : ""}`} />
                    </motion.div>
                  </motion.button>

                  {/* Dislike — spring pulse */}
                  <motion.button
                    whileTap={{ scale: isDisliked ? 0.6 : 0.8 }}
                    onClick={() => toggleDislike(currentTrack.id, currentTrack)}
                    className="w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-200"
                    style={{ color: isDisliked ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
                    aria-label={isDisliked ? "Убрать дизлайк" : "Не рекомендовать"}
                  >
                    <motion.div
                      key={isDisliked ? "disliked" : "neutral"}
                      initial={{ scale: isDisliked ? 1.3 : 0.8 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 20 }}
                    >
                      <ThumbsDown className={`w-4 h-4 ${isDisliked ? "fill-current" : ""}`} />
                    </motion.div>
                  </motion.button>

                  {/* Queue */}
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => setShowQueue(!showQueue)}
                    className="w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-200"
                    style={{
                      color: showQueue ? "var(--mq-accent)" : "var(--mq-text-muted)",
                    }}
                    aria-label="Очередь"
                  >
                    <ListMusic className="w-4 h-4" />
                  </motion.button>
                </motion.div>
              </div>

              {/* ── Mobile: Compact two-row layout with micro-animations ── */}
              <div className="sm:hidden px-3 relative z-10" style={{ paddingTop: 0, paddingBottom: 4 }} onContextMenu={handleTrackContextMenu}>
                {/* Row 1: Cover + Track info + Like */}
                <div className="flex items-center gap-2">
                  {/* Cover art — spring tap animation */}
                  <motion.button
                    onClick={() => setFullTrackViewOpen(true)}
                    className="flex-shrink-0 cursor-pointer p-0"
                    style={{ background: "none", border: "none" }}
                    aria-label="Открыть плеер"
                    whileTap={{ scale: 0.92 }}
                  >
                    <motion.div
                      className="relative overflow-hidden"
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 10,
                        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                      }}
                      initial={{ scale: 0.85, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 25 }}
                    >
                      {currentTrack.cover ? (
                        <Image src={currentTrack.cover} alt="" width={42} height={42} className="w-full h-full object-cover" unoptimized />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)", opacity: 0.4 }}>
                          <Music className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
                        </div>
                      )}
                    </motion.div>
                  </motion.button>

                  {/* Title + Artist — stagger entrance */}
                  <motion.div
                    className="min-w-0 flex-1"
                    initial={{ x: -8, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 28, delay: 0.04 }}
                  >
                    <p className="text-[13px] font-medium truncate leading-tight" style={{ color: "var(--mq-text)" }}>
                      {currentTrack.title}
                    </p>
                    <span className="text-[11px] truncate leading-snug block" style={{ color: "var(--mq-text-muted)" }}>
                      {currentTrack.artist}
                    </span>
                  </motion.div>

                  {/* Like — spring micro-interaction */}
                  <motion.button
                    whileTap={{ scale: isLiked ? 0.6 : 0.8 }}
                    onClick={() => toggleLike(currentTrack.id, currentTrack)}
                    className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full"
                    style={{ color: isLiked ? "#ef4444" : "var(--mq-text-muted)" }}
                    aria-label={isLiked ? "Убрать из избранного" : "Добавить в избранное"}
                    data-tour="like-dislike"
                  >
                    <motion.div
                      key={isLiked ? "liked" : "unliked"}
                      initial={{ scale: isLiked ? 1.4 : 0.8 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 20 }}
                    >
                      <Heart className={`w-[18px] h-[18px] ${isLiked ? "fill-current" : ""}`} />
                    </motion.div>
                  </motion.button>
                </div>

                {/* Row 2: Transport controls + time — stagger entrance */}
                <motion.div
                  className="flex items-center justify-between mt-1 mb-0.5"
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 28, delay: 0.08 }}
                >
                  {/* Time left */}
                  <span className="text-[10px] font-mono tabular-nums w-10 text-left" style={{ color: "var(--mq-text-muted)" }}>
                    {formatDuration(Math.floor(progress))}
                  </span>

                  {/* Transport controls */}
                  <div className="flex items-center gap-1">
                    {/* Prev — spring tap */}
                    <motion.button
                      whileTap={{ scale: 0.82 }}
                      onClick={engine.handlePrevTrack}
                      className="w-9 h-9 flex items-center justify-center rounded-full"
                      style={{ color: "var(--mq-text)" }}
                      aria-label="Предыдущий трек"
                    >
                      <SkipBack className="w-[18px] h-[18px]" fill="currentColor" />
                    </motion.button>

                    {/* Play/Pause — accent spring circle */}
                    <motion.button
                      whileTap={{ scale: 0.88 }}
                      onClick={togglePlay}
                      className="rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        width: 42,
                        height: 42,
                        backgroundColor: "var(--mq-accent)",
                        color: "#fff",
                        boxShadow: "0 2px 10px color-mix(in srgb, var(--mq-accent) 35%, transparent)",
                      }}
                      disabled={engine.isLoadingTrack}
                      aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
                    >
                      <motion.div
                        key={isPlaying ? "playing" : "paused"}
                        initial={{ scale: 0.7, rotate: -15 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 22 }}
                      >
                        {engine.isLoadingTrack ? (
                          <Loader2 className="w-[18px] h-[18px] animate-spin" />
                        ) : isPlaying ? (
                          <Pause className="w-[18px] h-[18px]" fill="currentColor" />
                        ) : (
                          <Play className="w-[18px] h-[18px] ml-0.5" fill="currentColor" />
                        )}
                      </motion.div>
                    </motion.button>

                    {/* Next — spring tap */}
                    <motion.button
                      whileTap={{ scale: 0.82 }}
                      onClick={() => {
                        const st = useAppStore.getState();
                        if (st.currentTrack?.id) st.recordSkip(st.currentTrack.id, st.progress || 0);
                        nextTrack();
                      }}
                      className="w-9 h-9 flex items-center justify-center rounded-full"
                      style={{ color: "var(--mq-text)" }}
                      aria-label="Следующий трек"
                    >
                      <SkipForward className="w-[18px] h-[18px]" fill="currentColor" />
                    </motion.button>
                  </div>

                  {/* Duration right */}
                  <span className="text-[10px] font-mono tabular-nums w-10 text-right" style={{ color: "var(--mq-text-muted)" }}>
                    {formatDuration(Math.floor(duration))}
                  </span>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Queue View */}
      <QueueView isOpen={showQueue} onClose={() => setShowQueue(false)} />

      {/* ── Right-click context menu on track info ── */}
      {contextMenu && (
        <ContextMenu
          track={contextMenu.track}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
