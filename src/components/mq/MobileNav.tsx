"use client";

import { motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { Home, Search, MessageCircle, Settings, User } from "lucide-react";
import type { ViewType } from "@/store/useAppStore";

const navItems: { id: ViewType; icon: typeof Home; label: string }[] = [
  { id: "main", icon: Home, label: "Главная" },
  { id: "search", icon: Search, label: "Поиск" },
  { id: "messenger", icon: MessageCircle, label: "Чаты" },
  { id: "profile", icon: User, label: "Профиль" },
  { id: "settings", icon: Settings, label: "Ещё" },
];

export default function MobileNav() {
  const { currentView, setView, liquidGlassMobile, compactMode } = useAppStore();

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
      </div>
    </nav>
  );
}
