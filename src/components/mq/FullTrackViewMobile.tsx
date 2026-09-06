"use client";

import React, { useState, useRef, useCallback, useEffect, memo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { getAudioElement } from "@/lib/audioEngine";
import { seekPlayback, currentPlaybackPosition } from "@/lib/wasm-audio";
import { formatDuration } from "@/lib/musicApi";
import type { Track } from "@/lib/musicApi";
import { toast } from "@/hooks/use-toast";
import { Play, Pause, SkipBack, SkipForward, ChevronDown, ChevronUp, Heart, Shuffle, Repeat, Repeat1, Music, ListMusic, Share2, Loader2, Mic2, ThumbsDown, History, X, MoreHorizontal, Volume2, Timer, Gauge, AirVent, ListPlus, Sliders } from "lucide-react";

// ═════════════════════════════════════════════════════════════════════════
// FULL TRACK VIEW — MOBILE (2026-09 redesign)
//
// Premium mobile composition (NOT a shrunk desktop):
//   header: close ▽ · context label · more ⋯
//   dominant artwork (ambient accent glow, no blur — GPU-cheap)
//   2-line title + artist link
//   action row: like · dislike · add-to-playlist (44px targets)
//   seek (28px touch, 16px thumb) + tabular times
//   transport: shuffle 44 · prev 56 · PLAY 76 (accent) · next 56 · repeat 44
//   chips: Текст · Очередь · История · Поделиться
//
// PERFORMANCE RULES (unchanged):
// 1. NO layout-affecting animations — transform/opacity only.
// 2. Progress fill = CSS gradient var (--mq-seek-pct), NOT width reflow.
// 3. Time labels update only when the second changes.
// 4. Position source is PLAYBACK-ROUTED: currentPlaybackPosition() reads the
//    WASM engine stats when wasm owns playback and the <audio> element
//    otherwise. The old code read audio.currentTime directly → on the WASM
//    path (the default backend) the bar and clock were FROZEN at 0:00.
// 5. Cover fixed square, object-cover, no parallax.
// 6. Buttons use CSS :active, no JS state.
// 7. Open animation translateY 250ms only.
// ═════════════════════════════════════════════════════════════════════════

interface SyncedLine { time: number; text: string; }

function SyncedLyrics({ lines, onSeek }: { lines: SyncedLine[]; onSeek: (t: number) => void }) {
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const progress = useAppStore((s) => s.progress);
  const activeIdx = (() => {
    let idx = -1;
    for (let i = 0; i < lines.length; i++) { if (lines[i].time <= progress) idx = i; }
    return idx;
  })();
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIdx]);
  return (
    <div className="text-base leading-relaxed max-h-full overflow-y-auto px-2 py-2 space-y-1 scroll-smooth">
      {lines.map((l, i) => (
        <button
          key={i}
          ref={i === activeIdx ? activeRef : null}
          onClick={() => onSeek(l.time)}
          className="block w-full text-left px-2 py-1.5 rounded-lg transition-all duration-300 cursor-pointer"
          style={{
            color: i === activeIdx ? "var(--mq-text)" : "var(--mq-text-muted)",
            opacity: i === activeIdx ? 1 : 0.62,
            transform: i === activeIdx ? "scale(1)" : "scale(0.985)",
            fontWeight: i === activeIdx ? 600 : 400,
            background: "transparent",
            border: "none",
          }}
        >
          {l.text}
        </button>
      ))}
    </div>
  );
}

function EscapeHandler({ active, onEscape }: { active: boolean; onEscape: () => void }) {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onEscape(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [active, onEscape]);
  return null;
}

function FullTrackViewMobileInner() {
  const isOpen = useAppStore((s) => s.isFullTrackViewOpen);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
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
  const spatialAudioEnabled = useAppStore((s) => s.spatialAudioEnabled);
  const setSpatialAudioEnabled = useAppStore((s) => s.setSpatialAudioEnabled);
  const setEqOpen = useAppStore((s) => s.setEqOpen);
  const eqEnabled = useAppStore((s) => s.eqEnabled);
  const eqPreset = useAppStore((s) => s.eqPreset);
  const playbackRate = useAppStore((s) => s.playbackRate);
  const setPlaybackRate = useAppStore((s) => s.setPlaybackRate);
  const sleepTimerActive = useAppStore((s) => s.sleepTimerActive);
  const sleepTimerRemaining = useAppStore((s) => s.sleepTimerRemaining);
  const startSleepTimer = useAppStore((s) => s.startSleepTimer);
  const stopSleepTimer = useAppStore((s) => s.stopSleepTimer);

  const [panel, setPanel] = useState<"queue" | "lyrics" | "history" | null>(null);
  const [lyrics, setLyrics] = useState<SyncedLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState("");
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);

  // ── Refs for progress ──
  const seekInputRef = useRef<HTMLInputElement>(null);
  const timeCurrentRef = useRef<HTMLSpanElement>(null);
  const timeRemainingRef = useRef<HTMLSpanElement>(null);
  const isDraggingRef = useRef(false);
  // Latest duration without re-creating the RAF loop on every track:
  const durationRef = useRef(duration);
  durationRef.current = duration;

  // ── RAF: update seek input + time label (WASM-aware position source) ──
  useEffect(() => {
    if (!isOpen) return;
    let rafId = 0;
    let lastSecond = -1;

    const tick = () => {
      if (!isDraggingRef.current) {
        // currentPlaybackPosition() routes: WASM stats when the wasm backend
        // owns playback, <audio>.currentTime otherwise. Reading the element
        // directly froze the bar at 0:00 on the wasm path.
        const pos = currentPlaybackPosition();
        const dur = durationRef.current || 0;
        if (dur > 0 && isFinite(pos) && pos >= 0) {
          const pct = Math.min(100, (pos / dur) * 100);
          if (seekInputRef.current && document.activeElement !== seekInputRef.current) {
            seekInputRef.current.value = String(pct);
            seekInputRef.current.style.setProperty("--mq-seek-pct", `${pct}%`);
          }
          const sec = Math.floor(pos);
          if (sec !== lastSecond && timeCurrentRef.current) {
            lastSecond = sec;
            timeCurrentRef.current.textContent = formatDuration(sec);
            if (timeRemainingRef.current) {
              timeRemainingRef.current.textContent = "−" + formatDuration(Math.max(0, dur - sec));
            }
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isOpen]);

  // ── Seek: visual-only during drag, commit on release ──
  const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    isDraggingRef.current = true;
    e.target.style.setProperty("--mq-seek-pct", `${v}%`);
  }, []);

  const commitSeek = useCallback((e: React.PointerEvent<HTMLInputElement>) => {
    const v = Number(e.currentTarget.value);
    isDraggingRef.current = false;
    e.currentTarget.style.setProperty("--mq-seek-pct", `${v}%`);
    const audio = getAudioElement();
    const dur = audio?.duration && isFinite(audio.duration) ? audio.duration : (durationRef.current || 0);
    if (dur > 0) {
      seekPlayback((v / 100) * dur);
      setProgress((v / 100) * dur);
    }
  }, [setProgress]);

  const seekToTime = useCallback((time: number) => {
    seekPlayback(time);
    setProgress(time);
  }, [setProgress]);

  // ── Cover gestures: swipe down=close, swipe left/right=skip ──
  const coverSwipe = useRef({ x: 0, y: 0, t: 0 });
  const handleCoverTouchStart = useCallback((e: React.TouchEvent) => {
    coverSwipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, []);
  const handleCoverTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - coverSwipe.current.x;
    const dy = e.changedTouches[0].clientY - coverSwipe.current.y;
    const dt = Date.now() - coverSwipe.current.t;
    if (dy > 80 && dy > Math.abs(dx) * 1.5 && dt < 600) { setOpen(false); return; }
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2 && dt < 500) { if (dx < 0) nextTrack(); else prevTrack(); }
  }, [setOpen, nextTrack, prevTrack]);

  const isLiked = currentTrack ? likedTrackIds.includes(currentTrack.id) : false;
  const isDisliked = currentTrack ? dislikedTrackIds.includes(currentTrack.id) : false;
  const isLoading = playbackState === "loading" || playbackState === "buffering";

  const upcoming = queue.length ? queue.slice(queueIndex + 1, queueIndex + 6) : [];
  const recent = (() => {
    if (!currentTrack) return [];
    const seen = new Set([currentTrack.id]); const out: Track[] = [];
    for (let i = history.length - 1; i >= 0 && out.length < 5; i--) { const t = history[i].track; if (!seen.has(t.id)) { seen.add(t.id); out.push(t); } }
    return out;
  })();

  useEffect(() => {
    if (!isOpen || !currentTrack || panel !== "lyrics") return;
    setLyrics([]); setPlainLyrics(""); setLyricsLoading(true); setLyricsError(null);
    let cancelled = false;
    // Client-side fetch directly from lrclib.net (CORS-enabled) — bypasses
    // Vercel serverless which is IP-blocked by lrclib.net's WAF.
    import("@/lib/lyrics-client").then(({ fetchLyrics }) => {
      if (cancelled) return;
      return fetchLyrics(currentTrack.artist, currentTrack.title);
    }).then(d => {
      if (cancelled || !d) return;
      if (d.lyrics.length > 0) {
        setLyrics(d.lyrics);
      } else if (d.plainText) {
        setPlainLyrics(d.plainText);
      } else {
        setLyricsError("Текст не найден");
      }
    }).catch(() => {
      if (!cancelled) setLyricsError("Ошибка загрузки текста");
    }).finally(() => {
      if (!cancelled) setLyricsLoading(false);
      });
    return () => { cancelled = true; };
  }, [panel, isOpen, currentTrack]);

  useEffect(() => { setLyrics([]); setPlainLyrics(""); setLyricsError(null); }, [currentTrack?.id]);

  const handleLike = useCallback(() => { if (currentTrack) toggleLike(currentTrack.id, currentTrack); }, [currentTrack, toggleLike]);
  const handleDislike = useCallback(() => { if (currentTrack) { toggleDislike(currentTrack.id, currentTrack); /* toggleDislike already calls nextTrack() internally */ } }, [currentTrack, toggleDislike]);
  const handleShare = useCallback(async () => {
    if (!currentTrack) return;
    const url = `${window.location.origin}/track/${currentTrack.scTrackId || currentTrack.id}`;
    if (navigator.share) { try { await navigator.share({ title: currentTrack.title, url }); } catch {} }
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast({ title: "Ссылка скопирована" }));
  }, [currentTrack, toast]);
  const handleArtist = useCallback(() => { if (currentTrack?.artist) { setSelectedArtist({ name: currentTrack.artist }); setOpen(false); } }, [currentTrack, setSelectedArtist, setOpen]);

  // Speed/sleep/spatial handlers for More sheet
  const speedOptions = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const handleSpeedChange = useCallback((speed: number) => {
    setPlaybackRate(speed);
    const audio = getAudioElement();
    if (audio) audio.playbackRate = speed;
  }, [setPlaybackRate]);
  const sleepOptions = [5, 10, 15, 30, 45, 60];
  const handleSleepSet = useCallback((minutes: number) => {
    startSleepTimer(minutes);
    toast({ title: `Таймер сна: ${minutes} мин` });
  }, [startSleepTimer, toast]);
  const sleepRemainingMin = Math.ceil(sleepTimerRemaining / 60);

  if (!isOpen || !currentTrack) return null;

  // Escape closes the mobile full player too (matches desktop; helps
  // tablet + keyboard users). Rendered via a dedicated component so hooks
  // stay unconditional.
  const iconBtn: React.CSSProperties = { width: 44, height: 44, borderRadius: "9999px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "transparent", border: "none", cursor: "pointer", padding: 0 };

  const contextLabel = isLoading ? "ЗАГРУЗКА" : isPlaying ? "СЕЙЧАС ИГРАЕТ" : "ПАУЗА";
  const queueName = radioMode ? "Волна" : queue.length > 1 ? "Очередь" : "";

  return (
    <>
    <EscapeHandler active={isOpen} onEscape={() => setOpen(false)} />
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-label={`Полноэкранный плеер: ${currentTrack.title} - ${currentTrack.artist}`}
      style={{
      background: "var(--mq-bg)",
      // Open animation: translateY only (GPU-composited, no layout)
      animation: "mqFtSlideUp 0.25s cubic-bezier(0.32, 0.72, 0, 1)",
    }}>
      <style>{`
        @keyframes mqFtSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes mqFtArtIn {
          from { transform: translateY(14px) scale(0.965); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes mqFtRise {
          from { transform: translateY(10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .mq-ft-anim { animation: none !important; }
        }
        .mq-ft-btn {
          transition: transform 0.1s ease;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
          -webkit-user-select: none;
        }
        .mq-ft-btn:active { transform: scale(0.88); }
        .mq-ft-seek-input {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 28px;
          background: transparent;
          outline: none;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          touch-action: none;
        }
        .mq-ft-seek-input::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 3px;
          background: linear-gradient(to right,
            var(--mq-accent) 0%, var(--mq-accent) var(--mq-seek-pct, 0%),
            var(--mq-glass-bg-hover) var(--mq-seek-pct, 0%), var(--mq-glass-bg-hover) 100%);
        }
        .mq-ft-seek-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          /* MQ signature: SQUARE fader cap — same design language as the EQ
             faders (pro audio), not the generic round dot */
          width: 18px;
          height: 18px;
          border-radius: 5px;
          background: var(--mq-card);
          border: 2px solid var(--mq-accent);
          margin-top: -6px;
          cursor: pointer;
          box-shadow: 0 1px 6px rgba(0,0,0,0.35), 0 0 0 4px color-mix(in srgb, var(--mq-accent) 20%, transparent);
        }
        .mq-ft-seek-input::-moz-range-track {
          height: 5px;
          border-radius: 3px;
          background: var(--mq-glass-bg-hover);
        }
        .mq-ft-seek-input::-moz-range-progress {
          height: 5px;
          border-radius: 3px;
          background: var(--mq-accent);
        }
        .mq-ft-seek-input::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 4px;
          background: var(--mq-card);
          border: 2px solid var(--mq-accent);
          cursor: pointer;
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--mq-accent) 22%, transparent);
        }
        .mq-ft-vol {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 24px;
          background: transparent;
          outline: none;
          cursor: pointer;
          touch-action: none;
        }
        .mq-ft-vol::-webkit-slider-runnable-track {
          height: 5px;
          border-radius: 3px;
          background: linear-gradient(to right, var(--mq-accent) 0%, var(--mq-accent) var(--mq-vol-pct, 0%), var(--mq-glass-bg-hover) var(--mq-vol-pct, 0%), var(--mq-glass-bg-hover) 100%);
        }
        .mq-ft-vol::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--mq-text);
          margin-top: -4.5px;
          cursor: pointer;
        }
        .mq-ft-vol::-moz-range-track { height: 5px; border-radius: 3px; background: var(--mq-glass-bg-hover); }
        .mq-ft-vol::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: var(--mq-text); border: none; cursor: pointer; }
      `}</style>

      {/* Ambient glow behind the artwork — one radial accent pool.
          Pure CSS (no filter:blur) — GPU-composited, theme-token based. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-[8%] bottom-[30%] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 42%, color-mix(in srgb, var(--mq-accent) 16%, transparent) 0%, transparent 72%)",
        }}
      />

      <div className="relative z-10 h-full flex flex-col">

        {/* ── Header: close · context · more ── */}
        <div className="flex items-center justify-between px-4" style={{ paddingTop: "max(10px, env(safe-area-inset-top))", paddingBottom: 6, flexShrink: 0 }}>
          <button onClick={() => setOpen(false)} aria-label="Закрыть" className="mq-ft-btn" style={iconBtn}><ChevronDown className="w-6 h-6" style={{ color: "var(--mq-text)" }} /></button>
          <div className="flex-1 min-w-0 flex items-center justify-center gap-1.5">
            {isPlaying && <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ backgroundColor: "var(--mq-accent)" }} aria-hidden="true" />}
            <p className="mq-t-meta text-[11px] font-semibold uppercase tracking-[0.18em] truncate" style={{ color: "var(--mq-text-muted)" }}>
              {contextLabel}{queueName ? ` · ${queueName}` : ""}
            </p>
            <span className="flex-1 h-px max-w-14" style={{ backgroundColor: "var(--mq-border-thin)" }} aria-hidden="true" />
          </div>
          <button onClick={() => setShowMore(true)} aria-label="Ещё" className="mq-ft-btn" style={iconBtn}><MoreHorizontal className="w-6 h-6" style={{ color: "var(--mq-text)" }} /></button>
        </div>

        {/* ── Dominant artwork (fills the leftover space) ── */}
        <div className="flex-1 flex items-center justify-center px-4 min-h-0" style={{ paddingTop: 6, paddingBottom: 10 }}>
          <div
            className="mq-ft-anim relative rounded-[20px] overflow-hidden"
            style={{
              width: "min(92vw, 58vh)",
              aspectRatio: "1 / 1",
              boxShadow: "var(--mq-art-shadow), var(--mq-art-edge)",
            }}
            onTouchStart={handleCoverTouchStart}
            onTouchEnd={handleCoverTouchEnd}
          >
            {currentTrack.cover ? (
              <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" draggable={false} />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}>
                <Music className="w-16 h-16" style={{ color: "var(--mq-text-on-accent, rgba(255,255,255,0.7))" }} />
              </div>
            )}
            {isPlaying && (
              <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: "inset 0 0 0 1.5px color-mix(in srgb, var(--mq-accent) 32%, transparent)" }} />
            )}
          </div>
        </div>

        {/* ── Title (2-line clamp) + artist link ── */}
        <div className="mq-ft-anim px-4" style={{ flexShrink: 0, animation: "mqFtRise 0.45s cubic-bezier(0.16, 1, 0.3, 1) 60ms backwards" }}>
          <h1 className="mq-text-display text-[27px] leading-[1.12] tracking-[-0.01em] line-clamp-2" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</h1>
          <button onClick={handleArtist} className="mq-t-body text-[15px] mt-1 flex items-center gap-1 max-w-full text-left group" style={{ color: "var(--mq-text-muted)" }}>
            <span className="truncate">{currentTrack.artist}</span>
            <ChevronUp className="w-3.5 h-3.5 flex-shrink-0 rotate-90 opacity-60" />
          </button>
        </div>

        {/* ── Action row: like · dislike · add-to-playlist ── */}
        <div className="mq-ft-anim flex items-center gap-2.5 px-4 mt-3" style={{ flexShrink: 0, animation: "mqFtRise 0.45s cubic-bezier(0.16, 1, 0.3, 1) 110ms backwards" }}>
          <button
            onClick={handleLike}
            aria-label={isLiked ? "Убрать из избранного" : "Нравится"}
            aria-pressed={isLiked}
            className="mq-ft-btn"
            style={{ ...iconBtn, backgroundColor: isLiked ? "color-mix(in srgb, var(--mq-accent) 16%, transparent)" : "var(--mq-glass-bg)" }}
          >
            <Heart className="w-[22px] h-[22px]" style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }} fill={isLiked ? "currentColor" : "none"} />
          </button>
          <button
            onClick={handleDislike}
            aria-label="Не нравится"
            aria-pressed={isDisliked}
            className="mq-ft-btn"
            style={{ ...iconBtn, backgroundColor: isDisliked ? "rgba(239,68,68,0.15)" : "var(--mq-glass-bg)" }}
          >
            <ThumbsDown className="w-[20px] h-[20px]" style={{ color: isDisliked ? "var(--mq-error, #ef4444)" : "var(--mq-text-muted)" }} fill={isDisliked ? "currentColor" : "none"} />
          </button>
          <button
            onClick={() => setShowPlaylistPicker(v => !v)}
            aria-label="Добавить в плейлист"
            aria-expanded={showPlaylistPicker}
            className="mq-ft-btn"
            style={{ ...iconBtn, backgroundColor: showPlaylistPicker ? "color-mix(in srgb, var(--mq-accent) 16%, transparent)" : "var(--mq-glass-bg)" }}
          >
            <ListPlus className="w-[20px] h-[20px]" style={{ color: showPlaylistPicker ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
          </button>
          <div className="flex-1" />
          <button
            onClick={handleShare}
            aria-label="Поделиться"
            className="mq-ft-btn"
            style={{ ...iconBtn, backgroundColor: "var(--mq-glass-bg)" }}
          >
            <Share2 className="w-[20px] h-[20px]" style={{ color: "var(--mq-text-muted)" }} />
          </button>
        </div>

        {/* Playlist picker sheet */}
        {showPlaylistPicker && currentTrack && (
          <div className="px-5 mt-3" style={{ flexShrink: 0 }}>
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)" }}>
              <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--mq-border-thin)" }}>
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                  Добавить в плейлист
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {playlists.length === 0 ? (
                  <div className="px-4 py-5 text-center">
                    <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                      Нет плейлистов
                    </p>
                  </div>
                ) : (
                  playlists.map(pl => (
                    <button
                      key={pl.id}
                      onClick={() => {
                        addToPlaylist(pl.id, currentTrack);
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
            </div>
          </div>
        )}

        {/* ── Seek (28px touch) + times ── */}
        <div className="mq-ft-anim px-4 mt-4" style={{ flexShrink: 0, animation: "mqFtRise 0.45s cubic-bezier(0.16, 1, 0.3, 1) 150ms backwards" }}>
          {/* Editorial flip: times ABOVE the bar — current in text color, larger */}
          <div className="flex items-baseline justify-between">
            <span ref={timeCurrentRef} className="text-[26px] font-mono tabular-nums font-bold leading-none tracking-tight" style={{ color: "var(--mq-text)" }}>0:00</span>
            <span ref={timeRemainingRef} className="text-[13px] font-mono tabular-nums" style={{ color: "var(--mq-text-muted)" }}>−{formatDuration(duration)}</span>
          </div>
          <input
            ref={seekInputRef}
            type="range"
            min={0}
            max={100}
            step={0.1}
            defaultValue={0}
            onChange={handleSeekChange}
            onPointerDown={() => { isDraggingRef.current = true; }}
            onPointerUp={commitSeek}
            onPointerCancel={() => { isDraggingRef.current = false; }}
            aria-label="Позиция воспроизведения"
            className="mq-ft-seek-input"
          />
        </div>

        {/* ── Transport: shuffle 44 · prev 56 · PLAY 76 · next 56 · repeat 44 ── */}
        <div className="mq-ft-anim flex items-center justify-between px-4 mt-2" style={{ flexShrink: 0, animation: "mqFtRise 0.45s cubic-bezier(0.16, 1, 0.3, 1) 190ms backwards" }}>
          <button onClick={toggleShuffle} aria-label="Перемешать" aria-pressed={shuffle} className="mq-ft-btn" style={{ ...iconBtn, borderRadius: 14, backgroundColor: shuffle ? "color-mix(in srgb, var(--mq-accent) 12%, transparent)" : iconBtn.backgroundColor, boxShadow: shuffle ? "inset 0 0 0 1.5px color-mix(in srgb, var(--mq-accent) 40%, transparent)" : "none" }}>
            <Shuffle className="w-5 h-5" style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
          </button>
          <button onClick={prevTrack} aria-label="Предыдущий трек" className="mq-ft-btn" style={{ ...iconBtn, width: 56, height: 56, borderRadius: 18 }}>
            <SkipBack className="w-8 h-8" style={{ color: "var(--mq-text)" }} fill="currentColor" />
          </button>
          <button
            onClick={togglePlay}
            aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
            className="mq-ft-btn"
            style={{
              width: 76, height: 76, borderRadius: "9999px",
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: "var(--mq-accent)", border: "none", cursor: "pointer", padding: 0,
              boxShadow: "0 10px 30px -8px color-mix(in srgb, var(--mq-accent) 55%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
          >
            {isLoading ? (
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--mq-text-on-accent, #fff)" }} />
            ) : isPlaying ? (
              <Pause className="w-8 h-8" fill="currentColor" style={{ color: "var(--mq-text-on-accent, #fff)" }} />
            ) : (
              <Play className="w-8 h-8 ml-1" fill="currentColor" style={{ color: "var(--mq-text-on-accent, #fff)" }} />
            )}
          </button>
          <button onClick={nextTrack} aria-label="Следующий трек" className="mq-ft-btn" style={{ ...iconBtn, width: 56, height: 56, borderRadius: 18 }}>
            <SkipForward className="w-8 h-8" style={{ color: "var(--mq-text)" }} fill="currentColor" />
          </button>
          <button onClick={toggleRepeat} aria-label="Повтор" aria-pressed={repeat !== "off"} className="mq-ft-btn" style={{ ...iconBtn, borderRadius: 14, backgroundColor: repeat !== "off" ? "color-mix(in srgb, var(--mq-accent) 12%, transparent)" : iconBtn.backgroundColor, boxShadow: repeat !== "off" ? "inset 0 0 0 1.5px color-mix(in srgb, var(--mq-accent) 40%, transparent)" : "none" }}>
            {repeat === "one" ? <Repeat1 className="w-5 h-5" style={{ color: "var(--mq-accent)" }} /> : <Repeat className="w-5 h-5" style={{ color: repeat === "all" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />}
          </button>
        </div>

        {/* ── Chips: lyrics · queue · history (48px targets) ── */}
        <div
          className="mq-ft-anim flex items-center justify-center gap-2 px-5"
          style={{ flexShrink: 0, paddingTop: 12, paddingBottom: "max(14px, env(safe-area-inset-bottom))", animation: "mqFtRise 0.45s cubic-bezier(0.16, 1, 0.3, 1) 230ms backwards" }}
        >
          {([
            { id: "lyrics", icon: Mic2, label: "Текст", on: panel === "lyrics" },
            { id: "queue", icon: ListMusic, label: "Очередь", on: panel === "queue" },
            { id: "history", icon: History, label: "История", on: panel === "history" },
          ] as const).map(({ id, icon: Icon, label, on }) => (
            <button
              key={id}
              onClick={() => setPanel(p => (p === id ? null : (id as typeof panel)))}
              aria-pressed={on}
              className="mq-ft-btn flex items-center gap-2 px-4 h-12 rounded-[14px]"
              style={{
                backgroundColor: on ? "color-mix(in srgb, var(--mq-accent) 16%, transparent)" : "var(--mq-glass-bg)",
                border: `1px solid ${on ? "color-mix(in srgb, var(--mq-accent) 35%, transparent)" : "var(--mq-border-hairline, transparent)"}`,
                color: on ? "var(--mq-accent)" : "var(--mq-text-muted)",
              }}
            >
              <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>

        {/* ── Panel overlay (lyrics/queue/history) ── */}
        {panel && (
          <div className="absolute inset-0 z-20 flex flex-col" style={{ background: "var(--mq-bg)", paddingTop: "max(16px, env(safe-area-inset-top))", animation: "mqFtSlideUp 0.2s ease-out" }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ flexShrink: 0 }}>
              <p className="text-base font-semibold" style={{ color: "var(--mq-text)" }}>{panel === "lyrics" ? "Текст песни" : panel === "queue" ? "Очередь" : "Недавно играло"}</p>
              <button onClick={() => setPanel(null)} aria-label="Закрыть" className="mq-ft-btn" style={iconBtn}><X className="w-5 h-5" style={{ color: "var(--mq-text)" }} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {panel === "lyrics" && (lyricsLoading ? <div className="flex items-center gap-2 py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-accent)" }} /><span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Поиск...</span></div>
                : lyrics.length ? <SyncedLyrics lines={lyrics} onSeek={seekToTime} />
                : plainLyrics ? <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--mq-text-muted)" }}>{plainLyrics}</div>
                : <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>{lyricsError || "Текст не найден"}</p>)}
              {panel === "queue" && (upcoming.length ? upcoming.map((t, i) => (
                <button key={t.id + i} onClick={() => { playTrack?.(t, queue); setPanel(null); }} className="mq-ft-btn w-full flex items-center gap-3 p-2 rounded-xl text-left" style={{ border: "none", cursor: "pointer", background: "transparent" }}>
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">{t.cover ? <img src={t.cover} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: "var(--mq-accent)" }} />}</div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>{t.title}</p><p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{t.artist}</p></div>
                  <span className="text-[11px] font-mono" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(t.duration)}</span>
                </button>)) : <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>Очередь пуста</p>)}
              {panel === "history" && (recent.length ? recent.map((t, i) => (
                <button key={t.id + i} onClick={() => { playTrack?.(t, [t]); setPanel(null); }} className="mq-ft-btn w-full flex items-center gap-3 p-2 rounded-xl text-left" style={{ border: "none", cursor: "pointer", background: "transparent" }}>
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">{t.cover ? <img src={t.cover} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: "var(--mq-accent)" }} />}</div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>{t.title}</p><p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{t.artist}</p></div>
                  <span className="text-[11px] font-mono" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(t.duration)}</span>
                </button>)) : <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>История пуста</p>)}
            </div>
          </div>
        )}

        {/* ── More sheet (volume, speed, sleep timer, EQ, spatial, share) ── */}
        {showMore && (
          <>
            <div className="absolute inset-0 z-30" style={{ background: "var(--mq-overlay-scrim)" }} onClick={() => setShowMore(false)} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 40, borderRadius: "20px 20px 0 0", padding: "20px", paddingBottom: "max(20px, env(safe-area-inset-bottom))", background: "var(--mq-surface-1)", border: "1px solid var(--mq-edge-strong)", boxShadow: "var(--mq-elev-dialog)", animation: "mqFtSlideUp 0.25s cubic-bezier(0.32, 0.72, 0, 1)", maxHeight: "80vh", overflowY: "auto" }}>
              <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--mq-glass-bg-active)" }} />
              {/* Track info header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">{currentTrack.cover ? <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: "var(--mq-accent)" }} />}</div>
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</p><p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{currentTrack.artist}</p></div>
              </div>
              <div className="h-px mb-3" style={{ background: "var(--mq-border-thin)" }} />

              {/* Volume */}
              <div className="py-3">
                <div className="flex items-center gap-3 mb-2"><Volume2 className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} /><span className="text-sm" style={{ color: "var(--mq-text)" }}>Громкость</span><span className="text-xs ml-auto font-mono" style={{ color: "var(--mq-text-muted)" }}>{Math.round(volume)}%</span></div>
                <input type="range" min={0} max={100} value={volume} onChange={(e) => { const v = Number(e.target.value); setVolume(v); e.target.style.setProperty('--mq-vol-pct', `${v}%`); }} className="mq-ft-vol" style={{ width: "100%", ['--mq-vol-pct' as string]: `${volume}%` }} />
              </div>
              <div className="h-px my-2" style={{ background: "var(--mq-border-thin)" }} />

              {/* Playback speed */}
              <div className="py-3">
                <div className="flex items-center gap-3 mb-2"><Gauge className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} /><span className="text-sm" style={{ color: "var(--mq-text)" }}>Скорость</span><span className="text-xs ml-auto font-mono" style={{ color: playbackRate !== 1 ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>{playbackRate}x</span></div>
                <div className="flex items-center gap-2 flex-wrap pl-8">
                  {speedOptions.map(speed => (
                    <button key={speed} onClick={() => handleSpeedChange(speed)} className="mq-ft-btn px-3 py-1.5 rounded-full text-xs font-semibold" style={{ backgroundColor: playbackRate === speed ? "var(--mq-accent)" : "var(--mq-input-bg)", color: playbackRate === speed ? "#fff" : "var(--mq-text-muted)", border: "none", cursor: "pointer" }}>
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-px my-2" style={{ background: "var(--mq-border-thin)" }} />

              {/* Sleep timer */}
              <div className="py-3">
                <div className="flex items-center gap-3 mb-2"><Timer className="w-5 h-5" style={{ color: sleepTimerActive ? "var(--mq-accent)" : "var(--mq-text-muted)" }} /><span className="text-sm" style={{ color: "var(--mq-text)" }}>Таймер сна</span>{sleepTimerActive && <span className="text-xs ml-auto font-mono" style={{ color: "var(--mq-accent)" }}>{sleepRemainingMin}м</span>}</div>
                <div className="flex items-center gap-2 flex-wrap pl-8">
                  {sleepOptions.map(min => (
                    <button key={min} onClick={() => handleSleepSet(min)} className="mq-ft-btn px-3 py-1.5 rounded-full text-xs font-semibold" style={{ backgroundColor: "var(--mq-input-bg)", color: "var(--mq-text-muted)", border: "none", cursor: "pointer" }}>
                      {min} мин
                    </button>
                  ))}
                  {sleepTimerActive && (
                    <button onClick={() => { stopSleepTimer(); toast({ title: "Таймер отменён" }); }} className="mq-ft-btn px-3 py-1.5 rounded-full text-xs font-semibold" style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "var(--mq-error, #ef4444)", border: "none", cursor: "pointer" }}>
                      Отменить
                    </button>
                  )}
                </div>
              </div>
              <div className="h-px my-2" style={{ background: "var(--mq-border-thin)" }} />

              {/* Equalizer */}
              <button onClick={() => { setShowMore(false); setEqOpen(true); }} className="mq-ft-btn w-full flex items-center gap-3 py-3" style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                <Sliders className="w-5 h-5" style={{ color: eqEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm" style={{ color: "var(--mq-text)" }}>Эквалайзер</p>
                  <p className="text-[11px] truncate" style={{ color: "var(--mq-text-muted)" }}>
                    {eqEnabled ? `Активен · ${eqPreset === "custom" ? "свои настройки" : eqPreset}` : "10-полосный с пресетами"}
                  </p>
                </div>
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: eqEnabled
                      ? "color-mix(in srgb, var(--mq-accent) 18%, transparent)"
                      : "var(--mq-glass-bg)",
                    color: eqEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)",
                    border: eqEnabled
                      ? "1px solid color-mix(in srgb, var(--mq-accent) 35%, transparent)"
                      : "1px solid var(--mq-border-thin)",
                  }}
                >
                  {eqEnabled ? "ON" : "OFF"}
                </span>
              </button>
              <div className="h-px my-2" style={{ background: "var(--mq-border-thin)" }} />

              {/* Spatial audio toggle */}
              <button onClick={() => setSpatialAudioEnabled(!spatialAudioEnabled)} className="mq-ft-btn w-full flex items-center gap-3 py-3" style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                <AirVent className="w-5 h-5" style={{ color: spatialAudioEnabled ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
                <span className="text-sm flex-1 text-left" style={{ color: "var(--mq-text)" }}>Пространственное аудио</span>
                <div className="w-10 h-6 rounded-full relative flex-shrink-0" style={{ background: spatialAudioEnabled ? "var(--mq-accent)" : "var(--mq-glass-bg-active)" }}>
                  <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform" style={{ transform: spatialAudioEnabled ? "translateX(20px)" : "translateX(2px)" }} />
                </div>
              </button>
              <div className="h-px my-2" style={{ background: "var(--mq-border-thin)" }} />

              {/* Share */}
              <button onClick={() => { handleShare(); setShowMore(false); }} className="mq-ft-btn w-full flex items-center gap-3 py-3" style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                <Share2 className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} /><span className="text-sm" style={{ color: "var(--mq-text)" }}>Поделиться</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}

export default memo(FullTrackViewMobileInner);
