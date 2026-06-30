"use client";

import React, { useState, useRef, useCallback, useEffect, memo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { getAudioElement } from "@/lib/audioEngine";
import { formatDuration } from "@/lib/musicApi";
import type { Track } from "@/lib/musicApi";
import { toast } from "@/hooks/use-toast";
import { Play, Pause, SkipBack, SkipForward, ChevronDown, Heart, Shuffle, Repeat, Repeat1, Music, ListMusic, Share2, Loader2, Mic2, ThumbsDown, History, X, MoreHorizontal, Volume2 } from "lucide-react";

interface SyncedLine { time: number; text: string; }

// ═════════════════════════════════════════════════════════════════════════
// FULL TRACK VIEW — MOBILE (radically simplified)
// - Native input[type=range] for seek (hardware-accelerated drag)
// - NO blur background (GPU killer on mobile)
// - NO framer-motion (pure CSS)
// - RAF reads audio.currentTime for smooth fill
// ═════════════════════════════════════════════════════════════════════════

function SyncedLyrics({ lines, onSeek }: { lines: SyncedLine[]; onSeek: (t: number) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastIdx = useRef(-1);

  useEffect(() => {
    const unsub = useAppStore.subscribe((s) => {
      const p = s.progress;
      let idx = -1;
      for (let i = 0; i < lines.length; i++) { if (lines[i].time <= p) idx = i; else break; }
      if (idx === lastIdx.current) return;
      lastIdx.current = idx;
      lineRefs.current.forEach((el, i) => {
        if (!el) return;
        const active = i === idx, past = i < idx;
        el.style.color = active ? "var(--mq-text)" : past ? "color-mix(in srgb, var(--mq-text-muted) 50%, transparent)" : "var(--mq-text-muted)";
        el.style.fontWeight = active ? "700" : "400";
        el.style.fontSize = active ? "1.1rem" : "0.95rem";
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
    <div ref={containerRef} className="text-base leading-relaxed max-h-[50vh] overflow-y-auto px-2 py-2 space-y-1"
      style={{ maskImage: "linear-gradient(180deg, transparent 0%, #000 12%, #000 88%, transparent 100%)", WebkitMaskImage: "linear-gradient(180deg, transparent 0%, #000 12%, #000 88%, transparent 100%)" }}>
      {lines.map((line, i) => (
        <button key={i} ref={(el) => { lineRefs.current[i] = el; }} onClick={() => onSeek(line.time)}
          className="block w-full text-left px-2 py-1.5 rounded-lg cursor-pointer" style={{ color: "var(--mq-text-muted)", fontWeight: 400, fontSize: "0.95rem", transition: "color .2s, opacity .2s" }}>
          {line.text || "♪"}
        </button>
      ))}
    </div>
  );
}

function FullTrackViewMobileInner() {
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

  const [panel, setPanel] = useState<"queue" | "lyrics" | "history" | null>(null);
  const [lyrics, setLyrics] = useState<SyncedLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState("");
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // Refs for smooth progress (RAF reads audio.currentTime directly)
  const seekFillRef = useRef<HTMLDivElement>(null);
  const seekInputRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);

  // RAF: update progress fill + time label from audio.currentTime (60fps)
  useEffect(() => {
    if (!isOpen) return;
    let rafId = 0;
    const tick = () => {
      const audio = getAudioElement();
      if (audio && audio.src && audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        const pct = (audio.currentTime / audio.duration) * 100;
        if (seekFillRef.current) seekFillRef.current.style.width = `${pct}%`;
        // Don't override input value while user is dragging it
        if (seekInputRef.current && document.activeElement !== seekInputRef.current) {
          seekInputRef.current.value = String(pct);
        }
        if (timeRef.current) {
          const m = Math.floor(audio.currentTime / 60);
          const s = Math.floor(audio.currentTime % 60);
          timeRef.current.textContent = `${m}:${s.toString().padStart(2, "0")}`;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isOpen]);

  // Native input handles seek drag 100% in native code
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    const audio = getAudioElement();
    if (audio && audio.src && audio.duration) {
      audio.currentTime = (v / 100) * audio.duration;
      setProgress(audio.currentTime);
    }
    if (seekFillRef.current) seekFillRef.current.style.width = `${v}%`;
  }, [setProgress]);

  const seekToTime = useCallback((time: number) => {
    const audio = getAudioElement();
    if (audio && audio.src) audio.currentTime = time;
    setProgress(time);
  }, [setProgress]);

  // Swipe down to close, swipe left/right to skip
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
    setLyrics([]); setPlainLyrics(""); setLyricsLoading(true);
    const ctrl = new AbortController();
    fetch(`/api/music/lyrics?artist=${encodeURIComponent(currentTrack.artist)}&title=${encodeURIComponent(currentTrack.title)}`, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { if (Array.isArray(d.lyrics) && d.lyrics.length) setLyrics(d.lyrics); else if (d.plainText) setPlainLyrics(d.plainText); })
      .catch(() => {}).finally(() => setLyricsLoading(false));
    return () => ctrl.abort();
  }, [panel, isOpen, currentTrack]);

  useEffect(() => { setLyrics([]); setPlainLyrics(""); }, [currentTrack?.id]);

  const handleLike = useCallback(() => { if (currentTrack) toggleLike(currentTrack.id, currentTrack); }, [currentTrack, toggleLike]);
  const handleDislike = useCallback(() => { if (currentTrack) { toggleDislike(currentTrack.id, currentTrack); nextTrack(); } }, [currentTrack, toggleDislike, nextTrack]);
  const handleShare = useCallback(async () => {
    if (!currentTrack) return;
    const url = `${window.location.origin}/track/${currentTrack.scTrackId || currentTrack.id}`;
    if (navigator.share) { try { await navigator.share({ title: currentTrack.title, url }); } catch {} }
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast({ title: "Ссылка скопирована" }));
  }, [currentTrack, toast]);
  const handleArtist = useCallback(() => { if (currentTrack?.artist) { setSelectedArtist({ name: currentTrack.artist }); setOpen(false); } }, [currentTrack, setSelectedArtist, setOpen]);

  if (!isOpen || !currentTrack) return null;

  const seekPct = duration > 0 ? (progress / duration) * 100 : 0;
  const iconBtn: React.CSSProperties = { width: 36, height: 36, borderRadius: "9999px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "transparent", border: "none", cursor: "pointer", padding: 0 };

  return (
    <div className="fixed inset-0 z-[100]" style={{
      background: currentTrack.cover
        ? `linear-gradient(180deg, color-mix(in srgb, var(--mq-accent) 12%, var(--mq-bg)) 0%, var(--mq-bg) 50%)`
        : "var(--mq-bg)",
      animation: "mqFtUp .2s cubic-bezier(.16,1,.3,1)",
    }}>
      <style>{`
        @keyframes mqFtUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .mq-ft { transition: transform .12s ease; -webkit-tap-highlight-color: transparent; user-select: none; }
        .mq-ft:active { transform: scale(0.9); }
        .mq-seek-ft { -webkit-appearance: none; appearance: none; width: 100%; height: 24px; background: transparent; outline: none; cursor: pointer; }
        .mq-seek-ft::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: rgba(255,255,255,0.12); }
        .mq-seek-ft::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #fff; margin-top: -5px; cursor: pointer; box-shadow: 0 0 0 4px color-mix(in srgb, var(--mq-accent) 25%, transparent); }
        .mq-seek-ft::-moz-range-track { height: 4px; border-radius: 2px; background: rgba(255,255,255,0.12); }
        .mq-seek-ft::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: #fff; border: none; cursor: pointer; box-shadow: 0 0 0 4px color-mix(in srgb, var(--mq-accent) 25%, transparent); }
        .mq-vol-ft { -webkit-appearance: none; appearance: none; width: 100%; height: 20px; background: transparent; outline: none; cursor: pointer; }
        .mq-vol-ft::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: linear-gradient(to right, var(--mq-accent) 0%, var(--mq-accent) ${volume}%, rgba(255,255,255,0.1) ${volume}%, rgba(255,255,255,0.1) 100%); }
        .mq-vol-ft::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #fff; margin-top: -4px; cursor: pointer; }
        .mq-vol-ft::-moz-range-track { height: 4px; border-radius: 2px; background: rgba(255,255,255,0.1); }
        .mq-vol-ft::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: #fff; border: none; cursor: pointer; }
      `}</style>

      {/* NO blurred background — just solid gradient for performance */}

      <div className="relative z-10 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4" style={{ paddingTop: "max(12px, env(safe-area-inset-top))", paddingBottom: 8 }}>
          <button onClick={() => setOpen(false)} className="mq-ft" style={iconBtn}><ChevronDown className="w-6 h-6" style={{ color: "var(--mq-text)" }} /></button>
          <button onClick={() => setShowMore(true)} className="mq-ft" style={iconBtn}><MoreHorizontal className="w-6 h-6" style={{ color: "var(--mq-text)" }} /></button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col px-5 pb-4">
          {/* Cover */}
          <div className="flex-1 flex items-center justify-center min-h-0 py-3">
            <div className="relative flex-shrink-0" style={{ width: "min(80vw, 340px)", aspectRatio: "1 / 1" }}
              onTouchStart={handleCoverTouchStart} onTouchEnd={handleCoverTouchEnd}>
              <div className="w-full h-full rounded-2xl overflow-hidden" style={{ boxShadow: "0 12px 32px rgba(0,0,0,0.4)" }}>
                {currentTrack.cover ? <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}><Music className="w-16 h-16" style={{ color: "rgba(255,255,255,0.5)" }} /></div>}
              </div>
            </div>
          </div>

          {/* Title + like + dislike */}
          <div className="flex items-start justify-between gap-3 mt-2 mb-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold truncate" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</h1>
              <button onClick={handleArtist} className="text-sm hover:underline mt-0.5 block truncate" style={{ color: "var(--mq-text-muted)" }}>{currentTrack.artist}</button>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={handleLike} className="mq-ft" style={{ ...iconBtn, width: 40, height: 40, backgroundColor: isLiked ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.05)" }}>
                <Heart className="w-5 h-5" style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }} fill={isLiked ? "currentColor" : "none"} />
              </button>
              <button onClick={handleDislike} className="mq-ft" style={{ ...iconBtn, width: 40, height: 40, backgroundColor: isDisliked ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)" }}>
                <ThumbsDown className="w-5 h-5" style={{ color: isDisliked ? "#ef4444" : "var(--mq-text-muted)" }} fill={isDisliked ? "currentColor" : "none"} />
              </button>
            </div>
          </div>

          {/* Seek bar — native input for smooth drag */}
          <div className="mb-4">
            <input
              ref={seekInputRef}
              type="range"
              min={0}
              max={100}
              value={seekPct}
              onChange={handleSeek}
              className="mq-seek-ft"
            />
            {/* Visual fill behind the native input */}
            <div style={{ position: "relative", height: 0, marginTop: "-18px", pointerEvents: "none" }}>
              <div ref={seekFillRef} className="rounded-full" style={{ position: "absolute", top: "7px", left: 0, height: "4px", width: `${seekPct}%`, background: "var(--mq-accent)" }} />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span ref={timeRef} className="text-[11px] font-mono tabular-nums" style={{ color: "var(--mq-text-muted)" }}>0:00</span>
              <span className="text-[11px] font-mono tabular-nums" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(duration)}</span>
            </div>
          </div>

          {/* Main controls */}
          <div className="flex items-center justify-between mb-4 px-2">
            <button onClick={toggleShuffle} className="mq-ft" style={{ ...iconBtn, width: 40, height: 40 }}><Shuffle className="w-5 h-5" style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }} /></button>
            <button onClick={prevTrack} className="mq-ft" style={{ ...iconBtn, width: 48, height: 48 }}><SkipBack className="w-7 h-7" style={{ color: "var(--mq-text)" }} fill="currentColor" /></button>
            <button onClick={togglePlay} className="mq-ft" style={{ width: 72, height: 72, borderRadius: "9999px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fff", border: "none", cursor: "pointer", padding: 0, boxShadow: "0 6px 20px rgba(255,255,255,0.15)" }}>
              {isLoading ? <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#000" }} /> : isPlaying ? <Pause className="w-8 h-8" fill="#000" style={{ color: "#000" }} /> : <Play className="w-8 h-8 ml-1" fill="#000" style={{ color: "#000" }} />}
            </button>
            <button onClick={nextTrack} className="mq-ft" style={{ ...iconBtn, width: 48, height: 48 }}><SkipForward className="w-7 h-7" style={{ color: "var(--mq-text)" }} fill="currentColor" /></button>
            <button onClick={toggleRepeat} className="mq-ft" style={{ ...iconBtn, width: 40, height: 40 }}>
              {repeat === "one" ? <Repeat1 className="w-5 h-5" style={{ color: "var(--mq-accent)" }} /> : <Repeat className="w-5 h-5" style={{ color: repeat === "all" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />}
            </button>
          </div>

          {/* Bottom row */}
          <div className="flex items-center justify-around pb-1">
            <button onClick={() => setPanel(p => p === "lyrics" ? null : "lyrics")} className="mq-ft flex flex-col items-center gap-1" style={{ ...iconBtn, width: "auto", height: "auto", flexDirection: "column" }}>
              <Mic2 className="w-5 h-5" style={{ color: panel === "lyrics" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
              <span className="text-[10px]" style={{ color: panel === "lyrics" ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>Текст</span>
            </button>
            <button onClick={() => setPanel(p => p === "queue" ? null : "queue")} className="mq-ft flex flex-col items-center gap-1" style={{ ...iconBtn, width: "auto", height: "auto", flexDirection: "column" }}>
              <ListMusic className="w-5 h-5" style={{ color: panel === "queue" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
              <span className="text-[10px]" style={{ color: panel === "queue" ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>Очередь</span>
            </button>
            <button onClick={() => setPanel(p => p === "history" ? null : "history")} className="mq-ft flex flex-col items-center gap-1" style={{ ...iconBtn, width: "auto", height: "auto", flexDirection: "column" }}>
              <History className="w-5 h-5" style={{ color: panel === "history" ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
              <span className="text-[10px]" style={{ color: panel === "history" ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>История</span>
            </button>
            <button onClick={handleShare} className="mq-ft flex flex-col items-center gap-1" style={{ ...iconBtn, width: "auto", height: "auto", flexDirection: "column" }}>
              <Share2 className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} />
              <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>Поделиться</span>
            </button>
          </div>
        </div>

        {/* Panel overlay */}
        {panel && (
          <div className="absolute inset-0 z-20 flex flex-col" style={{ background: "var(--mq-bg)", paddingTop: "max(16px, env(safe-area-inset-top))", animation: "mqFtUp .2s ease-out" }}>
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-base font-semibold" style={{ color: "var(--mq-text)" }}>{panel === "lyrics" ? "Текст песни" : panel === "queue" ? "Очередь" : "Недавно играло"}</p>
              <button onClick={() => setPanel(null)} className="mq-ft" style={iconBtn}><X className="w-5 h-5" style={{ color: "var(--mq-text)" }} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {panel === "lyrics" && (lyricsLoading ? <div className="flex items-center gap-2 py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-accent)" }} /><span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Поиск...</span></div>
                : lyrics.length ? <SyncedLyrics lines={lyrics} onSeek={seekToTime} />
                : plainLyrics ? <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--mq-text-muted)" }}>{plainLyrics}</div>
                : <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>Текст не найден</p>)}
              {panel === "queue" && (upcoming.length ? upcoming.map((t, i) => (
                <button key={t.id + i} onClick={() => { for (let j = 0; j <= i; j++) nextTrack(); setPanel(null); }} className="mq-ft w-full flex items-center gap-3 p-2 rounded-xl text-left" style={{ border: "none", cursor: "pointer", background: "transparent" }}>
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">{t.cover ? <img src={t.cover} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: "var(--mq-accent)" }} />}</div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>{t.title}</p><p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{t.artist}</p></div>
                  <span className="text-[10px] font-mono" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(t.duration)}</span>
                </button>)) : <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>Очередь пуста</p>)}
              {panel === "history" && (recent.length ? recent.map((t, i) => (
                <button key={t.id + i} onClick={() => { playTrack?.(t, [t]); setPanel(null); }} className="mq-ft w-full flex items-center gap-3 p-2 rounded-xl text-left" style={{ border: "none", cursor: "pointer", background: "transparent" }}>
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">{t.cover ? <img src={t.cover} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: "var(--mq-accent)" }} />}</div>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>{t.title}</p><p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{t.artist}</p></div>
                  <span className="text-[10px] font-mono" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(t.duration)}</span>
                </button>)) : <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>История пуста</p>)}
            </div>
          </div>
        )}

        {/* More sheet */}
        {showMore && (
          <>
            <div className="absolute inset-0 z-30" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setShowMore(false)} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 40, borderRadius: "20px 20px 0 0", padding: "20px", paddingBottom: "max(20px, env(safe-area-inset-bottom))", background: "var(--mq-card)", border: "1px solid var(--mq-border-thin)", boxShadow: "0 -8px 32px rgba(0,0,0,0.5)", animation: "mqFtUp .25s cubic-bezier(.16,1,.3,1)" }}>
              <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "rgba(255,255,255,0.15)" }} />
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">{currentTrack.cover ? <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: "var(--mq-accent)" }} />}</div>
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</p><p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{currentTrack.artist}</p></div>
              </div>
              <div className="h-px mb-3" style={{ background: "var(--mq-border-thin)" }} />
              <div className="py-3">
                <div className="flex items-center gap-3 mb-2"><Volume2 className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} /><span className="text-sm" style={{ color: "var(--mq-text)" }}>Громкость</span></div>
                <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="mq-vol-ft" style={{ marginLeft: "32px", width: "calc(100% - 32px)" }} />
              </div>
              <div className="h-px my-2" style={{ background: "var(--mq-border-thin)" }} />
              <button onClick={() => { handleShare(); setShowMore(false); }} className="mq-ft w-full flex items-center gap-3 py-3" style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                <Share2 className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} /><span className="text-sm" style={{ color: "var(--mq-text)" }}>Поделиться</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default memo(FullTrackViewMobileInner);
