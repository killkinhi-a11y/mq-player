"use client";

// Extracted from MainView.tsx (Stage III decomposition) — moved verbatim.
import { Clock, Heart, ListMusic, MessageCircle } from "lucide-react";

// Compact borderless quick row for mobile: 4 real navigation targets,
// 44px touch height, no boxed card chrome (anti "card+card+card").
export function MobileQuickRow({
  likedCount, historyCount, playlistCount, chatCount,
  onFavorites, onHistory, onPlaylists, onMessenger,
}: {
  likedCount: number; historyCount: number; playlistCount: number; chatCount: number;
  onFavorites: () => void; onHistory: () => void; onPlaylists: () => void; onMessenger: () => void;
}) {
  const items = [
    { icon: Heart, label: "Избранное", count: likedCount, onClick: onFavorites },
    { icon: Clock, label: "История", count: historyCount, onClick: onHistory },
    { icon: ListMusic, label: "Плейлисты", count: playlistCount, onClick: onPlaylists },
    { icon: MessageCircle, label: "Чаты", count: chatCount, onClick: onMessenger },
  ];
  return (
    <div className="grid grid-cols-4 gap-1 mb-6" role="group" aria-label="Быстрые переходы">
      {items.map(({ icon: Icon, label, count, onClick }) => (
        <button
          key={label}
          onClick={onClick}
          className="flex flex-col items-center gap-1.5 py-2 rounded-xl transition-transform"
          aria-label={`${label}${count > 0 ? ` — ${count}` : ""}`}
        >
          <div className="relative">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 7%, transparent)" }}
            >
              <Icon className="w-[19px] h-[19px]" style={{ color: "var(--mq-text)" }} />
            </div>
            {count > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center mq-t-num mq-t-meta-2 font-bold"
                /* FINAL CORRECTION §7: count badges are tonal utility marks,
                    not alarms — red stays rare. */
                style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 16%, var(--mq-bg))", color: "var(--mq-text)" }}
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </div>
          <span className="mq-t-label mq-t-meta-2 leading-none max-w-full truncate" style={{ color: "var(--mq-text-muted)" }}>
            {label}
          </span>
        </button>
      ))}
    </div>
  );
}

export function QuickActionGrid({
  likedCount,
  historyCount,
  playlistCount,
  chatCount,
  onFavorites,
  onHistory,
  onPlaylists,
  onMessenger,
}: {
  likedCount: number;
  historyCount: number;
  playlistCount: number;
  chatCount: number;
  onFavorites: () => void;
  onHistory: () => void;
  onPlaylists: () => void;
  onMessenger: () => void;
}) {
  const items = [
    { icon: Heart, label: "Избранное", count: likedCount, onClick: onFavorites, accent: "#ef4444" },
    { icon: Clock, label: "История", count: historyCount, onClick: onHistory, accent: "color-mix(in srgb, var(--mq-text) 60%, transparent)" },
    { icon: ListMusic, label: "Плейлисты", count: playlistCount, onClick: onPlaylists, accent: "#8b5cf6" },
    { icon: MessageCircle, label: "Чаты", count: chatCount, onClick: onMessenger, accent: "#06b6d4" },
  ];
  return (
    <div
      className="grid grid-cols-4 lg:grid-cols-2 gap-1.5 rounded-[var(--mq-mat-radius,14px)] p-1.5"
      style={{ backgroundColor: "var(--mq-mat-1-bg)" }}
      role="group"
      aria-label="Быстрые переходы"
    >
      {items.map(({ icon: Icon, label, count, onClick, accent }) => (
        <button
          key={label}
          onClick={onClick}
          className="flex flex-col lg:flex-row items-center justify-center lg:justify-start gap-1 lg:gap-2.5 rounded-xl px-2 py-2.5 lg:px-3 transition-colors hover:bg-[var(--mq-overlay-hover)]"
        >
          <Icon className="w-4 h-4 shrink-0" style={{ color: accent }} />
          <span className="mq-t-label mq-t-meta-2 leading-none" style={{ color: "var(--mq-text)" }}>{label}</span>
          {/* V4 (UI-AUDIT г): zero counts render NOTHING — the old "—"
              glyph read as a broken/missing value. A count only exists
              when there is something to count. */}
          {count > 0 ? (
            <span className="mq-t-num mq-t-meta-2 leading-none" style={{ color: "var(--mq-text-muted)" }}>
              {count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
