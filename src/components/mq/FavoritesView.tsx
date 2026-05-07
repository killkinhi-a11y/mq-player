"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import {
  Heart, Trash2, Play, Pause, Clock, Music, Users, X,
  Search, Shuffle, ArrowDownUp, ListFilter, ChevronDown,
  Timer, Disc3, Sparkles, CheckCircle2
} from "lucide-react";
import type { Track } from "@/lib/musicApi";

type TabType = "liked" | "disliked" | "subscriptions";
type SortOption = "default" | "title" | "artist" | "duration";

export default function FavoritesView() {
  const {
    likedTracksData,
    likedTrackIds,
    dislikedTrackIds,
    dislikedTracksData,
    favoriteArtists,
    isPlaying,
    currentTrack,
    toggleLike,
    toggleDislike,
    playTrack,
    togglePlay,
    animationsEnabled,
    compactMode,
    removeFavoriteArtist,
    setSelectedArtist,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<TabType>("liked");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [swipedTrackId, setSwipedTrackId] = useState<string | null>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const swipeX = useMotionValue(0);

  // Close sort menu on outside click
  const handleSortOutsideClick = useCallback((e: React.MouseEvent) => {
    if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
      setShowSortMenu(false);
    }
  }, []);

  // ── Filtered & sorted data ──
  const filteredTracks = useMemo(() => {
    const tracks = activeTab === "liked" ? likedTracksData : dislikedTracksData;
    let result = [...tracks];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
      );
    }

    // Sort
    switch (sortBy) {
      case "title":
        result.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "artist":
        result.sort((a, b) => a.artist.localeCompare(b.artist));
        break;
      case "duration":
        result.sort((a, b) => (b.duration || 0) - (a.duration || 0));
        break;
    }

    return result;
  }, [activeTab, likedTracksData, dislikedTracksData, searchQuery, sortBy]);

  const filteredArtists = useMemo(() => {
    let result = [...favoriteArtists];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        a => a.username.toLowerCase().includes(q) || (a.genre && a.genre.toLowerCase().includes(q))
      );
    }
    return result;
  }, [favoriteArtists, searchQuery]);

  const tracks = activeTab === "subscriptions" ? [] : filteredTracks;
  const artists = activeTab === "subscriptions" ? filteredArtists : [];

  // ── Total duration for liked tracks ──
  const totalDuration = useMemo(() => {
    if (activeTab !== "liked") return 0;
    return filteredTracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  }, [activeTab, filteredTracks]);

  const formatTotalDuration = (seconds: number) => {
    if (seconds === 0) return "";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h} ч ${m} мин`;
    return `${m} мин`;
  };

  // ── Handlers ──
  const handlePlayTrack = useCallback((track: Track) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, tracks);
    }
  }, [currentTrack, togglePlay, playTrack, tracks]);

  const handlePlayAll = useCallback(() => {
    if (tracks.length > 0) playTrack(tracks[0], tracks);
  }, [tracks, playTrack]);

  const handleShuffleAll = useCallback(() => {
    if (tracks.length === 0) return;
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    playTrack(shuffled[0], shuffled);
  }, [tracks, playTrack]);

  const handleRemoveTrack = useCallback((trackId: string, track: Track) => {
    if (activeTab === "liked") {
      toggleLike(trackId, track);
    } else {
      toggleDislike(trackId, track);
    }
    setSwipedTrackId(null);
  }, [activeTab, toggleLike, toggleDislike]);

  const handleArtistClick = useCallback((artist: typeof favoriteArtists[0]) => {
    setSelectedArtist({
      name: artist.username,
      avatar: artist.avatar || undefined,
      genre: artist.genre || undefined,
      followers: artist.followers || undefined,
      trackCount: artist.trackCount || undefined,
    });
  }, [setSelectedArtist]);

  // Swipe handlers for mobile
  const handleSwipeStart = useCallback((trackId: string) => {
    setSwipedTrackId(trackId);
  }, []);

  const handleSwipeEnd = useCallback(() => {
    // Swipe completed — nothing extra needed
  }, []);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
  };

  const tabs: { id: TabType; label: string; icon: typeof Heart; count: number }[] = [
    { id: "liked", label: "Понравившиеся", icon: Heart, count: likedTracksData.length },
    { id: "disliked", label: "Не понравившиеся", icon: Trash2, count: dislikedTracksData.length },
    { id: "subscriptions", label: "Подписки", icon: Users, count: favoriteArtists.length },
  ];

  const sortOptions: { id: SortOption; label: string; icon: typeof ArrowDownUp }[] = [
    { id: "default", label: "По умолчанию", icon: ListFilter },
    { id: "title", label: "По названию", icon: ArrowDownUp },
    { id: "artist", label: "По артисту", icon: ArrowDownUp },
    { id: "duration", label: "По длительности", icon: Clock },
  ];

  const isSearchActive = searchQuery.trim().length > 0;

  return (
    <div
      className={`${compactMode ? "p-3 lg:p-4 pb-40 lg:pb-28" : "p-4 lg:p-6 pb-40 lg:pb-28"} max-w-2xl mx-auto`}
      onClick={handleSortOutsideClick}
    >
      {/* Header */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-1">
          <motion.div
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ type: "spring", stiffness: 300 }}
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: activeTab === "subscriptions"
                ? "rgba(139,92,246,0.12)"
                : "rgba(239,68,68,0.12)",
              border: activeTab === "subscriptions"
                ? "1px solid rgba(139,92,246,0.2)"
                : "1px solid rgba(239,68,68,0.2)",
            }}
          >
            {activeTab === "subscriptions" ? (
              <Users className="w-5 h-5" style={{ color: "#8b5cf6" }} />
            ) : (
              <Heart className="w-5 h-5" style={{ color: "#ef4444" }} />
            )}
          </motion.div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold" style={{ color: "var(--mq-text)" }}>
              Избранное
            </h1>
            <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
              {likedTrackIds.length} понравившихся · {dislikedTrackIds.length} не понравившихся · {favoriteArtists.length} подписок
            </p>
          </div>
        </div>
      </motion.div>

      {/* Tab switcher */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex gap-1 p-1 rounded-xl mt-4 mb-3"
        style={{
          backgroundColor: "var(--mq-card)",
          border: "1px solid var(--mq-border)",
        }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <motion.button
              key={tab.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => { setActiveTab(tab.id); setSearchQuery(""); setSortBy("default"); }}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer"
              style={{
                backgroundColor: activeTab === tab.id ? "var(--mq-accent)" : "transparent",
                color: activeTab === tab.id ? "var(--mq-text)" : "var(--mq-text-muted)",
              }}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              <motion.span
                key={tab.count}
                initial={{ scale: 1.3 }}
                animate={{ scale: 1 }}
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: activeTab === tab.id ? "rgba(255,255,255,0.15)" : "var(--mq-border)",
                }}
              >
                {tab.count}
              </motion.span>
            </motion.button>
          );
        })}
      </motion.div>

      {/* ── Action bar: Search + Sort + Play All ── */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 15 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-2 mb-4"
      >
        {/* Search */}
        <div
          className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200"
          style={{
            backgroundColor: searchQuery ? "var(--mq-card)" : "var(--mq-card)",
            border: searchQuery ? "1.5px solid var(--mq-accent)" : "1px solid var(--mq-border)",
          }}
        >
          <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: searchQuery ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === "subscriptions" ? "Найти артиста..." : "Найти трек..."}
            className="bg-transparent outline-none text-xs w-full"
            style={{ color: "var(--mq-text)" }}
          />
          {searchQuery && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              whileTap={{ scale: 0.8 }}
              onClick={() => setSearchQuery("")}
              className="flex-shrink-0 cursor-pointer"
              style={{ color: "var(--mq-text-muted)" }}
            >
              <X className="w-3 h-3" />
            </motion.button>
          )}
        </div>

        {/* Sort */}
        {activeTab !== "subscriptions" && (
          <div className="relative" ref={sortMenuRef}>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={(e) => { e.stopPropagation(); setShowSortMenu(!showSortMenu); }}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 cursor-pointer transition-all"
              style={{
                backgroundColor: sortBy !== "default" ? "var(--mq-accent)" : "var(--mq-card)",
                border: "1px solid var(--mq-border)",
                color: sortBy !== "default" ? "var(--mq-text)" : "var(--mq-text-muted)",
              }}
            >
              <ArrowDownUp className="w-3.5 h-3.5" />
            </motion.button>

            {/* Sort dropdown */}
            <AnimatePresence>
              {showSortMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 w-44 rounded-xl overflow-hidden z-50 shadow-xl"
                  style={{
                    backgroundColor: "var(--mq-card)",
                    border: "1px solid var(--mq-border)",
                  }}
                >
                  {sortOptions.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <motion.button
                        key={opt.id}
                        whileTap={{ scale: 0.97 }}
                        onClick={(e) => { e.stopPropagation(); setSortBy(opt.id); setShowSortMenu(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs cursor-pointer transition-colors"
                        style={{
                          color: sortBy === opt.id ? "var(--mq-accent)" : "var(--mq-text)",
                          backgroundColor: sortBy === opt.id ? "rgba(255,255,255,0.05)" : "transparent",
                        }}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {opt.label}
                        {sortBy === opt.id && (
                          <CheckCircle2 className="w-3 h-3 ml-auto" style={{ color: "var(--mq-accent)" }} />
                        )}
                      </motion.button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Shuffle / Play All — tracks tabs only */}
        {activeTab !== "subscriptions" && (
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleShuffleAll}
            disabled={tracks.length === 0}
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 cursor-pointer disabled:opacity-30 transition-all"
            style={{
              backgroundColor: "var(--mq-card)",
              border: "1px solid var(--mq-border)",
              color: "var(--mq-text-muted)",
            }}
            title="Перемешать"
          >
            <Shuffle className="w-3.5 h-3.5" />
          </motion.button>
        )}
      </motion.div>

      {/* ── Stats bar for liked tracks ── */}
      {activeTab === "liked" && likedTracksData.length > 0 && (
        <motion.div
          initial={animationsEnabled ? { opacity: 0 } : undefined}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.12 }}
          className="flex items-center gap-3 mb-3 px-1"
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handlePlayAll}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all"
            style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
          >
            <Play className="w-3.5 h-3.5" fill="currentColor" />
            Слушать все
          </motion.button>
          {totalDuration > 0 && (
            <span className="text-[11px] flex items-center gap-1" style={{ color: "var(--mq-text-muted)" }}>
              <Timer className="w-3 h-3" />
              {formatTotalDuration(totalDuration)}
            </span>
          )}
          {isSearchActive && (
            <span className="text-[11px] ml-auto" style={{ color: "var(--mq-text-muted)" }}>
              Найдено: {tracks.length}
            </span>
          )}
        </motion.div>
      )}

      {/* ── Subscriptions tab ── */}
      {activeTab === "subscriptions" && (
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl overflow-hidden"
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          {artists.length === 0 && !isSearchActive ? (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <motion.div
                initial={animationsEnabled ? { opacity: 0, scale: 0.8 } : undefined}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 relative"
                style={{ backgroundColor: "var(--mq-surface, #1a1a1a)" }}
              >
                <Users className="w-8 h-8" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
                <motion.div
                  animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full"
                  style={{ backgroundColor: "var(--mq-accent)", opacity: 0.15 }}
                />
              </motion.div>
              <p className="text-sm font-medium" style={{ color: "var(--mq-text-muted)" }}>
                Нет подписок на артистов
              </p>
              <p className="text-xs mt-1.5 text-center leading-relaxed" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
                Нажмите на артиста и подпишитесь, чтобы увидеть его здесь
              </p>
            </div>
          ) : artists.length === 0 && isSearchActive ? (
            <div className="flex flex-col items-center justify-center py-12 px-6">
              <Search className="w-8 h-8 mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
              <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                Ничего не найдено по запросу &quot;{searchQuery}&quot;
              </p>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--mq-border) transparent" }}>
              <AnimatePresence>
                {artists.map((artist, index) => (
                  <motion.div
                    key={artist.id}
                    initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10, height: 0, marginBottom: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="flex items-center gap-3 px-3 py-3 transition-all duration-200 group cursor-pointer"
                    style={{
                      borderBottom: index < artists.length - 1 ? "1px solid var(--mq-border)" : "none",
                    }}
                    onClick={() => handleArtistClick(artist)}
                    whileHover={{ backgroundColor: "rgba(255,255,255,0.02)" }}
                  >
                    {/* Artist avatar */}
                    <motion.div
                      whileHover={{ scale: 1.08 }}
                      className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 relative"
                      style={{ border: "2px solid rgba(139,92,246,0.3)" }}
                    >
                      {artist.avatar ? (
                        <img src={artist.avatar} alt={artist.username} className="w-full h-full object-cover" />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center"
                          style={{ backgroundColor: "var(--mq-surface, #1a1a1a)" }}
                        >
                          <Users className="w-4 h-4" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
                        </div>
                      )}
                      {/* Pulse ring */}
                      <motion.div
                        className="absolute inset-0 rounded-full"
                        style={{ border: "1px solid rgba(139,92,246,0.15)" }}
                        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                      />
                    </motion.div>

                    {/* Artist info */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--mq-text)" }}
                      >
                        {artist.username}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {artist.genre && (
                          <span className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
                            {artist.genre}
                          </span>
                        )}
                        {artist.followers > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--mq-surface, #1a1a1a)", color: "var(--mq-text-muted)" }}>
                            {formatNumber(artist.followers)}
                          </span>
                        )}
                        {artist.trackCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--mq-surface, #1a1a1a)", color: "var(--mq-text-muted)" }}>
                            {artist.trackCount} треков
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Open artist */}
                    <motion.button
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.85 }}
                      onClick={(e) => { e.stopPropagation(); handleArtistClick(artist); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer opacity-60 group-hover:opacity-100 transition-opacity"
                      style={{ color: "var(--mq-accent)" }}
                      title="Открыть артиста"
                    >
                      <Disc3 className="w-3.5 h-3.5" />
                    </motion.button>

                    {/* Unsubscribe button */}
                    <motion.button
                      whileHover={{ scale: 1.15, backgroundColor: "rgba(239,68,68,0.15)" }}
                      whileTap={{ scale: 0.85 }}
                      onClick={(e) => { e.stopPropagation(); removeFavoriteArtist(artist.id); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer opacity-60 group-hover:opacity-100 transition-all"
                      style={{ color: "#ef4444" }}
                      title="Отписаться"
                    >
                      <X className="w-3.5 h-3.5" />
                    </motion.button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      )}

      {/* ── Tracks list (liked/disliked tabs) ── */}
      {activeTab !== "subscriptions" && (
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl overflow-hidden"
          style={{
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
          }}
        >
          {tracks.length === 0 && !isSearchActive ? (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <motion.div
                initial={animationsEnabled ? { opacity: 0, scale: 0.8 } : undefined}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 relative"
                style={{ backgroundColor: "var(--mq-surface, #1a1a1a)" }}
              >
                {activeTab === "liked" ? (
                  <Heart className="w-8 h-8" style={{ color: "#ef4444", opacity: 0.3 }} />
                ) : (
                  <Trash2 className="w-8 h-8" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
                )}
                <motion.div
                  animate={{ y: [0, -3, 0], opacity: [0.1, 0.25, 0.1] }}
                  transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full"
                  style={{ backgroundColor: activeTab === "liked" ? "#ef4444" : "var(--mq-accent)", opacity: 0.15 }}
                />
              </motion.div>
              <p className="text-sm font-medium" style={{ color: "var(--mq-text-muted)" }}>
                {activeTab === "liked" ? "Пока нет понравившихся треков" : "Нет непонравившихся треков"}
              </p>
              <p className="text-xs mt-1.5 text-center leading-relaxed" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
                {activeTab === "liked"
                  ? "Нажмите \u2764\uFE0F на треке, чтобы добавить его в избранное"
                  : "Нажмите \uD83D\uDC4E на треке, чтобы он больше не попадался"}
              </p>
              <motion.div
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                className="flex items-center gap-1 mt-4 text-[11px]"
                style={{ color: "var(--mq-text-muted)" }}
              >
                <Sparkles className="w-3 h-3" />
                Рекомендации подстраиваются под ваши предпочтения
              </motion.div>
            </div>
          ) : tracks.length === 0 && isSearchActive ? (
            <div className="flex flex-col items-center justify-center py-12 px-6">
              <Search className="w-8 h-8 mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
              <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                Ничего не найдено по запросу &quot;{searchQuery}&quot;
              </p>
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--mq-border) transparent" }}>
              <AnimatePresence>
                {tracks.map((track, index) => {
                  const isCurrentTrack = currentTrack?.id === track.id;
                  const isCurrentlyPlaying = isCurrentTrack && isPlaying;
                  const isSwiped = swipedTrackId === track.id;

                  return (
                    <motion.div
                      key={track.id}
                      initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10, height: 0, padding: 0, marginBottom: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className="flex items-center gap-3 px-3 py-2.5 transition-all duration-200 group relative overflow-hidden"
                      style={{
                        backgroundColor: isCurrentTrack ? "rgba(255,255,255,0.04)" : "transparent",
                        borderBottom: index < tracks.length - 1 ? "1px solid var(--mq-border)" : "none",
                      }}
                      whileHover={{ backgroundColor: isCurrentTrack ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)" }}
                      // Mobile swipe to remove
                      onPointerDown={() => handleSwipeStart(track.id)}
                      onPointerUp={handleSwipeEnd}
                      onPointerCancel={() => setSwipedTrackId(null)}
                    >
                      {/* Index number (shows on hover as play icon) */}
                      <div className="w-5 text-center flex-shrink-0">
                        <span
                          className="text-[11px] tabular-nums group-hover:hidden"
                          style={{ color: isCurrentTrack ? "var(--mq-accent)" : "var(--mq-text-muted)", opacity: 0.5 }}
                        >
                          {index + 1}
                        </span>
                        <motion.button
                          whileTap={{ scale: 0.85 }}
                          onClick={() => handlePlayTrack(track)}
                          className="hidden group-hover:flex w-5 h-5 items-center justify-center cursor-pointer mx-auto"
                          style={{ color: "var(--mq-text)" }}
                        >
                          {isCurrentlyPlaying ? (
                            <Pause className="w-3.5 h-3.5" fill="currentColor" />
                          ) : (
                            <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />
                          )}
                        </motion.button>
                      </div>

                      {/* Play button */}
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.85 }}
                        onClick={() => handlePlayTrack(track)}
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer transition-all duration-200"
                        style={{
                          backgroundColor: isCurrentlyPlaying ? "var(--mq-accent)" : "var(--mq-surface, #1a1a1a)",
                          color: isCurrentlyPlaying ? "var(--mq-text)" : "var(--mq-text-muted)",
                          boxShadow: isCurrentlyPlaying ? "0 0 12px rgba(0,0,0,0.3)" : "none",
                        }}
                      >
                        {/* Equalizer animation for playing track */}
                        {isCurrentlyPlaying ? (
                          <div className="flex items-end gap-[2px] h-4">
                            <motion.div
                              animate={{ height: ["30%", "100%", "60%", "100%", "30%"] }}
                              transition={{ repeat: Infinity, duration: 0.8, ease: "easeInOut" }}
                              className="w-[2px] rounded-full"
                              style={{ backgroundColor: "var(--mq-text)" }}
                            />
                            <motion.div
                              animate={{ height: ["60%", "30%", "100%", "30%", "60%"] }}
                              transition={{ repeat: Infinity, duration: 0.8, ease: "easeInOut", delay: 0.15 }}
                              className="w-[2px] rounded-full"
                              style={{ backgroundColor: "var(--mq-text)" }}
                            />
                            <motion.div
                              animate={{ height: ["100%", "60%", "30%", "60%", "100%"] }}
                              transition={{ repeat: Infinity, duration: 0.8, ease: "easeInOut", delay: 0.3 }}
                              className="w-[2px] rounded-full"
                              style={{ backgroundColor: "var(--mq-text)" }}
                            />
                          </div>
                        ) : (
                          <Play className="w-4 h-4 ml-0.5" />
                        )}
                      </motion.button>

                      {/* Cover */}
                      <motion.div
                        whileHover={{ scale: 1.08 }}
                        className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0"
                      >
                        {track.cover ? (
                          <img
                            src={track.cover}
                            alt={track.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div
                            className="w-full h-full flex items-center justify-center"
                            style={{ backgroundColor: "var(--mq-surface, #1a1a1a)" }}
                          >
                            <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
                          </div>
                        )}
                      </motion.div>

                      {/* Track info */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium truncate"
                          style={{
                            color: isCurrentTrack ? "var(--mq-accent)" : "var(--mq-text)",
                          }}
                        >
                          {track.title}
                        </p>
                        <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
                          {track.artist}
                        </p>
                      </div>

                      {/* Duration */}
                      {track.duration > 0 && (
                        <span className="text-[10px] flex-shrink-0 hidden sm:block tabular-nums" style={{ color: "var(--mq-text-muted)" }}>
                          {formatDuration(track.duration)}
                        </span>
                      )}

                      {/* Remove button */}
                      <motion.button
                        whileHover={{ scale: 1.15 }}
                        whileTap={{ scale: 0.85 }}
                        onClick={() => handleRemoveTrack(track.id, track)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer transition-all sm:opacity-0 sm:group-hover:opacity-100"
                        style={{
                          color: activeTab === "liked" ? "#ef4444" : "var(--mq-text-muted)",
                          backgroundColor: activeTab === "liked" && isSwiped ? "rgba(239,68,68,0.15)" : "transparent",
                        }}
                        title={activeTab === "liked" ? "Убрать из избранного" : "Убрать"}
                      >
                        {activeTab === "liked" ? (
                          <motion.div
                            whileTap={{ scale: 0.5, rotate: 90 }}
                            transition={{ type: "spring", stiffness: 400 }}
                          >
                            <Heart className="w-3.5 h-3.5" style={{ fill: "#ef4444" }} />
                          </motion.div>
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </motion.button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Bottom summary bar */}
              {activeTab === "liked" && totalDuration > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderTop: "1px solid var(--mq-border)" }}
                >
                  <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                    {tracks.length} {tracks.length === 1 ? "трек" : tracks.length < 5 ? "трека" : "треков"}
                  </span>
                  <span className="text-[11px] flex items-center gap-1" style={{ color: "var(--mq-text-muted)" }}>
                    <Timer className="w-3 h-3" />
                    {formatTotalDuration(totalDuration)}
                  </span>
                </motion.div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
