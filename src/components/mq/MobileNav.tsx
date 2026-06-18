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
  const messengerBadge = Object.values(unreadCounts).reduce((sum, c) => sum + c, 0);
  const getBadgeCount = (badgeKey?: string): number => {
    if (!badgeKey) return 0;
    if (badgeKey === "messenger") return messengerBadge;
    if (badgeKey === "settings") return supportUnreadCount;
    return 0;
  };

  return (
    <nav
      className="fixed lg:hidden left-3 right-3"
      role="navigation"
      aria-label="Основная навигация"
      style={{
        bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        zIndex: 70,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Floating glass panel */}
      <div
        className="rounded-[24px] overflow-hidden"
        style={{
          background: "color-mix(in srgb, var(--mq-bg) 75%, transparent)",
          backdropFilter: "blur(32px) saturate(200%)",
          WebkitBackdropFilter: "blur(32px) saturate(200%)",
          border: "1px solid var(--mq-glass-border)",
          boxShadow: "var(--mq-shadow-float), var(--mq-shadow-inner-glow)",
        }}
      >
        <div className={`flex items-center justify-around ${compactMode ? "py-2" : "py-2.5"} px-2`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            const badgeCount = getBadgeCount(item.badgeKey);
            return (
              <motion.button
                key={item.id}
                whileTap={{ scale: 0.92 }}
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
                tabIndex={0}
                className="flex flex-col items-center gap-0.5 px-2 py-1.5 min-w-[44px] min-h-[44px] cursor-pointer relative"
                style={{ color: isActive ? "var(--mq-accent)" : "color-mix(in srgb, var(--mq-text-muted) 75%, transparent)", background: "transparent" }}
              >
                {isActive && (
                  <motion.div
                    layoutId="mobileNavPill"
                    className="absolute inset-0 rounded-xl"
                    style={{
                      background: "color-mix(in srgb, var(--mq-accent) 12%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--mq-accent) 20%, transparent)",
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <div className="relative z-10 flex flex-col items-center gap-0.5">
                  <div className="relative">
                    <Icon
                      className="w-[18px] h-[18px]"
                      strokeWidth={isActive ? 2.2 : 1.6}
                      style={isActive ? { color: "var(--mq-accent)" } : undefined}
                    />
                    {badgeCount > 0 && (
                      <span
                        className="absolute -top-1.5 -right-2 min-w-[12px] h-[12px] rounded-full flex items-center justify-center text-[11px] font-bold px-px"
                        style={{
                          background: "var(--mq-accent)",
                          color: "var(--mq-text-on-accent, #fff)",
                          boxShadow: "0 0 8px color-mix(in srgb, var(--mq-accent) 50%, transparent)",
                        }}
                      >
                        {badgeCount > 99 ? "99" : badgeCount}
                      </span>
                    )}
                  </div>
                  <span
                    className="text-[10px] font-medium leading-tight max-w-[56px] truncate"
                    style={{ letterSpacing: "-0.01em" }}
                  >
                    {item.label}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </nav>
  );
});

export default MobileNav;
