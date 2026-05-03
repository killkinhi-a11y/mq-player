"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion } from "framer-motion";
import { type Track } from "@/lib/musicApi";
import TrackCard from "./TrackCard";
import ScrollReveal from "./ScrollReveal";
import { Trash2, Clock, Music, Play } from "lucide-react";

export default function HistoryView() {
  const {
    history, clearHistory, playTrack, animationsEnabled, compactMode, setSelectedArtist,
  } = useAppStore();

  const handlePlayAll = useCallback(() => {
    if (history.length > 0) {
      const tracks = history.map((h) => h.track);
      playTrack(tracks[0], tracks);
    }
  }, [history, playTrack]);

  const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Только что";
    if (minutes < 60) return `${minutes} мин назад`;
    if (hours < 24) return `${hours} ч назад`;
    if (days < 7) return `${days} дн назад`;
    return new Date(timestamp).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  };

  // Group by day
  const grouped = history.reduce<{ label: string; items: typeof history }[]>((acc, entry) => {
    const day = new Date(entry.playedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    const today = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

    let label = day;
    if (day === today) label = "Сегодня";
    else if (day === yesterday) label = "Вчера";

    const existing = acc.find((g) => g.label === label);
    if (existing) {
      existing.items.push(entry);
    } else {
      acc.push({ label, items: [entry] });
    }
    return acc;
  }, []);

  return (
    <div className={`${compactMode ? "p-3 lg:p-4 pb-36 lg:pb-24 space-y-4" : "p-4 lg:p-6 pb-40 lg:pb-28 space-y-6"} max-w-2xl mx-auto`}>
      <ScrollReveal direction="up" delay={0.05}>
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Clock className="w-6 h-6" style={{ color: "var(--mq-accent)" }} />
              <h1 className="text-2xl font-bold" style={{ color: "var(--mq-text)" }}>
                История
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {history.length > 0 && (
                <>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handlePlayAll}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
                  >
                    <Play className="w-3 h-3" style={{ marginLeft: 1 }} />
                    Воспроизвести все
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={clearHistory}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
                    style={{ color: "#ff6b6b", border: "1px solid rgba(224,49,49,0.2)" }}
                  >
                    <Trash2 className="w-3 h-3" />
                    Очистить
                  </motion.button>
                </>
              )}
            </div>
          </div>
          <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
            {history.length} прослушиваний
          </p>
        </motion.div>
      </ScrollReveal>

      {history.length > 0 ? (
        <div className="space-y-6">
          {grouped.map((group, gi) => (
            <ScrollReveal key={group.label} direction="up" delay={gi * 0.1}>
              <div>
                <h3 className="text-sm font-semibold mb-3 px-1" style={{ color: "var(--mq-text-muted)" }}>
                  {group.label}
                </h3>
                <div className="space-y-2">
                  {group.items.map((entry, i) => (
                    <div key={entry.track.id + "_" + entry.playedAt}>
                      <TrackCard track={entry.track} index={gi * 10 + i} queue={history.map(h => h.track)} onArtistClick={(name, cover) => setSelectedArtist({ name, avatar: cover })} />
                    </div>
                  ))}
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      ) : (
        <ScrollReveal direction="up" delay={0.1}>
          <div className="text-center py-16">
            <Clock className="w-16 h-16 mx-auto mb-4" style={{ color: "var(--mq-text-muted)", opacity: 0.2 }} />
            <p className="text-sm font-medium" style={{ color: "var(--mq-text-muted)" }}>
              История пуста
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
              Здесь будут отображаться прослушанные треки
            </p>
          </div>
        </ScrollReveal>
      )}
    </div>
  );
}
