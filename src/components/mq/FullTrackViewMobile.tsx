"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import {
  Play, Pause, SkipBack, SkipForward, ChevronDown, Heart,
  Shuffle, Repeat, Repeat1, Volume2,
  Music, ListMusic, Share2, Loader2, Clock, Mic2,
  ThumbsDown, AirVent, Gauge, Timer,
  History, X,
} from "lucide-react";
import { getAudioElement } from "@/lib/audioEngine";
import { formatDuration } from "@/lib/musicApi";
import type { Track } from "@/lib/musicApi";
import { toast } from "@/hooks/use-toast";

// ═════════════════════════════════════════════════════════════════════════
// FULL TRACK VIEW — MOBILE
// Ultra-lightweight: minimal animations, RAF-driven progress bar,
// no Framer Motion drag, no parallax, no heart burst.
// Designed for 60fps on mid-range Android devices.
// ═════════════════════════════════════════════════════════════════════════

interface SyncedLyricLine {
  time: number;
  text: string;
}

// ── Synced lyrics (pure DOM, no per-frame React update) ────────────────
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

  // Update active line directly via DOM (no setState)
  useEffect(() => {
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= currentTime) idx = i;
      else break;
    }
    if (idx === lastActiveIdx.current) return;
    lastActiveIdx.current = idx;

    // Update styles via classList — much faster than React re-render
    lineRefs.current.forEach((el, i) => {
      if (!el) return;
      const isActive = i === idx;
      const isPast = i < idx;
      el.style.color = isActive
        ? "var(--mq-text)"
        : isPast
        ? "color-mix(in srgb, var(--mq-text-muted) 50%, transparent)"
        : "var(--mq-text-muted)";
      el.style.fontWeight = isActive ? "600" : "400";
      el.style.fontSize = isActive ? "1.05rem" : "0.95rem";
      el.style.opacity = isActive ? "1" : isPast ? "0.55" : "0.7";
      el.style.background = isActive ? "color-mix(in srgb, var(--mq-accent) 8%, transparent)" : "transparent";
    });

    // Auto-scroll to active line
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
      className="text-base leading-relaxed max-h-[40vh] overflow-y-auto px-2 py-2 space-y-1"
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
          className="block w-full text-left px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
          style={{ color: "var(--mq-text-muted)", fontWeight: 400, fontSize: "0.95rem" }}
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
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showSleepMenu, setShowSleepMenu] = useState(false);

  // Refs for direct DOM manipulation (avoid re-renders)
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressTimeRef = useRef<HTMLSpanElement>(null);
  const seekFeedbackRef = useRef<HTMLDivElement>(null);

  // ── RAF-driven progress bar update (no React state) ───────────────────
  useEffect(() => {
    if (!isOpen) return;
    let rafId = 0;
    const update = () => {
      // Read progress from store via getState (no subscription)
      const p = useAppStore.getState().progress;
      const d = useAppStore.getState().duration;
      if (d > 0 && progressFillRef.current) {
        const pct = (p / d) * 100;
        progressFillRef.current.style.width = `${pct}%`;
      }
      if (progressTimeRef.current) {
        progressTimeRef.current.textContent = formatDuration(p);
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [isOpen]);

  // ── Seek handlers ──────────────────────────────────────────────────────
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

  // ── Swipe-to-close on cover only (not whole screen) ────────────────────
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

    // Swipe down → close
    if (dy > 80 && dy > Math.abs(dx) * 1.5 && dt < 600) {
      setOpen(false);
      return;
    }
    // Swipe left/right → change track
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2 && dt < 500) {
      if (dx < 0) nextTrack();
      else prevTrack();
    }
  }, [setOpen, nextTrack, prevTrack]);

  // ── Double-tap to seek ±10s ────────────────────────────────────────────
  const lastTapRef = useRef<{ time: number; side: "left" | "right" }>({ time: 0, side: "left" });
  const handleCoverTap = useCallback((e: React.TouchEvent) => {
    const clientX = e.touches[0].clientX;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const isLeft = clientX < rect.left + rect.width / 2;
    const now = Date.now();
    const side = isLeft ? "left" : "right";

    if (now - lastTapRef.current.time < 300 && lastTapRef.current.side === side) {
      // Double tap — seek ±10s
      const seekAmount = isLeft ? -10 : 10;
      const audio = getAudioElement();
      const d = useAppStore.getState().duration;
      const p = useAppStore.getState().progress;
      if (audio && audio.src && d > 0) {
        audio.currentTime = Math.max(0, Math.min(d, audio.currentTime + seekAmount));
        setProgress(Math.max(0, Math.min(d, p + seekAmount)));
      }
      // Show feedback (CSS only, no state)
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
    setShowSpeedMenu(false);
  }, [setPlaybackRate]);

  // ── Sleep timer ─────────────────────────────────────────────────────────
  const sleepOptions = [5, 10, 15, 30, 45, 60];
  const handleSleepSet = useCallback((minutes: number) => {
    startSleepTimer(minutes);
    setShowSleepMenu(false);
    toast({ title: `Таймер сна: ${minutes} мин` });
  }, [startSleepTimer, toast]);

  // ── Derived (minimal — only what's needed for render) ──────────────────
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

  // Common button style — pure CSS, no motion wrapper
  const btnBase: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: "9999px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    border: "none",
    cursor: "pointer",
    transition: "transform 0.1s ease, background-color 0.15s ease",
    flexShrink: 0,
    padding: 0,
  };

  return (
    <div
      className="fixed inset-0 z-[100]"
      style={{
        background: currentTrack.cover
          ? `linear-gradient(180deg, color-mix(in srgb, var(--mq-accent) 15%, var(--mq-bg)) 0%, var(--mq-bg) 50%)`
          : "var(--mq-bg)",
        animation: "mqMobileOpen 0.25s ease-out",
        willChange: "transform",
      }}
    >
      <style>{`
        @keyframes mqMobileOpen {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .mq-btn-active:active { transform: scale(0.92); }
        .mq-panel { animation: mqPanelIn 0.2s ease-out; }
        @keyframes mqPanelIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Blurred cover background */}
      {currentTrack.cover && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <img
            src={currentTrack.cover}
            alt=""
            className="w-full h-full object-cover"
            style={{ filter: "blur(60px) saturate(180%)", opacity: 0.2, transform: "scale(1.2)" }}
          />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, transparent 0%, var(--mq-bg) 60%)" }} />
        </div>
      )}

      <div className="relative z-10 h-full flex flex-col">
        {/* ── Header ── */}
        <div className="flex items-center justify-between p-4 pt-[max(16px,env(safe-area-inset-top))]">
          <button
            onClick={() => setOpen(false)}
            style={btnBase}
            className="mq-btn-active"
            aria-label="Закрыть"
          >
            <ChevronDown className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
          </button>
          <div className="text-center min-w-0 flex-1 mx-3">
            <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--mq-text-muted)" }}>
              {radioMode ? "Волна" : "Играет"}
            </p>
            <p className="text-xs font-medium truncate" style={{ color: "var(--mq-text-muted)" }}>
              {currentTrack.album || currentTrack.artist}
            </p>
          </div>
          <button
            onClick={handleShare}
            style={btnBase}
            className="mq-btn-active"
            aria-label="Поделиться"
          >
            <Share2 className="w-4 h-4" style={{ color: "var(--mq-text)" }} />
          </button>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 flex flex-col items-center justify-start px-5 pb-6 overflow-y-auto">
          {/* Cover */}
          <div
            className="relative flex-shrink-0 mb-5"
            style={{ width: "min(78vw, 340px)", aspectRatio: "1 / 1" }}
            onTouchStart={(e) => { handleCoverTouchStart(e); handleCoverTap(e); }}
            onTouchEnd={handleCoverTouchEnd}
          >
            <div
              className="w-full h-full rounded-3xl overflow-hidden relative"
              style={{ boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}
            >
              {currentTrack.cover ? (
                <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" />
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
                backgroundColor: "rgba(0,0,0,0.7)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                opacity: 0,
                transition: "opacity 0.2s ease",
              }}
            />
            {/* Double-tap hint */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] pointer-events-none" style={{ color: "rgba(255,255,255,0.3)" }}>
              ← двойной тап → · смахни вниз чтобы закрыть
            </div>
          </div>

          {/* Track info */}
          <div className="w-full text-center mb-4">
            <h1 className="text-2xl font-bold mb-1 truncate" style={{ color: "var(--mq-text)" }}>
              {currentTrack.title}
            </h1>
            <button
              onClick={handleArtistClick}
              className="text-base hover:underline"
              style={{ color: "var(--mq-text-muted)" }}
            >
              {currentTrack.artist}
            </button>
            <div className="flex items-center justify-center gap-2 mt-1.5 text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
              {duration > 0 && (
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(duration)}</span>
              )}
              {currentTrack.genre && <span>·</span>}
              {currentTrack.genre && <span className="truncate max-w-[120px]">{currentTrack.genre}</span>}
              {playbackRate !== 1 && <span>·</span>}
              {playbackRate !== 1 && <span className="flex items-center gap-1"><Gauge className="w-3 h-3" />{playbackRate}x</span>}
              {sleepTimerActive && <span>·</span>}
              {sleepTimerActive && (
                <span className="flex items-center gap-1" style={{ color: "var(--mq-accent)" }}><Timer className="w-3 h-3" />{sleepRemainingMin}м</span>
              )}
            </div>
          </div>

          {/* Action buttons row */}
          <div className="flex items-center gap-2 mb-3 flex-wrap justify-center">
            <button
              onClick={handleLike}
              style={{ ...btnBase, backgroundColor: isLiked ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }}
              className="mq-btn-active"
              aria-label="Нравится"
            >
              <Heart className="w-4 h-4" style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }} fill={isLiked ? "currentColor" : "none"} />
            </button>
            <button
              onClick={handleDislike}
              style={{ ...btnBase, backgroundColor: isDisliked ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)" }}
              className="mq-btn-active"
              aria-label="Не нравится"
            >
              <ThumbsDown className="w-4 h-4" style={{ color: isDisliked ? "#ef4444" : "var(--mq-text-muted)" }} fill={isDisliked ? "currentColor" : "none"} />
            </button>
            <div style={{ width: 1, height: 20, backgroundColor: "var(--mq-border-thin)", margin: "0 4px" }} />
            <button
              onClick={() => setActivePanel(p => p === "queue" ? null : "queue")}
              style={{ ...btnBase, backgroundColor: activePanel === "queue" ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }}
              className="mq-btn-active"
              aria-label="Очередь"
            >
              <ListMusic className="w-4 h-4" style={{ color: activePanel === "queue" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
            </button>
            <button
              onClick={() => setActivePanel(p => p === "lyrics" ? null : "lyrics")}
              style={{ ...btnBase, backgroundColor: activePanel === "lyrics" ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }}
              className="mq-btn-active"
              aria-label="Текст песни"
            >
              <Mic2 className="w-4 h-4" style={{ color: activePanel === "lyrics" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
            </button>
            <button
              onClick={() => setActivePanel(p => p === "history" ? null : "history")}
              style={{ ...btnBase, backgroundColor: activePanel === "history" ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }}
              className="mq-btn-active"
              aria-label="История"
            >
              <History className="w-4 h-4" style={{ color: activePanel === "history" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
            </button>
            <div style={{ width: 1, height: 20, backgroundColor: "var(--mq-border-thin)", margin: "0 4px" }} />
            <button
              onClick={() => setSpatialAudioEnabled(!spatialAudioEnabled)}
              style={{ ...btnBase, backgroundColor: spatialAudioEnabled ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }}
              className="mq-btn-active"
              aria-label="Пространственное аудио"
            >
              <AirVent className="w-4 h-4" style={{ color: spatialAudioEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
            </button>
            <button
              onClick={() => { setShowSpeedMenu(!showSpeedMenu); setShowSleepMenu(false); }}
              style={{ ...btnBase, backgroundColor: playbackRate !== 1 ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }}
              className="mq-btn-active"
              aria-label="Скорость"
            >
              <span className="text-[10px] font-bold" style={{ color: playbackRate !== 1 ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>{playbackRate}x</span>
            </button>
            <button
              onClick={() => { setShowSleepMenu(!showSleepMenu); setShowSpeedMenu(false); }}
              style={{ ...btnBase, backgroundColor: sleepTimerActive ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.06)" }}
              className="mq-btn-active relative"
              aria-label="Таймер сна"
            >
              <Timer className="w-4 h-4" style={{ color: sleepTimerActive ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
              {sleepTimerActive && (
                <span className="absolute -bottom-0.5 -right-0.5 text-[8px] font-mono px-1 rounded-full" style={{ background: "var(--mq-accent)", color: "#fff" }}>{sleepRemainingMin}м</span>
              )}
            </button>
          </div>

          {/* Speed menu */}
          {showSpeedMenu && (
            <div className="mq-panel w-full mb-3 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>Скорость:</span>
              {speedOptions.map(speed => (
                <button
                  key={speed}
                  onClick={() => handleSpeedChange(speed)}
                  className="mq-btn-active px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: playbackRate === speed ? "var(--mq-accent)" : "var(--mq-card)",
                    color: playbackRate === speed ? "#fff" : "var(--mq-text-muted)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {speed}x
                </button>
              ))}
            </div>
          )}

          {/* Sleep timer menu */}
          {showSleepMenu && (
            <div className="mq-panel w-full mb-3 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>Сон через:</span>
              {sleepOptions.map(min => (
                <button
                  key={min}
                  onClick={() => handleSleepSet(min)}
                  className="mq-btn-active px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: "var(--mq-card)",
                    color: "var(--mq-text-muted)",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {min} мин
                </button>
              ))}
              {sleepTimerActive && (
                <button
                  onClick={() => { stopSleepTimer(); setShowSleepMenu(false); toast({ title: "Таймер отменён" }); }}
                  className="mq-btn-active px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#ef4444", border: "none", cursor: "pointer" }}
                >
                  Отменить
                </button>
              )}
            </div>
          )}

          {/* Panel: Lyrics */}
          {activePanel === "lyrics" && (
            <div className="mq-panel w-full mb-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--mq-text-muted)" }}>Текст песни</p>
                <button onClick={() => setActivePanel(null)} style={{ ...btnBase, width: 24, height: 24 }}>
                  <X className="w-3 h-3" style={{ color: "var(--mq-text-muted)" }} />
                </button>
              </div>
              {lyricsLoading ? (
                <div className="flex items-center gap-2 py-6 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-accent)" }} />
                  <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Поиск...</span>
                </div>
              ) : lyrics.length > 0 ? (
                <SyncedLyrics lines={lyrics} currentTime={progress} onSeek={seekToTime} />
              ) : plainLyrics ? (
                <div className="text-sm leading-relaxed whitespace-pre-wrap max-h-[40vh] overflow-y-auto p-3 rounded-xl" style={{ color: "var(--mq-text-muted)", backgroundColor: "rgba(255,255,255,0.03)" }}>
                  {plainLyrics}
                </div>
              ) : (
                <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>Текст не найден</p>
              )}
            </div>
          )}

          {/* Panel: Queue */}
          {activePanel === "queue" && (
            <div className="mq-panel w-full mb-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--mq-text-muted)" }}>Далее в очереди</p>
                <button onClick={() => setActivePanel(null)} style={{ ...btnBase, width: 24, height: 24 }}>
                  <X className="w-3 h-3" style={{ color: "var(--mq-text-muted)" }} />
                </button>
              </div>
              {upcoming.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>Очередь пуста</p>
              ) : (
                <div className="space-y-1 max-h-[40vh] overflow-y-auto">
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
              )}
            </div>
          )}

          {/* Panel: History */}
          {activePanel === "history" && (
            <div className="mq-panel w-full mb-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--mq-text-muted)" }}>Недавно играло</p>
                <button onClick={() => setActivePanel(null)} style={{ ...btnBase, width: 24, height: 24 }}>
                  <X className="w-3 h-3" style={{ color: "var(--mq-text-muted)" }} />
                </button>
              </div>
              {recent.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>История пуста</p>
              ) : (
                <div className="space-y-1 max-h-[40vh] overflow-y-auto">
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
              )}
            </div>
          )}

          {/* Progress bar (RAF-updated fill, no per-second React update) */}
          <div className="w-full mb-4">
            <div
              ref={progressBarRef}
              className="h-1.5 rounded-full cursor-pointer relative mb-2"
              onTouchStart={handleProgressTouch}
              style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
            >
              <div
                ref={progressFillRef}
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: duration > 0 ? `${(progress / duration) * 100}%` : "0%",
                  backgroundColor: "var(--mq-accent)",
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

          {/* Main controls */}
          <div className="flex items-center justify-center gap-5 mb-6">
            <button
              onClick={toggleShuffle}
              className="mq-btn-active"
              style={{ width: 36, height: 36, borderRadius: "9999px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer" }}
              aria-label="Перемешать"
            >
              <Shuffle className="w-5 h-5" style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
            </button>
            <button
              onClick={prevTrack}
              className="mq-btn-active"
              style={{ width: 48, height: 48, borderRadius: "9999px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer" }}
              aria-label="Предыдущий"
            >
              <SkipBack className="w-7 h-7" style={{ color: "var(--mq-text)" }} fill="currentColor" />
            </button>
            <button
              onClick={togglePlay}
              className="mq-btn-active"
              style={{
                width: 72,
                height: 72,
                borderRadius: "9999px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "var(--mq-accent)",
                boxShadow: "0 8px 24px color-mix(in srgb, var(--mq-accent) 40%, transparent)",
                border: "none",
                cursor: "pointer",
              }}
              aria-label="Play/Pause"
            >
              {isLoading ? <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#fff" }} />
                : isPlaying ? <Pause className="w-7 h-7" fill="#fff" style={{ color: "#fff" }} />
                : <Play className="w-7 h-7 ml-1" fill="#fff" style={{ color: "#fff" }} />}
            </button>
            <button
              onClick={nextTrack}
              className="mq-btn-active"
              style={{ width: 48, height: 48, borderRadius: "9999px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer" }}
              aria-label="Следующий"
            >
              <SkipForward className="w-7 h-7" style={{ color: "var(--mq-text)" }} fill="currentColor" />
            </button>
            <button
              onClick={toggleRepeat}
              className="mq-btn-active"
              style={{ width: 36, height: 36, borderRadius: "9999px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer" }}
              aria-label="Повтор"
            >
              {repeat === "one" ? <Repeat1 className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
                : <Repeat className="w-5 h-5" style={{ color: repeat === "all" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />}
            </button>
          </div>

          {/* Volume slider (simple native input for performance) */}
          <div className="flex items-center gap-2 w-full max-w-xs">
            <button
              onClick={() => setVolume(volume > 0 ? 0 : 70)}
              className="mq-btn-active"
              style={{ width: 32, height: 32, borderRadius: "9999px", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer" }}
              aria-label="Mute"
            >
              {volume === 0 ? <Volume2 className="w-4 h-4" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} /> :
               volume < 50 ? <Volume2 className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} /> :
               <Volume2 className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 h-1.5 rounded-full cursor-pointer"
              style={{ accentColor: "var(--mq-accent)" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
