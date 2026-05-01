"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { Play, Pause, Music, X, Minimize2, SkipBack, SkipForward, Volume2, VolumeX, Heart, ThumbsDown } from "lucide-react";
import { formatDuration } from "@/lib/musicApi";
import { getAudioElement } from "@/lib/audioEngine";

export default function PiPPlayer() {
  const {
    currentTrack, isPlaying, togglePlay, isPiPActive, setPiPActive,
    progress, duration, nextTrack, prevTrack, volume, setVolume,
    isFullTrackViewOpen, toggleLike, toggleDislike, likedTrackIds, dislikedTrackIds,
  } = useAppStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const prevFullViewRef = useRef(false);

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;
  const safeProgressPct = isNaN(progressPct) ? 0 : Math.max(0, Math.min(100, progressPct));
  const isLiked = currentTrack ? (likedTrackIds || []).includes(currentTrack.id) : false;
  const isDisliked = currentTrack ? (dislikedTrackIds || []).includes(currentTrack.id) : false;

  // Responsive sizing
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  const expandedW = isMobile ? 300 : 340;
  const expandedH = isMobile ? 130 : 140;
  const minimizedSize = isMobile ? 56 : 64;

  const getInitialPos = useCallback((): { x: number; y: number } => {
    if (typeof window === "undefined") return { x: 16, y: 16 };
    const w = typeof window !== "undefined" && window.innerWidth < 640 ? 300 : 340;
    return {
      x: Math.max(8, window.innerWidth - w - 16),
      y: Math.max(8, window.innerHeight - (isMobile ? 130 : 220)),
    };
  }, [isMobile]);

  const [pos, setPos] = useState(getInitialPos);
  const [minimized, setMinimized] = useState(false);
  const [showVolume, setShowVolume] = useState(false);

  // Auto-minimize when FullTrackView opens, restore when it closes
  useEffect(() => {
    if (isFullTrackViewOpen && !prevFullViewRef.current && isPiPActive) {
      setMinimized(true);
    }
    prevFullViewRef.current = isFullTrackViewOpen;
  }, [isFullTrackViewOpen, isPiPActive]);

  const openFullView = useCallback(() => {
    setPiPActive(false);
    useAppStore.getState().setFullTrackViewOpen(true);
  }, [setPiPActive]);

  const handleDragStart = useCallback((clientX: number, clientY: number, currentPos: { x: number; y: number }, currentMinimized: boolean) => {
    isDraggingRef.current = true;
    dragOffsetRef.current = {
      x: clientX - currentPos.x,
      y: clientY - currentPos.y,
    };

    const onMove = (cx: number, cy: number) => {
      if (!isDraggingRef.current) return;
      const minW = currentMinimized ? minimizedSize : expandedW;
      const minH = currentMinimized ? minimizedSize : expandedH;
      const maxX = typeof window !== "undefined" ? window.innerWidth : 1920;
      const maxY = typeof window !== "undefined" ? window.innerHeight : 1080;
      const newX = Math.max(0, Math.min(cx - dragOffsetRef.current.x, maxX - minW));
      const newY = Math.max(0, Math.min(cy - dragOffsetRef.current.y, maxY - minH));
      setPos({ x: newX, y: newY });
    };

    const onMouseMove = (ev: MouseEvent) => onMove(ev.clientX, ev.clientY);
    const onTouchMove = (ev: TouchEvent) => {
      ev.preventDefault();
      onMove(ev.touches[0].clientX, ev.touches[0].clientY);
    };
    const onEnd = () => {
      isDraggingRef.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onEnd);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onEnd);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onEnd);
  }, [minimizedSize, expandedW, expandedH]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const rectWidth = rect.width || 1;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rectWidth));
    const safeDuration = duration || 1;
    const newTime = pct * safeDuration;
    useAppStore.getState().setProgress(newTime);
    const audio = getAudioElement();
    if (audio) audio.currentTime = newTime;
  }, [duration]);

  // Reset position only on fresh activation (not on tab switch)
  useEffect(() => {
    if (isPiPActive && !currentTrack) return;
    if (isPiPActive) {
      // Only reset if position is NaN or way off screen
      const maxX = typeof window !== "undefined" ? window.innerWidth : 1920;
      const maxY = typeof window !== "undefined" ? window.innerHeight : 1080;
      if (isNaN(pos.x) || isNaN(pos.y) || pos.x > maxX || pos.y > maxY) {
        setPos(getInitialPos());
      }
      // Don't reset minimized state on re-activation — let user keep their choice
    }
  }, [isPiPActive, getInitialPos, currentTrack, pos.x, pos.y]);

  // Update progress from audio element for smooth playback
  useEffect(() => {
    if (!isPiPActive || !isPlaying) return;
    const interval = setInterval(() => {
      const audio = getAudioElement();
      if (audio && !audio.paused && audio.duration) {
        useAppStore.getState().setProgress(audio.currentTime);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [isPiPActive, isPlaying]);

  const w = minimized ? minimizedSize : expandedW;
  const h = minimized ? minimizedSize : expandedH;

  if (!isPiPActive || !currentTrack) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        left: isNaN(pos.x) ? 16 : pos.x,
        top: isNaN(pos.y) ? 16 : pos.y,
        zIndex: isFullTrackViewOpen ? 10001 : 9999,
        width: w,
        height: h,
        borderRadius: minimized ? 16 : 16,
        overflow: "visible",
        userSelect: "none",
        transition: isDraggingRef.current ? "none" : "width 0.2s ease, height 0.2s ease",
      }}
    >
      {/* Glow border */}
      {!minimized && (
        <div style={{
          position: "absolute", inset: -2, borderRadius: 18,
          background: "var(--mq-accent)", opacity: 0.15, filter: "blur(8px)", pointerEvents: "none",
        }} />
      )}
      <div style={{
        position: "relative", width: "100%", height: "100%",
        backgroundColor: "var(--mq-card)",
        border: "1px solid var(--mq-border)",
        borderRadius: 16, overflow: "hidden",
        boxShadow: minimized
          ? "0 4px 16px rgba(0,0,0,0.3)"
          : "0 8px 32px rgba(0,0,0,0.4), 0 0 16px var(--mq-glow)",
      }}>
        {minimized ? (
          <div style={{ width: minimizedSize, height: minimizedSize, position: "relative" }}>
            {currentTrack.cover ? (
              <img src={currentTrack.cover} alt=""
                style={{ width: minimizedSize, height: minimizedSize, objectFit: "cover", borderRadius: 16 }} />
            ) : (
              <div style={{
                width: minimizedSize, height: minimizedSize, borderRadius: 16,
                backgroundColor: "var(--mq-accent)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.6,
              }}>
                <Music size={20} style={{ color: "var(--mq-text)" }} />
              </div>
            )}
            {/* Playing indicator — EQ bars */}
            {isPlaying && (
              <div style={{
                position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)",
                display: "flex", gap: 2,
              }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{
                    width: 3, borderRadius: 2, backgroundColor: "var(--mq-accent)",
                    animation: `mqPipEq 0.6s ease-in-out ${i * 0.15}s infinite alternate`,
                  }} />
                ))}
              </div>
            )}
            {/* Close button */}
            <button onClick={(e) => { e.stopPropagation(); setPiPActive(false); }}
              style={{
                position: "absolute", top: -4, right: -4, width: 20, height: 20,
                borderRadius: "50%", backgroundColor: "rgba(239,68,68,0.9)", border: "none",
                color: "white", fontSize: 10, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, padding: 0,
              }}>
              <X size={10} />
            </button>
            {/* Click to expand / open full view */}
            <button
              onClick={(e) => { e.stopPropagation(); setMinimized(false); }}
              onDoubleClick={(e) => { e.stopPropagation(); openFullView(); }}
              style={{ position: "absolute", inset: 0, cursor: "pointer", background: "transparent", border: "none", padding: 0, width: "100%", height: "100%" }}
            />
          </div>
        ) : (
          <div style={{ width: expandedW }}>
            {/* Drag handle */}
            <div
              onMouseDown={(e) => handleDragStart(e.clientX, e.clientY, pos, minimized)}
              onTouchStart={(e) => handleDragStart(e.touches[0].clientX, e.touches[0].clientY, pos, minimized)}
              style={{ display: "flex", justifyContent: "center", padding: "6px 0 2px", cursor: "grab" }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "var(--mq-border)", opacity: 0.6 }} />
            </div>
            {/* Content: cover + info */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 12px 4px" }}>
              <div onClick={(e) => { e.stopPropagation(); openFullView(); }} style={{ cursor: "pointer", flexShrink: 0 }}>
                {currentTrack.cover ? (
                  <img src={currentTrack.cover} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: "var(--mq-accent)", opacity: 0.4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Music size={18} style={{ color: "var(--mq-text)" }} />
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--mq-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: 0, lineHeight: 1.3 }}>
                  {currentTrack.title}
                </p>
                <p style={{ fontSize: 11, color: "var(--mq-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: "2px 0 0", lineHeight: 1.2 }}>
                  {currentTrack.artist}
                </p>
              </div>
              {/* Like / Dislike */}
              <button onClick={(e) => { e.stopPropagation(); if (currentTrack) toggleLike(currentTrack.id, currentTrack); }}
                style={{ width: 24, height: 24, borderRadius: "50%", border: "none", backgroundColor: "transparent", color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Heart size={13} fill={isLiked ? "currentColor" : "none"} />
              </button>
            </div>
            {/* Controls row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "2px 12px 4px" }}>
              <button onClick={(e) => { e.stopPropagation(); prevTrack(); }}
                style={{ width: 28, height: 28, borderRadius: "50%", border: "none", backgroundColor: "transparent", color: "var(--mq-text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <SkipBack size={14} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                style={{ width: 36, height: 36, borderRadius: "50%", border: "none", backgroundColor: "var(--mq-accent)", color: "var(--mq-text)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: isPlaying ? "0 0 12px var(--mq-glow)" : "none" }}>
                {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); nextTrack(); }}
                style={{ width: 28, height: 28, borderRadius: "50%", border: "none", backgroundColor: "transparent", color: "var(--mq-text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <SkipForward size={14} />
              </button>
              <div style={{ flex: 1 }} />
              {/* Volume */}
              <div style={{ position: "relative" }}
                onMouseEnter={() => setShowVolume(true)} onMouseLeave={() => setShowVolume(false)}>
                <button onClick={(e) => { e.stopPropagation(); setVolume(volume > 0 ? 0 : 70); }}
                  style={{ width: 28, height: 28, borderRadius: "50%", border: "none", backgroundColor: "transparent", color: "var(--mq-text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
                </button>
                {showVolume && (
                  <div style={{
                    position: "absolute", bottom: "100%", right: 0, marginBottom: 4,
                    backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)",
                    borderRadius: 8, padding: "8px 4px", boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{
                      width: 80, height: 4, borderRadius: 2,
                      backgroundColor: "var(--mq-border)", position: "relative", cursor: "pointer",
                    }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                        setVolume(Math.round(pct * 100));
                      }}
                    >
                      <div style={{ height: "100%", width: `${volume}%`, backgroundColor: "var(--mq-accent)", borderRadius: 2 }} />
                    </div>
                  </div>
                )}
              </div>
              {/* Minimize */}
              <button onClick={(e) => { e.stopPropagation(); setMinimized(true); }}
                style={{ width: 28, height: 28, borderRadius: "50%", border: "none", backgroundColor: "rgba(255,255,255,0.08)", color: "var(--mq-text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Minimize2 size={12} />
              </button>
              {/* Close */}
              <button onClick={(e) => { e.stopPropagation(); setPiPActive(false); }}
                style={{ width: 28, height: 28, borderRadius: "50%", border: "none", backgroundColor: "rgba(255,255,255,0.08)", color: "var(--mq-text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={12} />
              </button>
            </div>
            {/* Progress bar — click + touch seek */}
            <div
              onClick={handleSeek}
              onTouchStart={handleSeek}
              style={{
                height: 4, backgroundColor: "rgba(255,255,255,0.08)", position: "relative",
                margin: "0 12px 4px", borderRadius: 2, cursor: "pointer",
              }}
            >
              <div style={{ height: "100%", width: safeProgressPct + "%", backgroundColor: "var(--mq-accent)", borderRadius: 2 }} />
              <div style={{
                position: "absolute", top: "50%", left: safeProgressPct + "%",
                width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--mq-accent)",
                transform: "translate(-50%, -50%)", boxShadow: "0 0 4px var(--mq-glow)",
                opacity: 0.9,
              }} />
            </div>
            {/* Time display */}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0 12px 8px", fontSize: 9, color: "var(--mq-text-muted)" }}>
              <span>{formatDuration(Math.floor(progress))}</span>
              <span style={{ color: "var(--mq-accent)", fontSize: 8, opacity: 0.7 }}>MQ</span>
              <span>{formatDuration(Math.floor(duration))}</span>
            </div>
          </div>
        )}
      </div>
      <style>{"@keyframes mqPipEq{0%{height:4px}100%{height:14px}}"}</style>
    </div>
  );
}
