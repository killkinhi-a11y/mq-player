"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { themes, applyThemeToDOM } from "@/lib/themes";
import AuthView from "@/components/mq/AuthView";
import MainView from "@/components/mq/MainView";
import SearchView from "@/components/mq/SearchView";
import MessengerView from "@/components/mq/MessengerView";
import SettingsView from "@/components/mq/SettingsView";
import ProfileView from "@/components/mq/ProfileView";
import PlaylistView from "@/components/mq/PlaylistView";
import PublicPlaylistsView from "@/components/mq/PublicPlaylistsView";
import HistoryView from "@/components/mq/HistoryView";
import StoriesView from "@/components/mq/StoriesView";
import PlayerBar from "@/components/mq/PlayerBar";
import FullTrackView from "@/components/mq/FullTrackView";
import PiPPlayer from "@/components/mq/PiPPlayer";
import NavBar from "@/components/mq/NavBar";
import MobileNav from "@/components/mq/MobileNav";

const viewVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const {
    currentView, currentTheme, customAccent, fontSize, animationsEnabled,
    isAuthenticated, setView, searchQuery, setSearchQuery,
  } = useAppStore();

  // Wait for client-side hydration before rendering app UI
  // This prevents hydration mismatch from Zustand localStorage persist
  useEffect(() => {
    setMounted(true);
    // Remove splash screen now that app is mounted
    if (typeof window !== "undefined" && window.__mqRemoveSplash) {
      window.__mqRemoveSplash();
    }
  }, []);

  // Safety net: force-mount after 3s even if useEffect didn't fire
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 3000);
    return () => clearTimeout(t);
  }, []);

  // Fix: if authenticated but stuck on auth view, redirect to main
  useEffect(() => {
    if (!mounted) return;
    if (isAuthenticated && currentView === "auth") {
      setView("main");
    }
  }, [mounted, isAuthenticated, currentView, setView]);

  // Apply theme to DOM
  useEffect(() => {
    if (!mounted) return;
    const theme = themes[currentTheme];
    if (!theme) {
      useAppStore.getState().setTheme("default");
      applyThemeToDOM(themes.default, customAccent || undefined);
    } else {
      applyThemeToDOM(theme, customAccent || undefined);
    }
  }, [mounted, currentTheme, customAccent]);

  // Apply font size
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.style.fontSize = `${fontSize}px`;
  }, [mounted, fontSize]);

  // Auto-clear search when leaving search view
  const prevViewRef = useRef(currentView);
  useEffect(() => {
    if (prevViewRef.current === "search" && currentView !== "search" && searchQuery) {
      setSearchQuery("");
    }
    prevViewRef.current = currentView;
  }, [currentView, searchQuery, setSearchQuery]);

  // Don't render interactive UI until hydrated
  if (!mounted) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-6"
        style={{ backgroundColor: "var(--mq-bg, #0e0e0e)" }}
      >
        {/* Splash animation */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: [0.5, 1.1, 1], opacity: [0, 1, 1] }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="flex flex-col items-center gap-3"
        >
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-2xl"
            style={{
              backgroundColor: "var(--mq-accent, #e03131)",
              boxShadow: "0 0 40px rgba(224,49,49,0.4)",
            }}
          >
            <span className="text-3xl font-black text-white">mq</span>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: [0, 0.5, 1], y: [10, 0, 0] }}
          transition={{ duration: 1, delay: 0.3 }}
        >
          <p className="text-sm" style={{ color: "var(--mq-text-muted, #888)" }}>Музыкальный плеер</p>
        </motion.div>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: "120px" }}
          transition={{ duration: 1.5, delay: 0.5, ease: "easeInOut" }}
          className="h-0.5 rounded-full"
          style={{ backgroundColor: "var(--mq-accent, #e03131)", opacity: 0.4 }}
        />
      </div>
    );
  }

  const renderView = () => {
    switch (currentView) {
      case "auth":
        return <AuthView />;
      case "main":
        return <MainView />;
      case "search":
        return <SearchView />;
      case "messenger":
        return <MessengerView />;
      case "settings":
        return <SettingsView />;
      case "profile":
        return <ProfileView />;
      case "playlists":
        return <PlaylistView />;
      case "public-playlists":
        return <PublicPlaylistsView />;
      case "history":
        return <HistoryView />;
      case "stories":
        return <StoriesView />;
      default:
        return <MainView />;
    }
  };

  const showNav = currentView !== "auth";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--mq-bg)" }}>
      {/* Desktop nav */}
      {showNav && <NavBar />}

      {/* Main content */}
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
            {renderView()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Player bar (not on auth view) */}
      {showNav && <PlayerBar />}

      {/* Full screen track view overlay */}
      <FullTrackView />

      {/* PiP Player */}
      <PiPPlayer />

      {/* Mobile nav */}
      {showNav && <MobileNav />}
    </div>
  );
}
