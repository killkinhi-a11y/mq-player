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
        bottom: 12,
        zIndex: 70,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Floating glass panel */}
      <div
        className="rounded-[24px] overflow-hidden"
        style={{
          background: "color-mix(in srgb, var(--mq-bg) 65%, transparent)",
          backdropFilter: "blur(32px) saturate(200%)",
          WebkitBackdropFilter: "blur(32px) saturate(200%)",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.3), 0 0 20px color-mix(in srgb, var(--mq-accent) 5%, transparent), inset 0 1px 0 rgba(255,255,255,0.04)",
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
                whileTap={{ scale: 0.88 }}
                onClick={() => setView(item.id)}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                tabIndex={0}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-[48px] min-h-[44px] cursor-pointer relative"
                style={{ color: isActive ? "var(--mq-accent)" : "color-mix(in srgb, var(--mq-text-muted) 70%, transparent)", background: "transparent" }}
              >
                {isActive && (
                  <motion.div
                    layoutId="mobileNavPill"
                    className="absolute inset-0 rounded-2xl"
                    style={{
                      background: "color-mix(in srgb, var(--mq-accent) 10%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--mq-accent) 15%, transparent)",
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <div className="relative z-10 flex flex-col items-center gap-0.5">
                  <div className="relative">
                    <Icon
                      className="w-[18px] h-[18px]"
                      strokeWidth={isActive ? 2.2 : 1.5}
                      style={isActive ? { color: "var(--mq-accent)", filter: "drop-shadow(0 0 6px color-mix(in srgb, var(--mq-accent) 40%, transparent))" } : undefined}
                    />
                    {badgeCount > 0 && (
                      <span
                        className="absolute -top-1.5 -right-2 min-w-[12px] h-[12px] rounded-full flex items-center justify-center text-[7px] font-bold px-px"
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
                    className="text-[9px] font-medium leading-tight"
                    style={{ letterSpacing: "-0.01em" }}
                  >
                    {item.label}
                  </span>
                </div>
                {/* Active dot indicator */}
                {isActive && (
                  <motion.div
                    layoutId="mobileNavDot"
                    className="absolute -bottom-0.5 h-[3px] rounded-full"
                    style={{ backgroundColor: "var(--mq-accent)", width: 12, boxShadow: "0 0 8px color-mix(in srgb, var(--mq-accent) 50%, transparent)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </nav>
  );
});

export default MobileNav;
