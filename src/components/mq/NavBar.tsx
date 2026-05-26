"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import {
  Home, Search, MessageCircle, Settings, LogOut, User,
  ListMusic, Heart,
} from "lucide-react";
import type { ViewType } from "@/store/useAppStore";

const navItems: { id: ViewType; icon: typeof Home; label: string; badgeKey?: "messenger" | "settings" }[] = [
  { id: "main", icon: Home, label: "Главная" },
  { id: "favorites", icon: Heart, label: "Избранное" },
  { id: "playlists", icon: ListMusic, label: "Плейлисты" },
  { id: "messenger", icon: MessageCircle, label: "Чаты", badgeKey: "messenger" },
  { id: "settings", icon: Settings, label: "Ещё", badgeKey: "settings" },
];

export default function NavBar() {
  const {
    currentView, setView, logout, username, avatar,
    compactMode, unreadCounts, supportUnreadCount,
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
      searchInputRef.current?.focus();
    }
    if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
      e.preventDefault();
      searchInputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <header
      className="hidden lg:flex fixed top-0 left-0 right-0 z-50 items-center"
      role="banner"
      style={{
        margin: "10px 20px 0",
        borderRadius: "var(--mq-radius-full)",
        background: "var(--mq-glass-bg)",
        backdropFilter: "var(--mq-glass-blur)",
        WebkitBackdropFilter: "var(--mq-glass-blur)",
        border: "1px solid var(--mq-glass-border)",
        boxShadow: "var(--mq-shadow-float)",
        padding: compactMode ? "6px 12px" : "8px 16px",
        gap: compactMode ? 8 : 12,
      }}
    >
      {/* ── Logo ── */}
      <motion.div
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="flex items-center gap-2 cursor-pointer shrink-0"
        onClick={() => setView("main")}
      >
        <div
          className="w-7 h-7 rounded-lg overflow-hidden"
          style={{ boxShadow: "0 0 12px var(--mq-glow)" }}
        >
          <img src="/favicon.ico" alt="mq" className="w-full h-full object-cover" />
        </div>
        <span
          className="font-extralight text-lg tracking-wide"
          style={{
            color: "var(--mq-text)",
            fontFamily: "var(--font-outfit), system-ui, sans-serif",
          }}
        >
          mq
        </span>
      </motion.div>

      {/* ── Navigation pills (icon-only for minimal look) ── */}
      <nav
        className="flex items-center gap-0.5 p-0.5 rounded-full ml-2"
        role="navigation"
        aria-label="Основная навигация"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          const badgeCount = getBadgeCount(item.badgeKey);
          return (
            <motion.button
              key={item.id}
              whileHover={isActive ? {} : { scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setView(item.id)}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex items-center justify-center ${
                compactMode ? "w-8 h-8" : "w-9 h-9"
              } rounded-full mq-focus-premium`}
              style={{
                color: isActive ? "var(--mq-accent)" : "var(--mq-text-muted)",
                transition: "color 0.15s ease",
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="navActivePill"
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: "var(--mq-glass-bg-active)",
                    border: "1px solid var(--mq-glass-border-hover)",
                    boxShadow: "0 0 12px color-mix(in srgb, var(--mq-accent) 15%, transparent)",
                  }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}

              <Icon
                className={`${compactMode ? "w-3.5 h-3.5" : "w-4 h-4"} relative z-10`}
              />

              {/* Badge dot only */}
              {badgeCount > 0 && (
                <span
                  className="absolute top-1 right-1 w-2 h-2 rounded-full z-20"
                  style={{
                    backgroundColor: "#ef4444",
                    boxShadow: "0 0 6px rgba(239,68,68,0.6)",
                  }}
                />
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── Search (single, clean) ── */}
      <div
        className="relative flex items-center shrink-0"
        style={{
          borderRadius: "var(--mq-radius-full)",
          background: searchFocused
            ? "rgba(255,255,255,0.08)"
            : "rgba(255,255,255,0.04)",
          border: searchFocused
            ? "1px solid color-mix(in srgb, var(--mq-accent) 40%, transparent)"
            : "1px solid rgba(255,255,255,0.06)",
          boxShadow: searchFocused
            ? "0 0 16px color-mix(in srgb, var(--mq-accent) 12%, transparent)"
            : "none",
          transition: "all 0.2s ease",
          padding: compactMode ? "4px 10px" : "6px 12px",
          gap: 6,
        }}
      >
        <Search
          className="w-3.5 h-3.5 shrink-0"
          style={{
            color: searchFocused ? "var(--mq-accent)" : "var(--mq-text-muted)",
            transition: "color 0.15s ease",
          }}
        />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Поиск"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (currentView !== "search") setView("search");
          }}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          className={`${compactMode ? "w-24" : "w-36"} bg-transparent outline-none text-sm`}
          style={{ color: "var(--mq-text)" }}
          aria-label="Поиск"
        />
        {!searchFocused && !searchQuery && (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.06)",
              color: "var(--mq-text-muted)",
            }}
          >
            ⌘K
          </span>
        )}
      </div>

      {/* ── User ── */}
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setView("profile")}
        className="flex items-center gap-2 shrink-0 px-2 py-1 rounded-full mq-focus-premium"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
        aria-label="Профиль"
      >
        {avatar ? (
          <img
            src={avatar}
            alt=""
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
            }}
          >
            <User className="w-3.5 h-3.5" style={{ color: "var(--mq-text)" }} />
          </div>
        )}
        {!compactMode && (
          <span className="text-sm max-w-[80px] truncate" style={{ color: "var(--mq-text)" }}>
            {username || "User"}
          </span>
        )}
      </motion.button>

      {/* ── Logout (icon only, subtle) ── */}
      <motion.button
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        onClick={logout}
        className="p-2 rounded-full mq-focus-premium"
        aria-label="Выйти"
        style={{
          color: "var(--mq-text-muted)",
          transition: "color 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--mq-accent)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--mq-text-muted)";
        }}
        title="Выйти"
      >
        <LogOut className="w-4 h-4" />
      </motion.button>
    </header>
  );
}
