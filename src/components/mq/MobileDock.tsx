"use client";

import React, { useRef, useCallback, useEffect, memo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { getAudioElement } from "@/lib/audioEngine";
import { Play, Pause, Heart, Music, Loader2, Home, Search, Library, MessageCircle, Settings } from "lucide-react";
import type { ViewType } from "@/store/useAppStore";

// ═════════════════════════════════════════════════════════════════════════
// MobileDock — minimal bottom bar
// GPU-accelerated progress via transform: scaleX (no width = no layout reflow)
// RAF reads audio.currentTime for true 60fps
// ═════════════════════════════════════════════════════════════════════════

const NAV: { id: ViewType; icon: typeof Home; label: string; badgeKey?: "messenger" | "settings" }[] = [
  { id: "main", icon: Home, label: "Главная" },
  { id: "search", icon: Search, label: "Поиск" },
  { id: "library", icon: Library, label: "Библиотека" },
  { id: "messenger", icon: MessageCircle, label: "Чаты", badgeKey: "messenger" },
  { id: "settings", icon: Settings, label: "Настройки", badgeKey: "settings" },
];

function MobileDockInner() {
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
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

  // Refs for progress
  const progressFillRef = useRef<HTMLDivElement>(null);

  const showPlayer = currentTrack && !miniPlayerHidden && !isFullTrackViewOpen;

  // RAF: update progress fill width (simple, reliable)
  useEffect(() => {
    if (!showPlayer) return;
    let rafId = 0;
    const tick = () => {
      const audio = getAudioElement();
      if (audio && audio.src && audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        const pct = audio.currentTime / audio.duration;
        if (progressFillRef.current) {
          progressFillRef.current.style.transform = `scaleX(${pct})`;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [showPlayer]);

  const isLiked = currentTrack ? likedTrackIds.includes(currentTrack.id) : false;
  const isLoading = playbackState === "loading" || playbackState === "buffering";
  const msgBadge = Object.values(unreadCounts).reduce((s, c) => s + (c || 0), 0);
  const setBadge = supportUnreadCount;

  const openFull = useCallback(() => { if (currentTrack) setFullTrackViewOpen(true); }, [currentTrack, setFullTrackViewOpen]);
  const onLike = useCallback((e: React.MouseEvent) => { e.stopPropagation(); if (currentTrack) toggleLike(currentTrack.id, currentTrack); }, [currentTrack, toggleLike]);
  const onPlay = useCallback((e: React.MouseEvent) => { e.stopPropagation(); togglePlay(); }, [togglePlay]);
  const onNav = useCallback((item: typeof NAV[number], active: boolean) => {
    if ("vibrate" in navigator) { try { navigator.vibrate(active ? 5 : 10); } catch {} }
    setView(item.id);
  }, [setView]);

  return (
    <div className="fixed lg:hidden left-0 right-0 z-[60]" style={{ bottom: 0 }}>
      <style>{`
        .mq-nav { transition: color .2s ease; -webkit-tap-highlight-color: transparent; user-select: none; }
        .mq-nav:active { opacity: 0.6; }
        .mq-mini { transition: transform .12s ease; -webkit-tap-highlight-color: transparent; user-select: none; }
        .mq-mini:active { transform: scale(0.9); }
        .mq-dock-progress-track {
          position: relative;
          height: 2px;
          background: var(--mq-glass-bg);
          cursor: pointer;
        }
        .mq-dock-progress-fill {
          position: absolute;
          top: 0; left: 0; bottom: 0;
          width: 100%;
          background: var(--mq-accent);
          transform: scaleX(0);
          transform-origin: left center;
          will-change: transform;
        }
      `}</style>
      <div style={{
        background: "color-mix(in srgb, var(--mq-bg) 92%, transparent)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid var(--mq-border-hairline)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        {/* Progress line (visual only — tap cover to open full player for seek) */}
        {showPlayer && (
          <div className="mq-dock-progress-track">
            <div ref={progressFillRef} className="mq-dock-progress-fill" />
          </div>
        )}

        {/* Mini player */}
        {showPlayer && (
          <div className="flex items-center gap-2 px-3" style={{ height: "52px" }}>
            <button onClick={openFull} className="mq-mini flex items-center gap-2.5 flex-1 min-w-0" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
              <div className="rounded-md overflow-hidden flex-shrink-0" style={{ width: "38px", height: "38px" }}>
                {currentTrack!.cover ? <img src={currentTrack!.cover} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}><Music className="w-4 h-4" style={{ color: "var(--mq-text-on-accent, rgba(255,255,255,0.7))" }} /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold truncate" style={{ color: "var(--mq-text)", lineHeight: "1.2" }}>{currentTrack!.title}</p>
                <p className="text-[11px] truncate" style={{ color: "var(--mq-text-muted)", lineHeight: "1.2", marginTop: "1px" }}>{currentTrack!.artist}</p>
              </div>
            </button>
            <button onClick={onLike} aria-label={isLiked ? "Убрать из любимых" : "Добавить в любимые"} className="mq-mini w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
              <Heart className="w-[18px] h-[18px]" style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }} fill={isLiked ? "currentColor" : "none"} />
            </button>
            <button onClick={onPlay} aria-label={isPlaying ? "Пауза" : "Воспроизвести"} className="mq-mini w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--mq-accent)", border: "none", cursor: "pointer", padding: 0 }}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#fff" }} />
                : isPlaying ? <Pause className="w-4 h-4" fill="#fff" style={{ color: "#fff" }} />
                : <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />}
            </button>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-stretch justify-around" style={{ height: "var(--mq-nav-height-mobile, 50px)" }}>
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = currentView === item.id;
            const badge = item.badgeKey === "messenger" ? msgBadge : item.badgeKey === "settings" ? setBadge : 0;
            return (
              <button
                key={item.id}
                onClick={() => onNav(item, active)}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className="mq-nav flex flex-col items-center justify-center gap-0.5 flex-1"
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: active ? "var(--mq-accent)" : "color-mix(in srgb, var(--mq-text-muted) 70%, transparent)" }}>
                <div className="relative">
                  <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.3 : 1.7} />
                  {badge > 0 && <span className="absolute -top-1 -right-2 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[9px] font-bold px-1"
                    style={{ background: "var(--mq-accent)", color: "var(--mq-text-on-accent, #fff)" }}>{badge > 99 ? "99" : badge}</span>}
                </div>
                <span className="text-[10px] leading-none" style={{ opacity: active ? 1 : 0.6 }}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default memo(MobileDockInner);
