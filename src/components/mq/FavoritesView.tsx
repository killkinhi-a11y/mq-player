"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import {
  Heart, Trash2, Play, Pause, Clock, Music, Users, X,
  Search, Shuffle, ArrowDownUp, ListFilter, ChevronDown,
  Timer, Disc3, Sparkles, CheckCircle2, ThumbsDown,
  CheckSquare, Square, ListPlus, Tag, Filter, SlidersHorizontal,
  CalendarDays, MoreHorizontal,
} from "lucide-react";
import type { Track } from "@/lib/musicApi";
import ContextMenu from "./ContextMenu";
import { useTrackContextMenu } from "@/hooks/useTrackContextMenu";

type TabType = "liked" | "disliked" | "subscriptions";
type SortOption = "default" | "title" | "artist" | "duration" | "dateAdded";

export default function FavoritesView() {
  const likedTracksData = useAppStore((s) => s.likedTracksData);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const dislikedTrackIds = useAppStore((s) => s.dislikedTrackIds);
  const dislikedTracksData = useAppStore((s) => s.dislikedTracksData);
  const favoriteArtists = useAppStore((s) => s.favoriteArtists);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const toggleDislike = useAppStore((s) => s.toggleDislike);
  const playTrack = useAppStore((s) => s.playTrack);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const compactMode = useAppStore((s) => s.compactMode);
  const removeFavoriteArtist = useAppStore((s) => s.removeFavoriteArtist);
  const setSelectedArtist = useAppStore((s) => s.setSelectedArtist);
  const playlists = useAppStore((s) => s.playlists);
  const addToPlaylist = useAppStore((s) => s.addToPlaylist);

  const [activeTab, setActiveTab] = useState<TabType>("liked");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  // Context menu (right-click / long-press / 3-dot button)
  const { contextMenu, closeContextMenu, handleContextMenu, handleMoreClick } = useTrackContextMenu();

  // Batch selection state
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);

  // Active filter tag
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  // Close sort menu on outside click
  const handleSortOutsideClick = useCallback((e: React.MouseEvent) => {
    if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
      setShowSortMenu(false);
    }
  }, []);

  // ── Extract unique genres & artists for filter tags ──
  const filterTags = useMemo(() => {
    const tracks = activeTab === "liked" ? likedTracksData : dislikedTracksData;
    const genres = new Map<string, number>();
    const artists = new Map<string, number>();
    for (const t of tracks) {
      if (t.genre) genres.set(t.genre, (genres.get(t.genre) || 0) + 1);
      if (t.artist) artists.set(t.artist, (artists.get(t.artist) || 0) + 1);
    }
    const genreTags = Array.from(genres.entries())
      .filter(([, c]) => c >= 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([g]) => ({ type: "genre" as const, value: g }));
    const artistTags = Array.from(artists.entries())
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([a]) => ({ type: "artist" as const, value: a }));
    return [...artistTags, ...genreTags];
  }, [activeTab, likedTracksData, dislikedTracksData]);

  // ── Filtered & sorted data ──
  const filteredTracks = useMemo(() => {
    const tracks = activeTab === "liked" ? likedTracksData : dislikedTracksData;
    let result = [...tracks];

    // Filter tag
    if (activeFilter) {
      const [filterType, filterValue] = activeFilter.split("::");
      if (filterType === "genre") {
        result = result.filter(t => t.genre === filterValue);
      } else if (filterType === "artist") {
        result = result.filter(t => t.artist === filterValue);
      }
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || (t.genre || "").toLowerCase().includes(q)
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
      case "dateAdded":
        // Keep original order (most recent first) - likedTracksData is already in this order
        break;
    }

    return result;
  }, [activeTab, likedTracksData, dislikedTracksData, searchQuery, sortBy, activeFilter]);

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

  // ── Progressive rendering (M4) ──
  // Render only the first N tracks, load more when sentinel enters viewport.
  // Avoids rendering 500+ DOM subtrees for large favorites lists.
  const VISIBLE_INITIAL = 30;
  const VISIBLE_STEP = 30;
  const [visibleCount, setVisibleCount] = useState(VISIBLE_INITIAL);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset visible count when the underlying tracks array changes identity
  // (new search, tab switch, filter change)
  useEffect(() => {
    setVisibleCount(VISIBLE_INITIAL);
  }, [filteredTracks, activeTab]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    if (visibleCount >= tracks.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisibleCount((prev) => Math.min(prev + VISIBLE_STEP, tracks.length));
          }
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, tracks.length]);

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
    // Remove from batch selection if present
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(trackId);
      return next;
    });
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

  // ── Batch actions ──
  const toggleBatchSelection = useCallback((trackId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(tracks.map(t => t.id)));
  }, [tracks]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBatchRemove = useCallback(() => {
    for (const id of selectedIds) {
      const track = tracks.find(t => t.id === id);
      if (track) {
        if (activeTab === "liked") toggleLike(id, track);
        else toggleDislike(id, track);
      }
    }
    setSelectedIds(new Set());
    setBatchMode(false);
  }, [selectedIds, tracks, activeTab, toggleLike, toggleDislike]);

  const handleBatchAddToPlaylist = useCallback((playlistId: string) => {
    for (const id of selectedIds) {
      const track = tracks.find(t => t.id === id);
      if (track) addToPlaylist(playlistId, track);
    }
    setSelectedIds(new Set());
    setBatchMode(false);
    setShowPlaylistMenu(false);
  }, [selectedIds, tracks, addToPlaylist]);

  const exitBatchMode = useCallback(() => {
    setBatchMode(false);
    setSelectedIds(new Set());
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

  const tabs: { id: TabType; label: string; icon: typeof Heart; count: number; color: string }[] = [
    { id: "liked", label: "Понравившиеся", icon: Heart, count: likedTracksData.length, color: "#ef4444" },
    { id: "disliked", label: "Не понравившиеся", icon: ThumbsDown, count: dislikedTracksData.length, color: "#f97316" },
    { id: "subscriptions", label: "Подписки", icon: Users, count: favoriteArtists.length, color: "#8b5cf6" },
  ];

  const sortOptions: { id: SortOption; label: string; icon: typeof ArrowDownUp }[] = [
    { id: "default", label: "По умолчанию", icon: ListFilter },
    { id: "dateAdded", label: "По дате добавления", icon: CalendarDays },
    { id: "title", label: "По названию", icon: ArrowDownUp },
    { id: "artist", label: "По артисту", icon: ArrowDownUp },
    { id: "duration", label: "По длительности", icon: Clock },
  ];

  const isSearchActive = searchQuery.trim().length > 0;

  return (
    <div
      className={`${compactMode ? "p-3 lg:p-4 pb-[var(--mq-player-clearance)] sm:pb-24 lg:pb-28" : "p-4 lg:p-6 pb-[var(--mq-player-clearance)] sm:pb-24 lg:pb-28"} max-w-[var(--mq-container-narrow)] mx-auto`}
      onClick={handleSortOutsideClick}
    >
      {/* ── Header ── */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <div className="flex items-center gap-3 mb-1">
          <motion.div
            whileHover={{ scale: 1.06 }}
            transition={{ type: "spring", stiffness: 300 }}
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: activeTab === "subscriptions"
                ? "rgba(139,92,246,0.1)"
                : activeTab === "disliked"
                ? "rgba(249,115,22,0.1)"
                : "color-mix(in srgb, var(--mq-accent) 12%, transparent)",
              border: "1px solid var(--mq-border-thin)",
            }}
          >
            {activeTab === "subscriptions" ? (
              <Users className="w-4.5 h-4.5" style={{ color: "#8b5cf6" }} />
            ) : activeTab === "disliked" ? (
              <ThumbsDown className="w-4.5 h-4.5" style={{ color: "#f97316" }} />
            ) : (
              <Heart className="w-4.5 h-4.5" style={{ color: "#ef4444" }} />
            )}
          </motion.div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--mq-text)", letterSpacing: "-0.02em", fontFamily: "var(--mq-font-serif)" }}>
              Избранное
            </h1>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
              {likedTrackIds.length} понр. · {dislikedTrackIds.length} не понр. · {favoriteArtists.length} подписок
            </p>
          </div>
          {/* Batch mode toggle */}
          {activeTab !== "subscriptions" && filteredTracks.length > 0 && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                if (batchMode) exitBatchMode();
                else setBatchMode(true);
              }}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 cursor-pointer transition-all duration-200"
              style={{
                backgroundColor: batchMode ? "var(--mq-accent)" : "rgba(255,255,255,0.06)",
                color: batchMode ? "var(--mq-text)" : "var(--mq-text-muted)",
              }}
              title={batchMode ? "Отменить выбор" : "Выбрать несколько"}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </motion.button>
          )}
        </div>
      </motion.div>

      {/* ── Pill-style tab switcher ── */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 10 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, duration: 0.3 }}
        className="mt-4 mb-3"
      >
        <LayoutGroup>
          <div
            className="flex gap-1 p-1 rounded-xl"
            style={{
              backgroundColor: "var(--mq-card)",
              border: "1px solid var(--mq-border-thin)",
            }}
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { setActiveTab(tab.id); setSearchQuery(""); setSortBy("default"); setActiveFilter(null); exitBatchMode(); }}
                  className="relative flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors duration-200 cursor-pointer"
                  style={{
                    color: isActive ? "var(--mq-text)" : "var(--mq-text-muted)",
                  }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTabBg"
                      className="absolute inset-0 rounded-lg"
                      style={{
                        backgroundColor: tab.color,
                        opacity: 0.2,
                        boxShadow: "var(--mq-shadow-xs)",
                      }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" style={{ color: isActive ? tab.color : undefined }} />
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span
                      className="text-[11px] px-1.5 py-0.5 rounded-full font-bold"
                      style={{
                        backgroundColor: isActive ? `${tab.color}22` : "rgba(255,255,255,0.06)",
                        color: isActive ? tab.color : "var(--mq-text-muted)",
                      }}
                    >
                      {tab.count}
                    </span>
                  </span>
                </motion.button>
              );
            })}
          </div>
        </LayoutGroup>
      </motion.div>

      {/* ── Filter tags ── */}
      {activeTab !== "subscriptions" && filterTags.length > 1 && (
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 8 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.3 }}
          className="flex gap-1.5 mb-3 overflow-x-auto pb-1 scrollbar-none"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={() => setActiveFilter(null)}
            className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 cursor-pointer"
            style={{
              backgroundColor: !activeFilter ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.04)",
              color: !activeFilter ? "var(--mq-accent)" : "var(--mq-text-muted)",
              border: !activeFilter ? "1px solid var(--mq-border-accent)" : "1px solid var(--mq-border-thin)",
            }}
          >
            <Filter className="w-3 h-3" />
            Все
          </motion.button>
          {filterTags.map(tag => {
            const tagKey = `${tag.type}::${tag.value}`;
            const isActive = activeFilter === tagKey;
            return (
              <motion.button
                key={tagKey}
                whileTap={{ scale: 0.93 }}
                onClick={() => setActiveFilter(isActive ? null : tagKey)}
                className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200 cursor-pointer"
                style={{
                  backgroundColor: isActive ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)" : "rgba(255,255,255,0.04)",
                  color: isActive ? "var(--mq-accent)" : "var(--mq-text-muted)",
                  border: isActive ? "1px solid var(--mq-border-accent)" : "1px solid var(--mq-border-thin)",
                }}
              >
                {tag.type === "genre" ? <Tag className="w-3 h-3" /> : <Disc3 className="w-3 h-3" />}
                {tag.value}
              </motion.button>
            );
          })}
        </motion.div>
      )}

      {/* ── Action bar: Search + Sort + Shuffle ── */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 15 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-2.5 mb-4"
      >
        {/* Search bar */}
        <div
          className="flex-1 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl transition-all duration-200"
          style={{
            backgroundColor: "rgba(255,255,255,0.04)",
            border: searchQuery ? "1.5px solid var(--mq-accent)" : "1px solid var(--mq-border-thin)",
            boxShadow: searchQuery ? "0 0 0 3px color-mix(in srgb, var(--mq-accent) 10%, transparent)" : "none",
          }}
        >
          <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: searchQuery ? "var(--mq-accent)" : "var(--mq-text-muted)", transition: "color 0.2s ease" }} />
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
              className="flex-shrink-0 cursor-pointer w-5 h-5 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "var(--mq-text-muted)" }}
            >
              <X className="w-3 h-3" />
            </motion.button>
          )}
        </div>

        {/* Sort button */}
        {activeTab !== "subscriptions" && (
          <div className="relative" ref={sortMenuRef}>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={(e) => { e.stopPropagation(); setShowSortMenu(!showSortMenu); }}
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 cursor-pointer transition-all duration-200"
              style={{
                backgroundColor: sortBy !== "default" ? "var(--mq-accent)" : "rgba(255,255,255,0.06)",
                color: sortBy !== "default" ? "var(--mq-text)" : "var(--mq-text-muted)",
                boxShadow: sortBy !== "default" ? "0 2px 8px rgba(0,0,0,0.15)" : "none",
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
                  className="absolute right-0 top-full mt-2 w-52 rounded-xl overflow-hidden z-50 shadow-xl"
                  style={{
                    backgroundColor: "var(--mq-card)",
                    border: "1px solid var(--mq-border-thin)",
                    boxShadow: "var(--mq-shadow-float)",
                  }}
                >
                  <div className="px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>Сортировка</p>
                  </div>
                  {sortOptions.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <motion.button
                        key={opt.id}
                        whileTap={{ scale: 0.97 }}
                        onClick={(e) => { e.stopPropagation(); setSortBy(opt.id); setShowSortMenu(false); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs cursor-pointer transition-colors"
                        style={{
                          color: sortBy === opt.id ? "var(--mq-accent)" : "var(--mq-text)",
                          backgroundColor: sortBy === opt.id ? "rgba(255,255,255,0.04)" : "transparent",
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

        {/* Shuffle — tracks tabs only */}
        {activeTab !== "subscriptions" && !batchMode && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleShuffleAll}
            disabled={tracks.length === 0}
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 cursor-pointer disabled:opacity-30 transition-all duration-200"
            style={{
              backgroundColor: "rgba(255,255,255,0.06)",
              color: "var(--mq-text-muted)",
            }}
            title="Перемешать"
          >
            <Shuffle className="w-3.5 h-3.5" />
          </motion.button>
        )}
      </motion.div>

      {/* ── Batch action bar ── */}
      {batchMode && activeTab !== "subscriptions" && (
        <motion.div
          initial={{ opacity: 0, y: -10, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -10, height: 0 }}
          className="flex items-center gap-2 mb-3 px-1"
        >
          <span className="text-[11px] font-medium" style={{ color: "var(--mq-text-muted)" }}>
            Выбрано: {selectedIds.size}
          </span>
          <div className="flex-1" />
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={selectedIds.size === tracks.length ? deselectAll : selectAll}
            className="text-[11px] font-medium px-3 py-1.5 rounded-lg cursor-pointer"
            style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text)" }}
          >
            {selectedIds.size === tracks.length ? "Снять все" : "Выбрать все"}
          </motion.button>
          {activeTab === "liked" && playlists.length > 0 && selectedIds.size > 0 && (
            <div className="relative">
              <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={() => setShowPlaylistMenu(!showPlaylistMenu)}
                className="text-[11px] font-medium px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1"
                style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)", color: "var(--mq-accent)" }}
              >
                <ListPlus className="w-3 h-3" />
                В плейлист
              </motion.button>
              <AnimatePresence>
                {showPlaylistMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -5, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -5, scale: 0.95 }}
                    className="absolute right-0 top-full mt-1 w-48 rounded-xl overflow-hidden z-50"
                    style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border-thin)", boxShadow: "var(--mq-shadow-float)" }}
                    onClick={e => e.stopPropagation()}
                  >
                    {playlists.map(pl => (
                      <motion.button
                        key={pl.id}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleBatchAddToPlaylist(pl.id)}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs cursor-pointer transition-colors"
                        style={{ color: "var(--mq-text)" }}
                      >
                        <ListFilter className="w-3 h-3" style={{ color: "var(--mq-text-muted)" }} />
                        {pl.name}
                      </motion.button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          {selectedIds.size > 0 && (
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={handleBatchRemove}
              className="text-[11px] font-medium px-3 py-1.5 rounded-lg cursor-pointer"
              style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#ef4444" }}
            >
              <Trash2 className="w-3 h-3 inline mr-1" />
              Удалить
            </motion.button>
          )}
        </motion.div>
      )}

      {/* ── Stats bar for tracks (prominent Play All / Shuffle All) ── */}
      {activeTab !== "subscriptions" && tracks.length > 0 && !batchMode && (
        <motion.div
          initial={animationsEnabled ? { opacity: 0 } : undefined}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.12 }}
          className="flex items-center gap-2.5 mb-4 px-1"
        >
          <motion.button
            whileHover={{ scale: 1.02, boxShadow: "var(--mq-shadow-card-hover)" }}
            whileTap={{ scale: 0.97 }}
            onClick={handlePlayAll}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold cursor-pointer transition-all duration-200"
            style={{
              backgroundColor: "var(--mq-accent)",
              color: "var(--mq-text)",
              boxShadow: "var(--mq-shadow-card)",
            }}
          >
            <Play className="w-3.5 h-3.5" fill="currentColor" />
            {activeTab === "liked" ? "Слушать все" : "Прослушать"}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleShuffleAll}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold cursor-pointer transition-all duration-200"
            style={{
              backgroundColor: "rgba(255,255,255,0.06)",
              color: "var(--mq-text-muted)",
              border: "1px solid var(--mq-border-thin)",
            }}
          >
            <Shuffle className="w-3.5 h-3.5" />
            Перемешать
          </motion.button>
          <div className="flex-1" />
          {totalDuration > 0 && (
            <span className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--mq-text-muted)" }}>
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
            border: "1px solid var(--mq-border-thin)",
            boxShadow: "var(--mq-shadow-xs)",
          }}
        >
          {artists.length === 0 && !isSearchActive ? (
            <div className="mq-empty-state py-16 px-6">
              <motion.div
                initial={animationsEnabled ? { opacity: 0, scale: 0.9 } : undefined}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(139,92,246,0.08)",
                  border: "1px solid rgba(139,92,246,0.15)",
                  marginBottom: 16,
                  position: "relative",
                }}
              >
                <Users className="w-7 h-7" style={{ color: "#8b5cf6", opacity: 0.5 }} />
                <motion.div
                  animate={{ scale: [1, 1.2, 1], opacity: [0.08, 0.15, 0.08] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full"
                  style={{ backgroundColor: "#8b5cf6" }}
                />
              </motion.div>
              <p className="text-sm font-semibold mb-1" style={{ color: "var(--mq-text)" }}>
                Пока пусто
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
                Подпишитесь на артистов — и они появятся здесь
              </p>
            </div>
          ) : artists.length === 0 && isSearchActive ? (
            <div className="mq-empty-state py-12 px-6">
              <Search className="w-7 h-7 mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
              <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                Ничего не найдено по запросу &quot;{searchQuery}&quot;
              </p>
            </div>
          ) : (
            <div className="mq-track-list space-y-0.5">
              <AnimatePresence>
                {artists.map((artist, index) => (
                  <motion.div
                    key={artist.id}
                    initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10, height: 0, marginBottom: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className="relative flex items-center gap-3.5 px-4 py-3 transition-all duration-200 group cursor-pointer"
                    onClick={() => handleArtistClick(artist)}
                    whileHover={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                  >
                    {/* Artist avatar */}
                    <motion.div
                      whileHover={{ scale: 1.06 }}
                      className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 relative"
                      style={{ border: "2px solid rgba(139,92,246,0.25)" }}
                    >
                      {artist.avatar ? (
                        <img src={artist.avatar} alt={artist.username} className="w-full h-full object-cover" />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center"
                          style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                        >
                          <Users className="w-4 h-4" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
                        </div>
                      )}
                    </motion.div>

                    {/* Artist info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>
                        {artist.username}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {artist.genre && (
                          <span className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
                            {artist.genre}
                          </span>
                        )}
                        {artist.followers > 0 && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "var(--mq-text-muted)" }}>
                            {formatNumber(artist.followers)}
                          </span>
                        )}
                        {artist.trackCount > 0 && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "var(--mq-text-muted)" }}>
                            {artist.trackCount} треков
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Open artist */}
                    <motion.button
                      whileHover={{ scale: 1.12 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => { e.stopPropagation(); handleArtistClick(artist); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer sm:opacity-0 sm:group-hover:opacity-70 transition-opacity"
                      style={{ color: "var(--mq-accent)" }}
                      title="Открыть артиста"
                    >
                      <Disc3 className="w-3.5 h-3.5" />
                    </motion.button>

                    {/* Unsubscribe button */}
                    <motion.button
                      whileHover={{ scale: 1.12, backgroundColor: "rgba(239,68,68,0.12)" }}
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => { e.stopPropagation(); removeFavoriteArtist(artist.id); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer sm:opacity-0 sm:group-hover:opacity-70 transition-all"
                      style={{ color: "#ef4444" }}
                      title="Отписаться"
                    >
                      <X className="w-3.5 h-3.5" />
                    </motion.button>

                    {/* Subtle divider between items */}
                    {index < artists.length - 1 && (
                      <div className="absolute bottom-0 left-16 right-4" style={{ height: 1, backgroundColor: "rgba(255,255,255,0.04)" }} />
                    )}
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
            border: "1px solid var(--mq-border-thin)",
            boxShadow: "var(--mq-shadow-xs)",
          }}
        >
          {tracks.length === 0 && !isSearchActive && !activeFilter ? (
            <div className="mq-empty-state py-16 px-6">
              <motion.div
                initial={animationsEnabled ? { opacity: 0, scale: 0.9 } : undefined}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: activeTab === "liked"
                    ? "rgba(239,68,68,0.08)"
                    : "rgba(249,115,22,0.08)",
                  border: activeTab === "liked"
                    ? "1px solid rgba(239,68,68,0.12)"
                    : "1px solid rgba(249,115,22,0.12)",
                  marginBottom: 16,
                  position: "relative",
                }}
              >
                {activeTab === "liked" ? (
                  <Heart className="w-8 h-8" style={{ color: "#ef4444", opacity: 0.35 }} />
                ) : (
                  <ThumbsDown className="w-8 h-8" style={{ color: "#f97316", opacity: 0.35 }} />
                )}
                <motion.div
                  animate={{ y: [0, -3, 0], opacity: [0.08, 0.2, 0.08] }}
                  transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full"
                  style={{ backgroundColor: activeTab === "liked" ? "#ef4444" : "#f97316" }}
                />
              </motion.div>
              <p className="text-sm font-semibold mb-1" style={{ color: "var(--mq-text)" }}>
                {activeTab === "liked" ? "Пока пусто" : "Пока пусто"}
              </p>
              <p className="text-xs leading-relaxed max-w-[240px] text-center" style={{ color: "var(--mq-text-muted)" }}>
                {activeTab === "liked"
                  ? "Лайкните трек — и он окажется здесь. Чем больше лайков, тем точнее рекомендации."
                  : "Дизлайкните трек — и он больше не попадётся в рекомендациях."}
              </p>
              {activeTab === "liked" && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => useAppStore.getState().setView("main")}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold"
                  style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
                >
                  <Music className="w-3.5 h-3.5" />
                  Искать музыку
                </motion.button>
              )}
              <motion.div
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                className="flex items-center gap-1.5 mt-4 text-[11px]"
                style={{ color: "var(--mq-text-muted)" }}
              >
                <Sparkles className="w-3 h-3" />
                Рекомендации подстраиваются под ваши предпочтения
              </motion.div>
            </div>
          ) : tracks.length === 0 && (isSearchActive || activeFilter) ? (
            <div className="mq-empty-state py-14 px-6 flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid var(--mq-border-thin)" }}>
                <Search className="w-6 h-6" style={{ color: "var(--mq-text-muted)", opacity: 0.35 }} />
              </div>
              <p className="text-sm font-semibold mb-1" style={{ color: "var(--mq-text)" }}>
                Ничего не найдено
              </p>
              <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                {isSearchActive ? `По запросу «${searchQuery}»` : "По выбранному фильтру"}
              </p>
              {activeFilter && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveFilter(null)}
                  className="mt-2 text-xs font-medium px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text-muted)" }}
                >
                  Сбросить фильтр
                </motion.button>
              )}
            </div>
          ) : (
            <div className="mq-track-list space-y-0">
              <AnimatePresence>
                {tracks.slice(0, visibleCount).map((track, index) => {
                  const isCurrentTrack = currentTrack?.id === track.id;
                  const isCurrentlyPlaying = isCurrentTrack && isPlaying;
                  const isSelected = batchMode && selectedIds.has(track.id);

                  return (
                    <motion.div
                      key={track.id}
                      initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10, height: 0, padding: 0, marginBottom: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className="flex items-center gap-3 px-4 py-3.5 transition-all duration-200 group relative overflow-hidden"
                      style={{
                        backgroundColor: isSelected
                          ? "color-mix(in srgb, var(--mq-accent) 6%, transparent)"
                          : isCurrentTrack
                          ? "rgba(255,255,255,0.04)"
                          : "transparent",
                      }}
                      whileHover={{ backgroundColor: isSelected ? "color-mix(in srgb, var(--mq-accent) 10%, transparent)" : isCurrentTrack ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)" }}
                      onClick={batchMode ? () => toggleBatchSelection(track.id) : undefined}
                      onContextMenu={(e) => handleContextMenu(track, e)}
                    >
                      {/* Active track left accent */}
                      {isCurrentTrack && !batchMode && (
                        <motion.div
                          layoutId="activeTrackAccent"
                          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
                          style={{ backgroundColor: "var(--mq-accent)" }}
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}

                      {/* Batch checkbox */}
                      {batchMode ? (
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors"
                          style={{
                            backgroundColor: isSelected ? "var(--mq-accent)" : "rgba(255,255,255,0.06)",
                            border: isSelected ? "none" : "1.5px solid var(--mq-border-medium)",
                            color: isSelected ? "var(--mq-text)" : "transparent",
                          }}
                        >
                          <CheckSquare className="w-3.5 h-3.5" />
                        </motion.button>
                      ) : (
                        /* Index / Play on hover */
                        <div className="w-6 text-center flex-shrink-0">
                          <span
                            className="text-[11px] tabular-nums group-hover:hidden"
                            style={{ color: isCurrentTrack ? "var(--mq-accent)" : "var(--mq-text-muted)", opacity: isCurrentTrack ? 1 : 0.4 }}
                          >
                            {index + 1}
                          </span>
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handlePlayTrack(track)}
                            className="hidden group-hover:flex w-6 h-6 items-center justify-center cursor-pointer mx-auto"
                            style={{ color: "var(--mq-text)" }}
                          >
                            {isCurrentlyPlaying ? (
                              <Pause className="w-3.5 h-3.5" fill="currentColor" />
                            ) : (
                              <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />
                            )}
                          </motion.button>
                        </div>
                      )}

                      {/* Cover */}
                      <motion.div
                        whileHover={!batchMode ? { scale: 1.06 } : undefined}
                        className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0"
                        style={{ boxShadow: isCurrentTrack ? "0 2px 8px color-mix(in srgb, var(--mq-accent) 20%, transparent)" : "0 1px 4px rgba(0,0,0,0.2)" }}
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
                            style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
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
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
                            <span
                              className="cursor-pointer hover:underline"
                              onClick={(e) => {
                                if (batchMode) return;
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
                              className="text-[11px] font-medium px-1.5 py-0 rounded-md flex-shrink-0"
                              style={{
                                backgroundColor: "rgba(255,255,255,0.06)",
                                color: "var(--mq-text-muted)",
                              }}
                            >
                              {track.genre}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Duration */}
                      {track.duration > 0 && (
                        <span className="text-[11px] flex-shrink-0 hidden sm:block tabular-nums" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
                          {formatDuration(track.duration)}
                        </span>
                      )}

                      {/* More button (3-dot) — opens context menu */}
                      {!batchMode && (
                        <motion.button
                          whileHover={{ scale: 1.12 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => handleMoreClick(track, e)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer transition-all sm:opacity-0 sm:group-hover:opacity-100"
                          style={{ color: "var(--mq-text-muted)", backgroundColor: "transparent" }}
                          title="Меню"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </motion.button>
                      )}

                      {/* Remove button (hidden in batch mode) */}
                      {!batchMode && (
                        <motion.button
                          whileHover={{ scale: 1.12 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => { e.stopPropagation(); handleRemoveTrack(track.id, track); }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer transition-all sm:opacity-0 sm:group-hover:opacity-100"
                          style={{
                            color: activeTab === "liked" ? "#ef4444" : "#f97316",
                            backgroundColor: "transparent",
                          }}
                          title={activeTab === "liked" ? "Убрать из избранного" : "Убрать из списка"}
                        >
                          {activeTab === "liked" ? (
                            <motion.div
                              whileTap={{ scale: 0.5, rotate: 90 }}
                              transition={{ type: "spring", stiffness: 400 }}
                            >
                              <Heart className="w-3.5 h-3.5" style={{ fill: "#ef4444" }} />
                            </motion.div>
                          ) : (
                            <ThumbsDown className="w-3.5 h-3.5" />
                          )}
                        </motion.button>
                      )}

                      {/* Subtle divider between tracks */}
                      {index < tracks.length - 1 && (
                        <div className="absolute bottom-0 left-14 right-4" style={{ height: 1, backgroundColor: "rgba(255,255,255,0.04)" }} />
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Progressive render sentinel (M4) — IntersectionObserver loads
                  more tracks when this enters viewport. */}
              {visibleCount < tracks.length && (
                <>
                  <div
                    ref={sentinelRef}
                    aria-hidden="true"
                    style={{ height: 1, width: "100%", pointerEvents: "none" }}
                  />
                  <div
                    style={{
                      textAlign: "center",
                      padding: "12px",
                      color: "var(--mq-text-muted, #888)",
                      fontSize: 12,
                    }}
                    aria-live="polite"
                  >
                    Загружено {visibleCount} из {tracks.length}…
                  </div>
                </>
              )}

              {/* Bottom summary bar */}
              {activeTab === "liked" && totalDuration > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderTop: "1px solid var(--mq-border-hairline)" }}
                >
                  <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                    {tracks.length} {tracks.length === 1 ? "трек" : tracks.length < 5 ? "трека" : "треков"}
                  </span>
                  <span className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--mq-text-muted)" }}>
                    <Timer className="w-3 h-3" />
                    {formatTotalDuration(totalDuration)}
                  </span>
                </motion.div>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* ── Disliked tab description ── */}
      {activeTab === "disliked" && dislikedTracksData.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3 flex items-center gap-2 px-1"
        >
          <ThumbsDown className="w-3.5 h-3.5" style={{ color: "#f97316", opacity: 0.5 }} />
          <p className="text-[11px]" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
            Эти треки исключены из рекомендаций и радиостанций
          </p>
        </motion.div>
      )}

      {/* Context menu */}
      {contextMenu.show && contextMenu.track && (
        <ContextMenu
          track={contextMenu.track}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}
