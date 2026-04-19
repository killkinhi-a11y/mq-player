"use client";

import { motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { Home, Search, MessageCircle, Settings, User, ListMusic, Clock, Monitor } from "lucide-react";
import type { ViewType } from "@/store/useAppStore";

const navItems: { id: ViewType; icon: typeof Home; label: string; badgeKey?: "messenger" | "settings" }[] = [
  { id: "main", icon: Home, label: "Главная" },
  { id: "search", icon: Search, label: "Поиск" },
  { id: "playlists", icon: ListMusic, label: "Плейлисты" },
  { id: "history", icon: Clock, label: "История" },
  { id: "messenger", icon: MessageCircle, label: "Чаты", badgeKey: "messenger" },
  { id: "settings", icon: Settings, label: "Ещё", badgeKey: "settings" },
];

export default function MobileNav() {
  const { currentView, setView, liquidGlassMobile, compactMode, unreadCounts, supportUnreadCount } = useAppStore();

  // Calculate badge counts once per render (not per nav item)
  const messengerBadge = Object.values(unreadCounts).reduce((sum, c) => sum + c, 0);
  const getBadgeCount = (badgeKey?: string): number => {
    if (!badgeKey) return 0;
    if (badgeKey === "messenger") return messengerBadge;
    if (badgeKey === "settings") return supportUnreadCount;
    return 0;
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
      style={{
        backgroundColor: liquidGlassMobile ? "rgba(21,21,21,0.75)" : "var(--mq-player-bg)",
        backdropFilter: liquidGlassMobile ? "blur(40px) saturate(180%)" : "none",
        WebkitBackdropFilter: liquidGlassMobile ? "blur(40px) saturate(180%)" : "none",
        borderTop: `1px solid ${liquidGlassMobile ? "rgba(255,255,255,0.06)" : "var(--mq-border)"}`,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className={`flex items-center justify-around ${compactMode ? "py-1" : "py-1.5"} px-1`}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          const badgeCount = getBadgeCount(item.badgeKey);
          return (
            <motion.button
              key={item.id}
              whileTap={{ scale: 0.9 }}
              onClick={() => setView(item.id)}
              className={`flex flex-col items-center gap-0.5 ${compactMode ? "px-2 py-1 min-w-[40px] min-h-[38px]" : "px-3 py-1.5 min-w-[48px] min-h-[44px]"} cursor-pointer rounded-xl transition-all duration-200 relative overflow-hidden`}
              style={{
                color: isActive ? "var(--mq-accent)" : "var(--mq-text-muted)",
                backgroundColor: isActive
                  ? (liquidGlassMobile ? "rgba(255,255,255,0.06)" : "var(--mq-card)")
                  : "transparent",
              }}
            >
              {isActive && liquidGlassMobile && (
                <div className="absolute inset-0 rounded-xl"
                  style={{
                    background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 60%)",
                    pointerEvents: "none",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                />
              )}
              <div className="relative z-10">
                <Icon className={`${compactMode ? "w-4 h-4" : "w-5 h-5"}`} />
                {badgeCount > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[8px] font-bold px-0.5"
                    style={{ backgroundColor: "#ef4444", color: "#fff" }}
                  >
                    {badgeCount > 99 ? "99" : badgeCount}
                  </span>
                )}
                {isActive && (
                  <motion.div
                    layoutId="mobileNavDot"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                    style={{ backgroundColor: "var(--mq-accent)" }}
                  />
                )}
              </div>
              <span className={`${compactMode ? "text-[9px]" : "text-[10px]"} relative z-10`}>{item.label}</span>
            </motion.button>
          );
        })}

        {/* Download Desktop App */}
        <motion.a
          whileTap={{ scale: 0.9 }}
          href="https://github.com/killkinhi-a11y/mq-player/releases/download/v1.0.1/MQ-Player-Setup.zip"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-[48px] min-h-[44px] cursor-pointer rounded-xl transition-all duration-200"
          style={{ color: "#4ade80" }}
          title="Скачать приложение для ПК"
        >
          <Monitor className="w-5 h-5" />
          <span className="text-[10px]">ПК</span>
        </motion.a>
      </div>
    </nav>
  );
}
