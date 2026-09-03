"use client";

import React, { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { Heart, ListMusic, Clock, Search, X, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";

// Lazy-load sub-views to avoid double-mounting and reduce initial bundle
const FavoritesView = lazy(() => import("./FavoritesView"));
const PlaylistView = lazy(() => import("./PlaylistView"));
const HistoryView = lazy(() => import("./HistoryView"));

type LibraryTab = "favorites" | "playlists" | "history";
type SortMode = "recent" | "title" | "artist";

const LibraryView = React.memo(function LibraryView() {
  const compactMode = useAppStore((s) => s.compactMode);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const currentView = useAppStore((s) => s.currentView);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const likedTracksData = useAppStore((s) => s.likedTracksData);
  const playlists = useAppStore((s) => s.playlists);
  const history = useAppStore((s) => s.history);
  const setLibrarySearchQuery = useAppStore((s) => s.setLibrarySearchQuery);
  const setLibrarySort = useAppStore((s) => s.setLibrarySort);
  const librarySearchQuery = useAppStore((s) => s.librarySearchQuery);
  const librarySort = useAppStore((s) => s.librarySort);

  // Map top-level views to library tabs.
  const targetTab: LibraryTab =
    currentView === "playlists" ? "playlists" :
    currentView === "history" ? "history" :
    "favorites";
  const [activeTab, setActiveTab] = useState<LibraryTab>(targetTab);

  useEffect(() => {
    setActiveTab(targetTab);
  }, [targetTab]);

  // Clear search when switching tabs
  useEffect(() => {
    setLibrarySearchQuery("");
  }, [activeTab, setLibrarySearchQuery]);

  // Tab config with live counts
  const tabs: { id: LibraryTab; label: string; icon: React.ElementType; count: number }[] = [
    { id: "favorites", label: "Избранное", icon: Heart, count: likedTrackIds.length },
    { id: "playlists", label: "Плейлисты", icon: ListMusic, count: playlists.length },
    { id: "history", label: "История", icon: Clock, count: history.length },
  ];

  return (
    <div className={`${compactMode ? "p-3 lg:p-4" : "p-4 lg:p-6"} max-w-[var(--mq-container-narrow)] mx-auto mq-anim-fade-in`}>
      {/* Header */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        className="mb-4"
      >
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--mq-text)", letterSpacing: "-0.02em", fontFamily: "var(--mq-font-serif)" }}>
          Библиотека
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>
          {likedTrackIds.length + playlists.length + history.length} элементов в коллекции
        </p>
      </motion.div>

      {/* Sub-tab switcher with underline indicator */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 10 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, duration: 0.3 }}
        className="relative mb-4"
      >
        <div
          className="flex gap-0 border-b"
          style={{ borderColor: "var(--mq-border-thin)" }}
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors relative cursor-pointer"
                style={{
                  color: isActive ? "var(--mq-accent)" : "var(--mq-text-muted)",
                  minHeight: 48,
                }}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {/* Live count badge */}
                {tab.count > 0 && (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: isActive
                        ? "color-mix(in srgb, var(--mq-accent) 18%, transparent)"
                        : "color-mix(in srgb, var(--mq-text-muted) 12%, transparent)",
                      color: isActive ? "var(--mq-accent)" : "var(--mq-text-muted)",
                    }}
                  >
                    {tab.count}
                  </span>
                )}
                {/* Underline indicator */}
                {isActive && (
                  <motion.div
                    layoutId="libraryTabIndicator"
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                    style={{
                      backgroundColor: "var(--mq-accent)",
                    }}
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Search + sort toolbar — functional filtering within library */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 8 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="flex items-center gap-2 mb-4"
      >
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
          <Input
            placeholder="Поиск в библиотеке..."
            value={librarySearchQuery}
            onChange={(e) => setLibrarySearchQuery(e.target.value)}
            className="pl-9 pr-9 min-h-[40px] text-sm"
            style={{
              backgroundColor: "var(--mq-card)",
              borderRadius: "12px",
              border: "1px solid var(--mq-border-thin)",
              color: "var(--mq-text)",
            }}
          />
          {librarySearchQuery && (
            <button
              onClick={() => setLibrarySearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ color: "var(--mq-text-muted)" }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {/* Sort dropdown */}
        <select
          value={librarySort}
          onChange={(e) => setLibrarySort(e.target.value as SortMode)}
          className="text-xs font-medium px-2.5 py-2 rounded-xl cursor-pointer outline-none flex-shrink-0"
          style={{
            backgroundColor: "var(--mq-card)",
            color: "var(--mq-text)",
            border: "1px solid var(--mq-border-thin)",
          }}
        >
          <option value="recent">Недавние</option>
          <option value="title">По названию</option>
          <option value="artist">По артисту</option>
        </select>
      </motion.div>

      {/* Tab content */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeTab}
          initial={animationsEnabled ? { opacity: 0, y: 8 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          exit={animationsEnabled ? { opacity: 0, y: -8 } : undefined}
          transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <Suspense fallback={<div className="flex items-center justify-center py-8"><div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "var(--mq-accent, #e03131)", borderTopColor: "transparent" }} /></div>}>
            {activeTab === "favorites" && <FavoritesView />}
            {activeTab === "playlists" && <PlaylistView />}
            {activeTab === "history" && <HistoryView />}
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

export default LibraryView;
