"use client";

import React, { useRef, useCallback, memo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { getAudioElement } from "@/lib/audioEngine";
import { Play, Pause, SkipForward, Heart, Music, Loader2, Home, Search, Library, MessageCircle, Settings } from "lucide-react";
import type { ViewType } from "@/store/useAppStore";

// ═════════════════════════════════════════════════════════════════════════
// MobileDock — ULTRA-MINIMAL bottom bar
// Single glass container: mini-player + 5 nav icons
// Native input[type=range] for progress (hardware-accelerated drag)
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
  const progress = useAppStore((s) => s.progress);
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

  const seekInputRef = useRef<HTMLInputElement>(null);

  // Native input handles drag 100% in native code (no JS fighting)
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    const audio = getAudioElement();
    if (audio && audio.src && audio.duration) {
      audio.currentTime = (v / 100) * audio.duration;
      setProgress(audio.currentTime);
    }
  }, [setProgress]);

  const showPlayer = currentTrack && !miniPlayerHidden && !isFullTrackViewOpen;
  const isLiked = currentTrack ? likedTrackIds.includes(currentTrack.id) : false;
  const isLoading = playbackState === "loading" || playbackState === "buffering";
  const msgBadge = Object.values(unreadCounts).reduce((s, c) => s + (c || 0), 0);
  const setBadge = supportUnreadCount;
  const seekPct = duration > 0 ? (progress / duration) * 100 : 0;

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
        .mq-nav { transition: color .2s ease; -webkit-tap-highlight-color: transparent; }
        .mq-nav:active { opacity: 0.6; }
        .mq-mini { transition: transform .12s ease; -webkit-tap-highlight-color: transparent; }
        .mq-mini:active { transform: scale(0.9); }
        .mq-seek { -webkit-appearance: none; appearance: none; width: 100%; height: 3px; background: transparent; outline: none; cursor: pointer; }
        .mq-seek::-webkit-slider-runnable-track { height: 3px; border-radius: 2px; background: linear-gradient(to right, var(--mq-accent) 0%, var(--mq-accent) ${seekPct}%, rgba(255,255,255,0.08) ${seekPct}%, rgba(255,255,255,0.08) 100%); }
        .mq-seek::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 12px; height: 12px; border-radius: 50%; background: var(--mq-accent); margin-top: -4.5px; cursor: pointer; box-shadow: 0 0 4px color-mix(in srgb, var(--mq-accent) 50%, transparent); }
        .mq-seek::-moz-range-track { height: 3px; border-radius: 2px; background: rgba(255,255,255,0.08); }
        .mq-seek::-moz-range-progress { height: 3px; border-radius: 2px; background: var(--mq-accent); }
        .mq-seek::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: var(--mq-accent); border: none; cursor: pointer; }
      `}</style>
      <div style={{
        background: "color-mix(in srgb, var(--mq-bg) 92%, transparent)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid var(--mq-border-hairline)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        {/* Mini player with native seek input */}
        {showPlayer && (
          <div className="flex items-center gap-2 px-3" style={{ height: "54px" }}>
            {/* Seek input as the top border of mini-player */}
            <input
              ref={seekInputRef}
              type="range"
              min={0}
              max={100}
              value={seekPct}
              onChange={handleSeek}
              className="mq-seek"
              style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", width: "100%" }}
            />
            <button onClick={openFull} className="mq-mini flex items-center gap-2.5 flex-1 min-w-0" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, marginTop: "6px" }}>
              <div className="rounded-md overflow-hidden flex-shrink-0" style={{ width: "38px", height: "38px" }}>
                {currentTrack!.cover ? <img src={currentTrack!.cover} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}><Music className="w-4 h-4" style={{ color: "rgba(255,255,255,0.7)" }} /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold truncate" style={{ color: "var(--mq-text)", lineHeight: "1.2" }}>{currentTrack!.title}</p>
                <p className="text-[11px] truncate" style={{ color: "var(--mq-text-muted)", lineHeight: "1.2", marginTop: "1px" }}>{currentTrack!.artist}</p>
              </div>
            </button>
            <button onClick={onLike} className="mq-mini w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, marginTop: "6px" }}>
              <Heart className="w-[18px] h-[18px]" style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }} fill={isLiked ? "currentColor" : "none"} />
            </button>
            <button onClick={onPlay} className="mq-mini w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--mq-accent)", border: "none", cursor: "pointer", padding: 0, marginTop: "6px" }}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#fff" }} />
                : isPlaying ? <Pause className="w-4 h-4" fill="#fff" style={{ color: "#fff" }} />
                : <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />}
            </button>
          </div>
        )}

        {/* Navigation — 5 icons, single row */}
        <div className="flex items-stretch justify-around" style={{ height: "52px", borderTop: showPlayer ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = currentView === item.id;
            const badge = item.badgeKey === "messenger" ? msgBadge : item.badgeKey === "settings" ? setBadge : 0;
            return (
              <button key={item.id} onClick={() => onNav(item, active)} className="mq-nav flex flex-col items-center justify-center gap-0.5 flex-1"
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: active ? "var(--mq-accent)" : "color-mix(in srgb, var(--mq-text-muted) 70%, transparent)" }}>
                <div className="relative">
                  <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.3 : 1.7} />
                  {badge > 0 && <span className="absolute -top-1 -right-2 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[9px] font-bold px-1"
                    style={{ background: "var(--mq-accent)", color: "var(--mq-text-on-accent, #fff)" }}>{badge > 99 ? "99" : badge}</span>}
                </div>
                <span className="text-[9px] leading-none" style={{ opacity: active ? 1 : 0.6 }}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default memo(MobileDockInner);
