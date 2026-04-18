"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion } from "framer-motion";
import { type Track, getRecommendations } from "@/lib/musicApi";
import TrackCard from "./TrackCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, MessageCircle, Clock, ListMusic, Music, Sparkles, RefreshCw, Play, Download } from "lucide-react";

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
        const res = await fetch("/api/music/trending");
        if (!cancelled) {
          const data = await res.json();
          setTrendingTracks(data.tracks || []);
        }
      } catch {
        if (!cancelled) setTrendingTracks([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchTrending();
    return () => { cancelled = true; };
  }, []);

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

      {/* Import playlist card */}
      <motion.button
        initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setView("playlists")}
        className="w-full rounded-2xl p-4 flex items-center gap-4 text-left transition-all duration-200"
        style={{
          background: "linear-gradient(135deg, var(--mq-card), var(--mq-input-bg))",
          border: "1px dashed var(--mq-border)",
        }}
      >
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: "var(--mq-accent)", opacity: 0.15 }}>
          <Download className="w-6 h-6" style={{ color: "var(--mq-accent)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>
            Импорт плейлиста
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
            VK, Яндекс.Музыка, Spotify, YouTube, Apple Music, SoundCloud
          </p>
        </div>
        <div className="px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)", opacity: 0.9 }}>
          Открыть
        </div>
      </motion.button>

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
