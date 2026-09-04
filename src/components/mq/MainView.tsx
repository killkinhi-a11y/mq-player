"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, Music, Heart, Clock, ListMusic, MessageCircle,
  Plus, Sparkles, Waves, User, Flame,
  SkipForward, ThumbsDown, TrendingUp, Compass, RotateCcw,
  MoreHorizontal, X, Shuffle,
} from "lucide-react";
import { useWaveEngine } from "@/hooks/useWaveEngine";
import { useFriendsListening } from "@/hooks/useFriendsListening";
import { useRecUpdates } from "@/hooks/useRecUpdates";
import { type Track, formatDuration } from "@/lib/musicApi";
import { extractTasteProfile, displayGenre } from "@/lib/tasteProfile";
import { useIsMobile } from "@/hooks/use-mobile";
import ScrollReveal from "./ScrollReveal";
import ArtistDetailView from "./ArtistDetailView";
import PlaylistArtwork from "./PlaylistArtwork";
import ContextMenu from "./ContextMenu";
import { NowPlayingEqualizer } from "./NowPlayingEqualizer";
import { useMagnetic } from "@/hooks/useMagnetic";
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
  // Layered composition instead of a single flat diagonal:
  //   1. radial "light pool" top-left — the card reads as lit from a corner,
  //      giving depth without any asset or extra request;
  //   2. softer diagonal base wash;
  //   3. deep vignette toward bottom-right so content stays high-contrast.
  // (VLM audit: the previous single linear gradient looked "flat/cheap".)
  return [
    `radial-gradient(120% 150% at 16% 6%, color-mix(in srgb, var(--mq-accent) 36%, var(--mq-bg)) 0%, color-mix(in srgb, var(--mq-accent) 22%, var(--mq-bg)) 36%, transparent 64%)`,
    `linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 20%, var(--mq-bg)) 0%, color-mix(in srgb, var(--mq-accent) 10%, var(--mq-bg)) 52%, var(--mq-bg) 100%)`,
  ].join(", ");
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
  const progress = useAppStore((s) => s.progress);
  const contacts = useAppStore((s) => s.contacts);

  // ── Local state ──
  const [curatedPlaylists, setCuratedPlaylists] = useState<CuratedPlaylist[]>([]);
  const [recCategories, setRecCategories] = useState<RecCategory[]>([]);
  const [recLoading, setRecLoading] = useState(false);
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

        // allSettled instead of all: a single rejected fetch (offline flake,
        // one dead upstream) must not discard the other three responses —
        // partial content beats an error state.
        const [recSettled, trendingSettled, appleSettled, spotifySettled] =
          await Promise.allSettled([
            fetch(`/api/music/recommendations?${params}`),
            fetch(`/api/music/trending?limit=50`),
            fetch(`/api/music/apple-charts?country=${userCountry}`),
            fetch(`/api/music/spotify-charts?country=${userCountry}`),
          ]);
        const recRes = recSettled.status === "fulfilled" ? recSettled.value : null;
        const trendingRes = trendingSettled.status === "fulfilled" ? trendingSettled.value : null;
        const appleRes = appleSettled.status === "fulfilled" ? appleSettled.value : null;
        const spotifyRes = spotifySettled.status === "fulfilled" ? spotifySettled.value : null;

        const cats: RecCategory[] = [];

        // Add Spotify Top as first category ("Топ Spotify")
        if (spotifyRes?.ok) {
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
        if (appleRes?.ok) {
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
        if (trendingRes?.ok) {
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
        if (recRes?.ok) {
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
        if (cats.length === 0 && trendingRes?.ok) {
          const tData = await trendingRes.json();
          const fallback = (tData.tracks || []).filter((t: Track) => !disliked.includes(t.id)).slice(0, 50);
          if (fallback.length > 0) {
            cats.push({ id: "fallback", title: "Для вас", icon: "Sparkles", tracks: fallback });
          }
        }

        if (!cancelled) {
          setRecCategories(cats);
          if (cats.length > 0) {
            setRecError(null);
          } else {
            // Distinguish total network failure (all fetches rejected) from
            // "providers answered but returned nothing" for accurate messaging.
            const anyResponded = !!(recRes || trendingRes || appleRes || spotifyRes);
            setRecError(anyResponded ? "empty" : "offline");
          }
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
  // Used as the play context when user taps a rec card, so playback
  // continues across categories instead of being limited to one strip.
  const allRecTracks = useMemo(() => {
    const seen = new Set<string>();
    const result: Track[] = [];
    for (const cat of recCategories) {
      for (const t of cat.tracks) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        result.push(t);
      }
    }
    return result;
  }, [recCategories]);

  // ── Phase O composition: split categories into PERSONAL vs CHARTS and ──
  // pick ONE featured track (currently playing if it's a recommendation,
  // otherwise the strongest personal pick). No fake data: if there are no
  // recommendations, there is no featured block.
  const personalCategories = useMemo(() => {
    return recCategories.filter((c) => !["apple_top", "spotify_top", "trending_now"].includes(c.id));
  }, [recCategories]);

  const chartCategories = useMemo(() => {
    return recCategories.filter((c) => ["apple_top", "spotify_top", "trending_now"].includes(c.id));
  }, [recCategories]);

  const featuredTrack = useMemo(() => {
    if (currentTrack && allRecTracks.some((t) => t.id === currentTrack.id)) return currentTrack;
    // Real data priority: personal pick → chart top → trending top.
    const personal = personalCategories.find((c) => c.tracks.length > 0);
    const chart = chartCategories.find((c) => c.tracks.length > 0);
    return personal?.tracks[0] ?? chart?.tracks[0] ?? null;
  }, [currentTrack, allRecTracks, personalCategories, chartCategories]);

  const featuredReason = useMemo(() => {
    if (!featuredTrack) return "";
    if (currentTrack?.id === featuredTrack.id) return "Сейчас играет";
    const cat = recCategories.find((c) => c.tracks.some((t) => t.id === featuredTrack.id));
    return cat ? reasonForRec(cat.id) : "Подобрано для тебя";
  }, [featuredTrack, currentTrack, recCategories]);


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
    if (allRecTracks.length === 0) return;
    playTrack(track, allRecTracks);
  }, [allRecTracks, playTrack, togglePlay]);

  // ── Wave controls (from useWaveEngine hook) ──
  // Visual WaveCard component handles all rendering; this hook provides logic.

  // ── Artist navigation ──
  const handleNavigateToArtist = useCallback((artist: string) => {
    if (!artist) return;
    setSelectedArtist({ name: artist });
  }, [setSelectedArtist]);

  // ── Pull-to-refresh (mobile only) ──
  // Touch-based: user pulls down at scrollTop=0 → triggers handleRetryRecs.
  // Desktop scrolling doesn't engage (uses touch events only).
  // NOTE: these hooks MUST stay ABOVE the `if (selectedArtist) return …`
  // early return below — calling hooks after a conditional return breaks
  // the hooks invariant (React "Rendered fewer hooks than expected" crash
  // when navigating back from the artist detail view).
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

  // ── Artist detail (early return AFTER all hooks — see note above) ──
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
      {/* HEADER — compact greeting + discovery line (restructured: the     */}
      {/* old serif hero shrank into a single quiet row; the screen now     */}
      {/* belongs to real content, not typography).                          */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0}>
        <header className="mb-5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="mq-t-meta text-[11px] uppercase tracking-[0.14em] mb-1" style={{ color: "var(--mq-text-muted)" }}>
              {currentDate()}
            </p>
            <h1 className="mq-t-title text-2xl sm:text-3xl lg:text-[2rem] truncate" style={{ color: "var(--mq-text)" }}>
              {greeting()}
            </h1>
            <p className="mq-t-meta text-xs mt-1.5 truncate" style={{ color: "var(--mq-text-muted)" }}>
              {listeningFriends.length > 0
                ? `${listeningFriends.length} ${pluralRu(listeningFriends.length, "друг слушает", "друга слушают", "друзей слушают")} музыку сейчас`
                : personalCategories.length > 0
                  ? "Новое собрали для тебя ниже"
                  : "Начни с Волны — она подберёт музыку под вкус"}
            </p>
          </div>
          {/* Compact wave pill — real radio state, replaces the giant card */}
          <button
            onClick={() => (wave.radioMode ? wave.pauseWave() : wave.startWave())}
            disabled={wave.waveLoading}
            className="shrink-0 flex items-center gap-2 rounded-full pl-3 pr-4 h-10 transition-all active:scale-95"
            style={{
              backgroundColor: wave.radioMode
                ? "color-mix(in srgb, var(--mq-accent) 16%, transparent)"
                : "var(--mq-card)",
              border: `1px solid ${wave.radioMode ? "color-mix(in srgb, var(--mq-accent) 40%, transparent)" : "var(--mq-border-thin)"}`,
            }}
            aria-label={wave.radioMode ? "Пауза Волны" : "Запустить Волну"}
          >
            {wave.waveLoading ? (
              <div className="mq-spin w-4 h-4 border-2 rounded-full" style={{ borderColor: "var(--mq-accent)", borderTopColor: "transparent" }} />
            ) : (
              <Waves className="w-4 h-4" style={{ color: wave.radioMode ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
            )}
            <span className="mq-t-label text-xs" style={{ color: wave.radioMode ? "var(--mq-accent)" : "var(--mq-text)" }}>
              {wave.waveLoading ? "Подбираем…" : wave.radioMode ? "Волна · играет" : "Волна"}
            </span>
          </button>
        </header>
      </ScrollReveal>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* FEATURED — one dominant content block (new). Real data: the top   */}
      {/* personal recommendation or the currently playing track. No glow,   */}
      {/* no decorative blur — flat split card with a hard accent edge.      */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {featuredTrack && (
        <ScrollReveal direction="up" delay={0.02}>
          <FeaturedCard
            track={featuredTrack}
            reason={featuredReason}
            isCurrent={currentTrack?.id === featuredTrack.id}
            isPlaying={isPlaying && currentTrack?.id === featuredTrack.id}
            onPlay={() => handlePlayRec(featuredTrack)}
            onArtistClick={() => handleNavigateToArtist(featuredTrack.artist)}
            animationsEnabled={animationsEnabled}
          />
        </ScrollReveal>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* CONTINUE LISTENING + QUICK ACTIONS — two-column band (new). Left:  */}
      {/* real current track with progress; right: dense action grid.        */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.04}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 mb-7">
          <ContinueListeningCard
            track={currentTrack}
            progress={progress}
            duration={duration}
            isPlaying={isPlaying}
            radioMode={radioMode}
            onToggle={togglePlay}
            onSkip={() => wave.skipTrack()}
          />
          <QuickActionGrid
            likedCount={likedTrackIds.length}
            historyCount={history.length}
            playlistCount={playlists.length}
            chatCount={contacts.length}
            onFavorites={() => setView("favorites")}
            onHistory={() => setView("history")}
            onPlaylists={() => setView("playlists")}
            onMessenger={() => setView("messenger")}
          />
        </div>
      </ScrollReveal>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* PERSONALIZED FOR YOU — horizontal discovery (restructured): the    */}
      {/* first category renders as horizontal track ROWS (new rhythm), the  */}
      {/* rest as compact square cards. Real recommendations only.           */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {personalCategories.length > 0 && (
        <Section title="Для вас" icon={Sparkles} action={<span className="mq-t-meta text-[11px]" style={{ color: "var(--mq-text-muted)" }}>по твоей истории и лайкам</span>}>
          {personalCategories.slice(0, 1).map((cat) => (
            <div key={cat.id} className="flex flex-col gap-2 mb-5">
              {cat.tracks.slice(0, 4).map((track, i) => (
                <HorizontalTrackRow
                  key={track.id + "_" + i}
                  track={track}
                  isCurrent={currentTrack?.id === track.id}
                  isPlaying={isPlaying && currentTrack?.id === track.id}
                  onPlay={() => handlePlayRec(track)}
                  onArtistClick={() => handleNavigateToArtist(track.artist)}
                />
              ))}
            </div>
          ))}
          {personalCategories.slice(1).map((cat) => (
            <div key={cat.id} className="mb-5">
              <div className="flex items-center gap-2 mb-2.5">
                {(() => {
                  const CatIcon = iconForRec(cat.id);
                  return <CatIcon className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />;
                })()}
                <h3 className="mq-t-label text-[13px]" style={{ color: "var(--mq-text)" }}>
                  {cat.title}
                </h3>
                <span className="mq-t-meta text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                  {reasonForRec(cat.id)}
                </span>
              </div>
              <HScroll className="flex gap-3 overflow-x-auto scrollbar-none -mx-3 px-3 lg:mx-0 lg:px-0 pb-1">
                {cat.tracks.slice(0, 12).map((track, i) => (
                  <CompactTrackCard
                    key={track.id + "_" + i}
                    track={track}
                    isCurrent={currentTrack?.id === track.id}
                    isPlaying={isPlaying && currentTrack?.id === track.id}
                    onPlay={() => handlePlayRec(track)}
                    onArtistClick={() => handleNavigateToArtist(track.artist)}
                  />
                ))}
              </HScroll>
            </div>
          ))}
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
      {/* RECENTLY PLAYED — horizontal compact row (was a 5-column grid).    */}
      {/* Real listening history only; hidden entirely when empty.           */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {recentTracks.length > 0 && (
        <Section
          title="Недавно"
          icon={Clock}
          action={
            <button onClick={() => setView("history")} className="mq-t-label text-xs" style={{ color: "var(--mq-accent)" }}>
              Все
            </button>
          }
        >
          <HScroll className="flex gap-3 overflow-x-auto scrollbar-none -mx-3 px-3 lg:mx-0 lg:px-0 pb-1">
            {recentTracks.slice(0, 10).map((track, i) => (
              <CompactTrackCard
                key={track.id + "_" + i}
                track={track}
                isCurrent={currentTrack?.id === track.id}
                isPlaying={isPlaying && currentTrack?.id === track.id}
                onPlay={() => {
                  if (currentTrack?.id === track.id) { togglePlay(); return; }
                  playTrack(track, recentTracks);
                }}
                onArtistClick={() => handleNavigateToArtist(track.artist)}
              />
            ))}
          </HScroll>
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* NEW / TRENDING — numbered chart rows (new): real trending +        */}
      {/* Apple/Spotify chart data, presented as a ranked list.              */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {chartCategories.length > 0 && (
        <Section title="Новое и в тренде" icon={Flame} action={<span className="mq-t-meta text-[11px]" style={{ color: "var(--mq-text-muted)" }}>обновляется каждый час</span>}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-1.5">
            {chartCategories.flatMap((cat) =>
              cat.tracks.slice(0, 5).map((track, i) => (
                <ChartRow
                  key={cat.id + "_" + track.id + "_" + i}
                  rank={i + 1}
                  track={track}
                  isCurrent={currentTrack?.id === track.id}
                  isPlaying={isPlaying && currentTrack?.id === track.id}
                  onPlay={() => handlePlayRec(track)}
                  onArtistClick={() => handleNavigateToArtist(track.artist)}
                />
              ))
            ).slice(0, 10)}
          </div>
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* FRIENDS LISTENING NOW — social widget (below the fold now)         */}
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
                    <p className="mq-t-label text-xs truncate" style={{ color: "var(--mq-text)" }}>
                      {f.username}
                    </p>
                    <div className="flex items-center gap-1">
                      {f.isPlaying && (
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--mq-accent)" }} />
                      )}
                      <span className="mq-t-meta text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
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
                    <p className="mq-t-body text-xs truncate" style={{ color: "var(--mq-text)" }}>
                      {f.trackTitle}
                    </p>
                    <p className="mq-t-meta text-[11px] truncate" style={{ color: "var(--mq-text-muted)" }}>
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
      {/* PLAYLISTS — user's playlists grid (moved below the fold)           */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <Section
        title="Плейлисты"
        icon={ListMusic}
        action={
          playlists.length > 0 ? (
            <button onClick={() => setView("playlists")} className="mq-t-label text-xs" style={{ color: "var(--mq-accent)" }}>
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
            className="w-full rounded-2xl p-5 flex items-center gap-4 transition-all hover:bg-white/[0.02] text-left"
            style={{ backgroundColor: "var(--mq-card)", border: "1px dashed var(--mq-border-thin)" }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}>
              <Plus className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="mq-t-body text-sm" style={{ color: "var(--mq-text)" }}>Новый плейлист</p>
              <p className="mq-t-meta text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>Собери своё</p>
            </div>
            {recentTracks.length > 0 && (
              <div className="flex -space-x-2 flex-shrink-0">
                {recentTracks.slice(0, 3).map((t, i) => t?.cover ? (
                  <img
                    key={t.id + "_" + i}
                    src={t.cover}
                    alt=""
                    className="w-8 h-8 rounded-md object-cover"
                    style={{ border: "2px solid var(--mq-card)" }}
                    loading="lazy"
                  />
                ) : null)}
              </div>
            )}
          </button>
        )}
      </Section>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* FAVORITE ARTISTS (below the fold)                                   */}
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
      {/* CURATED PLAYLISTS (below the fold)                                  */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {curatedPlaylists.length > 0 && (
        <Section title="Подборки редакции" icon={Sparkles}>
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
// PHASE O HOME — new card components
//
// Five card types, used where each genuinely fits (§3.5):
//   FeaturedCard         — one dominant block for the featured track
//   ContinueListeningCard— current track + real progress
//   QuickActionGrid      — dense navigation with real counts
//   HorizontalTrackRow   — wide row card (personal picks)
//   CompactTrackCard     — small square card (discovery rows, recent)
//   ChartRow             — numbered ranked row (trending / charts)
// No glow, no decorative blur, no fake metrics. All states real.
// ═════════════════════════════════════════════════════════════════════════

function FeaturedCard({
  track,
  reason,
  isCurrent,
  isPlaying,
  onPlay,
  onArtistClick,
  animationsEnabled,
}: {
  track: Track;
  reason: string;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onArtistClick: () => void;
  animationsEnabled: boolean;
}) {
  return (
    <article
      className="relative rounded-2xl overflow-hidden mb-6"
      style={{
        backgroundColor: "var(--mq-card)",
        border: "1px solid var(--mq-border-hairline)",
        // Hard accent edge on the left — structure, not glow.
        borderLeft: "3px solid var(--mq-accent)",
      }}
      aria-label={`Рекомендованный трек: ${track.title}`}
    >
      <div className="flex flex-col sm:flex-row">
        {/* Artwork — 40% on desktop, full-width 16:9 crop on mobile */}
        <button
          onClick={onPlay}
          className="relative sm:w-[42%] lg:w-[40%] aspect-square sm:aspect-auto sm:min-h-[220px] overflow-hidden shrink-0 group"
          aria-label={isPlaying ? "Пауза" : "Слушать"}
        >
          {track.cover ? (
            <img
              src={track.cover}
              alt=""
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              loading="eager"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 14%, var(--mq-bg))" }}>
              <Music className="w-10 h-10" style={{ color: "var(--mq-text-muted)" }} />
            </div>
          )}
          {isPlaying && (
            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
              <NowPlayingEqualizer />
              <span className="mq-t-meta text-[11px]" style={{ color: "#fff" }}>играет</span>
            </div>
          )}
        </button>

        {/* Info + actions */}
        <div className="flex-1 min-w-0 p-4 sm:p-5 lg:p-6 flex flex-col justify-center gap-3">
          <div>
            <p className="mq-t-label text-[11px] uppercase tracking-[0.12em] mb-1.5" style={{ color: "var(--mq-accent)" }}>
              {reason}
            </p>
            <h2 className="mq-t-display text-xl sm:text-2xl lg:text-[1.75rem] line-clamp-2" style={{ color: "var(--mq-text)" }}>
              {track.title}
            </h2>
            <button
              onClick={onArtistClick}
              className="mq-t-body text-sm mt-1 hover:underline text-left"
              style={{ color: "var(--mq-text-muted)" }}
            >
              {track.artist}
            </button>
          </div>

          {/* Metadata — real fields only */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {track.duration > 0 && (
              <span className="mq-t-num text-[11px] flex items-center gap-1" style={{ color: "var(--mq-text-muted)" }}>
                <Clock className="w-3 h-3" />{formatDuration(track.duration)}
              </span>
            )}
            {track.genre && (
              <span className="mq-t-meta text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 10%, transparent)", color: "var(--mq-text-muted)" }}>
                {displayGenre(track.genre)}
              </span>
            )}
            <span className="mq-t-meta text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
              {track.source === "soundcloud" ? "SoundCloud" : track.source === "audius" ? "Audius" : "mq"}
            </span>
          </div>

          {/* Primary + secondary actions */}
          <div className="flex items-center gap-2.5 mt-1">
            <motion.button
              whileTap={animationsEnabled ? { scale: 0.96 } : undefined}
              onClick={onPlay}
              className="h-11 px-6 rounded-xl flex items-center gap-2 font-semibold text-sm transition-colors"
              style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text-on-accent, #fff)" }}
              aria-label={isPlaying ? "Пауза" : "Слушать"}
            >
              {isPlaying ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4" fill="currentColor" />}
              {isCurrent ? (isPlaying ? "Пауза" : "Продолжить") : "Слушать"}
            </motion.button>
            <button
              onClick={onArtistClick}
              className="h-11 px-4 rounded-xl flex items-center gap-2 text-sm transition-colors"
              style={{ backgroundColor: "var(--mq-bg)", border: "1px solid var(--mq-border-thin)", color: "var(--mq-text)" }}
            >
              <User className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
              К артисту
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function ContinueListeningCard({
  track,
  progress,
  duration,
  isPlaying,
  radioMode,
  onToggle,
  onSkip,
}: {
  track: Track | null;
  progress: number;
  duration: number;
  isPlaying: boolean;
  radioMode: boolean;
  onToggle: () => void;
  onSkip: () => void;
}) {
  const pct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  // Honest empty state — no fake "continue" content.
  if (!track) {
    return (
      <div
        className="rounded-2xl p-4 sm:p-5 flex items-center gap-4"
        style={{ backgroundColor: "var(--mq-card)", border: "1px dashed var(--mq-border-thin)" }}
      >
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 10%, transparent)" }}>
          <Play className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
        </div>
        <div className="min-w-0">
          <p className="mq-t-label text-sm" style={{ color: "var(--mq-text)" }}>Продолжить прослушивание</p>
          <p className="mq-t-meta text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
            Пока пусто — включи трек, и он появится здесь
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl p-4 sm:p-5 flex items-center gap-4"
      style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border-hairline)" }}
    >
      <button
        onClick={onToggle}
        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform active:scale-95"
        style={{ backgroundColor: "var(--mq-accent)" }}
        aria-label={isPlaying ? "Пауза" : "Продолжить"}
      >
        {isPlaying ? (
          <Pause className="w-5 h-5" fill="var(--mq-text-on-accent, #fff)" style={{ color: "var(--mq-text-on-accent, #fff)" }} />
        ) : (
          <Play className="w-5 h-5" fill="var(--mq-text-on-accent, #fff)" style={{ color: "var(--mq-text-on-accent, #fff)" }} />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="mq-t-label text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--mq-text-muted)" }}>
            Продолжить
          </p>
          {radioMode && (
            <span className="mq-t-meta text-[11px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 14%, transparent)", color: "var(--mq-accent)" }}>
              Волна
            </span>
          )}
        </div>
        <p className="mq-t-body text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>
          {track.title}
        </p>
        <p className="mq-t-meta text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
          {track.artist}
        </p>
        {/* Real progress bar */}
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--mq-border-thin)" }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "var(--mq-accent)" }} />
          </div>
          <span className="mq-t-num text-[11px] shrink-0" style={{ color: "var(--mq-text-muted)" }}>
            {formatDuration(progress)} / {formatDuration(duration)}
          </span>
        </div>
      </div>
      {radioMode && (
        <button
          onClick={onSkip}
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors hover:bg-white/[0.04]"
          style={{ border: "1px solid var(--mq-border-thin)" }}
          aria-label="Следующий в Волне"
        >
          <SkipForward className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
        </button>
      )}
    </div>
  );
}

function QuickActionGrid({
  likedCount,
  historyCount,
  playlistCount,
  chatCount,
  onFavorites,
  onHistory,
  onPlaylists,
  onMessenger,
}: {
  likedCount: number;
  historyCount: number;
  playlistCount: number;
  chatCount: number;
  onFavorites: () => void;
  onHistory: () => void;
  onPlaylists: () => void;
  onMessenger: () => void;
}) {
  const items = [
    { icon: Heart, label: "Избранное", count: likedCount, onClick: onFavorites, accent: "#ef4444" },
    { icon: Clock, label: "История", count: historyCount, onClick: onHistory, accent: "var(--mq-accent)" },
    { icon: ListMusic, label: "Плейлисты", count: playlistCount, onClick: onPlaylists, accent: "#8b5cf6" },
    { icon: MessageCircle, label: "Чаты", count: chatCount, onClick: onMessenger, accent: "#06b6d4" },
  ];
  return (
    <div
      className="grid grid-cols-4 lg:grid-cols-2 gap-2 rounded-2xl p-2"
      style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border-hairline)" }}
      role="group"
      aria-label="Быстрые переходы"
    >
      {items.map(({ icon: Icon, label, count, onClick, accent }) => (
        <button
          key={label}
          onClick={onClick}
          className="flex flex-col lg:flex-row items-center justify-center lg:justify-start gap-1 lg:gap-2.5 rounded-xl px-2 py-2.5 lg:px-3 transition-colors hover:bg-white/[0.03]"
        >
          <Icon className="w-4 h-4 shrink-0" style={{ color: accent }} />
          <span className="mq-t-label text-[11px] leading-none" style={{ color: "var(--mq-text)" }}>{label}</span>
          <span className="mq-t-num text-[11px] leading-none" style={{ color: "var(--mq-text-muted)" }}>
            {count > 0 ? count : "—"}
          </span>
        </button>
      ))}
    </div>
  );
}

function HorizontalTrackRow({
  track,
  isCurrent,
  isPlaying,
  onPlay,
  onArtistClick,
}: {
  track: Track;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onArtistClick: () => void;
}) {
  return (
    <div
      className="group flex items-center gap-3 rounded-xl p-2 pr-3 transition-colors hover:bg-white/[0.03] cursor-pointer"
      style={{ backgroundColor: isCurrent ? "color-mix(in srgb, var(--mq-accent) 7%, transparent)" : "var(--mq-card)" }}
      onClick={onPlay}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPlay(); } }}
      aria-label={`Играть ${track.title}`}
    >
      <div className="relative w-11 h-11 rounded-lg overflow-hidden shrink-0" style={{ backgroundColor: "var(--mq-bg)" }}>
        {track.cover ? (
          <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
          </div>
        )}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          {isPlaying ? <Pause className="w-4 h-4 text-white" fill="currentColor" /> : <Play className="w-4 h-4 text-white" fill="currentColor" />}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="mq-t-body text-[13px] font-semibold truncate" style={{ color: isCurrent ? "var(--mq-accent)" : "var(--mq-text)" }}>
          {track.title}
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); onArtistClick(); }}
          className="mq-t-meta text-xs truncate hover:underline"
          style={{ color: "var(--mq-text-muted)" }}
        >
          {track.artist}
        </button>
      </div>
      {isPlaying && <NowPlayingEqualizer />}
      {track.duration > 0 && (
        <span className="mq-t-num text-[11px] shrink-0" style={{ color: "var(--mq-text-muted)" }}>
          {formatDuration(track.duration)}
        </span>
      )}
    </div>
  );
}

function CompactTrackCard({
  track,
  isCurrent,
  isPlaying,
  onPlay,
  onArtistClick,
}: {
  track: Track;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onArtistClick: () => void;
}) {
  return (
    <button
      className="group flex-shrink-0 w-[124px] sm:w-[136px] text-left rounded-xl overflow-hidden transition-all hover:bg-white/[0.03]"
      style={{
        backgroundColor: "var(--mq-card)",
        border: `1px solid ${isCurrent ? "color-mix(in srgb, var(--mq-accent) 35%, transparent)" : "var(--mq-border-hairline)"}`,
      }}
      onClick={onPlay}
      aria-label={`Играть ${track.title}`}
    >
      <div className="relative w-full aspect-square" style={{ backgroundColor: "var(--mq-bg)" }}>
        {track.cover ? (
          <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-6 h-6" style={{ color: "var(--mq-text-muted)" }} />
          </div>
        )}
        <div
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
        >
          {isPlaying ? <Pause className="w-6 h-6 text-white" fill="currentColor" /> : <Play className="w-6 h-6 text-white" fill="currentColor" />}
        </div>
        {isCurrent && (
          <div className="absolute top-1.5 left-1.5" aria-hidden>
            <NowPlayingEqualizer />
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="mq-t-body text-xs font-semibold truncate" style={{ color: isCurrent ? "var(--mq-accent)" : "var(--mq-text)" }}>
          {track.title}
        </p>
        <span
          onClick={(e) => { e.stopPropagation(); onArtistClick(); }}
          className="mq-t-meta text-[11px] truncate block hover:underline"
          style={{ color: "var(--mq-text-muted)" }}
        >
          {track.artist}
        </span>
      </div>
    </button>
  );
}

function ChartRow({
  rank,
  track,
  isCurrent,
  isPlaying,
  onPlay,
  onArtistClick,
}: {
  rank: number;
  track: Track;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onArtistClick: () => void;
}) {
  const isTop = rank <= 3;
  return (
    <div
      className="group flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 transition-colors hover:bg-white/[0.03] cursor-pointer"
      onClick={onPlay}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPlay(); } }}
      aria-label={`№${rank}: играть ${track.title}`}
    >
      <span
        className="mq-t-num text-lg w-8 text-center shrink-0 select-none"
        style={{ color: isTop ? "var(--mq-accent)" : "var(--mq-text-muted)", fontWeight: isTop ? 700 : 500 }}
      >
        {rank}
      </span>
      <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0" style={{ backgroundColor: "var(--mq-bg)" }}>
        {track.cover ? (
          <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="mq-t-body text-[13px] font-semibold truncate" style={{ color: isCurrent ? "var(--mq-accent)" : "var(--mq-text)" }}>
          {track.title}
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); onArtistClick(); }}
          className="mq-t-meta text-xs truncate hover:underline"
          style={{ color: "var(--mq-text-muted)" }}
        >
          {track.artist}
        </button>
      </div>
      {isPlaying ? <NowPlayingEqualizer /> : (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Play className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} fill="currentColor" />
        </div>
      )}
    </div>
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
  cover,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  onClick: () => void;
  accent: string;
  cover?: string;
}) {
  // UX Core #1 (Эффект Ресторфф): Quick Stats приглушены чтобы Wave Card
  // визуально доминировала как единственный главный CTA на экране.
  // UX Core #14 (Эффект превосходства картинки): мини-обложка слева
  // запоминается лучше чем иконка + число.
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -3, boxShadow: `0 8px 24px color-mix(in srgb, ${accent} 15%, transparent)` }}
      onClick={onClick}
      className="rounded-xl p-2.5 sm:p-3 flex items-center gap-2.5 cursor-pointer transition-all"
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 8%, var(--mq-card)) 0%, var(--mq-card) 100%)`,
        border: "1px solid color-mix(in srgb, ${accent} 20%, var(--mq-border-hairline))",
      }}
    >
      <div
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg overflow-hidden flex-shrink-0 relative"
        style={{
          backgroundColor: `color-mix(in srgb, ${accent} 12%, transparent)`,
        }}
      >
        {cover ? (
          <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon className="w-4 h-4 sm:w-5 h-5" style={{ color: accent }} />
          </div>
        )}
        {/* Accent dot — subtle indicator of category color */}
        <span
          className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: accent, boxShadow: `0 0 4px ${accent}` }}
        />
      </div>
      <div className="min-w-0">
        {/* Empty-library state: a bare "0" reads like a broken counter to
            first-time users (VLM audit). An em-dash + reduced opacity reads
            as "nothing here yet" while keeping the chip useful navigation. */}
        <p
          className="text-sm sm:text-base font-bold leading-none"
          style={{ color: "var(--mq-text)", opacity: value > 0 ? 1 : 0.5 }}
        >
          {value > 0 ? value : "—"}
        </p>
        <p className="text-[11px] mt-1 truncate" style={{ color: "var(--mq-text-muted)" }}>{label}</p>
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
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-bold backdrop-blur-md flex items-center gap-1"
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
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-bold backdrop-blur-md flex items-center gap-1"
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
// REC HERO — featured track at the top of the "Для вас" section
// Uses the currently-playing track (if it's in recs) or the first track of
// the first category. Mirrors Spotify's "Featured" / Apple Music's hero card
// pattern with a blurred cover backdrop.
// ═════════════════════════════════════════════════════════════════════════

function RecHero({
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
      onClick={onPlay}
      className="relative rounded-3xl overflow-hidden mb-1 cursor-pointer group"
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

      {/* Content */}
      <div className="relative z-10 p-3 sm:p-5 flex items-center gap-3 sm:gap-5">
        {/* Cover */}
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
          {/* Hover play overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
            {isCurrent && isPlaying ? (
              <Pause className="w-7 h-7 sm:w-9 sm:h-9" fill="#fff" style={{ color: "#fff" }} />
            ) : (
              <Play className="w-7 h-7 sm:w-9 sm:h-9 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
            )}
          </div>
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
              className="text-[11px] font-bold uppercase tracking-widest"
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
                className="text-[11px] font-medium"
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
// REC STRIP — horizontal scroll of track cards for one category
// Replaces the old Hero+Tabs+List design with a simpler Spotify-home layout
// ═════════════════════════════════════════════════════════════════════════

function RecStrip({
  title, icon: Icon, tracks, reason, currentTrack, isPlaying, onPlay, onArtistClick, animationsEnabled,
}: {
  title: string;
  icon: React.ElementType;
  tracks: Track[];
  reason: string;
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlay: (track: Track) => void;
  onArtistClick: (artist: string) => void;
  animationsEnabled: boolean;
}) {
  if (tracks.length === 0) return null;
  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
        <h3 className="text-sm font-bold" style={{ color: "var(--mq-text)" }}>{title}</h3>
        <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--mq-border-thin)", color: "var(--mq-text-muted)" }}>
          {tracks.length}
        </span>
      </div>

      {/* Horizontal scroll of cards */}
      <HScroll className="flex gap-3 overflow-x-auto scrollbar-none -mx-3 px-3 lg:mx-0 lg:px-0 pb-1">
        {tracks.map((track, i) => (
          <RecCard
            key={track.id + "_" + i}
            track={track}
            index={i}
            reason={reason}
            isCurrent={currentTrack?.id === track.id}
            isPlaying={isPlaying && currentTrack?.id === track.id}
            onPlay={() => onPlay(track)}
            onArtistClick={() => onArtistClick(track.artist)}
            animationsEnabled={animationsEnabled}
          />
        ))}
      </HScroll>
    </div>
  );
}

// ─── RecCard — visual card (cover + title + artist) ───────────────────────

function RecCard({
  track, index, reason, isCurrent, isPlaying, onPlay, onArtistClick, animationsEnabled,
}: {
  track: Track;
  index: number;
  reason: string;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onArtistClick: () => void;
  animationsEnabled: boolean;
}) {
  return (
    <motion.div
      initial={animationsEnabled ? { opacity: 0, scale: 0.95 } : undefined}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.3 }}
      whileHover={{ y: -4 }}
      onClick={onPlay}
      className="flex-shrink-0 w-[140px] sm:w-[160px] cursor-pointer group"
    >
      {/* Cover */}
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
          <img src={track.cover} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}>
            <Music className="w-7 h-7" style={{ color: "rgba(255,255,255,0.5)" }} />
          </div>
        )}
        {/* Dark gradient — always visible on mobile (so play button stays readable), hover-only on desktop */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300" />
        {/* Play / pause button — visible on mobile, hover-only on desktop */}
        <div
          className="absolute bottom-2 right-2 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 translate-y-0 sm:translate-y-2 sm:opacity-0 sm:group-hover:opacity-100 sm:group-hover:translate-y-0"
          style={{ backgroundColor: "var(--mq-accent)", boxShadow: "0 4px 16px color-mix(in srgb, var(--mq-accent) 40%, transparent)" }}
        >
          {isCurrent && isPlaying ? (
            <Pause className="w-4 h-4" fill="#fff" style={{ color: "#fff" }} />
          ) : (
            <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
          )}
        </div>
        {isCurrent && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-bold backdrop-blur-md flex items-center gap-1" style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "var(--mq-accent)", border: "1px solid color-mix(in srgb, var(--mq-accent) 30%, transparent)" }}>
            {/* Animated equalizer bars when playing, static dot when paused */}
            {isPlaying ? (
              <NowPlayingEqualizer size="xs" variant="inline" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--mq-accent)" }} />
            )}
            ИГРАЕТ
          </div>
        )}
      </div>
      {/* Text */}
      <p className="text-[13px] font-semibold truncate leading-tight" style={{ color: isCurrent ? "var(--mq-accent)" : "var(--mq-text)" }}>
        {track.title}
      </p>
      <button onClick={(e) => { e.stopPropagation(); onArtistClick(); }} className="text-[11px] truncate hover:underline block w-full text-left mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
        {track.artist}
      </button>
      {reason && (
        <p className="text-[11px] truncate mt-1" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
          {reason}
        </p>
      )}
    </motion.div>
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
// RECS EMPTY STATE — when recommendations failed or returned nothing
// ═════════════════════════════════════════════════════════════════════════

function RecsEmptyState({ onRetry, errorType }: { onRetry: () => void; errorType?: "offline" | "api" | "empty" | null }) {
  const messages = {
    offline: {
      title: "Нет интернета",
      desc: "Проверьте подключение к сети",
    },
    api: {
      title: "Сервис недоступен",
      desc: "Попробуйте через минуту",
    },
    empty: {
      // UX Core #1 (Эвристика доступности): без императива "послушайте и
      // поставьте лайки" (долг). Позитивная формулировка снижает барьер.
      title: "Пока пусто",
      desc: "Запустите волну или лайкните трек — и здесь появятся похожие",
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
        <p className="text-[11px] truncate w-full text-center" style={{ color: "var(--mq-text-muted)" }}>
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
        <p className="text-[11px] mt-1.5 uppercase tracking-wider font-semibold" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
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
  onStopWave,
  onSkip,
  onDislike,
  onLike,
  isLiked,
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
  onStopWave: () => void;
  onSkip: () => void;
  onDislike: () => void;
  onLike: () => void;
  isLiked: boolean;
  topGenres: string[];
}) {
  const waveMagnetic = useMagnetic({ strength: 1, padding: 60 });
  return (
    <div
      className={isMobile ? "relative mb-8 rounded-3xl overflow-hidden" : "mq-hero-card relative mb-8"}
      ref={waveMagnetic.ref as React.RefObject<HTMLDivElement>}
      // react-hooks/refs false positive: useMagnetic handlers only read the
      // ref inside event callbacks — never during render.
      // eslint-disable-next-line react-hooks/refs
      onMouseMove={waveMagnetic.onMouseMove}
      // eslint-disable-next-line react-hooks/refs
      onMouseLeave={waveMagnetic.onMouseLeave}
      style={{
        background: isMobile
          ? (currentTrack?.cover
            ? `linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 20%, var(--mq-bg)), color-mix(in srgb, var(--mq-accent) 8%, var(--mq-bg)))`
            : getWaveGradient())
          : getWaveGradient(),
        minHeight: isMobile ? 140 : 160,
        boxShadow: "var(--mq-shadow-float)",
        willChange: "transform",
      }}
    >
      {/* Tip 4 (Depth & texture from video): subtle noise overlay on the
          star element. Pure CSS via SVG turbulence filter — no image asset,
          no extra request. 4% opacity keeps it from competing with content. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.04,
          mixBlendMode: "overlay",
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
          backgroundSize: "120px 120px",
        }}
      />
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

      {/* Animated multi-layer wave background when playing */}
      {radioMode && currentTrack && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Back wave — slowest, dimmest */}
          <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1200 80" preserveAspectRatio="none" style={{ height: isMobile ? 60 : 80, opacity: isMobile ? 0.08 : 0.10 }}>
            <motion.path
              d="M0,40 C150,15 300,65 450,40 C600,15 750,65 900,40 C1050,15 1200,65 1200,40 L1200,80 L0,80 Z"
              fill="white"
              animate={{ d: [
                "M0,40 C150,15 300,65 450,40 C600,15 750,65 900,40 C1050,15 1200,65 1200,40 L1200,80 L0,80 Z",
                "M0,55 C150,70 300,25 450,50 C600,70 750,25 900,55 C1050,70 1200,25 1200,50 L1200,80 L0,80 Z",
                "M0,40 C150,15 300,65 450,40 C600,15 750,65 900,40 C1050,15 1200,65 1200,40 L1200,80 L0,80 Z",
              ] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            />
          </svg>
          {/* Mid wave — medium speed, medium opacity */}
          <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1200 80" preserveAspectRatio="none" style={{ height: isMobile ? 40 : 55, opacity: isMobile ? 0.10 : 0.14 }}>
            <motion.path
              d="M0,50 C200,25 400,65 600,40 C800,15 1000,65 1200,40 L1200,80 L0,80 Z"
              fill="white"
              animate={{ d: [
                "M0,50 C200,25 400,65 600,40 C800,15 1000,65 1200,40 L1200,80 L0,80 Z",
                "M0,30 C200,55 400,15 600,45 C800,65 1000,20 1200,50 L1200,80 L0,80 Z",
                "M0,50 C200,25 400,65 600,40 C800,15 1000,65 1200,40 L1200,80 L0,80 Z",
              ] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            />
          </svg>
          {/* Front wave — fastest, most opaque */}
          <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1200 80" preserveAspectRatio="none" style={{ height: isMobile ? 22 : 32, opacity: isMobile ? 0.14 : 0.18 }}>
            <motion.path
              d="M0,60 C150,40 300,70 450,55 C600,40 750,70 900,55 C1050,40 1200,65 1200,55 L1200,80 L0,80 Z"
              fill="white"
              animate={{ d: [
                "M0,60 C150,40 300,70 450,55 C600,40 750,70 900,55 C1050,40 1200,65 1200,55 L1200,80 L0,80 Z",
                "M0,45 C150,65 300,30 450,50 C600,65 750,30 900,50 C1050,65 1200,30 1200,50 L1200,80 L0,80 Z",
                "M0,60 C150,40 300,70 450,55 C600,40 750,70 900,55 C1050,40 1200,65 1200,55 L1200,80 L0,80 Z",
              ] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
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
              {/* Like/Dislike/Stop removed from Wave Card per user request.
                  Use PlayerBar controls instead (like/dislike there, and
                  Radio button toggles wave on/off). Wave stays focused on
                  playback: just Play/Pause + Skip. */}
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
                  <Waves className="w-3.5 h-3.5" style={{ color: "#fff", opacity: "var(--mq-emphasis-medium)" }} />
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "#fff", opacity: "var(--mq-emphasis-medium)" }}
                  >
                    Волна · Играет
                  </span>
                </div>
                {/* Tip 5 (Opacity hierarchy): title 100% (high), artist 70% (medium) */}
                <p
                  className="text-lg font-bold truncate"
                  style={{
                    color: "#fff",
                    fontFamily: "var(--mq-font-serif)",
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {currentTrack.title}
                </p>
                <p
                  className="text-sm truncate"
                  style={{ color: "#fff", opacity: "var(--mq-emphasis-medium)" }}
                >
                  {currentTrack.artist}
                </p>
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
                      // ui-ux-design rule: animate transform (scaleY) instead of height
                      // — GPU-accelerated, no layout reflow.
                      animate={isPlaying ? { scaleY: [0.3, 1, 0.3 + (i % 3) * 0.2, 0.5, 0.3] } : { scaleY: 0.3 }}
                      transition={isPlaying ? { duration: 0.5 + i * 0.08, repeat: Infinity, ease: "easeInOut", delay: i * 0.06 } : { duration: 0.2 }} />
                  ))}
                </div>
                <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.08 }}
                  onClick={onPauseWave}
                  className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 relative"
                  style={{ background: "var(--mq-text-on-accent, #fff)", color: "var(--mq-bg)", boxShadow: "var(--mq-shadow-card-hover)" }}>
                  {isPlaying ? <Pause className="w-6 h-6" fill="currentColor" /> : <Play className="w-6 h-6 ml-0.5" fill="currentColor" />}
                  {/* Animated expanding ring when playing */}
                  {isPlaying && (
                    <motion.span
                      className="absolute inset-0 rounded-full pointer-events-none"
                      style={{ border: "2px solid var(--mq-text-on-accent, #fff)" }}
                      animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                    />
                  )}
                </motion.button>
                <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.08 }}
                  onClick={onSkip}
                  className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--mq-glass-bg-active)", color: "var(--mq-text-on-accent, rgba(255,255,255,0.8))" }}>
                  <SkipForward className="w-5 h-5" fill="currentColor" />
                </motion.button>
                {/* Like/Dislike/Stop removed from Wave Card per user request.
                    Use PlayerBar controls instead. Wave stays focused on
                    playback: just Play/Pause + Skip. */}
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
