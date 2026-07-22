"use client";

import { Suspense, useEffect, useRef, useState, useMemo, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore, type ViewType } from "@/store/useAppStore";
import { themes, applyThemeToDOM } from "@/lib/themes";
import { useGlobalNotifications } from "@/hooks/useGlobalNotifications";
import { useListenSessionSync } from "@/hooks/useListenSessionSync";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useAndroidPermissions } from "@/hooks/use-android-permissions";
import { useIsMobile } from "@/hooks/use-mobile";
import dynamic from "next/dynamic";
import CobaltTurnstile from "@/components/mq/CobaltTurnstile";
import { OfflineBanner } from "@/components/mq/OfflineBanner";
import "@/styles/ipod-2001.css";
import "@/styles/japan.css";
import "@/styles/swag.css";
import "@/styles/neon.css";
import "@/styles/minimal.css";
import "@/styles/pixel-flower.css";
import "@/styles/streaming.css";
import "@/styles/design-tokens.css";

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
const StoriesView = dynamic(() => import("@/components/mq/StoriesView"), { ssr: false });
const OnboardingView = dynamic(() => import("@/components/mq/OnboardingView"), { ssr: false });
const SpatialAudioView = dynamic(() => import("@/components/mq/SpatialAudioView"), { ssr: false });
const FriendsView = dynamic(() => import("@/components/mq/FriendsView"), { ssr: false });
const SleepTimerView = dynamic(() => import("@/components/mq/SleepTimerView"), { ssr: false });
const EqualizerView = dynamic(() => import("@/components/mq/EqualizerView"), { ssr: false });
const SplashScreen = dynamic(() => import("@/components/mq/SplashScreen"), { ssr: false });

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
const FullTrackViewMobile = dynamic(() => import("@/components/mq/FullTrackViewMobile"), { ssr: false });
const KeyboardShortcutsHelp = dynamic(() => import("@/components/mq/KeyboardShortcutsHelp").then(m => ({ default: m.KeyboardShortcutsHelp })), { ssr: false });
const NavBar = dynamic(() => import("@/components/mq/NavBar"), { ssr: false });
const MobileNav = dynamic(() => import("@/components/mq/MobileNav"), { ssr: false });
const ScrollProgressBar = dynamic(() => import("@/components/mq/ScrollProgressBar"), { ssr: false });
const CursorParticleField = dynamic(() => import("@/components/mq/CursorParticleField").then(m => ({ default: m.CursorParticleField })), { ssr: false });
const AnimatedGradientBg = dynamic(() => import("@/components/mq/AnimatedGradientBg").then(m => ({ default: m.AnimatedGradientBg })), { ssr: false });
const MobileDock = dynamic(() => import("@/components/mq/MobileDock"), { ssr: false });
const NotificationPanel = dynamic(() => import("@/components/mq/NotificationPanel"), { ssr: false });
const SeasonalEffects = dynamic(() => import("@/components/mq/SeasonalEffects"), { ssr: false });
const CinematicAtmosphere = dynamic(() => import("@/components/mq/CinematicAtmosphere"), { ssr: false });
const MaintenanceBanner = dynamic(() => import("@/components/mq/MaintenanceBanner"), { ssr: false });
const OnboardingTour = dynamic(() => import("@/components/mq/OnboardingTour"), { ssr: false });
const CommandPalette = dynamic(() => import("@/components/mq/CommandPalette"), { ssr: false });

// P2-#300/#310: Error boundary per view — catches React errors without crashing the whole app
import { ViewErrorBoundary } from "@/components/mq/ViewErrorBoundary";
import { ViewTransition } from "@/components/mq/ViewTransition";
import { useAudioEngine } from "@/components/mq/useAudioEngine";
import { useMediaSession } from "@/components/mq/useMediaSession";

// Views tracked by the visited-Set pattern — mounted once and kept alive
// with display:none so state is preserved when switching back.
// NOTE: "playlists" / "favorites" / "history" all render LibraryView, which
// internally syncs its activeTab based on currentView. This way MainView's
// quick cards (Плейлисты / Избранное / История) land on the right tab.
const VISITED_VIEW_COMPONENTS: { id: string; Component: React.ComponentType }[] = [
  { id: "main", Component: MainView },
  { id: "search", Component: SearchView },
  { id: "library", Component: LibraryView },
  { id: "playlists", Component: LibraryView },
  { id: "favorites", Component: LibraryView },
  { id: "history", Component: LibraryView },
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
  const isEqOpen = useAppStore((s) => s.isEqOpen);
  const setEqOpen = useAppStore((s) => s.setEqOpen);
  const catEnabled = useAppStore((s) => s.catEnabled);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const miniPlayerHidden = useAppStore((s) => s.miniPlayerHidden);
  const _hasHydrated = useAppStore((s) => s._hasHydrated);
  const isMobile = useIsMobile();

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
        console.debug("[MQ] Hydration timeout — forcing _hasHydrated = true");
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


  // P2: PWA install prompt — capture for Android install button
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: any) => {
      e.preventDefault();
      (window as any).deferredPrompt = e;
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    // P2-#300: defer setView to avoid React error #300 when auth state changes
    if (isAuthenticated && currentView === "auth") {
      setTimeout(() => setView("main"), 0);
    }
  }, [isAuthenticated, currentView, setView]);

  // ── Browser back button support (mobile hardware back) ──
  // Layered close behavior (highest priority first):
  //   1. Full track view open → close it
  //   2. Notification panel open → close it
  //   3. Context menu / sheet open → close it
  //   4. Non-main view → go to main
  //   5. Main view → default browser behavior (exit app on mobile)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = useAppStore.getState();

      // Layer 1: close full track view
      if (state.isFullTrackViewOpen) {
        useAppStore.setState({ isFullTrackViewOpen: false });
        // Push state back so next back also works
        window.history.pushState({ view: state.currentView }, "", window.location.pathname);
        return;
      }

      // Layer 2: close notification panel
      if (state.notifPanelOpen) {
        useAppStore.setState({ notifPanelOpen: false });
        window.history.pushState({ view: state.currentView }, "", window.location.pathname);
        return;
      }

      // Layer 3: close command palette if open
      if ((window as any).__mqCommandPaletteOpen) {
        (window as any).__mqCommandPaletteOpen = false;
        window.dispatchEvent(new CustomEvent("mq-close-command-palette"));
        window.history.pushState({ view: state.currentView }, "", window.location.pathname);
        return;
      }

      // Layer 4: navigate to view from history state
      const view = e.state?.view as ViewType | undefined;
      if (view && view !== state.currentView) {
        useAppStore.setState({ currentView: view });
      } else if (!view && state.currentView !== "main") {
        useAppStore.setState({ currentView: "main" });
      }
      // Layer 5: on main view, default behavior (exit app)
    };

    // Push history entries when UI layers open, so back button can pop them
    const handleStateChange = () => {
      const state = useAppStore.getState();
      if (state.isFullTrackViewOpen || state.notifPanelOpen) {
        // Don't push duplicate entries
        if (!window.history.state?._mqOverlay) {
          window.history.pushState({ _mqOverlay: true, view: state.currentView }, "", window.location.pathname);
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    if (!window.history.state?.view) {
      window.history.replaceState({ view: currentView }, "", currentView === "main" ? "/play" : `/play?v=${currentView}`);
    }
    return () => window.removeEventListener("popstate", handlePopState);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Capacitor native back button (APK) ──
  // In native APK, the hardware back button doesn't fire 'popstate' — it exits
  // the app by default. We intercept it via @capacitor/app to close overlays
  // and navigate back, matching the web popstate behavior.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return;

    let listener: any;
    let cancelled = false;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        if (cancelled) return;
        listener = await App.addListener("backButton", () => {
          const state = useAppStore.getState();

          // Layer 1: close full track view
          if (state.isFullTrackViewOpen) {
            state.setFullTrackViewOpen(false);
            return;
          }
          // Layer 2: close notification panel
          if (state.notifPanelOpen) {
            useAppStore.setState({ notifPanelOpen: false });
            return;
          }
          // Layer 3: close command palette
          if ((window as any).__mqCommandPaletteOpen) {
            (window as any).__mqCommandPaletteOpen = false;
            window.dispatchEvent(new CustomEvent("mq-close-command-palette"));
            return;
          }
          // Layer 4: navigate to main if not on main
          if (state.currentView !== "main") {
            state.setView("main");
            return;
          }
          // Layer 5: on main view — exit app
          App.exitApp();
        });
      } catch (e) {
        console.warn("[AppShell] Capacitor App plugin not available:", e);
      }
    })();

    return () => {
      cancelled = true;
      listener?.remove?.();
    };
  }, []);

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

  // P3-fix: useAudioEngine MUST be called here (was previously called inside
  // PlayerBar, but the rewritten PlayerBar no longer calls it). Without this,
  // the audio element is never created and tracks don't play.
  // Reuse existing subscriptions from above to avoid duplicate store listeners
  const _volume = useAppStore((s) => s.volume);
  const _playbackRate = useAppStore((s) => s.playbackRate);
  const _setProgress = useAppStore((s) => s.setProgress);
  const _setDuration = useAppStore((s) => s.setDuration);
  const _setPlaybackMode = useAppStore((s) => s.setPlaybackMode);
  const _togglePlay = useAppStore((s) => s.togglePlay);
  const _nextTrack = useAppStore((s) => s.nextTrack);
  const _prevTrack = useAppStore((s) => s.prevTrack);
  const _setMiniPlayerHidden = useAppStore((s) => s.setMiniPlayerHidden);
  useAudioEngine({
    currentTrack,
    isPlaying,
    volume: _volume,
    playbackRate: _playbackRate,
    setProgress: _setProgress,
    setDuration: _setDuration,
    setPlaybackMode: _setPlaybackMode,
    togglePlay: _togglePlay,
    nextTrack: _nextTrack,
    prevTrack: _prevTrack,
    miniPlayerHidden,
    setMiniPlayerHidden: _setMiniPlayerHidden,
  });

  // MediaSession API — required for lock screen / notification / Android Auto controls
  const _progress = useAppStore((s) => s.progress);
  const _duration = useAppStore((s) => s.duration);
  useMediaSession({
    currentTrack,
    isPlaying,
    progress: _progress,
    duration: _duration,
    playbackRate: _playbackRate,
  });

  useGlobalNotifications();
  useListenSessionSync();
  useKeyboardShortcuts();
  useAndroidPermissions();

  // ── Sleep timer countdown (global — works even when SleepTimerView not mounted) ──
  const _sleepTimerActive = useAppStore((s) => s.sleepTimerActive);
  const _updateSleepTimer = useAppStore((s) => s.updateSleepTimer);
  useEffect(() => {
    if (!_sleepTimerActive) return;
    const i = setInterval(() => _updateSleepTimer(), 1000);
    return () => clearInterval(i);
  }, [_sleepTimerActive, _updateSleepTimer]);

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
    return <SplashScreen showDelay={150} />;
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
      className={`min-h-[100dvh] ${showMiniPlayerSpacer ? 'mq-has-player' : ''}`}
      style={{
        backgroundColor: "var(--mq-bg)",
      }}
    >
      {/* web-accessibility rule: skip-to-content link for keyboard users.
          Visually hidden until focused, then jumps to #main-content. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[500] focus:px-4 focus:py-2 focus:rounded-full focus:text-sm focus:font-medium"
        style={{
          backgroundColor: "var(--mq-accent, #e03131)",
          color: "var(--mq-text-on-accent, #fff)",
        }}
      >
        Перейти к содержимому
      </a>
      <Suspense fallback={null}><CinematicAtmosphere /></Suspense>
      {/* Animated gradient background — subtle floating accent blobs */}
      {showNav && !hideUiForFullscreen && (
        <Suspense fallback={null}><AnimatedGradientBg /></Suspense>
      )}
      {/* Cursor particle trail — particles follow mouse on desktop */}
      {showNav && !hideUiForFullscreen && (
        <Suspense fallback={null}><CursorParticleField /></Suspense>
      )}
      <Suspense fallback={null}><MaintenanceBanner /></Suspense>
      <OfflineBanner />

      <Suspense fallback={
        <nav className="hidden lg:flex fixed top-0 left-0 right-0 z-50 items-center border-b"
          style={{ height: 56, backgroundColor: "var(--mq-surface, #161616)", borderColor: "var(--mq-border, #222)" }}>
          <div className="w-7 h-7 rounded-lg ml-4" style={{ backgroundColor: "var(--mq-accent, #e03131)" }} />
        </nav>
      }>
        {showNav && !hideUiForFullscreen && <NavBar />}
        {/* Scroll progress bar — thin accent line at top showing scroll position */}
        {showNav && !hideUiForFullscreen && (
          <Suspense fallback={null}>
            <div className="fixed top-0 left-0 right-0 z-[60] pointer-events-none" style={{ height: "2px" }}>
              <ScrollProgressBar />
            </div>
          </Suspense>
        )}
      </Suspense>

      <main id="main-content" className={showNav && !hideUiForFullscreen ? "lg:pt-16" : ""} data-view={currentView}>
        {/* ── Active view rendering ──
            P2-#300/#310/#185 FIX: Only render the ACTIVE view, not all visited views.
            Previous pattern mounted ALL visited views simultaneously (display:none),
            which caused #300 when one view's useEffect triggered a store update
            during another view's render commit phase.

            P3-revised: NO AnimatePresence around <Component /> here.
            AnimatePresence mode="wait" caused the view to fully unmount on
            switch (220ms exit + 220ms enter = 440ms gap), which re-triggered
            all useEffects in MessengerView (SSE reconnect, polling, heartbeat)
            on every re-entry — that cascade produced React #185
            (Maximum update depth exceeded) when switching fast.

            Instead: wrap <Component /> in a <ViewTransition> div that toggles
            a CSS class on currentView change. The class re-triggers a CSS
            keyframe animation (fade-in + slide-up) WITHOUT unmounting the
            Component — so useEffects in MessengerView stay alive. */}
        {showNav && (() => {
          const active = VISITED_VIEW_COMPONENTS.find(v => v.id === currentView);
          if (!active || !visitedViews.has(active.id)) return null;
          const Component = active.Component;
          // P2-#185: NO key on ViewErrorBoundary — key forces React to
          // recreate the boundary (and unmount its child) on every view
          // switch. That re-runs all of MessengerView's useEffects
          // (SSE, polling, heartbeat, BroadcastChannel) → cascade → #185.
          // Without key, the boundary persists across switches; only the
          // inner Component changes via React's reconciliation.
          return (
            <ViewErrorBoundary>
              <ViewTransition trigger={currentView} animationsEnabled={animationsEnabled}>
                <Component />
              </ViewTransition>
            </ViewErrorBoundary>
          );
        })()}

        {/* ── Auth view: shown when not authenticated ── */}
        {!showNav && currentView === "auth" && <AuthView />}

        {/* ── Onboarding: shown separately ── */}
        {!showNav && currentView === "onboarding" && <OnboardingView />}

        {/* ── Dynamic views: loaded lazily, with AnimatePresence ──
            These are rarely-visited views (stories, onboarding, spatial, etc.)
            that don't have heavy useEffects like MessengerView, so the
            mount/unmount cycle is safe here. AnimatePresence gives the
            cross-fade + slide for premium feel on these. */}
        {showNav && !isMountedView && !["auth", "onboarding"].includes(currentView) && (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentView}
              initial={animationsEnabled ? { opacity: 0, y: 12 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={animationsEnabled ? { opacity: 0, y: -8 } : { opacity: 1 }}
              transition={{
                duration: 0.2,
                ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
              }}
              style={{ willChange: "opacity, transform" }}
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

      {/* PlayerBar (desktop only — mobile uses MobileDock which combines player + nav) */}
      <Suspense fallback={null}><PlayerBar /></Suspense>
      <Suspense fallback={null}>{isMobile ? <FullTrackViewMobile /> : <FullTrackView />}</Suspense>
      <Suspense fallback={null}><EqualizerView show={isEqOpen} onClose={() => setEqOpen(false)} /></Suspense>
      <Suspense fallback={null}><KeyboardShortcutsHelp /></Suspense>
      <Suspense fallback={null}>{showNav && <CommandPalette />}</Suspense>
      <Suspense fallback={null}>{catEnabled && <MqCat />}</Suspense>
      {/* Cobalt Turnstile — invisible widget for SNIP bypass JWT */}
      <CobaltTurnstile />
      {/* Mobile: unified dock (player + nav in one glass container) */}
      <Suspense fallback={null}>{showNav && !hideUiForFullscreen && <MobileDock />}</Suspense>
      {/* Desktop: separate nav bar (PlayerBar already rendered above) */}
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
