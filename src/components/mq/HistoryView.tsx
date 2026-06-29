"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import { type Track } from "@/lib/musicApi";
import { formatDuration } from "@/lib/musicApi";
import ScrollReveal from "./ScrollReveal";
import {
  Trash2, Clock, Music, Play, Pause, Headphones, CalendarDays,
  TrendingUp, Repeat, Search, X, ListMusic, BarChart3, Flame,
  ChevronRight, Zap, Disc3,
} from "lucide-react";

export default function HistoryView() {
  const history = useAppStore((s) => s.history);
  const clearHistory = useAppStore((s) => s.clearHistory);
  const playTrack = useAppStore((s) => s.playTrack);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const compactMode = useAppStore((s) => s.compactMode);
  const setSelectedArtist = useAppStore((s) => s.setSelectedArtist);

  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const handlePlayAll = useCallback(() => {
    if (history.length > 0) {
      const tracks = history.map((h) => h.track);
      playTrack(tracks[0], tracks);
    }
  }, [history, playTrack]);

  const handleTrackClick = useCallback((track: Track) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, history.map((h) => h.track));
    }
  }, [currentTrack, isPlaying, playTrack, togglePlay, history]);

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

  // ── Listening stats ──
  const stats = useMemo(() => {
    const totalPlays = history.length;
    const totalDurationSec = history.reduce((sum, h) => sum + (h.track.duration || 0), 0);
    const totalHours = Math.floor(totalDurationSec / 3600);
    const totalMinutes = Math.floor((totalDurationSec % 3600) / 60);

    // Most active day
    const dayCounts: Record<string, number> = {};
    for (const entry of history) {
      const day = new Date(entry.playedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    }
    const mostActiveDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];

    // Unique tracks
    const uniqueTracks = new Set(history.map((h) => h.track.id)).size;

    // Top artist
    const artistCounts: Record<string, number> = {};
    for (const entry of history) {
      const a = entry.track.artist;
      if (a) artistCounts[a] = (artistCounts[a] || 0) + 1;
    }
    const topArtist = Object.entries(artistCounts).sort((a, b) => b[1] - a[1])[0];

    // Top genre
    const genreCounts: Record<string, number> = {};
    for (const entry of history) {
      const g = entry.track.genre;
      if (g) genreCounts[g] = (genreCounts[g] || 0) + 1;
    }
    const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0];

    // Today's plays
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayPlays = history.filter(h => h.playedAt >= today.getTime()).length;

    // Total play count (including repeats)
    const totalPlayCount = history.reduce((sum, h) => sum + (h.playCount || 1), 0);

    return {
      totalPlays,
      totalHours,
      totalMinutes,
      totalDurationSec,
      mostActiveDay: mostActiveDay ? { day: mostActiveDay[0], count: mostActiveDay[1] } : null,
      uniqueTracks,
      topArtist: topArtist ? { name: topArtist[0], count: topArtist[1] } : null,
      topGenre: topGenre ? { name: topGenre[0], count: topGenre[1] } : null,
      todayPlays,
      totalPlayCount,
    };
  }, [history]);

  // Filter history by search query
  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return history;
    const q = searchQuery.toLowerCase().trim();
    return history.filter(entry =>
      entry.track.title.toLowerCase().includes(q) ||
      entry.track.artist.toLowerCase().includes(q) ||
      (entry.track.genre || "").toLowerCase().includes(q) ||
      (entry.track.album || "").toLowerCase().includes(q)
    );
  }, [history, searchQuery]);

  // Group by date: Today, Yesterday, This Week, Earlier
  const grouped = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const weekAgo = new Date(today.getTime() - 6 * 86400000);

    const groups: { label: string; icon: typeof Clock; items: typeof history; order: number }[] = [
      { label: "Сегодня", icon: Zap, items: [], order: 0 },
      { label: "Вчера", icon: Clock, items: [], order: 1 },
      { label: "На этой неделе", icon: CalendarDays, items: [], order: 2 },
      { label: "Раньше", icon: Music, items: [], order: 3 },
    ];

    for (const entry of filteredHistory) {
      const entryDate = new Date(entry.playedAt);
      const entryDay = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());

      if (entryDay.getTime() === today.getTime()) {
        groups[0].items.push(entry);
      } else if (entryDay.getTime() === yesterday.getTime()) {
        groups[1].items.push(entry);
      } else if (entryDay >= weekAgo) {
        groups[2].items.push(entry);
      } else {
        groups[3].items.push(entry);
      }
    }

    // Only return groups that have items
    return groups.filter(g => g.items.length > 0);
  }, [filteredHistory]);

  const formatListeningTime = (hours: number, minutes: number): string => {
    if (hours > 0) return `${hours} ч ${minutes} мин`;
    return `${minutes} мин`;
  };

  return (
    <div className={`${compactMode ? "p-3 lg:p-4 pb-[var(--mq-player-clearance)] sm:pb-24 lg:pb-24 space-y-4" : "p-4 lg:p-6 pb-[var(--mq-player-clearance)] sm:pb-24 lg:pb-28 space-y-5"} max-w-[var(--mq-container-narrow)] mx-auto mq-anim-fade-in`} style={{ scrollBehavior: "smooth" }}>
      {/* ── Header ── */}
      <ScrollReveal direction="up" delay={0.05}>
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex items-start justify-between gap-4"
        >
          <div className="flex items-center gap-3.5">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 15%, transparent)" }}
            >
              <Clock className="w-6 h-6" style={{ color: "var(--mq-accent)" }} />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: "var(--mq-text)", letterSpacing: "-0.02em" }}>
                История
              </h1>
              <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
                {stats.totalPlays} прослушиваний{stats.uniqueTracks > 0 ? ` · ${stats.uniqueTracks} треков` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 mt-1">
            {history.length > 0 && (
              <>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handlePlayAll}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold"
                  style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
                >
                  <Play className="w-3.5 h-3.5" fill="currentColor" />
                  Слушать всё
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowClearConfirm(true)}
                  className="flex items-center justify-center w-9 h-9 rounded-xl transition-all"
                  style={{ color: "#ff6b6b", backgroundColor: "rgba(224,49,49,0.08)", border: "1px solid rgba(224,49,49,0.12)" }}
                  title="Очистить историю"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </motion.button>
              </>
            )}
          </div>
        </motion.div>
      </ScrollReveal>

      {/* ── Search / Filter bar (always visible when history has items) ── */}
      {history.length > 0 && (
        <ScrollReveal direction="up" delay={0.08}>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по истории (название, артист, жанр)..."
              className="w-full pl-10 pr-10 py-2.5 rounded-xl text-sm font-medium outline-none transition-all duration-200"
              style={{
                backgroundColor: "var(--mq-card)",
                border: searchQuery ? "1.5px solid var(--mq-accent)" : "1px solid var(--mq-border)",
                color: "var(--mq-text)",
                boxShadow: searchQuery ? "0 0 0 3px color-mix(in srgb, var(--mq-accent) 10%, transparent)" : "none",
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-white/10 transition-colors"
                style={{ color: "var(--mq-text-muted)" }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </ScrollReveal>
      )}

      {/* Search results info */}
      {searchQuery && filteredHistory.length > 0 && (
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--mq-text-muted)" }}>
          <span>Найдено: {filteredHistory.length} из {history.length}</span>
        </div>
      )}

      {/* No search results */}
      {searchQuery && filteredHistory.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <Search className="w-8 h-8 mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
          <p className="text-sm font-medium" style={{ color: "var(--mq-text)" }}>Ничего не найдено</p>
          <p className="text-xs mt-1" style={{ color: "var(--mq-text-muted)" }}>Попробуйте другой запрос</p>
        </div>
      )}

      {/* ── Listening Stats (enhanced) ── */}
      {history.length > 0 && !searchQuery && (
        <div className="space-y-2">
          {/* Main stats row */}
          <div className="grid grid-cols-3 gap-2">
            <motion.div
              className="rounded-2xl p-3 flex flex-col items-center text-center"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border-hairline)" }}
              initial={animationsEnabled ? { opacity: 0, y: 10 } : undefined}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06, duration: 0.3 }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center mb-1.5"
                style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}
              >
                <Headphones className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
              </div>
              <p className="text-base font-bold leading-none" style={{ color: "var(--mq-text)" }}>
                {stats.totalPlays}
              </p>
              <p className="text-[11px] mt-1 font-medium" style={{ color: "var(--mq-text-muted)" }}>
                Прослушиваний
              </p>
            </motion.div>

            <motion.div
              className="rounded-2xl p-3 flex flex-col items-center text-center"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border-hairline)" }}
              initial={animationsEnabled ? { opacity: 0, y: 10 } : undefined}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center mb-1.5"
                style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}
              >
                <BarChart3 className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
              </div>
              <p className="text-sm font-bold leading-none" style={{ color: "var(--mq-text)" }}>
                {stats.totalDurationSec > 0 ? formatListeningTime(stats.totalHours, stats.totalMinutes) : "0"}
              </p>
              <p className="text-[11px] mt-1 font-medium" style={{ color: "var(--mq-text-muted)" }}>
                Время
              </p>
            </motion.div>

            <motion.div
              className="rounded-2xl p-3 flex flex-col items-center text-center"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border-hairline)" }}
              initial={animationsEnabled ? { opacity: 0, y: 10 } : undefined}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14, duration: 0.3 }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center mb-1.5"
                style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}
              >
                <Flame className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
              </div>
              <p className="text-base font-bold leading-none" style={{ color: "var(--mq-text)" }}>
                {stats.todayPlays}
              </p>
              <p className="text-[11px] mt-1 font-medium" style={{ color: "var(--mq-text-muted)" }}>
                Сегодня
              </p>
            </motion.div>
          </div>

          {/* Secondary stats: top artist & top genre */}
          {(stats.topArtist || stats.topGenre) && (
            <motion.div
              className="grid grid-cols-2 gap-2"
              initial={animationsEnabled ? { opacity: 0, y: 8 } : undefined}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.3 }}
            >
              {stats.topArtist && (
                <div
                  className="rounded-xl px-3 py-2.5 flex items-center gap-2.5"
                  style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border-hairline)" }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 10%, transparent)" }}
                  >
                    <Disc3 className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium" style={{ color: "var(--mq-text-muted)" }}>Топ артист</p>
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--mq-text)" }}>{stats.topArtist.name}</p>
                  </div>
                  <span className="text-[11px] font-bold flex-shrink-0" style={{ color: "var(--mq-accent)" }}>{stats.topArtist.count}×</span>
                </div>
              )}
              {stats.topGenre && (
                <div
                  className="rounded-xl px-3 py-2.5 flex items-center gap-2.5"
                  style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border-hairline)" }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 10%, transparent)" }}
                  >
                    <TrendingUp className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium" style={{ color: "var(--mq-text-muted)" }}>Топ жанр</p>
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--mq-text)" }}>{stats.topGenre.name}</p>
                  </div>
                  <span className="text-[11px] font-bold flex-shrink-0" style={{ color: "var(--mq-accent)" }}>{stats.topGenre.count}×</span>
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}

      {/* ── Track list ── */}
      {history.length > 0 && (searchQuery ? filteredHistory.length > 0 : true) ? (
        <div className="space-y-1">
          {grouped.map((group, gi) => {
            const GroupIcon = group.icon;
            return (
              <ScrollReveal key={group.label} direction="up" delay={gi * 0.08}>
                <div className="mb-2">
                  {/* Sticky day header with enhanced styling */}
                  <div
                    className="sticky top-0 z-10 -mx-1 px-1 py-2.5 flex items-center gap-2"
                    style={{
                      backdropFilter: "blur(16px) saturate(180%)",
                      WebkitBackdropFilter: "blur(16px) saturate(180%)",
                      backgroundColor: "color-mix(in srgb, var(--mq-bg) 85%, transparent)",
                    }}
                  >
                    <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}>
                    <GroupIcon className="w-3 h-3" style={{ color: "var(--mq-accent)" }} />
                    </div>
                    <span
                      className="text-sm font-bold tracking-wide"
                      style={{ color: "var(--mq-text)" }}
                    >
                      {group.label}
                    </span>
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{ color: "var(--mq-accent)", backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}
                    >
                      {group.items.length}
                    </span>
                    {/* Play all in group button */}
                    {group.items.length > 1 && (
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const tracks = group.items.map(g => g.track);
                          playTrack(tracks[0], tracks);
                        }}
                        className="ml-auto flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg"
                        style={{ color: "var(--mq-accent)", backgroundColor: "color-mix(in srgb, var(--mq-accent) 10%, transparent)" }}
                      >
                        <Play className="w-2.5 h-2.5" fill="currentColor" />
                        Играть
                      </motion.button>
                    )}
                  </div>

                  {/* Track entries */}
                  <div
                    className="rounded-2xl overflow-hidden"
                    style={{
                      backgroundColor: "var(--mq-card)",
                      border: "1px solid var(--mq-border-hairline)",
                      boxShadow: "var(--mq-shadow-xs)",
                    }}
                  >
                    <div className="space-y-0">
                      {group.items.map((entry, i) => {
                        const track = entry.track;
                        const isActive = currentTrack?.id === track.id;
                        const isHovered = hoveredTrackId === track.id;

                        return (
                          <motion.div
                            key={entry.track.id + "_" + entry.playedAt}
                            initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03 }}
                            onMouseEnter={() => setHoveredTrackId(track.id)}
                            onMouseLeave={() => setHoveredTrackId(null)}
                            onClick={() => handleTrackClick(track)}
                            className={`group flex items-center gap-3 px-3 py-2.5 cursor-pointer relative overflow-hidden`}
                            style={{
                              backgroundColor: isActive
                                ? "color-mix(in srgb, var(--mq-accent) 8%, transparent)"
                                : "transparent",
                            }}
                            whileHover={{
                              backgroundColor: isActive
                                ? "color-mix(in srgb, var(--mq-accent) 14%, transparent)"
                                : "rgba(255,255,255,0.035)",
                            }}
                            whileTap={{ scale: 0.995 }}
                          >
                            {/* Active accent bar */}
                            {isActive && (
                              <motion.div
                                className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
                                style={{ backgroundColor: "var(--mq-accent)" }}
                              />
                            )}

                            {/* Cover art thumbnail */}
                            <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 relative" style={{ boxShadow: isActive ? "0 2px 8px color-mix(in srgb, var(--mq-accent) 20%, transparent)" : "0 1px 3px rgba(0,0,0,0.15)" }}>
                              <img
                                src={track.cover}
                                alt={track.album}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                              {/* Play overlay on hover */}
                              <AnimatePresence>
                                {(isHovered || (isActive && isPlaying)) && (
                                  <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.15 }}
                                    className="absolute inset-0 flex items-center justify-center"
                                    style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
                                  >
                                    {isActive && isPlaying ? (
                                      <Pause className="w-4 h-4" style={{ color: "#fff" }} fill="#fff" />
                                    ) : (
                                      <Play className="w-4 h-4" style={{ color: "#fff" }} fill="#fff" />
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                              {/* Playing bars indicator */}
                              {isActive && isPlaying && !isHovered && (
                                <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
                                  <div className="flex items-end gap-[2px] h-3">
                                    <motion.div
                                      animate={{ scaleY: [0.3, 1, 0.5] }}
                                      transition={{ repeat: Infinity, duration: 0.6, ease: "easeInOut" }}
                                      className="w-[2px] rounded-full"
                                      style={{ backgroundColor: "#fff", height: "100%", transformOrigin: "bottom", willChange: "transform" }}
                                    />
                                    <motion.div
                                      animate={{ scaleY: [0.6, 0.3, 1] }}
                                      transition={{ repeat: Infinity, duration: 0.6, ease: "easeInOut", delay: 0.1 }}
                                      className="w-[2px] rounded-full"
                                      style={{ backgroundColor: "#fff", height: "100%", transformOrigin: "bottom", willChange: "transform" }}
                                    />
                                    <motion.div
                                      animate={{ scaleY: [1, 0.6, 0.3] }}
                                      transition={{ repeat: Infinity, duration: 0.6, ease: "easeInOut", delay: 0.2 }}
                                      className="w-[2px] rounded-full"
                                      style={{ backgroundColor: "#fff", height: "100%", transformOrigin: "bottom", willChange: "transform" }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Track info */}
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-sm font-semibold truncate"
                                style={{ color: isActive ? "var(--mq-accent)" : "var(--mq-text)", letterSpacing: "-0.01em" }}
                              >
                                {track.title}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
                                  <span
                                    className="cursor-pointer hover:underline hover:text-[var(--mq-text)]"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedArtist({ name: track.artist, avatar: track.cover });
                                    }}
                                  >
                                    {track.artist}
                                  </span>
                                </p>
                                {/* Genre tag */}
                                {track.genre && (
                                  <span
                                    className="inline-flex items-center text-[11px] font-medium px-1.5 py-0 rounded-md flex-shrink-0"
                                    style={{
                                      backgroundColor: "rgba(255,255,255,0.06)",
                                      color: "var(--mq-text-muted)",
                                    }}
                                  >
                                    {track.genre}
                                  </span>
                                )}
                                {/* Play count badge */}
                                {entry.playCount > 1 && (
                                  <span
                                    className="inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0 rounded-md flex-shrink-0"
                                    style={{
                                      backgroundColor: "color-mix(in srgb, var(--mq-accent) 15%, transparent)",
                                      color: "var(--mq-accent)",
                                    }}
                                  >
                                    <Repeat className="w-2.5 h-2.5" />
                                    {entry.playCount}×
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Time ago + duration */}
                            <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                              <span className="text-[11px] font-medium" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
                                {formatTimeAgo(entry.playedAt)}
                              </span>
                              {track.duration > 0 && (
                                <span className="text-[11px] tabular-nums" style={{ color: "var(--mq-text-muted)", opacity: 0.5 }}>
                                  {formatDuration(track.duration)}
                                </span>
                              )}
                            </div>

                            {/* Subtle divider */}
                            {i < group.items.length - 1 && (
                              <div className="absolute bottom-0 left-14 right-3" style={{ height: 1, backgroundColor: "rgba(255,255,255,0.04)" }} />
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      ) : !searchQuery ? (
        /* ── Empty state ── */
        <div className="flex flex-col items-center justify-center py-20">
          <motion.div
            initial={animationsEnabled ? { opacity: 0, scale: 0.9 } : undefined}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
            className="mb-6"
          >
            <div
              className="flex items-center justify-center w-24 h-24 rounded-3xl relative"
              style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--mq-accent) 15%, transparent)" }}
            >
              <Clock className="w-10 h-10" style={{ color: "var(--mq-accent)", opacity: 0.45 }} />
              <motion.div
                animate={{ scale: [1, 1.15, 1], opacity: [0.06, 0.12, 0.06] }}
                transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full"
                style={{ backgroundColor: "var(--mq-accent)" }}
              />
            </div>
          </motion.div>
          <p className="text-lg font-bold mb-2" style={{ color: "var(--mq-text)" }}>
            История пуста
          </p>
          <p className="text-xs max-w-[280px] text-center leading-relaxed mb-6" style={{ color: "var(--mq-text-muted)" }}>
            Здесь будут отображаться прослушанные треки. Начните слушать музыку, чтобы заполнить историю.
          </p>
          <div className="flex flex-col items-center gap-2.5">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => useAppStore.getState().setView("main")}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-semibold"
              style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
            >
              <Music className="w-3.5 h-3.5" />
              Начать слушать
            </motion.button>
            <p className="text-[11px] flex items-center gap-1" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
              <ListMusic className="w-3 h-3" />
              История поможет вспомнить, что вы слушали
            </p>
          </div>
        </div>
      ) : null}

      {/* Clear confirmation dialog */}
      <AnimatePresence>
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
            onClick={() => setShowClearConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl p-6 text-center"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", boxShadow: "var(--mq-shadow-float)" }}
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "rgba(239,68,68,0.12)" }}>
                <Trash2 className="w-6 h-6" style={{ color: "#ef4444" }} />
              </div>
              <h3 className="text-lg font-bold mb-2" style={{ color: "var(--mq-text)" }}>Очистить историю?</h3>
              <p className="text-sm mb-1" style={{ color: "var(--mq-text-muted)" }}>Это действие нельзя отменить.</p>
              <p className="text-xs mb-5" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
                Будет удалено {stats.totalPlays} {stats.totalPlays === 1 ? "запись" : stats.totalPlays < 5 ? "записи" : "записей"} из истории прослушиваний.
              </p>
              <div className="flex items-center gap-3">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text)" }}
                >
                  Отмена
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { clearHistory(); setShowClearConfirm(false); }}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium"
                  style={{ backgroundColor: "#ef4444", color: "#fff" }}
                >
                  Очистить
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
