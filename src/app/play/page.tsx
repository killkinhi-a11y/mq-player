"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import type { ViewType } from "@/store/useAppStore";
import { themes, applyThemeToDOM } from "@/lib/themes";
import { useGlobalNotifications } from "@/hooks/useGlobalNotifications";
import { useListenSessionSync } from "@/hooks/useListenSessionSync";

declare global {
  interface Window {
    __mqRemoveSplash?: () => void;
  }
}

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
const OnboardingView = lazy(() => import("@/components/mq/OnboardingView"));
const PlayerBar = lazy(() => import("@/components/mq/PlayerBar"));
const FullTrackView = lazy(() => import("@/components/mq/FullTrackView"));
const PiPPlayer = lazy(() => import("@/components/mq/PiPPlayer"));
const NavBar = lazy(() => import("@/components/mq/NavBar"));
const MobileNav = lazy(() => import("@/components/mq/MobileNav"));
const NotificationPanel = lazy(() => import("@/components/mq/NotificationPanel"));
const SeasonalEffects = lazy(() => import("@/components/mq/SeasonalEffects"));
const MaintenanceBanner = lazy(() => import("@/components/mq/MaintenanceBanner"));

function useIsClient() {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => { setIsClient(true); }, []);
  return isClient;
}

function AppShell() {
  const {
    currentView, currentTheme, customAccent, fontSize, animationsEnabled,
    isAuthenticated, setView, searchQuery, setSearchQuery, setTheme,
    notifPanelOpen, setNotifPanelOpen, notificationCount,
  } = useAppStore();

  // ── Seasonal theme auto-detection from admin flags ──
  const [seasonalTheme, setSeasonalTheme] = useState<string | null>(null);

  // ── All refs declared before effects ──
  const prevViewRef = useRef(currentView);

  // ── DB sync: ensure all tables exist on first load ──
  useEffect(() => {
    fetch("/api/db-sync").then(r => r.json()).then(data => {
      if (data.ok) console.log("[db-sync] Database synced");
      else console.warn("[db-sync] Sync issue:", data.details);
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
    if (isAuthenticated && currentView === "auth") setView("main");
  }, [isAuthenticated, currentView, setView]);

  // ── Browser back/forward button support ──
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const view = e.state?.view as ViewType | undefined;
      if (view) {
        useAppStore.setState({ currentView: view });
      } else {
        // Fallback: if no state (e.g. initial page load), go to main
        useAppStore.setState({ currentView: "main" });
      }
    };
    window.addEventListener("popstate", handlePopState);
    // Set initial history state so back button works from the first navigation
    if (!window.history.state?.view) {
      window.history.replaceState({ view: currentView }, "", currentView === "main" ? "/play" : `/play?v=${currentView}`);
    }
    return () => window.removeEventListener("popstate", handlePopState);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Global notifications: polling-based, works on ALL tabs ──
  useGlobalNotifications();
  useListenSessionSync();

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
      case "onboarding": return <OnboardingView />;
      default: return <MainView />;
    }
  };

  const showNav = currentView !== "auth" && currentView !== "onboarding";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--mq-bg)" }}>
      <Suspense fallback={null}><MaintenanceBanner /></Suspense>
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
      <Suspense fallback={null}>{isAuthenticated && <NotificationPanel isOpen={notifPanelOpen} onClose={() => setNotifPanelOpen(false)} />}</Suspense>
      <Suspense fallback={null}>{
        seasonalTheme && isAuthenticated ? (
          <SeasonalEffects theme={seasonalTheme as any} />
        ) : null
      }</Suspense>
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
