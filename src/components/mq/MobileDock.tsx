"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipForward, Heart, Music, Loader2,
  Home, Search, Library, MessageCircle, Settings,
} from "lucide-react";
import { getAudioElement } from "@/lib/audioEngine";
import { formatDuration } from "@/lib/musicApi";
import type { Track } from "@/lib/musicApi";
import type { ViewType } from "@/store/useAppStore";

// ═════════════════════════════════════════════════════════════════════════
// MobileDock — unified bottom bar: Player + Navigation in ONE glass container
// No gap, no separate floating elements. One unified control surface.
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
  const progress = useAppStore((s) => s.progress);
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
  const [isDragging, setIsDragging] = useState(false);

  const seekTo = useCallback((clientX: number) => {
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const time = (pct / 100) * duration;
    const audio = getAudioElement();
    if (audio && audio.src) audio.currentTime = time;
    setProgress(time);
  }, [duration, setProgress]);

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

  // ── Derived ──
  const showPlayer = currentTrack && !miniPlayerHidden && !isFullTrackViewOpen;
  const isLiked = currentTrack ? likedTrackIds.includes(currentTrack.id) : false;
  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;
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

  const handleLike = useCallback(() => {
    if (currentTrack) toggleLike(currentTrack.id, currentTrack);
  }, [currentTrack, toggleLike]);

  return (
    <div
      className="fixed lg:hidden left-2 right-2 z-[60]"
      style={{
        bottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-[24px] overflow-hidden"
        style={{
          background: "color-mix(in srgb, var(--mq-bg) 70%, transparent)",
          backdropFilter: "blur(40px) saturate(200%)",
          WebkitBackdropFilter: "blur(40px) saturate(200%)",
          border: "1px solid var(--mq-border-thin)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {/* ── PLAYER SECTION (only when track is active) ── */}
        <AnimatePresence>
          {showPlayer && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              style={{ overflow: "hidden" }}
            >
              {/* Progress bar — thin line at very top */}
              <div
                ref={progressBarRef}
                className="h-[3px] w-full relative cursor-pointer"
                onTouchStart={handleSeekStart}
              >
                <div className="absolute inset-0" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
                <div
                  className="absolute inset-y-0 left-0"
                  style={{
                    width: `${progressPct}%`,
                    backgroundColor: "var(--mq-accent)",
                    transition: isDragging ? "none" : "width 0.1s linear",
                  }}
                />
              </div>

              {/* Player content */}
              <div className="flex items-center gap-2.5 px-3 py-2">
                {/* Cover + info — tap opens full player */}
                <button
                  onClick={openFullPlayer}
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
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
                </button>

                {/* Like */}
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={handleLike}
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                >
                  <Heart
                    className="w-[18px] h-[18px]"
                    style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
                    fill={isLiked ? "currentColor" : "none"}
                  />
                </motion.button>

                {/* Play/Pause */}
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={togglePlay}
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: "var(--mq-accent)",
                    boxShadow: "0 2px 8px color-mix(in srgb, var(--mq-accent) 30%, transparent)",
                  }}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#fff" }} />
                  ) : isPlaying ? (
                    <Pause className="w-4 h-4" fill="#fff" style={{ color: "#fff" }} />
                  ) : (
                    <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
                  )}
                </motion.button>

                {/* Next */}
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={nextTrack}
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                >
                  <SkipForward className="w-[18px] h-[18px]" style={{ color: "var(--mq-text-muted)" }} fill="currentColor" />
                </motion.button>
              </div>

              {/* Divider between player and nav */}
              <div className="h-px mx-3" style={{ backgroundColor: "rgba(255,255,255,0.04)" }} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── NAVIGATION SECTION ── */}
        <div className={`flex items-center justify-around ${compactMode ? "py-2" : "py-2.5"} px-2`}>
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            const badgeCount = getBadge(item.badgeKey);
            return (
              <motion.button
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + 0.05 * index, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                whileTap={{ scale: 0.88 }}
                whileHover={{ scale: isActive ? 1 : 1.05 }}
                onClick={() => {
                  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                    try { navigator.vibrate(isActive ? 5 : 12); } catch {}
                  }
                  setView(item.id);
                  if (item.id === "search") {
                    setTimeout(() => {
                      const searchInput = document.querySelector<HTMLInputElement>("[data-search-input]");
                      searchInput?.focus();
                    }, 100);
                  }
                }}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                tabIndex={0}
                className="flex flex-col items-center gap-0.5 px-2 py-1.5 min-w-[44px] min-h-[44px] cursor-pointer relative"
                style={{
                  color: isActive ? "var(--mq-accent)" : "color-mix(in srgb, var(--mq-text-muted) 75%, transparent)",
                  background: "transparent",
                }}
              >
                {isActive && (
                  <motion.div
                    layoutId="mobileNavPill"
                    className="absolute inset-0 rounded-xl"
                    style={{
                      background: "color-mix(in srgb, var(--mq-accent) 14%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--mq-accent) 22%, transparent)",
                      boxShadow: "0 0 14px color-mix(in srgb, var(--mq-accent) 20%, transparent), inset 0 1px 0 rgba(255,255,255,0.05)",
                    }}
                    transition={{ type: "spring", stiffness: 500, damping: 32, mass: 0.7 }}
                  />
                )}
                <motion.div
                  animate={isActive ? { scale: 1.1, y: -1 } : { scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  className="relative z-10 flex flex-col items-center gap-0.5"
                >
                  <div className="relative">
                    <Icon
                      className="w-[18px] h-[18px]"
                      strokeWidth={isActive ? 2.4 : 1.6}
                      style={isActive ? {
                        color: "var(--mq-accent)",
                        filter: "drop-shadow(0 0 5px color-mix(in srgb, var(--mq-accent) 40%, transparent))",
                      } : undefined}
                    />
                    <AnimatePresence>
                      {badgeCount > 0 && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                          transition={{ type: "spring", stiffness: 500, damping: 25 }}
                          className="absolute -top-1.5 -right-2 min-w-[12px] h-[12px] rounded-full flex items-center justify-center text-[11px] font-bold px-px"
                          style={{
                            background: "var(--mq-accent)",
                            color: "var(--mq-text-on-accent, #fff)",
                            boxShadow: "0 0 8px color-mix(in srgb, var(--mq-accent) 50%, transparent)",
                          }}
                        >
                          {badgeCount > 99 ? "99" : badgeCount}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                  <span
                    className="text-[10px] font-medium leading-tight max-w-[56px] truncate"
                    style={{ letterSpacing: "-0.01em", fontWeight: isActive ? 600 : 400 }}
                  >
                    {item.label}
                  </span>
                </motion.div>
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
