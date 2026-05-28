"use client";

import React from "react";
import { motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { Home, Search, Library, MessageCircle, User } from "lucide-react";
import type { ViewType } from "@/store/useAppStore";

const navItems: { id: ViewType; icon: typeof Home; label: string; badgeKey?: "messenger" | "settings" }[] = [
  { id: "main", icon: Home, label: "Главная" },
  { id: "search", icon: Search, label: "Поиск" },
  { id: "library", icon: Library, label: "Библиотека" },
  { id: "messenger", icon: MessageCircle, label: "Чаты", badgeKey: "messenger" },
  { id: "settings", icon: User, label: "Профиль", badgeKey: "settings" },
];

const MobileNav = React.memo(function MobileNav() {
  const currentView = useAppStore((s) => s.currentView);
  const setView = useAppStore((s) => s.setView);
  const compactMode = useAppStore((s) => s.compactMode);
  const unreadCounts = useAppStore((s) => s.unreadCounts);
  const supportUnreadCount = useAppStore((s) => s.supportUnreadCount);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const miniPlayerHidden = useAppStore((s) => s.miniPlayerHidden);

  const messengerBadge = Object.values(unreadCounts).reduce((sum, c) => sum + c, 0);
  const getBadgeCount = (badgeKey?: string): number => {
    if (!badgeKey) return 0;
    if (badgeKey === "messenger") return messengerBadge;
    if (badgeKey === "settings") return supportUnreadCount;
    return 0;
  };

  const isPlayerVisible = currentTrack && !miniPlayerHidden;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
      role="navigation"
      aria-label="Основная навигация"
      style={{
        background: isPlayerVisible ? "var(--mq-player-bg)" : "var(--mq-glass-bg)",
        backdropFilter: "var(--mq-glass-blur)",
        WebkitBackdropFilter: "var(--mq-glass-blur)",
        borderTop: isPlayerVisible ? "none" : "1px solid var(--mq-glass-border)",
        boxShadow: isPlayerVisible ? "none" : "0 -4px 24px rgba(0,0,0,0.2), 0 -1px 6px rgba(0,0,0,0.1)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {!isPlayerVisible && (
        <div
          className="absolute -top-6 left-0 right-0 h-6 pointer-events-none"
          style={{ background: "linear-gradient(to top, var(--mq-glass-bg), transparent)", opacity: 0.6 }}
        />
      )}
      {!isPlayerVisible && (
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, var(--mq-glass-border-hover), transparent)" }}
        />
      )}
      <div className={`flex items-center justify-around ${compactMode ? "py-1.5" : "py-2"} px-1`}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          const badgeCount = getBadgeCount(item.badgeKey);
          return (
            <motion.button
              key={item.id}
              whileTap={{ scale: 0.9 }}
              onClick={() => setView(item.id)}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              tabIndex={0}
              className="flex flex-col items-center gap-0.5 px-2 py-1.5 min-w-[48px] min-h-[44px] cursor-pointer rounded-2xl relative mq-focus-premium"
              style={{ color: isActive ? "var(--mq-accent)" : "var(--mq-text-muted)", background: "transparent" }}
            >
              {isActive && (
                <motion.div
                  layoutId="mobileNavPill"
                  className="absolute inset-0 rounded-2xl"
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
              <div className="relative z-10">
                <Icon
                  className="w-[20px] h-[20px]"
                  style={isActive ? { color: "var(--mq-accent)", filter: "drop-shadow(0 0 6px var(--mq-glow))" } : undefined}
                />
                {badgeCount > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[8px] font-bold px-0.5"
                    style={{
                      background: "#ef4444",
                      color: "#fff",
                      boxShadow: "0 0 6px rgba(239,68,68,0.6)",
                    }}
                  >
                    {badgeCount > 99 ? "99" : badgeCount}
                  </span>
                )}
                {isActive && (
                  <motion.div
                    layoutId="mobileNavDot"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-1 rounded-full"
                    style={{ backgroundColor: "var(--mq-accent)", width: 16, boxShadow: "0 0 8px var(--mq-glow)" }}
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
              </div>
              <span className="text-[10px] relative z-10 font-medium">{item.label}</span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
});

export default MobileNav;
