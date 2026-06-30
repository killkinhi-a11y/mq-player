"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import {
  Play, Pause, SkipForward, Heart, Music, Loader2,
  Home, Search, Library, MessageCircle, Settings, ChevronUp,
} from "lucide-react";
import { getAudioElement } from "@/lib/audioEngine";
import type { ViewType } from "@/store/useAppStore";

// ═════════════════════════════════════════════════════════════════════════
// MobileDock — unified bottom bar: Player + Navigation in ONE glass container
// Optimized for mobile performance:
//   - No framer-motion drag (uses tap-to-open instead of swipe-up)
//   - CSS-only animations (no motion.div wrappers on every button)
//   - RAF-driven progress bar (no per-second React re-render)
//   - Minimal re-renders
// ═════════════════════════════════════════════════════════════════════════

const navItems: { id: ViewType; icon: typeof Home; label: string; badgeKey?: "messenger" | "settings" }[] = [
  { id: "main", icon: Home, label: "Главная" },
  { id: "search", icon: Search, label: "Поиск" },
  { id: "library", icon: Library, label: "Библиотека" },
  { id: "messenger", icon: MessageCircle, label: "Чаты", badgeKey: "messenger" },
  { id: "settings", icon: Settings, label: "Настройки", badgeKey: "settings" },
];

export default function MobileDock() {
  // ── Store ──
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const duration = useAppStore((s) => s.duration);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const playbackState = useAppStore((s) => s.playbackState);
  const miniPlayerHidden = useAppStore((s) => s.miniPlayerHidden);
  const isFullTrackViewOpen = useAppStore((s) => s.isFullTrackViewOpen);
  const currentView = useAppStore((s) => s.currentView);
  const unreadCounts = useAppStore((s) => s.unreadCounts);
  const supportUnreadCount = useAppStore((s) => s.supportUnreadCount);
  const compactMode = useAppStore((s) => s.compactMode);

  const togglePlay = useAppStore((s) => s.togglePlay);
  const nextTrack = useAppStore((s) => s.nextTrack);
  const setProgress = useAppStore((s) => s.setProgress);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const setFullTrackViewOpen = useAppStore((s) => s.setFullTrackViewOpen);
  const setView = useAppStore((s) => s.setView);

  // ── Progress bar seek ──
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // RAF-driven progress bar update (no React state per second)
  useEffect(() => {
    let rafId = 0;
    const update = () => {
      const p = useAppStore.getState().progress;
      const d = useAppStore.getState().duration;
      if (d > 0 && progressFillRef.current) {
        const pct = (p / d) * 100;
        progressFillRef.current.style.width = `${pct}%`;
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, []);

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

  const handleSeekStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    seekTo(e.touches[0].clientX);
  }, [seekTo]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: TouchEvent) => seekTo(e.touches[0].clientX);
    const onEnd = () => setIsDragging(false);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [isDragging, seekTo]);

  // ── Swipe-left to skip track (on cover) ──
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
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2 && dt < 500) {
      if (dx < 0) {
        nextTrack();
        if ("vibrate" in navigator) { try { navigator.vibrate(12); } catch {} }
      }
    }
  }, [nextTrack]);

  // ── Derived ──
  const showPlayer = currentTrack && !miniPlayerHidden && !isFullTrackViewOpen;
  const isLiked = currentTrack ? likedTrackIds.includes(currentTrack.id) : false;
  const isLoading = playbackState === "loading" || playbackState === "buffering";
  const messengerBadge = Object.values(unreadCounts).reduce((sum, c) => sum + (c || 0), 0);
  const settingsBadge = supportUnreadCount;

  const getBadge = (key?: string) => {
    if (key === "messenger") return messengerBadge;
    if (key === "settings") return settingsBadge;
    return 0;
  };

  const openFullPlayer = useCallback(() => {
    if (currentTrack) setFullTrackViewOpen(true);
  }, [currentTrack, setFullTrackViewOpen]);

  const handleLike = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentTrack) toggleLike(currentTrack.id, currentTrack);
  }, [currentTrack, toggleLike]);

  const handlePlayPause = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    togglePlay();
  }, [togglePlay]);

  const handleNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    nextTrack();
  }, [nextTrack]);

  const handleNavClick = useCallback((item: typeof navItems[number], isActive: boolean) => {
    if ("vibrate" in navigator) {
      try { navigator.vibrate(isActive ? 5 : 12); } catch {}
    }
    setView(item.id);
    if (item.id === "search") {
      setTimeout(() => {
        const searchInput = document.querySelector<HTMLInputElement>("[data-search-input]");
        searchInput?.focus();
      }, 100);
    }
  }, [setView]);

  return (
    <div
      className="fixed lg:hidden left-2 right-2 z-[60]"
      style={{ bottom: "calc(8px + env(safe-area-inset-bottom, 0px))" }}
    >
      <style>{`
        .mq-dock-btn { transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s ease; }
        .mq-dock-btn:active { transform: scale(0.9); }
        .mq-eq-bar { animation: mqEq 0.6s ease-in-out infinite; transform-origin: bottom; }
        @keyframes mqEq { 0%, 100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }
        @keyframes mqDockIn { from { transform: translateY(60px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes mqPlayerIn { from { max-height: 0; opacity: 0; } to { max-height: 100px; opacity: 1; } }
      `}</style>
      <div
        className="rounded-[24px] overflow-hidden"
        style={{
          background: "color-mix(in srgb, var(--mq-bg) 70%, transparent)",
          backdropFilter: "blur(40px) saturate(200%)",
          WebkitBackdropFilter: "blur(40px) saturate(200%)",
          border: "1px solid var(--mq-border-thin)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
          animation: "mqDockIn 0.4s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* ── PLAYER SECTION ── */}
        {showPlayer && (
          <div
            style={{
              animation: "mqPlayerIn 0.25s ease-out",
              overflow: "hidden",
            }}
          >
            {/* Progress bar — thin line at very top */}
            <div
              ref={progressBarRef}
              className="h-[3px] w-full relative cursor-pointer"
              onTouchStart={handleSeekStart}
            >
              <div className="absolute inset-0" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
              <div
                ref={progressFillRef}
                className="absolute inset-y-0 left-0"
                style={{
                  width: "0%",
                  backgroundColor: "var(--mq-accent)",
                  boxShadow: "0 0 6px color-mix(in srgb, var(--mq-accent) 50%, transparent)",
                  willChange: "width",
                  transform: "translateZ(0)",
                }}
              />
            </div>

            {/* Player content */}
            <div className="flex items-center gap-2.5 px-3 py-2 relative">
              {/* Cover + info — tap opens full player */}
              <button
                onClick={openFullPlayer}
                onTouchStart={handleCoverTouchStart}
                onTouchEnd={handleCoverTouchEnd}
                className="flex items-center gap-2.5 flex-1 min-w-0 text-left cursor-pointer"
                style={{ background: "transparent", border: "none", padding: 0 }}
              >
                <div
                  className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0"
                  style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
                >
                  {currentTrack!.cover ? (
                    <img src={currentTrack!.cover} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}>
                      <Music className="w-4 h-4" style={{ color: "rgba(255,255,255,0.7)" }} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold truncate leading-tight" style={{ color: "var(--mq-text)" }}>
                    {currentTrack!.title}
                  </p>
                  <p className="text-[11px] truncate leading-tight mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
                    {currentTrack!.artist}
                  </p>
                </div>
                <ChevronUp className="w-3.5 h-3.5 flex-shrink-0 opacity-40" style={{ color: "var(--mq-text-muted)" }} />
              </button>

              {/* Like */}
              <button
                onClick={handleLike}
                className="mq-dock-btn w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                aria-label="Нравится"
              >
                <Heart
                  className="w-[18px] h-[18px]"
                  style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
                  fill={isLiked ? "currentColor" : "none"}
                />
              </button>

              {/* Play/Pause */}
              <button
                onClick={handlePlayPause}
                className="mq-dock-btn w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: "var(--mq-accent)",
                  boxShadow: "0 2px 8px color-mix(in srgb, var(--mq-accent) 30%, transparent)",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
                aria-label="Play/Pause"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#fff" }} />
                ) : isPlaying ? (
                  <Pause className="w-4 h-4" fill="#fff" style={{ color: "#fff" }} />
                ) : (
                  <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
                )}
              </button>

              {/* Next */}
              <button
                onClick={handleNext}
                className="mq-dock-btn w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                aria-label="Следующий"
              >
                <SkipForward className="w-[18px] h-[18px]" style={{ color: "var(--mq-text-muted)" }} fill="currentColor" />
              </button>
            </div>

            {/* Divider */}
            <div className="h-px mx-3" style={{ backgroundColor: "rgba(255,255,255,0.04)" }} />
          </div>
        )}

        {/* ── NAVIGATION SECTION ── */}
        <div className={`flex items-center justify-around ${compactMode ? "py-2" : "py-2.5"} px-2`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            const badgeCount = getBadge(item.badgeKey);
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item, isActive)}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                tabIndex={0}
                className="mq-dock-btn flex flex-col items-center gap-0.5 px-2 py-1.5 min-w-[44px] min-h-[44px] cursor-pointer relative"
                style={{
                  color: isActive ? "var(--mq-accent)" : "color-mix(in srgb, var(--mq-text-muted) 75%, transparent)",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                }}
              >
                {isActive && (
                  <div
                    className="absolute inset-0 rounded-xl"
                    style={{
                      background: "color-mix(in srgb, var(--mq-accent) 14%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--mq-accent) 22%, transparent)",
                      boxShadow: "0 0 14px color-mix(in srgb, var(--mq-accent) 20%, transparent), inset 0 1px 0 rgba(255,255,255,0.05)",
                    }}
                  />
                )}
                <div className="relative z-10 flex flex-col items-center gap-0.5">
                  <div className="relative">
                    <Icon
                      className="w-[18px] h-[18px]"
                      strokeWidth={isActive ? 2.4 : 1.6}
                      style={isActive ? {
                        color: "var(--mq-accent)",
                        filter: "drop-shadow(0 0 5px color-mix(in srgb, var(--mq-accent) 40%, transparent))",
                      } : undefined}
                    />
                    {badgeCount > 0 && (
                      <span
                        className="absolute -top-1.5 -right-2 min-w-[12px] h-[12px] rounded-full flex items-center justify-center text-[11px] font-bold px-px"
                        style={{
                          background: "var(--mq-accent)",
                          color: "var(--mq-text-on-accent, #fff)",
                          boxShadow: "0 0 8px color-mix(in srgb, var(--mq-accent) 50%, transparent)",
                        }}
                      >
                        {badgeCount > 99 ? "99" : badgeCount}
                      </span>
                    )}
                  </div>
                  <span
                    className="text-[10px] font-medium leading-tight max-w-[56px] truncate"
                    style={{ letterSpacing: "-0.01em", fontWeight: isActive ? 600 : 400 }}
                  >
                    {item.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
