"use client";

import { motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { Home, Search, MessageCircle, Settings, Music, LogOut, User, ListMusic, Heart } from "lucide-react";
import type { ViewType } from "@/store/useAppStore";

const navItems: { id: ViewType; icon: typeof Home; label: string; badgeKey?: "messenger" | "settings" }[] = [
  { id: "main", icon: Home, label: "Главная" },
  { id: "search", icon: Search, label: "Поиск" },
  { id: "favorites", icon: Heart, label: "Избранное" },
  { id: "playlists", icon: ListMusic, label: "Плейлисты" },
  { id: "messenger", icon: MessageCircle, label: "Мессенджер", badgeKey: "messenger" },
  { id: "settings", icon: Settings, label: "Настройки", badgeKey: "settings" },
];

export default function NavBar() {
  const { currentView, setView, logout, username, avatar, compactMode, unreadCounts, supportUnreadCount } = useAppStore();

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

  return (
    <header
      className={`hidden lg:flex fixed top-0 left-0 right-0 z-50 items-center justify-between ${compactMode ? "px-4 py-2" : "px-6 py-3"}`}
      style={{
        backgroundColor: "rgba(14,14,14,0.7)",
        backdropFilter: "blur(40px) saturate(180%)",
        WebkitBackdropFilter: "blur(40px) saturate(180%)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView("main")}>
        <div className="w-8 h-8 rounded-lg overflow-hidden" style={{ boxShadow: "0 0 12px var(--mq-glow)" }}>
          <img src="/favicon.ico" alt="mq" className="w-full h-full object-cover" />
        </div>
        <span className="font-extralight text-xl tracking-wide" style={{ color: "var(--mq-text)", fontFamily: "var(--font-outfit), system-ui, sans-serif" }}>
          mq
        </span>
      </div>

      <nav className="flex items-center gap-1 p-1 rounded-2xl"
        style={{
          backgroundColor: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(20px) saturate(150%)",
          WebkitBackdropFilter: "blur(20px) saturate(150%)",
        }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          const badgeCount = getBadgeCount(item.badgeKey);
          return (
            <motion.button
              key={item.id}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setView(item.id)}
              className={`flex items-center gap-2 ${compactMode ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-xl transition-all duration-200 relative`}
              style={{
                backgroundColor: isActive ? "rgba(255,255,255,0.1)" : "transparent",
                color: isActive ? "var(--mq-text)" : "var(--mq-text-muted)",
                border: isActive ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
              }}
            >
              {isActive && (
                <div className="absolute inset-0 rounded-xl"
                  style={{
                    background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 60%)",
                    pointerEvents: "none",
                  }}
                />
              )}
              <Icon className={`${compactMode ? "w-3.5 h-3.5" : "w-4 h-4"} relative z-10`} />
              <span className="relative z-10">{item.label}</span>
              {badgeCount > 0 && (
                <span
                  className="relative z-10 -mr-1 min-w-[16px] h-[16px] rounded-full flex items-center justify-center text-[9px] font-bold px-1"
                  style={{ backgroundColor: "#ef4444", color: "#fff" }}
                >
                  {badgeCount > 99 ? "99" : badgeCount}
                </span>
              )}
              {isActive && (
                <motion.div
                  layoutId="navGlow"
                  className="absolute inset-0 rounded-xl"
                  style={{
                    boxShadow: "0 0 20px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.06)",
                    pointerEvents: "none",
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
            </motion.button>
          );
        })}
      </nav>

      <div className="flex items-center gap-3">
        {/* User profile button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setView("profile")}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all duration-200"
          style={{
            backgroundColor: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          {avatar ? (
            <img src={avatar} alt="avatar" className="w-6 h-6 rounded-full object-cover" />
          ) : (
            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)" }}>
              <User className="w-3.5 h-3.5" style={{ color: "var(--mq-text)" }} />
            </div>
          )}
          <span className="text-sm" style={{ color: "var(--mq-text)" }}>
            @{username || "User"}
          </span>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={logout}
          className="p-2 rounded-xl transition-all"
          style={{ color: "var(--mq-text-muted)" }}
          title="Выйти"
        >
          <LogOut className="w-4 h-4" />
        </motion.button>
      </div>
    </header>
  );
}
