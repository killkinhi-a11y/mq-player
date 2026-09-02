"use client";

import React, { useState, useRef, useCallback, useEffect, memo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { getAudioElement } from "@/lib/audioEngine";
import { formatDuration } from "@/lib/musicApi";
import type { Track } from "@/lib/musicApi";
import { toast } from "@/hooks/use-toast";
import { Play, Pause, SkipBack, SkipForward, ChevronDown, Heart, Shuffle, Repeat, Repeat1, Music, ListMusic, Share2, Loader2, Mic2, ThumbsDown, History, X, MoreHorizontal, Volume2, Timer, Gauge, AirVent, ListPlus, Sliders } from "lucide-react";

// ═════════════════════════════════════════════════════════════════════════
// FULL TRACK VIEW — MOBILE
// Following Spotify/Apple Music best practices:
//
// PERFORMANCE RULES:
// 1. NO layout-affecting animations (width/height/top/left).
//    Use ONLY transform: scaleX/translateX/translateY (GPU-composited).
// 2. NO permanent willChange (it reserves GPU memory).
// 3. Progress bar fill = transform: scaleX(), NOT width.
// 4. Time labels update only when second changes (not every frame).
// 5. NO store subscription for progress — RAF reads audio.currentTime.
// 6. During seek drag: pause RAF, let native input control.
// 7. Cover = fixed dimensions, object-fit: cover, no blur, no parallax.
// 8. Buttons use CSS :active, not JS state.
// 9. Open animation = translateY only, 250ms cubic-bezier.
// 10. NO framer-motion (it re-renders on every frame).
// ═════════════════════════════════════════════════════════════════════════

interface SyncedLine { time: number; text: string; }

function SyncedLyrics({ lines, onSeek }: { lines: SyncedLine[]; onSeek: (t: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastIdx = useRef(-1);

  // Subscribe to store for active line — but only update DOM via refs (no re-render)
  // Throttle: only check when second changes
  useEffect(() => {
    let lastSec = -1;
    const unsub = useAppStore.subscribe((s) => {
      const p = s.progress;
      const sec = Math.floor(p);
      if (sec === lastSec) return;
      lastSec = sec;
      let idx = -1;
      for (let i = 0; i < lines.length; i++) { if (lines[i].time <= p) idx = i; else break; }
      if (idx === lastIdx.current) return;
      lastIdx.current = idx;
      lineRefs.current.forEach((el, i) => {
        if (!el) return;
        const active = i === idx, past = i < idx;
        el.style.color = active ? "var(--mq-text)" : past ? "color-mix(in srgb, var(--mq-text-muted) 50%, transparent)" : "var(--mq-text-muted)";
        el.style.fontWeight = active ? "700" : "400";
        el.style.fontSize = active ? "1.05rem" : "0.95rem";
        el.style.opacity = active ? "1" : past ? "0.55" : "0.7";
      });
      const c = containerRef.current, el = lineRefs.current[idx];
      if (c && el) {
        const cT = c.scrollTop, cB = cT + c.clientHeight, lT = el.offsetTop, lB = lT + el.offsetHeight;
        if (lT < cT + 40 || lB > cB - 40) c.scrollTo({ top: lT - c.clientHeight / 2 + el.offsetHeight / 2, behavior: "smooth" });
      }
    });
    return () => unsub();
  }, [lines]);

  if (!lines.length) return <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>Текст не найден</p>;
  return (
    <div ref={containerRef} className="text-base leading-relaxed flex-1 overflow-y-auto px-2 py-2 space-y-1"
      style={{ maskImage: "linear-gradient(180deg, transparent 0%, #000 10%, #000 90%, transparent 100%)", WebkitMaskImage: "linear-gradient(180deg, transparent 0%, #000 10%, #000 90%, transparent 100%)" }}>
      {lines.map((line, i) => (
        <button key={i} ref={(el) => { lineRefs.current[i] = el; }} onClick={() => onSeek(line.time)}
          className="block w-full text-left px-2 py-1.5 rounded-lg cursor-pointer" style={{ color: "var(--mq-text-muted)", fontWeight: 400, fontSize: "0.95rem", transition: "color .2s, opacity .2s" }}>
          {line.text || "♪"}
        </button>
      ))}
    </div>
  );
}

// ── Phase 2B: Escape key handler (a11y parity with desktop full player) ──
function EscapeHandler({ active, onEscape }: { active: boolean; onEscape: () => void }) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
  const isDraggingRef = useRef(false);

  // ── RAF: update progress input value + time label ──
  useEffect(() => {
    if (!isOpen) return;
    let rafId = 0;
    let lastSecond = -1;

    const tick = () => {
      if (!isDraggingRef.current) {
        const audio = getAudioElement();
        if (audio && audio.src && audio.duration && isFinite(audio.duration) && audio.duration > 0) {
          const pct = (audio.currentTime / audio.duration) * 100;
          // Update input value + CSS variable for fill gradient
          if (seekInputRef.current && document.activeElement !== seekInputRef.current) {
            seekInputRef.current.value = String(pct);
            seekInputRef.current.style.setProperty('--mq-seek-pct', `${pct}%`);
          }
          // Update time label only when second changes
          const sec = Math.floor(audio.currentTime);
          if (sec !== lastSecond && timeCurrentRef.current) {
            lastSecond = sec;
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            timeCurrentRef.current.textContent = `${m}:${s.toString().padStart(2, "0")}`;
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
    // Only update CSS variable for visual feedback — don't touch audio/store during drag
    e.target.style.setProperty('--mq-seek-pct', `${v}%`);
  }, []);

  const commitSeek = useCallback((e: React.PointerEvent<HTMLInputElement>) => {
    const v = Number(e.currentTarget.value);
    isDraggingRef.current = false;
    e.currentTarget.style.setProperty('--mq-seek-pct', `${v}%`);
    const audio = getAudioElement();
    if (audio && audio.src && audio.duration) {
      audio.currentTime = (v / 100) * audio.duration;
      setProgress(audio.currentTime);
    }
  }, [setProgress]);

  const seekToTime = useCallback((time: number) => {
    const audio = getAudioElement();
    if (audio && audio.src) audio.currentTime = time;
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
  // Initial seekPct — RAF will update the input value continuously
  const seekPct = duration > 0 ? (useAppStore.getState().progress / duration) * 100 : 0;

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

  // Phase 2B a11y: Escape closes the mobile full player too (matches the
  // desktop FullTrackView behavior; helps tablet + keyboard users).
  // Rendered as an effect via a dedicated component so hooks stay unconditional.

  const iconBtn: React.CSSProperties = { width: 36, height: 36, borderRadius: "9999px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "transparent", border: "none", cursor: "pointer", padding: 0 };

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
          height: 24px;
          background: transparent;
          outline: none;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
          touch-action: none;
        }
        .mq-ft-seek-input::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 2px;
          background: linear-gradient(to right,
            var(--mq-accent) 0%, var(--mq-accent) var(--mq-seek-pct, 0%),
            var(--mq-glass-bg-hover) var(--mq-seek-pct, 0%), var(--mq-glass-bg-hover) 100%);
        }
        .mq-ft-seek-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #fff;
          margin-top: -5px;
          cursor: pointer;
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--mq-accent) 25%, transparent);
        }
        .mq-ft-seek-input::-moz-range-track {
          height: 4px;
          border-radius: 2px;
          background: var(--mq-glass-bg-hover);
        }
        .mq-ft-seek-input::-moz-range-progress {
          height: 4px;
          border-radius: 2px;
          background: var(--mq-accent);
        }
        .mq-ft-seek-input::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #fff;
          border: none;
          cursor: pointer;
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--mq-accent) 25%, transparent);
        }
        .mq-ft-vol {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 20px;
          background: transparent;
          outline: none;
          cursor: pointer;
          touch-action: none;
        }
        .mq-ft-vol::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 2px;
          background: linear-gradient(to right, var(--mq-accent) 0%, var(--mq-accent) var(--mq-vol-pct, 0%), var(--mq-glass-bg-hover) var(--mq-vol-pct, 0%), var(--mq-glass-bg-hover) 100%);
        }
        .mq-ft-vol::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #fff;
          margin-top: -4px;
          cursor: pointer;
        }
        .mq-ft-vol::-moz-range-track { height: 4px; border-radius: 2px; background: var(--mq-glass-bg-hover); }
        .mq-ft-vol::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: #fff; border: none; cursor: pointer; }
      `}</style>

      {/* NO blurred background — just solid gradient for max performance */}

      <div className="relative z-10 h-full flex flex-col">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4" style={{ paddingTop: "max(12px, env(safe-area-inset-top))", paddingBottom: 8, flexShrink: 0 }}>
          <button onClick={() => setOpen(false)} aria-label="Закрыть" className="mq-ft-btn" style={iconBtn}><ChevronDown className="w-6 h-6" style={{ color: "var(--mq-text)" }} /></button>
          <button onClick={() => setShowMore(true)} aria-label="Ещё" className="mq-ft-btn" style={iconBtn}><MoreHorizontal className="w-6 h-6" style={{ color: "var(--mq-text)" }} /></button>
        </div>

        {/* ── Cover (centered, takes available space) ── */}
        <div className="flex-1 flex items-center justify-center px-6 min-h-0" style={{ paddingTop: 8, paddingBottom: 12 }}>
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              width: "min(75vw, 300px)",
              maxWidth: "300px",
              maxHeight: "300px",
              aspectRatio: "1 / 1",
              boxShadow: "var(--mq-shadow-elevated)",
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
          </div>
        </div>

        {/* ── Title + like + dislike ── */}
        <div className="flex items-start justify-between gap-3 px-5 mb-3" style={{ flexShrink: 0 }}>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold truncate" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</h1>
            <button onClick={handleArtist} className="text-sm hover:underline mt-0.5 block truncate" style={{ color: "var(--mq-text-muted)" }}>{currentTrack.artist}</button>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={handleLike} aria-label="Нравится" className="mq-ft-btn" style={{ ...iconBtn, width: 40, height: 40, backgroundColor: isLiked ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "var(--mq-glass-bg)" }}>
              <Heart className="w-5 h-5" style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }} fill={isLiked ? "currentColor" : "none"} />
            </button>
            <button onClick={handleDislike} aria-label="Не нравится" className="mq-ft-btn" style={{ ...iconBtn, width: 40, height: 40, backgroundColor: isDisliked ? "rgba(239,68,68,0.15)" : "var(--mq-glass-bg)" }}>
              <ThumbsDown className="w-5 h-5" style={{ color: isDisliked ? "#ef4444" : "var(--mq-text-muted)" }} fill={isDisliked ? "currentColor" : "none"} />
            </button>
            <button
              onClick={() => setShowPlaylistPicker(v => !v)}
              aria-label="Добавить в плейлист"
              className="mq-ft-btn"
              style={{ ...iconBtn, width: 40, height: 40, backgroundColor: showPlaylistPicker ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "var(--mq-glass-bg)" }}
            >
              <ListPlus className="w-5 h-5" style={{ color: showPlaylistPicker ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
            </button>
          </div>
        </div>

        {/* Playlist picker sheet */}
        {showPlaylistPicker && currentTrack && (
          <div className="px-5 mb-3">
            <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border-hairline)" }}>
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
            </div>
          </div>
        )}

        {/* ── Progress bar — native input for reliable drag ── */}
        <div className="px-5 mb-3" style={{ flexShrink: 0 }}>
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
            className="mq-ft-seek-input"
          />
          <div className="flex items-center justify-between mt-1">
            <span ref={timeCurrentRef} className="text-[11px] font-mono tabular-nums" style={{ color: "var(--mq-text-muted)" }}>0:00</span>
            <span className="text-[11px] font-mono tabular-nums" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(duration)}</span>
          </div>
        </div>

        {/* ── Main controls ── */}
        <div className="flex items-center justify-between px-5 mb-4" style={{ flexShrink: 0 }}>
          <button onClick={toggleShuffle} aria-label="Перемешать" className="mq-ft-btn" style={{ ...iconBtn, width: 40, height: 40 }}><Shuffle className="w-5 h-5" style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }} /></button>
          <button onClick={prevTrack} aria-label="Предыдущий" className="mq-ft-btn" style={{ ...iconBtn, width: 48, height: 48 }}><SkipBack className="w-7 h-7" style={{ color: "var(--mq-text)" }} fill="currentColor" /></button>
          <button onClick={togglePlay} aria-label="Play/Pause" className="mq-ft-btn" style={{ width: 68, height: 68, borderRadius: "9999px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fff", border: "none", cursor: "pointer", padding: 0, boxShadow: "var(--mq-shadow-button-hover)" }}>
            {isLoading ? <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#000" }} /> : isPlaying ? <Pause className="w-7 h-7" fill="#000" style={{ color: "#000" }} /> : <Play className="w-7 h-7 ml-1" fill="#000" style={{ color: "#000" }} />}
          </button>
          <button onClick={nextTrack} aria-label="Следующий" className="mq-ft-btn" style={{ ...iconBtn, width: 48, height: 48 }}><SkipForward className="w-7 h-7" style={{ color: "var(--mq-text)" }} fill="currentColor" /></button>
          <button onClick={toggleRepeat} aria-label="Повтор" className="mq-ft-btn" style={{ ...iconBtn, width: 40, height: 40 }}>
            {repeat === "one" ? <Repeat1 className="w-5 h-5" style={{ color: "var(--mq-accent)" }} /> : <Repeat className="w-5 h-5" style={{ color: repeat === "all" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />}
          </button>
        </div>

        {/* ── Bottom action row ── */}
        <div className="flex items-center justify-around px-5 pb-4" style={{ flexShrink: 0 }}>
          <button onClick={() => setPanel(p => p === "lyrics" ? null : "lyrics")} className="mq-ft-btn flex flex-col items-center gap-1" style={{ ...iconBtn, width: "auto", height: "auto", flexDirection: "column" }}>
            <Mic2 className="w-5 h-5" style={{ color: panel === "lyrics" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
            <span className="text-[10px]" style={{ color: panel === "lyrics" ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>Текст</span>
          </button>
          <button onClick={() => setPanel(p => p === "queue" ? null : "queue")} className="mq-ft-btn flex flex-col items-center gap-1" style={{ ...iconBtn, width: "auto", height: "auto", flexDirection: "column" }}>
            <ListMusic className="w-5 h-5" style={{ color: panel === "queue" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
            <span className="text-[10px]" style={{ color: panel === "queue" ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>Очередь</span>
          </button>
          <button onClick={() => setPanel(p => p === "history" ? null : "history")} className="mq-ft-btn flex flex-col items-center gap-1" style={{ ...iconBtn, width: "auto", height: "auto", flexDirection: "column" }}>
            <History className="w-5 h-5" style={{ color: panel === "history" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
            <span className="text-[10px]" style={{ color: panel === "history" ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>История</span>
          </button>
          <button onClick={handleShare} className="mq-ft-btn flex flex-col items-center gap-1" style={{ ...iconBtn, width: "auto", height: "auto", flexDirection: "column" }}>
            <Share2 className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} />
            <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>Поделиться</span>
          </button>
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
                  <span className="text-[10px] font-mono" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(t.duration)}</span>
                </button>)) : <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>Очередь пуста</p>)}
              {panel === "history" && (recent.length ? recent.map((t, i) => (
                <button key={t.id + i} onClick={() => { playTrack?.(t, [t]); setPanel(null); }} className="mq-ft-btn w-full flex items-center gap-3 p-2 rounded-xl text-left" style={{ border: "none", cursor: "pointer", background: "transparent" }}>
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">{t.cover ? <img src={t.cover} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: "var(--mq-accent)" }} />}</div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>{t.title}</p><p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{t.artist}</p></div>
                  <span className="text-[10px] font-mono" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(t.duration)}</span>
                </button>)) : <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>История пуста</p>)}
            </div>
          </div>
        )}

        {/* ── More sheet (volume, speed, sleep timer, spatial, share) ── */}
        {showMore && (
          <>
            <div className="absolute inset-0 z-30" style={{ background: "var(--mq-overlay-scrim)" }} onClick={() => setShowMore(false)} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 40, borderRadius: "20px 20px 0 0", padding: "20px", paddingBottom: "max(20px, env(safe-area-inset-bottom))", background: "var(--mq-card)", border: "1px solid var(--mq-border-thin)", boxShadow: "var(--mq-shadow-elevated)", animation: "mqFtSlideUp 0.25s cubic-bezier(0.32, 0.72, 0, 1)", maxHeight: "80vh", overflowY: "auto" }}>
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
                    <button onClick={() => { stopSleepTimer(); toast({ title: "Таймер отменён" }); }} className="mq-ft-btn px-3 py-1.5 rounded-full text-xs font-semibold" style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#ef4444", border: "none", cursor: "pointer" }}>
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
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
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
