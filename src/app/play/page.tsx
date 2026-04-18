"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";

// Static lazy imports — created ONCE at module level, not per-render
const AuthView = lazy(() => import("@/components/mq/AuthView"));
const MainView = lazy(() => import("@/components/mq/MainView"));
const SearchView = lazy(() => import("@/components/mq/SearchView"));
const MessengerView = lazy(() => import("@/components/mq/MessengerView"));
const SettingsView = lazy(() => import("@/components/mq/SettingsView"));
const ProfileView = lazy(() => import("@/components/mq/ProfileView"));
const PlaylistView = lazy(() => import("@/components/mq/PlaylistView"));
const PublicPlaylistsView = lazy(() => import("@/components/mq/PublicPlaylistsView"));
const HistoryView = lazy(() => import("@/components/mq/HistoryView"));
const StoriesView = lazy(() => import("@/components/mq/StoriesView"));
const PlayerBar = lazy(() => import("@/components/mq/PlayerBar"));
const FullTrackView = lazy(() => import("@/components/mq/FullTrackView"));
const PiPPlayer = lazy(() => import("@/components/mq/PiPPlayer"));
const NavBar = lazy(() => import("@/components/mq/NavBar"));
const MobileNav = lazy(() => import("@/components/mq/MobileNav"));

// Safe require — never throws, returns empty defaults if module unavailable
let _framer: any = { motion: "div", AnimatePresence: ({ children }: any) => children };
let _useAppStore: any = () => ({});
let _themes: any = {};
let _applyThemeToDOM: any = () => {};

try { const m = require("framer-motion"); _framer = m; } catch {}
try { const m = require("@/store/useAppStore"); _useAppStore = m.useAppStore; } catch {}
try { const m = require("@/lib/themes"); _themes = m.themes; _applyThemeToDOM = m.applyThemeToDOM; } catch {}

function useIsClient() {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => { setIsClient(true); }, []);
  return isClient;
}

function AppShell() {
  const { motion, AnimatePresence } = _framer;
  const useAppStore = _useAppStore;
  const themes = _themes;
  const applyThemeToDOM = _applyThemeToDOM;

  const {
    currentView, currentTheme, customAccent, fontSize, animationsEnabled,
    isAuthenticated, setView, searchQuery, setSearchQuery,
  } = useAppStore();

  useEffect(() => {
    if (typeof window !== "undefined" && window.__mqRemoveSplash) {
      window.__mqRemoveSplash();
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && currentView === "auth") setView("main");
  }, [isAuthenticated, currentView, setView]);

  useEffect(() => {
    const theme = themes[currentTheme];
    if (!theme) {
      useAppStore.getState().setTheme("default");
      applyThemeToDOM(themes.default, customAccent || undefined);
    } else {
      applyThemeToDOM(theme, customAccent || undefined);
    }
  }, [currentTheme, customAccent]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`;
  }, [fontSize]);

  // ── Auto-sync to server periodically + on tab close ──
  useEffect(() => {
    const store = useAppStore.getState();
    if (!store.isAuthenticated || !store.userId) return;

    // Sync every 60 seconds
    const interval = setInterval(() => {
      const s = useAppStore.getState();
      if (s.isAuthenticated && s.userId) {
        s.syncToServer();
      }
    }, 60_000);

    // Sync when tab becomes visible again
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        const s = useAppStore.getState();
        if (s.isAuthenticated && s.userId) {
          s.syncToServer();
        }
      }
    };

    // Sync before page unload
    const handleUnload = () => {
      const s = useAppStore.getState();
      if (s.isAuthenticated && s.userId) {
        // Use sendBeacon for reliability on page close
        const payload = {
          userId: s.userId,
          data: {
            history: s.history,
            playlists: s.playlists,
            likedTracks: s.likedTrackIds,
            dislikedTracks: s.dislikedTrackIds,
            likedTracksData: s.likedTracksData,
            settings: {
              volume: s.volume,
              compactMode: s.compactMode,
              fontSize: s.fontSize,
              animationsEnabled: s.animationsEnabled,
              liquidGlassEnabled: s.liquidGlassEnabled,
              liquidGlassMobile: s.liquidGlassMobile,
            },
          },
        };
        try {
          navigator.sendBeacon("/api/sync", new Blob([JSON.stringify(payload)], { type: "application/json" }));
        } catch {}
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [isAuthenticated]);

  const prevViewRef = useRef(currentView);
  useEffect(() => {
    if (prevViewRef.current === "search" && currentView !== "search" && searchQuery) {
      setSearchQuery("");
    }
    prevViewRef.current = currentView;
  }, [currentView, searchQuery, setSearchQuery]);

  const viewVariants = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  };

  const renderView = () => {
    switch (currentView) {
      case "auth": return <AuthView />;
      case "main": return <MainView />;
      case "search": return <SearchView />;
      case "messenger": return <MessengerView />;
      case "settings": return <SettingsView />;
      case "profile": return <ProfileView />;
      case "playlists": return <PlaylistView />;
      case "public-playlists": return <PublicPlaylistsView />;
      case "history": return <HistoryView />;
      case "stories": return <StoriesView />;
      default: return <MainView />;
    }
  };

  const showNav = currentView !== "auth";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--mq-bg)" }}>
      <Suspense fallback={
        <nav className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center px-4 border-b"
          style={{ backgroundColor: "var(--mq-surface, #161616)", borderColor: "var(--mq-border, #222)" }}>
          <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: "var(--mq-accent, #e03131)" }} />
        </nav>
      }>
        {showNav && <NavBar />}
      </Suspense>

      <main className={showNav ? "pt-16 lg:pt-14" : ""}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            variants={animationsEnabled ? viewVariants : undefined}
            initial={animationsEnabled ? "initial" : undefined}
            animate={animationsEnabled ? "animate" : undefined}
            exit={animationsEnabled ? "exit" : undefined}
            transition={{ duration: 0.2 }}
          >
            <Suspense fallback={
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 rounded-full animate-spin"
                  style={{ borderColor: "var(--mq-accent, #e03131)", borderTopColor: "transparent" }} />
              </div>
            }>
              {renderView()}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      <Suspense fallback={null}>{showNav && <PlayerBar />}</Suspense>
      <Suspense fallback={null}><FullTrackView /></Suspense>
      <Suspense fallback={null}><PiPPlayer /></Suspense>
      <Suspense fallback={null}>{showNav && <MobileNav />}</Suspense>
    </div>
  );
}

export default function PlayPage() {
  const isClient = useIsClient();

  if (!isClient) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-6"
        style={{ backgroundColor: "#0e0e0e" }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "#e03131", boxShadow: "0 0 40px rgba(224,49,49,0.4)" }}
          >
            <span className="text-3xl font-black text-white">mq</span>
          </div>
        </div>
        <p className="text-sm" style={{ color: "#888" }}>Музыкальный плеер</p>
        <div className="h-0.5 w-24 rounded-full" style={{ backgroundColor: "#e03131", opacity: 0.4 }} />
      </div>
    );
  }

  return <AppShell />;
}
