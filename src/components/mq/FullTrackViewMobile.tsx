"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import {
  Play, Pause, SkipBack, SkipForward, ChevronDown, Heart,
  Shuffle, Repeat, Repeat1, Volume2,
  Music, ListMusic, Share2, Loader2, Mic2,
  ThumbsDown, AirVent, Gauge, Timer,
  History, X, MoreHorizontal, Plus,
} from "lucide-react";
import { getAudioElement } from "@/lib/audioEngine";
import { formatDuration } from "@/lib/musicApi";
import type { Track } from "@/lib/musicApi";
import { toast } from "@/hooks/use-toast";
import VolumeSlider from "@/components/ui/volume-slider";

// ═════════════════════════════════════════════════════════════════════════
// FULL TRACK VIEW — MOBILE
// Compact, modern, Spotify-like layout.
// Ultra-lightweight: RAF-driven progress, CSS-only animations, no motion.
// ═════════════════════════════════════════════════════════════════════════

interface SyncedLyricLine {
  time: number;
  text: string;
}

// ── Synced lyrics (DOM-driven, no per-frame React update) ──────────────
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
  const lastActiveIdx = useRef(-1);

  useEffect(() => {
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= currentTime) idx = i;
      else break;
    }
    if (idx === lastActiveIdx.current) return;
    lastActiveIdx.current = idx;

    lineRefs.current.forEach((el, i) => {
      if (!el) return;
      const isActive = i === idx;
      const isPast = i < idx;
      el.style.color = isActive
        ? "var(--mq-text)"
        : isPast
        ? "color-mix(in srgb, var(--mq-text-muted) 50%, transparent)"
        : "var(--mq-text-muted)";
      el.style.fontWeight = isActive ? "700" : "400";
      el.style.fontSize = isActive ? "1.1rem" : "0.95rem";
      el.style.opacity = isActive ? "1" : isPast ? "0.55" : "0.7";
    });

    const container = containerRef.current;
    const lineEl = lineRefs.current[idx];
    if (container && lineEl) {
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
    }
  }, [currentTime, lines]);

  if (lines.length === 0) {
    return (
      <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>
        Текст не найден
      </p>
    );
  }

  return (
    <div
      ref={containerRef}
      className="text-base leading-relaxed max-h-[50vh] overflow-y-auto px-2 py-2 space-y-1"
      style={{
        scrollbarWidth: "thin",
        maskImage: "linear-gradient(180deg, transparent 0%, #000 12%, #000 88%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(180deg, transparent 0%, #000 12%, #000 88%, transparent 100%)",
      }}
    >
      {lines.map((line, i) => (
        <button
          key={i}
          ref={(el) => { lineRefs.current[i] = el; }}
          onClick={() => onSeek(line.time)}
          className="block w-full text-left px-2 py-1.5 rounded-lg cursor-pointer"
          style={{ color: "var(--mq-text-muted)", fontWeight: 400, fontSize: "0.95rem", transition: "color 0.2s, opacity 0.2s" }}
        >
          {line.text || "♪"}
        </button>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// MAIN MOBILE COMPONENT
// ═════════════════════════════════════════════════════════════════════════

export default function FullTrackViewMobile() {
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

  // Local UI state
  const [activePanel, setActivePanel] = useState<"queue" | "lyrics" | "history" | null>(null);
  const [lyrics, setLyrics] = useState<SyncedLyricLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState<string>("");
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Refs for direct DOM manipulation
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressThumbRef = useRef<HTMLDivElement>(null);
  const progressTimeRef = useRef<HTMLSpanElement>(null);
  const seekFeedbackRef = useRef<HTMLDivElement>(null);

  // ── SMOOTH progress (reads audio.currentTime directly = true 60fps) ──
  // Also updates thumb position and time label
  useEffect(() => {
    if (!isOpen) return;
    let rafId = 0;
    const update = () => {
      const audio = getAudioElement();
      if (audio && audio.src && audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        const pct = (audio.currentTime / audio.duration) * 100;
        if (progressFillRef.current) progressFillRef.current.style.width = `${pct}%`;
        if (progressThumbRef.current) progressThumbRef.current.style.left = `${pct}%`;
      }
      if (progressTimeRef.current) {
        const p = audio ? audio.currentTime : 0;
        const m = Math.floor(p / 60);
        const s = Math.floor(p % 60);
        progressTimeRef.current.textContent = `${m}:${s.toString().padStart(2, "0")}`;
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [isOpen]);

  // ── Seek ──────────────────────────────────────────────────────────────
  const seekTo = useCallback((clientX: number) => {
    if (!progressBarRef.current) return;
    const d = useAppStore.getState().duration;
    if (!d) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const time = (pct / 100) * d;
    const audio = getAudioElement();
    if (audio && audio.src) audio.currentTime = time;
    setProgress(time);
  }, [setProgress]);

  const seekToTime = useCallback((time: number) => {
    const audio = getAudioElement();
    if (audio && audio.src) audio.currentTime = time;
    setProgress(time);
  }, [setProgress]);

  const handleProgressTouch = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    seekTo(e.touches[0].clientX);
  }, [seekTo]);

  // ── Cover gestures: swipe down to close, swipe left/right to skip ────
  const coverTouchStart = useRef<{ x: number; y: number; t: number }>({ x: 0, y: 0, t: 0 });
  const handleCoverTouchStart = useCallback((e: React.TouchEvent) => {
    coverTouchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      t: Date.now(),
    };
  }, []);
  const handleCoverTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - coverTouchStart.current.x;
    const dy = e.changedTouches[0].clientY - coverTouchStart.current.y;
    const dt = Date.now() - coverTouchStart.current.t;

    if (dy > 80 && dy > Math.abs(dx) * 1.5 && dt < 600) {
      setOpen(false);
      return;
    }
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2 && dt < 500) {
      if (dx < 0) nextTrack();
      else prevTrack();
    }
  }, [setOpen, nextTrack, prevTrack]);

  // ── Double-tap to seek ±10s ───────────────────────────────────────────
  const lastTapRef = useRef<{ time: number; side: "left" | "right" }>({ time: 0, side: "left" });
  const handleCoverTap = useCallback((e: React.TouchEvent) => {
    const clientX = e.touches[0].clientX;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const isLeft = clientX < rect.left + rect.width / 2;
    const now = Date.now();
    const side = isLeft ? "left" : "right";

    if (now - lastTapRef.current.time < 300 && lastTapRef.current.side === side) {
      const seekAmount = isLeft ? -10 : 10;
      const audio = getAudioElement();
      const d = useAppStore.getState().duration;
      const p = useAppStore.getState().progress;
      if (audio && audio.src && d > 0) {
        audio.currentTime = Math.max(0, Math.min(d, audio.currentTime + seekAmount));
        setProgress(Math.max(0, Math.min(d, p + seekAmount)));
      }
      if (seekFeedbackRef.current) {
        seekFeedbackRef.current.style[side] = "20%";
        seekFeedbackRef.current.textContent = seekAmount > 0 ? `+${seekAmount}s` : `${seekAmount}s`;
        seekFeedbackRef.current.style.opacity = "1";
        clearTimeout((seekFeedbackRef.current as any)._timeout);
        (seekFeedbackRef.current as any)._timeout = setTimeout(() => {
          if (seekFeedbackRef.current) seekFeedbackRef.current.style.opacity = "0";
        }, 600);
      }
    }
    lastTapRef.current = { time: now, side };
  }, [setProgress]);

  // ── Actions ────────────────────────────────────────────────────────────
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

  // ── Playback speed ──────────────────────────────────────────────────────
  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackRate(speed);
    const audio = getAudioElement();
    if (audio) audio.playbackRate = speed;
    setShowMoreMenu(false);
  }, [setPlaybackRate]);

  // ── Sleep timer ─────────────────────────────────────────────────────────
  const sleepOptions = [5, 10, 15, 30, 45, 60];
  const handleSleepSet = useCallback((minutes: number) => {
    startSleepTimer(minutes);
    setShowMoreMenu(false);
    toast({ title: `Таймер сна: ${minutes} мин` });
  }, [startSleepTimer, toast]);

  // ── Derived ────────────────────────────────────────────────────────────
  const isLiked = currentTrack ? likedTrackIds.includes(currentTrack.id) : false;
  const isDisliked = currentTrack ? dislikedTrackIds.includes(currentTrack.id) : false;
  const isLoading = playbackState === "loading" || playbackState === "buffering";

  const upcoming = useMemo(() => {
    if (queue.length === 0) return [];
    return queue.slice(queueIndex + 1, queueIndex + 6);
  }, [queue, queueIndex]);

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
    if (!isOpen || !currentTrack || activePanel !== "lyrics") return;
    setLyrics([]);
    setPlainLyrics("");
    setLyricsLoading(true);
    const controller = new AbortController();
    fetch(`/api/music/lyrics?artist=${encodeURIComponent(currentTrack.artist)}&title=${encodeURIComponent(currentTrack.title)}`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => {
        if (Array.isArray(data.lyrics) && data.lyrics.length > 0) setLyrics(data.lyrics);
        else if (data.plainText) setPlainLyrics(data.plainText);
      })
      .catch(() => {})
      .finally(() => setLyricsLoading(false));
    return () => controller.abort();
  }, [activePanel, isOpen, currentTrack]);

  useEffect(() => {
    setLyrics([]);
    setPlainLyrics("");
  }, [currentTrack?.id]);

  const sleepRemainingMin = Math.ceil(sleepTimerRemaining / 60);

  if (!isOpen || !currentTrack) return null;

  // ── Inline button styles ───────────────────────────────────────────────
  const iconBtn: React.CSSProperties = {
    width: 36, height: 36,
    borderRadius: "9999px",
    display: "flex", alignItems: "center", justifyContent: "center",
    backgroundColor: "transparent",
    border: "none", cursor: "pointer", padding: 0,
    transition: "transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
  };

  return (
    <div
      className="fixed inset-0 z-[100]"
      style={{
        background: currentTrack.cover
          ? `linear-gradient(180deg, color-mix(in srgb, var(--mq-accent) 18%, var(--mq-bg)) 0%, var(--mq-bg) 55%)`
          : "var(--mq-bg)",
        animation: "mqMobileOpen 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        willChange: "transform",
      }}
    >
      <style>{`
        @keyframes mqMobileOpen {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .mq-btn-active {
          transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .mq-btn-active:active { transform: scale(0.9); }
        .mq-panel { animation: mqPanelIn 0.28s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes mqPanelIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .mq-sheet { animation: mqSheetIn 0.32s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes mqSheetIn {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .mq-cover-transition {
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease;
        }
      `}</style>

      {/* Blurred cover background */}
      {currentTrack.cover && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <img
            src={currentTrack.cover}
            alt=""
            className="w-full h-full object-cover"
            style={{ filter: "blur(30px) saturate(150%)", opacity: 0.15, transform: "scale(1.1)" }}
          />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 0%, var(--mq-bg) 60%)" }} />
        </div>
      )}

      <div className="relative z-10 h-full flex flex-col">
        {/* ── Compact header (no labels — just icons) ── */}
        <div
          className="flex items-center justify-between px-4"
          style={{ paddingTop: "max(12px, env(safe-area-inset-top))", paddingBottom: 8 }}
        >
          <button
            onClick={() => setOpen(false)}
            style={iconBtn}
            className="mq-btn-active"
            aria-label="Закрыть"
          >
            <ChevronDown className="w-6 h-6" style={{ color: "var(--mq-text)" }} />
          </button>
          <button
            onClick={() => setShowMoreMenu(true)}
            style={iconBtn}
            className="mq-btn-active"
            aria-label="Ещё"
          >
            <MoreHorizontal className="w-6 h-6" style={{ color: "var(--mq-text)" }} />
          </button>
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 flex flex-col px-5 pb-4">
          {/* Cover */}
          <div className="flex-1 flex items-center justify-center min-h-0 py-3">
            <div
              className="relative flex-shrink-0"
              style={{ width: "min(82vw, 360px)", aspectRatio: "1 / 1" }}
              onTouchStart={(e) => { handleCoverTouchStart(e); handleCoverTap(e); }}
              onTouchEnd={handleCoverTouchEnd}
            >
              <div
                className="w-full h-full rounded-2xl overflow-hidden relative"
                style={{ boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}
              >
                {currentTrack.cover ? (
                  <img
                    key={currentTrack.id}
                    src={currentTrack.cover}
                    alt=""
                    className="w-full h-full object-cover mq-cover-transition"
                    style={{ animation: "mqPanelIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}>
                    <Music className="w-16 h-16" style={{ color: "rgba(255,255,255,0.5)" }} />
                  </div>
                )}
              </div>
              {/* Seek feedback */}
              <div
                ref={seekFeedbackRef}
                className="absolute top-1/2 -translate-y-1/2 px-4 py-2 rounded-2xl pointer-events-none"
                style={{
                  backgroundColor: "rgba(0,0,0,0.75)",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  opacity: 0,
                  transition: "opacity 0.2s ease",
                }}
              />
            </div>
          </div>

          {/* Track info + like button */}
          <div className="flex items-start justify-between gap-3 mt-2 mb-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold truncate" style={{ color: "var(--mq-text)" }}>
                {currentTrack.title}
              </h1>
              <button
                onClick={handleArtistClick}
                className="text-sm hover:underline mt-0.5 block truncate"
                style={{ color: "var(--mq-text-muted)" }}
              >
                {currentTrack.artist}
              </button>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={handleLike}
                className="mq-btn-active"
                style={{ ...iconBtn, width: 40, height: 40, backgroundColor: isLiked ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.05)" }}
                aria-label="Нравится"
              >
                <Heart className="w-5 h-5" style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }} fill={isLiked ? "currentColor" : "none"} />
              </button>
              <button
                onClick={handleDislike}
                className="mq-btn-active"
                style={{ ...iconBtn, width: 40, height: 40, backgroundColor: isDisliked ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)" }}
                aria-label="Не нравится"
              >
                <ThumbsDown className="w-5 h-5" style={{ color: isDisliked ? "#ef4444" : "var(--mq-text-muted)" }} fill={isDisliked ? "currentColor" : "none"} />
              </button>
            </div>
          </div>

          {/* Progress bar (RAF-updated fill, no per-second React update) */}
          <div className="mb-3">
            <div
              ref={progressBarRef}
              className="h-1 rounded-full cursor-pointer relative mb-2"
              onTouchStart={handleProgressTouch}
              style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              <div
                ref={progressFillRef}
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: duration > 0 ? `${(progress / duration) * 100}%` : "0%",
                  backgroundColor: "var(--mq-accent)",
                  willChange: "width",
                  transform: "translateZ(0)",
                }}
              />
              <div
                ref={progressThumbRef}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full pointer-events-none"
                style={{
                  left: duration > 0 ? `${(progress / duration) * 100}%` : "0%",
                  backgroundColor: "#fff",
                  boxShadow: "0 0 0 4px color-mix(in srgb, var(--mq-accent) 30%, transparent)",
                  willChange: "left",
                  transform: "translateZ(0)",
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span ref={progressTimeRef} className="text-[11px] font-mono tabular-nums" style={{ color: "var(--mq-text-muted)" }}>
                {formatDuration(progress)}
              </span>
              <span className="text-[11px] font-mono tabular-nums" style={{ color: "var(--mq-text-muted)" }}>
                {formatDuration(duration)}
              </span>
            </div>
          </div>

          {/* Main controls row — big, comfortable */}
          <div className="flex items-center justify-between mb-4 px-2">
            {/* Shuffle */}
            <button
              onClick={toggleShuffle}
              className="mq-btn-active"
              style={{ ...iconBtn, width: 40, height: 40 }}
              aria-label="Перемешать"
            >
              <Shuffle className="w-5 h-5" style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
            </button>
            {/* Prev */}
            <button
              onClick={prevTrack}
              className="mq-btn-active"
              style={{ ...iconBtn, width: 48, height: 48 }}
              aria-label="Предыдущий"
            >
              <SkipBack className="w-7 h-7" style={{ color: "var(--mq-text)" }} fill="currentColor" />
            </button>
            {/* Play/Pause — big primary button */}
            <button
              onClick={togglePlay}
              className="mq-btn-active"
              style={{
                width: 72, height: 72,
                borderRadius: "9999px",
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: "#fff",
                boxShadow: "0 8px 24px rgba(255,255,255,0.25)",
                border: "none", cursor: "pointer", padding: 0,
                transition: "transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
              aria-label="Play/Pause"
            >
              {isLoading ? <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#000" }} />
                : isPlaying ? <Pause className="w-8 h-8" fill="#000" style={{ color: "#000" }} />
                : <Play className="w-8 h-8 ml-1" fill="#000" style={{ color: "#000" }} />}
            </button>
            {/* Next */}
            <button
              onClick={nextTrack}
              className="mq-btn-active"
              style={{ ...iconBtn, width: 48, height: 48 }}
              aria-label="Следующий"
            >
              <SkipForward className="w-7 h-7" style={{ color: "var(--mq-text)" }} fill="currentColor" />
            </button>
            {/* Repeat */}
            <button
              onClick={toggleRepeat}
              className="mq-btn-active"
              style={{ ...iconBtn, width: 40, height: 40 }}
              aria-label="Повтор"
            >
              {repeat === "one" ? <Repeat1 className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
                : <Repeat className="w-5 h-5" style={{ color: repeat === "all" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />}
            </button>
          </div>

          {/* Bottom row — secondary actions */}
          <div className="flex items-center justify-around pb-1">
            <button
              onClick={() => setActivePanel(p => p === "lyrics" ? null : "lyrics")}
              className="mq-btn-active flex flex-col items-center gap-1"
              style={{ ...iconBtn, width: "auto", height: "auto", flexDirection: "column", background: "transparent" }}
              aria-label="Текст песни"
            >
              <Mic2 className="w-5 h-5" style={{ color: activePanel === "lyrics" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
              <span className="text-[10px]" style={{ color: activePanel === "lyrics" ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>Текст</span>
            </button>
            <button
              onClick={() => setActivePanel(p => p === "queue" ? null : "queue")}
              className="mq-btn-active flex flex-col items-center gap-1"
              style={{ ...iconBtn, width: "auto", height: "auto", flexDirection: "column", background: "transparent" }}
              aria-label="Очередь"
            >
              <ListMusic className="w-5 h-5" style={{ color: activePanel === "queue" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
              <span className="text-[10px]" style={{ color: activePanel === "queue" ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>Очередь</span>
            </button>
            <button
              onClick={() => setActivePanel(p => p === "history" ? null : "history")}
              className="mq-btn-active flex flex-col items-center gap-1"
              style={{ ...iconBtn, width: "auto", height: "auto", flexDirection: "column", background: "transparent" }}
              aria-label="История"
            >
              <History className="w-5 h-5" style={{ color: activePanel === "history" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
              <span className="text-[10px]" style={{ color: activePanel === "history" ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>История</span>
            </button>
            <button
              onClick={handleShare}
              className="mq-btn-active flex flex-col items-center gap-1"
              style={{ ...iconBtn, width: "auto", height: "auto", flexDirection: "column", background: "transparent" }}
              aria-label="Поделиться"
            >
              <Share2 className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} />
              <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>Поделиться</span>
            </button>
          </div>
        </div>

        {/* ═══ PANELS (overlay slides up from bottom) ═══ */}
        {activePanel && (
          <div
            className="mq-panel absolute inset-0 z-20 flex flex-col"
            style={{
              background: "color-mix(in srgb, var(--mq-bg) 95%, transparent)",
              backdropFilter: "blur(30px)",
              WebkitBackdropFilter: "blur(30px)",
              paddingTop: "max(16px, env(safe-area-inset-top))",
            }}
          >
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-base font-semibold" style={{ color: "var(--mq-text)" }}>
                {activePanel === "lyrics" ? "Текст песни" : activePanel === "queue" ? "Очередь" : "Недавно играло"}
              </p>
              <button
                onClick={() => setActivePanel(null)}
                style={iconBtn}
                className="mq-btn-active"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {activePanel === "lyrics" && (
                lyricsLoading ? (
                  <div className="flex items-center gap-2 py-6 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-accent)" }} />
                    <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Поиск...</span>
                  </div>
                ) : lyrics.length > 0 ? (
                  <SyncedLyrics lines={lyrics} currentTime={progress} onSeek={seekToTime} />
                ) : plainLyrics ? (
                  <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--mq-text-muted)" }}>
                    {plainLyrics}
                  </div>
                ) : (
                  <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>Текст не найден</p>
                )
              )}

              {activePanel === "queue" && (
                upcoming.length === 0 ? (
                  <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>Очередь пуста</p>
                ) : (
                  <div className="space-y-1">
                    {upcoming.map((track, i) => (
                      <button
                        key={track.id + "_" + i}
                        onClick={() => { for (let j = 0; j <= i; j++) nextTrack(); setActivePanel(null); }}
                        className="mq-btn-active w-full flex items-center gap-3 p-2 rounded-xl text-left"
                        style={{ border: "none", cursor: "pointer", background: "transparent" }}
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
                )
              )}

              {activePanel === "history" && (
                recent.length === 0 ? (
                  <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>История пуста</p>
                ) : (
                  <div className="space-y-1">
                    {recent.map((track, i) => (
                      <button
                        key={track.id + "_h_" + i}
                        onClick={() => { playTrack?.(track, [track]); setActivePanel(null); }}
                        className="mq-btn-active w-full flex items-center gap-3 p-2 rounded-xl text-left"
                        style={{ border: "none", cursor: "pointer", background: "transparent" }}
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
                )
              )}
            </div>
          </div>
        )}

        {/* ═══ MORE MENU (slides up from bottom as a sheet) ═══ */}
        {showMoreMenu && (
          <>
            <div
              className="absolute inset-0 z-30"
              style={{ background: "rgba(0,0,0,0.5)", animation: "mqPanelIn 0.2s ease-out" }}
              onClick={() => setShowMoreMenu(false)}
            />
            <div
              className="mq-sheet absolute left-0 right-0 bottom-0 z-40 rounded-t-3xl p-5 pb-[max(20px,env(safe-area-inset-bottom))]"
              style={{
                background: "color-mix(in srgb, var(--mq-card) 95%, transparent)",
                backdropFilter: "blur(30px)",
                WebkitBackdropFilter: "blur(30px)",
                border: "1px solid var(--mq-border-thin)",
                boxShadow: "0 -10px 40px rgba(0,0,0,0.5)",
              }}
            >
              <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "rgba(255,255,255,0.15)" }} />

              {/* Track info at top of sheet */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                  {currentTrack.cover ? <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: "var(--mq-accent)" }} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</p>
                  <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{currentTrack.artist}</p>
                </div>
              </div>

              <div className="h-px mb-3" style={{ background: "var(--mq-border-thin)" }} />

              {/* Actions (dislike is now next to like in main view, not here) */}
              <button
                onClick={() => { setSpatialAudioEnabled(!spatialAudioEnabled); }}
                className="mq-btn-active w-full flex items-center gap-3 py-3"
                style={{ background: "transparent", border: "none", cursor: "pointer" }}
              >
                <AirVent className="w-5 h-5" style={{ color: spatialAudioEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                <span className="text-sm flex-1 text-left" style={{ color: "var(--mq-text)" }}>Пространственное аудио</span>
                <div
                  className="w-10 h-6 rounded-full relative transition-colors"
                  style={{ background: spatialAudioEnabled ? "var(--mq-accent)" : "rgba(255,255,255,0.15)" }}
                >
                  <div
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                    style={{ transform: spatialAudioEnabled ? "translateX(20px)" : "translateX(2px)" }}
                  />
                </div>
              </button>

              {/* Speed */}
              <div className="py-3">
                <div className="flex items-center gap-3 mb-2">
                  <Gauge className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} />
                  <span className="text-sm" style={{ color: "var(--mq-text)" }}>Скорость</span>
                  <span className="text-xs ml-auto" style={{ color: "var(--mq-text-muted)" }}>{playbackRate}x</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap pl-8">
                  {speedOptions.map(speed => (
                    <button
                      key={speed}
                      onClick={() => handleSpeedChange(speed)}
                      className="mq-btn-active px-3 py-1.5 rounded-full text-xs font-semibold"
                      style={{
                        backgroundColor: playbackRate === speed ? "var(--mq-accent)" : "var(--mq-input-bg)",
                        color: playbackRate === speed ? "#fff" : "var(--mq-text-muted)",
                        border: "none", cursor: "pointer",
                      }}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Sleep timer */}
              <div className="py-3">
                <div className="flex items-center gap-3 mb-2">
                  <Timer className="w-5 h-5" style={{ color: sleepTimerActive ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                  <span className="text-sm" style={{ color: "var(--mq-text)" }}>Таймер сна</span>
                  {sleepTimerActive && (
                    <span className="text-xs ml-auto" style={{ color: "var(--mq-accent)" }}>{sleepRemainingMin} мин</span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap pl-8">
                  {sleepOptions.map(min => (
                    <button
                      key={min}
                      onClick={() => handleSleepSet(min)}
                      className="mq-btn-active px-3 py-1.5 rounded-full text-xs font-semibold"
                      style={{
                        backgroundColor: "var(--mq-input-bg)",
                        color: "var(--mq-text-muted)",
                        border: "none", cursor: "pointer",
                      }}
                    >
                      {min} мин
                    </button>
                  ))}
                  {sleepTimerActive && (
                    <button
                      onClick={() => { stopSleepTimer(); setShowMoreMenu(false); toast({ title: "Таймер отменён" }); }}
                      className="mq-btn-active px-3 py-1.5 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#ef4444", border: "none", cursor: "pointer" }}
                    >
                      Отменить
                    </button>
                  )}
                </div>
              </div>

              {/* Volume */}
              <div className="py-3">
                <div className="flex items-center gap-3 mb-2">
                  <Volume2 className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} />
                  <span className="text-sm" style={{ color: "var(--mq-text)" }}>Громкость</span>
                  <span className="text-xs ml-auto" style={{ color: "var(--mq-text-muted)" }}>{Math.round(volume)}%</span>
                </div>
                <div className="pl-8">
                  <VolumeSlider volume={volume} onChange={setVolume} showIcon={false} className="w-full" />
                </div>
              </div>

              <div className="h-px my-2" style={{ background: "var(--mq-border-thin)" }} />

              <button
                onClick={() => { handleShare(); setShowMoreMenu(false); }}
                className="mq-btn-active w-full flex items-center gap-3 py-3"
                style={{ background: "transparent", border: "none", cursor: "pointer" }}
              >
                <Share2 className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} />
                <span className="text-sm" style={{ color: "var(--mq-text)" }}>Поделиться</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
