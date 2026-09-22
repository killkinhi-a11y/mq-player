"use client";

import React, { useCallback, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import {
  Search, MessageCircle, Settings, User, Bell, Shield, Command,
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════════════════
   NavBar — v72 DESKTOP TOP BAR, «лёгкая и ненавязчивая».

   The desktop redesign moved primary navigation into the left Sidebar
   (nav capsule rail); this bar keeps only what belongs at the top of the
   content area:
     LEFT   — a quiet search shortcut pill (⌘K / / — same focus contract
              as before: setView("search") + focus [data-search-input]);
     RIGHT  — notifications, admin (server-gated), settings, profile chip.

   Visually: transparent — no card, no border, no blur. The bar floats
   over the ambient background; the app frame supplies the depth. Badges,
   a11y labels and active-state semantics are identical to the previous
   implementation (NotificationPanel wiring preserved).
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

  // ⌘K / Ctrl+K + "/" — unchanged focus contract (search view + input focus)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setView("search");
      setTimeout(() => {
        document.querySelector<HTMLInputElement>("[data-search-input]")?.focus();
      }, 100);
    }
    if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
      if (useAppStore.getState().isFullTrackViewOpen) return;
      e.preventDefault();
      setView("search");
      setTimeout(() => {
        document.querySelector<HTMLInputElement>("[data-search-input]")?.focus();
      }, 100);
    }
  }, [setView]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const isSettingsActive = currentView === "settings";
  const isProfileActive = currentView === "profile";

  const goSearch = useCallback(() => {
    setView("search");
    setTimeout(() => {
      document.querySelector<HTMLInputElement>("[data-search-input]")?.focus();
    }, 100);
  }, [setView]);

  return (
    <header
      id="mq-navbar"
      className="hidden lg:flex fixed top-0 right-0 z-40 items-center justify-between pointer-events-none"
      role="banner"
      style={{
        left: "var(--mq-sidebar-w)",
        height: "var(--mq-topbar-h)",
        padding: "0 max(20px, var(--mq-shell-gap)) 0 8px",
      }}
    >
      {/* ── Left: quiet search shortcut pill ── */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <button
          onClick={goSearch}
          className="mq-topbar-search"
          aria-label="Поиск (Ctrl+K)"
          data-active={currentView === "search" || undefined}
        >
          <Search className="w-4 h-4" strokeWidth={1.8} />
          <span className="mq-topbar-search-label">Поиск</span>
          <span className="mq-topbar-kbd" aria-hidden="true">
            <Command className="w-3 h-3" strokeWidth={2} />K
          </span>
        </button>
        {messengerBadge > 0 && currentView !== "messenger" && (
          <button
            onClick={() => setView("messenger")}
            className="mq-topbar-search"
            aria-label={`Чаты — ${messengerBadge} непрочитанных`}
          >
            <MessageCircle className="w-4 h-4" strokeWidth={1.8} />
            <span className="mq-topbar-search-label">
              Чаты · {messengerBadge > 99 ? "99+" : messengerBadge}
            </span>
          </button>
        )}
      </div>

      {/* ── Right: actions ── */}
      <div className="flex items-center gap-1.5 shrink-0 pointer-events-auto">
        {/* Notifications */}
        <button
          onClick={() => setNotifPanelOpen(!notifPanelOpen)}
          aria-label="Уведомления"
          aria-expanded={notifPanelOpen}
          className="mq-topbar-icon"
          data-active={notifPanelOpen || undefined}
        >
          <Bell className="w-[17px] h-[17px]" strokeWidth={notifPanelOpen ? 2.2 : 1.8} />
          {notificationCount > 0 && (
            <span className="mq-topbar-badge">
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          )}
        </button>

        {/* Admin — server-gated /admin surface */}
        {userRole === "admin" && (
          <button
            onClick={() => window.open("/admin", "_self")}
            aria-label="Админ-панель"
            title="Админ-панель"
            className="mq-topbar-icon"
          >
            <Shield className="w-[17px] h-[17px]" strokeWidth={1.8} />
          </button>
        )}

        {/* Settings */}
        <button
          onClick={() => setView("settings")}
          aria-label="Настройки"
          className="mq-topbar-icon"
          data-active={isSettingsActive || undefined}
        >
          <Settings className="w-[17px] h-[17px]" strokeWidth={isSettingsActive ? 2.2 : 1.8} />
          {settingsBadge > 0 && (
            <span className="mq-topbar-badge">
              {settingsBadge > 99 ? "99+" : settingsBadge}
            </span>
          )}
        </button>

        {/* Profile */}
        <button
          onClick={() => setView("profile")}
          aria-label="Профиль"
          className="mq-topbar-profile"
          data-active={isProfileActive || undefined}
        >
          {avatar ? (
            <img src={avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
          ) : (
            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "var(--mq-surface-2)", border: "1px solid var(--mq-edge)" }}>
              <User className="w-3.5 h-3.5" style={{ color: "var(--mq-text-muted)" }} />
            </div>
          )}
          {!compactMode && (
            <span className="mq-topbar-profile-name">{username || "User"}</span>
          )}
        </button>
      </div>
    </header>
  );
});

export default NavBar;
