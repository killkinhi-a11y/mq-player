"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion } from "framer-motion";
import { type Track, getRecommendations } from "@/lib/musicApi";
import TrackCard from "./TrackCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, MessageCircle, Clock, ListMusic, Music, Sparkles, RefreshCw, Play, Music2, ChevronLeft, Shuffle, Disc3 } from "lucide-react";

interface CuratedPlaylist {
  id: string;
  name: string;
  subtitle: string;
  gradient: string;
  tracks: Track[];
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Доброе утро!";
  if (hour >= 12 && hour < 17) return "Добрый день!";
  if (hour >= 17 && hour < 22) return "Добрый вечер!";
  return "Доброй ночи!";
}

function getGreetingSubtext(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Начните день с любимой музыки";
  if (hour >= 12 && hour < 17) return "Откройте для себя музыку, которая поднимет настроение";
  if (hour >= 17 && hour < 22) return "Расслабьтесь под любимые треки";
  return "Ночная музыка для уютного вечера";
}

export default function MainView() {
  const {
    animationsEnabled, playTrack, likedTrackIds, dislikedTrackIds, likedTracksData,
    history, playlists, setView, contacts, messages, userId, compactMode,
  } = useAppStore();

  const [trendingTracks, setTrendingTracks] = useState<Track[]>([]);
  const [recommendations, setRecommendations] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecLoading, setIsRecLoading] = useState(true);
  const [allUsersCount, setAllUsersCount] = useState(0);
  const [curatedPlaylists, setCuratedPlaylists] = useState<CuratedPlaylist[]>([]);
  const [curatedLoading, setCuratedLoading] = useState(true);
  const [selectedCurated, setSelectedCurated] = useState<CuratedPlaylist | null>(null);

  // Build taste profile from liked tracks + history
  const tasteProfile = useMemo(() => {
    const { likedTracksData, history, likedTrackIds, dislikedTrackIds, likedTracksData: likedData } = useAppStore.getState();
    const safeLiked = Array.isArray(likedTrackIds) ? likedTrackIds : [];
    const safeDisliked = Array.isArray(dislikedTrackIds) ? dislikedTrackIds : [];
    const safeHistory = Array.isArray(history) ? history : [];

    const genreCounts: Record<string, number> = {};
    const artistCounts: Record<string, number> = {};

    for (const track of likedData) {
      if (track.genre) {
        genreCounts[track.genre] = (genreCounts[track.genre] || 0) + 2;
      }
      artistCounts[track.artist] = (artistCounts[track.artist] || 0) + 2;
    }

    for (const entry of history.slice(0, 50)) {
      const t = entry.track;
      if (t.genre) {
        genreCounts[t.genre] = (genreCounts[t.genre] || 0) + 1;
      }
      artistCounts[t.artist] = (artistCounts[t.artist] || 0) + 1;
    }

    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([genre]) => genre);

    const topArtists = Object.entries(artistCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([artist]) => artist);

    const excludeIds = [...safeLiked, ...safeDisliked, ...safeHistory.slice(0, 30).map(h => h.track.id)].join(",");

    // Build disliked artists/genres from disliked tracks data
    const dislikedArtistsSet = new Set<string>();
    const dislikedGenresSet = new Set<string>();
    // Get all track data we have (liked data and history) and check if any are in dislikedTrackIds
    const allKnownTracks = [...likedData, ...safeHistory.slice(0, 100).map(h => h.track)];
    for (const track of allKnownTracks) {
      if (safeDisliked.includes(track.id)) {
        if (track.artist) dislikedArtistsSet.add(track.artist);
        if (track.genre) dislikedGenresSet.add(track.genre);
      }
    }

    return {
      topGenres,
      topArtists,
      excludeIds,
      dislikedArtists: [...dislikedArtistsSet].join(","),
      dislikedGenres: [...dislikedGenresSet].join(","),
    };
  }, [likedTrackIds, dislikedTrackIds, likedTracksData]);

  // Fetch trending tracks
  useEffect(() => {
    let cancelled = false;
    const fetchTrending = async () => {
      setIsLoading(true);
      try {
        const { dislikedArtists, dislikedGenres, excludeIds } = tasteProfile;
        const disliked = useAppStore.getState().dislikedTrackIds || [];
        const params = new URLSearchParams();
        if (disliked.length > 0) params.set("dislikedIds", disliked.join(","));
        if (dislikedArtists) params.set("dislikedArtists", dislikedArtists);
        if (dislikedGenres) params.set("dislikedGenres", dislikedGenres);
        const res = await fetch(`/api/music/trending?${params}`);
        if (!cancelled) {
          const data = await res.json();
          // Also filter client-side for excludeIds
          const excludeSet = new Set(excludeIds.split(",").filter(Boolean));
          const filtered = (data.tracks || []).filter((t: Track) => !excludeSet.has(t.id));
          setTrendingTracks(filtered);
        }
      } catch {
        if (!cancelled) setTrendingTracks([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchTrending();
    return () => { cancelled = true; };
  }, [tasteProfile]);

  // Fetch curated algorithmic playlists
  useEffect(() => {
    let cancelled = false;
    const fetchCurated = async () => {
      setCuratedLoading(true);
      try {
        const { topGenres, topArtists } = tasteProfile;
        const sp = new URLSearchParams();
        if (userId) sp.set("userId", userId);
        if (topGenres.length > 0) sp.set("genres", topGenres.join(","));
        if (topArtists.length > 0) sp.set("artists", topArtists.join(","));
        const res = await fetch(`/api/playlists/curated?${sp}`);
        if (!cancelled && res.ok) {
          const data = await res.json();
          setCuratedPlaylists(data.playlists || []);
        }
      } catch {
        if (!cancelled) setCuratedPlaylists([]);
      } finally {
        if (!cancelled) setCuratedLoading(false);
      }
    };
    fetchCurated();
    return () => { cancelled = true; };
  }, [tasteProfile, userId]);

  // Fetch smart recommendations based on taste
  const loadRecommendations = useCallback(async () => {
    setIsRecLoading(true);
    try {
      const { topGenres, topArtists, excludeIds, dislikedArtists, dislikedGenres } = tasteProfile;
      const disliked = useAppStore.getState().dislikedTrackIds || [];
      const params = new URLSearchParams();

      if (topGenres.length > 0 || topArtists.length > 0) {
        if (topGenres.length > 0) params.set("genres", topGenres.join(","));
        if (topArtists.length > 0) params.set("artists", topArtists.join(","));
        if (excludeIds) params.set("excludeIds", excludeIds);
      } else {
        params.set("genre", "random");
      }
      if (disliked.length > 0) params.set("dislikedIds", disliked.join(","));
      if (dislikedArtists) params.set("dislikedArtists", dislikedArtists);
      if (dislikedGenres) params.set("dislikedGenres", dislikedGenres);

      const res = await fetch(`/api/music/recommendations?${params}`);
      const data = await res.json();
      // Filter out disliked tracks on client side too
      const dislikedSet = new Set(disliked);
      const filtered = (data.tracks || []).filter((t: Track) => !dislikedSet.has(t.id));
      setRecommendations(filtered);
    } catch {
      setRecommendations([]);
    } finally {
      setIsRecLoading(false);
    }
  }, [tasteProfile]);

  useEffect(() => {
    loadRecommendations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePlayAll = useCallback(() => {
    if (trendingTracks.length > 0) playTrack(trendingTracks[0], trendingTracks);
  }, [trendingTracks, playTrack]);

  const handlePlayRecAll = useCallback(() => {
    if (recommendations.length > 0) playTrack(recommendations[0], recommendations);
  }, [recommendations, playTrack]);

  // Play liked tracks
  const handlePlayLiked = useCallback(() => {
    if (likedTracksData.length > 0) playTrack(likedTracksData[0], likedTracksData);
  }, [likedTracksData, playTrack]);

  const recentTracks = history.slice(0, 6);
  const hasTasteData = tasteProfile.topGenres.length > 0 || tasteProfile.topArtists.length > 0;

  // Fetch total user count from API
  useEffect(() => {
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const res = await fetch('/api/users/search');
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setAllUsersCount((data.users || []).length);
        }
      } catch {}
    };
    fetchCount();
    return () => { cancelled = true; };
  }, []);

  const friendCount = allUsersCount;

  // Stat cards with click handlers
  const statCards = [
    {
      icon: Heart,
      label: "Избранное",
      value: `${likedTrackIds.length} треков`,
      onClick: () => {
        if (likedTracksData.length > 0) {
          handlePlayLiked();
        } else {
          setView("search");
        }
      },
    },
    {
      icon: MessageCircle,
      label: "Друзья",
      value: `${friendCount}`,
      onClick: () => {
        setView("messenger");
      },
    },
    {
      icon: Clock,
      label: "История",
      value: `${history.length} треков`,
      onClick: () => setView("history"),
    },
    {
      icon: ListMusic,
      label: "Плейлисты",
      value: `${playlists.length} шт.`,
      onClick: () => setView("playlists"),
    },
  ];

  // Shuffle helper — Fisher-Yates
  const shuffleArray = useCallback((arr: Track[]) => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);

  const handlePlayCuratedAll = useCallback((pl: CuratedPlaylist) => {
    if (pl.tracks.length > 0) playTrack(pl.tracks[0], pl.tracks);
  }, [playTrack]);

  const handleShuffleCurated = useCallback((pl: CuratedPlaylist) => {
    if (pl.tracks.length > 0) {
      const shuffled = shuffleArray(pl.tracks);
      playTrack(shuffled[0], shuffled);
    }
  }, [playTrack, shuffleArray]);

  // ── Curated playlist detail view ──
  if (selectedCurated) {
    return (
      <div className={`${compactMode ? "p-3 lg:p-4 pb-36 lg:pb-24" : "p-4 lg:p-6 pb-40 lg:pb-28"}`}>
        {/* Back button */}
        <motion.button
          initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
          animate={{ opacity: 1, x: 0 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setSelectedCurated(null)}
          className="flex items-center gap-2 mb-5 cursor-pointer"
          style={{ color: "var(--mq-accent)" }}
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Назад</span>
        </motion.button>

        {/* Playlist hero header */}
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl overflow-hidden relative"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
        >
          {/* Accent glow — themed */}
          <div className="absolute -top-16 -left-16 w-48 h-48 rounded-full opacity-[0.15]"
            style={{ background: "var(--mq-accent)" }}
          />
          <div className="absolute -bottom-12 -right-12 w-40 h-40 rounded-full opacity-[0.08]"
            style={{ background: "var(--mq-accent)" }}
          />
          {/* Decorative pattern — themed */}
          <div className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 6px, var(--mq-accent) 6px, var(--mq-accent) 7px)",
            }}
          />

          <div className="relative z-10 p-5 lg:p-8">
            <div className="flex items-start gap-5">
              {/* Playlist icon */}
              <div className="w-24 h-24 lg:w-32 lg:h-32 rounded-2xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                style={{ backgroundColor: "var(--mq-accent)", opacity: 0.9 }}>
                <Disc3 className="w-10 h-10 lg:w-14 lg:h-14" style={{ color: "var(--mq-text)" }} />
              </div>

              {/* Playlist info */}
              <div className="flex-1 min-w-0 pt-1">
                <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: "var(--mq-text-muted)" }}>Плейлист</p>
                <h1 className="text-2xl lg:text-3xl font-bold mb-2 truncate" style={{ color: "var(--mq-text)" }}>
                  {selectedCurated.name}
                </h1>
                <p className="text-sm mb-3" style={{ color: "var(--mq-text-muted)" }}>
                  {selectedCurated.subtitle}
                </p>
                <div className="flex items-center gap-3 text-xs" style={{ color: "var(--mq-text-muted)" }}>
                  <span className="flex items-center gap-1">
                    <Music2 className="w-3 h-3" />
                    {selectedCurated.tracks.length} треков
                  </span>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 mt-6">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handlePlayCuratedAll(selectedCurated)}
                disabled={selectedCurated.tracks.length === 0}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium cursor-pointer disabled:opacity-40"
                style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
              >
                <Play className="w-4 h-4" style={{ marginLeft: 1 }} />
                Слушать
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleShuffleCurated(selectedCurated)}
                disabled={selectedCurated.tracks.length === 0}
                className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium cursor-pointer disabled:opacity-40"
                style={{ backgroundColor: "var(--mq-card-hover)", color: "var(--mq-text)", border: "1px solid var(--mq-border)" }}
              >
                <Shuffle className="w-4 h-4" />
                Перемешать
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Track list */}
        <div className="mt-6">
          {selectedCurated.tracks.length > 0 ? (
            <div className="space-y-2">
              {selectedCurated.tracks.map((track, i) => (
                <TrackCard key={track.id} track={track} index={i} queue={selectedCurated.tracks} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <Music className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
              <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                Плейлист пуст
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${compactMode ? "p-3 lg:p-4 pb-36 lg:pb-24 space-y-4" : "p-4 lg:p-6 pb-40 lg:pb-28 space-y-6"}`}>
      {/* Hero */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl ${compactMode ? "p-4 lg:p-5" : "p-6 lg:p-8"} relative overflow-hidden`}
        style={{ background: "var(--mq-gradient), var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <div className="relative z-10">
          <h1 className={`${compactMode ? "text-xl lg:text-2xl" : "text-2xl lg:text-3xl"} font-bold`} style={{ color: "var(--mq-text)" }}>
            {getGreeting()}
          </h1>
        </div>
        <p className="text-sm lg:text-base" style={{ color: "var(--mq-text-muted)" }}>
          {getGreetingSubtext()}
        </p>
      </motion.div>

      {/* Quick stats - CLICKABLE */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((stat, i) => (
          <motion.button
            key={stat.label}
            initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={stat.onClick}
            className="rounded-xl p-4 flex items-center gap-3 text-left transition-all duration-200 cursor-pointer"
            style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "var(--mq-accent)", opacity: 0.8 }}>
              <stat.icon className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>{stat.label}</p>
              <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{stat.value}</p>
            </div>
          </motion.button>
        ))}
      </div>

      {/* Curated playlists — horizontal gradient cards */}
      <div>
        <h2 className="text-lg font-bold mb-4" style={{ color: "var(--mq-text)" }}>
          Плейлисты для вас
        </h2>
        {curatedLoading ? (
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-36 h-48 rounded-2xl" style={{ background: "var(--mq-card)" }}>
                <Skeleton className="w-full h-full rounded-2xl" />
              </div>
            ))}
          </div>
        ) : curatedPlaylists.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {curatedPlaylists.map((pl, i) => (
              <motion.button
                key={pl.id}
                initial={animationsEnabled ? { opacity: 0, x: 30 } : undefined}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setSelectedCurated(pl);
                }}
                className="flex-shrink-0 w-36 h-48 rounded-2xl relative overflow-hidden cursor-pointer group"
                style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
              >
                {/* Accent glow at top-left — subtle themed tint */}
                <div className="absolute -top-8 -left-8 w-24 h-24 rounded-full opacity-[0.12] group-hover:opacity-[0.18] transition-opacity duration-300"
                  style={{ background: "var(--mq-accent)" }}
                />
                <div className="absolute -bottom-6 -right-6 w-20 h-20 rounded-full opacity-[0.06] group-hover:opacity-[0.10] transition-opacity duration-300"
                  style={{ background: "var(--mq-accent)" }}
                />
                {/* Decorative pattern — themed */}
                <div className="absolute inset-0 opacity-[0.04]"
                  style={{
                    backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 6px, var(--mq-accent) 6px, var(--mq-accent) 7px)",
                  }}
                />
                {/* Content */}
                <div className="relative z-10 h-full flex flex-col justify-between p-3">
                  <div className="mt-1">
                    <p className="text-sm font-bold leading-tight" style={{ color: "var(--mq-text)" }}>
                      {pl.name}
                    </p>
                    <p className="text-[11px] mt-1 leading-tight" style={{ color: "var(--mq-text-muted)" }}>
                      {pl.subtitle}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px]" style={{ color: "var(--mq-text-muted)" }}>
                      {pl.tracks.length} треков
                    </p>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-200"
                      style={{ backgroundColor: "var(--mq-accent)", opacity: 0.8 }}>
                      <Music2 className="w-3.5 h-3.5" style={{ color: "var(--mq-text)" }} />
                    </div>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Recent history */}
      {recentTracks.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
              <h2 className="text-lg font-bold" style={{ color: "var(--mq-text)" }}>
                Недавно прослушанные
              </h2>
            </div>
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => setView("history")}
              className="text-xs px-3 py-1 rounded-full"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", color: "var(--mq-text-muted)" }}>
              Все
            </motion.button>
          </div>
          <div className="space-y-2">
            {recentTracks.map((entry, i) => (
              <TrackCard key={entry.track.id + "_" + entry.playedAt} track={entry.track} index={i} queue={recentTracks.map(e => e.track)} />
            ))}
          </div>
        </div>
      )}

      {/* Smart Recommendations */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
            <h2 className="text-lg font-bold" style={{ color: "var(--mq-text)" }}>
              {hasTasteData ? "Рекомендации для вас" : "Откройте для себя"}
            </h2>

          </div>
          <div className="flex items-center gap-2">
            {recommendations.length > 0 && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={handlePlayRecAll}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium"
                style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
              >
                <Play className="w-2.5 h-2.5" style={{ marginLeft: 1 }} />
                Все
              </motion.button>
            )}
            <motion.button whileTap={{ scale: 0.9 }} onClick={loadRecommendations} disabled={isRecLoading}
              className="p-1.5 rounded-lg" style={{ color: "var(--mq-text-muted)", border: "1px solid var(--mq-border)" }}>
              <RefreshCw className={`w-3.5 h-3.5 ${isRecLoading ? "animate-spin" : ""}`} />
            </motion.button>
          </div>
        </div>

        {isRecLoading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--mq-card)" }}>
                <Skeleton className="w-12 h-12 rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isRecLoading && recommendations.length > 0 && (
          <div className="space-y-2">
            {recommendations.slice(0, 8).map((track, i) => (
              <TrackCard key={track.id} track={track} index={i} queue={recommendations} />
            ))}
          </div>
        )}

        {!isRecLoading && recommendations.length === 0 && (
          <div className="text-center py-8">
            <Music className="w-10 h-10 mx-auto mb-2" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
            <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
              {hasTasteData ? "Не удалось загрузить рекомендации по вашему вкусу" : "Лайкайте треки и слушайте музыку, чтобы получить персональные рекомендации"}
            </p>
          </div>
        )}
      </div>

      {/* Trending tracks */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ color: "var(--mq-text)" }}>
            Популярные треки
          </h2>
          {trendingTracks.length > 0 && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handlePlayAll}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium"
              style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
            >
              <Play className="w-2.5 h-2.5" style={{ marginLeft: 1 }} />
              Все
            </motion.button>
          )}
        </div>

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--mq-card)" }}>
                <Skeleton className="w-12 h-12 rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && trendingTracks.length > 0 && (
          <div className="space-y-2">
            {trendingTracks.slice(0, 10).map((track, i) => (
              <TrackCard key={track.id} track={track} index={i} queue={trendingTracks} />
            ))}
          </div>
        )}

        {!isLoading && trendingTracks.length === 0 && (
          <div className="text-center py-8">
            <Music className="w-10 h-10 mx-auto mb-2" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
            <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>Не удалось загрузить популярные треки</p>
          </div>
        )}
      </div>
    </div>
  );
}
