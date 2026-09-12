"use client";

import React, { useRef, useCallback, useEffect, useState, memo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { getAudioElement } from "@/lib/audioEngine";
import { currentPlaybackPosition } from "@/lib/wasm-audio";
import { formatDuration } from "@/lib/musicApi";
import { Play, Pause, Heart, Music, Loader2, Home, Search, Library, MessageCircle, User } from "lucide-react";
import type { ViewType } from "@/store/useAppStore";

// ═════════════════════════════════════════════════════════════════════════
// MobileDock — minimal bottom bar
// GPU-accelerated progress via transform: scaleX (no width = no layout reflow)
// RAF reads audio.currentTime for true 60fps
// ═════════════════════════════════════════════════════════════════════════

// Mobile IA (v72): Profile is a primary destination — identity, stats,
// settings + logout live there. Settings itself remains a full view,
// reachable from Profile's shortcut row (and command palette).
const NAV: { id: ViewType; icon: typeof Home; label: string; badgeKey?: "messenger" | "profile" }[] = [
  { id: "main", icon: Home, label: "Главная" },
  { id: "search", icon: Search, label: "Поиск" },
  { id: "library", icon: Library, label: "Библиотека" },
  { id: "messenger", icon: MessageCircle, label: "Чаты", badgeKey: "messenger" },
  { id: "profile", icon: User, label: "Профиль", badgeKey: "profile" },
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
  const timeLabelRef = useRef<HTMLSpanElement>(null);

  // ── Hero/mini-player de-duplication ──────────────────────────────
  // On the Home screen the MobileNowHero already owns the now-playing
  // surface (artwork + title + transport). While the hero is visibly in
  // the viewport, the dock's mini player hides — the SAME track must not
  // appear twice. Scroll past the hero → the mini player slides back in.
  const [heroOwnsPlayer, setHeroOwnsPlayer] = useState(false);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      if (currentView !== "main") { setHeroOwnsPlayer(false); return; }
      const hero = document.querySelector("[data-mq-hero]");
      if (!hero) { setHeroOwnsPlayer(false); return; }
      // Hero substantially visible (≥160px of it on screen) → it owns.
      setHeroOwnsPlayer(hero.getBoundingClientRect().bottom > 160);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [currentView, currentTrack?.id, isPlaying]);

  const showPlayer = !!currentTrack && !miniPlayerHidden && !isFullTrackViewOpen && !heroOwnsPlayer;

  // RAF: update progress fill width + compact time label (simple, reliable).
  // v69: the dock previously showed NO time at all — mini-player duration
  // contract requires a readable cur/total. Playback-routed position source
  // (WASM stats or <audio>) so it never freezes on the wasm path.
  useEffect(() => {
    if (!showPlayer) return;
    let rafId = 0;
    let lastSec = -1;
    const tick = () => {
      const audio = getAudioElement();
      const dur = audio && audio.src && isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : (useAppStore.getState().duration || 0);
      const pos = currentPlaybackPosition();
      if (isFinite(pos) && pos >= 0) {
        const pct = dur > 0 ? Math.min(1, pos / dur) : 0;
        if (progressFillRef.current) {
          progressFillRef.current.style.transform = `scaleX(${pct})`;
        }
        const sec = Math.floor(pos);
        if (sec !== lastSec && timeLabelRef.current) {
          lastSec = sec;
          timeLabelRef.current.textContent = dur > 0
            ? `${formatDuration(sec)} / ${formatDuration(dur)}`
            : formatDuration(sec);
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

  // ── Swipe-up gesture: drag the mini player up ≥40px → Full Player ──
  // Uses passive listeners (no scroll blocking); tap still opens (click
  // fires only when no meaningful move happened — we suppress it when the
  // gesture consumed the touch).
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const gestureConsumed = useRef(false);
  const onMiniTouchStart = useCallback((e: React.TouchEvent) => {
    if (!currentTrack) return;
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
    gestureConsumed.current = false;
  }, [currentTrack]);
  const onMiniTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null || touchStartX.current === null) return;
    const dy = touchStartY.current - e.touches[0].clientY;
    const dx = Math.abs(e.touches[0].clientX - touchStartX.current);
    if (dy > 40 && dx < 48 && !gestureConsumed.current) {
      gestureConsumed.current = true;
      setFullTrackViewOpen(true);
    }
  }, [setFullTrackViewOpen]);
  const onMiniTouchEnd = useCallback(() => {
    // Keep gestureConsumed=true through the synthetic click that follows
    // the touchend, then reset on the NEXT touchstart. A real tap never
    // sets it (no 40px movement).
    window.setTimeout(() => { gestureConsumed.current = false; }, 60);
    touchStartY.current = null;
    touchStartX.current = null;
  }, []);
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
        .mq-nav-tab { position: relative; transition: color .2s ease; }
        .mq-nav-tab::before {
          content: "";
          position: absolute; top: 0; left: 50%; transform: translateX(-50%);
          width: 22px; height: 2.5px; border-radius: 0 0 3px 3px;
          background: var(--mq-accent);
          opacity: 0; transition: opacity .18s ease;
        }
        .mq-nav-tab[data-active="true"]::before { opacity: 1; }
        .mq-mini { transition: none; -webkit-tap-highlight-color: transparent; user-select: none; }
        .mq-dock-progress-track {
          position: relative;
          height: 3px;
          background: var(--mq-glass-bg);
          cursor: default;
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
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderTop: "1px solid var(--mq-border-hairline)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}>
        {/* Mini player — smooth collapse (max-height) when the Home hero
            owns the now-playing surface, so the nav row slides, not jumps */}
        <div
          style={{
            maxHeight: showPlayer ? 62 : 0,
            opacity: showPlayer ? 1 : 0,
            overflow: "hidden",
            transition: "max-height 240ms cubic-bezier(0.4,0,0.2,1), opacity 200ms cubic-bezier(0.4,0,0.2,1)",
          }}
          aria-hidden={!showPlayer}
        >
        {showPlayer && (
          <div className="mq-dock-progress-track">
            <div ref={progressFillRef} className="mq-dock-progress-fill" />
          </div>
        )}
        {currentTrack && (
        <div className="flex items-center gap-2 px-3" style={{ height: "60px", touchAction: "none" }}
          onTouchStart={onMiniTouchStart} onTouchMove={onMiniTouchMove} onTouchEnd={onMiniTouchEnd}>
            <button onClick={() => { if (!gestureConsumed.current) openFull(); }} className="mq-mini flex items-center gap-2.5 flex-1 min-w-0" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
              <div className="rounded-md overflow-hidden flex-shrink-0" style={{ width: "38px", height: "38px" }}>
                {currentTrack!.cover ? <img src={currentTrack!.cover} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}><Music className="w-4 h-4" style={{ color: "var(--mq-text-on-accent, rgba(255,255,255,0.7))" }} /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="mq-t-body font-semibold truncate" style={{ color: "var(--mq-text)", lineHeight: "1.2" }}>{currentTrack!.title}</p>
                <p className="mq-t-meta-2 truncate" style={{ color: "var(--mq-text-muted)", lineHeight: "1.2", marginTop: "1px" }}>
                  {currentTrack!.artist}
                </p>
                {/* v69 mini-player duration contract: cur / total, tabular
                    Manrope, updated by the RAF loop (no re-renders). */}
                <span
                  ref={timeLabelRef}
                  className="mq-t-num block truncate"
                  style={{ color: "var(--mq-text-muted)", opacity: 0.85, lineHeight: "1.3", marginTop: "1px" }}
                  aria-hidden="true"
                >
                  0:00
                </span>
              </div>
            </button>
            <button onClick={onLike} aria-label={isLiked ? "Убрать из любимых" : "Добавить в любимые"} className="mq-mini w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: isLiked ? "color-mix(in srgb, var(--mq-accent) 12%, transparent)" : "transparent", border: "none", cursor: "pointer", padding: 0 }}>
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
        </div>

        {/* Navigation — 56px row (icon 22 + label 10 + gaps): every tab is a
            full-height 44px+ touch target with an active accent hairline. */}
        <div className="flex items-stretch justify-around" style={{ height: "var(--mq-nav-height-mobile, 56px)" }}>
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = currentView === item.id;
            const badge = item.badgeKey === "messenger" ? msgBadge : item.badgeKey === "profile" ? setBadge : 0;
            return (
              <button
                key={item.id}
                onClick={() => onNav(item, active)}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                data-active={active}
                className="mq-nav mq-nav-tab flex flex-col items-center justify-center gap-1 flex-1"
                style={{ background: "transparent", border: "none", cursor: "pointer", padding: "4px 0", minHeight: 44, color: active ? "var(--mq-accent)" : "color-mix(in srgb, var(--mq-text-muted) 72%, transparent)" }}>
                <div className="relative">
                  <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.3 : 1.7} />
                  {badge > 0 && <span className="absolute -top-1 -right-2 min-w-[14px] h-[14px] rounded-full flex items-center justify-center mq-t-badge font-bold px-1"
                    style={{ background: "var(--mq-accent)", color: "var(--mq-text-on-accent, #fff)" }}>{badge > 99 ? "99" : badge}</span>}
                </div>
                <span className="mq-t-nav leading-none" style={{ opacity: active ? 1 : 0.85, fontSize: "10px" }}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default memo(MobileDockInner);
