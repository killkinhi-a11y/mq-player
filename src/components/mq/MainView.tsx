"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, Music, Heart, Clock, ListMusic, MessageCircle,
  Plus, Sparkles, Waves, User, Flame,
  SkipForward, SkipBack, ThumbsDown, TrendingUp, Compass, RotateCcw,
  MoreHorizontal, X, Shuffle,
} from "lucide-react";
import { useWaveEngine } from "@/hooks/useWaveEngine";
import { useFriendsListening } from "@/hooks/useFriendsListening";
import { useRecUpdates } from "@/hooks/useRecUpdates";
import { type Track, formatDuration } from "@/lib/musicApi";
import { extractTasteProfile, displayGenre } from "@/lib/tasteProfile";
import { type HomeRecCategory as RecCategory, type HomeCuratedPlaylist as CuratedPlaylist } from "@/store/useAppStore";
import { useIsMobile } from "@/hooks/use-mobile";
import ScrollReveal from "./ScrollReveal";
import ArtistDetailView from "./ArtistDetailView";
import PlaylistArtwork from "./PlaylistArtwork";
import ContextMenu from "./ContextMenu";
import { NowPlayingEqualizer } from "./NowPlayingEqualizer";
import { useMagnetic } from "@/hooks/useMagnetic";
import { useLongPress } from "@/hooks/useLongPress";

// ─── Types ────────────────────────────────────────────────────────────────

// RecCategory / CuratedPlaylist types now live in the store (home feed
// cache, Task 2) and are imported at the top of this file.

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

  // ── Home feed cache (Task 2): data lives in the STORE and survives view
  // remounts. One network fetch per taste change (5 min TTL + taste
  // signature guard + in-flight dedupe) — see loadHomeFeed in the store.
  const recCategories = useAppStore((s) => s.homeRecCategories);
  const curatedPlaylists = useAppStore((s) => s.homeCuratedPlaylists);
  const recLoading = useAppStore((s) => s.homeFeedLoading);
  const recError = useAppStore((s) => s.homeFeedError);
  const loadHomeFeed = useAppStore((s) => s.loadHomeFeed);
  const prevTrack = useAppStore((s) => s.prevTrack);
  const nextTrack = useAppStore((s) => s.nextTrack);
  const setFullTrackViewOpen = useAppStore((s) => s.setFullTrackViewOpen);

  // ── Wave engine (logic separated from UI) ──
  const wave = useWaveEngine();


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

  // ── Taste signature (Task 2) ──
  // Stable STRING derived from the exact params that drive the home feed
  // request. The tasteProfile object identity changes on every play/sync
  // (new array refs) — comparing the SIGNATURE instead kills the refetch
  // storm while still refreshing when taste genuinely changes (new likes,
  // history entries, favorite artists, genres).
  const tasteSig = useMemo(() => {
    const st = useAppStore.getState();
    const likedScIds = (st.likedTracksData || [])
      .map((t: any) => t.scTrackId).filter(Boolean).slice(0, 5).join(",");
    const historyScIds = (st.history || [])
      .slice(0, 10).map((h: any) => h.track?.scTrackId).filter(Boolean).join(",");
    const dislikedIds = (st.dislikedTrackIds || []).slice(0, 50).join(",");
    const favNames = (st.favoriteArtists || []).map((a: any) => a.username).filter(Boolean);
    const artists = [...new Set([...favNames, ...tasteProfile.topArtists])].slice(0, 5).join(",");
    return JSON.stringify([
      likedScIds,
      historyScIds,
      dislikedIds,
      tasteProfile.topGenres.slice(0, 8).join(","),
      artists,
    ]);
  }, [tasteProfile]);

  // ── Load home feed (debounced; the store gates the actual network use) ──
  useEffect(() => {
    const timer = setTimeout(() => {
      loadHomeFeed({
        tasteSig,
        topGenres: tasteProfile.topGenres,
        topArtists: tasteProfile.topArtists,
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [tasteSig, loadHomeFeed, tasteProfile.topGenres, tasteProfile.topArtists]);

  // Force refresh (Retry button / pull-to-refresh)
  const tasteSigRef = useRef(tasteSig);
  const tasteRef = useRef(tasteProfile);
  // Latest-ref pattern — written in effects (never during render: the React
  // compiler / react-hooks/refs rule forbids ref access in render bodies).
  useEffect(() => { tasteSigRef.current = tasteSig; }, [tasteSig]);
  useEffect(() => { tasteRef.current = tasteProfile; }, [tasteProfile]);
  const handleRetryRecs = useCallback(() => {
    loadHomeFeed({
      force: true,
      tasteSig: tasteSigRef.current,
      topGenres: tasteRef.current.topGenres,
      topArtists: tasteRef.current.topArtists,
    });
  }, [loadHomeFeed]);

  // Soft refresh for the 30s rec-updates hash poll: the store still applies
  // the TTL + signature guard, so unchanged taste does NOT refetch.
  const handleRecUpdatesChange = useCallback(() => {
    loadHomeFeed({
      tasteSig: tasteSigRef.current,
      topGenres: tasteRef.current.topGenres,
      topArtists: tasteRef.current.topArtists,
    });
  }, [loadHomeFeed]);

  // ── Friends listening now (polling every 15s) ──
  const { friends: listeningFriends } = useFriendsListening();

  // ── Real-time rec updates (polling hash every 30s, triggers refetch on change) ──
  useRecUpdates(handleRecUpdatesChange);

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
          {/* Compact wave pill — real radio state. On phones it yields to the
              hero's own wave CTA when nothing is playing (one primary action). */}
          <button
            onClick={() => (wave.radioMode ? wave.pauseWave() : wave.startWave())}
            disabled={wave.waveLoading}
            className={`shrink-0 ${currentTrack ? "flex" : "hidden lg:flex"} items-center gap-2 rounded-full pl-3 pr-4 h-10 transition-all active:scale-95`}
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
      {/* Desktop featured card (mobile uses MobileNowHero below) */}
      <div className="hidden lg:block">
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
      </div>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* CONTINUE LISTENING + QUICK ACTIONS — two-column band (new). Left:  */}
      {/* real current track with progress; right: dense action grid.        */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {/* MOBILE — new Home composition (Task 3): the NOW hero owns the       */}
      {/* first screen; desktop keeps Featured + ContinueListening below.      */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <div className="lg:hidden">
        <ScrollReveal direction="up" delay={0.02}>
          <MobileNowHero
            track={currentTrack}
            fallbackTrack={featuredTrack}
            fallbackReason={featuredReason}
            isPlaying={isPlaying}
            progress={progress}
            duration={duration}
            radioMode={radioMode}
            onToggle={togglePlay}
            onPrev={radioMode ? () => wave.skipTrack() : prevTrack}
            onNext={radioMode ? () => wave.skipTrack() : nextTrack}
            onPlayFallback={() => featuredTrack && handlePlayRec(featuredTrack)}
            onArtistClick={handleNavigateToArtist}
            onOpenFull={() => {
              if (currentTrack) setFullTrackViewOpen(true);
              else if (featuredTrack) handlePlayRec(featuredTrack);
            }}
          />
        </ScrollReveal>
        <MobileQuickRow
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

      {/* Desktop: continue-listening band + quick actions */}
      <div className="hidden lg:block">
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
      </div>

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

// ══════════════════════════════════════════════════════════════════════════
// MOBILE NOW HERO (Task 3 — new mobile Home composition).
// The user's main state (current track + real progress + transport) becomes
// the visually dominant block on phones: full-width square artwork, big
// 64px play target, 48px skips. Nothing decorative — every element is a
// real control or real playback state. Desktop keeps its own layout below.
// ══════════════════════════════════════════════════════════════════════════
function MobileNowHero({
  track,
  fallbackTrack,
  fallbackReason,
  isPlaying,
  progress,
  duration,
  radioMode,
  onToggle,
  onPrev,
  onNext,
  onPlayFallback,
  onArtistClick,
  onOpenFull,
}: {
  track: Track | null;
  fallbackTrack: Track | null;
  fallbackReason: string;
  isPlaying: boolean;
  progress: number;
  duration: number;
  radioMode: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPlayFallback: () => void;
  onArtistClick: (artist: string) => void;
  onOpenFull: () => void;
}) {
  const hero = track || fallbackTrack;
  const isNow = !!track; // true → real "now playing" state; false → pick + big CTA
  const pct = isNow && duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  // Honest empty state: no track, no recommendation yet → the Wave is the
  // single primary action (the header pill is hidden in this case).
  if (!hero) {
    return (
      <div
        className="rounded-[var(--mq-r-card,24px)] p-6 mb-5"
        style={{ background: getWaveGradient(), border: "1px solid var(--mq-border-hairline)" }}
      >
        <div className="flex items-center gap-2.5 mb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 20%, transparent)" }}
          >
            <Waves className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
          </div>
          <div>
            <p className="mq-t-title text-lg" style={{ color: "var(--mq-text)" }}>Волна</p>
            <p className="mq-t-meta text-xs" style={{ color: "var(--mq-text-muted)" }}>радио по твоему вкусу</p>
          </div>
        </div>
        <p className="mq-t-body text-sm mb-5" style={{ color: "var(--mq-text-muted)" }}>
          Включи трек или запусти Волну — она подберёт музыку по истории, лайкам и любимым артистам.
        </p>
        <HeroWaveCTA />
      </div>
    );
  }

  return (
    <section className="mb-4" aria-label={isNow ? "Сейчас играет" : "Рекомендация"}>
      {/* ── Dominant artwork ── */}
      <button
        onClick={onOpenFull}
        className="relative block w-full rounded-[var(--mq-r-card,24px)] overflow-hidden"
        style={{ border: "1px solid var(--mq-border-hairline)", boxShadow: "var(--mq-shadow-card, 0 8px 24px rgba(0,0,0,0.28))" }}
        aria-label={isNow ? "Открыть плеер" : "Открыть трек"}
      >
        {hero.cover ? (
          <img
            src={hero.cover}
            alt={`${hero.title} — ${hero.artist}`}
            className="w-full object-cover"
            // Capped height: a full-width square on a 390×844 phone pushes
            // the quick-actions row under the fixed dock (mini-player + nav).
            // min(46vh, 340px) keeps the hero dominant AND the first screen
            // complete (VLM-verified geometry).
            style={{ display: "block", height: "min(42vh, 320px)" }}
          />
        ) : (
          <div
            className="w-full flex items-center justify-center"
            style={{ background: getWaveGradient(), height: "min(42vh, 320px)" }}
          >
            <Music className="w-16 h-16" style={{ color: "var(--mq-text-muted)" }} />
          </div>
        )}
        {/* isPlaying equalizer hint overlaid on the artwork edge */}
        {isNow && isPlaying && (
          <div className="absolute" style={{ position: "absolute", left: 12, top: 12 }}>
            <NowPlayingEqualizer />
          </div>
        )}
      </button>

      {/* ── Title block ── */}
      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {isNow ? (
            <div className="flex items-center gap-2 mb-1">
              <p className="mq-t-meta text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--mq-accent)" }}>
                {radioMode ? "Волна · играет" : "Сейчас играет"}
              </p>
            </div>
          ) : (
            <p className="mq-t-meta text-[11px] uppercase tracking-[0.12em] mb-1" style={{ color: "var(--mq-text-muted)" }}>
              {fallbackReason || "Подобрано для тебя"}
            </p>
          )}
          <h2 className="mq-t-title text-xl leading-snug line-clamp-2" style={{ color: "var(--mq-text)" }}>
            {hero.title}
          </h2>
          <button
            onClick={() => onArtistClick(hero.artist)}
            className="mq-t-body text-sm mt-0.5 truncate max-w-full text-left"
            style={{ color: "var(--mq-text-muted)" }}
            aria-label={`Открыть артиста ${hero.artist}`}
          >
            {hero.artist}
          </button>
        </div>
      </div>

      {/* ── Real progress (now playing only) ── */}
      {isNow && (
        <div className="mt-3.5">
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--mq-border-thin)" }}
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "var(--mq-accent)" }} />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="mq-t-num text-[11px]" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(progress)}</span>
            <span className="mq-t-num text-[11px]" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(duration)}</span>
          </div>
        </div>
      )}

      {/* ── Transport: 48px skips + 64px primary ── */}
      <div className="mt-4 flex items-center justify-center gap-7">
        <button
          onClick={onPrev}
          className="w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{ border: "1px solid var(--mq-border-thin)", color: "var(--mq-text)" }}
          aria-label="Предыдущий трек"
        >
          <SkipBack className="w-5 h-5" fill="currentColor" />
        </button>
        <button
          onClick={isNow ? onToggle : onPlayFallback}
          className="w-16 h-16 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{ backgroundColor: "var(--mq-accent)", boxShadow: "0 8px 24px color-mix(in srgb, var(--mq-accent) 35%, transparent)" }}
          aria-label={isNow ? (isPlaying ? "Пауза" : "Продолжить") : "Слушать"}
        >
          {isNow && isPlaying ? (
            <Pause className="w-7 h-7" fill="var(--mq-text-on-accent, #fff)" style={{ color: "var(--mq-text-on-accent, #fff)" }} />
          ) : (
            <Play className="w-7 h-7 translate-x-[2px]" fill="var(--mq-text-on-accent, #fff)" style={{ color: "var(--mq-text-on-accent, #fff)" }} />
          )}
        </button>
        <button
          onClick={onNext}
          className="w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{ border: "1px solid var(--mq-border-thin)", color: "var(--mq-text)" }}
          aria-label="Следующий трек"
        >
          <SkipForward className="w-5 h-5" fill="currentColor" />
        </button>
      </div>
    </section>
  );
}

// Wave CTA inside the empty hero — calls the real wave engine (no timers).
function HeroWaveCTA() {
  const wave = useWaveEngine();
  return (
    <button
      onClick={() => (wave.radioMode ? wave.pauseWave() : wave.startWave())}
      disabled={wave.waveLoading}
      className="w-full h-12 rounded-2xl flex items-center justify-center gap-2.5 active:scale-[0.98] transition-transform disabled:opacity-60"
      style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text-on-accent, #fff)" }}
      aria-label="Запустить Волну"
    >
      {wave.waveLoading ? (
        <div className="mq-spin w-5 h-5 border-2 rounded-full" style={{ borderColor: "var(--mq-text-on-accent, #fff)", borderTopColor: "transparent" }} />
      ) : (
        <Waves className="w-5 h-5" />
      )}
      <span className="mq-t-label text-sm font-semibold">
        {wave.waveLoading ? "Подбираем музыку…" : wave.radioMode ? "Пауза Волны" : "Запустить Волну"}
      </span>
    </button>
  );
}

// Compact borderless quick row for mobile: 4 real navigation targets,
// 44px touch height, no boxed card chrome (anti "card+card+card").
function MobileQuickRow({
  likedCount, historyCount, playlistCount, chatCount,
  onFavorites, onHistory, onPlaylists, onMessenger,
}: {
  likedCount: number; historyCount: number; playlistCount: number; chatCount: number;
  onFavorites: () => void; onHistory: () => void; onPlaylists: () => void; onMessenger: () => void;
}) {
  const items = [
    { icon: Heart, label: "Избранное", count: likedCount, onClick: onFavorites },
    { icon: Clock, label: "История", count: historyCount, onClick: onHistory },
    { icon: ListMusic, label: "Плейлисты", count: playlistCount, onClick: onPlaylists },
    { icon: MessageCircle, label: "Чаты", count: chatCount, onClick: onMessenger },
  ];
  return (
    <div className="grid grid-cols-4 gap-1 mb-6" role="group" aria-label="Быстрые переходы">
      {items.map(({ icon: Icon, label, count, onClick }) => (
        <button
          key={label}
          onClick={onClick}
          className="flex flex-col items-center gap-1.5 py-2 rounded-xl active:scale-95 transition-transform"
          aria-label={`${label}${count > 0 ? ` — ${count}` : ""}`}
        >
          <div className="relative">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 7%, transparent)" }}
            >
              <Icon className="w-[19px] h-[19px]" style={{ color: "var(--mq-text)" }} />
            </div>
            {count > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center mq-t-num text-[11px] font-bold"
                style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text-on-accent, #fff)" }}
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </div>
          <span className="mq-t-label text-[11px] leading-none max-w-full truncate" style={{ color: "var(--mq-text-muted)" }}>
            {label}
          </span>
        </button>
      ))}
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

// ═════════════════════════════════════════════════════════════════════════
// TRACK CARD — universal card for tracks (recommendations, recently, trending preview)
// ═════════════════════════════════════════════════════════════════════════

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

// ═════════════════════════════════════════════════════════════════════════
// REC STRIP — horizontal scroll of track cards for one category
// Replaces the old Hero+Tabs+List design with a simpler Spotify-home layout
// ═════════════════════════════════════════════════════════════════════════

// ─── RecCard — visual card (cover + title + artist) ───────────────────────

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

// ─── Country detection ────────────────────────────────────────────────────

export default memo(MainView);
