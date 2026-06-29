"use client";

import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, Play, Shuffle, UserPlus, UserCheck, Users, Music,
  Share2, Heart, Loader2, Disc3, Clock,
} from "lucide-react";
import { useAppStore, type FavoriteArtist } from "@/store/useAppStore";
import { type Track, formatDuration } from "@/lib/musicApi";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

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

function ArtistDetailViewBase({
  artist,
  onBack,
  compactMode,
  animationsEnabled,
}: ArtistDetailViewProps) {
  const playTrack = useAppStore((s) => s.playTrack);
  const favoriteArtists = useAppStore((s) => s.favoriteArtists);
  const addFavoriteArtist = useAppStore((s) => s.addFavoriteArtist);
  const removeFavoriteArtist = useAppStore((s) => s.removeFavoriteArtist);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const setView = useAppStore((s) => s.setView);
  const { toast } = useToast();

  // ── State ──
  const [tracks, setTracks] = useState<Track[]>([]);
  const [artistInfo, setArtistInfo] = useState<ArtistInfo>(artist);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const artistKey = `${artist.name}::${artist.avatar || ""}`;

  useEffect(() => {
    setArtistInfo(artist);
  }, [artistKey]); // eslint-disable-line

  // ── Fetch tracks: try artist-tracks API, fallback to search ──
  useEffect(() => {
    if (!artist.name) return;
    let cancelled = false;

    const fetchTracks = async () => {
      setLoading(true);
      setTracks([]);
      setShowAll(false);

      try {
        // Try artist-tracks API first
        const res = await fetch(`/api/music/artist-tracks?q=${encodeURIComponent(artist.name)}&limit=50`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            const fetched: Track[] = (data.tracks || []).map((t: any) => ({
              id: t.id || (t.scTrackId ? `sc_${t.scTrackId}` : `art_${Date.now()}_${Math.random()}`),
              title: t.title || t.name || "Unknown",
              artist: t.artist || artist.name,
              album: t.album || "",
              cover: t.cover || t.image || "",
              duration: t.duration || 0,
              genre: t.genre || "",
              audioUrl: t.audioUrl || "",
              previewUrl: t.previewUrl || "",
              source: "soundcloud" as const,
              scTrackId: t.scTrackId || null,
              scStreamPolicy: t.scStreamPolicy || "",
              scIsFull: t.scIsFull || false,
            }));
            if (fetched.length > 0) {
              setTracks(fetched);
              if (data.artist) {
                setArtistInfo(prev => ({
                  ...prev,
                  avatar: data.artist.avatar || prev.avatar,
                  followers: data.artist.followers ?? prev.followers,
                  genre: data.artist.genre || prev.genre,
                  trackCount: data.artist.trackCount ?? fetched.length,
                }));
              }
              return;
            }
          }
        }

        // Fallback: search for tracks by this artist
        const searchRes = await fetch(`/api/music/search?q=${encodeURIComponent(artist.name)}&limit=30`);
        if (searchRes.ok && !cancelled) {
          const searchData = await searchRes.json();
          const searchTracks: Track[] = (searchData.tracks || [])
            .filter((t: any) => {
              const tArtist = (t.artist || "").toLowerCase();
              const aName = artist.name.toLowerCase();
              return tArtist === aName || tArtist.includes(aName) || aName.includes(tArtist);
            })
            .map((t: any) => ({
              id: t.id || (t.scTrackId ? `sc_${t.scTrackId}` : `search_${Date.now()}_${Math.random()}`),
              title: t.title || "Unknown",
              artist: t.artist || artist.name,
              album: t.album || "",
              cover: t.cover || "",
              duration: t.duration || 0,
              genre: t.genre || "",
              audioUrl: t.audioUrl || "",
              previewUrl: "",
              source: "soundcloud" as const,
              scTrackId: t.scTrackId || null,
              scStreamPolicy: t.scStreamPolicy || "",
              scIsFull: t.scIsFull || false,
            }));
          setTracks(searchTracks);
        }
      } catch {
        if (!cancelled) setTracks([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchTracks();
    return () => { cancelled = true; };
  }, [artist.name]);

  // ── Popular tracks (top 5) ──
  const popularTracks = useMemo(() => tracks.slice(0, 5), [tracks]);
  const displayedTracks = showAll ? tracks : popularTracks;

  // ── Is favorite ──
  const isFavorite = useMemo(() =>
    favoriteArtists.some(a => a.username === artist.name),
  [favoriteArtists, artist.name]);

  // ── Toggle favorite ──
  const handleToggleFavorite = useCallback(() => {
    if (isFavorite) {
      const fav = favoriteArtists.find(a => a.username === artist.name);
      if (fav) {
        removeFavoriteArtist(fav.id);
        toast({ title: "Удалён из избранного" });
      }
    } else {
      addFavoriteArtist({
        id: Date.now(),
        username: artist.name,
        avatar: artistInfo.avatar || "",
        genre: artistInfo.genre || "",
        followers: artistInfo.followers || 0,
        trackCount: tracks.length,
      });
      toast({ title: "Добавлен в избранное" });
    }
  }, [isFavorite, favoriteArtists, artist.name, artistInfo, tracks.length, removeFavoriteArtist, addFavoriteArtist, toast]);

  // ── Play all ──
  const handlePlayAll = useCallback(() => {
    if (tracks.length > 0) playTrack(tracks[0], tracks);
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

  // ── Share ──
  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/play?artist=${encodeURIComponent(artist.name)}`;
    if (navigator.share) {
      try { await navigator.share({ title: artist.name, url }); } catch {}
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => toast({ title: "Ссылка скопирована" }));
    }
  }, [artist.name, toast]);

  // ── Cover gradient ──
  const coverGradient = useMemo(() => {
    let h = 0;
    for (let i = 0; i < artist.name.length; i++) h = artist.name.charCodeAt(i) + ((h << 5) - h);
    const palettes: [string, string][] = [
      ["#2d1b3d", "#0e0e0e"], ["#1b2d3a", "#0e0e0e"], ["#3d2b1b", "#0e0e0e"],
      ["#1b3a2d", "#0e0e0e"], ["#3a1b2d", "#0e0e0e"], ["#2d2d1b", "#0e0e0e"],
    ];
    const p = palettes[Math.abs(h) % palettes.length];
    return `linear-gradient(135deg, ${p[0]}, ${p[1]})`;
  }, [artist.name]);

  return (
    <div className={`${compactMode ? "p-3 lg:p-4" : "p-4 lg:p-6"} max-w-[var(--mq-container-narrow)] mx-auto pb-32 lg:pb-28`}>
      {/* Back */}
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

      {/* ════ HERO ════ */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 16 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative rounded-3xl overflow-hidden mb-6"
        style={{
          background: artistInfo.avatar
            ? `linear-gradient(180deg, transparent 0%, var(--mq-bg) 100%), url(${artistInfo.avatar}) center/cover`
            : coverGradient,
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
          minHeight: 260,
        }}
      >
        {/* Dark overlay */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.85) 100%)" }} />

        <div className="relative p-5 sm:p-7 flex flex-col items-center text-center sm:flex-row sm:items-end sm:text-left gap-5" style={{ minHeight: 260 }}>
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="absolute -inset-2 rounded-full opacity-50" style={{ background: "linear-gradient(135deg, var(--mq-accent), rgba(255,255,255,0.15))" }} />
            {artistInfo.avatar ? (
              <img src={artistInfo.avatar} alt={artist.name} className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover relative z-10" style={{ border: "3px solid rgba(255,255,255,0.15)" }} />
            ) : (
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center font-bold relative z-10"
                style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))", color: "#fff", fontSize: 40, border: "3px solid rgba(255,255,255,0.15)" }}>
                {artist.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <span className="mq-text-eyebrow text-[10px] block mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>Артист</span>
            <h1 className="mq-text-display text-2xl sm:text-3xl lg:text-4xl text-white mb-2 break-words" style={{ letterSpacing: "-0.03em" }}>{artist.name}</h1>
            <div className="flex items-center gap-3 text-xs flex-wrap justify-center sm:justify-start" style={{ color: "rgba(255,255,255,0.6)" }}>
              {artistInfo.genre && <span className="flex items-center gap-1"><Disc3 className="w-3 h-3" />{artistInfo.genre}</span>}
              <span className="flex items-center gap-1"><Music className="w-3 h-3" />{tracks.length} треков</span>
              {artistInfo.followers ? <span className="flex items-center gap-1"><Users className="w-3 h-3" />{formatFollowers(artistInfo.followers)}</span> : null}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-4 justify-center sm:justify-start">
              <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.04 }} onClick={handlePlayAll} disabled={tracks.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm"
                style={{ backgroundColor: "var(--mq-accent)", color: "#fff", opacity: tracks.length === 0 ? 0.4 : 1, boxShadow: "0 4px 16px color-mix(in srgb, var(--mq-accent) 35%, transparent)" }}>
                <Play className="w-4 h-4" fill="currentColor" /> Слушать
              </motion.button>
              <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.04 }} onClick={handleShuffle} disabled={tracks.length === 0}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium"
                style={{ backgroundColor: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", opacity: tracks.length === 0 ? 0.4 : 1 }}>
                <Shuffle className="w-4 h-4" /> Перемешать
              </motion.button>
              <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.04 }} onClick={handleToggleFavorite}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium"
                style={{ backgroundColor: isFavorite ? "color-mix(in srgb, var(--mq-accent) 25%, transparent)" : "rgba(255,255,255,0.12)",
                  color: isFavorite ? "var(--mq-accent)" : "#fff",
                  border: isFavorite ? "1px solid color-mix(in srgb, var(--mq-accent) 35%, transparent)" : "1px solid rgba(255,255,255,0.15)" }}>
                {isFavorite ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                <span className="hidden sm:inline">{isFavorite ? "В избранном" : "В избранное"}</span>
              </motion.button>
              <motion.button whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.04 }} onClick={handleShare}
                className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" }}>
                <Share2 className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ════ TRACKS ════ */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--mq-card)" }}>
              <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-2.5 w-1/3" /></div>
            </div>
          ))}
        </div>
      ) : tracks.length === 0 ? (
        <div className="text-center py-12 rounded-2xl" style={{ backgroundColor: "var(--mq-card)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <Music className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
          <p className="text-sm font-medium mb-1" style={{ color: "var(--mq-text)" }}>Треки не найдены</p>
          <p className="text-xs mb-4" style={{ color: "var(--mq-text-muted)" }}>Попробуйте найти этого артиста через поиск</p>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setView("search"); }} className="px-4 py-2 rounded-xl text-xs font-semibold" style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}>
            Открыть поиск
          </motion.button>
        </div>
      ) : (
        <div>
          {/* Section header */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="mq-text-headline text-base sm:text-lg" style={{ color: "var(--mq-text)" }}>
              {showAll ? "Все треки" : "Популярное"}
            </h2>
            <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>{tracks.length} {pluralRu(tracks.length, "трек", "трека", "треков")}</span>
          </div>

          {/* Track list */}
          <div className="space-y-0.5">
            {displayedTracks.map((track, i) => {
              const isCurrent = currentTrack?.id === track.id;
              const isLiked = likedTrackIds.includes(track.id);
              return (
                <motion.div
                  key={track.id + "_" + i}
                  initial={animationsEnabled ? { opacity: 0, y: 4 } : undefined}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                >
                  <TrackRow
                    track={track}
                    index={i + 1}
                    isCurrent={!!isCurrent}
                    isPlaying={!!isCurrent && isPlaying}
                    isLiked={isLiked}
                    onPlay={() => playTrack(track, displayedTracks)}
                    onLike={() => toggleLike(track.id, track)}
                  />
                </motion.div>
              );
            })}
          </div>

          {/* Show more */}
          {!showAll && tracks.length > 5 && (
            <motion.button
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => setShowAll(true)}
              className="w-full mt-3 py-3 rounded-xl text-sm font-medium"
              style={{ backgroundColor: "var(--mq-card)", color: "var(--mq-accent)", border: "1px solid rgba(255,255,255,0.05)" }}
            >
              Показать все {tracks.length} треков
            </motion.button>
          )}
        </div>
      )}
    </div>
  );
}

// ════ TrackRow ════

function TrackRow({ track, index, isCurrent, isPlaying, isLiked, onPlay, onLike }: {
  track: Track; index: number; isCurrent: boolean; isPlaying: boolean; isLiked: boolean;
  onPlay: () => void; onLike: () => void;
}) {
  const [hovering, setHovering] = useState(false);
  return (
    <motion.div
      onHoverStart={() => setHovering(true)}
      onHoverEnd={() => setHovering(false)}
      onClick={onPlay}
      className="group flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors"
      style={{ backgroundColor: isCurrent ? "color-mix(in srgb, var(--mq-accent) 10%, transparent)" : "transparent" }}
      whileTap={{ scale: 0.99 }}
    >
      <div className="w-7 flex-shrink-0 text-center">
        {isCurrent && isPlaying ? (
          <div className="w-3.5 h-3.5 flex items-end justify-center gap-[2px]">
            {[0, 1, 2, 3].map(i => (
              <motion.span key={i} className="w-[2px] rounded-full" style={{ backgroundColor: "var(--mq-accent)", height: "100%" }}
                animate={{ scaleY: [0.3, 1, 0.3] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.12 }} />
            ))}
          </div>
        ) : hovering ? (
          <Play className="w-3.5 h-3.5 mx-auto" style={{ color: "var(--mq-text)" }} fill="currentColor" />
        ) : (
          <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>{index}</span>
        )}
      </div>
      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: "var(--mq-card)" }}>
        {track.cover ? (
          <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} /></div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] sm:text-sm font-medium truncate" style={{ color: isCurrent ? "var(--mq-accent)" : "var(--mq-text)" }}>{track.title}</p>
        <p className="text-[11px] sm:text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{track.album || track.artist}</p>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onLike(); }} className="p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ opacity: isLiked ? 1 : undefined }}>
        <Heart className="w-4 h-4" style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }} fill={isLiked ? "currentColor" : "none"} />
      </button>
      <div className="hidden sm:block text-xs flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(track.duration)}</div>
    </motion.div>
  );
}

// ════ Helpers ════

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

const ArtistDetailView = memo(ArtistDetailViewBase);
export default ArtistDetailView;
