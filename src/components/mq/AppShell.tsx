"use client";

import { Suspense, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore, type ViewType } from "@/store/useAppStore";
import { themes, applyThemeToDOM } from "@/lib/themes";
import { useGlobalNotifications } from "@/hooks/useGlobalNotifications";
import { useListenSessionSync } from "@/hooks/useListenSessionSync";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import dynamic from "next/dynamic";
import CobaltTurnstile from "@/components/mq/CobaltTurnstile";
import "@/styles/ipod-2001.css";
import "@/styles/japan.css";
import "@/styles/swag.css";
import "@/styles/neon.css";
import "@/styles/minimal.css";
import "@/styles/pixel-flower.css";
import "@/styles/streaming.css";
import "@/styles/design-tokens.css";

declare global {
  interface Window {
    __mqRemoveSplash?: () => void;
  }
}

// ── Eager imports for critical first-paint views only ──
// AuthView is the entry point for unauthenticated users — must be eager.
// MainView is the entry point for authenticated users — must be eager.
import AuthView from "@/components/mq/AuthView";
import MainView from "@/components/mq/MainView";
import LibraryView from "@/components/mq/LibraryView";

// ── Dynamic imports for secondary views (M4.1: lazy-load god components
// to shrink initial JS bundle). MessengerView (3554L) + SettingsView
// (2219L) + SearchView are big and only opened on tab switch. ──
const SearchView = dynamic(() => import("@/components/mq/SearchView"), {
  ssr: false,
  loading: () => <ViewSkeleton />,
});
const SettingsView = dynamic(() => import("@/components/mq/SettingsView"), {
  ssr: false,
  loading: () => <ViewSkeleton />,
});
const MessengerView = dynamic(() => import("@/components/mq/MessengerView"), {
  ssr: false,
  loading: () => <ViewSkeleton />,
});

// ── Dynamic imports for rarely-used views (still lazy) ──
const ProfileView = dynamic(() => import("@/components/mq/ProfileView"), { ssr: false });
const PublicPlaylistsView = dynamic(() => import("@/components/mq/PublicPlaylistsView"), { ssr: false });
const HistoryView = dynamic(() => import("@/components/mq/HistoryView"), { ssr: false });
const StoriesView = dynamic(() => import("@/components/mq/StoriesView"), { ssr: false });
const OnboardingView = dynamic(() => import("@/components/mq/OnboardingView"), { ssr: false });
const SpatialAudioView = dynamic(() => import("@/components/mq/SpatialAudioView"), { ssr: false });
const FriendsView = dynamic(() => import("@/components/mq/FriendsView"), { ssr: false });
const SleepTimerView = dynamic(() => import("@/components/mq/SleepTimerView"), { ssr: false });

// Inline skeleton shown while a lazy view chunk is loading.
function ViewSkeleton() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        color: "var(--mq-text-muted, #888)",
        fontFamily: "var(--font-outfit), system-ui, sans-serif",
        fontSize: 14,
        letterSpacing: 2,
      }}
      aria-busy="true"
      aria-live="polite"
    >
      <span>Загрузка…</span>
    </div>
  );
}

// ── Shell components (lazy, not switched often) ──
const MqCat = dynamic(() => import("@/components/mq/MqCat"), { ssr: false });
const PlayerBar = dynamic(() => import("@/components/mq/PlayerBar"), { ssr: false });
const FullTrackView = dynamic(() => import("@/components/mq/FullTrackView"), { ssr: false });
const KeyboardShortcutsHelp = dynamic(() => import("@/components/mq/KeyboardShortcutsHelp").then(m => ({ default: m.KeyboardShortcutsHelp })), { ssr: false });
const NavBar = dynamic(() => import("@/components/mq/NavBar"), { ssr: false });
const MobileNav = dynamic(() => import("@/components/mq/MobileNav"), { ssr: false });
const NotificationPanel = dynamic(() => import("@/components/mq/NotificationPanel"), { ssr: false });
const SeasonalEffects = dynamic(() => import("@/components/mq/SeasonalEffects"), { ssr: false });
const CinematicAtmosphere = dynamic(() => import("@/components/mq/CinematicAtmosphere"), { ssr: false });
const MaintenanceBanner = dynamic(() => import("@/components/mq/MaintenanceBanner"), { ssr: false });
const OnboardingTour = dynamic(() => import("@/components/mq/OnboardingTour"), { ssr: false });
const CommandPalette = dynamic(() => import("@/components/mq/CommandPalette"), { ssr: false });

// Views tracked by the visited-Set pattern — mounted once and kept alive
// with display:none so state is preserved when switching back.
const VISITED_VIEW_COMPONENTS: { id: string; Component: React.ComponentType }[] = [
  { id: "main", Component: MainView },
  { id: "search", Component: SearchView },
  { id: "library", Component: LibraryView },
  { id: "messenger", Component: MessengerView },
  { id: "settings", Component: SettingsView },
  { id: "profile", Component: ProfileView },
];
const VISITED_VIEW_IDS = new Set(VISITED_VIEW_COMPONENTS.map(v => v.id));

export default function AppShell() {
  // ── Optimized selectors: only subscribe to what this component needs ──
  const currentView = useAppStore((s) => s.currentView);
  const currentTheme = useAppStore((s) => s.currentTheme);
  const customAccent = useAppStore((s) => s.customAccent);
  const fontSize = useAppStore((s) => s.fontSize);
  const reduceMotion = useAppStore((s) => s.reduceMotion);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const setView = useAppStore((s) => s.setView);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const setTheme = useAppStore((s) => s.setTheme);
  const notifPanelOpen = useAppStore((s) => s.notifPanelOpen);
  const setNotifPanelOpen = useAppStore((s) => s.setNotifPanelOpen);
  const notificationCount = useAppStore((s) => s.notificationCount);
  const currentStyle = useAppStore((s) => s.currentStyle);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isFullTrackViewOpen = useAppStore((s) => s.isFullTrackViewOpen);
  const catEnabled = useAppStore((s) => s.catEnabled);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const miniPlayerHidden = useAppStore((s) => s.miniPlayerHidden);
  const demoLoading = useAppStore((s) => s.demoLoading);
  const _hasHydrated = useAppStore((s) => s._hasHydrated);

  // ── Visited views tracking: must be BEFORE any conditional returns (Rules of Hooks) ──
  const [visitedViews, setVisitedViews] = useState<Set<string>>(new Set(["main"]));
  useEffect(() => {
    setVisitedViews(prev => {
      if (prev.has(currentView)) return prev;
      const next = new Set(prev);
      next.add(currentView);
      return next;
    });
  }, [currentView]);

  // ── Hydration timeout safety net ──
  // If Zustand hydration doesn't complete within 5 seconds (e.g. due to
  // corrupt localStorage, TDZ error, or browser quota issue), force
  // _hasHydrated to true so the user isn't stuck on the loading icon.
  useEffect(() => {
    if (_hasHydrated) return;
    const timer = setTimeout(() => {
      const s = useAppStore.getState();
      if (!s._hasHydrated) {
        console.warn("[MQ] Hydration timeout — forcing _hasHydrated = true");
        useAppStore.setState({ _hasHydrated: true });
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [_hasHydrated]);

  // ── Seasonal theme auto-detection from admin flags ──
  const [seasonalTheme, setSeasonalTheme] = useState<string | null>(null);

  // ── All refs declared before effects ──
  const prevViewRef = useRef(currentView);

  // ── Apply style class to document ──
  useEffect(() => {
    const html = document.documentElement;
    html.removeAttribute('data-style');
    if (currentStyle) {
      html.setAttribute('data-style', currentStyle);
    }
  }, [currentStyle]);

  // ── DB sync: ensure all tables exist on first load ──
  useEffect(() => {
    fetch("/api/db-sync").then(r => r.json()).then(() => {
      // DB synced successfully
    }).catch(() => {});
  }, []);

  // ── All effects declared after refs ──
  useEffect(() => {
    let cancelled = false;
    const fetchSeasonal = async () => {
      try {
        const res = await fetch("/api/seasonal-theme");
        const data = await res.json();
        if (!cancelled && data.activeTheme) {
          const themeKey = data.activeTheme;
          if (themes[themeKey]) {
            setSeasonalTheme(themeKey);
            setTheme(themeKey);
          }
        }
      } catch {
        // Silent fail — seasonal themes are optional
      }
    };
    fetchSeasonal();
    const interval = setInterval(fetchSeasonal, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.__mqRemoveSplash) {
      window.__mqRemoveSplash();
    }
  }, []);

  useEffect(() => {
    // P2-#300: defer setView to avoid React error #300 when auth state changes
    if (isAuthenticated && currentView === "auth") {
      setTimeout(() => setView("main"), 0);
    }
  }, [isAuthenticated, currentView, setView]);

  // ── Browser back/forward button support ──
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const view = e.state?.view as ViewType | undefined;
      if (view) {
        useAppStore.setState({ currentView: view });
      } else {
        useAppStore.setState({ currentView: "main" });
      }
    };
    window.addEventListener("popstate", handlePopState);
    if (!window.history.state?.view) {
      window.history.replaceState({ view: currentView }, "", currentView === "main" ? "/play" : `/play?v=${currentView}`);
    }
    return () => window.removeEventListener("popstate", handlePopState);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentStyle) return;
    const theme = themes[currentTheme];
    if (!theme) {
      useAppStore.getState().setTheme("default");
      applyThemeToDOM(themes.default, customAccent || undefined);
    } else {
      applyThemeToDOM(theme, customAccent || undefined);
    }
  }, [currentTheme, customAccent, currentStyle]);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`;
  }, [fontSize]);

  // P5.2: Auto-detect prefers-reduced-motion and enable reduceMotion
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        // P2-#300: defer to avoid React error #300
        setTimeout(() => useAppStore.getState().setReduceMotion(true), 0);
      }
    };
    // On first mount: if system says reduce, enable it
    if (mq.matches) {
      setTimeout(() => useAppStore.getState().setReduceMotion(true), 0);
    }
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // P5.1: When reduceMotion is on, add a class to <html> so CSS can kill animations
  useEffect(() => {
    if (reduceMotion) {
      document.documentElement.classList.add("mq-reduce-motion");
    } else {
      document.documentElement.classList.remove("mq-reduce-motion");
    }
  }, [reduceMotion]);

  // ── Auto-sync to server periodically + on tab close ──
  useEffect(() => {
    const store = useAppStore.getState();
    if (!store.isAuthenticated || !store.userId) return;

    const interval = setInterval(() => {
      const s = useAppStore.getState();
      if (s.isAuthenticated && s.userId) {
        s.syncToServer();
      }
    }, 60_000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        const s = useAppStore.getState();
        if (s.isAuthenticated && s.userId) {
          s.syncToServer();
        }
      }
    };

    const handleUnload = () => {
      const s = useAppStore.getState();
      if (s.isAuthenticated && s.userId) {
        const payload = {
          userId: s.userId,
          data: {
            history: s.history,
            playlists: s.playlists,
            likedTracks: s.likedTrackIds,
            dislikedTracks: s.dislikedTrackIds,
            likedTracksData: s.likedTracksData,
            dislikedTracksData: s.dislikedTracksData,
            settings: {
              volume: s.volume,
              compactMode: s.compactMode,
              fontSize: s.fontSize,
              animationsEnabled: s.animationsEnabled,
              liquidGlassEnabled: s.liquidGlassEnabled,
              liquidGlassMobile: s.liquidGlassMobile,
              shuffle: s.shuffle,
              repeat: s.repeat,
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

  // NOTE: PlaybackEngine sync block was deleted in M3 — PlaybackEngine +
  // usePlaybackEngine were dead code (only useAudioEngine is active).
  // The previous useEffect called `syncWithPlaybackEngine()` which was
  // itself a no-op since 2025-Q2.

  useGlobalNotifications();
  useListenSessionSync();
  useKeyboardShortcuts();

  useEffect(() => {
    if (prevViewRef.current === "search" && currentView !== "search" && searchQuery) {
      setSearchQuery("");
    }
    prevViewRef.current = currentView;
  }, [currentView, searchQuery, setSearchQuery]);

  // ── Render dynamically-loaded views (rarely used) ──
  const renderDynamicView = () => {
    switch (currentView) {
      case "auth": return <AuthView />;
      case "public-playlists": return <PublicPlaylistsView />;
      case "history": return <HistoryView />;
      case "stories": return <StoriesView />;
      case "onboarding": return <OnboardingView />;
      case "spatial": return <SpatialAudioView currentTrack={currentTrack} />;
      case "friends": return <FriendsView />;
      case "sleepTimer": return <SleepTimerView />;
      default: return <MainView />;
    }
  };

  // Wait for Zustand hydration before rendering — prevents auth↔main flash
  if (!_hasHydrated) {
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
        <div className="h-0.5 w-24 rounded-full animate-pulse" style={{ backgroundColor: "#e03131", opacity: 0.4 }} />
      </div>
    );
  }

  const showNav = currentView !== "auth" && currentView !== "onboarding";
  const hideUiForFullscreen = isFullTrackViewOpen;

  // Mobile: player (~90px) sits above nav (~50px), total = 140px
  // Desktop: player (~64px) at very bottom, no mobile nav
  const miniPlayerHeight = miniPlayerHidden ? 0 : 90;
  const mobileNavHeight = 50;
  const showMiniPlayerSpacer = showNav && currentTrack && !isFullTrackViewOpen && !miniPlayerHidden;

  const isMountedView = VISITED_VIEW_IDS.has(currentView);

  return (
    <div
      className={`min-h-screen ${showMiniPlayerSpacer ? 'mq-has-player' : ''}`}
      style={{
        backgroundColor: "var(--mq-bg)",
      }}
    >
      <Suspense fallback={null}><CinematicAtmosphere /></Suspense>
      <Suspense fallback={null}><MaintenanceBanner /></Suspense>

      {/* ── Demo loading overlay: skeleton shown while demo data loads ── */}
      <AnimatePresence>
        {demoLoading && (
          <motion.div
            key="demo-loader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ backgroundColor: "var(--mq-bg, #0e0e0e)" }}
          >
            <div className="flex flex-col items-center gap-6 p-8">
              {/* Logo pulse */}
              <motion.div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: "var(--mq-accent, #e03131)" }}
                animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              >
                <span className="text-2xl font-black text-white">mq</span>
              </motion.div>
              {/* Skeleton cards */}
              <div className="w-full max-w-xs space-y-3">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="flex items-center gap-3 p-3 rounded-xl"
                    style={{ backgroundColor: "var(--mq-card, #1a1a1a)" }}
                    animate={{ opacity: [0.4, 0.7, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
                  >
                    <div className="w-10 h-10 rounded-lg" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)", width: `${70 - i * 10}%` }} />
                      <div className="h-2 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.04)", width: `${45 - i * 5}%` }} />
                    </div>
                  </motion.div>
                ))}
              </div>
              <p className="text-sm" style={{ color: "var(--mq-text-muted, #888)" }}>Загрузка демо-контента...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Suspense fallback={
        <nav className="hidden lg:flex fixed top-0 left-0 right-0 z-50 items-center border-b"
          style={{ height: 56, backgroundColor: "var(--mq-surface, #161616)", borderColor: "var(--mq-border, #222)" }}>
          <div className="w-7 h-7 rounded-lg ml-4" style={{ backgroundColor: "var(--mq-accent, #e03131)" }} />
        </nav>
      }>
        {showNav && !hideUiForFullscreen && <NavBar />}
      </Suspense>

      <main id="main-content" className={showNav && !hideUiForFullscreen ? "lg:pt-14" : ""}>
        {/* ── Visited-Set view rendering ──
            Views are mounted lazily on first visit and kept alive with display:none.
            This preserves component state (scroll position, form inputs, etc.) while
            avoiding mounting unvisited views that would subscribe to the store. */}
        {showNav && VISITED_VIEW_COMPONENTS.map(({ id, Component }) => {
          if (!visitedViews.has(id)) return null;
          const isActive = currentView === id;
          return (
            <div
              key={id}
              style={{ display: isActive ? "block" : "none" }}
              aria-hidden={!isActive}
            >
              <Component />
            </div>
          );
        })}

        {/* ── Auth view: shown when not authenticated ── */}
        {!showNav && currentView === "auth" && <AuthView />}

        {/* ── Onboarding: shown separately ── */}
        {!showNav && currentView === "onboarding" && <OnboardingView />}

        {/* ── Dynamic views: loaded lazily, with AnimatePresence ── */}
        {showNav && !isMountedView && !["auth", "onboarding"].includes(currentView) && (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentView}
              initial={animationsEnabled ? { opacity: 0, y: 6 } : undefined}
              animate={{ opacity: 1, y: 0 }}
              exit={animationsEnabled ? { opacity: 0 } : undefined}
              transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
            >
              <Suspense fallback={
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 rounded-full animate-spin"
                    style={{ borderColor: "var(--mq-accent, #e03131)", borderTopColor: "transparent" }} />
                </div>
              }>
                {renderDynamicView()}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {/* PlayerBar is ALWAYS mounted — never unmount to preserve playback engine */}
      <Suspense fallback={null}><PlayerBar /></Suspense>
      <Suspense fallback={null}><FullTrackView /></Suspense>
      <Suspense fallback={null}><KeyboardShortcutsHelp /></Suspense>
      <Suspense fallback={null}>{showNav && <CommandPalette />}</Suspense>
      <Suspense fallback={null}>{catEnabled && <MqCat />}</Suspense>
      {/* Cobalt Turnstile — invisible widget for SNIP bypass JWT */}
      <CobaltTurnstile />
      <Suspense fallback={null}>{showNav && !hideUiForFullscreen && <MobileNav />}</Suspense>
      <Suspense fallback={null}>{isAuthenticated && <NotificationPanel isOpen={notifPanelOpen} onClose={() => setNotifPanelOpen(false)} />}</Suspense>
      <Suspense fallback={null}>{
        seasonalTheme && isAuthenticated ? (
          <SeasonalEffects theme={seasonalTheme as any} />
        ) : null
      }</Suspense>
      <Suspense fallback={null}>{isAuthenticated && <OnboardingTour />}</Suspense>
    </div>
  );
}
