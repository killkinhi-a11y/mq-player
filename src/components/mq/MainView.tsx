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
import { type Track } from "@/lib/musicApi";
import { extractTasteProfile, displayGenre } from "@/lib/tasteProfile";
import { useIsMobile } from "@/hooks/use-mobile";
import ScrollReveal from "./ScrollReveal";
import ArtistDetailView from "./ArtistDetailView";
import PlaylistArtwork from "./PlaylistArtwork";
import ContextMenu from "./ContextMenu";
import { NowPlayingEqualizer } from "./NowPlayingEqualizer";
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
  // Phase 4B: saturation halved — Wave stays the one tinted hero on Home
  // (content-type differentiation) but reads as a quiet editorial wash,
  // not a glow. Depth = the hairline edge + grounded shadow, not bloom.
  return [
    `radial-gradient(120% 150% at 16% 6%, color-mix(in srgb, var(--mq-accent) 17%, var(--mq-bg)) 0%, color-mix(in srgb, var(--mq-accent) 10%, var(--mq-bg)) 38%, transparent 66%)`,
    `linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 11%, var(--mq-bg)) 0%, color-mix(in srgb, var(--mq-accent) 5%, var(--mq-bg)) 52%, var(--mq-bg) 100%)`,
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
      {/* HERO GREETING — Phase 2B: compact, solid color, no gradient text.
          The greeting is context, not decoration — Wave answers "what's playing". */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0}>
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-5"
        >
          <p
            className="mq-text-eyebrow mb-1 text-[11px] uppercase tracking-widest"
            style={{ color: "var(--mq-text-muted)" }}
          >
            {currentDate()}
          </p>
          <h1
            className="text-2xl sm:text-3xl"
            style={{
              fontFamily: "var(--mq-font-serif)",
              fontWeight: 600,
              letterSpacing: "-0.01em",
              lineHeight: 1.15,
              color: "var(--mq-text)",
            }}
          >
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
          progress={progress}
          duration={duration}
          waveLoading={wave.waveLoading}
          waveError={wave.waveError}
          onStartWave={wave.startWave}
          onPauseWave={wave.pauseWave}
          onStopWave={wave.stopWave}
          onSkip={wave.skipTrack}
          onDislike={wave.dislikeTrack}
          onLike={wave.likeTrack}
          isLiked={!!currentTrack && likedTrackIds.includes(currentTrack.id)}
          topGenres={tasteProfile.topGenres}
        />
      </ScrollReveal>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* QUICK LINKS — Phase 2B: quiet text row, not 4 colored stat cards.
          Content-first navigation: icon + label + count. No competing accents,
          no card containers — the Wave card stays the visual anchor. */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.05}>
        <div className="grid grid-cols-4 gap-2 sm:gap-3 mb-8">
          <QuickLink
            icon={Heart}
            label="Избранное"
            value={likedTrackIds.length}
            onClick={() => setView("favorites")}
          />
          <QuickLink
            icon={Clock}
            label="История"
            value={history.length}
            onClick={() => setView("history")}
          />
          <QuickLink
            icon={ListMusic}
            label="Плейлисты"
            value={playlists.length}
            onClick={() => setView("playlists")}
          />
          <QuickLink
            icon={MessageCircle}
            label="Чаты"
            value={contacts.length}
            onClick={() => setView("messenger")}
          />
        </div>
      </ScrollReveal>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* RECOMMENDATIONS — clean card-strip layout (rewritten from scratch) */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {recCategories.length > 0 && (
        <Section title="Для вас" icon={Sparkles}>
          {/* Phase 4B: the featured hero TRACK is now the first (lead) card
              of the first strip — an editorial lead column instead of a
              separate giant card. Frees ~200px of vertical rhythm, kills
              the duplicated identity (hero + strip showed the same track),
              and keeps featured ≠ regular distinction via card scale. */}
          <div className="space-y-6">
            {recCategories.map((cat, idx) => (
              <RecStrip
                key={cat.id}
                title={idx === 0 ? undefined : cat.title}
                icon={iconForRec(cat.id)}
                tracks={cat.tracks}
                reason={reasonForRec(cat.id)}
                currentTrack={currentTrack}
                isPlaying={isPlaying}
                onPlay={handlePlayRec}
                onArtistClick={handleNavigateToArtist}
                animationsEnabled={animationsEnabled}
              />
            ))}
          </div>
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
            className="w-full rounded-2xl p-5 flex items-center gap-4 transition-all hover:bg-white/[0.02] text-left"
            style={{ backgroundColor: "var(--mq-card)", border: "1px dashed var(--mq-border-thin)" }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}>
              <Plus className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
            </div>
            <div className="flex-1 min-w-0">
              {/* UX Core #1 (Эвристика доступности): текст без императива
                  и долга — "Новый плейлист" + "Собери своё" звучит как
                  возможность, а не обязанность. Снижает когнитивный барьер. */}
              <p className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>Новый плейлист</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>Собери своё</p>
            </div>
            {/* UX Core #6 (Забывание без подсказок): мини-обложки недавно
                сыгранных треков как визуальная подсказка "вот что можно
                добавить". Без стимула пользователь забывает что у него
                есть музыка для плейлиста. */}
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
                      <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
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
                    <p className="text-[11px] truncate" style={{ color: "var(--mq-text-muted)" }}>
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
      {/* Phase 4B: editorial section rhythm — one header pattern, one
          spacing scale (mb-10 sections / mb-4 header). Icon becomes a
          quiet eyebrow-scale marker, title carries the hierarchy. */}
      <section className="mb-9 sm:mb-10">
        <div className="mq-section-head">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && <Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={2.2} style={{ color: "var(--mq-text-muted)" }} />}
            <h2 className="mq-section-title truncate" style={{ fontFamily: "var(--mq-font-serif)" }}>
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
// QUICK LINK — Phase 2B: quiet navigation link (icon + label + count).
// Replaces QuickStat: no per-category colors, no gradient cards, no accent
// dots, no hover glow. One muted surface for all four — the Wave card stays
// the single visual anchor of the first viewport.
// ═════════════════════════════════════════════════════════════════════════

function QuickLink({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-colors hover:bg-[var(--mq-overlay-hover)] text-left min-w-0"
      aria-label={`${label}: ${value}`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
      <p className="min-w-0 text-[13px] sm:text-sm leading-none truncate">
        {/* Empty-library state: a bare "0" reads like a broken counter to
            first-time users. An em-dash + reduced opacity reads as "nothing
            here yet" while keeping the link useful navigation. */}
        <span className="font-semibold" style={{ color: "var(--mq-text)", opacity: value > 0 ? 1 : 0.45 }}>
          {value > 0 ? value : "—"}
        </span>{" "}
        <span style={{ color: "var(--mq-text-muted)" }}>{label}</span>
      </p>
    </button>
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
      whileTap={{ scale: 0.98 }}
      onClick={onPlay}
      className="text-left cursor-pointer group w-full"
    >
      <div
        className="relative aspect-square rounded-xl overflow-hidden mb-2"
        style={{
          boxShadow: isCurrent
            ? "0 0 0 2px var(--mq-accent)"
            : "var(--mq-shadow-premium-sm)",
          transition: "box-shadow 0.3s var(--mq-ease-premium)",
        }}
      >
        {track.cover ? (
          <img
            src={track.cover}
            alt=""
            className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200" />
        {/* Play button — flat accent circle, no drop-shadow */}
        <div
          className="absolute bottom-2 right-2 w-11 h-11 sm:w-10 sm:h-10 rounded-full flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-200 sm:scale-90 sm:group-hover:scale-100 sm:translate-y-2 sm:group-hover:translate-y-0"
          style={{
            backgroundColor: "var(--mq-accent)",
          }}
        >
          {isCurrent && isPlaying ? (
            <Pause className="w-4 h-4" fill="#fff" style={{ color: "#fff" }} />
          ) : (
            <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
          )}
        </div>
        {/* Current badge — flat, readable */}
        {isCurrent && (
          <div
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1"
            style={{
              backgroundColor: "rgba(0,0,0,0.65)",
              color: "var(--mq-accent)",
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
// REC STRIP — horizontal scroll of track cards for one category
// Replaces the old Hero+Tabs+List design with a simpler Spotify-home layout
// ═════════════════════════════════════════════════════════════════════════

function RecStrip({
  title, icon: Icon, tracks, reason, currentTrack, isPlaying, onPlay, onArtistClick, animationsEnabled,
}: {
  title?: string;
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
      {/* Phase 4B: sub-strip header — quiet meta voice, not a second
          section title. The first strip (lead) has no header at all:
          it flows straight out of the "Для вас" section title. */}
      {title && (
        <div className="flex items-center gap-2 mb-3">
          <Icon className="w-3.5 h-3.5" style={{ color: "var(--mq-text-muted)" }} />
          <h3 className="mq-text-eyebrow">{title}</h3>
          <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)", color: "var(--mq-text-muted)" }}>
            {tracks.length}
          </span>
        </div>
      )}

      {/* Horizontal scroll of cards — lead card is wider (editorial lead) */}
      <HScroll className="flex gap-3 overflow-x-auto scrollbar-none -mx-3 px-3 lg:mx-0 lg:px-0 pb-1">
        {tracks.map((track, i) => (
          <RecCard
            key={track.id + "_" + i}
            track={track}
            index={i}
            featured={i === 0 && !title}
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
  track, index, featured, reason, isCurrent, isPlaying, onPlay, onArtistClick, animationsEnabled,
}: {
  track: Track;
  index: number;
  featured?: boolean;
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
      onClick={onPlay}
      className="flex-shrink-0 cursor-pointer group"
      style={{ width: featured ? 232 : undefined }}
    >
      {/* Cover — Phase 4B: one artwork language. Featured card is 1:1 but
          wider (editorial lead column), regular cards are 160px squares.
          Depth = inner hairline + grounded shadow, never accent glow. */}
      <div
        className={`mq-art relative aspect-square mb-2.5 ${featured ? "" : "w-[140px] sm:w-[160px]"}`}
        style={{
          boxShadow: isCurrent
            ? "var(--mq-art-edge), 0 0 0 2px var(--mq-accent)"
            : "var(--mq-art-edge), var(--mq-art-shadow)",
        }}
      >
        {track.cover ? (
          <img
            src={track.cover}
            alt=""
            className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-[400ms] ease-out"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--mq-surface-2)" }}>
            <Music className="w-7 h-7" style={{ color: "var(--mq-text-muted)" }} />
          </div>
        )}
        {/* Play affordance — one pattern: accent circle bottom-right,
            hover-revealed on desktop, persistent on touch + featured. */}
        <div
          className="mq-play-overlay"
          data-visible={featured || isCurrent ? "true" : undefined}
          style={{ width: featured ? 48 : 40, height: featured ? 48 : 40 }}
        >
          {isCurrent && isPlaying ? (
            <Pause className={featured ? "w-5 h-5" : "w-4 h-4"} fill="#fff" style={{ color: "#fff" }} />
          ) : (
            <Play className={featured ? "w-5 h-5" : "w-4 h-4"} fill="#fff" style={{ color: "#fff" }} />
          )}
        </div>
        {isCurrent && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1" style={{ backgroundColor: "rgba(0,0,0,0.7)", color: "var(--mq-accent)" }}>
            {isPlaying ? (
              <NowPlayingEqualizer size="xs" variant="inline" />
            ) : (
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--mq-accent)" }} />
            )}
            ИГРАЕТ
          </div>
        )}
      </div>
      {/* Text — featured gets a reason line (editorial dek) under the art */}
      <p
        className={`text-[13px] mq-t-title truncate leading-tight ${featured ? "text-[15px] sm:text-base" : ""}`}
        style={{ color: isCurrent ? "var(--mq-accent)" : "var(--mq-text)" }}
      >
        {track.title}
      </p>
      <button
        onClick={(e) => { e.stopPropagation(); onArtistClick(); }}
        className={`text-[11px] truncate hover:underline block w-full text-left mt-0.5 mq-t-meta ${featured ? "text-xs" : ""}`}
        style={{ color: "var(--mq-text-muted)" }}
      >
        {track.artist}
      </button>
      {featured && reason && (
        <p className="text-[11px] truncate mt-1.5 mq-t-meta" style={{ color: "var(--mq-text-muted)", opacity: 0.75 }}>
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
  return (
    <div
      className={isMobile ? "relative mb-8 rounded-2xl overflow-hidden" : "mq-hero-card relative mb-8"}
      style={{
        background: isMobile
          ? (currentTrack?.cover
            ? `linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 20%, var(--mq-bg)), color-mix(in srgb, var(--mq-accent) 8%, var(--mq-bg)))`
            : getWaveGradient())
          : getWaveGradient(),
        minHeight: isMobile ? 140 : 160,
        boxShadow: "var(--mq-art-shadow)",
        border: "1px solid var(--mq-edge-strong)",
      }}
    >
      {/* Phase 4B: mobile blurred-cover backdrop removed (decorative wash). */}

      {/* Static wave silhouette when wave mode is active — a state
          indicator, not a motion decoration (Phase 2B). */}
      {radioMode && currentTrack && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1200 80" preserveAspectRatio="none" style={{ height: isMobile ? 40 : 56, opacity: 0.12 }}>
            <path
              d="M0,50 C200,25 400,65 600,40 C800,15 1000,65 1200,40 L1200,80 L0,80 Z"
              fill="white"
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
              <motion.button whileTap={{ scale: 0.94 }}
                onClick={onPauseWave}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.22)", color: "rgba(255,255,255,0.92)" }}>
                {isPlaying ? <Pause className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" /> : <Play className="w-5 h-5 sm:w-6 sm:h-6 ml-0.5" fill="currentColor" />}
              </motion.button>
              <motion.button whileTap={{ scale: 0.94 }}
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
                <motion.button whileTap={{ scale: 0.94 }}
                  onClick={onPauseWave}
                  className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 relative"
                  style={{ background: "var(--mq-text-on-accent, #fff)", color: "var(--mq-bg)", boxShadow: "var(--mq-shadow-card)" }}>
                  {isPlaying ? <Pause className="w-6 h-6" fill="currentColor" /> : <Play className="w-6 h-6 ml-0.5" fill="currentColor" />}
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
              <motion.button whileTap={{ scale: 0.94 }}
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
              <motion.button whileTap={{ scale: 0.94 }}
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
