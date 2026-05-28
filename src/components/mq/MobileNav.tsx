"use client";

import { useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { Home, Search, Heart, ListMusic, MoreHorizontal, MessageCircle, History, User, Settings, X } from "lucide-react";
import type { ViewType } from "@/store/useAppStore";

// Primary 4 tabs — always visible
const PRIMARY: { id: ViewType; icon: typeof Home; label: string }[] = [
  { id: "main",      icon: Home,      label: "Главная"   },
  { id: "search",    icon: Search,    label: "Поиск"     },
  { id: "favorites", icon: Heart,     label: "Треки"     },
  { id: "playlists", icon: ListMusic, label: "Плейлисты" },
];

// Secondary items shown in the "More" bottom sheet
const MORE: { id: ViewType; icon: typeof Home; label: string }[] = [
  { id: "messenger", icon: MessageCircle, label: "Сообщения" },
  { id: "history",   icon: History,       label: "История"   },
  { id: "profile",   icon: User,          label: "Профиль"   },
  { id: "settings",  icon: Settings,      label: "Настройки" },
];

export default function MobileNav() {
  const { currentView, setView, unreadCounts, supportUnreadCount } = useAppStore();
  const [moreOpen, setMoreOpen] = useState(false);

  const messengerBadge = Object.values(unreadCounts).reduce((s, c) => s + c, 0) + supportUnreadCount;
  const moreIsActive = MORE.some(i => i.id === currentView);

  const handleNav = (id: ViewType) => {
    setView(id);
    setMoreOpen(false);
  };

  return (
    <>
      {/* Bottom sheet overlay */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-[49] bg-black/40"
          style={{ backdropFilter: "blur(2px)" }}
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* More sheet */}
      {moreOpen && (
        <div
          className="fixed left-0 right-0 z-[51] rounded-t-2xl overflow-hidden"
          style={{
            bottom: "calc(50px + env(safe-area-inset-bottom, 0px))",
            background: "var(--mq-surface, #161616)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderBottom: "none",
          }}
        >
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <span className="text-[13px] font-semibold" style={{ color: "var(--mq-text)" }}>Ещё</span>
            <button
              onClick={() => setMoreOpen(false)}
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.07)", color: "var(--mq-text-muted)" }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-0 px-3 pb-4">
            {MORE.map(({ id, icon: Icon, label }) => {
              const active = currentView === id;
              const badge = id === "messenger" ? messengerBadge : 0;
              return (
                <button
                  key={id}
                  onClick={() => handleNav(id)}
                  className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-2xl relative"
                  style={{
                    background: active ? "var(--mq-glass-bg-active, rgba(255,255,255,0.07))" : "transparent",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <span className="relative">
                    <Icon
                      className="w-[22px] h-[22px]"
                      strokeWidth={active ? 2.2 : 1.7}
                      style={{ color: active ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
                    />
                    {badge > 0 && (
                      <span className="absolute -top-1 -right-1 w-[14px] h-[14px] rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                        style={{ background: "#ef4444" }}>
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] leading-none" style={{ color: active ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Nav bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 lg:hidden"
        role="navigation"
        aria-label="Основная навигация"
        style={{
          background: "var(--mq-glass-bg)",
          backdropFilter: "var(--mq-glass-blur)",
          WebkitBackdropFilter: "var(--mq-glass-blur)",
          borderTop: "0.5px solid var(--mq-glass-border)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          height: "calc(50px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {/* Accent hairline */}
        <div
          className="absolute top-0 inset-x-0 h-px pointer-events-none"
          style={{ background: "linear-gradient(90deg, transparent 0%, var(--mq-accent) 50%, transparent 100%)", opacity: 0.3 }}
        />

        <div className="flex items-center h-[50px]">
          {PRIMARY.map(({ id, icon: Icon, label }) => {
            const active = currentView === id;
            return (
              <button
                key={id}
                onClick={() => setView(id)}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className="relative flex flex-col items-center justify-center gap-[3px] flex-1 h-full outline-none"
                style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
              >
                {active && (
                  <span
                    className="absolute inset-x-1.5 inset-y-1.5 rounded-xl pointer-events-none"
                    style={{ background: "var(--mq-glass-bg-active, rgba(255,255,255,0.06))" }}
                  />
                )}
                <Icon
                  className="w-[19px] h-[19px] relative"
                  strokeWidth={active ? 2.2 : 1.7}
                  style={{
                    color: active ? "var(--mq-accent)" : "var(--mq-text-muted)",
                    filter: active ? "drop-shadow(0 0 4px var(--mq-glow))" : undefined,
                    transition: "color 0.12s, filter 0.12s",
                  }}
                />
                <span
                  className="text-[9px] font-medium leading-none relative"
                  style={{ color: active ? "var(--mq-accent)" : "var(--mq-text-muted)", transition: "color 0.12s" }}
                >
                  {label}
                </span>
              </button>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setMoreOpen(o => !o)}
            aria-label="Ещё"
            className="relative flex flex-col items-center justify-center gap-[3px] flex-1 h-full outline-none"
            style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
          >
            {(moreOpen || moreIsActive) && (
              <span
                className="absolute inset-x-1.5 inset-y-1.5 rounded-xl pointer-events-none"
                style={{ background: "var(--mq-glass-bg-active, rgba(255,255,255,0.06))" }}
              />
            )}
            <span className="relative">
              <MoreHorizontal
                className="w-[19px] h-[19px]"
                strokeWidth={(moreOpen || moreIsActive) ? 2.2 : 1.7}
                style={{
                  color: (moreOpen || moreIsActive) ? "var(--mq-accent)" : "var(--mq-text-muted)",
                  transition: "color 0.12s",
                }}
              />
              {messengerBadge > 0 && !moreOpen && (
                <span className="absolute -top-1 -right-1 w-[14px] h-[14px] rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                  style={{ background: "#ef4444", boxShadow: "0 0 6px rgba(239,68,68,0.5)" }}>
                  {messengerBadge > 9 ? "9+" : messengerBadge}
                </span>
              )}
            </span>
            <span
              className="text-[9px] font-medium leading-none relative"
              style={{ color: (moreOpen || moreIsActive) ? "var(--mq-accent)" : "var(--mq-text-muted)", transition: "color 0.12s" }}
            >
              Ещё
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
