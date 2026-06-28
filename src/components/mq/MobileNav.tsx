"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { Home, Search, Library, MessageCircle, Settings } from "lucide-react";
import type { ViewType } from "@/store/useAppStore";

const navItems: { id: ViewType; icon: typeof Home; label: string; badgeKey?: "messenger" | "settings" }[] = [
  { id: "main", icon: Home, label: "Главная" },
  { id: "search", icon: Search, label: "Поиск" },
  { id: "library", icon: Library, label: "Библиотека" },
  { id: "messenger", icon: MessageCircle, label: "Чаты", badgeKey: "messenger" },
  { id: "settings", icon: Settings, label: "Настройки", badgeKey: "settings" },
];

const MobileNav = React.memo(function MobileNav() {
  const currentView = useAppStore((s) => s.currentView);
  const setView = useAppStore((s) => s.setView);
  const compactMode = useAppStore((s) => s.compactMode);
  const unreadCounts = useAppStore((s) => s.unreadCounts);
  const supportUnreadCount = useAppStore((s) => s.supportUnreadCount);
  const messengerBadge = Object.values(unreadCounts).reduce((sum, c) => sum + (c || 0), 0);
  const settingsBadge = supportUnreadCount;

  const getBadgeCount = (badgeKey?: string): number => {
    if (badgeKey === "messenger") return messengerBadge;
    if (badgeKey === "settings") return settingsBadge;
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
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-[24px] overflow-hidden"
        style={{
          background: "color-mix(in srgb, var(--mq-bg) 75%, transparent)",
          backdropFilter: "blur(32px) saturate(200%)",
          WebkitBackdropFilter: "blur(32px) saturate(200%)",
          border: "1px solid var(--mq-glass-border)",
          boxShadow:
            "var(--mq-shadow-float), " +
            "inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        <div className={`flex items-center justify-around ${compactMode ? "py-2" : "py-2.5"} px-2`}>
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            const badgeCount = getBadgeCount(item.badgeKey);
            return (
              <motion.button
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + 0.05 * index, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
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
                      boxShadow:
                        "0 0 14px color-mix(in srgb, var(--mq-accent) 20%, transparent), " +
                        "inset 0 1px 0 rgba(255,255,255,0.05)",
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
                    style={{
                      letterSpacing: "-0.01em",
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    {item.label}
                  </span>
                </motion.div>
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </nav>
  );
});

export default MobileNav;
