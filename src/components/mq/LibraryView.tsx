"use client";

import React, { useState, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { Heart, ListMusic, Clock } from "lucide-react";

// Lazy-load sub-views to avoid double-mounting and reduce initial bundle
const FavoritesView = lazy(() => import("./FavoritesView"));
const PlaylistView = lazy(() => import("./PlaylistView"));
const HistoryView = lazy(() => import("./HistoryView"));

type LibraryTab = "favorites" | "playlists" | "history";

const tabs: { id: LibraryTab; label: string; icon: React.ElementType }[] = [
  { id: "favorites", label: "Избранное", icon: Heart },
  { id: "playlists", label: "Плейлисты", icon: ListMusic },
  { id: "history", label: "История", icon: Clock },
];

const LibraryView = React.memo(function LibraryView() {
  const [activeTab, setActiveTab] = useState<LibraryTab>("favorites");
  const compactMode = useAppStore((s) => s.compactMode);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);

  return (
    <div className={`${compactMode ? "p-3 lg:p-4" : "p-4 lg:p-6"} max-w-[var(--mq-container-narrow)] mx-auto`}>
      {/* Header */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        className="mb-4"
      >
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--mq-text)", letterSpacing: "-0.02em" }}>
          Библиотека
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>
          Ваша музыка в одном месте
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
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
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
                {/* Underline indicator */}
                {isActive && (
                  <motion.div
                    layoutId="libraryTabIndicator"
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                    style={{
                      backgroundColor: "var(--mq-accent)",
                      boxShadow: "0 0 8px var(--mq-glow)",
                    }}
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>
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
