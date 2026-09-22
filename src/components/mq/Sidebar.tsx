"use client";

import React, { useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import {
  Home, Search, Library, ListMusic, MessageCircle, Settings, User,
} from "lucide-react";
import type { ViewType } from "@/store/useAppStore";

/*
 * Sidebar — desktop left navigation rail (v72 desktop redesign).
 *
 * Reference direction: compact vertical rail, capsule items, soft glass
 * panel. NOT a dashboard mega-list. Items: Home / Search / Library /
 * Playlists / Chats / Profile / Settings (task §4) — all real view
 * switches through the same store actions the old top-nav used, so
 * deep links, history layering and the ⌘K focus contract are untouched.
 *
 * Visual system: everything reads from the canonical tokens
 * (--mq-glass, --mq-blur-md, --mq-radius-lg, .mq-side-item hover in
 * globals.css). Active item = translucent capsule + accent glow.
 * compactMode (store) collapses the rail to icon-only 78px.
 *
 * Mobile: NEVER rendered (hidden below lg). MobileDock keeps owning <768.
 */

const SIDE_ITEMS: { id: ViewType; icon: typeof Home; label: string; badgeKey?: "messenger" }[] = [
  { id: "main", icon: Home, label: "Главная" },
  { id: "search", icon: Search, label: "Поиск" },
  { id: "library", icon: Library, label: "Библиотека" },
  { id: "playlists", icon: ListMusic, label: "Плейлисты" },
  { id: "messenger", icon: MessageCircle, label: "Чаты", badgeKey: "messenger" },
];

const SIDE_ITEMS_LOW: { id: ViewType; icon: typeof Home; label: string }[] = [
  { id: "profile", icon: User, label: "Профиль" },
  { id: "settings", icon: Settings, label: "Настройки" },
];

const Sidebar = React.memo(function Sidebar() {
  const currentView = useAppStore((s) => s.currentView);
  const setView = useAppStore((s) => s.setView);
  const compactMode = useAppStore((s) => s.compactMode);
  const unreadCounts = useAppStore((s) => s.unreadCounts);
  const supportUnreadCount = useAppStore((s) => s.supportUnreadCount);

  const messengerBadge = Object.values(unreadCounts).reduce((sum, c) => sum + (c || 0), 0);

  const go = useCallback((view: ViewType) => {
    setView(view);
    if (view === "search") {
      setTimeout(() => {
        document.querySelector<HTMLInputElement>("[data-search-input]")?.focus();
      }, 100);
    }
  }, [setView]);

  const isSettingsActive = currentView === "settings";
  const isProfileActive = currentView === "profile";

  const renderItem = (item: { id: ViewType; icon: typeof Home; label: string; badgeKey?: "messenger" }, low = false) => {
    const Icon = item.icon;
    const isActive = low
      ? (item.id === "settings" && isSettingsActive) || (item.id === "profile" && isProfileActive)
      : currentView === item.id;
    const badge = item.badgeKey === "messenger" ? messengerBadge : (low && item.id === "settings" ? supportUnreadCount : 0);
    return (
      <button
        key={item.id}
        onClick={() => go(item.id)}
        className="mq-side-item"
        data-active={isActive || undefined}
        aria-current={isActive ? "page" : undefined}
        aria-label={item.label}
        title={compactMode ? item.label : undefined}
      >
        <Icon className="mq-side-item-icon" strokeWidth={isActive ? 2.2 : 1.8} />
        <span className="mq-side-item-label">{item.label}</span>
        {badge > 0 && (
          <span className="mq-side-badge" aria-label={`${badge} непрочитанных`}>
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className="mq-sidebar"
      data-compact={compactMode || undefined}
      role="navigation"
      aria-label="Основная навигация"
    >
      {/* ── Brand — canonical MQ icon + wordmark ── */}
      <button onClick={() => go("main")} className="mq-side-brand" aria-label="MQ — на главную">
        <span className="mq-side-logo">
          {/* canonical MQ mark (public/logo.svg) */}
          <img src="/logo.svg" alt="" draggable={false} />
        </span>
        <span className="mq-side-wordmark">mq</span>
      </button>

      {/* ── Primary nav ── */}
      <nav className="mq-side-group">{SIDE_ITEMS.map((i) => renderItem(i))}</nav>

      <div className="mq-side-sep" aria-hidden="true" />

      {/* ── Secondary nav (profile / settings) ── */}
      <nav className="mq-side-group">{SIDE_ITEMS_LOW.map((i) => renderItem(i, true))}</nav>

      <div className="mq-side-flex" aria-hidden="true" />

      {/* ── Listening status chip — real state, not decoration ── */}
      <SidebarStatus />
    </aside>
  );
});

/* Mini now-playing chip pinned to the rail bottom: opens the full player.
   Hidden in compact mode (icon rail) to keep the rail clean. */
const SidebarStatus = React.memo(function SidebarStatus() {
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const setFullTrackViewOpen = useAppStore((s) => s.setFullTrackViewOpen);
  const compactMode = useAppStore((s) => s.compactMode);

  if (!currentTrack) return null;
  if (compactMode) return null;

  return (
    <button className="mq-side-now" onClick={() => setFullTrackViewOpen(true)} aria-label="Открыть плеер">
      <span className="mq-side-now-cover">
        {currentTrack.cover ? <img src={currentTrack.cover} alt="" /> : <ListMusic className="mq-side-now-fallback" />}
      </span>
      <span className="mq-side-now-meta">
        <span className="mq-side-now-title">{currentTrack.title}</span>
        <span className="mq-side-now-artist" data-playing={isPlaying || undefined}>
          {isPlaying ? "играет сейчас" : "на паузе"}
        </span>
      </span>
      <span className="mq-side-now-eq" aria-hidden="true">
        <i /><i /><i />
      </span>
    </button>
  );
});

export default Sidebar;
