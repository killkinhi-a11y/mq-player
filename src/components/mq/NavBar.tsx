"use client";

import React, { useCallback, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import {
  Home, Search, MessageCircle, Settings, User, Bell, Shield,
  Library,
} from "lucide-react";
import type { ViewType } from "@/store/useAppStore";

const navItems: { id: ViewType; icon: typeof Home; label: string; badgeKey?: "messenger" | "settings" }[] = [
  { id: "main", icon: Home, label: "Главная" },
  { id: "search", icon: Search, label: "Поиск" },
  { id: "library", icon: Library, label: "Библиотека" },
  { id: "messenger", icon: MessageCircle, label: "Чаты", badgeKey: "messenger" },
];

/* ══════════════════════════════════════════════════════════════════════════
   PHASE 4B — NavBar, «Тихая редакция».
   One quiet top rail: solid surface + hairline edge (no backdrop blur,
   no glass, no glow). Brand wordmark plain. Nav = segmented tabs, active
   shown by accent text + tint, not a floating pill with shadow. The
   notification bell (Phase 4B) re-wires the previously orphaned
   NotificationPanel — it is a functional affordance, not decoration.
   ══════════════════════════════════════════════════════════════════════════ */

const NavBar = React.memo(function NavBar() {
  const currentView = useAppStore((s) => s.currentView);
  const setView = useAppStore((s) => s.setView);
  const username = useAppStore((s) => s.username);
  const avatar = useAppStore((s) => s.avatar);
  const compactMode = useAppStore((s) => s.compactMode);
  const unreadCounts = useAppStore((s) => s.unreadCounts);
  const supportUnreadCount = useAppStore((s) => s.supportUnreadCount);
  const setNotifPanelOpen = useAppStore((s) => s.setNotifPanelOpen);
  const notificationCount = useAppStore((s) => s.notificationCount);
  const notifPanelOpen = useAppStore((s) => s.notifPanelOpen);
  const userRole = useAppStore((s) => s.userRole);

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
      if (useAppStore.getState().isFullTrackViewOpen) return;
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

  const iconButtonBase =
    "relative w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-colors duration-150";

  return (
    <header
      className="hidden lg:flex fixed top-0 left-0 right-0 z-50 items-center justify-between"
      role="banner"
      style={{
        margin: "10px 16px 0",
        right: "auto",
        width: "calc(100% - 32px)",
        borderRadius: 14,
        background: "var(--mq-surface-1)",
        border: "1px solid var(--mq-edge)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
        padding: compactMode ? "5px 8px" : "6px 10px",
      }}
    >
      {/* ── Brand (left) ── */}
      <button
        onClick={() => setView("main")}
        className="flex items-center gap-2.5 cursor-pointer shrink-0 px-2 py-1 rounded-lg focus-visible:outline-2 focus-visible:outline-[var(--mq-accent)]"
        aria-label="MQ — на главную"
      >
        <div className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center" style={{ background: "var(--mq-surface-2)" }}>
          <img src="/favicon.ico" alt="mq" className="w-full h-full object-cover" />
        </div>
        <span
          className="font-light text-[17px] tracking-[0.16em] select-none"
          style={{
            color: "var(--mq-text)",
            fontFamily: "var(--mq-font-primary)",
          }}
        >
          mq
        </span>
      </button>

      {/* ── Nav (center) — segmented tabs ── */}
      <nav
        className="flex items-center gap-0.5 p-1 rounded-full"
        role="navigation"
        aria-label="Основная навигация"
        style={{ background: "var(--mq-surface-2)", border: "1px solid var(--mq-edge)" }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          const badgeCount = getBadgeCount(item.badgeKey);
          return (
            <button
              key={item.id}
              onClick={() => {
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
              className="group relative flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-[var(--mq-accent)]"
              style={{
                color: isActive ? "var(--mq-text)" : "var(--mq-text-muted)",
                background: isActive ? "var(--mq-bg)" : "transparent",
                transition: "color 0.15s ease, background-color 0.15s ease",
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                minHeight: 34,
                border: "1px solid " + (isActive ? "var(--mq-edge-strong)" : "transparent"),
              }}
            >
              <Icon className="w-4 h-4" strokeWidth={isActive ? 2.2 : 1.8} />
              <span className="hidden sm:inline">{item.label}</span>

              {/* Badge */}
              {badgeCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[16px] h-[16px] rounded-full z-20 flex items-center justify-center text-[11px] font-bold px-1"
                  style={{
                    backgroundColor: "#ef4444",
                    color: "white",
                  }}
                >
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Actions (right) ── */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Notifications — Phase 4B: bell re-wires the orphaned panel */}
        <button
          onClick={() => setNotifPanelOpen(!notifPanelOpen)}
          aria-label="Уведомления"
          aria-expanded={notifPanelOpen}
          className={iconButtonBase + " focus-visible:outline-2 focus-visible:outline-[var(--mq-accent)]"}
          style={{
            background: notifPanelOpen ? "color-mix(in srgb, var(--mq-accent) 12%, transparent)" : "transparent",
            border: "1px solid " + (notifPanelOpen ? "color-mix(in srgb, var(--mq-accent) 25%, transparent)" : "transparent"),
            color: notifPanelOpen ? "var(--mq-accent)" : "var(--mq-text-muted)",
          }}
        >
          <Bell className="w-[17px] h-[17px]" strokeWidth={notifPanelOpen ? 2.2 : 1.8} />
          {notificationCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] rounded-full flex items-center justify-center text-[11px] font-bold px-1"
              style={{ backgroundColor: "#ef4444", color: "white" }}
            >
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          )}
        </button>

        {/* Admin — server-gated /admin surface, shown only to admins */}
        {userRole === "admin" && (
          <button
            onClick={() => window.open("/admin", "_self")}
            aria-label="Админ-панель"
            title="Админ-панель"
            className={iconButtonBase + " focus-visible:outline-2 focus-visible:outline-[var(--mq-accent)]"}
            style={{ color: "var(--mq-text-muted)" }}
          >
            <Shield className="w-[17px] h-[17px]" strokeWidth={1.8} />
          </button>
        )}

        {/* Settings icon-button */}
        <button
          onClick={() => setView("settings")}
          aria-label="Настройки"
          className={iconButtonBase + " focus-visible:outline-2 focus-visible:outline-[var(--mq-accent)]"}
          style={{
            background: isSettingsActive
              ? "color-mix(in srgb, var(--mq-accent) 12%, transparent)"
              : "transparent",
            border: "1px solid " + (isSettingsActive
              ? "color-mix(in srgb, var(--mq-accent) 25%, transparent)"
              : "transparent"),
            color: isSettingsActive ? "var(--mq-accent)" : "var(--mq-text-muted)",
          }}
        >
          <Settings className="w-[17px] h-[17px]" strokeWidth={isSettingsActive ? 2.2 : 1.8} />
          {settingsBadge > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[11px] font-bold px-1"
              style={{ backgroundColor: "#ef4444", color: "white" }}
            >
              {settingsBadge > 99 ? "99+" : settingsBadge}
            </span>
          )}
        </button>

        {/* Profile avatar-button */}
        <button
          onClick={() => setView("profile")}
          aria-label="Профиль"
          className="relative flex items-center gap-2 pl-1 pr-3 py-1 rounded-full cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--mq-accent)]"
          style={{
            background: isProfileActive
              ? "color-mix(in srgb, var(--mq-accent) 12%, transparent)"
              : "transparent",
            border: "1px solid " + (isProfileActive
              ? "color-mix(in srgb, var(--mq-accent) 25%, transparent)"
              : "transparent"),
          }}
        >
          {avatar ? (
            <img
              src={avatar}
              alt=""
              className="w-6 h-6 rounded-full object-cover"
              style={{
                boxShadow: isProfileActive ? "0 0 0 2px var(--mq-accent)" : "0 0 0 1px var(--mq-edge-strong)",
              }}
            />
          ) : (
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: "var(--mq-surface-2)", border: "1px solid var(--mq-edge)" }}
            >
              <User className="w-3.5 h-3.5" style={{ color: "var(--mq-text-muted)" }} />
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
        </button>
      </div>
    </header>
  );
});

export default NavBar;
