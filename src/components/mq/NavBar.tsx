"use client";

import React, { useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import {
  Home, Search, MessageCircle, Settings, User,
  Library, Command,
} from "lucide-react";
import type { ViewType } from "@/store/useAppStore";

const navItems: { id: ViewType; icon: typeof Home; label: string; badgeKey?: "messenger" | "settings" }[] = [
  { id: "main", icon: Home, label: "Главная" },
  { id: "search", icon: Search, label: "Поиск" },
  { id: "library", icon: Library, label: "Библиотека" },
  { id: "messenger", icon: MessageCircle, label: "Чаты", badgeKey: "messenger" },
];

const NavBar = React.memo(function NavBar() {
  const currentView = useAppStore((s) => s.currentView);
  const setView = useAppStore((s) => s.setView);
  const username = useAppStore((s) => s.username);
  const avatar = useAppStore((s) => s.avatar);
  const compactMode = useAppStore((s) => s.compactMode);
  const unreadCounts = useAppStore((s) => s.unreadCounts);
  const supportUnreadCount = useAppStore((s) => s.supportUnreadCount);
  const setNotifPanelOpen = useAppStore((s) => s.setNotifPanelOpen);

  const messengerBadge = Object.values(unreadCounts).reduce((sum, c) => sum + (c || 0), 0);
  const settingsBadge = supportUnreadCount;

  const getBadgeCount = (badgeKey?: string): number => {
    if (badgeKey === "messenger") return messengerBadge;
    if (badgeKey === "settings") return settingsBadge;
    return 0;
  };

  // ⌘K / Ctrl+K shortcut
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setView("search");
      setTimeout(() => {
        const searchInput = document.querySelector<HTMLInputElement>("[data-search-input]");
        searchInput?.focus();
      }, 100);
    }
    if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
      e.preventDefault();
      setView("search");
      setTimeout(() => {
        const searchInput = document.querySelector<HTMLInputElement>("[data-search-input]");
        searchInput?.focus();
      }, 100);
    }
  }, [setView]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const isSettingsActive = currentView === "settings";
  const isProfileActive = currentView === "profile";

  return (
    <header
      className="hidden lg:flex fixed top-0 left-0 right-0 z-50 items-center justify-between"
      role="banner"
      style={{
        margin: "12px 24px 0",
        right: "auto",
        width: "calc(100% - 48px)",
        borderRadius: 24,
        background: "color-mix(in srgb, var(--mq-bg) 55%, transparent)",
        backdropFilter: "blur(32px) saturate(200%)",
        WebkitBackdropFilter: "blur(32px) saturate(200%)",
        border: "1px solid var(--mq-border-thin)",
        boxShadow:
          "0 10px 40px rgba(0,0,0,0.3), " +
          "inset 0 1px 0 rgba(255,255,255,0.06)",
        padding: compactMode ? "6px 8px" : "7px 10px",
      }}
    >
      {/* ── Brand (left) ── */}
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setView("main")}
        className="flex items-center gap-2 cursor-pointer shrink-0 px-2"
      >
        <div
          className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))",
            boxShadow: "0 0 16px color-mix(in srgb, var(--mq-accent) 40%, transparent)",
          }}
        >
          <img src="/favicon.ico" alt="mq" className="w-full h-full object-cover" />
        </div>
        <span
          className="font-light text-lg tracking-[0.15em] select-none"
          style={{
            color: "var(--mq-text)",
            fontFamily: "var(--font-outfit), system-ui, sans-serif",
          }}
        >
          mq
        </span>
      </motion.div>

      {/* ── Nav pills (center) ── */}
      <motion.nav
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center gap-1 p-1 rounded-full"
        role="navigation"
        aria-label="Основная навигация"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid var(--mq-border-hairline)",
        }}
      >
        {navItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          const badgeCount = getBadgeCount(item.badgeKey);
          return (
            <motion.button
              key={item.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + 0.04 * index, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              whileHover={isActive ? {} : { scale: 1.04, y: -1 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                  try { navigator.vibrate(8); } catch {}
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
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-full mq-focus-premium cursor-pointer select-none"
              style={{
                color: isActive ? "var(--mq-accent)" : "var(--mq-text-muted)",
                transition: "color 0.2s ease",
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                minHeight: 36,
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="navActivePill"
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: "color-mix(in srgb, var(--mq-accent) 14%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--mq-accent) 25%, transparent)",
                    boxShadow:
                      "0 0 16px color-mix(in srgb, var(--mq-accent) 22%, transparent), " +
                      "inset 0 1px 0 rgba(255,255,255,0.06)",
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 32,
                    mass: 0.7,
                  }}
                />
              )}

              {/* Hover halo (non-active) */}
              {!isActive && (
                <motion.div
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                />
              )}

              <motion.div
                animate={isActive ? { scale: 1.05 } : { scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="relative z-10 flex items-center gap-1.5"
              >
                <Icon className="w-4 h-4" strokeWidth={isActive ? 2.3 : 1.8} />
                <span className="hidden sm:inline">{item.label}</span>
              </motion.div>

              {/* Badge */}
              <AnimatePresence>
                {badgeCount > 0 && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 25 }}
                    className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full z-20 flex items-center justify-center text-[10px] font-bold px-1"
                    style={{
                      backgroundColor: "#ef4444",
                      color: "white",
                      boxShadow: "0 0 8px rgba(239,68,68,0.6)",
                    }}
                  >
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </motion.nav>

      {/* ── Actions (right) ── */}
      <motion.div
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-center gap-1.5 shrink-0"
      >
        {/* Settings icon-button */}
        <motion.button
          whileHover={{ scale: 1.06, y: -1 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => {
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
              try { navigator.vibrate(8); } catch {}
            }
            setView("settings");
          }}
          aria-label="Настройки"
          className="relative w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-colors"
          style={{
            background: isSettingsActive
              ? "color-mix(in srgb, var(--mq-accent) 14%, transparent)"
              : "rgba(255,255,255,0.04)",
            border: "1px solid " + (isSettingsActive
              ? "color-mix(in srgb, var(--mq-accent) 25%, transparent)"
              : "rgba(255,255,255,0.05)"),
            color: isSettingsActive ? "var(--mq-accent)" : "var(--mq-text-muted)",
          }}
        >
          <Settings className="w-4 h-4" strokeWidth={isSettingsActive ? 2.3 : 1.8} />
          {settingsBadge > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[10px] font-bold px-1"
              style={{
                backgroundColor: "#ef4444",
                color: "white",
                boxShadow: "0 0 6px rgba(239,68,68,0.6)",
              }}
            >
              {settingsBadge > 99 ? "99+" : settingsBadge}
            </span>
          )}
        </motion.button>

        {/* Profile avatar-button */}
        <motion.button
          whileHover={{ scale: 1.06, y: -1 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => {
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
              try { navigator.vibrate(8); } catch {}
            }
            setView("profile");
          }}
          aria-label="Профиль"
          className="relative flex items-center gap-2 pl-1 pr-3 py-1 rounded-full cursor-pointer transition-colors"
          style={{
            background: isProfileActive
              ? "color-mix(in srgb, var(--mq-accent) 14%, transparent)"
              : "rgba(255,255,255,0.04)",
            border: "1px solid " + (isProfileActive
              ? "color-mix(in srgb, var(--mq-accent) 25%, transparent)"
              : "rgba(255,255,255,0.05)"),
          }}
        >
          {avatar ? (
            <img
              src={avatar}
              alt=""
              className="w-6 h-6 rounded-full object-cover"
              style={{
                boxShadow: isProfileActive
                  ? "0 0 0 2px var(--mq-accent)"
                  : "0 0 0 2px var(--mq-bg), 0 0 0 3px rgba(255,255,255,0.1)",
              }}
            />
          ) : (
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))",
              }}
            >
              <User className="w-3.5 h-3.5" style={{ color: "var(--mq-text)" }} />
            </div>
          )}
          {!compactMode && (
            <span
              className="text-xs font-medium max-w-[80px] truncate"
              style={{ color: isProfileActive ? "var(--mq-accent)" : "var(--mq-text)" }}
            >
              {username || "User"}
            </span>
          )}
        </motion.button>
      </motion.div>
    </header>
  );
});

export default NavBar;
