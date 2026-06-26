"use client";

import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft, Play, Shuffle, UserPlus, UserCheck, Users, Music,
  Check, Share2, MoreHorizontal, Headphones, Disc3, Clock, TrendingUp,
  Calendar, Heart, Loader2,
} from "lucide-react";
import { useAppStore, type FavoriteArtist } from "@/store/useAppStore";
import { type Track, formatDuration } from "@/lib/musicApi";
import { Skeleton } from "@/components/ui/skeleton";
import TrackCard from "./TrackCard";
import ArtistCard from "./ArtistCard";

export interface ArtistInfo {
  name: string;
  avatar?: string;
  followers?: number;
  genre?: string;
  trackCount?: number;
}

interface ArtistDetailViewProps {
  artist: ArtistInfo;
  onBack: () => void;
  compactMode: boolean;
  animationsEnabled: boolean;
}

type ArtistTab = "all" | "popular" | "releases";

function ArtistDetailViewBase({
  artist,
  onBack,
  compactMode,
  animationsEnabled,
}: ArtistDetailViewProps) {
  // ── Store ──
  const playTrack = useAppStore((s) => s.playTrack);
  const favoriteArtists = useAppStore((s) => s.favoriteArtists);
  const addFavoriteArtist = useAppStore((s) => s.addFavoriteArtist);
  const removeFavoriteArtist = useAppStore((s) => s.removeFavoriteArtist);
  const setView = useAppStore((s) => s.setView);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);

  // ── Local state ──
  const [tracks, setTracks] = useState<Track[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [similarArtists, setSimilarArtists] = useState<{ name: string; avatar?: string; followers?: number }[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [tab, setTab] = useState<ArtistTab>("all");
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [artistInfo, setArtistInfo] = useState<ArtistInfo>(artist);

  // Track if artist changed (avoid refetch on re-renders)
  // NOTE: only depend on primitive fields to avoid infinite re-render when
  // parent passes a new object reference with the same name/avatar.
  const artistKey = `${artist.name}::${artist.avatar || ""}::${artist.followers || 0}`;

  // Keep local artistInfo in sync with the prop — but only when the
  // identifying key actually changes. This prevents the previous infinite
  // setArtistInfo → re-render → useEffect → setArtistInfo loop that
  // triggered React error #300.
  useEffect(() => {
    setArtistInfo(artist);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistKey]);

  // ── Fetch artist tracks ──
  useEffect(() => {
    if (!artist.name) return;
    let cancelled = false;
    const run = async () => {
      // Defer setState to next macrotask to avoid React error #300
      // (cannot update a component while rendering a different component).
      // setTimeout(0) is safer than queueMicrotask here — microtasks run
      // before the next render commit, macrotasks run after.
      setTimeout(() => {
        if (cancelled) return;
        setTracksLoading(true);
        setTracks([]);
      }, 0);
      try {
        const res = await fetch(`/api/music/artist-tracks?q=${encodeURIComponent(artist.name)}&limit=30`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setTracks(data.tracks || []);
        if (data.artist) {
          setArtistInfo(prev => ({
            ...prev,
            avatar: data.artist.avatar || prev.avatar,
            followers: data.artist.followers ?? prev.followers,
            genre: data.artist.genre || prev.genre,
            trackCount: data.artist.trackCount ?? prev.trackCount,
          }));
        }
      } catch {
        if (!cancelled) setTracks([]);
      } finally {
        if (!cancelled) setTracksLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [artist.name]);

  // ── Fetch similar artists ──
  useEffect(() => {
    if (!artist.name) return;
    let cancelled = false;
    const run = async () => {
      setTimeout(() => {
        if (!cancelled) setSimilarLoading(true);
      }, 0);
      try {
        const res = await fetch(`/api/music/search?q=${encodeURIComponent(artist.name)}&limit=15`);
        const data = await res.json();
        if (cancelled) return;
        const tracksList: Track[] = data.tracks || [];
        const map = new Map<string, { name: string; avatar?: string; followers?: number }>();
        for (const t of tracksList) {
          if (t.artist && t.artist.toLowerCase() !== artist.name.toLowerCase()) {
            if (!map.has(t.artist)) {
              map.set(t.artist, { name: t.artist, avatar: t.cover });
            }
          }
        }
        setSimilarArtists(Array.from(map.values()).slice(0, 10));
      } catch {
        if (!cancelled) setSimilarArtists([]);
      } finally {
        if (!cancelled) setSimilarLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [artist.name]);

  // ── Derived data ──
  const isSubscribed = useMemo(
    () => favoriteArtists.some(a => a.username.toLowerCase() === artistInfo.name.toLowerCase()),
    [favoriteArtists, artistInfo.name]
  );

  const isVerified = (artistInfo.followers || 0) >= 100_000;

  const popularTracks = useMemo(
    () => [...tracks].sort((a: any, b: any) => (b.playbackCount || 0) - (a.playbackCount || 0)),
    [tracks]
  );

  // Top 5 by play count — highlighted in separate section above the full list
  const top5 = useMemo(() => popularTracks.slice(0, 5), [popularTracks]);
  const top5Ids = useMemo(() => new Set(top5.map(t => t.id)), [top5]);

  const releaseTracks = useMemo(() => {
    const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;
    return tracks.filter((t: any) => {
      if (t.createdAt) return new Date(t.createdAt).getTime() > twoYearsAgo;
      return true;
    });
  }, [tracks]);

  // For "all" tab, exclude top-5 to avoid duplication with the Popular section above.
  // For "popular" tab, show all sorted (user explicitly wants popular).
  // For "releases" tab, show releases sorted by date desc.
  const displayTracks = useMemo(() => {
    if (tab === "popular") return popularTracks;
    if (tab === "releases") return releaseTracks;
    return tracks.filter(t => !top5Ids.has(t.id));
  }, [tab, popularTracks, releaseTracks, tracks, top5Ids]);

  const totalDuration = useMemo(() => {
    const sec = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h} ч ${m} мин`;
    return `${m} мин`;
  }, [tracks]);

  // ── Handlers ──
  const handleToggleSubscribe = useCallback(() => {
    if (isSubscribed) {
      const fav = favoriteArtists.find(a => a.username.toLowerCase() === artistInfo.name.toLowerCase());
      if (fav) removeFavoriteArtist(fav.id);
    } else {
      addFavoriteArtist({
        id: Date.now(),
        username: artistInfo.name,
        avatar: artistInfo.avatar || "",
        genre: artistInfo.genre || "",
        followers: artistInfo.followers || 0,
        trackCount: artistInfo.trackCount || 0,
      } as FavoriteArtist);
    }
  }, [isSubscribed, favoriteArtists, artistInfo, addFavoriteArtist, removeFavoriteArtist]);

  const handlePlayAll = useCallback(() => {
    if (displayTracks.length > 0) playTrack(displayTracks[0], displayTracks);
  }, [displayTracks, playTrack]);

  const handleShuffle = useCallback(() => {
    if (displayTracks.length === 0) return;
    const s = [...displayTracks];
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [s[i], s[j]] = [s[j], s[i]];
    }
    playTrack(s[0], s);
  }, [displayTracks, playTrack]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/artist/${encodeURIComponent(artistInfo.name)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: artistInfo.name, url });
      } else {
        await navigator.clipboard.writeText(url);
      }
    } catch {}
  }, [artistInfo.name]);

  const handleArtistTrackClick = useCallback((artistName: string, coverUrl?: string) => {
    if (artistName.toLowerCase() !== artistInfo.name.toLowerCase()) {
      useAppStore.getState().setSelectedArtist({ name: artistName, avatar: coverUrl });
    }
  }, [artistInfo.name]);

  const formatFollowers = (n?: number) => {
    if (!n || n <= 0) return null;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  const formatPlayCount = (n: number) => {
    if (!n || n <= 0) return null;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  // ── Top 5 popular tracks (highlighted) — declared above as memoized value ──

  return (
    <div className={`${compactMode ? "pb-[var(--mq-player-clearance)] sm:pb-24 lg:pb-24" : "pb-[var(--mq-player-clearance)] sm:pb-24 lg:pb-28"} max-w-[var(--mq-container-wide)] mx-auto`}>
      {/* ═══════════════════════════════════════════════════════════════
          HERO — full-bleed blurred cover backdrop + cinematic gradient
          ═══════════════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden -mx-4 sm:-mx-6 lg:-mx-10 -mt-4 sm:-mt-6 lg:-mt-8 mb-6">
        {/* Blurred background */}
        <div className="absolute inset-0 z-0">
          {artistInfo.avatar ? (
            <img
              src={artistInfo.avatar}
              alt=""
              className="w-full h-full object-cover scale-125 blur-3xl opacity-50"
              aria-hidden
            />
          ) : (
            <div className="w-full h-full" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 30%, var(--mq-bg)), var(--mq-bg))" }} />
          )}
          {/* Dark gradient overlay for text contrast */}
          <div className="absolute inset-0" style={{
            background: "linear-gradient(180deg, color-mix(in srgb, var(--mq-bg) 50%, transparent) 0%, color-mix(in srgb, var(--mq-bg) 80%, transparent) 60%, var(--mq-bg) 100%)",
          }} />
          {/* Accent tint */}
          <div className="absolute inset-0" style={{
            background: `radial-gradient(ellipse at 30% 30%, color-mix(in srgb, var(--mq-accent) 15%, transparent), transparent 60%)`,
          }} />
        </div>

        <div className="relative z-10 px-4 sm:px-6 lg:px-10 pt-4 pb-6">
          {/* Top bar: back + share */}
          <div className="flex items-center justify-between mb-6">
            <motion.button
              initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
              animate={{ opacity: 1, x: 0 }}
              whileTap={{ scale: 0.9 }}
              onClick={onBack}
              className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-full"
              style={{
                color: "var(--mq-text)",
                backgroundColor: "color-mix(in srgb, var(--mq-bg) 70%, transparent)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid var(--mq-glass-border)",
              }}
              aria-label="Назад"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-xs font-medium">Назад</span>
            </motion.button>

            <div className="flex items-center gap-2">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleShare}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{
                  color: "var(--mq-text)",
                  backgroundColor: "color-mix(in srgb, var(--mq-bg) 70%, transparent)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  border: "1px solid var(--mq-glass-border)",
                }}
                aria-label="Поделиться"
              >
                <Share2 className="w-4 h-4" />
              </motion.button>
              <div className="relative">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  className="w-9 h-9 rounded-full flex items-center justify-center"
                  style={{
                    color: "var(--mq-text)",
                    backgroundColor: "color-mix(in srgb, var(--mq-bg) 70%, transparent)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    border: "1px solid var(--mq-glass-border)",
                  }}
                  aria-label="Ещё"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </motion.button>
                {showMoreMenu && (
                  <div className="absolute right-0 top-full mt-1 z-30 rounded-xl py-1 min-w-[180px] shadow-2xl"
                    style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>
                    <button
                      onClick={() => { setView("search"); setSearchQuery(artistInfo.name); setShowMoreMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-colors"
                      style={{ color: "var(--mq-text)" }}
                    >
                      <Music className="w-3.5 h-3.5" /> Найти похожее
                    </button>
                    <button
                      onClick={() => { handleShare(); setShowMoreMenu(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-colors"
                      style={{ color: "var(--mq-text)" }}
                    >
                      <Share2 className="w-3.5 h-3.5" /> Поделиться
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main hero content */}
          <motion.div
            initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col sm:flex-row items-center sm:items-end gap-5 sm:gap-6"
          >
            {/* Avatar — circular on mobile, rounded square on desktop */}
            <div className="relative flex-shrink-0">
              {/* Glow ring */}
              <div className="absolute -inset-2 rounded-full blur-xl"
                style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--mq-accent) 30%, transparent), transparent 70%)" }}
                aria-hidden
              />
              <div
                className="relative w-32 h-32 sm:w-40 sm:h-40 lg:w-44 lg:h-44 rounded-full sm:rounded-3xl overflow-hidden flex items-center justify-center"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--mq-accent) 30%, var(--mq-card))",
                  boxShadow: "var(--mq-shadow-elevated), 0 0 0 2px color-mix(in srgb, var(--mq-accent) 20%, transparent)",
                }}
              >
                {artistInfo.avatar ? (
                  <img src={artistInfo.avatar} alt={artistInfo.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl lg:text-5xl font-bold" style={{ color: "var(--mq-text)" }}>
                    {artistInfo.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em]"
                  style={{ color: "var(--mq-text-muted)" }}>
                  Артист
                </span>
                {isVerified && (
                  <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>
                    <Check className="w-2.5 h-2.5" strokeWidth={3} />
                    Проверен
                  </span>
                )}
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-3 leading-tight"
                style={{
                  color: "var(--mq-text)",
                  letterSpacing: "-0.02em",
                  fontSize: "var(--mq-text-headline)",
                }}>
                {artistInfo.name}
              </h1>
              {/* Stats row */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-4">
                {formatFollowers(artistInfo.followers) && (
                  <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "var(--mq-text)" }}>
                    <Users className="w-3 h-3" />
                    {formatFollowers(artistInfo.followers)} подписчиков
                  </span>
                )}
                {artistInfo.genre && (
                  <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{ border: "1px solid var(--mq-border)", color: "var(--mq-text-muted)" }}>
                    <Disc3 className="w-3 h-3" />
                    {artistInfo.genre}
                  </span>
                )}
                {tracks.length > 0 && (
                  <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{ border: "1px solid var(--mq-border)", color: "var(--mq-text-muted)" }}>
                    <Music className="w-3 h-3" />
                    {tracks.length} треков
                  </span>
                )}
                {tracks.length > 0 && (
                  <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{ border: "1px solid var(--mq-border)", color: "var(--mq-text-muted)" }}>
                    <Clock className="w-3 h-3" />
                    {totalDuration}
                  </span>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={handlePlayAll}
                  disabled={tracks.length === 0 || tracksLoading}
                  className="flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-full text-sm font-semibold cursor-pointer disabled:opacity-40 transition-all"
                  style={{
                    backgroundColor: "var(--mq-accent)",
                    color: "var(--mq-text)",
                    boxShadow: "var(--mq-shadow-accent)",
                  }}
                >
                  <Play className="w-4 h-4" fill="currentColor" style={{ marginLeft: 1 }} />
                  Слушать
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={handleShuffle}
                  disabled={tracks.length === 0 || tracksLoading}
                  className="flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-full cursor-pointer disabled:opacity-40 transition-all"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--mq-card) 80%, transparent)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    border: "1px solid var(--mq-border)",
                    color: "var(--mq-text)",
                  }}
                  aria-label="Перемешать"
                >
                  <Shuffle className="w-4 h-4" />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={handleToggleSubscribe}
                  className="flex items-center gap-2 px-4 py-2.5 sm:py-3 rounded-full text-sm font-medium cursor-pointer transition-all"
                  style={{
                    backgroundColor: isSubscribed
                      ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)"
                      : "color-mix(in srgb, var(--mq-card) 80%, transparent)",
                    color: isSubscribed ? "var(--mq-accent)" : "var(--mq-text)",
                    border: `1px solid ${isSubscribed ? "var(--mq-accent)" : "var(--mq-border)"}`,
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                  }}
                >
                  {isSubscribed ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                  <span className="hidden sm:inline">{isSubscribed ? "Вы подписаны" : "Подписаться"}</span>
                  <span className="sm:hidden">{isSubscribed ? "Подписка" : "Подписаться"}</span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          TOP 5 — highlighted "Популярное" section
          ═══════════════════════════════════════════════════════════════ */}
      {!tracksLoading && top5.length > 0 && (
        <div className={`${compactMode ? "px-3 lg:px-4" : "px-4 lg:px-6"} mb-6`}>
          <h2 className="flex items-center gap-2 text-base sm:text-lg font-bold mb-3" style={{ color: "var(--mq-text)" }}>
            <TrendingUp className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
            Популярное
          </h2>
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--mq-card)" }}>
            {top5.map((track, i) => {
              const isCurrentlyPlaying = currentTrack?.id === track.id;
              const isLiked = likedTrackIds.includes(track.id);
              const playCount = formatPlayCount((track as any).playbackCount || 0);
              return (
                <div
                  key={track.id}
                  className="group/track flex items-center gap-2 px-2 sm:px-3 py-2 transition-colors relative"
                  style={{
                    backgroundColor: isCurrentlyPlaying
                      ? "color-mix(in srgb, var(--mq-accent) 8%, transparent)"
                      : "transparent",
                    borderBottom: i < top5.length - 1
                      ? "1px solid color-mix(in srgb, var(--mq-border) 50%, transparent)"
                      : "none",
                  }}
                >
                  {/* Rank */}
                  <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 cursor-pointer"
                    onClick={() => {
                      if (isCurrentlyPlaying) {
                        useAppStore.getState().togglePlay();
                      } else {
                        playTrack(track, top5);
                      }
                    }}
                  >
                    {isCurrentlyPlaying ? (
                      <motion.span className="flex items-end gap-[2px] h-3.5" style={{ color: "var(--mq-accent)" }} aria-hidden>
                        {[0, 0.15, 0.3].map((delay, idx) => (
                          <motion.span
                            key={idx}
                            className="w-[2px] rounded-full"
                            style={{ backgroundColor: "var(--mq-accent)", height: "100%", transformOrigin: "bottom" }}
                            animate={{ scaleY: [0.4, 1, 0.6, 0.8, 0.4] }}
                            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", delay }}
                          />
                        ))}
                      </motion.span>
                    ) : (
                      <>
                        <span
                          className="text-sm tabular-nums font-bold group-hover/track:hidden"
                          style={{ color: "var(--mq-accent)", opacity: 0.7 }}>
                          {i + 1}
                        </span>
                        <Play
                          className="absolute inset-0 m-auto w-4 h-4 opacity-0 group-hover/track:opacity-100 transition-opacity"
                          style={{ color: "var(--mq-text)" }}
                          fill="currentColor"
                        />
                      </>
                    )}
                  </div>

                  {/* Cover */}
                  <div className="flex-shrink-0 w-10 h-10 rounded-md overflow-hidden"
                    style={{ backgroundColor: "var(--mq-input-bg)" }}>
                    {track.cover ? (
                      <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
                      </div>
                    )}
                  </div>

                  {/* Title + artist (artist usually same, but show for clarity) */}
                  <div className="min-w-0 flex-1 cursor-pointer"
                    onClick={() => { if (!isCurrentlyPlaying) playTrack(track, top5); }}>
                    <div
                      className="text-sm font-medium truncate leading-tight"
                      style={{
                        color: isCurrentlyPlaying ? "var(--mq-accent)" : "var(--mq-text)",
                        fontWeight: isCurrentlyPlaying ? 600 : 500,
                      }}
                      title={track.title}>
                      {track.title}
                    </div>
                    {playCount && (
                      <div className="flex items-center gap-1 text-[11px] mt-0.5"
                        style={{ color: "var(--mq-text-muted)" }}>
                        <Headphones className="w-2.5 h-2.5" />
                        {playCount} прослушиваний
                      </div>
                    )}
                  </div>

                  {/* Duration */}
                  <span className="hidden sm:block flex-shrink-0 w-12 text-[11px] tabular-nums text-right pr-1"
                    style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
                    {formatDuration(track.duration)}
                  </span>

                  {/* Like */}
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => { e.stopPropagation(); useAppStore.getState().toggleLike(track.id, track); }}
                    className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors"
                    style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
                    aria-label={isLiked ? "Убрать из любимых" : "В любимые"}
                  >
                    <Heart className="w-4 h-4" fill={isLiked ? "currentColor" : "none"} />
                  </motion.button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TABS — Все / Популярные / Релизы
          ═══════════════════════════════════════════════════════════════ */}
      <div className={`${compactMode ? "px-3 lg:px-4" : "px-4 lg:px-6"} mb-4`}>
        <div className="flex items-center gap-1 p-1 rounded-xl overflow-x-auto"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", scrollbarWidth: "none" }}>
          {([
            { id: "all" as const, label: "Все", count: tracks.length, icon: Music },
            { id: "popular" as const, label: "Популярные", count: popularTracks.length, icon: TrendingUp },
            { id: "releases" as const, label: "Релизы", count: releaseTracks.length, icon: Calendar },
          ]).map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-1.5 flex-shrink-0 py-2 px-3 sm:px-4 rounded-lg text-xs sm:text-sm font-medium cursor-pointer transition-all"
                style={{
                  backgroundColor: active ? "var(--mq-accent)" : "transparent",
                  color: active ? "var(--mq-text)" : "var(--mq-text-muted)",
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                <span className="ml-1 opacity-70 tabular-nums">{t.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          TRACK LIST — full list for the selected tab
          ═══════════════════════════════════════════════════════════════ */}
      <div className={`${compactMode ? "px-3 lg:px-4" : "px-4 lg:px-6"}`}>
        {tracksLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl" style={{ background: "var(--mq-card)" }}>
                <Skeleton className="w-full h-full rounded-xl" />
              </div>
            ))}
          </div>
        ) : displayTracks.length > 0 ? (
          <div className="space-y-1.5">
            {displayTracks.map((track, i) => (
              <TrackCard
                key={track.id}
                track={track}
                index={i}
                queue={displayTracks}
                onArtistClick={handleArtistTrackClick}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 rounded-2xl" style={{ backgroundColor: "var(--mq-card)" }}>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
              <Music className="w-8 h-8" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--mq-text-muted)" }}>
              Треки не найдены
            </p>
            <p className="text-xs mt-2" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
              Попробуйте поискать этого артиста вручную
            </p>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => { setView("search"); setSearchQuery(artistInfo.name); }}
              className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 rounded-xl text-sm font-medium"
              style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
            >
              <Music className="w-4 h-4" /> Найти
            </motion.button>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SIMILAR ARTISTS — horizontal scroll
          ═══════════════════════════════════════════════════════════════ */}
      {!similarLoading && similarArtists.length > 0 && (
        <div className={`${compactMode ? "px-3 lg:px-4" : "px-4 lg:px-6"} mt-10`}>
          <h2 className="flex items-center gap-2 text-base sm:text-lg font-bold mb-4" style={{ color: "var(--mq-text)" }}>
            <Users className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
            Вам может понравиться
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {similarArtists.map((a, idx) => {
              const sub = favoriteArtists.some(x => x.username.toLowerCase() === a.name.toLowerCase());
              return (
                <ArtistCard
                  key={a.name}
                  avatar={a.avatar}
                  username={a.name}
                  followers={a.followers}
                  isSubscribed={sub}
                  index={idx}
                  animationsEnabled={animationsEnabled}
                  size="md"
                  onClick={() => useAppStore.getState().setSelectedArtist({ name: a.name, avatar: a.avatar })}
                  onSubscribeClick={(e) => {
                    e.stopPropagation();
                    if (sub) {
                      const fav = favoriteArtists.find(x => x.username.toLowerCase() === a.name.toLowerCase());
                      if (fav) removeFavoriteArtist(fav.id);
                    } else {
                      addFavoriteArtist({
                        id: Date.now(),
                        username: a.name,
                        avatar: a.avatar || "",
                        genre: "",
                        followers: a.followers || 0,
                        trackCount: 0,
                      } as FavoriteArtist);
                    }
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Loading state for similar artists */}
      {similarLoading && (
        <div className={`${compactMode ? "px-3 lg:px-4" : "px-4 lg:px-6"} mt-10`}>
          <div className="flex items-center gap-2 mb-4">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-accent)" }} />
            <span className="text-sm" style={{ color: "var(--mq-text-muted)" }}>Ищем похожих артистов...</span>
          </div>
        </div>
      )}
    </div>
  );
}

// P2: memo prevents re-renders when MainView re-renders for unrelated reasons
// (e.g. progress tick) — only re-renders when artist/compactMode/animationsEnabled change.
const ArtistDetailView = memo(ArtistDetailViewBase);
export default ArtistDetailView;
