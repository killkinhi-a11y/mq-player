"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import {
  Home, Search, MessageCircle, Settings, LogOut, User,
  ListMusic, Heart, Music, List,
} from "lucide-react";
import type { ViewType } from "@/store/useAppStore";

const navItems: { id: ViewType; icon: typeof Home; label: string; badgeKey?: "messenger" | "settings" }[] = [
  { id: "main", icon: Home, label: "Главная" },
  { id: "search", icon: Search, label: "Поиск" },
  { id: "favorites", icon: Heart, label: "Избранное" },
  { id: "playlists", icon: ListMusic, label: "Плейлисты" },
  { id: "messenger", icon: MessageCircle, label: "Мессенджер", badgeKey: "messenger" },
  { id: "settings", icon: Settings, label: "Настройки", badgeKey: "settings" },
];

export default function NavBar() {
  const {
    currentView, setView, logout, username, avatar,
    compactMode, unreadCounts, supportUnreadCount,
    currentTrack, isPlaying, setFullTrackViewOpen,
    searchQuery, setSearchQuery,
  } = useAppStore();

  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const getBadgeCount = (badgeKey?: string): number => {
    if (!badgeKey) return 0;
    if (badgeKey === "messenger") {
      return Object.values(unreadCounts).reduce((sum, c) => sum + c, 0);
    }
    if (badgeKey === "settings") {
      return supportUnreadCount;
    }
    return 0;
  };

  // ⌘K / Ctrl+K shortcut to focus search
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setView("search");
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
    // "/" shortcut for search (when not in an input)
    if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
      e.preventDefault();
      setView("search");
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [setView]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <header
      className="hidden lg:flex fixed top-0 left-0 right-0 z-50 items-center justify-between"
      role="banner"
      style={{
        margin: "12px 24px 0",
        borderRadius: "var(--mq-radius-full)",
        background: "var(--mq-glass-bg)",
        backdropFilter: "var(--mq-glass-blur)",
        WebkitBackdropFilter: "var(--mq-glass-blur)",
        border: "1px solid var(--mq-glass-border)",
        boxShadow: "var(--mq-shadow-float)",
        padding: compactMode ? "8px 16px" : "10px 20px",
      }}
    >
      {/* ── Logo ── */}
      <div
        className="flex items-center gap-2 cursor-pointer shrink-0"
        onClick={() => setView("main")}
      >
        <div
          className="w-8 h-8 rounded-lg overflow-hidden"
          style={{ boxShadow: "0 0 12px var(--mq-glow)" }}
        >
          <img src="/favicon.ico" alt="mq" className="w-full h-full object-cover" />
        </div>
        <span
          className="font-extralight text-xl tracking-wide"
          style={{
            color: "var(--mq-text)",
            fontFamily: "var(--font-outfit), system-ui, sans-serif",
          }}
        >
          mq
        </span>
      </div>

      {/* ── Navigation pill bar ── */}
      <nav
        className="flex items-center gap-1 p-1 rounded-full mx-4"
        role="navigation"
        aria-label="Основная навигация"
        style={{
          background: "var(--mq-glass-bg)",
          border: "1px solid var(--mq-glass-border)",
          backdropFilter: "var(--mq-glass-blur)",
          WebkitBackdropFilter: "var(--mq-glass-blur)",
        }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          const badgeCount = getBadgeCount(item.badgeKey);
          return (
            <motion.button
              key={item.id}
              whileHover={isActive ? {} : { scale: 1.05, y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setView(item.id)}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              data-tour={
                item.id === "search"
                  ? "search"
                  : item.id === "messenger"
                    ? "messenger"
                    : item.id === "settings"
                      ? "settings"
                      : undefined
              }
              className={`flex items-center gap-2 ${
                compactMode ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
              } rounded-full relative mq-focus-premium`}
              style={{
                background: isActive ? "transparent" : "transparent",
                color: isActive ? "var(--mq-text)" : "var(--mq-text-muted)",
                border: "1px solid transparent",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "var(--mq-glass-bg-hover)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              {/* Active glass pill background with layoutId for smooth transition */}
              {isActive && (
                <motion.div
                  layoutId="navActivePill"
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: "var(--mq-glass-bg-active)",
                    backdropFilter: "var(--mq-glass-blur)",
                    WebkitBackdropFilter: "var(--mq-glass-blur)",
                    border: "1px solid var(--mq-glass-border-hover)",
                    boxShadow: "var(--mq-shadow-glow), var(--mq-shadow-inner-glow)",
                  }}
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
                />
              )}

              <Icon
                className={`${compactMode ? "w-3.5 h-3.5" : "w-4 h-4"} relative z-10`}
                style={isActive ? { color: "var(--mq-accent)" } : undefined}
              />
              <span className="relative z-10">{item.label}</span>

              {/* Badge with pulse */}
              {badgeCount > 0 && (
                <span
                  className="relative z-10 -mr-1 min-w-[16px] h-[16px] rounded-full flex items-center justify-center text-[9px] font-bold px-1"
                  style={{
                    background: "var(--mq-glass-bg-active)",
                    backdropFilter: "blur(12px)",
                    border: "1px solid var(--mq-glass-border)",
                    color: "#fff",
                    boxShadow: "0 0 8px rgba(239, 68, 68, 0.4)",
                    animation: "mq-badge-pulse 2s ease-in-out infinite",
                  }}
                >
                  <span
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: "#ef4444",
                      boxShadow: "0 0 6px rgba(239,68,68,0.6)",
                    }}
                  />
                  {badgeCount > 99 ? "99" : badgeCount}
                </span>
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* ── Right section: search + playback + user ── */}
      <div className="flex items-center gap-2 shrink-0">
        {/* ── Enhanced Search Input ── */}
        <div className="relative">
          <div
            className="relative flex items-center"
            style={{
              borderRadius: "var(--mq-radius-full)",
              background: searchFocused
                ? "var(--mq-glass-bg-active)"
                : "var(--mq-glass-bg)",
              backdropFilter: "var(--mq-glass-blur)",
              WebkitBackdropFilter: "var(--mq-glass-blur)",
              border: searchFocused
                ? "1px solid transparent"
                : "1px solid var(--mq-glass-border)",
              boxShadow: searchFocused
                ? "var(--mq-shadow-glow)"
                : "none",
              transition: "all 0.2s ease",
              // Animated gradient border on focus
              ...(searchFocused
                ? {
                    backgroundImage:
                      "linear-gradient(var(--mq-surface-1), var(--mq-surface-1)), linear-gradient(135deg, var(--mq-accent), rgba(var(--mq-accent-rgb), 0.3), var(--mq-accent))",
                    backgroundOrigin: "border-box",
                    backgroundClip: "padding-box, border-box",
                  }
                : {}),
            }}
          >
            {/* Search icon */}
            <Search
              className="w-4 h-4 ml-3 shrink-0"
              style={{
                color: searchFocused ? "var(--mq-accent)" : "var(--mq-text-muted)",
                transition: "color 0.2s ease",
              }}
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Поиск..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (currentView !== "search") setView("search");
              }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className={`${
                compactMode ? "w-32 py-1.5 text-xs" : "w-44 py-1.5 text-sm"
              } pl-2 pr-2 bg-transparent outline-none`}
              style={{ color: "var(--mq-text)" }}
              aria-label="Поиск"
            />
            {/* Keyboard shortcut indicator */}
            {!searchFocused && !searchQuery && (
              <span
                className="mr-2 px-1.5 py-0.5 rounded-md text-[10px] font-medium shrink-0"
                style={{
                  background: "var(--mq-glass-bg)",
                  border: "1px solid var(--mq-glass-border)",
                  color: "var(--mq-text-muted)",
                  backdropFilter: "blur(12px)",
                }}
              >
                ⌘K
              </span>
            )}
          </div>
        </div>

        {/* ── Playback Quick Actions (only when track is playing) ── */}
        <AnimatePresence>
          {currentTrack && isPlaying && (
            <motion.div
              initial={{ opacity: 0, width: 0, marginLeft: 0 }}
              animate={{ opacity: 1, width: "auto", marginLeft: 4 }}
              exit={{ opacity: 0, width: 0, marginLeft: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-1 overflow-hidden"
            >
              {/* Mini now-playing indicator */}
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setFullTrackViewOpen(true)}
                className="flex items-center gap-2 px-2 py-1 rounded-full cursor-pointer"
                style={{
                  background: "var(--mq-glass-bg)",
                  border: "1px solid var(--mq-glass-border)",
                  backdropFilter: "var(--mq-glass-blur)",
                  WebkitBackdropFilter: "var(--mq-glass-blur)",
                }}
                title="Открыть плеер"
              >
                {/* Tiny artwork */}
                <div className="w-5 h-5 rounded-sm overflow-hidden shrink-0">
                  {currentTrack.cover ? (
                    <img
                      src={currentTrack.cover}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ background: "var(--mq-accent)" }}
                    >
                      <Music className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
                {/* Tiny EQ bars */}
                <div className="flex items-end gap-[2px] h-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-[2px] rounded-full"
                      style={{
                        backgroundColor: "var(--mq-accent)",
                        animation: `mq-eq-bar-${i + 1} 0.6s ease-in-out infinite alternate`,
                      }}
                    />
                  ))}
                </div>
                {/* Title (truncated) */}
                <span
                  className="text-xs truncate max-w-[80px]"
                  style={{ color: "var(--mq-text)" }}
                >
                  {currentTrack.title}
                </span>
              </motion.button>

              {/* Queue toggle */}
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setView("playlists")}
                className="p-1.5 rounded-full"
                style={{
                  color: "var(--mq-text-muted)",
                  background: "var(--mq-glass-bg)",
                  border: "1px solid var(--mq-glass-border)",
                  backdropFilter: "blur(12px)",
                }}
                title="Очередь"
              >
                <List className="w-3.5 h-3.5" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── User Avatar/Profile Section ── */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setView("profile")}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-200 relative group"
          style={{
            background: "var(--mq-glass-bg)",
            border: "1px solid var(--mq-glass-border)",
            backdropFilter: "var(--mq-glass-blur)",
            WebkitBackdropFilter: "var(--mq-glass-blur)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--mq-glass-bg-hover)";
            e.currentTarget.style.borderColor = "var(--mq-glass-border-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--mq-glass-bg)";
            e.currentTarget.style.borderColor = "var(--mq-glass-border)";
          }}
        >
          {/* Avatar with accent glow ring */}
          <div className="relative">
            {avatar ? (
              <img
                src={avatar}
                alt="avatar"
                className="w-6 h-6 rounded-full object-cover"
                style={{
                  boxShadow: "0 0 0 2px var(--mq-surface-1), 0 0 0 3px var(--mq-accent)",
                }}
              />
            ) : (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: "var(--mq-accent)",
                  boxShadow: "0 0 0 2px var(--mq-surface-1), 0 0 8px var(--mq-glow)",
                }}
              >
                <User className="w-3.5 h-3.5" style={{ color: "var(--mq-text)" }} />
              </div>
            )}
            {/* Subtle accent glow ring */}
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                boxShadow: "0 0 12px var(--mq-glow)",
                opacity: 0.5,
              }}
            />
          </div>
          <span className="text-sm" style={{ color: "var(--mq-text)" }}>
            @{username || "User"}
          </span>
        </motion.button>

        {/* ── Logout ── */}
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={logout}
          className="p-2 rounded-full transition-all mq-focus-premium"
          aria-label="Выйти"
          style={{
            color: "var(--mq-text-muted)",
            background: "transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--mq-glass-bg-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
          title="Выйти"
        >
          <LogOut className="w-4 h-4" />
        </motion.button>
      </div>
    </header>
  );
}
