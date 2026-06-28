"use client";

import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, Play, Shuffle, UserPlus, UserCheck, Users, Music,
  Check, Share2, MoreHorizontal, Headphones, Disc3, Clock, TrendingUp,
  Calendar, Heart, Loader2, Pin,
} from "lucide-react";
import { useAppStore, type FavoriteArtist } from "@/store/useAppStore";
import { type Track, formatDuration } from "@/lib/musicApi";
import { Skeleton } from "@/components/ui/skeleton";
import TrackCard from "./TrackCard";
import { toast } from "@/hooks/use-toast";

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

type ArtistTab = "popular" | "all";

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
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const setView = useAppStore((s) => s.setView);
  const userId = useAppStore((s) => s.userId);

  // ── Local state ──
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ArtistTab>("popular");
  const [showAll, setShowAll] = useState(false);

  // ── Is favorite? ──
  const isFavorite = useMemo(() => {
    return favoriteArtists.some((a) => a.username === artist.name);
  }, [favoriteArtists, artist.name]);

  // ── Fetch tracks ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setTracks([]);
    setShowAll(false);

    const fetchTracks = async () => {
      try {
        const res = await fetch(`/api/music/artist-tracks?artist=${encodeURIComponent(artist.name)}&limit=50`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const fetched: Track[] = (data.tracks || []).map((t: any) => ({
          id: t.id || (t.scTrackId ? `sc_${t.scTrackId}` : `art_${Date.now()}_${Math.random()}`),
          title: t.title || t.name || "Unknown",
          artist: t.artist || artist.name,
          album: t.album || "",
          cover: t.cover || t.image || "",
          duration: t.duration || 0,
          genre: t.genre || artist.genre || "",
          audioUrl: t.audioUrl || "",
          previewUrl: t.previewUrl || "",
          source: "soundcloud" as const,
          scTrackId: t.scTrackId || null,
          scStreamPolicy: t.scStreamPolicy || "",
          scIsFull: t.scIsFull || false,
        }));
        setTracks(fetched);
      } catch (err) {
        if (!cancelled) setTracks([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchTracks();
    return () => { cancelled = true; };
  }, [artist.name, artist.genre]);

  // ── Top 5 popular (by duration < 6 min as proxy for "single") ──
  const popularTracks = useMemo(() => {
    return tracks.slice(0, 5);
  }, [tracks]);

  const displayedTracks = activeTab === "popular" && !showAll ? popularTracks : tracks;

  // ── Total duration ──
  const totalDuration = useMemo(() => {
    return tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  }, [tracks]);

  // ── Toggle favorite ──
  const handleToggleFavorite = useCallback(() => {
    if (isFavorite) {
      const fav = favoriteArtists.find((a) => a.username === artist.name);
      if (fav) {
        removeFavoriteArtist(fav.id);
        toast({ title: `Артист ${artist.name} удалён из избранного` });
      }
    } else {
      const newFav: FavoriteArtist = {
        id: Date.now(),
        username: artist.name,
        avatar: artist.avatar || "",
        genre: artist.genre || "",
        followers: artist.followers || 0,
        trackCount: tracks.length,
      };
      addFavoriteArtist(newFav);
      toast({ title: `Артист ${artist.name} добавлен в избранное` });
    }
  }, [isFavorite, favoriteArtists, artist, removeFavoriteArtist, addFavoriteArtist, tracks.length]);

  // ── Share ──
  const handleShare = useCallback(() => {
    const url = `${window.location.origin}/play?artist=${encodeURIComponent(artist.name)}`;
    if (navigator.share) {
      navigator.share({ title: artist.name, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        toast({ title: "Ссылка скопирована" });
      }).catch(() => {});
    }
  }, [artist.name]);

  // ── Play all ──
  const handlePlayAll = useCallback(() => {
    if (tracks.length === 0) return;
    playTrack(tracks[0], tracks);
  }, [tracks, playTrack]);

  // ── Shuffle ──
  const handleShuffle = useCallback(() => {
    if (tracks.length === 0) return;
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const state = useAppStore.getState();
    if (!state.shuffle) state.toggleShuffle();
    playTrack(shuffled[0], shuffled);
  }, [tracks, playTrack]);

  // ── Deterministic cover gradient ──
  const coverGradient = useMemo(() => {
    let h = 0;
    for (let i = 0; i < artist.name.length; i++) h = artist.name.charCodeAt(i) + ((h << 5) - h);
    const palettes: [string, string][] = [
      ["#2d1b3d", "#0e0e0e"],
      ["#1b2d3a", "#0e0e0e"],
      ["#3d2b1b", "#0e0e0e"],
      ["#1b3a2d", "#0e0e0e"],
      ["#3a1b2d", "#0e0e0e"],
      ["#2d2d1b", "#0e0e0e"],
    ];
    const p = palettes[Math.abs(h) % palettes.length];
    return `linear-gradient(135deg, ${p[0]}, ${p[1]})`;
  }, [artist.name]);

  return (
    <div className={`${compactMode ? "p-3 lg:p-4" : "p-4 lg:p-6"} max-w-[var(--mq-container-narrow)] mx-auto pb-32 lg:pb-28`}>
      {/* Back button */}
      <motion.button
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        whileTap={{ scale: 0.95 }}
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm mb-5"
        style={{ color: "var(--mq-text-muted)" }}
      >
        <ChevronLeft className="w-4 h-4" />
        Назад
      </motion.button>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* Hero header — cinematic */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 16 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative rounded-3xl overflow-hidden mb-6"
        style={{
          background: artist.avatar
            ? `linear-gradient(180deg, transparent 0%, var(--mq-bg) 100%), url(${artist.avatar}) center/cover`
            : coverGradient,
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          minHeight: 280,
        }}
      >
        {/* Dark overlay */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.85) 100%)" }} />

        {/* Noise texture */}
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.06, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", backgroundRepeat: "repeat", backgroundSize: "128px 128px" }} />

        <div className="relative p-6 sm:p-8 flex flex-col items-center text-center sm:flex-row sm:items-end sm:text-left gap-5" style={{ minHeight: 280 }}>
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="absolute -inset-2 rounded-full opacity-50" style={{ background: "linear-gradient(135deg, var(--mq-accent), rgba(255,255,255,0.15))" }} />
            {artist.avatar ? (
              <img
                src={artist.avatar}
                alt={artist.name}
                className="w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover relative z-10"
                style={{ border: "3px solid rgba(255,255,255,0.15)" }}
              />
            ) : (
              <div
                className="w-28 h-28 sm:w-32 sm:h-32 rounded-full flex items-center justify-center font-bold relative z-10"
                style={{
                  background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))",
                  color: "#fff",
                  fontSize: 48,
                  border: "3px solid rgba(255,255,255,0.15)",
                }}
              >
                {artist.name.charAt(0).toUpperCase()}
              </div>
            )}
            {/* Verified-style accent dot */}
            <div
              className="absolute bottom-2 right-2 w-6 h-6 rounded-full flex items-center justify-center z-20"
              style={{ backgroundColor: "var(--mq-accent)", border: "2px solid var(--mq-bg)" }}
            >
              <Check className="w-3 h-3" style={{ color: "#fff" }} />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 justify-center sm:justify-start">
              <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>
                Артист
              </span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-3 break-words" style={{ letterSpacing: "-0.03em" }}>
              {artist.name}
            </h1>
            <div className="flex items-center gap-4 text-xs flex-wrap justify-center sm:justify-start" style={{ color: "rgba(255,255,255,0.7)" }}>
              {artist.genre && (
                <span className="flex items-center gap-1">
                  <Disc3 className="w-3 h-3" />
                  {artist.genre}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Music className="w-3 h-3" />
                {tracks.length} треков
              </span>
              {artist.followers && artist.followers > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {formatFollowers(artist.followers)}
                </span>
              )}
              {totalDuration > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTotalDuration(totalDuration)}
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-5 justify-center sm:justify-start">
              <motion.button
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.04 }}
                onClick={handlePlayAll}
                disabled={tracks.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm shadow-lg"
                style={{
                  backgroundColor: "var(--mq-accent)",
                  color: "#fff",
                  opacity: tracks.length === 0 ? 0.4 : 1,
                }}
              >
                <Play className="w-4 h-4" fill="currentColor" />
                Слушать
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.04 }}
                onClick={handleShuffle}
                disabled={tracks.length === 0}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: "rgba(255,255,255,0.12)",
                  color: "#fff",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  opacity: tracks.length === 0 ? 0.4 : 1,
                }}
              >
                <Shuffle className="w-4 h-4" />
                Перемешать
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.04 }}
                onClick={handleToggleFavorite}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: isFavorite ? "color-mix(in srgb, var(--mq-accent) 25%, transparent)" : "rgba(255,255,255,0.12)",
                  color: isFavorite ? "var(--mq-accent)" : "#fff",
                  border: isFavorite ? "1px solid color-mix(in srgb, var(--mq-accent) 35%, transparent)" : "1px solid rgba(255,255,255,0.15)",
                }}
              >
                {isFavorite ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                <span className="hidden sm:inline">{isFavorite ? "В избранном" : "В избранное"}</span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.04 }}
                onClick={handleShare}
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: "rgba(255,255,255,0.12)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
                aria-label="Поделиться"
              >
                <Share2 className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* Tabs */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {tracks.length > 5 && (
        <div className="flex gap-1 p-1 rounded-2xl mb-5" style={{ backgroundColor: "var(--mq-card)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <button
            onClick={() => setActiveTab("popular")}
            className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
            style={{
              backgroundColor: activeTab === "popular" ? "var(--mq-accent)" : "transparent",
              color: activeTab === "popular" ? "#fff" : "var(--mq-text-muted)",
            }}
          >
            Популярное
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
            style={{
              backgroundColor: activeTab === "all" ? "var(--mq-accent)" : "transparent",
              color: activeTab === "all" ? "#fff" : "var(--mq-text-muted)",
            }}
          >
            Все треки ({tracks.length})
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* Track list */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--mq-card)" }}>
              <Skeleton className="w-12 h-12 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      ) : tracks.length === 0 ? (
        <div className="text-center py-12 rounded-2xl" style={{ backgroundColor: "var(--mq-card)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <Music className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
          <p className="text-sm font-medium mb-1" style={{ color: "var(--mq-text)" }}>Треки не найдены</p>
          <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
            Попробуйте позже или найдите артиста через поиск
          </p>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setView("search")}
            className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold"
            style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
          >
            Открыть поиск
          </motion.button>
        </div>
      ) : (
        <div className="space-y-1">
          <AnimatePresence mode="popLayout">
            {displayedTracks.map((track, i) => {
              const isCurrent = currentTrack?.id === track.id;
              const isLiked = likedTrackIds.includes(track.id);
              return (
                <motion.div
                  key={track.id}
                  initial={animationsEnabled ? { opacity: 0, y: 6 } : undefined}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                >
                  <TrackRow
                    track={track}
                    index={i + 1}
                    isCurrent={isCurrent}
                    isPlaying={isCurrent && isPlaying}
                    isLiked={isLiked}
                    onPlay={() => playTrack(track, displayedTracks)}
                    onLike={() => toggleLike(track.id, track)}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Show more button */}
          {activeTab === "popular" && !showAll && tracks.length > 5 && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => setShowAll(true)}
              className="w-full mt-3 py-3 rounded-xl text-sm font-medium"
              style={{
                backgroundColor: "var(--mq-card)",
                color: "var(--mq-accent)",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              Показать все {tracks.length} треков
            </motion.button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Track Row (premium) ──────────────────────────────────────────────────

interface TrackRowProps {
  track: Track;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  isLiked: boolean;
  onPlay: () => void;
  onLike: () => void;
}

function TrackRow({ track, index, isCurrent, isPlaying, isLiked, onPlay, onLike }: TrackRowProps) {
  const [hovering, setHovering] = useState(false);
  return (
    <motion.div
      onHoverStart={() => setHovering(true)}
      onHoverEnd={() => setHovering(false)}
      onClick={onPlay}
      className="group flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors"
      style={{
        backgroundColor: isCurrent ? "color-mix(in srgb, var(--mq-accent) 10%, transparent)" : "transparent",
      }}
      whileTap={{ scale: 0.99 }}
    >
      {/* Index / play icon */}
      <div className="w-7 flex-shrink-0 text-center">
        {isCurrent && isPlaying ? (
          <EqualizerIcon />
        ) : hovering ? (
          <Play className="w-3.5 h-3.5 mx-auto" style={{ color: "var(--mq-text)" }} fill="currentColor" />
        ) : (
          <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>{index}</span>
        )}
      </div>

      {/* Cover */}
      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: "var(--mq-card)" }}>
        {track.cover ? (
          <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{ color: isCurrent ? "var(--mq-accent)" : "var(--mq-text)" }}
        >
          {track.title}
        </p>
        <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>
          {track.album || track.artist}
        </p>
      </div>

      {/* Like */}
      <button
        onClick={(e) => { e.stopPropagation(); onLike(); }}
        className="p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ opacity: isLiked ? 1 : undefined }}
      >
        <Heart
          className="w-4 h-4"
          style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
          fill={isLiked ? "currentColor" : "none"}
        />
      </button>

      {/* Duration */}
      <div className="hidden sm:block text-xs flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>
        {formatDuration(track.duration)}
      </div>
    </motion.div>
  );
}

// ─── Equalizer icon (when playing) ────────────────────────────────────────

function EqualizerIcon() {
  return (
    <div className="w-3.5 h-3.5 flex items-end justify-center gap-[2px]">
      {[0, 1, 2, 3].map(i => (
        <motion.span
          key={i}
          className="w-[2px] rounded-full"
          style={{ backgroundColor: "currentColor", height: "100%" }}
          animate={{ scaleY: [0.3, 1, 0.3] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatTotalDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `~${h} ч`;
  return `~${m} мин`;
}

// ─── Memoized export ──────────────────────────────────────────────────────

const ArtistDetailView = memo(ArtistDetailViewBase);
export default ArtistDetailView;
