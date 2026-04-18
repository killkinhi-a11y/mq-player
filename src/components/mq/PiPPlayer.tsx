"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { Play, Pause, Music, X, Minimize2, SkipBack, SkipForward } from "lucide-react";
import { formatDuration } from "@/lib/musicApi";
import { getAudioElement } from "@/lib/audioEngine";

export default function PiPPlayer() {
  const {
    currentTrack, isPlaying, togglePlay, isPiPActive, setPiPActive,
    progress, duration, nextTrack, prevTrack,
  } = useAppStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;
  const safeProgressPct = isNaN(progressPct) ? 0 : Math.max(0, Math.min(100, progressPct));

  const getInitialPos = useCallback((): { x: number; y: number } => {
    if (typeof window === "undefined") return { x: 16, y: 16 };
    return {
      x: Math.max(0, window.innerWidth - 356),
      y: Math.max(0, window.innerHeight - 220),
    };
  }, []);

  const [pos, setPos] = useState(getInitialPos);
  const [minimized, setMinimized] = useState(false);

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
      const minW = currentMinimized ? 64 : 340;
      const minH = currentMinimized ? 64 : 140;
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
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const rectWidth = rect.width || 1;
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rectWidth));
    const safeDuration = duration || 1;
    const newTime = pct * safeDuration;
    useAppStore.getState().setProgress(newTime);
    const audio = getAudioElement();
    if (audio) audio.currentTime = newTime;
  }, [duration]);

  // Reset position when PiP activates
  useEffect(() => {
    if (isPiPActive) {
      const newPos = getInitialPos();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on PiP activation
      setPos(newPos);
      setMinimized(false);
    }
  }, [isPiPActive, getInitialPos]);

  const w = minimized ? 64 : 340;
  const h = minimized ? 64 : 140;

  if (!isPiPActive || !currentTrack) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        left: isNaN(pos.x) ? 16 : pos.x,
        top: isNaN(pos.y) ? 16 : pos.y,
        zIndex: 9999,
        width: w,
        height: h,
        borderRadius: 16,
        overflow: "visible",
        userSelect: "none",
      }}
    >
      {/* Glow border */}
      <div
        style={{
          position: "absolute",
          inset: -2,
          borderRadius: 18,
          background: "var(--mq-accent)",
          opacity: 0.15,
          filter: "blur(8px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          backgroundColor: "var(--mq-card)",
          border: "1px solid var(--mq-border)",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 16px var(--mq-glow)",
        }}
      >
        {minimized ? (
          <div style={{ width: 64, height: 64, position: "relative" }}>
            {currentTrack.cover ? (
              <img
                src={currentTrack.cover}
                alt=""
                style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 16 }}
              />
            ) : (
              <div
                style={{
                  width: 64, height: 64, borderRadius: 16,
                  backgroundColor: "var(--mq-accent)",
                  display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.6,
                }}
              >
                <Music size={22} style={{ color: "var(--mq-text)" }} />
              </div>
            )}
            {isPlaying && (
              <div style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 2 }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 3, borderRadius: 2, backgroundColor: "var(--mq-accent)",
                      animation: `mqPipEq 0.6s ease-in-out ${i * 0.15}s infinite alternate`,
                    }}
                  />
                ))}
              </div>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setPiPActive(false); }}
              style={{
                position: "absolute", top: -4, right: -4, width: 20, height: 20,
                borderRadius: "50%", backgroundColor: "rgba(239,68,68,0.9)", border: "none",
                color: "white", fontSize: 10, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1, padding: 0,
              }}
            >
              <X size={10} />
            </button>
            <button
              onDoubleClick={(e) => { e.stopPropagation(); setMinimized(false); }}
              onClick={(e) => { e.stopPropagation(); openFullView(); }}
              style={{ position: "absolute", inset: 0, cursor: "pointer", background: "transparent", border: "none", padding: 0, width: "100%", height: "100%" }}
            />
          </div>
        ) : (
          <div style={{ width: 340 }}>
            {/* Drag handle */}
            <div
              onMouseDown={(e) => handleDragStart(e.clientX, e.clientY, pos, minimized)}
              onTouchStart={(e) => handleDragStart(e.touches[0].clientX, e.touches[0].clientY, pos, minimized)}
              style={{ display: "flex", justifyContent: "center", padding: "6px 0 2px", cursor: "grab" }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "var(--mq-border)", opacity: 0.6 }} />
            </div>
            {/* Content */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 12px 4px" }}>
              <div onClick={(e) => { e.stopPropagation(); openFullView(); }} style={{ cursor: "pointer", flexShrink: 0 }}>
                {currentTrack.cover ? (
                  <img src={currentTrack.cover} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: "var(--mq-accent)", opacity: 0.4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Music size={20} style={{ color: "var(--mq-text)" }} />
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
            </div>
            {/* Controls row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "2px 12px 4px" }}>
              <button onClick={(e) => { e.stopPropagation(); prevTrack(); }} style={{ width: 28, height: 28, borderRadius: "50%", border: "none", backgroundColor: "transparent", color: "var(--mq-text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <SkipBack size={14} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", backgroundColor: "var(--mq-accent)", color: "var(--mq-text)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: isPlaying ? "0 0 12px var(--mq-glow)" : "none" }}>
                {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); nextTrack(); }} style={{ width: 28, height: 28, borderRadius: "50%", border: "none", backgroundColor: "transparent", color: "var(--mq-text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <SkipForward size={14} />
              </button>
              <div style={{ flex: 1 }} />
              <button onClick={(e) => { e.stopPropagation(); setMinimized(true); }} style={{ width: 28, height: 28, borderRadius: "50%", border: "none", backgroundColor: "rgba(255,255,255,0.08)", color: "var(--mq-text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Minimize2 size={12} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); setPiPActive(false); }} style={{ width: 28, height: 28, borderRadius: "50%", border: "none", backgroundColor: "rgba(255,255,255,0.08)", color: "var(--mq-text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={12} />
              </button>
            </div>
            {/* Progress bar */}
            <div onClick={handleSeek} style={{ height: 4, backgroundColor: "rgba(255,255,255,0.08)", position: "relative", margin: "0 12px 4px", borderRadius: 2, cursor: "pointer" }}>
              <div style={{ height: "100%", width: safeProgressPct + "%", backgroundColor: "var(--mq-accent)", borderRadius: 2, transition: "width 0.3s linear" }} />
            </div>
            {/* Time display */}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0 12px 8px", fontSize: 9, color: "var(--mq-text-muted)" }}>
              <span>{formatDuration(Math.floor(progress))}</span>
              <span style={{ color: "var(--mq-accent)", fontSize: 8, opacity: 0.7 }}>MQ Player</span>
              <span>{formatDuration(Math.floor(duration))}</span>
            </div>
          </div>
        )}
      </div>
      <style>{"@keyframes mqPipEq{0%{height:4px}100%{height:14px}}"}</style>
    </div>
  );
}
