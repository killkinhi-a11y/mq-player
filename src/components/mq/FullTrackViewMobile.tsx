"use client";

import React, { useState, useRef, useCallback, useEffect, memo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { getAudioElement } from "@/lib/audioEngine";
import { formatDuration } from "@/lib/musicApi";
import type { Track } from "@/lib/musicApi";
import { toast } from "@/hooks/use-toast";
import { Play, Pause, SkipBack, SkipForward, ChevronDown, Heart, Shuffle, Repeat, Repeat1, Music, ListMusic, Share2, Loader2, Mic2, ThumbsDown, History, X, MoreHorizontal, Volume2 } from "lucide-react";

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

  const [panel, setPanel] = useState<"queue" | "lyrics" | "history" | null>(null);
  const [lyrics, setLyrics] = useState<SyncedLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState("");
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [showMore, setShowMore] = useState(false);

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
          // Update input value (native input handles its own visual)
          if (seekInputRef.current && document.activeElement !== seekInputRef.current) {
            seekInputRef.current.value = String(pct);
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

  // ── Seek: native input onChange ──
  const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
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

  const iconBtn: React.CSSProperties = { width: 36, height: 36, borderRadius: "9999px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "transparent", border: "none", cursor: "pointer", padding: 0 };

  return (
    <div className="fixed inset-0 z-[100]" style={{
      background: currentTrack.cover
        ? `linear-gradient(180deg, color-mix(in srgb, var(--mq-accent) 12%, var(--mq-bg)) 0%, var(--mq-bg) 60%)`
        : "var(--mq-bg)",
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
        }
        .mq-ft-seek-input::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 2px;
          background: linear-gradient(to right,
            var(--mq-accent) 0%, var(--mq-accent) ${seekPct}%,
            rgba(255,255,255,0.12) ${seekPct}%, rgba(255,255,255,0.12) 100%);
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
          background: rgba(255,255,255,0.12);
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
        }
        .mq-ft-vol::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 2px;
          background: linear-gradient(to right, var(--mq-accent) 0%, var(--mq-accent) ${volume}%, rgba(255,255,255,0.1) ${volume}%, rgba(255,255,255,0.1) 100%);
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
        .mq-ft-vol::-moz-range-track { height: 4px; border-radius: 2px; background: rgba(255,255,255,0.1); }
        .mq-ft-vol::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: #fff; border: none; cursor: pointer; }
      `}</style>

      {/* NO blurred background — just solid gradient for max performance */}

      <div className="relative z-10 h-full flex flex-col">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4" style={{ paddingTop: "max(12px, env(safe-area-inset-top))", paddingBottom: 8, flexShrink: 0 }}>
          <button onClick={() => setOpen(false)} className="mq-ft-btn" style={iconBtn}><ChevronDown className="w-6 h-6" style={{ color: "var(--mq-text)" }} /></button>
          <button onClick={() => setShowMore(true)} className="mq-ft-btn" style={iconBtn}><MoreHorizontal className="w-6 h-6" style={{ color: "var(--mq-text)" }} /></button>
        </div>

        {/* ── Cover (fixed size, no blur, no parallax) ── */}
        <div className="flex items-center justify-center px-6" style={{ flexShrink: 0, paddingTop: 8, paddingBottom: 16 }}>
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              width: "min(78vw, 320px)",
              aspectRatio: "1 / 1",
              boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
            }}
            onTouchStart={handleCoverTouchStart}
            onTouchEnd={handleCoverTouchEnd}
          >
            {currentTrack.cover ? (
              <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" draggable={false} />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}>
                <Music className="w-16 h-16" style={{ color: "rgba(255,255,255,0.5)" }} />
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
            <button onClick={handleLike} className="mq-ft-btn" style={{ ...iconBtn, width: 40, height: 40, backgroundColor: isLiked ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.05)" }}>
              <Heart className="w-5 h-5" style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }} fill={isLiked ? "currentColor" : "none"} />
            </button>
            <button onClick={handleDislike} className="mq-ft-btn" style={{ ...iconBtn, width: 40, height: 40, backgroundColor: isDisliked ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)" }}>
              <ThumbsDown className="w-5 h-5" style={{ color: isDisliked ? "#ef4444" : "var(--mq-text-muted)" }} fill={isDisliked ? "currentColor" : "none"} />
            </button>
          </div>
        </div>

        {/* ── Progress bar — native input for reliable drag ── */}
        <div className="px-5 mb-3" style={{ flexShrink: 0 }}>
          <input
            ref={seekInputRef}
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={seekPct}
            onChange={handleSeekChange}
            onPointerDown={() => { isDraggingRef.current = true; }}
            onPointerUp={() => { isDraggingRef.current = false; }}
            className="mq-ft-seek-input"
          />
          <div className="flex items-center justify-between mt-1">
            <span ref={timeCurrentRef} className="text-[11px] font-mono tabular-nums" style={{ color: "var(--mq-text-muted)" }}>0:00</span>
            <span className="text-[11px] font-mono tabular-nums" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(duration)}</span>
          </div>
        </div>

        {/* ── Main controls ── */}
        <div className="flex items-center justify-between px-5 mb-4" style={{ flexShrink: 0 }}>
          <button onClick={toggleShuffle} className="mq-ft-btn" style={{ ...iconBtn, width: 40, height: 40 }}><Shuffle className="w-5 h-5" style={{ color: shuffle ? "var(--mq-accent)" : "var(--mq-text-muted)" }} /></button>
          <button onClick={prevTrack} className="mq-ft-btn" style={{ ...iconBtn, width: 48, height: 48 }}><SkipBack className="w-7 h-7" style={{ color: "var(--mq-text)" }} fill="currentColor" /></button>
          <button onClick={togglePlay} className="mq-ft-btn" style={{ width: 68, height: 68, borderRadius: "9999px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fff", border: "none", cursor: "pointer", padding: 0, boxShadow: "0 6px 20px rgba(255,255,255,0.15)" }}>
            {isLoading ? <Loader2 className="w-7 h-7 animate-spin" style={{ color: "#000" }} /> : isPlaying ? <Pause className="w-7 h-7" fill="#000" style={{ color: "#000" }} /> : <Play className="w-7 h-7 ml-1" fill="#000" style={{ color: "#000" }} />}
          </button>
          <button onClick={nextTrack} className="mq-ft-btn" style={{ ...iconBtn, width: 48, height: 48 }}><SkipForward className="w-7 h-7" style={{ color: "var(--mq-text)" }} fill="currentColor" /></button>
          <button onClick={toggleRepeat} className="mq-ft-btn" style={{ ...iconBtn, width: 40, height: 40 }}>
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
              <button onClick={() => setPanel(null)} className="mq-ft-btn" style={iconBtn}><X className="w-5 h-5" style={{ color: "var(--mq-text)" }} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {panel === "lyrics" && (lyricsLoading ? <div className="flex items-center gap-2 py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-accent)" }} /><span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Поиск...</span></div>
                : lyrics.length ? <SyncedLyrics lines={lyrics} onSeek={seekToTime} />
                : plainLyrics ? <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--mq-text-muted)" }}>{plainLyrics}</div>
                : <p className="text-xs py-4 text-center" style={{ color: "var(--mq-text-muted)" }}>Текст не найден</p>)}
              {panel === "queue" && (upcoming.length ? upcoming.map((t, i) => (
                <button key={t.id + i} onClick={() => { for (let j = 0; j <= i; j++) nextTrack(); setPanel(null); }} className="mq-ft-btn w-full flex items-center gap-3 p-2 rounded-xl text-left" style={{ border: "none", cursor: "pointer", background: "transparent" }}>
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

        {/* ── More sheet ── */}
        {showMore && (
          <>
            <div className="absolute inset-0 z-30" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setShowMore(false)} />
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 40, borderRadius: "20px 20px 0 0", padding: "20px", paddingBottom: "max(20px, env(safe-area-inset-bottom))", background: "var(--mq-card)", border: "1px solid var(--mq-border-thin)", boxShadow: "0 -8px 32px rgba(0,0,0,0.5)", animation: "mqFtSlideUp 0.25s cubic-bezier(0.32, 0.72, 0, 1)" }}>
              <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "rgba(255,255,255,0.15)" }} />
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">{currentTrack.cover ? <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ background: "var(--mq-accent)" }} />}</div>
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{currentTrack.title}</p><p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{currentTrack.artist}</p></div>
              </div>
              <div className="h-px mb-3" style={{ background: "var(--mq-border-thin)" }} />
              <div className="py-3">
                <div className="flex items-center gap-3 mb-2"><Volume2 className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} /><span className="text-sm" style={{ color: "var(--mq-text)" }}>Громкость</span></div>
                <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} className="mq-ft-vol" style={{ marginLeft: "32px", width: "calc(100% - 32px)" }} />
              </div>
              <div className="h-px my-2" style={{ background: "var(--mq-border-thin)" }} />
              <button onClick={() => { handleShare(); setShowMore(false); }} className="mq-ft-btn w-full flex items-center gap-3 py-3" style={{ background: "transparent", border: "none", cursor: "pointer" }}>
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
