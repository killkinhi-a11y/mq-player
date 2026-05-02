"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { type Track, getRecommendations } from "@/lib/musicApi";
import TrackCard from "./TrackCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, MessageCircle, Clock, ListMusic, Music, Sparkles, RefreshCw, Play, Music2, ChevronLeft, Shuffle, Disc3, Mic2, Waves, Compass, Activity, Zap, Radio, Headphones, TrendingUp, BarChart3, Flame } from "lucide-react";
import PlaylistArtwork from "./PlaylistArtwork";
import HeroParticles from "./HeroParticles";

interface CuratedPlaylist {
  id: string;
  name: string;
  subtitle: string;
  gradient: string;
  tracks: Track[];
}

// ── Spotify-style horizontal recommendation row ──
const ICON_MAP: Record<string, React.ReactNode> = {
  Sparkles: <Sparkles className="w-4 h-4" />,
  Mic2: <Mic2 className="w-4 h-4" />,
  Waves: <Waves className="w-4 h-4" />,
  Compass: <Compass className="w-4 h-4" />,
  Music: <Music className="w-4 h-4" />,
};

function RecCategoryRow({ category, index, playTrack, animationsEnabled, compactMode, onOpenAll }: {
  category: { id: string; title: string; icon: string; tracks: Track[] };
  index: number;
  playTrack: (track: Track, queue?: Track[]) => void;
  animationsEnabled: boolean;
  compactMode: boolean;
  onOpenAll: (category: { id: string; title: string; icon: string; tracks: Track[] }) => void;
}) {
  const Icon = ICON_MAP[category.icon] || <Sparkles className="w-4 h-4" />;
  const tracks = category.tracks;

  return (
    <motion.div
      initial={animationsEnabled ? { opacity: 0, y: 15 } : undefined}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ backgroundColor: "var(--mq-accent)", opacity: 0.85 }}>
          <span style={{ color: "var(--mq-text)" }}>{Icon}</span>
        </div>
        <button onClick={() => onOpenAll(category)} className="cursor-pointer hover:opacity-80 transition-opacity">
          <h2 className="text-base font-bold" style={{ color: "var(--mq-text)" }}>
            {category.title}
          </h2>
        </button>
        <button onClick={() => onOpenAll(category)}
          className="text-xs px-2.5 py-1 rounded-full cursor-pointer transition-all hover:opacity-80"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)", color: "var(--mq-text-muted)" }}>
          Все
        </button>
        <span className="text-xs ml-auto" style={{ color: "var(--mq-text-muted)" }}>
          {tracks.length} треков
        </span>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-1 px-1"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {tracks.map((track, i) => (
          <motion.button
            key={track.id}
            initial={animationsEnabled ? { opacity: 0, x: 20 } : undefined}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => playTrack(track, tracks)}
            className="flex-shrink-0 w-[148px] rounded-xl overflow-hidden text-left cursor-pointer group relative"
            style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
          >
            {/* Cover */}
            <div className="aspect-square relative overflow-hidden">
              {track.cover ? (
                <img src={track.cover} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)", opacity: 0.6 }}>
                  <Music className="w-8 h-8" style={{ color: "var(--mq-text)" }} />
                </div>
              )}
              {/* Play overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200 group-hover:scale-100 scale-75"
                  style={{ background: "var(--mq-accent)", color: "var(--mq-text)" }}>
                  <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                </div>
              </div>
            </div>
            {/* Info */}
            <div className="p-2.5 min-h-[52px]">
              <p className="text-xs font-semibold truncate leading-tight" style={{ color: "var(--mq-text)" }}>
                {track.title}
              </p>
              <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--mq-text-muted)" }}>
                {track.artist}
              </p>
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// ── 3D Tilt Card (mouse-following perspective) ──
function TiltCard({ children, className, style, onClick }: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0.5);
  const y = useMotionValue(0.5);

  const rotateX = useSpring(useTransform(y, [0, 1], [6, -6]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(x, [0, 1], [-6, 6]), { stiffness: 300, damping: 30 });

  const handleMouse = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width);
    y.set((e.clientY - rect.top) / rect.height);
  }, [x, y]);

  const handleLeave = useCallback(() => {
    x.set(0.5);
    y.set(0.5);
  }, [x, y]);

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      onClick={onClick}
      style={{
        ...style,
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
        perspective: 600,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Mood/Genre Quick Tag ──
function MoodTag({ label, icon, onClick, active }: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.08, y: -2 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer transition-all duration-200"
      style={{
        backgroundColor: active ? "var(--mq-accent)" : "var(--mq-card)",
        color: active ? "var(--mq-text)" : "var(--mq-text-muted)",
        border: `1px solid ${active ? "var(--mq-accent)" : "var(--mq-border)"}`,
        boxShadow: active ? "0 2px 12px rgba(0,0,0,0.3)" : "none",
      }}
    >
      {icon}
      {label}
    </motion.button>
  );
}

// ── Animated Listening Stats Bar ──
function ListeningActivityBar({ history }: { history: any[] }) {
  const [bars, setBars] = useState<{ day: string; count: number; height: number; isToday: boolean }[]>([]);

  useEffect(() => {
    if (!history || history.length === 0) { setBars([]); return; }
    const now = Date.now();
    const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    const dayCounts: number[] = new Array(7).fill(0);

    for (const entry of history) {
      const age = now - entry.playedAt;
      if (age < 7 * 24 * 60 * 60 * 1000) {
        const dayIdx = new Date(entry.playedAt).getDay();
        const mappedIdx = dayIdx === 0 ? 6 : dayIdx - 1; // Mon=0 .. Sun=6
        dayCounts[mappedIdx]++;
      }
    }

    const maxCount = Math.max(...dayCounts, 1);
    const todayIdx = (new Date().getDay() + 6) % 7;

    setBars(dayNames.map((day, i) => ({
      day,
      count: dayCounts[i],
      height: Math.max(4, (dayCounts[i] / maxCount) * 100),
      isToday: i === todayIdx,
    })));
  }, [history]);

  if (bars.length === 0) return null;

  return (
    <div className="flex items-end gap-1.5 h-16">
      {bars.map((bar, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1">
          <motion.div
            initial={{ height: 4 }}
            animate={{ height: bar.height }}
            transition={{ delay: i * 0.06, duration: 0.5, ease: "easeOut" }}
            className="w-full rounded-sm"
            style={{
              backgroundColor: bar.isToday ? "var(--mq-accent)" : "var(--mq-border)",
              opacity: bar.isToday ? 1 : 0.5,
              minHeight: 4,
            }}
          />
          <span className="text-[9px]" style={{ color: bar.isToday ? "var(--mq-text)" : "var(--mq-text-muted)" }}>
            {bar.day}
          </span>
        </div>
      ))}
    </div>
  );
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

// Detect language from text (used in multiple places)
function detectLang(text: string): "russian" | "english" | "latin" | "other" {
  if (!text) return "other";
  const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  const total = cyrillic + latin;
  if (total === 0) return "other";
  if (cyrillic / total > 0.4) return "russian";
  if (latin / total > 0.6) return "english";
  return "latin";
}

export default function MainView() {
  const {
    animationsEnabled, playTrack, likedTrackIds, dislikedTrackIds, likedTracksData, dislikedTracksData,
    history, playlists, setView, contacts, messages, userId, compactMode, currentTrack, isPlaying,
    setSearchQuery,
  } = useAppStore();

  const [trendingTracks, setTrendingTracks] = useState<Track[]>([]);
  const [recommendations, setRecommendations] = useState<Track[]>([]);
  const [recCategories, setRecCategories] = useState<{ id: string; title: string; icon: string; tracks: Track[] }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecLoading, setIsRecLoading] = useState(true);
  const [allUsersCount, setAllUsersCount] = useState(0);
  const [curatedPlaylists, setCuratedPlaylists] = useState<CuratedPlaylist[]>([]);
  const [curatedLoading, setCuratedLoading] = useState(true);
  const [selectedCurated, setSelectedCurated] = useState<CuratedPlaylist | null>(null);
  const [selectedRecCategory, setSelectedRecCategory] = useState<{ id: string; title: string; icon: string; tracks: Track[] } | null>(null);
  const [activeMood, setActiveMood] = useState<string | null>(null);

  // Build taste profile from liked tracks + history with exponential time decay
  const tasteProfile = useMemo(() => {
    const { likedTracksData, history, likedTrackIds, dislikedTrackIds, dislikedTracksData } = useAppStore.getState();
    const safeLiked = Array.isArray(likedTrackIds) ? likedTrackIds : [];
    const safeDisliked = Array.isArray(dislikedTrackIds) ? dislikedTrackIds : [];
    const safeDislikedData = Array.isArray(dislikedTracksData) ? dislikedTracksData : [];
    const safeHistory = Array.isArray(history) ? history : [];
    const now = Date.now();

    // Exponential time decay: half-life = 7 days (604800000 ms)
    // Tracks played recently count much more than old ones
    const HALF_LIFE = 7 * 24 * 60 * 60 * 1000;
    function timeDecay(playedAt: number): number {
      const age = now - playedAt;
      return Math.exp(-0.693 * age / HALF_LIFE); // ln(2) ≈ 0.693
    }

    const genreCounts: Record<string, number> = {};
    const artistCounts: Record<string, number> = {};

    // Liked tracks: weight = 3 * decay (liked tracks are 3x stronger signal)
    for (const track of likedTracksData) {
      const recency = timeDecay(now - 14 * 24 * 60 * 60 * 1000); // treat likes as ~14 days old for decay
      const weight = 3 * recency;
      if (track.genre) {
        genreCounts[track.genre] = (genreCounts[track.genre] || 0) + weight;
      }
      artistCounts[track.artist] = (artistCounts[track.artist] || 0) + weight;
    }

    // History: weight = 1 * decay * playCount (normal signal with recency + frequency)
    for (const entry of safeHistory.slice(0, 100)) {
      const t = entry.track;
      const count = (entry as any).playCount || 1;
      const weight = timeDecay(entry.playedAt) * Math.min(count, 10); // cap at 10x to prevent domination
      if (t.genre) {
        genreCounts[t.genre] = (genreCounts[t.genre] || 0) + weight;
      }
      artistCounts[t.artist] = (artistCounts[t.artist] || 0) + weight;
    }

    // Expanded: top 5 genres, top 3 artists (was top-3 genres / top-2 artists)
    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([genre]) => genre);

    const topArtists = Object.entries(artistCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([artist]) => artist);

    const excludeIds = [...safeLiked, ...safeDisliked, ...safeHistory.slice(0, 30).map(h => h.track.id)].join(",");

    // Recently played IDs (last 50) — sent to recommendation API for anti-repetition
    const recentIds = safeHistory.slice(0, 50).map(h => h.track.id).join(",");

    // Build disliked artists/genres from disliked tracks data (directly stored)
    const dislikedArtistsSet = new Set<string>();
    const dislikedGenresSet = new Set<string>();
    // Primary source: dislikedTracksData (full metadata stored when disliking)
    for (const track of safeDislikedData) {
      if (track.artist) dislikedArtistsSet.add(track.artist);
      if (track.genre) dislikedGenresSet.add(track.genre);
    }
    // Secondary source: look up disliked IDs in liked/history (fallback for legacy data)
    const allKnownTracks = [...likedTracksData, ...safeHistory.slice(0, 100).map(h => h.track)];
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
      recentIds,
      dislikedArtists: [...dislikedArtistsSet].join(","),
      dislikedGenres: [...dislikedGenresSet].join(","),
    };
  }, [likedTrackIds, dislikedTrackIds, likedTracksData, dislikedTracksData, history]);

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
        // Pass liked track SC IDs for "Похожее" playlist via SoundCloud related API
        const likedSc = useAppStore.getState().likedTracksData
          .map((t: any) => t.scTrackId)
          .filter((id: any): id is number => !!id)
          .slice(0, 3)
          .join(",");
        if (likedSc) sp.set("likedScIds", likedSc);
        // Pass language preference
        if (languagePreference !== "mixed") sp.set("lang", languagePreference);
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

  // Detect language preference from listening history
  const languagePreference = useMemo(() => {
    const { likedTracksData, history } = useAppStore.getState();
    const safeHistory = Array.isArray(history) ? history : [];
    const langCounts: Record<string, number> = { russian: 0, english: 0, latin: 0 };
    
    // Weight liked tracks 3x
    for (const track of likedTracksData) {
      const lang = detectLang(`${track.title} ${track.artist}`);
      if (lang in langCounts) langCounts[lang] += 3;
    }
    for (const entry of safeHistory.slice(0, 50)) {
      const lang = detectLang(`${entry.track.title} ${entry.track.artist}`);
      if (lang in langCounts) langCounts[lang] += 1;
    }
    
    const sorted = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, e) => s + e[1], 0);
    if (total === 0 || sorted[0][1] < total * 0.4) return "mixed";
    return sorted[0][0] as "russian" | "english" | "latin";
  }, [likedTracksData, history]);

  // Fetch smart recommendations based on taste
  const loadRecommendations = useCallback(async () => {
    setIsRecLoading(true);
    try {
      const { topGenres, topArtists, excludeIds, recentIds, dislikedArtists, dislikedGenres } = tasteProfile;
      const disliked = useAppStore.getState().dislikedTrackIds || [];
      const favoriteArtists = useAppStore.getState().favoriteArtists || [];
      const currentTrack = useAppStore.getState().currentTrack;
      const currentHistory = useAppStore.getState().history || [];
      const params = new URLSearchParams();

      // Use favoriteArtists as primary signal if available
      const favArtistNames = favoriteArtists.map(a => a.username);
      const allArtists = [...new Set([...favArtistNames, ...topArtists])];

      if (allArtists.length > 0 || topGenres.length > 0) {
        if (topGenres.length > 0) params.set("genres", topGenres.join(","));
        if (allArtists.length > 0) params.set("artists", allArtists.slice(0, 5).join(","));
        if (excludeIds) params.set("excludeIds", excludeIds);
      } else {
        params.set("genre", "random");
      }
      if (disliked.length > 0) params.set("dislikedIds", disliked.join(","));
      if (dislikedArtists) params.set("dislikedArtists", dislikedArtists);
      if (dislikedGenres) params.set("dislikedGenres", dislikedGenres);
      if (recentIds) params.set("recentIds", recentIds);

      // Extract SoundCloud track IDs from liked tracks
      const likedScIds = likedTracksData
        .map(t => t.scTrackId)
        .filter((id): id is number => !!id)
        .slice(0, 5)
        .join(",");
      if (likedScIds) params.set("likedScIds", likedScIds);

      // Extract SoundCloud track IDs from recent history
      const historyScIds = currentHistory.slice(0, 10)
        .map(h => h.track.scTrackId)
        .filter((id): id is number => !!id)
        .join(",");
      if (historyScIds) params.set("historyScIds", historyScIds);

      // Session context: pass last 5 played tracks for mood flow
      const sessionTracks = currentHistory.slice(0, 5).map(entry => ({
        genre: entry.track.genre || "",
        artist: entry.track.artist || "",
        energy: entry.track.duration ? (entry.track.duration < 180 ? 0.8 : entry.track.duration > 300 ? 0.3 : 0.5) : 0.5,
        moods: [],
        scTrackId: entry.track.scTrackId || null,
        language: detectLang(`${entry.track.title || ""} ${entry.track.artist || ""}`) as "russian" | "english" | "latin" | "other",
      }))
      if (sessionTracks.length > 0) {
        params.set("session", JSON.stringify(sessionTracks));
      }
      
      // Language preference
      if (languagePreference !== "mixed") {
        params.set("lang", languagePreference);
      }

      // v9→v10: Build feedback signals from trackFeedback for self-learning
      const trackFeedback = useAppStore.getState().trackFeedback || {};
      const fbEntries = Object.entries(trackFeedback);
      if (fbEntries.length > 0) {
        // Build genre boost map from completed tracks with TIME DECAY
        const genreBoost: Record<string, number> = {};
        const artistBoost: Record<string, number> = {};
        const skipGenrePenalty = new Set<string>();
        const completedGenres = new Set<string>();
        const now = Date.now();
        const HOUR = 3600000;

        // Sort by recency — most recent feedback first
        const sortedEntries = [...fbEntries].sort((a, b) => (b[1].lastPlayedAt || 0) - (a[1].lastPlayedAt || 0));

        for (const [trackId, fb] of sortedEntries) {
          // Find track metadata from history or liked tracks
          const historyEntry = currentHistory.find(h => h.track.id === trackId);
          const likedEntry = likedTracksData.find(t => t.id === trackId);
          const track = historyEntry?.track || likedEntry;
          if (!track) continue;

          const genre = (track.genre || "").toLowerCase().trim();
          const artist = (track.artist || "").toLowerCase().trim();
          const total = fb.completes + fb.skips;
          if (total === 0) continue;

          // Time decay: recent feedback weighs more (half-life = 24h)
          const ageHours = fb.lastPlayedAt ? (now - fb.lastPlayedAt) / HOUR : 168; // default 1 week old
          const timeDecay = Math.exp(-0.029 * Math.min(ageHours, 168)); // e^(-λt), λ=0.029 → half-life ~24h

          const completionRate = fb.completes / total;

          // Genre-level learning (time-weighted)
          if (genre) {
            if (completionRate >= 0.7) {
              const boost = Math.min(completionRate * 30, 40) * timeDecay;
              genreBoost[genre] = (genreBoost[genre] || 0) + boost;
              // Only add to completed if recent enough (< 48h)
              if (ageHours < 48) completedGenres.add(genre);
            } else if (completionRate <= 0.3 && fb.skips >= 2) {
              skipGenrePenalty.add(genre);
              genreBoost[genre] = (genreBoost[genre] || 0) - 40 * timeDecay;
            }
          }

          // Artist-level learning (time-weighted)
          if (artist) {
            if (completionRate >= 0.7) {
              artistBoost[artist] = (artistBoost[artist] || 0) + Math.min(completionRate * 25, 35) * timeDecay;
            } else if (completionRate <= 0.3 && fb.skips >= 2) {
              artistBoost[artist] = (artistBoost[artist] || 0) - 50 * timeDecay;
            }

            // Early-skip detection: skip within 10s = strong negative signal
            if (fb.skipPositions && fb.skipPositions.length > 0) {
              const avgSkipPos = fb.skipPositions.reduce((a, b) => a + b, 0) / fb.skipPositions.length;
              if (avgSkipPos < 15 && fb.skips >= 2) {
                if (artist) artistBoost[artist] = (artistBoost[artist] || 0) - 30 * timeDecay;
                if (genre) genreBoost[genre] = (genreBoost[genre] || 0) - 25 * timeDecay;
              }
            }

            // Full listen bonus: listened >80% of duration on average
            if (fb.totalListenTime > 0 && track.duration > 0) {
              const avgListenRatio = fb.totalListenTime / (track.duration * fb.completes);
              if (avgListenRatio > 0.8) {
                if (genre) genreBoost[genre] = (genreBoost[genre] || 0) + 10 * timeDecay;
                if (artist) artistBoost[artist] = (artistBoost[artist] || 0) + 8 * timeDecay;
              }
            }

            // v10: Repeat listen bonus — multiple completes = strong signal
            if (fb.completes >= 3 && completionRate > 0.8) {
              artistBoost[artist] = (artistBoost[artist] || 0) + 20 * timeDecay;
              if (genre) genreBoost[genre] = (genreBoost[genre] || 0) + 15 * timeDecay;
            }
          }
        }

        if (Object.keys(genreBoost).length > 0 || Object.keys(artistBoost).length > 0) {
          params.set("feedback", JSON.stringify({
            genreBoost,
            artistBoost,
            skipGenrePenalty: [...skipGenrePenalty],
            completedGenres: [...completedGenres],
          }));
        }
      }

      const res = await fetch(`/api/music/recommendations?${params}`);
      const data = await res.json();
      // Filter out disliked tracks on client side too
      const dislikedSet = new Set(disliked);
      const filtered = (data.tracks || []).filter((t: Track) => !dislikedSet.has(t.id));
      setRecommendations(filtered);
      // v8: parse categorized recommendations
      if (data.categories && Array.isArray(data.categories)) {
        const catFiltered = data.categories.map((cat: { id: string; title: string; icon: string; tracks: Track[] }) => ({
          ...cat,
          tracks: cat.tracks.filter((t: Track) => !dislikedSet.has(t.id)),
        })).filter((cat: { tracks: Track[] }) => cat.tracks.length >= 3);
        setRecCategories(catFiltered);
      }
    } catch {
      setRecommendations([]);
    } finally {
      setIsRecLoading(false);
    }
  }, [tasteProfile, languagePreference]);

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

  // ── Rec category detail view (for recommendation rows like "Для вас", "Открытия") ──
  if (selectedRecCategory) {
    const cat = selectedRecCategory;
    return (
      <div className={`${compactMode ? "p-3 lg:p-4 pb-36 lg:pb-24" : "p-4 lg:p-6 pb-40 lg:pb-28"} max-w-4xl mx-auto`}>
        {/* Back button */}
        <motion.button
          initial={animationsEnabled ? { opacity: 0, x: -10 } : undefined}
          animate={{ opacity: 1, x: 0 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setSelectedRecCategory(null)}
          className="flex items-center gap-2 mb-5 cursor-pointer"
          style={{ color: "var(--mq-accent)" }}
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Назад</span>
        </motion.button>

        {/* Category header */}
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl overflow-hidden relative"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
        >
          <div className="absolute inset-0 opacity-[0.08]" style={{ background: "var(--mq-accent)" }} />
          <div className="absolute -top-16 -left-16 w-48 h-48 rounded-full opacity-[0.10]" style={{ background: "var(--mq-accent)" }} />
          <div className="absolute -bottom-12 -right-12 w-40 h-40 rounded-full opacity-[0.06]" style={{ background: "var(--mq-accent)" }} />
          <div className="relative z-10 p-5 lg:p-8">
            <div className="flex items-start gap-5">
              <div className="w-28 h-28 lg:w-36 lg:h-36 rounded-2xl overflow-hidden flex-shrink-0 shadow-xl shadow-black/30 flex items-center justify-center"
                style={{ background: "var(--mq-accent)", opacity: 0.7 }}>
                <span style={{ color: "var(--mq-text)" }}>{ICON_MAP[cat.icon] || <Sparkles className="w-12 h-12" />}</span>
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: "var(--mq-text-muted)" }}>Рекомендации</p>
                <h1 className="text-2xl lg:text-3xl font-bold mb-2 truncate" style={{ color: "var(--mq-text)" }}>
                  {cat.title}
                </h1>
                <div className="flex items-center gap-3 text-xs" style={{ color: "var(--mq-text-muted)" }}>
                  <span className="flex items-center gap-1">
                    <Music2 className="w-3 h-3" />
                    {cat.tracks.length} треков
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-6">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => { if (cat.tracks.length > 0) playTrack(cat.tracks[0], cat.tracks); }}
                disabled={cat.tracks.length === 0}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium cursor-pointer disabled:opacity-40"
                style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
              >
                <Play className="w-4 h-4" style={{ marginLeft: 1 }} />
                Слушать
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => { if (cat.tracks.length > 0) { const s = shuffleArray(cat.tracks); playTrack(s[0], s); } }}
                disabled={cat.tracks.length === 0}
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
          {cat.tracks.length > 0 ? (
            <div className="space-y-2">
              {cat.tracks.map((track, i) => (
                <TrackCard key={track.id} track={track} index={i} queue={cat.tracks} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16">
              <Music className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
              <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>Нет треков</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Curated playlist detail view ──
  if (selectedCurated) {
    return (
      <div className={`${compactMode ? "p-3 lg:p-4 pb-36 lg:pb-24" : "p-4 lg:p-6 pb-40 lg:pb-28"} max-w-4xl mx-auto`}>
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
          {/* Themed gradient overlay from user accent */}
          <div className="absolute inset-0 opacity-[0.08]"
            style={{ background: "var(--mq-accent)" }}
          />
          {/* Accent glow */}
          <div className="absolute -top-16 -left-16 w-48 h-48 rounded-full opacity-[0.10]"
            style={{ background: "var(--mq-accent)" }}
          />
          <div className="absolute -bottom-12 -right-12 w-40 h-40 rounded-full opacity-[0.06]"
            style={{ background: "var(--mq-accent)" }}
          />
          {/* Decorative pattern */}
          <div className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 6px, rgba(255,255,255,0.15) 6px, rgba(255,255,255,0.15) 7px)",
            }}
          />

          <div className="relative z-10 p-5 lg:p-8">
            <div className="flex items-start gap-5">
              {/* Playlist artwork */}
              <div className="w-28 h-28 lg:w-36 lg:h-36 rounded-2xl overflow-hidden flex-shrink-0 shadow-xl shadow-black/30">
                <PlaylistArtwork playlistId={selectedCurated.id} size={200} rounded="rounded-none" className="!w-full !h-full" />
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
    <div className={`${compactMode ? "p-3 lg:p-4 pb-36 lg:pb-24 space-y-4" : "p-4 lg:p-6 pb-40 lg:pb-28 space-y-6"} max-w-4xl mx-auto`}>
      {/* Hero — Interactive with particles */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl ${compactMode ? "p-4 lg:p-5" : "p-6 lg:p-8"} relative overflow-hidden`}
        style={{ background: "var(--mq-gradient), var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        {/* Particle background */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden" style={{ zIndex: 0 }}>
          <HeroParticles />
        </div>

        {/* Decorative gradient orbs */}
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full opacity-[0.06] pointer-events-none"
          style={{ background: "var(--mq-accent)", filter: "blur(40px)", zIndex: 0 }} />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full opacity-[0.04] pointer-events-none"
          style={{ background: "var(--mq-accent)", filter: "blur(30px)", zIndex: 0 }} />

        <div className="relative" style={{ zIndex: 2 }}>
          <h1 className={`${compactMode ? "text-xl lg:text-2xl" : "text-2xl lg:text-3xl"} font-bold`} style={{ color: "var(--mq-text)" }}>
            {getGreeting()}
          </h1>
          <p className="text-sm lg:text-base mt-1" style={{ color: "var(--mq-text-muted)" }}>
            {getGreetingSubtext()}
          </p>

          {/* Now Playing mini-widget */}
          {currentTrack && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mt-4 flex items-center gap-3 p-3 rounded-xl cursor-pointer group"
              style={{
                backgroundColor: "rgba(0,0,0,0.25)",
                border: "1px solid var(--mq-border)",
                backdropFilter: "blur(12px)",
              }}
              onClick={() => {/* expand full player — handled by PlayerBar */}}
            >
              <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 shadow-lg shadow-black/40">
                {currentTrack.cover ? (
                  <img src={currentTrack.cover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)" }}>
                    <Music className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: "var(--mq-text)" }}>
                  {currentTrack.title}
                </p>
                <p className="text-[11px] truncate" style={{ color: "var(--mq-text-muted)" }}>
                  {currentTrack.artist}
                </p>
              </div>
              {/* Animated equalizer bars */}
              <div className="flex items-end gap-0.5 h-5">
                {[0, 1, 2, 3].map((i) => (
                  <motion.div
                    key={i}
                    animate={isPlaying ? {
                      height: [4, 14, 8, 18, 6, 12, 4],
                    } : { height: 4 }}
                    transition={isPlaying ? {
                      duration: 0.8 + i * 0.15,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.1,
                    } : {}}
                    className="w-[3px] rounded-full"
                    style={{ backgroundColor: "var(--mq-accent)" }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Quick stats - CLICKABLE with 3D Tilt */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((stat, i) => (
          <TiltCard
            key={stat.label}
            onClick={stat.onClick}
            className={`rounded-xl p-4 flex items-center gap-3 text-left transition-all duration-200 cursor-pointer ${compactMode ? "" : ""}`}
            style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
          >
            <motion.div
              initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="contents"
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "var(--mq-accent)", opacity: 0.8 }}>
                <stat.icon className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>{stat.label}</p>
                <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{stat.value}</p>
              </div>
            </motion.div>
          </TiltCard>
        ))}
      </div>

      {/* Quick mood/genre tags */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 15 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
          <MoodTag
            label="Для тебя"
            icon={<Sparkles className="w-3.5 h-3.5" />}
            active={activeMood === null}
            onClick={() => setActiveMood(null)}
          />
          <MoodTag
            label="Энергия"
            icon={<Zap className="w-3.5 h-3.5" />}
            active={activeMood === "energy"}
            onClick={() => { setActiveMood(activeMood === "energy" ? null : "energy"); }}
          />
          <MoodTag
            label="Чилл"
            icon={<Headphones className="w-3.5 h-3.5" />}
            active={activeMood === "chill"}
            onClick={() => { setActiveMood(activeMood === "chill" ? null : "chill"); }}
          />
          <MoodTag
            label="Радио"
            icon={<Radio className="w-3.5 h-3.5" />}
            active={activeMood === "radio"}
            onClick={() => { setActiveMood(activeMood === "radio" ? null : "radio"); }}
          />
          {tasteProfile.topGenres.slice(0, 3).map((genre) => (
            <MoodTag
              key={genre}
              label={genre}
              icon={<Flame className="w-3.5 h-3.5" />}
              active={activeMood === genre}
              onClick={() => {
                const newMood = activeMood === genre ? null : genre;
                setActiveMood(newMood);
                if (newMood) {
                  setSearchQuery(genre);
                  setView("search");
                }
              }}
            />
          ))}
        </div>
      </motion.div>

      {/* Listening Activity Widget */}
      {history.length > 0 && (
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 15 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl p-4"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>Активность за неделю</span>
            </div>
            <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
              {history.filter((h: any) => Date.now() - h.playedAt < 7 * 24 * 60 * 60 * 1000).length} прослушиваний
            </span>
          </div>
          <ListeningActivityBar history={history} />
        </motion.div>
      )}

      {/* Curated playlists — stylized gradient artwork cards */}
      <div>
        <h2 className="text-lg font-bold mb-4" style={{ color: "var(--mq-text)" }}>
          Плейлисты для вас
        </h2>
        {curatedLoading ? (
          <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-40 h-52 rounded-2xl" style={{ background: "var(--mq-card)" }}>
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
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setSelectedCurated(pl);
                }}
                className="flex-shrink-0 w-40 h-52 rounded-2xl relative overflow-hidden cursor-pointer group"
              >
                {/* Playlist artwork as background */}
                <div className="absolute inset-0">
                  <PlaylistArtwork playlistId={pl.id} size={200} rounded="rounded-none" className="!w-full !h-full group-hover:scale-110 transition-transform duration-700" />
                </div>

                {/* Dark gradient overlay for text readability */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                {/* Content */}
                <div className="relative z-10 h-full flex flex-col justify-between p-3.5">
                  <div className="mt-1">
                    <p className="text-sm font-bold leading-tight drop-shadow-md" style={{ color: "#fff" }}>
                      {pl.name}
                    </p>
                    <p className="text-[11px] mt-1 leading-tight truncate drop-shadow-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
                      {pl.subtitle}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] drop-shadow-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
                      {pl.tracks.length} треков
                    </p>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shadow-lg shadow-black/30 transition-all duration-300 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-black/40"
                      style={{ background: "rgba(255,255,255,0.95)" }}>
                      <Play className="w-4 h-4 ml-0.5" style={{ color: "#1a1a2e" }} fill="currentColor" />
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

      {/* Smart Recommendations — Categorized Rows (Spotify-style) */}
      {!isRecLoading && recCategories.length > 0 ? (
        recCategories.slice(0, 4).map((cat, catIdx) => (
          <RecCategoryRow key={cat.id} category={cat} index={catIdx} playTrack={playTrack} animationsEnabled={animationsEnabled} compactMode={compactMode} onOpenAll={setSelectedRecCategory} />
        ))
      ) : (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
              <h2 className="text-lg font-bold" style={{ color: "var(--mq-text)" }}>
                {hasTasteData ? "Рекомендации для вас" : "Откройте для себя"}
              </h2>
            </div>
            <motion.button whileTap={{ scale: 0.9 }} onClick={loadRecommendations} disabled={isRecLoading}
              className="p-1.5 rounded-lg" style={{ color: "var(--mq-text-muted)", border: "1px solid var(--mq-border)" }}>
              <RefreshCw className={`w-3.5 h-3.5 ${isRecLoading ? "animate-spin" : ""}`} />
            </motion.button>
          </div>
          {isRecLoading && (
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-36 rounded-xl" style={{ background: "var(--mq-card)" }}>
                  <Skeleton className="w-full h-36 rounded-t-xl" />
                  <div className="p-2 space-y-1.5">
                    <Skeleton className="h-3.5 w-4/5" />
                    <Skeleton className="h-3 w-3/5" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!isRecLoading && recommendations.length > 0 && recCategories.length === 0 && (
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
      )}
      {/* Refresh + play-all for categories */}
      {recCategories.length > 0 && (
        <div className="flex items-center justify-end gap-2 -mt-1">
          <motion.button whileTap={{ scale: 0.95 }} onClick={handlePlayRecAll}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>
            <Play className="w-3 h-3" style={{ marginLeft: 1 }} />
            Слушать всё
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} onClick={loadRecommendations} disabled={isRecLoading}
            className="p-1.5 rounded-lg" style={{ color: "var(--mq-text-muted)", border: "1px solid var(--mq-border)" }}>
            <RefreshCw className={`w-3.5 h-3.5 ${isRecLoading ? "animate-spin" : ""}`} />
          </motion.button>
        </div>
      )}

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
