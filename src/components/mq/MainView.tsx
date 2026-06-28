"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, Music, Heart, Clock, ListMusic, MessageCircle,
  TrendingUp, ChevronLeft, ChevronRight, Shuffle, Plus,
  Flame, Sparkles, Waves, User, Loader2,
} from "lucide-react";
import { type Track, formatDuration } from "@/lib/musicApi";
import { extractTasteProfile, displayGenre, sanitizeGenre } from "@/lib/tasteProfile";
import { useIsMobile } from "@/hooks/use-mobile";
import { Skeleton } from "@/components/ui/skeleton";
import ScrollReveal from "./ScrollReveal";
import SectionHeader from "./SectionHeader";
import TrackCard from "./TrackCard";
import ArtistCard from "./ArtistCard";
import ArtistDetailView from "./ArtistDetailView";
import PlaylistArtwork from "./PlaylistArtwork";
import { toast } from "@/hooks/use-toast";

// ─── Curated playlist type ────────────────────────────────────────────────

interface CuratedPlaylist {
  id: string;
  name: string;
  subtitle: string;
  gradient: string;
  tracks: Track[];
}

// ─── Wave gradient ────────────────────────────────────────────────────────

function getWaveGradient(): string {
  return "linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 35%, var(--mq-bg)), color-mix(in srgb, var(--mq-accent) 18%, var(--mq-bg)))";
}

// ─── Hash helper for gradient covers ──────────────────────────────────────

const PLAYLIST_GRADIENTS: [string, string][] = [
  ["#2d1b3d", "#0e0e0e"],
  ["#1b2d3a", "#0e0e0e"],
  ["#3d2b1b", "#0e0e0e"],
  ["#1b3a2d", "#0e0e0e"],
  ["#3a1b2d", "#0e0e0e"],
  ["#2d2d1b", "#0e0e0e"],
];
function hashHue(name: string, idx: 0 | 1): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const pair = PLAYLIST_GRADIENTS[Math.abs(h) % PLAYLIST_GRADIENTS.length];
  return pair[idx];
}

function formatTotalDuration(tracks: Track[]): string {
  const totalSec = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  if (totalSec <= 0) return "";
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `~${h} ч ${m} мин`;
  return `~${m} мин`;
}

// ═════════════════════════════════════════════════════════════════════════
// MAIN VIEW
// ═════════════════════════════════════════════════════════════════════════

export default function MainView() {
  // ── Store ──
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const playTrack = useAppStore((s) => s.playTrack);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const likedTracksData = useAppStore((s) => s.likedTracksData);
  const dislikedTrackIds = useAppStore((s) => s.dislikedTrackIds);
  const dislikedTracksData = useAppStore((s) => s.dislikedTracksData);
  const history = useAppStore((s) => s.history);
  const playlists = useAppStore((s) => s.playlists);
  const setView = useAppStore((s) => s.setView);
  const userId = useAppStore((s) => s.userId);
  const compactMode = useAppStore((s) => s.compactMode);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const setSelectedArtist = useAppStore((s) => s.setSelectedArtist);
  const selectedArtist = useAppStore((s) => s.selectedArtist);
  const favoriteArtists = useAppStore((s) => s.favoriteArtists);
  const radioMode = useAppStore((s) => s.radioMode);
  const progress = useAppStore((s) => s.progress);
  const duration = useAppStore((s) => s.duration);
  const contacts = useAppStore((s) => s.contacts);
  const messages = useAppStore((s) => s.messages);

  // ── Local state ──
  const [trendingTracks, setTrendingTracks] = useState<Track[]>([]);
  const [curatedPlaylists, setCuratedPlaylists] = useState<CuratedPlaylist[]>([]);
  const [recommendationCategories, setRecommendationCategories] = useState<{ id: string; title: string; icon: string; tracks: Track[] }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recLoading, setRecLoading] = useState(false);
  const [waveLoading, setWaveLoading] = useState(false);
  const [trendingExpanded, setTrendingExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem("mq-trending-expanded") === "1"; } catch { return false; }
  });

  const isMobile = useIsMobile();

  // ── Taste profile ──
  const tasteProfile = useMemo(() => {
    const safeLiked = Array.isArray(likedTrackIds) ? likedTrackIds : [];
    const safeDisliked = Array.isArray(dislikedTrackIds) ? dislikedTrackIds : [];
    const safeHistory = Array.isArray(history) ? history : [];
    const safeLikedData = Array.isArray(likedTracksData) ? likedTracksData : [];
    return extractTasteProfile({
      history: safeHistory,
      likedTracksData: safeLikedData,
      dislikedTrackIds: safeDisliked,
    });
  }, [likedTrackIds, dislikedTrackIds, likedTracksData, history]);

  // ── Recent tracks (last 10 from history) ──
  const recentTracks = useMemo(() => {
    return history.slice(0, 10).map((h: any) => h.track).filter(Boolean);
  }, [history]);

  // ── Fetch trending + curated ──
  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      setIsLoading(true);
      try {
        const disliked = useAppStore.getState().dislikedTrackIds || [];
        const excludeSet = new Set(disliked);

        const trendingParams = new URLSearchParams();
        if (disliked.length > 0) trendingParams.set("dislikedIds", disliked.join(","));

        const curatedParams = new URLSearchParams();
        if (disliked.length > 0) curatedParams.set("dislikedIds", disliked.join(","));

        const [trendingRes, curatedRes] = await Promise.all([
          fetch(`/api/music/trending?${trendingParams}`),
          fetch(`/api/playlists/curated?${curatedParams}`),
        ]);

        if (!cancelled && trendingRes.ok) {
          const trendingData = await trendingRes.json();
          const filtered = (trendingData.tracks || []).filter((t: Track) => !excludeSet.has(t.id));
          setTrendingTracks(filtered);
        }
        if (!cancelled && curatedRes.ok) {
          const curatedData = await curatedRes.json();
          setCuratedPlaylists(curatedData.playlists || []);
        }
      } catch {
        if (!cancelled) { setTrendingTracks([]); setCuratedPlaylists([]); }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch recommendations (after initial load, non-blocking) ──
  useEffect(() => {
    let cancelled = false;
    const fetchRecs = async () => {
      setRecLoading(true);
      try {
        const disliked = useAppStore.getState().dislikedTrackIds || [];
        const params = new URLSearchParams();
        const likedScIds = useAppStore.getState().likedTracksData
          .map((t: any) => t.scTrackId).filter((id: any): id is number => !!id).slice(0, 5).join(",");
        if (likedScIds) params.set("likedScIds", likedScIds);
        const historyScIds = useAppStore.getState().history.slice(0, 10)
          .map((h: any) => h.track?.scTrackId).filter((id: any): id is number => !!id).join(",");
        if (historyScIds) params.set("historyScIds", historyScIds);
        if (disliked.length > 0) params.set("dislikedIds", disliked.join(","));
        if (tasteProfile.topGenres.length > 0) params.set("genres", tasteProfile.topGenres.join(","));
        const favArtistNames = (useAppStore.getState().favoriteArtists || []).map(a => a.username);
        const allArtists = [...new Set([...favArtistNames, ...tasteProfile.topArtists])];
        if (allArtists.length > 0) params.set("artists", allArtists.slice(0, 5).join(","));

        const res = await fetch(`/api/music/recommendations?${params}`);
        if (!cancelled && res.ok) {
          const data = await res.json();
          const categories = (data.categories || []).map((cat: any) => ({
            id: cat.id || `cat_${Date.now()}_${Math.random()}`,
            title: cat.title || "Рекомендации",
            icon: cat.icon || "Sparkles",
            tracks: (cat.tracks || []).filter((t: Track) => !disliked.includes(t.id)).slice(0, 10),
          })).filter((cat: any) => cat.tracks.length > 0);
          if (!cancelled) setRecommendationCategories(categories);
        }
      } catch {
        // Silent — recommendations are optional
      } finally {
        if (!cancelled) setRecLoading(false);
      }
    };
    // Defer to next tick so it doesn't block initial render
    const timer = setTimeout(fetchRecs, 100);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tasteProfile]);

  // ── Wave start ──
  const handleStartWave = useCallback(async () => {
    setWaveLoading(true);
    try {
      const disliked = useAppStore.getState().dislikedTrackIds || [];
      const favArtistNames = (useAppStore.getState().favoriteArtists || []).map(a => a.username);
      const allArtists = [...new Set([...favArtistNames, ...tasteProfile.topArtists])];

      const params = new URLSearchParams();
      if (tasteProfile.topGenres.length > 0) params.set("genres", tasteProfile.topGenres.join(","));
      if (allArtists.length > 0) params.set("artists", allArtists.slice(0, 5).join(","));
      if (disliked.length > 0) params.set("dislikedIds", disliked.join(","));
      params.set("wave", "1");

      const likedScIds = useAppStore.getState().likedTracksData
        .map((t: any) => t.scTrackId).filter((id: any): id is number => !!id).slice(0, 5).join(",");
      if (likedScIds) params.set("likedScIds", likedScIds);

      const historyScIds = useAppStore.getState().history.slice(0, 10)
        .map((h: any) => h.track?.scTrackId).filter((id: any): id is number => !!id).join(",");
      if (historyScIds) params.set("historyScIds", historyScIds);

      const res = await fetch(`/api/music/recommendations?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      let tracks: Track[] = (data.tracks || []).filter((t: Track) => !disliked.includes(t.id));

      if (tracks.length > 0) {
        for (let i = tracks.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
        }
        const state = useAppStore.getState();
        if (!state.radioMode) state.toggleRadioMode();
        playTrack(tracks[0], tracks);
      }
    } catch {
      // Silent
    } finally {
      setWaveLoading(false);
    }
  }, [tasteProfile, playTrack]);

  // ── Play all trending ──
  const handlePlayAllTrending = useCallback(() => {
    if (trendingTracks.length > 0) playTrack(trendingTracks[0], trendingTracks);
  }, [trendingTracks, playTrack]);

  // ── Navigate to artist ──
  const handleNavigateToArtist = useCallback((artist: string) => {
    if (!artist) return;
    setSelectedArtist({ name: artist });
  }, [setSelectedArtist]);

  // ── Artist detail view ──
  if (selectedArtist) {
    return (
      <ArtistDetailView
        artist={selectedArtist}
        onBack={() => setSelectedArtist(null)}
        compactMode={compactMode}
        animationsEnabled={animationsEnabled}
      />
    );
  }

  return (
    <div className={`${compactMode ? "p-3 lg:p-4" : "p-4 lg:p-6"} max-w-[var(--mq-container-narrow)] mx-auto pb-32 lg:pb-28`}>
      {/* ── Hero greeting ── */}
      <ScrollReveal direction="up" delay={0}>
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mb-5 sm:mb-6"
        >
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight" style={{ color: "var(--mq-text)", letterSpacing: "-0.02em" }}>
            {greeting()}
          </h1>
          <p className="text-xs sm:text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>
            Что слушаем сегодня?
          </p>
        </motion.div>
      </ScrollReveal>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* ── ВОЛНА (Wave) — preserved as-is per user request ── */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.03}>
        <div
          className={isMobile ? "relative mb-8 rounded-[28px] overflow-hidden" : "mq-hero-card relative mb-8"}
          style={{
            background: isMobile
              ? (currentTrack?.cover
                ? `linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 20%, var(--mq-bg)), color-mix(in srgb, var(--mq-accent) 8%, var(--mq-bg)))`
                : getWaveGradient())
              : getWaveGradient(),
            minHeight: isMobile ? 140 : 160,
            boxShadow: "var(--mq-shadow-float)",
          }}
        >
          {/* Blurred album art background (mobile only) */}
          {isMobile && currentTrack?.cover && (
            <div className="absolute inset-0 pointer-events-none">
              <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" style={{ filter: "blur(60px) saturate(180%)", opacity: 0.3, transform: "scale(1.3)" }} />
              <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--mq-bg) 70%, transparent), color-mix(in srgb, var(--mq-bg) 50%, transparent))" }} />
            </div>
          )}

          {/* Glass overlay (mobile only) */}
          {isMobile && (
            <div className="absolute inset-0 pointer-events-none" style={{ background: "color-mix(in srgb, var(--mq-bg) 40%, transparent)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }} />
          )}

          {/* Pulsing glow animation */}
          <motion.div
            className="absolute inset-0 rounded-[inherit] pointer-events-none"
            style={{ boxShadow: `0 0 ${isMobile ? 80 : 60}px color-mix(in srgb, var(--mq-accent) ${isMobile ? 15 : 18}%, transparent)` }}
            animate={{ opacity: isMobile ? [0.3, 0.6, 0.3] : [0.4, 0.8, 0.4] }}
            transition={{ duration: isMobile ? 5 : 4, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Subtle noise texture overlay */}
          <div className="absolute inset-0 pointer-events-none" style={{ opacity: isMobile ? 0.04 : 0.08, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", backgroundRepeat: "repeat", backgroundSize: "128px 128px" }} />

          {/* Animated wave background when playing */}
          {radioMode && currentTrack && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ opacity: isMobile ? 0.06 : 0.08 }}>
              <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1200 80" preserveAspectRatio="none" style={{ height: 55 }}>
                <motion.path
                  d="M0,40 C150,15 300,65 450,40 C600,15 750,65 900,40 C1050,15 1200,65 1200,40 L1200,80 L0,80 Z"
                  fill="white"
                  animate={{ d: [
                    "M0,40 C150,15 300,65 450,40 C600,15 750,65 900,40 C1050,15 1200,65 1200,40 L1200,80 L0,80 Z",
                    "M0,50 C150,65 300,20 450,45 C600,65 750,20 900,50 C1050,65 1200,20 1200,45 L1200,80 L0,80 Z",
                    "M0,40 C150,15 300,65 450,40 C600,15 750,65 900,40 C1050,15 1200,65 1200,40 L1200,80 L0,80 Z",
                  ] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                />
              </svg>
            </div>
          )}

          <div className={`relative z-10 ${isMobile ? "p-4 sm:p-5 flex items-center gap-4 sm:gap-5" : "p-5 sm:p-6 flex items-center gap-5"}`} style={{ minHeight: isMobile ? 140 : 160 }}>
            {radioMode && currentTrack ? (
              isMobile ? (
                /* ── Mobile Active Wave: Premium Glass ── */
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden flex-shrink-0 relative" style={{ boxShadow: "var(--mq-shadow-elevated)" }}>
                    {currentTrack.cover ? <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" /> : (
                      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}><Music className="w-6 h-6" style={{ color: "rgba(255,255,255,0.8)" }} /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Waves className="w-3 h-3" style={{ color: "rgba(255,255,255,0.7)" }} />
                      <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.6)" }}>Волна · Играет</span>
                    </div>
                    <p className="text-base sm:text-lg font-bold truncate" style={{ color: "#fff", letterSpacing: "-0.02em" }}>{currentTrack.title}</p>
                    <p className="text-[13px] truncate" style={{ color: "rgba(255,255,255,0.55)" }}>{currentTrack.artist}</p>
                    {isPlaying && duration > 0 && (
                      <div className="mt-2.5 h-[2px] rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.1)", maxWidth: 180 }}>
                        <motion.div className="h-full rounded-full" style={{ width: "100%", transformOrigin: "left", willChange: "transform", background: "linear-gradient(90deg, rgba(255,255,255,0.5), rgba(255,255,255,0.9))" }}
                          initial={{ scaleX: 0 }} animate={{ scaleX: Math.min(progress / duration, 1) }} transition={{ duration: 0.3, ease: "linear" }} />
                      </div>
                    )}
                  </div>
                  <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.06 }}
                    onClick={() => useAppStore.getState().toggleRadioMode()}
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(16px) saturate(180%)", WebkitBackdropFilter: "blur(16px) saturate(180%)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)", boxShadow: "var(--mq-shadow-card)" }}>
                    <Pause className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" />
                  </motion.button>
                </div>
              ) : (
                /* ── Desktop Active Wave: Classic ── */
                <div className="flex items-center gap-5 flex-1 min-w-0">
                  <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 mq-cover-shadow">
                    {currentTrack.cover ? <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" /> : (
                      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}><Music className="w-7 h-7" style={{ color: "#fff" }} /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Waves className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.9)" }} />
                      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.85)" }}>Волна · Играет</span>
                    </div>
                    <p className="text-lg font-bold truncate" style={{ color: "#fff" }}>{currentTrack.title}</p>
                    <p className="text-sm truncate" style={{ color: "rgba(255,255,255,0.7)" }}>{currentTrack.artist}</p>
                    {isPlaying && duration > 0 && (
                      <div className="mt-2.5 h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.15)", maxWidth: 200 }}>
                        <motion.div className="h-full rounded-full" style={{ width: "100%", transformOrigin: "left", willChange: "transform", backgroundColor: "rgba(255,255,255,0.8)" }}
                          initial={{ scaleX: 0 }} animate={{ scaleX: Math.min(progress / duration, 1) }} transition={{ duration: 0.3, ease: "linear" }} />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-end gap-[2px] h-5">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <motion.div key={i} className="w-[2.5px] rounded-full"
                          style={{ height: "100%", transformOrigin: "bottom", willChange: "transform", backgroundColor: "rgba(255,255,255,0.7)" }}
                          animate={isPlaying ? { height: [3, 5 + (i % 3) * 2, 3] } : { height: 3 }}
                          transition={isPlaying ? { duration: 0.5 + i * 0.08, repeat: Infinity, ease: "easeInOut", delay: i * 0.06 } : { duration: 0.2 }} />
                      ))}
                    </div>
                    <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.08 }}
                      onClick={() => useAppStore.getState().toggleRadioMode()}
                      className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(255,255,255,0.95)", color: "#1a1a2e", boxShadow: "var(--mq-shadow-card-hover)" }}>
                      <Pause className="w-6 h-6" fill="currentColor" />
                    </motion.button>
                  </div>
                </div>
              )
            ) : (
              isMobile ? (
                /* ── Mobile Inactive Wave ── */
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Waves className="w-5 h-5" style={{ color: "rgba(255,255,255,0.8)" }} />
                      <h3 className="text-lg sm:text-xl font-bold" style={{ color: "#fff", letterSpacing: "-0.02em" }}>Волна</h3>
                    </div>
                    <p className="text-[13px] sm:text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>Бесконечный поток музыки для вас</p>
                    {tasteProfile.topGenres.length > 0 && (
                      <div className="flex gap-1.5 mt-2 overflow-hidden">
                        {tasteProfile.topGenres.slice(0, 3).map((genre) => (
                          <span key={genre} className="text-[11px] px-2.5 py-0.5 rounded-full whitespace-nowrap font-medium"
                            style={{ backgroundColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.1)" }}>
                            {displayGenre(genre)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.06 }}
                    onClick={handleStartWave} disabled={waveLoading}
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.9)", color: "var(--mq-bg)", boxShadow: "var(--mq-shadow-accent)" }}>
                    {waveLoading ? (
                      <motion.div className="w-5 h-5 border-2 rounded-full" style={{ borderColor: "var(--mq-bg)", borderTopColor: "transparent" }} animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
                    ) : (
                      <Play className="w-5 h-5 sm:w-6 sm:h-6 ml-0.5" fill="currentColor" />
                    )}
                  </motion.button>
                </div>
              ) : (
                /* ── Desktop Inactive Wave ── */
                <div className="flex items-center gap-5 flex-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Waves className="w-6 h-6" style={{ color: "rgba(255,255,255,0.9)" }} />
                      <h3 className="text-xl font-bold" style={{ color: "#fff", letterSpacing: "-0.02em" }}>Волна</h3>
                    </div>
                    <p className="text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>Бесконечный поток музыки для вас</p>
                    {tasteProfile.topGenres.length > 0 && (
                      <div className="flex gap-1.5 mt-2 overflow-hidden">
                        {tasteProfile.topGenres.slice(0, 3).map((genre) => (
                          <span key={genre} className="text-[11px] px-2.5 py-0.5 rounded-full whitespace-nowrap font-medium"
                            style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)", border: "1px solid rgba(255,255,255,0.1)" }}>
                            {displayGenre(genre)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.08 }}
                    onClick={handleStartWave} disabled={waveLoading}
                    className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.95)", color: "#1a1a2e", boxShadow: "var(--mq-shadow-card-hover)" }}>
                    {waveLoading ? (
                      <motion.div className="w-6 h-6 border-2 rounded-full" style={{ borderColor: "#1a1a2e", borderTopColor: "transparent" }} animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
                    ) : (
                      <Play className="w-6 h-6 ml-0.5" fill="currentColor" />
                    )}
                  </motion.button>
                </div>
              )
            )}
          </div>
        </div>
      </ScrollReveal>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* ── Quick stats row ── */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.05}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-6 sm:mb-8">
          <QuickStat icon={Heart} label="Избранное" value={likedTrackIds.length} onClick={() => setView("favorites")} accent="#ef4444" />
          <QuickStat icon={Clock} label="История" value={history.length} onClick={() => setView("history")} accent="var(--mq-accent)" />
          <QuickStat icon={ListMusic} label="Плейлисты" value={playlists.length} onClick={() => setView("playlists")} accent="#8b5cf6" />
          <QuickStat icon={MessageCircle} label="Чаты" value={contacts.length} onClick={() => setView("messenger")} accent="#06b6d4" />
        </div>
      </ScrollReveal>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* ── User playlists ── */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.08}>
        <div className="mb-8">
          <SectionHeader
            title="Плейлисты"
            icon={ListMusic}
            action={
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setView("playlists")}
                className="text-xs px-3 py-1.5 rounded-full font-medium"
                style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)", color: "var(--mq-accent)" }}
              >
                Все
              </motion.button>
            }
          />
          {playlists.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {playlists.slice(0, 8).map((pl, i) => {
                const isCurrent = currentTrack && pl.tracks.some(t => t.id === currentTrack.id) && isPlaying;
                return (
                  <motion.button
                    key={pl.id}
                    initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.3 }}
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setTimeout(() => useAppStore.getState().setSelectedPlaylistId(pl.id), 0);
                      setView("playlists");
                    }}
                    className="group relative text-left cursor-pointer rounded-2xl overflow-hidden"
                    style={{
                      backgroundColor: "var(--mq-card)",
                      border: "1px solid rgba(255,255,255,0.05)",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
                    }}
                  >
                    <div
                      className="relative aspect-square overflow-hidden flex items-center justify-center"
                      style={pl.cover
                        ? { backgroundColor: "transparent" }
                        : { background: `linear-gradient(135deg, ${hashHue(pl.name, 0)}, ${hashHue(pl.name, 1)})` }
                      }
                    >
                      {pl.cover ? (
                        <img src={pl.cover} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                      ) : (
                        <div className="flex flex-col items-center justify-center w-full h-full">
                          <ListMusic className="w-8 h-8" style={{ color: "rgba(255,255,255,0.55)" }} />
                          <span className="text-[11px] font-medium mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{pl.tracks.length}</span>
                        </div>
                      )}
                      {pl.tracks.length > 0 && (
                        <div
                          className="absolute bottom-2 right-2 w-9 h-9 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-y-0 translate-y-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (pl.tracks.length > 0) {
                              setTimeout(() => playTrack(pl.tracks[0], [...pl.tracks], pl.id), 0);
                            }
                          }}
                          style={{
                            backgroundColor: "var(--mq-accent)",
                            color: "#fff",
                            boxShadow: "0 4px 16px color-mix(in srgb, var(--mq-accent) 40%, transparent)",
                          }}
                        >
                          <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-semibold truncate leading-tight" style={{ color: "var(--mq-text)" }} title={pl.name}>{pl.name}</p>
                      <p className="text-[11px] mt-1 truncate" style={{ color: "var(--mq-text-muted)" }}>{pl.tracks.length} треков</p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          ) : (
            <motion.button
              initial={animationsEnabled ? { opacity: 0, y: 8 } : undefined}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setView("playlists")}
              className="w-full rounded-2xl p-6 flex items-center gap-4 cursor-pointer"
              style={{ backgroundColor: "var(--mq-card)", border: "1px dashed rgba(255,255,255,0.1)" }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 15%, transparent)" }}>
                <Plus className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>Создайте первый плейлист</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>Организуйте любимую музыку в коллекции</p>
              </div>
            </motion.button>
          )}
        </div>
      </ScrollReveal>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* ── Recently played ── */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {recentTracks.length > 0 && (
        <ScrollReveal direction="up" delay={0.1}>
          <div className="mb-8">
            <SectionHeader
              title="Недавно"
              icon={Clock}
              action={
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setView("history")}
                  className="text-xs px-3 py-1.5 rounded-full font-medium"
                  style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)", color: "var(--mq-accent)" }}>
                  Все
                </motion.button>
              }
            />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {recentTracks.slice(0, 5).map((track, i) => {
                const isCurrentTrack = currentTrack?.id === track.id;
                return (
                  <motion.button
                    key={track.id + "_" + i}
                    initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.3 }}
                    whileHover={{ y: -3 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => playTrack(track, recentTracks)}
                    className="text-left cursor-pointer group"
                  >
                    <div className="relative aspect-square rounded-2xl overflow-hidden mb-2" style={{ boxShadow: isCurrentTrack ? "0 0 16px color-mix(in srgb, var(--mq-accent) 25%, transparent)" : "0 4px 16px rgba(0,0,0,0.2)" }}>
                      {track.cover ? (
                        <img src={track.cover} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)", opacity: 0.6 }}>
                          <Music className="w-8 h-8" style={{ color: "var(--mq-text)" }} />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100" style={{ backgroundColor: "var(--mq-accent)" }}>
                          <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
                        </div>
                      </div>
                    </div>
                    <p className="text-sm font-semibold truncate" style={{ color: isCurrentTrack ? "var(--mq-accent)" : "var(--mq-text)" }}>{track.title}</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleNavigateToArtist(track.artist); }}
                      className="text-xs truncate hover:underline block w-full text-left"
                      style={{ color: "var(--mq-text-muted)" }}
                    >
                      {track.artist}
                    </button>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </ScrollReveal>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* ── Trending (collapsible) ── */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.12}>
        <div className="mb-8">
          <motion.button
            whileTap={{ scale: 0.99 }}
            onClick={() => {
              const next = !trendingExpanded;
              setTrendingExpanded(next);
              try { localStorage.setItem("mq-trending-expanded", next ? "1" : "0"); } catch {}
            }}
            className="w-full flex items-center justify-between mb-3 cursor-pointer"
            aria-expanded={trendingExpanded}
          >
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
              <h2 className="text-base font-bold" style={{ color: "var(--mq-text)" }}>Популярное</h2>
              {trendingTracks.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)", color: "var(--mq-accent)" }}>
                  {trendingTracks.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {trendingTracks.length > 0 && trendingExpanded && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => { e.stopPropagation(); handlePlayAllTrending(); }}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full font-medium"
                  style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
                >
                  <Play className="w-3 h-3" fill="currentColor" />Все
                </motion.button>
              )}
              <motion.div
                animate={{ rotate: trendingExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
              >
                <ChevronLeft className="w-4 h-4 -rotate-90" style={{ color: "var(--mq-text-muted)" }} />
              </motion.div>
            </div>
          </motion.button>

          <AnimatePresence initial={false}>
            {trendingExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0, overflow: "hidden" }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                style={{ overflow: "hidden" }}
              >
                {isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--mq-card)" }}>
                        <Skeleton className="w-12 h-12 rounded-lg flex-shrink-0" />
                        <div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
                        <Skeleton className="h-4 w-16" />
                      </div>
                    ))}
                  </div>
                ) : trendingTracks.length > 0 ? (
                  <div className="space-y-1.5">
                    {trendingTracks.slice(0, 50).map((track, i) => (
                      <TrackCard key={track.id} track={track} index={i} queue={trendingTracks} onArtistClick={handleNavigateToArtist} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 rounded-2xl" style={{ backgroundColor: "var(--mq-card)" }}>
                    <Music className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
                    <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Не удалось загрузить</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ScrollReveal>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* ── Recommendations (categorized) ── */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {recommendationCategories.length > 0 && (
        <ScrollReveal direction="up" delay={0.13}>
          <div className="mb-8">
            <SectionHeader title="Для вас" icon={Sparkles} />
            <div className="space-y-6">
              {recommendationCategories.map((cat, catIdx) => (
                <div key={cat.id}>
                  <motion.div
                    initial={animationsEnabled ? { opacity: 0, x: -8 } : undefined}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * catIdx, duration: 0.25 }}
                    className="flex items-center gap-2 mb-3"
                  >
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}
                    >
                      <Sparkles className="w-3 h-3" style={{ color: "var(--mq-accent)" }} />
                    </div>
                    <h3 className="text-sm font-bold" style={{ color: "var(--mq-text)" }}>{cat.title}</h3>
                    <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>{cat.tracks.length}</span>
                  </motion.div>

                  {/* Horizontal scroll row on mobile, grid on desktop */}
                  {isMobile ? (
                    <div className="flex gap-3 overflow-x-auto scrollbar-none -mx-4 px-4 pb-2" style={{ scrollSnapType: "x proximity" }}>
                      {cat.tracks.map((track, i) => (
                        <RecommendationCard
                          key={track.id + "_" + i}
                          track={track}
                          isCurrent={currentTrack?.id === track.id}
                          onClick={() => playTrack(track, cat.tracks)}
                          onArtistClick={() => handleNavigateToArtist(track.artist)}
                          compactMode={compactMode}
                          animationsEnabled={animationsEnabled}
                          index={i}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
                      {cat.tracks.slice(0, 5).map((track, i) => (
                        <RecommendationCard
                          key={track.id + "_" + i}
                          track={track}
                          isCurrent={currentTrack?.id === track.id}
                          onClick={() => playTrack(track, cat.tracks)}
                          onArtistClick={() => handleNavigateToArtist(track.artist)}
                          compactMode={compactMode}
                          animationsEnabled={animationsEnabled}
                          index={i}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      )}

      {/* Loading skeleton for recommendations */}
      {recLoading && recommendationCategories.length === 0 && (
        <ScrollReveal direction="up" delay={0.13}>
          <div className="mb-8">
            <SectionHeader title="Для вас" icon={Sparkles} />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--mq-card)" }}>
                  <Skeleton className="w-12 h-12 rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* ── Favorite artists (if any) ── */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {favoriteArtists.length > 0 && (
        <ScrollReveal direction="up" delay={0.14}>
          <div className="mb-8">
            <SectionHeader title="Любимые артисты" icon={User} />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {favoriteArtists.slice(0, 8).map((artist, i) => (
                <motion.button
                  key={artist.id}
                  initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.3 }}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSelectedArtist({ name: artist.username, avatar: artist.avatar, followers: artist.followers, trackCount: artist.trackCount })}
                  className="text-left cursor-pointer group"
                >
                  <div className="relative aspect-square rounded-full overflow-hidden mb-2 mx-auto w-3/4" style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                    {artist.avatar ? (
                      <img src={artist.avatar} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}>
                        <User className="w-8 h-8" style={{ color: "#fff" }} />
                      </div>
                    )}
                  </div>
                  <p className="text-sm font-semibold truncate text-center" style={{ color: "var(--mq-text)" }}>{artist.username}</p>
                  {artist.trackCount && (
                    <p className="text-[11px] truncate text-center" style={{ color: "var(--mq-text-muted)" }}>{artist.trackCount} треков</p>
                  )}
                </motion.button>
              ))}
            </div>
          </div>
        </ScrollReveal>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* ── Curated playlists ── */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {curatedPlaylists.length > 0 && (
        <ScrollReveal direction="up" delay={0.16}>
          <div className="mb-8">
            <SectionHeader title="Подобрано для вас" icon={Sparkles} />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {curatedPlaylists.slice(0, 8).map((pl, i) => (
                <motion.button
                  key={pl.id}
                  initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.3 }}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    if (pl.tracks.length > 0) {
                      playTrack(pl.tracks[0], pl.tracks);
                    }
                  }}
                  className="text-left cursor-pointer group rounded-2xl overflow-hidden"
                  style={{ backgroundColor: "var(--mq-card)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <div className="relative aspect-square overflow-hidden">
                    <PlaylistArtwork playlistId={pl.id} size={200} rounded="rounded-none" className="!w-full !h-full group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      {pl.tracks.length > 0 && (
                        <div className="w-10 h-10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100" style={{ backgroundColor: "var(--mq-accent)" }}>
                          <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{pl.name}</p>
                    <p className="text-[11px] mt-1 truncate" style={{ color: "var(--mq-text-muted)" }}>{pl.subtitle}</p>
                    <p className="text-[10px] mt-1.5 uppercase tracking-wider" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>{pl.tracks.length} треков</p>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        </ScrollReveal>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// QuickStat component
// ═════════════════════════════════════════════════════════════════════════

function QuickStat({
  icon: Icon,
  label,
  value,
  onClick,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  onClick: () => void;
  accent: string;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      className="rounded-2xl p-3 flex items-center gap-2.5 cursor-pointer"
      style={{
        backgroundColor: "var(--mq-card)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)` }}
      >
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-base font-bold leading-none" style={{ color: "var(--mq-text)" }}>{value}</p>
        <p className="text-[11px] mt-1 truncate" style={{ color: "var(--mq-text-muted)" }}>{label}</p>
      </div>
    </motion.button>
  );
}

// ─── Greeting ─────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

// ─── Recommendation Card ──────────────────────────────────────────────────

function RecommendationCard({
  track,
  isCurrent,
  onClick,
  onArtistClick,
  compactMode,
  animationsEnabled,
  index,
}: {
  track: Track;
  isCurrent: boolean;
  onClick: () => void;
  onArtistClick: () => void;
  compactMode: boolean;
  animationsEnabled: boolean;
  index: number;
}) {
  return (
    <motion.button
      initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3), duration: 0.25 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="text-left cursor-pointer group flex-shrink-0"
      style={{
        width: compactMode ? 130 : 140,
      }}
    >
      <div
        className="relative aspect-square rounded-2xl overflow-hidden mb-2"
        style={{
          boxShadow: isCurrent
            ? "0 0 16px color-mix(in srgb, var(--mq-accent) 25%, transparent)"
            : "0 4px 16px rgba(0,0,0,0.2)",
        }}
      >
        {track.cover ? (
          <img
            src={track.cover}
            alt=""
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: "var(--mq-accent)", opacity: 0.6 }}
          >
            <Music className="w-7 h-7" style={{ color: "var(--mq-text)" }} />
          </div>
        )}
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100"
            style={{ backgroundColor: "var(--mq-accent)" }}
          >
            <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
          </div>
        </div>
        {/* Current track indicator */}
        {isCurrent && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}>
            ИГРАЕТ
          </div>
        )}
      </div>
      <p
        className="text-xs sm:text-sm font-semibold truncate"
        style={{ color: isCurrent ? "var(--mq-accent)" : "var(--mq-text)" }}
      >
        {track.title}
      </p>
      <button
        onClick={(e) => { e.stopPropagation(); onArtistClick(); }}
        className="text-[11px] truncate hover:underline block w-full text-left"
        style={{ color: "var(--mq-text-muted)" }}
      >
        {track.artist}
      </button>
    </motion.button>
  );
}

