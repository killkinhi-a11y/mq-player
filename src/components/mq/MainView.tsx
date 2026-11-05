"use client";

import ArtistActionsMenu, { type ArtistMenuTarget } from "./ArtistActionsMenu";
import { ArtistCircleCard, ChartRow, CompactTrackCard, HScroll, HorizontalTrackRow, Section } from "./main/TrackRows";
import ArtistDetailView from "./ArtistDetailView";
import { Clock, Flame, ListMusic, ListPlus, Music, Play, RotateCcw, Shuffle, Sparkles, User, Waves } from "lucide-react";
import ContextMenu from "./ContextMenu";
import { ContinueListeningCard, FeaturedCard, MobileNowHero } from "./main/HomeHero";
import { type HomeCuratedPlaylist as CuratedPlaylist, useAppStore } from "@/store/useAppStore";
import MenuCore, { MenuHeader } from "./ui/MenuCore";
import { MobileQuickRow, QuickActionGrid } from "./main/QuickActions";
import { type RecPlItem, RecommendedPlaylistsEditorial, RecsEmptyState, RecsSkeleton, iconForRec, reasonForRec, recommendedCoverSources } from "./main/RecommendedPlaylists";
import ScrollReveal from "./ScrollReveal";
import type { Track } from "@/lib/musicApi";
import { TrackMoreButton } from "./ui/TrackMoreButton";
import WaveHome from "./WaveHome";
import { currentDate, greeting, pluralRu } from "./main/homeUtils";
import dynamic from "next/dynamic";
import { extractTasteProfile } from "@/lib/tasteProfile";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFriendsListening } from "@/hooks/useFriendsListening";
import { useRecUpdates } from "@/hooks/useRecUpdates";
import { useWaveEngine } from "@/hooks/useWaveEngine";

// Re-exported for backward compatibility (moved in Stage III).
export { waveReasonText } from "./main/homeUtils";

// V2 multi-provider: Spotify catalog artist page + album page (lazy — only
// loaded when a Spotify context is actually opened).
const SpotifyArtistView = dynamic(() => import("./SpotifyArtistView").then((m) => m.SpotifyArtistView), { ssr: false });

const AlbumDetailView = dynamic(() => import("./AlbumDetailView").then((m) => m.AlbumDetailView), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────────────

// RecCategory / CuratedPlaylist types now live in the store (home feed
// cache, Task 2) and are imported at the top of this file.

// Session guard for the public-playlist recommendations fetch (the same
// engine the Публичные плейлисты view uses): one call per app session is
// enough — the endpoint is rate-limited (heavy) and the curated feed
// already refreshes on its own TTL.
let recPlPublicFetched = false;

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
  const selectedSpotifyAlbum = useAppStore((s) => s.selectedSpotifyAlbum);
  const closeSpotifyAlbum = useAppStore((s) => s.closeSpotifyAlbum);
  const favoriteArtists = useAppStore((s) => s.favoriteArtists);
  const radioMode = useAppStore((s) => s.radioMode);
  const duration = useAppStore((s) => s.duration);
  const contacts = useAppStore((s) => s.contacts);

  // ── Home feed cache (Task 2): data lives in the STORE and survives view
  // remounts. One network fetch per taste change (5 min TTL + taste
  // signature guard + in-flight dedupe) — see loadHomeFeed in the store.
  const recCategories = useAppStore((s) => s.homeRecCategories);
  const curatedPlaylists = useAppStore((s) => s.homeCuratedPlaylists);
  const recommendedPlaylists = useAppStore((s) => s.recommendedPlaylists);
  const fetchPlaylistRecommendations = useAppStore((s) => s.fetchPlaylistRecommendations);
  const recLoading = useAppStore((s) => s.homeFeedLoading);
  const recError = useAppStore((s) => s.homeFeedError);
  const loadHomeFeed = useAppStore((s) => s.loadHomeFeed);
  const prevTrack = useAppStore((s) => s.prevTrack);
  const nextTrack = useAppStore((s) => s.nextTrack);
  const setFullTrackViewOpen = useAppStore((s) => s.setFullTrackViewOpen);

  // ── Unified context-menu state (v68): ONE menu instance for the whole
  // Home screen. Every surface (row / card / hero / artist)
  // calls openTrackMenu / openArtistMenu / openCuratedMenu with the click
  // event; the menu anchors at the trigger and flips/clamps itself.
  const [homeMenu, setHomeMenu] = useState<
    | { kind: "track"; track: Track; x: number; y: number; wave?: boolean }
    | { kind: "artist"; artist: ArtistMenuTarget; x: number; y: number }
    | { kind: "curated"; playlist: CuratedPlaylist; x: number; y: number }
    | null
  >(null);
  const openTrackMenu = useCallback((track: Track, e: React.MouseEvent, wave = false) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHomeMenu({ kind: "track", track, x: rect.left, y: rect.bottom + 4, wave });
  }, []);
  const openArtistMenu = useCallback((artist: ArtistMenuTarget, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHomeMenu({ kind: "artist", artist, x: rect.left, y: rect.bottom + 4 });
  }, []);
  const openCuratedMenu = useCallback((playlist: CuratedPlaylist, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHomeMenu({ kind: "curated", playlist, x: Math.min(rect.left, window.innerWidth - 240), y: rect.bottom + 4 });
  }, []);
  const closeHomeMenu = useCallback(() => setHomeMenu(null), []);

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
    // V4.1 dedupe: the CURRENT track already owns the Continue band
    // (desktop) / Now hero (mobile) — repeating it in «Недавно» reads as
    // padding. Match by ID and by CANONICAL identity (normalized title +
    // artist): the free resolver legitimately swaps a catalog row
    // (dzl_/spl_ id) for its SoundCloud/Audius twin (sc_ id) with the same
    // title — an id-only filter would let the twin through and the user
    // would see the same track twice.
    const currentId = currentTrack?.id;
    const curKey = currentTrack
      ? `${(currentTrack.title || "").toLowerCase().trim()}|${(currentTrack.artist || "").toLowerCase().trim()}`
      : null;
    return history
      .filter((h: any) => {
        if (!h?.track) return false;
        if (currentId && h.track.id === currentId) return false;
        if (curKey) {
          const key = `${(h.track.title || "").toLowerCase().trim()}|${(h.track.artist || "").toLowerCase().trim()}`;
          if (key === curKey) return false;
        }
        return true;
      })
      .slice(0, 10)
      .map((h: any) => h.track)
      .filter(Boolean);
  }, [history, currentTrack]);

  // ── RECOMMENDED PLAYLISTS for the editorial section: the app's TWO real
  // recommendation sources merged — public taste-based picks (the existing
  // /playlists/recommendations engine, also powering "Рекомендации" in
  // Публичные плейлисты) first, then the curated feed the Home already
  // receives (loadHomeFeed). No user-library data, no static/fake picks.
  // The public fetch runs once per session (module guard) — the curated
  // feed is already TTL-guarded inside loadHomeFeed.
  useEffect(() => {
    if (recPlPublicFetched) return;
    recPlPublicFetched = true;
    fetchPlaylistRecommendations();
  }, [fetchPlaylistRecommendations]);
  const recPlItems = useMemo<RecPlItem[]>(() => {
    const out: RecPlItem[] = [];
    for (const p of recommendedPlaylists || []) {
      if (!p || !Array.isArray(p.tracks) || p.tracks.length === 0) continue;
      out.push({
        id: `pub_${p.id}`,
        name: p.name,
        subtitle: (p.description || "").trim() || `от @${p.username}`,
        covers: recommendedCoverSources([p.cover], p.tracks),
        tracks: p.tracks,
      });
    }
    for (const c of curatedPlaylists || []) {
      if (!c || !Array.isArray(c.tracks) || c.tracks.length === 0) continue;
      out.push({
        id: `cur_${c.id}`,
        name: c.name,
        subtitle: c.subtitle,
        covers: recommendedCoverSources([], c.tracks),
        tracks: c.tracks,
      });
    }
    return out;
  }, [recommendedPlaylists, curatedPlaylists]);

  // ── Full playlist open (micro-pass): clicking/tapping a card (desktop) or
  // the expanded hero (mobile) opens the playlist's FULL page — the
  // EXISTING public-playlist detail screen reached via the app's normal
  // view routing (openPublicPlaylistDetail → currentView
  // "public-playlists"). Public taste-based picks pass their REAL
  // PublicPlaylist object; curated feed selections are wrapped as
  // `editorial` picks (real name/subtitle/tracks, no fabricated author or
  // social counts — the detail screen hides those fields for them).
  const openRecommendedPlaylist = useCallback((it: RecPlItem) => {
    const store = useAppStore.getState();
    const rawId = it.id.startsWith("pub_") || it.id.startsWith("cur_") ? it.id.slice(4) : it.id;
    if (it.id.startsWith("pub_")) {
      const pl = (recommendedPlaylists || []).find((p) => p && String(p.id) === rawId);
      if (pl) store.openPublicPlaylistDetail(pl);
      return;
    }
    const c = (curatedPlaylists || []).find((p) => p && p.id === rawId);
    if (c && Array.isArray(c.tracks) && c.tracks.length > 0) {
      store.openPublicPlaylistDetail({
        id: c.id,
        userId: "",
        username: "",
        name: c.name,
        description: c.subtitle,
        cover: c.tracks[0]?.cover || "",
        isPublic: false,
        tags: [],
        tracks: c.tracks,
        trackCount: c.tracks.length,
        likeCount: 0,
        playCount: 0,
        isLiked: false,
        createdAt: "",
        updatedAt: "",
        editorial: true,
      });
    }
  }, [recommendedPlaylists, curatedPlaylists]);

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
    // v72 PERF FIX: listening history is DELIBERATELY excluded from the
    // signature. Every track switch inserts a history entry — with it in
    // the sig, each switch refetched the whole home feed (recs + trending
    // + apple + spotify + curated = 5 endpoints). Real taste signals only:
    // likes, dislikes, genres, artists. The API still receives the FRESH
    // history (loadHomeFeed reads it from state at fetch time); the feed
    // simply refreshes on taste changes + TTL, not on every skip.
    const dislikedIds = (st.dislikedTrackIds || []).slice(0, 50).join(",");
    const favNames = (st.favoriteArtists || []).map((a: any) => a.username).filter(Boolean);
    const artists = [...new Set([...favNames, ...tasteProfile.topArtists])].slice(0, 5).join(",");
    return JSON.stringify([
      likedScIds,
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
    // V2.5 §3: no now-playing status label — the eyebrow carries the
    // real category reason (or nothing).
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

  // ── Album page (V2 catalog context — early return, AFTER all hooks) ──
  if (selectedSpotifyAlbum) {
    return (
      <AlbumDetailView
        album={selectedSpotifyAlbum}
        onBack={closeSpotifyAlbum}
        compactMode={compactMode}
        animationsEnabled={animationsEnabled}
      />
    );
  }

  // ── Artist detail (early return AFTER all hooks — see note above) ──
  if (selectedArtist) {
    // V2: catalog-linked artist → full catalog artist page (top tracks,
    // albums, singles, EPs, appears-on, related). SoundCloud artists keep
    // the existing ArtistDetailView — untouched path.
    if (selectedArtist.catalogArtistId) {
      return (
        <SpotifyArtistView
          catalogArtistId={selectedArtist.catalogArtistId}
          catalogProvider={selectedArtist.catalogProvider === "deezer" ? "deezer" : "spotify"}
          artistName={selectedArtist.name}
          onBack={() => setSelectedArtist(null)}
          compactMode={compactMode}
          animationsEnabled={animationsEnabled}
        />
      );
    }
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
      className={`${compactMode ? "p-3 lg:p-4" : "p-3.5 sm:p-4 lg:p-6"} max-w-[var(--mq-container-narrow)] lg:max-w-[var(--mq-container-wide)] mx-auto pb-32 lg:pb-28`}
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
              borderTopColor: "var(--mq-text-muted)",
              transform: `rotate(${pullDistance * 3}deg)`,
            }}
          >
            {pullDistance >= PULL_THRESHOLD ? (
              <RotateCcw className="w-3.5 h-3.5" style={{ color: "var(--mq-text-muted)" }} />
            ) : null}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* HEADER — compact greeting + discovery line (restructured: the */}
      {/* old serif hero shrank into a single quiet row; the screen now */}
      {/* belongs to real content, not typography). */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0}>
        <header className="mb-4 lg:mb-6 flex items-end justify-between gap-4">
          <div className="min-w-0">
            {/* V4 (X3 + §2): the eyebrow date keeps an airy tracking but
                gains contrast (meta-2 0.9 + text-muted); the greeting
                itself climbs to display weight — Home gets a real
                typographic anchor without eating vertical space. */}
            <p className="mq-t-meta mq-t-meta-2 uppercase tracking-[0.14em] mb-1.5" style={{ color: "var(--mq-text-muted)" }}>
              {currentDate()}
            </p>
            <h1
              className="text-3xl sm:text-[2.25rem] lg:text-[2.6rem] truncate"
              style={{
                color: "var(--mq-text)",
                fontFamily: "var(--mq-font-primary)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1.08,
              }}
            >
              {greeting()}
            </h1>
            <p className="mq-t-meta text-xs mt-2 truncate" style={{ color: "var(--mq-text-muted)" }}>
              {listeningFriends.length > 0
                ? `${listeningFriends.length} ${pluralRu(listeningFriends.length, "друг слушает", "друга слушают", "друзей слушают")} музыку сейчас`
                : personalCategories.length > 0
                  ? "Новое собрали для тебя ниже"
                  : "Начни с WAVE — она подберёт музыку под вкус"}
            </p>
          </div>
          {/* Compact wave pill — real radio state. On phones it yields to the
              hero's own wave CTA when nothing is playing (one primary action).
              FINAL §17: quiet control — no border at rest, tonal fill only
              (small visual footprint; the 44px invisible halo stays). */}
          <button
            onClick={() => (wave.radioMode ? wave.pauseWave() : wave.startWave())}
            disabled={wave.waveLoading}
            className={`shrink-0 ${currentTrack ? "flex" : "hidden lg:flex"} items-center gap-2 rounded-full pl-3 pr-4 h-11 transition-all mq-icon-btn`}
            data-active={wave.radioMode}
            style={{
              ["--mq-active-bg" as string]: "color-mix(in srgb, var(--mq-platinum-lift) 26%, transparent)",
              backgroundColor: wave.radioMode
                ? "color-mix(in srgb, var(--mq-platinum-lift) 26%, transparent)"
                : "color-mix(in srgb, var(--mq-text) 5%, transparent)",
            }}
            aria-label={wave.radioMode ? "Пауза WAVE" : "Запустить WAVE"}
          >
            {wave.waveLoading ? (
              <div className="mq-spin w-4 h-4 border-2 rounded-full" style={{ borderColor: "var(--mq-text-muted)", borderTopColor: "transparent" }} />
            ) : (
              <Waves className="w-4 h-4" style={{ color: wave.radioMode ? "var(--mq-platinum-hi)" : "var(--mq-text-muted)" }} />
            )}
            <span className="mq-t-label text-xs" style={{ color: wave.radioMode ? "var(--mq-platinum-hi)" : "var(--mq-text)" }}>
              {/* FINAL CORRECTION §13: no status suffix — the chip says the
                  mode name only; play state lives on the transport. */}
              {wave.waveLoading ? "Подбираем…" : "WAVE"}
            </span>
          </button>
        </header>
      </ScrollReveal>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* WAVE HOME (V2) — while the wave session is active, WaveHome IS the */}
      {/* hero: dominant artwork, transport, up-next flow. FeaturedCard and */}
      {/* MobileNowHero are suppressed in radio mode — one now-playing       */}
      {/* surface, not three competing ones.                                  */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {wave.radioMode && (
        <ScrollReveal direction="up" delay={0.01}>
          <div className="mb-4 lg:mb-6">
            <WaveHome />
          </div>
        </ScrollReveal>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* FEATURED — one dominant content block (new). Real data: the top */}
      {/* personal recommendation or the currently playing track. No glow, */}
      {/* no decorative blur — flat split card with a hard accent edge. */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {/* Desktop featured card (mobile uses MobileNowHero below).
          Suppressed while the Wave is active — WaveHome owns the hero. */}
      <div className="hidden lg:block">
        {!wave.radioMode && featuredTrack && (
          <ScrollReveal direction="up" delay={0.02}>
            <FeaturedCard
              track={featuredTrack}
              reason={featuredReason}
              isCurrent={currentTrack?.id === featuredTrack.id}
              isPlaying={isPlaying && currentTrack?.id === featuredTrack.id}
              onPlay={() => handlePlayRec(featuredTrack)}
              onArtistClick={() => handleNavigateToArtist(featuredTrack.artist)}
              onMore={(e) => openTrackMenu(featuredTrack, e)}
              animationsEnabled={animationsEnabled}
            />
          </ScrollReveal>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* CONTINUE LISTENING + QUICK ACTIONS — two-column band (new). Left: */}
      {/* real current track with progress; right: dense action grid. */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {/* MOBILE — the NOW hero owns the first screen when nothing else */}
      {/* claims it; while the Wave is active, WaveHome already plays that */}
      {/* role (dominant artwork + transport) — hide the duplicate row. */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <div className="lg:hidden">
        {!wave.radioMode && (
          <ScrollReveal direction="up" delay={0.02}>
            <MobileNowHero
              track={currentTrack}
              fallbackTrack={featuredTrack}
              fallbackReason={featuredReason}
              isPlaying={isPlaying}
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
              onMore={(e) => openTrackMenu(currentTrack ?? featuredTrack!, e)}
            />
          </ScrollReveal>
        )}
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
              duration={duration}
              isPlaying={isPlaying}
              radioMode={radioMode}
              onToggle={togglePlay}
              onSkip={() => wave.skipTrack()}
              onMore={(e) => openTrackMenu(currentTrack!, e)}
              onOpenFull={() => setFullTrackViewOpen(true)}
              onGoSearch={() => setView("search")}
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
      {/* PERSONALIZED FOR YOU — horizontal discovery (restructured): the */}
      {/* first category renders as horizontal track ROWS (new rhythm), the */}
      {/* rest as compact square cards. Real recommendations only. */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {personalCategories.length > 0 && (
        <Section title="Для вас" icon={Sparkles} action={<span className="mq-t-meta mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>по твоей истории и лайкам</span>}>
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
                  onMore={(e) => openTrackMenu(track, e, true)}
                />
              ))}
            </div>
          ))}
          {personalCategories.slice(1).map((cat) => (
            <div key={cat.id} className="mb-5">
              <div className="flex items-center gap-2 mb-2.5">
                {(() => {
                  const CatIcon = iconForRec(cat.id);
                  return <CatIcon className="w-3.5 h-3.5" style={{ color: "var(--mq-text-muted)" }} />;
                })()}
                <h3 className="mq-t-label mq-t-body" style={{ color: "var(--mq-text)" }}>
                  {cat.title}
                </h3>
                <span className="mq-t-meta mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>
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
                    onMore={(e) => openTrackMenu(track, e, true)}
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
      {/* RECENTLY PLAYED — horizontal compact row (was a 5-column grid). */}
      {/* Real listening history only; hidden entirely when empty. */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {recentTracks.length > 0 && (
        <Section
          title="Недавно"
          icon={Clock}
          action={
            <button onClick={() => setView("history")} className="mq-t-label text-xs" style={{ color: "var(--mq-text-muted)" }}>
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
                onMore={(e) => openTrackMenu(track, e)}
              />
            ))}
          </HScroll>
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* NEW / TRENDING — numbered chart rows (new): real trending + */}
      {/* Apple/Spotify chart data, presented as a ranked list. */}
      {/* W01 fix: ranks are GLOBAL across the flattened list (1..10) — */}
      {/* per-category ranks (1-5, 1-5) read as duplicated placeholder */}
      {/* numbers ("12345 / 12345") in the two-column grid. */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {chartCategories.length > 0 && (
        <Section title="Новое и в тренде" icon={Flame} action={<span className="mq-t-meta mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>обновляется каждый час</span>}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-1.5">
            {chartCategories
              .flatMap((cat) => cat.tracks.slice(0, 5).map((track, i) => ({ cat, track, i })))
              .slice(0, 10)
              .map(({ cat, track, i }, globalIdx) => (
                <ChartRow
                  key={cat.id + "_" + track.id + "_" + i}
                  rank={globalIdx + 1}
                  track={track}
                  isCurrent={currentTrack?.id === track.id}
                  isPlaying={isPlaying && currentTrack?.id === track.id}
                  onPlay={() => handlePlayRec(track)}
                  onArtistClick={() => handleNavigateToArtist(track.artist)}
                  onMore={(e) => openTrackMenu(track, e)}
                />
              ))}
          </div>
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* FRIENDS LISTENING NOW — social widget (below the fold now) */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {listeningFriends.length > 0 && (
        <Section title="Друзья слушают" icon={User}>
          <HScroll
            className="flex gap-3 overflow-x-auto scrollbar-none -mx-3 px-3 lg:mx-0 lg:px-0 pb-1"
          >
            {listeningFriends.map((f) => (
              <div
                key={f.userId}
                className="flex-shrink-0 w-[200px] rounded-[var(--mq-mat-radius,14px)] p-3 cursor-pointer hover:scale-[1.02] transition-transform"
                style={{
                  backgroundColor: "var(--mq-mat-2-bg)",
                  border: "1px solid var(--mq-mat-2-edge)",
                  boxShadow: "var(--mq-mat-2-shadow)",
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
                      <span className="mq-t-meta mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>
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
                    <p className="mq-t-track-sm truncate">
                      {f.trackTitle}
                    </p>
                    <p className="mq-t-meta-2 truncate">
                      {f.trackArtist}
                    </p>
                  </div>
                  {f.scTrackId && (
                    <TrackMoreButton
                      size="sm"
                      onOpen={(e) => openTrackMenu({
                        id: `sc_${f.scTrackId}`,
                        title: f.trackTitle,
                        artist: f.trackArtist,
                        album: "",
                        cover: f.trackCover,
                        duration: f.duration ?? 0,
                        genre: "",
                        audioUrl: "",
                        previewUrl: "",
                        source: "soundcloud",
                        scTrackId: f.scTrackId ?? undefined,
                      }, e)}
                      label={`Действия: ${f.trackTitle}`}
                    />
                  )}
                </div>
              </div>
            ))}
          </HScroll>
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* RECOMMENDED PLAYLISTS — reference-faithful editorial composition  */}
      {/* built on the app's REAL recommendation sources: public           */}
      {/* taste-based picks (existing /playlists/recommendations engine)    */}
      {/* merged with the curated feed Home already receives. The          */}
      {/* reference's own interaction (video pin): hovering/tapping a      */}
      {/* narrow strip EXPANDS it into the featured card while the         */}
      {/* previous featured card collapses back — one accordion row.       */}
      {/* Activating a card (desktop click / mobile hero tap) opens the     */}
      {/* playlist's FULL page via the existing public-playlist view.      */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {recPlItems.length > 0 && (
        <RecommendedPlaylistsEditorial
          items={recPlItems}
          currentTrackId={currentTrack?.id}
          isPlaying={isPlaying}
          animationsEnabled={animationsEnabled}
          onPlay={(it) => {
            if (it.tracks.length === 0) return;
            if (currentTrack?.id === it.tracks[0].id) { togglePlay(); return; }
            playTrack(it.tracks[0], it.tracks);
          }}
          onOpen={openRecommendedPlaylist}
          onMore={(it, e) => openCuratedMenu({ id: it.id, name: it.name, subtitle: it.subtitle, gradient: "", tracks: it.tracks }, e)}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* FAVORITE ARTISTS (below the fold) */}
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
                onMore={(e) => openArtistMenu({ name: artist.username, avatar: artist.avatar, followers: artist.followers, genre: artist.genre, trackCount: artist.trackCount }, e)}
                animationsEnabled={animationsEnabled}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ── Unified context menu for ALL Home surfaces (v68) ── */}
      {homeMenu?.kind === "track" && (
        <ContextMenu
          track={homeMenu.track}
          x={homeMenu.x}
          y={homeMenu.y}
          onClose={closeHomeMenu}
          bottomInset={96}
          context={homeMenu.wave ? { kind: "wave" } : undefined}
        />
      )}
      {homeMenu?.kind === "artist" && (
        <ArtistActionsMenu
          artist={homeMenu.artist}
          x={homeMenu.x}
          y={homeMenu.y}
          onClose={closeHomeMenu}
        />
      )}
      {homeMenu?.kind === "curated" && (
        <MenuCore
          anchor={{ x: homeMenu.x, y: homeMenu.y }}
          onClose={closeHomeMenu}
          ariaLabel={`Действия: ${homeMenu.playlist.name}`}
          header={
            <MenuHeader
              title={homeMenu.playlist.name}
              subtitle={`${homeMenu.playlist.tracks.length} треков · подобрано по вашему вкусу`}
              fallbackIcon={ListMusic}
            />
          }
          elements={[
            {
              type: "item",
              id: "play",
              icon: Play,
              label: "Воспроизвести",
              disabled: homeMenu.playlist.tracks.length === 0,
              onSelect: () => {
                const pl = homeMenu.playlist;
                if (pl.tracks.length === 0) return;
                if (currentTrack?.id === pl.tracks[0].id) togglePlay();
                else playTrack(pl.tracks[0], pl.tracks);
                closeHomeMenu();
              },
            },
            {
              type: "item",
              id: "shuffle",
              icon: Shuffle,
              label: "Перемешать и играть",
              disabled: homeMenu.playlist.tracks.length === 0,
              onSelect: () => {
                const pl = homeMenu.playlist;
                const shuffled = [...pl.tracks];
                for (let i = shuffled.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                playTrack(shuffled[0], shuffled);
                closeHomeMenu();
              },
            },
            {
              type: "item",
              id: "queue",
              icon: ListPlus,
              label: "Добавить в очередь",
              disabled: homeMenu.playlist.tracks.length === 0,
              onSelect: () => {
                const state = useAppStore.getState();
                useAppStore.setState({ queue: [...state.queue, ...homeMenu.playlist.tracks] });
                closeHomeMenu();
              },
            },
          ]}
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// WAVE CARD — preserved from previous version
// ═════════════════════════════════════════════════════════════════════════

// ─── Country detection ────────────────────────────────────────────────────

export default memo(MainView);
