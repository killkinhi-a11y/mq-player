"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, Music, Heart, Clock, ListMusic, MessageCircle,
  Plus, Sparkles, Waves, User, Flame,
  SkipForward, ThumbsDown, TrendingUp, Compass, RotateCcw,
  MoreHorizontal, Share2, ListPlus, Mic2,
} from "lucide-react";
import { useWaveEngine } from "@/hooks/useWaveEngine";
import { useFriendsListening } from "@/hooks/useFriendsListening";
import { useRecUpdates } from "@/hooks/useRecUpdates";
import { type Track } from "@/lib/musicApi";
import { extractTasteProfile, displayGenre } from "@/lib/tasteProfile";
import { useIsMobile } from "@/hooks/use-mobile";
import ScrollReveal from "./ScrollReveal";
import ArtistDetailView from "./ArtistDetailView";
import PlaylistArtwork from "./PlaylistArtwork";
import ContextMenu from "./ContextMenu";
import { useLongPress } from "@/hooks/useLongPress";

// ─── Types ────────────────────────────────────────────────────────────────

interface CuratedPlaylist {
  id: string;
  name: string;
  subtitle: string;
  gradient: string;
  tracks: Track[];
}

interface RecCategory {
  id: string;
  title: string;
  icon: string;
  tracks: Track[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getWaveGradient(): string {
  return "linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 35%, var(--mq-bg)), color-mix(in srgb, var(--mq-accent) 18%, var(--mq-bg)))";
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "Доброй ночи";
  if (h < 12) return "Доброе утро";
  if (h < 18) return "Добрый день";
  return "Добрый вечер";
}

function currentDate(): string {
  return new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

// ═════════════════════════════════════════════════════════════════════════
// MAIN VIEW
// ═════════════════════════════════════════════════════════════════════════

function MainView() {
  // ── Store ──
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const playTrack = useAppStore((s) => s.playTrack);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const likedTracksData = useAppStore((s) => s.likedTracksData);
  const dislikedTrackIds = useAppStore((s) => s.dislikedTrackIds);
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
  const duration = useAppStore((s) => s.duration);
  const contacts = useAppStore((s) => s.contacts);

  // ── Local state ──
  const [curatedPlaylists, setCuratedPlaylists] = useState<CuratedPlaylist[]>([]);
  const [recCategories, setRecCategories] = useState<RecCategory[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  // Persist active tab in localStorage so it survives page reloads
  const [activeRecTab, setActiveRecTab] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    try { return window.localStorage.getItem("mq:recTab") || "all"; } catch { return "all"; }
  });
  // How many list rows are visible (Infinite scroll — auto-extends by +10)
  const [recVisibleCount, setRecVisibleCount] = useState<number>(10);
  // Bumped by the Empty-State "Retry" button to force a recommendations refetch
  const [retryTick, setRetryTick] = useState<number>(0);
  // Specific error type for better empty-state messaging ("offline" / "api" / "empty" / null)
  const [recError, setRecError] = useState<"offline" | "api" | "empty" | null>(null);

  // ── Wave engine (logic separated from UI) ──
  const wave = useWaveEngine();

  const isMobile = useIsMobile();

  // ── Taste profile ──
  const tasteProfile = useMemo(() => {
    return extractTasteProfile({
      history: Array.isArray(history) ? history : [],
      likedTracksData: Array.isArray(likedTracksData) ? likedTracksData : [],
      dislikedTrackIds: Array.isArray(dislikedTrackIds) ? dislikedTrackIds : [],
    });
  }, [history, likedTracksData, dislikedTrackIds]);

  // ── Recent tracks ──
  const recentTracks = useMemo(() => {
    return history.slice(0, 10).map((h: any) => h.track).filter(Boolean);
  }, [history]);

  // ── Fetch curated playlists ──
  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      try {
        const curatedParams = new URLSearchParams();
        const disliked = useAppStore.getState().dislikedTrackIds || [];
        if (disliked.length > 0) curatedParams.set("dislikedIds", disliked.join(","));

        const curatedRes = await fetch(`/api/playlists/curated?${curatedParams}`);

        if (!cancelled && curatedRes.ok) {
          const data = await curatedRes.json();
          setCuratedPlaylists(data.playlists || []);
        }
      } catch {
        if (!cancelled) { setCuratedPlaylists([]); }
      }
    };
    fetchAll();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch recommendations (non-blocking) ──
  useEffect(() => {
    let cancelled = false;
    const fetchRecs = async () => {
      setRecLoading(true);
      setRecError(null);
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

        // Fetch recommendations + trending + Apple Music Top + Spotify Top in parallel
        // Detect user country via timezone
        const userCountry = detectUserCountry();

        const [recRes, trendingRes, appleRes, spotifyRes] = await Promise.all([
          fetch(`/api/music/recommendations?${params}`),
          fetch(`/api/music/trending?limit=50`),
          fetch(`/api/music/apple-charts?country=${userCountry}`),
          fetch(`/api/music/spotify-charts?country=${userCountry}`),
        ]);

        const cats: RecCategory[] = [];

        // Add Spotify Top as first category ("Топ Spotify")
        if (spotifyRes.ok) {
          try {
            const spotifyData = await spotifyRes.json();
            const spotifyTracks = (spotifyData.tracks || []).filter((t: Track) => !disliked.includes(t.id)).slice(0, 50);
            if (spotifyTracks.length > 0) {
              cats.push({
                id: "spotify_top",
                title: "Топ Spotify",
                icon: "Flame",
                tracks: spotifyTracks,
              });
            }
          } catch {}
        }

        // Add Apple Music Top 100 as second category
        if (appleRes.ok) {
          try {
            const appleData = await appleRes.json();
            const appleTracks = (appleData.tracks || []).filter((t: Track) => !disliked.includes(t.id)).slice(0, 50);
            if (appleTracks.length > 0) {
              const cName = countryNameFromCode(appleData.country || userCountry);
              cats.push({
                id: "apple_top",
                title: `Топ ${cName}`,
                icon: "Flame",
                tracks: appleTracks,
              });
            }
          } catch {}
        }

        // Add trending as third category ("Популярное сейчас")
        if (trendingRes.ok) {
          const tData = await trendingRes.json();
          const trendingTracks = (tData.tracks || []).filter((t: Track) => !disliked.includes(t.id)).slice(0, 50);
          if (trendingTracks.length > 0) {
            cats.push({
              id: "trending_now",
              title: "Популярное сейчас",
              icon: "Flame",
              tracks: trendingTracks,
            });
          }
        }

        // Add recommendation categories
        if (recRes.ok) {
          const data = await recRes.json();
          const recCats = (data.categories || []).map((cat: any) => ({
            id: cat.id || `cat_${Date.now()}_${Math.random()}`,
            title: cat.title || "Рекомендации",
            icon: cat.icon || "Sparkles",
            tracks: (cat.tracks || []).filter((t: Track) => !disliked.includes(t.id)).slice(0, 50),
          })).filter((cat: any) => cat.tracks.length > 0);
          cats.push(...recCats);
        }

        // If no categories at all, create a fallback from trending
        if (cats.length === 0 && trendingRes.ok) {
          const tData = await trendingRes.json();
          const fallback = (tData.tracks || []).filter((t: Track) => !disliked.includes(t.id)).slice(0, 50);
          if (fallback.length > 0) {
            cats.push({ id: "fallback", title: "Для вас", icon: "Sparkles", tracks: fallback });
          }
        }

        if (!cancelled) {
          setRecCategories(cats);
          setRecError(cats.length === 0 ? "empty" : null);
        }
      } catch (err) {
        if (!cancelled) {
          // Distinguish offline vs API error for better messaging
          const isOffline = err instanceof TypeError && (err.message.includes("Failed to fetch") || err.message.includes("NetworkError"));
          setRecError(isOffline ? "offline" : "api");
          setRecCategories([]);
        }
      } finally {
        if (!cancelled) setRecLoading(false);
      }
    };
    const timer = setTimeout(fetchRecs, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tasteProfile, retryTick]);

  const handleRetryRecs = useCallback(() => setRetryTick((n) => n + 1), []);

  // ── Friends listening now (polling every 15s) ──
  const { friends: listeningFriends } = useFriendsListening();

  // ── Real-time rec updates (polling hash every 30s, triggers refetch on change) ──
  useRecUpdates(handleRetryRecs);

  // ── Aggregated recommendations (deduped across categories) ──
  const allRecTracks = useMemo(() => {
    const seen = new Set<string>();
    const result: { track: Track; categoryId: string }[] = [];
    for (const cat of recCategories) {
      for (const t of cat.tracks) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        result.push({ track: t, categoryId: cat.id });
      }
    }
    return result;
  }, [recCategories]);

  // ── Reset activeRecTab only if its category disappears AND the previous
  // category list had it (i.e. this is a real disappearance, not a refetch
  // during loading). Without the prevHas check, the effect would reset
  // the tab to "all" on every refetch even when the category still exists,
  // because recCategories briefly becomes [] between setRecCategories([])
  // and the new fetch completing.
  const prevCatsRef = useRef<string[] | null>(null);
  useEffect(() => {
    const prev = prevCatsRef.current;
    const cur = recCategories.map((c) => c.id);
    if (activeRecTab !== "all" && prev && !cur.includes(activeRecTab) && prev.includes(activeRecTab)) {
      setActiveRecTab("all");
    }
    prevCatsRef.current = cur;
  }, [recCategories, activeRecTab]);

  // ── Persist activeRecTab to localStorage ──
  useEffect(() => {
    try { window.localStorage.setItem("mq:recTab", activeRecTab); } catch {}
  }, [activeRecTab]);

  // ── Reset visibleCount on tab change (animated transition handles the visual)
  useEffect(() => {
    setRecVisibleCount(10);
  }, [activeRecTab]);

  // ── Visible tracks based on active tab ──
  const visibleRecTracks = useMemo(() => {
    if (activeRecTab === "all") return allRecTracks;
    const cat = recCategories.find((c) => c.id === activeRecTab);
    if (!cat) return [];
    return cat.tracks.map((t) => ({ track: t, categoryId: cat.id }));
  }, [activeRecTab, allRecTracks, recCategories]);

  // ── Hero = currently-playing track if it's in this tab, else first track.
  // Matches Spotify's "now playing panel" behavior: when the user is playing
  // a track from this tab, the Hero pins it so they always see what's on.
  const recHero = useMemo(() => {
    if (!visibleRecTracks.length) return null;
    if (currentTrack) {
      const idx = visibleRecTracks.findIndex((v) => v.track.id === currentTrack.id);
      if (idx >= 0) return visibleRecTracks[idx];
    }
    return visibleRecTracks[0];
  }, [visibleRecTracks, currentTrack]);

  // ── List = everything EXCEPT the hero, sliced to recVisibleCount ──
  // Dedupe: any track whose id matches the hero is excluded from the list.
  const recList = useMemo(() => {
    if (!recHero) return visibleRecTracks.slice(0, recVisibleCount);
    return visibleRecTracks
      .filter((v) => v.track.id !== recHero.track.id)
      .slice(0, recVisibleCount);
  }, [visibleRecTracks, recHero, recVisibleCount]);

  const recListTotal = useMemo(() => {
    if (!recHero) return visibleRecTracks.length;
    return visibleRecTracks.filter((v) => v.track.id !== recHero.track.id).length;
  }, [visibleRecTracks, recHero]);

  // ── Play rec track in context of all visible tracks ──
  // If the clicked track is already current, toggle play/pause instead
  // of restarting it from 0:00. This matches Spotify-like UX where tapping
  // a playing track's card pauses it.
  const handlePlayRec = useCallback((track: Track) => {
    const cur = useAppStore.getState().currentTrack;
    if (cur?.id === track.id) {
      togglePlay();
      return;
    }
    const ctx = visibleRecTracks.map((v) => v.track);
    if (ctx.length === 0) return;
    playTrack(track, ctx);
  }, [visibleRecTracks, playTrack, togglePlay]);

  // ── Wave controls (from useWaveEngine hook) ──
  // Visual WaveCard component handles all rendering; this hook provides logic.

  // ── Artist navigation ──
  const handleNavigateToArtist = useCallback((artist: string) => {
    if (!artist) return;
    setSelectedArtist({ name: artist });
  }, [setSelectedArtist]);

  // ── Artist detail ──
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

  // ── Pull-to-refresh (mobile only) ──
  // Touch-based: user pulls down at scrollTop=0 → triggers handleRetryRecs.
  // Desktop scrolling doesn't engage (uses touch events only).
  const pullStartY = useRef<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const PULL_THRESHOLD = 70; // px — must pull this far to trigger

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (typeof window !== "undefined" && window.scrollY <= 0) {
      pullStartY.current = e.touches[0].clientY;
    } else {
      pullStartY.current = null;
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (pullStartY.current === null) return;
    const delta = e.touches[0].clientY - pullStartY.current;
    if (delta > 0) {
      // Dampen: 0.5x resistance after threshold
      setPullDistance(Math.min(delta * 0.5, 100));
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD) {
      handleRetryRecs();
    }
    setPullDistance(0);
    pullStartY.current = null;
  }, [pullDistance, handleRetryRecs]);

  return (
    <div
      className={`${compactMode ? "p-3 lg:p-4" : "p-3.5 sm:p-4 lg:p-6"} max-w-[var(--mq-container-narrow)] mx-auto pb-32 lg:pb-28`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull-to-refresh indicator (mobile only) */}
      {pullDistance > 0 && (
        <div
          className="flex items-center justify-center overflow-hidden transition-all lg:hidden"
          style={{ height: pullDistance, opacity: Math.min(pullDistance / PULL_THRESHOLD, 1) }}
        >
          <div
            className="w-7 h-7 rounded-full border-2 flex items-center justify-center"
            style={{
              borderColor: "var(--mq-border-thin)",
              borderTopColor: "var(--mq-accent)",
              transform: `rotate(${pullDistance * 3}deg)`,
            }}
          >
            {pullDistance >= PULL_THRESHOLD ? (
              <RotateCcw className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
            ) : null}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* HERO GREETING */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0}>
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-6"
        >
          <p className="mq-text-eyebrow mb-1.5 text-[10px] sm:text-[11px]">{currentDate()}</p>
          <h1 className="mq-text-display text-xl sm:text-2xl lg:text-3xl" style={{ color: "var(--mq-text)" }}>
            {greeting()}
          </h1>
        </motion.div>
      </ScrollReveal>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* ВОЛНА (Wave) — preserved as-is */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.03}>
        <WaveCard
          isMobile={isMobile}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          radioMode={wave.radioMode}
          progress={useAppStore.getState().progress}
          duration={duration}
          waveLoading={wave.waveLoading}
          waveError={wave.waveError}
          onStartWave={wave.startWave}
          onPauseWave={wave.pauseWave}
          onSkip={wave.skipTrack}
          onDislike={wave.dislikeTrack}
          onLike={wave.likeTrack}
          topGenres={tasteProfile.topGenres}
        />
      </ScrollReveal>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* QUICK STATS — 2x2 on mobile, 4 on desktop */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.05}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-8">
          <QuickStat icon={Heart} label="Избранное" value={likedTrackIds.length} onClick={() => setView("favorites")} accent="#ef4444" />
          <QuickStat icon={Clock} label="История" value={history.length} onClick={() => setView("history")} accent="var(--mq-accent)" />
          <QuickStat icon={ListMusic} label="Плейлисты" value={playlists.length} onClick={() => setView("playlists")} accent="#8b5cf6" />
          <QuickStat icon={MessageCircle} label="Чаты" value={contacts.length} onClick={() => setView("messenger")} accent="#06b6d4" />
        </div>
      </ScrollReveal>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* PLAYLISTS — user's playlists grid */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <Section
        title="Плейлисты"
        icon={ListMusic}
        action={
          playlists.length > 0 ? (
            <button onClick={() => setView("playlists")} className="text-xs font-semibold" style={{ color: "var(--mq-accent)" }}>
              Все
            </button>
          ) : undefined
        }
      >
        {playlists.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {playlists.slice(0, 8).map((pl, i) => (
              <PlaylistCard
                key={pl.id}
                playlist={pl}
                index={i}
                isCurrent={!!currentTrack && pl.tracks.some(t => t.id === currentTrack.id) && isPlaying}
                onClick={() => {
                  setTimeout(() => useAppStore.getState().setSelectedPlaylistId(pl.id), 0);
                  setView("playlists");
                }}
                onPlay={(e) => {
                  e.stopPropagation();
                  if (pl.tracks.length === 0) return;
                  if (currentTrack?.id === pl.tracks[0].id) { togglePlay(); return; }
                  playTrack(pl.tracks[0], [...pl.tracks], pl.id);
                }}
                animationsEnabled={animationsEnabled}
              />
            ))}
          </div>
        ) : (
          <button
            onClick={() => setView("playlists")}
            className="w-full rounded-2xl p-5 flex items-center gap-4 transition-all hover:bg-white/[0.02]"
            style={{ backgroundColor: "var(--mq-card)", border: "1px dashed var(--mq-border-thin)" }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}>
              <Plus className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>Создайте плейлист</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>Организуйте любимую музыку</p>
            </div>
          </button>
        )}
      </Section>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* FRIENDS LISTENING NOW — social widget (polling-based) */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {listeningFriends.length > 0 && (
        <Section title="Друзья слушают" icon={User}>
          <HScroll
            className="flex gap-3 overflow-x-auto scrollbar-none -mx-3 px-3 lg:mx-0 lg:px-0 pb-1"
          >
            {listeningFriends.map((f) => (
              <div
                key={f.userId}
                className="flex-shrink-0 w-[200px] rounded-2xl p-3 cursor-pointer hover:scale-[1.02] transition-transform"
                style={{
                  backgroundColor: "var(--mq-card)",
                  border: "1px solid var(--mq-border-hairline)",
                }}
                onClick={() => {
                  if (f.scTrackId) {
                    // Try to play the same track
                    const track: Track = {
                      id: `sc_${f.scTrackId}`,
                      title: f.trackTitle,
                      artist: f.trackArtist,
                      album: "",
                      cover: f.trackCover,
                      duration: f.duration,
                      genre: "",
                      audioUrl: "",
                      previewUrl: "",
                      source: "soundcloud",
                      scTrackId: f.scTrackId,
                    };
                    playTrack(track, [track]);
                  }
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0" style={{ backgroundColor: "var(--mq-card)" }}>
                    {f.avatar ? (
                      <img src={f.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--mq-text)" }}>
                      {f.username}
                    </p>
                    <div className="flex items-center gap-1">
                      {f.isPlaying && (
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--mq-accent)" }} />
                      )}
                      <span className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                        {f.isPlaying ? "сейчас" : "на паузе"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: "var(--mq-bg)" }}>
                    {f.trackCover ? (
                      <img src={f.trackCover} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: "var(--mq-text)" }}>
                      {f.trackTitle}
                    </p>
                    <p className="text-[10px] truncate" style={{ color: "var(--mq-text-muted)" }}>
                      {f.trackArtist}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </HScroll>
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* RECOMMENDATIONS — Hero + Tabs + List (rewritten from scratch) */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {recCategories.length > 0 && recHero && (
        <Section title="Для вас" icon={Sparkles}>
          {/* Hero featured track — sticky at top while scrolling the list */}
          <div className="sticky top-0 z-10 -mx-3 px-3 lg:mx-0 lg:px-0 pb-3 mb-1" style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
            <RecsHero
              track={recHero.track}
              reason={reasonForRec(recHero.categoryId)}
              isCurrent={currentTrack?.id === recHero.track.id}
              isPlaying={isPlaying && currentTrack?.id === recHero.track.id}
              onPlay={() => handlePlayRec(recHero.track)}
              onArtistClick={() => handleNavigateToArtist(recHero.track.artist)}
              animationsEnabled={animationsEnabled}
            />
          </div>

          {/* Tab navigation */}
          <RecsTabs
            categories={recCategories}
            allCount={allRecTracks.length}
            value={activeRecTab}
            onChange={setActiveRecTab}
          />

          {/* Animated list — fade/slide on tab change, infinite scroll */}
          {recList.length === 0 ? (
            <RecsEmptyState onRetry={handleRetryRecs} errorType={recError} />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeRecTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                <RecsList
                  tracks={recList.map((v) => v.track)}
                  reasons={recList.map((v) => reasonForRec(v.categoryId))}
                  currentTrack={currentTrack}
                  isPlaying={isPlaying}
                  onPlay={handlePlayRec}
                  onArtistClick={handleNavigateToArtist}
                  animationsEnabled={animationsEnabled}
                />
                {/* Infinite scroll sentinel — auto-loads next 10 when visible */}
                {recListTotal > recList.length && (
                  <InfiniteScrollSentinel
                    onVisible={() => setRecVisibleCount((n) => n + 10)}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </Section>
      )}

      {/* Recommendations loading skeleton (initial load only) */}
      {recLoading && recCategories.length === 0 && (
        <Section title="Для вас" icon={Sparkles}>
          <RecsSkeleton />
        </Section>
      )}

      {/* Recommendations empty state (initial load finished, no categories) */}
      {!recLoading && recCategories.length === 0 && (
        <Section title="Для вас" icon={Sparkles}>
          <RecsEmptyState onRetry={handleRetryRecs} errorType={recError} />
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* RECENTLY PLAYED */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {recentTracks.length > 0 && (
        <Section
          title="Недавно"
          icon={Clock}
          action={
            <button onClick={() => setView("history")} className="text-xs font-semibold" style={{ color: "var(--mq-accent)" }}>
              Все
            </button>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
            {recentTracks.slice(0, 5).map((track, i) => (
              <TrackCard
                key={track.id + "_" + i}
                track={track}
                index={i}
                isCurrent={currentTrack?.id === track.id}
                isPlaying={isPlaying && currentTrack?.id === track.id}
                onPlay={() => {
                  if (currentTrack?.id === track.id) { togglePlay(); return; }
                  playTrack(track, recentTracks);
                }}
                onArtistClick={() => handleNavigateToArtist(track.artist)}
                animationsEnabled={animationsEnabled}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* FAVORITE ARTISTS */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {favoriteArtists.length > 0 && (
        <Section title="Любимые артисты" icon={User}>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            {favoriteArtists.slice(0, 6).map((artist, i) => (
              <ArtistCircleCard
                key={artist.id}
                artist={artist}
                index={i}
                onClick={() => setSelectedArtist({ name: artist.username, avatar: artist.avatar, followers: artist.followers, trackCount: artist.trackCount })}
                animationsEnabled={animationsEnabled}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* CURATED PLAYLISTS */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {curatedPlaylists.length > 0 && (
        <Section title="Подобрано для вас" icon={Sparkles}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {curatedPlaylists.slice(0, 8).map((pl, i) => (
              <CuratedPlaylistCard
                key={pl.id}
                playlist={pl}
                index={i}
                onPlay={() => {
                  if (pl.tracks.length === 0) return;
                  if (currentTrack?.id === pl.tracks[0].id) { togglePlay(); return; }
                  playTrack(pl.tracks[0], pl.tracks);
                }}
                animationsEnabled={animationsEnabled}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SECTION WRAPPER — unified styling for all sections
// ═════════════════════════════════════════════════════════════════════════

function Section({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <ScrollReveal direction="up" delay={0.05}>
      <section className="mb-7 sm:mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)",
                boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--mq-accent) 18%, transparent)",
              }}
            >
              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{ color: "var(--mq-accent)" }} />
            </div>
            <h2 className="mq-text-headline text-base sm:text-lg lg:text-xl" style={{ color: "var(--mq-text)" }}>
              {title}
            </h2>
          </div>
          {action}
        </div>
        {children}
      </section>
    </ScrollReveal>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// QUICK STAT
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
      className="mq-premium-card rounded-2xl p-3 sm:p-3.5 flex items-center gap-2.5 cursor-pointer mq-premium-hover"
    >
      <div
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 20%, transparent)`,
        }}
      >
        <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-base sm:text-lg font-bold leading-none" style={{ color: "var(--mq-text)" }}>{value}</p>
        <p className="text-[10px] sm:text-[11px] mt-1 truncate" style={{ color: "var(--mq-text-muted)" }}>{label}</p>
      </div>
    </motion.button>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// TRACK CARD — universal card for tracks (recommendations, recently, trending preview)
// ═════════════════════════════════════════════════════════════════════════

function TrackCard({
  track,
  index,
  isCurrent,
  isPlaying,
  onPlay,
  onArtistClick,
  animationsEnabled,
}: {
  track: Track;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onArtistClick: () => void;
  animationsEnabled: boolean;
}) {
  return (
    <motion.button
      initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.3), duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97 }}
      onClick={onPlay}
      className="text-left cursor-pointer group w-full"
    >
      <div
        className="relative aspect-square rounded-2xl overflow-hidden mb-2"
        style={{
          boxShadow: isCurrent
            ? "0 0 0 2px var(--mq-accent), 0 8px 24px color-mix(in srgb, var(--mq-accent) 30%, transparent)"
            : "var(--mq-shadow-premium-md)",
          transition: "box-shadow 0.3s var(--mq-ease-premium)",
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
            style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}
          >
            <Music className="w-7 h-7" style={{ color: "rgba(255,255,255,0.7)" }} />
          </div>
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300" />
        {/* Play button */}
        <div
          className="absolute bottom-2 right-2 w-11 h-11 sm:w-10 sm:h-10 rounded-full flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 sm:scale-90 sm:group-hover:scale-100 sm:translate-y-2 sm:group-hover:translate-y-0"
          style={{
            backgroundColor: "var(--mq-accent)",
            boxShadow: "0 4px 16px color-mix(in srgb, var(--mq-accent) 40%, transparent)",
          }}
        >
          {isCurrent && isPlaying ? (
            <Pause className="w-4 h-4" fill="#fff" style={{ color: "#fff" }} />
          ) : (
            <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
          )}
        </div>
        {/* Current badge */}
        {isCurrent && (
          <div
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold backdrop-blur-md flex items-center gap-1"
            style={{
              backgroundColor: "rgba(0,0,0,0.6)",
              color: "var(--mq-accent)",
              border: "1px solid var(--mq-border-accent)",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--mq-accent)" }} />
            ИГРАЕТ
          </div>
        )}
      </div>
      <p
        className="text-[13px] sm:text-sm font-semibold truncate leading-tight mt-0.5"
        style={{ color: isCurrent ? "var(--mq-accent)" : "var(--mq-text)" }}
      >
        {track.title}
      </p>
      <button
        onClick={(e) => { e.stopPropagation(); onArtistClick(); }}
        className="text-[11px] sm:text-xs truncate hover:underline block w-full text-left mt-0.5"
        style={{ color: "var(--mq-text-muted)" }}
      >
        {track.artist}
      </button>
    </motion.button>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// PLAYLIST CARD — user's playlist tile
// ═════════════════════════════════════════════════════════════════════════

const PLAYLIST_GRADIENTS: [string, string][] = [
  ["#2d1b3d", "#0e0e0e"], ["#1b2d3a", "#0e0e0e"], ["#3d2b1b", "#0e0e0e"],
  ["#1b3a2d", "#0e0e0e"], ["#3a1b2d", "#0e0e0e"], ["#2d2d1b", "#0e0e0e"],
];
function hashHue(name: string, idx: 0 | 1): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return PLAYLIST_GRADIENTS[Math.abs(h) % PLAYLIST_GRADIENTS.length][idx];
}

function PlaylistCard({
  playlist: pl,
  index,
  isCurrent,
  onClick,
  onPlay,
  animationsEnabled,
}: {
  playlist: { id: string; name: string; cover: string; tracks: Track[] };
  index: number;
  isCurrent: boolean;
  onClick: () => void;
  onPlay: (e: React.MouseEvent) => void;
  animationsEnabled: boolean;
}) {
  return (
    <motion.button
      initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="group relative text-left cursor-pointer rounded-2xl overflow-hidden w-full"
      style={{
        backgroundColor: "var(--mq-card)",
        border: "1px solid var(--mq-border-hairline)",
        boxShadow: "var(--mq-shadow-premium-md)",
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
            <ListMusic className="w-8 h-8" style={{ color: "rgba(255,255,255,0.5)" }} />
            <span className="text-[11px] font-medium mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{pl.tracks.length}</span>
          </div>
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300" />
        {/* Play button */}
        {pl.tracks.length > 0 && (
          <div
            onClick={onPlay}
            className="absolute bottom-2 right-2 w-9 h-9 rounded-full flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 sm:scale-90 sm:group-hover:scale-100 sm:translate-y-2 sm:group-hover:translate-y-0 cursor-pointer"
            style={{
              backgroundColor: "var(--mq-accent)",
              boxShadow: "0 4px 16px color-mix(in srgb, var(--mq-accent) 40%, transparent)",
            }}
          >
            <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
          </div>
        )}
        {/* Current badge */}
        {isCurrent && (
          <div
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold backdrop-blur-md flex items-center gap-1"
            style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "var(--mq-accent)", border: "1px solid var(--mq-border-accent)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--mq-accent)" }} />
            ИГРАЕТ
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-[13px] sm:text-sm font-semibold truncate leading-tight" style={{ color: "var(--mq-text)" }} title={pl.name}>{pl.name}</p>
        <p className="text-[11px] sm:text-xs mt-0.5 truncate" style={{ color: "var(--mq-text-muted)" }}>
          {pl.tracks.length} {pluralRu(pl.tracks.length, "трек", "трека", "треков")}
        </p>
      </div>
    </motion.button>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// RECS — Reasoning helper
// ═════════════════════════════════════════════════════════════════════════

function reasonForRec(categoryId: string): string {
  switch (categoryId) {
    case "spotify_top": return "Топ-чарт Spotify";
    case "apple_top": return "Топ-чарт страны";
    case "trending_now": return "Популярно сейчас";
    case "fallback": return "Подобрано для вас";
    default: return "Похоже на ваше";
  }
}

// Icon per category id — used in RecsTabs tab chips
function iconForRec(categoryId: string): React.ElementType {
  switch (categoryId) {
    case "spotify_top": return Music;
    case "apple_top": return Flame;
    case "trending_now": return TrendingUp;
    case "for_you":
    case "fallback": return Sparkles;
    case "discover": return Compass;
    default: return Sparkles;
  }
}

// ═════════════════════════════════════════════════════════════════════════
// RECS HERO — featured track of the day
// ═════════════════════════════════════════════════════════════════════════

function RecsHero({
  track, reason, isCurrent, isPlaying, onPlay, onArtistClick, animationsEnabled,
}: {
  track: Track;
  reason: string;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onArtistClick: () => void;
  animationsEnabled: boolean;
}) {
  const liked = useAppStore((s) => s.likedTrackIds.includes(track.id));
  const toggleLike = useAppStore((s) => s.toggleLike);

  return (
    <motion.div
      initial={animationsEnabled ? { opacity: 0, y: 14 } : undefined}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="relative rounded-3xl overflow-hidden mb-5"
      style={{ boxShadow: "var(--mq-shadow-float)" }}
    >
      {/* Blurred cover background */}
      {track.cover ? (
        <div className="absolute inset-0">
          <img
            src={track.cover}
            alt=""
            className="w-full h-full object-cover"
            style={{ filter: "blur(48px) saturate(180%)", transform: "scale(1.4)" }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--mq-bg) 55%, transparent), color-mix(in srgb, var(--mq-bg) 35%, transparent))",
            }}
          />
        </div>
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 30%, var(--mq-bg)), var(--mq-bg))",
          }}
        />
      )}

      {/* Subtle noise texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.05,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundRepeat: "repeat",
          backgroundSize: "128px 128px",
        }}
      />

      {/* Content */}
      <div className="relative z-10 p-3 sm:p-5 flex items-center gap-3 sm:gap-5">
        {/* Cover — 80px on mobile, 112px on desktop */}
        <div
          className="relative w-20 h-20 sm:w-28 sm:h-28 rounded-2xl overflow-hidden flex-shrink-0"
          style={{ boxShadow: "var(--mq-shadow-elevated)" }}
        >
          {track.cover ? (
            <img src={track.cover} alt="" className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{
                background:
                  "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))",
              }}
            >
              <Music className="w-10 h-10" style={{ color: "rgba(255,255,255,0.7)" }} />
            </div>
          )}
          {/* Playing overlay */}
          {isCurrent && isPlaying && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            >
              <EqualizerIcon />
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            <motion.span
              animate={{ opacity: [0.6, 1, 0.6], scale: [0.95, 1, 0.95] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              className="inline-flex"
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
            </motion.span>
            <span
              className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest"
              style={{ color: "var(--mq-accent)" }}
            >
              Рекомендация для вас
            </span>
          </div>
          <h3
            className="text-lg sm:text-xl font-bold truncate"
            style={{ color: "var(--mq-text)", letterSpacing: "-0.02em" }}
            title={track.title}
          >
            {track.title}
          </h3>
          <button
            onClick={(e) => { e.stopPropagation(); onArtistClick(); }}
            className="text-sm truncate hover:underline block w-full text-left mt-0.5"
            style={{ color: "var(--mq-text-muted)" }}
          >
            {track.artist}
          </button>
          {reason && (
            <div
              className="hidden sm:inline-flex items-center gap-1.5 mt-2.5 px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)",
                border: "1px solid color-mix(in srgb, var(--mq-accent) 24%, transparent)",
              }}
            >
              <span
                className="text-[10px] sm:text-[11px] font-medium"
                style={{ color: "var(--mq-accent)" }}
              >
                {reason}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
          <motion.button
            whileTap={{ scale: 0.93 }}
            whileHover={{ scale: 1.05 }}
            onClick={(e) => { e.stopPropagation(); onPlay(); }}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: "var(--mq-accent)",
              color: "#fff",
              boxShadow: "var(--mq-shadow-accent)",
            }}
            aria-label={isCurrent && isPlaying ? "Пауза" : "Слушать"}
          >
            {isCurrent && isPlaying ? (
              <Pause className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" />
            ) : (
              <Play className="w-5 h-5 sm:w-6 sm:h-6 ml-0.5" fill="currentColor" />
            )}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.93 }}
            whileHover={{ scale: 1.05 }}
            onClick={(e) => { e.stopPropagation(); toggleLike(track.id, track); }}
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: "var(--mq-card)",
              color: liked ? "var(--mq-accent)" : "var(--mq-text-muted)",
              border: "1px solid var(--mq-border-hairline)",
            }}
            aria-label={liked ? "Убрать из избранного" : "В избранное"}
          >
            <Heart className="w-4 h-4 sm:w-5 sm:h-5" fill={liked ? "currentColor" : "none"} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// RECS TABS — switch between "All" and individual categories
// ═════════════════════════════════════════════════════════════════════════

function RecsTabs({
  categories, allCount, value, onChange,
}: {
  categories: RecCategory[];
  allCount: number;
  value: string;
  onChange: (id: string) => void;
}) {
  const tabs = [
    { id: "all", title: "Все", count: allCount, icon: Sparkles },
    ...categories.map((c) => ({ id: c.id, title: c.title, count: c.tracks.length, icon: iconForRec(c.id) })),
  ];
  return (
    <HScroll
      className="flex gap-1 overflow-x-auto scrollbar-none -mx-3 px-3 lg:mx-0 lg:px-0 mb-4"
    >
      {tabs.map((t) => {
        const active = value === t.id;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{
              backgroundColor: active
                ? "color-mix(in srgb, var(--mq-accent) 14%, transparent)"
                : "transparent",
              color: active ? "var(--mq-accent)" : "var(--mq-text-muted)",
            }}
          >
            <Icon className="w-3.5 h-3.5" style={{ opacity: active ? 1 : 0.7 }} />
            {t.title}
            {t.count > 0 && (
              <span className="ml-0.5 text-[10px] opacity-70">{t.count}</span>
            )}
          </button>
        );
      })}
    </HScroll>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// RECS LIST — compact numbered rows below the hero
// ═════════════════════════════════════════════════════════════════════════

function RecsList({
  tracks, reasons, currentTrack, isPlaying, onPlay, onArtistClick, animationsEnabled,
}: {
  tracks: Track[];
  reasons: string[];
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlay: (track: Track) => void;
  onArtistClick: (artist: string) => void;
  animationsEnabled: boolean;
}) {
  if (tracks.length === 0) {
    return (
      <div
        className="text-center py-6 rounded-2xl"
        style={{ backgroundColor: "var(--mq-card)" }}
      >
        <Sparkles
          className="w-7 h-7 mx-auto mb-2"
          style={{ color: "var(--mq-text-muted)", opacity: 0.3 }}
        />
        <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
          Нет рекомендаций
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      {tracks.map((track, i) => (
        <RecRow
          key={track.id + "_" + i}
          track={track}
          rank={i + 2} // 1 is reserved for the hero
          reason={reasons[i] || ""}
          isCurrent={currentTrack?.id === track.id}
          isPlaying={isPlaying && currentTrack?.id === track.id}
          onPlay={() => onPlay(track)}
          onArtistClick={() => onArtistClick(track.artist)}
          animationsEnabled={animationsEnabled}
        />
      ))}
    </div>
  );
}

// ─── RecRow ───────────────────────────────────────────────────────────────

function RecRow({
  track, rank, reason, isCurrent, isPlaying, onPlay, onArtistClick, animationsEnabled,
}: {
  track: Track;
  rank: number;
  reason: string;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onArtistClick: () => void;
  animationsEnabled: boolean;
}) {
  const [hovering, setHovering] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; show: boolean }>({
    x: 0, y: 0, show: false,
  });

  // Long-press handler (mobile) → opens context menu at touch position
  const handleLongPress = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const clientX = "touches" in e ? e.touches[0]?.clientX ?? 0 : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0]?.clientY ?? 0 : (e as React.MouseEvent).clientY;
    setContextMenu({ x: clientX, y: clientY, show: true });
  }, []);
  const { wasLongPress: longPressWasActive, ...longPressHandlers } = useLongPress(handleLongPress, {
    delay: 500,
    threshold: 10,
  });

  // Right-click handler (desktop) → opens context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, show: true });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu((prev) => ({ ...prev, show: false })), []);

  // Suppress click right after long-press
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (longPressWasActive()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onPlay();
  }, [longPressWasActive, onPlay]);

  return (
    <>
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 6 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: Math.min(rank * 0.03, 0.3), duration: 0.25 }}
        onHoverStart={() => setHovering(true)}
        onHoverEnd={() => setHovering(false)}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        {...longPressHandlers}
        whileTap={{ scale: 0.99 }}
        className="group flex items-center gap-3 p-2 sm:p-2.5 rounded-xl cursor-pointer transition-colors"
        style={{
          backgroundColor: isCurrent
            ? "color-mix(in srgb, var(--mq-accent) 10%, transparent)"
            : "transparent",
        }}
      >
        {/* Rank / play indicator */}
        <div className="w-6 flex-shrink-0 text-center">
          {isCurrent && isPlaying ? (
            <EqualizerIcon />
          ) : hovering ? (
            <Play
              className="w-3.5 h-3.5 mx-auto"
              style={{ color: "var(--mq-text)" }}
              fill="currentColor"
            />
          ) : (
            <span
              className="text-xs font-semibold"
              style={{ color: isCurrent ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
            >
              {rank}
            </span>
          )}
        </div>

        {/* Cover */}
        <div
          className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0"
          style={{ backgroundColor: "var(--mq-card)" }}
        >
          {track.cover ? (
            <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
            </div>
          )}
        </div>

        {/* Title + artist + reason */}
        <div className="flex-1 min-w-0">
          <p
            className="text-[13px] sm:text-sm font-medium truncate"
            style={{ color: isCurrent ? "var(--mq-accent)" : "var(--mq-text)" }}
          >
            {track.title}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); onArtistClick(); }}
              className="text-[11px] sm:text-xs truncate hover:underline"
              style={{ color: "var(--mq-text-muted)" }}
            >
              {track.artist}
            </button>
            {reason && (
              <>
                <span
                  className="text-[10px]"
                  style={{ color: "var(--mq-text-muted)", opacity: 0.4 }}
                >
                  •
                </span>
                <span
                  className="text-[10px] truncate"
                  style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}
                >
                  {reason}
                </span>
              </>
            )}
          </div>
        </div>

        {/* More button (3-dot) — opens context menu on click (mobile-friendly) */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setContextMenu({ x: rect.left, y: rect.bottom + 4, show: true });
          }}
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: "var(--mq-text-muted)" }}
          aria-label="Меню"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {/* Play / pause button */}
        <div className="flex-shrink-0">
          {isCurrent && isPlaying ? (
            <button
              onClick={(e) => { e.stopPropagation(); onPlay(); }}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
              aria-label="Пауза"
            >
              <Pause className="w-4 h-4" fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onPlay(); }}
              className="w-9 h-9 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                backgroundColor: "color-mix(in srgb, var(--mq-accent) 14%, transparent)",
                color: "var(--mq-accent)",
              }}
              aria-label="Слушать"
            >
              <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
          </button>
        )}
      </div>
    </motion.div>

      {/* Context menu (right-click / long-press / 3-dot button) */}
      {contextMenu.show && (
        <ContextMenu
          track={track}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
        />
      )}
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// RECS SKELETON — loading state
// ═════════════════════════════════════════════════════════════════════════

function RecsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Hero skeleton */}
      <div
        className="relative rounded-3xl overflow-hidden p-5 flex items-center gap-4"
        style={{ backgroundColor: "var(--mq-card)" }}
      >
        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl mq-shimmer flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-28 rounded mq-shimmer" />
          <div className="h-5 w-3/4 rounded mq-shimmer" />
          <div className="h-3 w-1/2 rounded mq-shimmer" />
          <div className="h-5 w-32 rounded-full mq-shimmer mt-2" />
        </div>
      </div>
      {/* Tabs skeleton */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-20 rounded-lg mq-shimmer" />
        ))}
      </div>
      {/* List skeleton */}
      <div className="space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2.5">
            <div className="w-6 h-3 rounded mq-shimmer" />
            <div className="w-11 h-11 rounded-lg mq-shimmer" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-2/3 rounded mq-shimmer" />
              <div className="h-2.5 w-1/3 rounded mq-shimmer" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// HSCROLL — horizontal scroll container that converts vertical wheel →
// horizontal scroll on PC mice. Uses native addEventListener with
// { passive: false } because React's onWheel is passive and can't
// preventDefault() the vertical page scroll.
// ═════════════════════════════════════════════════════════════════════════

function HScroll({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  return (
    <div ref={ref} className={className} style={{ scrollBehavior: "smooth", ...style }}>
      {children}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// INFINITE SCROLL SENTINEL — invisible element that triggers onVisible
// when it enters the viewport, used for auto-loading more list rows.
// ═════════════════════════════════════════════════════════════════════════

function InfiniteScrollSentinel({ onVisible }: { onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onVisible();
      },
      { rootMargin: "200px 0px" } // start loading 200px before reaching sentinel
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onVisible]);
  return <div ref={ref} className="h-4 flex items-center justify-center py-2">
    <div className="w-4 h-4 rounded-full border-2 mq-shimmer" style={{ borderColor: "var(--mq-border-thin)", borderTopColor: "var(--mq-accent)" }} />
  </div>;
}

// ═════════════════════════════════════════════════════════════════════════
// RECS LIST SKELETON — compact list-only skeleton for tab switching
// ═════════════════════════════════════════════════════════════════════════

function RecsListSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2 sm:p-2.5">
          <div className="w-6 h-3 rounded mq-shimmer flex-shrink-0" />
          <div className="w-11 h-11 rounded-lg mq-shimmer flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-2/3 rounded mq-shimmer" />
            <div className="h-2.5 w-1/3 rounded mq-shimmer" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// RECS EMPTY STATE — when recommendations failed or returned nothing
// ═════════════════════════════════════════════════════════════════════════

function RecsEmptyState({ onRetry, errorType }: { onRetry: () => void; errorType?: "offline" | "api" | "empty" | null }) {
  const messages = {
    offline: {
      title: "Нет интернета",
      desc: "Проверьте подключение к сети и попробуйте снова",
    },
    api: {
      title: "Сервис недоступен",
      desc: "Не удалось связаться с сервером рекомендаций. Попробуйте через минуту",
    },
    empty: {
      title: "Пока нет рекомендаций",
      desc: "Послушайте несколько треков и поставьте лайки — мы подберём похожее",
    },
  };
  const msg = messages[errorType || "empty"] || messages.empty;
  return (
    <div
      className="text-center py-10 rounded-2xl"
      style={{ backgroundColor: "var(--mq-card)" }}
    >
      <Sparkles
        className="w-9 h-9 mx-auto mb-3"
        style={{ color: "var(--mq-text-muted)", opacity: 0.3 }}
      />
      <p
        className="text-sm font-medium mb-1"
        style={{ color: "var(--mq-text)" }}
      >
        {msg.title}
      </p>
      <p
        className="text-xs mb-4 px-4"
        style={{ color: "var(--mq-text-muted)" }}
      >
        {msg.desc}
      </p>
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-full text-xs font-semibold transition-colors"
        style={{
          backgroundColor: "var(--mq-accent)",
          color: "#fff",
          boxShadow: "var(--mq-shadow-accent)",
        }}
      >
        Повторить
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// ARTIST CIRCLE CARD
// ═════════════════════════════════════════════════════════════════════════

function ArtistCircleCard({
  artist,
  index,
  onClick,
  animationsEnabled,
}: {
  artist: { username: string; avatar?: string; trackCount?: number };
  index: number;
  onClick: () => void;
  animationsEnabled: boolean;
}) {
  return (
    <motion.button
      initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="text-left cursor-pointer group flex flex-col items-center"
    >
      <div
        className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden mb-2"
        style={{ boxShadow: "var(--mq-shadow-premium-md)" }}
      >
        {artist.avatar ? (
          <img src={artist.avatar} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}>
            <User className="w-8 h-8" style={{ color: "#fff" }} />
          </div>
        )}
      </div>
      <p className="text-xs sm:text-sm font-semibold truncate w-full text-center" style={{ color: "var(--mq-text)" }}>{artist.username}</p>
      {artist.trackCount !== undefined && (
        <p className="text-[10px] truncate w-full text-center" style={{ color: "var(--mq-text-muted)" }}>
          {artist.trackCount} {pluralRu(artist.trackCount, "трек", "трека", "треков")}
        </p>
      )}
    </motion.button>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// CURATED PLAYLIST CARD
// ═════════════════════════════════════════════════════════════════════════

function CuratedPlaylistCard({
  playlist: pl,
  index,
  onPlay,
  animationsEnabled,
}: {
  playlist: CuratedPlaylist;
  index: number;
  onPlay: () => void;
  animationsEnabled: boolean;
}) {
  return (
    <motion.button
      initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.97 }}
      onClick={onPlay}
      className="text-left cursor-pointer group rounded-2xl overflow-hidden w-full"
      style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border-hairline)", boxShadow: "var(--mq-shadow-premium-md)" }}
    >
      <div className="relative aspect-square overflow-hidden">
        <PlaylistArtwork playlistId={pl.id} size={200} rounded="rounded-none" className="!w-full !h-full group-hover:scale-105 transition-transform duration-500" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300" />
        {pl.tracks.length > 0 && (
          <div
            className="absolute bottom-2 right-2 w-11 h-11 sm:w-10 sm:h-10 rounded-full flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 sm:scale-90 sm:group-hover:scale-100 sm:translate-y-2 sm:group-hover:translate-y-0"
            style={{ backgroundColor: "var(--mq-accent)", boxShadow: "0 4px 16px color-mix(in srgb, var(--mq-accent) 40%, transparent)" }}
          >
            <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-[13px] sm:text-sm font-semibold truncate leading-tight" style={{ color: "var(--mq-text)" }}>{pl.name}</p>
        <p className="text-[11px] sm:text-xs mt-0.5 truncate" style={{ color: "var(--mq-text-muted)" }}>{pl.subtitle}</p>
        <p className="text-[10px] mt-1.5 uppercase tracking-wider font-semibold" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
          {pl.tracks.length} {pluralRu(pl.tracks.length, "трек", "трека", "треков")}
        </p>
      </div>
    </motion.button>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// WAVE CARD — preserved from previous version
// ═════════════════════════════════════════════════════════════════════════

function WaveCard({
  isMobile,
  currentTrack,
  isPlaying,
  radioMode,
  progress,
  duration,
  waveLoading,
  waveError,
  onStartWave,
  onPauseWave,
  onSkip,
  onDislike,
  onLike,
  topGenres,
}: {
  isMobile: boolean;
  currentTrack: Track | null;
  isPlaying: boolean;
  radioMode: boolean;
  progress: number;
  duration: number;
  waveLoading: boolean;
  waveError: string | null;
  onStartWave: () => void;
  onPauseWave: () => void;
  onSkip: () => void;
  onDislike: () => void;
  onLike: () => void;
  topGenres: string[];
}) {
  return (
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
            /* Mobile Active Wave */
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
                onClick={onPauseWave}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(16px) saturate(180%)", WebkitBackdropFilter: "blur(16px) saturate(180%)", border: "1px solid var(--mq-border-medium)", color: "rgba(255,255,255,0.9)", boxShadow: "var(--mq-shadow-card)" }}>
                {isPlaying ? <Pause className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" /> : <Play className="w-5 h-5 sm:w-6 sm:h-6 ml-0.5" fill="currentColor" />}
              </motion.button>
              <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.06 }}
                onClick={onSkip}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)" }}>
                <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" />
              </motion.button>
              <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.06 }}
                onClick={onDislike}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
                <ThumbsDown className="w-4 h-4 sm:w-5 sm:h-5" />
              </motion.button>
            </div>
          ) : (
            /* Desktop Active Wave */
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
                  onClick={onPauseWave}
                  className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.95)", color: "#1a1a2e", boxShadow: "var(--mq-shadow-card-hover)" }}>
                  {isPlaying ? <Pause className="w-6 h-6" fill="currentColor" /> : <Play className="w-6 h-6 ml-0.5" fill="currentColor" />}
                </motion.button>
                <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.08 }}
                  onClick={onSkip}
                  className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)" }}>
                  <SkipForward className="w-5 h-5" fill="currentColor" />
                </motion.button>
                <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.08 }}
                  onClick={onDislike}
                  className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
                  <ThumbsDown className="w-5 h-5" />
                </motion.button>
              </div>
            </div>
          )
        ) : (
          isMobile ? (
            /* Mobile Inactive Wave */
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Waves className="w-5 h-5" style={{ color: "rgba(255,255,255,0.8)" }} />
                  <h3 className="text-lg sm:text-xl font-bold" style={{ color: "#fff", letterSpacing: "-0.02em" }}>Волна</h3>
                </div>
                <p className="text-[13px] sm:text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>Бесконечный поток музыки для вас</p>
                {topGenres.length > 0 && (
                  <div className="flex gap-1.5 mt-2 overflow-hidden">
                    {topGenres.slice(0, 3).map((genre) => (
                      <span key={genre} className="text-[11px] px-2.5 py-0.5 rounded-full whitespace-nowrap font-medium"
                        style={{ backgroundColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)", border: "1px solid var(--mq-border-medium)" }}>
                        {displayGenre(genre)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.06 }}
                onClick={onStartWave} disabled={waveLoading}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.9)", color: "var(--mq-bg)", boxShadow: "var(--mq-shadow-accent)" }}>
                {waveLoading ? (
                  <div className="mq-spin w-5 h-5 border-2 rounded-full" style={{ borderColor: "var(--mq-bg)", borderTopColor: "transparent" }} />
                ) : (
                  <Play className="w-5 h-5 sm:w-6 sm:h-6 ml-0.5" fill="currentColor" />
                )}
              </motion.button>
            </div>
          ) : (
            /* Desktop Inactive Wave */
            <div className="flex items-center gap-5 flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Waves className="w-6 h-6" style={{ color: "rgba(255,255,255,0.9)" }} />
                  <h3 className="text-xl font-bold" style={{ color: "#fff", letterSpacing: "-0.02em" }}>Волна</h3>
                </div>
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>Бесконечный поток музыки для вас</p>
                {topGenres.length > 0 && (
                  <div className="flex gap-1.5 mt-2 overflow-hidden">
                    {topGenres.slice(0, 3).map((genre) => (
                      <span key={genre} className="text-[11px] px-2.5 py-0.5 rounded-full whitespace-nowrap font-medium"
                        style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)", border: "1px solid var(--mq-border-medium)" }}>
                        {displayGenre(genre)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.08 }}
                onClick={onStartWave} disabled={waveLoading}
                className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.95)", color: "#1a1a2e", boxShadow: "var(--mq-shadow-card-hover)" }}>
                {waveLoading ? (
                  <div className="mq-spin w-6 h-6 border-2 rounded-full" style={{ borderColor: "#1a1a2e", borderTopColor: "transparent" }} />
                ) : (
                  <Play className="w-6 h-6 ml-0.5" fill="currentColor" />
                )}
              </motion.button>
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// EQUALIZER ICON (for currently playing)
// ═════════════════════════════════════════════════════════════════════════

function EqualizerIcon() {
  return (
    <div className="w-3.5 h-3.5 flex items-end justify-center gap-[2px]">
      {[0, 1, 2, 3].map(i => (
        <span key={i} className="mq-eq-bar w-[2px] rounded-full" style={{ backgroundColor: "var(--mq-accent)", height: "100%", animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  );
}

// ─── Country detection ────────────────────────────────────────────────────

function detectUserCountry(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    // Map common timezones to country codes
    const tzMap: Record<string, string> = {
      "Europe/Moscow": "RU",
      "Europe/Kaliningrad": "RU",
      "Europe/Samara": "RU",
      "Europe/Yekaterinburg": "RU",
      "Europe/Omsk": "RU",
      "Europe/Novosibirsk": "RU",
      "Europe/Krasnoyarsk": "RU",
      "Europe/Irkutsk": "RU",
      "Asia/Yakutsk": "RU",
      "Asia/Vladivostok": "RU",
      "Asia/Magadan": "RU",
      "Asia/Kamchatka": "RU",
      "Asia/Anadyr": "RU",
      "Asia/Yekaterinburg": "RU",
      "Europe/Kiev": "UA",
      "Europe/Kyiv": "UA",
      "Europe/Minsk": "BY",
      "Asia/Almaty": "KZ",
      "Asia/Tashkent": "UZ",
      "Europe/London": "GB",
      "Europe/Berlin": "DE",
      "Europe/Paris": "FR",
      "Europe/Madrid": "ES",
      "Europe/Rome": "IT",
      "Europe/Amsterdam": "NL",
      "Europe/Stockholm": "SE",
      "Europe/Oslo": "NO",
      "Europe/Copenhagen": "DK",
      "Europe/Warsaw": "PL",
      "Europe/Prague": "CZ",
      "Europe/Vienna": "AT",
      "Europe/Zurich": "CH",
      "Europe/Brussels": "BE",
      "America/New_York": "US",
      "America/Chicago": "US",
      "America/Denver": "US",
      "America/Los_Angeles": "US",
      "America/Toronto": "CA",
      "America/Vancouver": "CA",
      "America/Mexico_City": "MX",
            "America/Sao_Paulo": "BR",
      "America/Argentina/Buenos_Aires": "AR",
      "Asia/Tokyo": "JP",
      "Asia/Seoul": "KR",
      "Asia/Shanghai": "CN",
      "Asia/Hong_Kong": "HK",
      "Asia/Singapore": "SG",
      "Asia/Kolkata": "IN",
      "Asia/Bangkok": "TH",
      "Asia/Dubai": "AE",
      "Asia/Tel_Aviv": "IL",
      "Australia/Sydney": "AU",
      "Australia/Melbourne": "AU",
      "Pacific/Auckland": "NZ",
    };
    return tzMap[tz] || "RU"; // Default to Russia
  } catch {
    return "RU";
  }
}

function countryNameFromCode(code: string): string {
  const names: Record<string, string> = {
    RU: "России", UA: "Украины", BY: "Беларуси", KZ: "Казахстана",
    US: "США", GB: "Британии", DE: "Германии", FR: "Франции",
    ES: "Испании", IT: "Италии", NL: "Нидерландов", SE: "Швеции",
    NO: "Норвегии", DK: "Дании", PL: "Польши", CZ: "Чехии",
    AT: "Австрии", CH: "Швейцарии", BE: "Бельгии", CA: "Канады",
    MX: "Мексики", BR: "Бразилии", AR: "Аргентины",
    JP: "Японии", KR: "Кореи", CN: "Китая", HK: "Гонконга",
    SG: "Сингапура", IN: "Индии", TH: "Таиланда", AE: "ОАЭ",
    IL: "Израиля", AU: "Австралии", NZ: "Новой Зеландии",
    UZ: "Узбекистана",
  };
  return names[code] || code;
}

export default memo(MainView);
