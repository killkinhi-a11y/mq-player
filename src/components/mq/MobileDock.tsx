"use client";

import React, { useRef, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import {
  Play, Pause, SkipForward, Heart, Music, Loader2,
  Home, Search, Library, MessageCircle, Settings,
} from "lucide-react";
import { getAudioElement } from "@/lib/audioEngine";
import { useSmoothProgress } from "@/hooks/use-smooth-progress";
import type { ViewType } from "@/store/useAppStore";

// ═════════════════════════════════════════════════════════════════════════
// MobileDock — REDESIGNED FROM SCRATCH
//
// Design philosophy:
// - Ultra-compact: minimal vertical space
// - Two zones: mini-player (thin bar) + nav (5 icons)
// - Glass morphism container, no visible divider
// - Active nav = accent color + top dot indicator (no full pill)
// - Mini-player: just cover + title/artist + play/pause (tap opens full)
// - No next button on mini-player (swipe cover left to skip)
// - Progress as a 2px line at the very top of the container
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

  const togglePlay = useAppStore((s) => s.togglePlay);
  const nextTrack = useAppStore((s) => s.nextTrack);
  const setProgress = useAppStore((s) => s.setProgress);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const setFullTrackViewOpen = useAppStore((s) => s.setFullTrackViewOpen);
  const setView = useAppStore((s) => s.setView);

  // ── SMOOTH progress (reads audio.currentTime directly = true 60fps) ──
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const showPlayer = currentTrack && !miniPlayerHidden && !isFullTrackViewOpen;
  useSmoothProgress(progressFillRef, undefined, !!showPlayer);

  // ── Seek on progress bar ──
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
    seekTo(e.touches[0].clientX);
  }, [seekTo]);

  // ── Swipe cover left to skip ──
  const coverTouchStart = useRef<{ x: number; y: number; t: number }>({ x: 0, y: 0, t: 0 });
  const handleCoverTouchStart = useCallback((e: React.TouchEvent) => {
    coverTouchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, []);
  const handleCoverTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - coverTouchStart.current.x;
    const dy = e.changedTouches[0].clientY - coverTouchStart.current.y;
    const dt = Date.now() - coverTouchStart.current.t;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 2 && dt < 400) {
      if (dx < 0) {
        nextTrack();
        if ("vibrate" in navigator) { try { navigator.vibrate(10); } catch {} }
      }
    }
  }, [nextTrack]);

  // ── Derived ──
  const isLiked = currentTrack ? likedTrackIds.includes(currentTrack.id) : false;
  const isLoading = playbackState === "loading" || playbackState === "buffering";
  const messengerBadge = Object.values(unreadCounts).reduce((sum, c) => sum + (c || 0), 0);
  const settingsBadge = supportUnreadCount;

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

  const handleNavClick = useCallback((item: typeof navItems[number], isActive: boolean) => {
    if ("vibrate" in navigator) { try { navigator.vibrate(isActive ? 5 : 10); } catch {} }
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
      className="fixed lg:hidden left-0 right-0 z-[60]"
      style={{ bottom: "0px" }}
    >
      <style>{`
        .mq-nav-btn {
          transition: color 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
          -webkit-tap-highlight-color: transparent;
          -webkit-touch-callout: none;
          user-select: none;
        }
        .mq-nav-btn:active { transform: scale(0.88); }
        .mq-nav-dot {
          transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .mq-mini-btn {
          transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
          -webkit-tap-highlight-color: transparent;
          -webkit-touch-callout: none;
          user-select: none;
        }
        .mq-mini-btn:active { transform: scale(0.88); }
        @keyframes mqDockSlideIn {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <div
        style={{
          background: "color-mix(in srgb, var(--mq-bg) 82%, transparent)",
          backdropFilter: "blur(30px) saturate(180%)",
          WebkitBackdropFilter: "blur(30px) saturate(180%)",
          borderTop: "1px solid var(--mq-border-hairline)",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.3)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          animation: "mqDockSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* ── Progress line (2px, very top) ── */}
        {showPlayer && (
          <div
            ref={progressBarRef}
            className="w-full relative cursor-pointer"
            style={{ height: "2px", backgroundColor: "rgba(255,255,255,0.04)" }}
            onTouchStart={handleSeekStart}
          >
            <div
              ref={progressFillRef}
              className="absolute inset-y-0 left-0"
              style={{
                width: "0%",
                backgroundColor: "var(--mq-accent)",
                willChange: "width",
              }}
            />
          </div>
        )}

        {/* ── Mini player (thin bar) ── */}
        {showPlayer && (
          <div
            className="flex items-center gap-3 px-3"
            style={{ height: "56px", paddingTop: "2px" }}
          >
            {/* Cover — tap opens full, swipe left skips */}
            <button
              onClick={openFullPlayer}
              onTouchStart={handleCoverTouchStart}
              onTouchEnd={handleCoverTouchEnd}
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
            >
              <div
                className="rounded-lg overflow-hidden flex-shrink-0"
                style={{ width: "40px", height: "40px", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
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
                <p className="text-[13px] font-semibold truncate" style={{ color: "var(--mq-text)", lineHeight: "1.2" }}>
                  {currentTrack!.title}
                </p>
                <p className="text-[11px] truncate" style={{ color: "var(--mq-text-muted)", lineHeight: "1.2", marginTop: "2px" }}>
                  {currentTrack!.artist}
                </p>
              </div>
            </button>

            {/* Like */}
            <button
              onClick={handleLike}
              className="mq-mini-btn w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
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
              className="mq-mini-btn w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: "var(--mq-accent)",
                border: "none",
                cursor: "pointer",
                padding: 0,
                boxShadow: "0 2px 8px color-mix(in srgb, var(--mq-accent) 30%, transparent)",
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
          </div>
        )}

        {/* ── Navigation (5 icons) ── */}
        <div
          className="flex items-stretch justify-around"
          style={{ height: "56px", paddingTop: showPlayer ? "2px" : "6px" }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            const badge = item.badgeKey === "messenger" ? messengerBadge : item.badgeKey === "settings" ? settingsBadge : 0;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item, isActive)}
                className="mq-nav-btn flex flex-col items-center justify-center gap-1 flex-1"
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  color: isActive ? "var(--mq-accent)" : "color-mix(in srgb, var(--mq-text-muted) 70%, transparent)",
                  position: "relative",
                }}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
              >
                {/* Active dot indicator (top) */}
                <div
                  className="mq-nav-dot absolute"
                  style={{
                    top: "4px",
                    width: "4px",
                    height: "4px",
                    borderRadius: "50%",
                    backgroundColor: "var(--mq-accent)",
                    opacity: isActive ? 1 : 0,
                    transform: isActive ? "scale(1)" : "scale(0)",
                  }}
                />
                <div className="relative">
                  <Icon
                    className="w-[22px] h-[22px]"
                    strokeWidth={isActive ? 2.4 : 1.7}
                    style={isActive ? {
                      filter: "drop-shadow(0 0 6px color-mix(in srgb, var(--mq-accent) 40%, transparent))",
                    } : undefined}
                  />
                  {badge > 0 && (
                    <span
                      className="absolute -top-1 -right-2 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[9px] font-bold px-1"
                      style={{
                        background: "var(--mq-accent)",
                        color: "var(--mq-text-on-accent, #fff)",
                        boxShadow: "0 0 6px color-mix(in srgb, var(--mq-accent) 50%, transparent)",
                      }}
                    >
                      {badge > 99 ? "99" : badge}
                    </span>
                  )}
                </div>
                <span
                  className="text-[9px] font-medium leading-none"
                  style={{ opacity: isActive ? 1 : 0.6 }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
