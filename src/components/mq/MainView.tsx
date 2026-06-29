"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, Music, Heart, Clock, ListMusic, MessageCircle,
  ChevronLeft, Shuffle, Plus, Flame, Sparkles, Waves, User,
  Loader2, SkipForward, ThumbsDown,
} from "lucide-react";
import { useWaveEngine } from "@/hooks/useWaveEngine";
import { type Track } from "@/lib/musicApi";
import { extractTasteProfile, displayGenre } from "@/lib/tasteProfile";
import { useIsMobile } from "@/hooks/use-mobile";
import { Skeleton } from "@/components/ui/skeleton";
import ScrollReveal from "./ScrollReveal";
import ArtistDetailView from "./ArtistDetailView";
import PlaylistArtwork from "./PlaylistArtwork";
import { toast } from "@/hooks/use-toast";

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
  return "linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 35%, var(--mq-bg)), color-mix(in srgb, var(--mq-accent) 18%, var(--mq-bg)))";
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

export default function MainView() {
  // ── Store ──
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const playTrack = useAppStore((s) => s.playTrack);
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
  const progress = useAppStore((s) => s.progress);
  const duration = useAppStore((s) => s.duration);
  const contacts = useAppStore((s) => s.contacts);

  // ── Local state ──
  const [trendingTracks, setTrendingTracks] = useState<Track[]>([]);
  const [curatedPlaylists, setCuratedPlaylists] = useState<CuratedPlaylist[]>([]);
  const [recCategories, setRecCategories] = useState<RecCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [recLoading, setRecLoading] = useState(false);
  const [trendingExpanded, setTrendingExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem("mq-trending-expanded") === "1"; } catch { return false; }
  });

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

  // ── Fetch trending + curated ──
  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      try {
        const disliked = useAppStore.getState().dislikedTrackIds || [];
        const excludeSet = new Set(disliked);
        const trendingParams = new URLSearchParams();
        if (disliked.length > 0) trendingParams.set("dislikedIds", disliked.join(","));
        const curatedParams = new URLSearchParams();
        if (disliked.length > 0) curatedParams.set("dislikedIds", disliked.join(","));

        const [trendingRes, curatedRes] = await Promise.all([
          fetch(`/api/music/trending?${trendingParams}`),
          fetch(`/api/playlists/curated?${curatedParams}`),
        ]);

        if (!cancelled && trendingRes.ok) {
          const data = await trendingRes.json();
          setTrendingTracks((data.tracks || []).filter((t: Track) => !excludeSet.has(t.id)));
        }
        if (!cancelled && curatedRes.ok) {
          const data = await curatedRes.json();
          setCuratedPlaylists(data.playlists || []);
        }
      } catch {
        if (!cancelled) { setTrendingTracks([]); setCuratedPlaylists([]); }
      } finally {
        if (!cancelled) setLoading(false);
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

        const res = await fetch(`/api/music/recommendations?${params}`);
        if (!cancelled && res.ok) {
          const data = await res.json();
          const cats = (data.categories || []).map((cat: any) => ({
            id: cat.id || `cat_${Date.now()}_${Math.random()}`,
            title: cat.title || "Рекомендации",
            icon: cat.icon || "Sparkles",
            tracks: (cat.tracks || []).filter((t: Track) => !disliked.includes(t.id)).slice(0, 10),
          })).filter((cat: any) => cat.tracks.length > 0);
          if (!cancelled) setRecCategories(cats);
        }
      } catch {
        // Silent
      } finally {
        if (!cancelled) setRecLoading(false);
      }
    };
    const timer = setTimeout(fetchRecs, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tasteProfile]);

  // ── Wave controls (from useWaveEngine hook) ──
  // Visual WaveCard component handles all rendering; this hook provides logic.

  const handleNavigateToArtist = useCallback((artist: string) => {
    if (!artist) return;
    setSelectedArtist({ name: artist });
  }, [setSelectedArtist]);

  // ── Artist detail ──
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
    <div className={`${compactMode ? "p-3 lg:p-4" : "p-3.5 sm:p-4 lg:p-6"} max-w-[var(--mq-container-narrow)] mx-auto pb-32 lg:pb-28`}>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* HERO GREETING */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0}>
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-6"
        >
          <p className="mq-text-eyebrow mb-1.5 text-[10px] sm:text-[11px]">{currentDate()}</p>
          <h1 className="mq-text-display text-xl sm:text-2xl lg:text-3xl" style={{ color: "var(--mq-text)" }}>
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
          onSkip={wave.skipTrack}
          onDislike={wave.dislikeTrack}
          onLike={wave.likeTrack}
          topGenres={tasteProfile.topGenres}
        />
      </ScrollReveal>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* QUICK STATS — 2x2 on mobile, 4 on desktop */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <ScrollReveal direction="up" delay={0.05}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 mb-8">
          <QuickStat icon={Heart} label="Избранное" value={likedTrackIds.length} onClick={() => setView("favorites")} accent="#ef4444" />
          <QuickStat icon={Clock} label="История" value={history.length} onClick={() => setView("history")} accent="var(--mq-accent)" />
          <QuickStat icon={ListMusic} label="Плейлисты" value={playlists.length} onClick={() => setView("playlists")} accent="#8b5cf6" />
          <QuickStat icon={MessageCircle} label="Чаты" value={contacts.length} onClick={() => setView("messenger")} accent="#06b6d4" />
        </div>
      </ScrollReveal>

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
                  if (pl.tracks.length > 0) playTrack(pl.tracks[0], [...pl.tracks], pl.id);
                }}
                animationsEnabled={animationsEnabled}
              />
            ))}
          </div>
        ) : (
          <button
            onClick={() => setView("playlists")}
            className="w-full rounded-2xl p-5 flex items-center gap-4 transition-all hover:bg-white/[0.02]"
            style={{ backgroundColor: "var(--mq-card)", border: "1px dashed var(--mq-border-thin)" }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}>
              <Plus className="w-5 h-5" style={{ color: "var(--mq-accent)" }} />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>Создайте плейлист</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>Организуйте любимую музыку</p>
            </div>
          </button>
        )}
      </Section>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* RECOMMENDATIONS — categorized */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {recCategories.length > 0 && (
        <Section title="Для вас" icon={Sparkles}>
          <div className="space-y-6">
            {recCategories.map((cat) => (
              <RecCategoryRow
                key={cat.id}
                category={cat}
                currentTrack={currentTrack}
                isPlaying={isPlaying}
                onPlay={(track) => playTrack(track, cat.tracks)}
                onArtistClick={handleNavigateToArtist}
                animationsEnabled={animationsEnabled}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Recommendations loading skeleton */}
      {recLoading && recCategories.length === 0 && (
        <Section title="Для вас" icon={Sparkles}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i}>
                <div className="aspect-square rounded-2xl mb-2 mq-shimmer" />
                <div className="h-3 w-3/4 rounded mb-1.5 mq-shimmer" />
                <div className="h-2.5 w-1/2 rounded mq-shimmer" />
              </div>
            ))}
          </div>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5.5 sm:gap-4">
            {recentTracks.slice(0, 5).map((track, i) => (
              <TrackCard
                key={track.id + "_" + i}
                track={track}
                index={i}
                isCurrent={currentTrack?.id === track.id}
                isPlaying={isPlaying && currentTrack?.id === track.id}
                onPlay={() => playTrack(track, recentTracks)}
                onArtistClick={() => handleNavigateToArtist(track.artist)}
                animationsEnabled={animationsEnabled}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* TRENDING — collapsible */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <Section
        title="Популярное"
        icon={Flame}
        action={
          <button
            onClick={() => {
              const next = !trendingExpanded;
              setTrendingExpanded(next);
              try { localStorage.setItem("mq-trending-expanded", next ? "1" : "0"); } catch {}
            }}
            className="flex items-center gap-1 text-xs font-semibold"
            style={{ color: "var(--mq-text-muted)" }}
          >
            {trendingExpanded ? "Свернуть" : `${trendingTracks.length} ${pluralRu(trendingTracks.length, "трек", "трека", "треков")}`}
            <motion.div animate={{ rotate: trendingExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronLeft className="w-3.5 h-3.5 -rotate-90" />
            </motion.div>
          </button>
        }
      >
        {loading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ backgroundColor: "var(--mq-card)" }}>
                <div className="w-10 h-10 rounded-lg mq-shimmer" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-2/3 rounded mq-shimmer" />
                  <div className="h-2.5 w-1/3 rounded mq-shimmer" />
                </div>
              </div>
            ))}
          </div>
        ) : trendingTracks.length === 0 ? (
          <div className="text-center py-8 rounded-2xl" style={{ backgroundColor: "var(--mq-card)" }}>
            <Music className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
            <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Не удалось загрузить</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {trendingExpanded ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                style={{ overflow: "hidden" }}
              >
                <div className="space-y-1">
                  {trendingTracks.slice(0, 50).map((track, i) => (
                    <TrendingRow
                      key={track.id}
                      track={track}
                      index={i + 1}
                      isCurrent={currentTrack?.id === track.id}
                      isPlaying={isPlaying && currentTrack?.id === track.id}
                      onPlay={() => playTrack(track, trendingTracks)}
                      onArtistClick={() => handleNavigateToArtist(track.artist)}
                      animationsEnabled={animationsEnabled}
                    />
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5.5 sm:gap-4"
              >
                {trendingTracks.slice(0, 5).map((track, i) => (
                  <TrackCard
                    key={track.id}
                    track={track}
                    index={i}
                    isCurrent={currentTrack?.id === track.id}
                    isPlaying={isPlaying && currentTrack?.id === track.id}
                    onPlay={() => playTrack(track, trendingTracks)}
                    onArtistClick={() => handleNavigateToArtist(track.artist)}
                    animationsEnabled={animationsEnabled}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </Section>

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
                  if (pl.tracks.length > 0) playTrack(pl.tracks[0], pl.tracks);
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
// QUICK STAT
// ═════════════════════════════════════════════════════════════════════════

function QuickStat({
  icon: Icon,
  label,
  value,
  onClick,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  onClick: () => void;
  accent: string;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      className="mq-premium-card rounded-2xl p-3 sm:p-3.5 flex items-center gap-2.5 cursor-pointer mq-premium-hover"
    >
      <div
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 20%, transparent)`,
        }}
      >
        <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-base sm:text-lg font-bold leading-none" style={{ color: "var(--mq-text)" }}>{value}</p>
        <p className="text-[10px] sm:text-[11px] mt-1 truncate" style={{ color: "var(--mq-text-muted)" }}>{label}</p>
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        {/* Play button */}
        <div
          className="absolute bottom-2 right-2 w-11 h-11 sm:w-10 sm:h-10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover:scale-100 translate-y-2 group-hover:translate-y-0"
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
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold backdrop-blur-md flex items-center gap-1"
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        {/* Play button */}
        {pl.tracks.length > 0 && (
          <div
            onClick={onPlay}
            className="absolute bottom-2 right-2 w-9 h-9 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover:scale-100 translate-y-2 group-hover:translate-y-0 cursor-pointer"
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
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold backdrop-blur-md flex items-center gap-1"
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
// RECOMMENDATION CATEGORY ROW
// ═════════════════════════════════════════════════════════════════════════

function RecCategoryRow({
  category,
  currentTrack,
  isPlaying,
  onPlay,
  onArtistClick,
  animationsEnabled,
}: {
  category: RecCategory;
  currentTrack: Track | null;
  isPlaying: boolean;
  onPlay: (track: Track) => void;
  onArtistClick: (artist: string) => void;
  animationsEnabled: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-bold" style={{ color: "var(--mq-text)" }}>{category.title}</h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text-muted)" }}>
          {category.tracks.length}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5.5 sm:gap-4">
        {category.tracks.slice(0, 5).map((track, i) => (
          <TrackCard
            key={track.id + "_" + i}
            track={track}
            index={i}
            isCurrent={currentTrack?.id === track.id}
            isPlaying={isPlaying && currentTrack?.id === track.id}
            onPlay={() => onPlay(track)}
            onArtistClick={() => onArtistClick(track.artist)}
            animationsEnabled={animationsEnabled}
          />
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// TRENDING ROW (expanded list)
// ═════════════════════════════════════════════════════════════════════════

function TrendingRow({
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
  const [hovering, setHovering] = useState(false);
  return (
    <motion.div
      onHoverStart={() => setHovering(true)}
      onHoverEnd={() => setHovering(false)}
      onClick={onPlay}
      whileTap={{ scale: 0.99 }}
      className="group flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors"
      style={{ backgroundColor: isCurrent ? "color-mix(in srgb, var(--mq-accent) 10%, transparent)" : "transparent" }}
    >
      <div className="w-7 flex-shrink-0 text-center">
        {isCurrent && isPlaying ? (
          <EqualizerIcon />
        ) : hovering ? (
          <Play className="w-3.5 h-3.5 mx-auto" style={{ color: "var(--mq-text)" }} fill="currentColor" />
        ) : (
          <span className="text-xs font-medium" style={{ color: "var(--mq-text-muted)" }}>{index}</span>
        )}
      </div>
      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: "var(--mq-card)" }}>
        {track.cover ? (
          <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] sm:text-sm font-medium truncate" style={{ color: isCurrent ? "var(--mq-accent)" : "var(--mq-text)" }}>{track.title}</p>
        <button
          onClick={(e) => { e.stopPropagation(); onArtistClick(); }}
          className="text-[11px] sm:text-xs truncate hover:underline block w-full text-left"
          style={{ color: "var(--mq-text-muted)" }}
        >
          {track.artist}
        </button>
      </div>
    </motion.div>
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
        <p className="text-[10px] truncate w-full text-center" style={{ color: "var(--mq-text-muted)" }}>
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        {pl.tracks.length > 0 && (
          <div
            className="absolute bottom-2 right-2 w-11 h-11 sm:w-10 sm:h-10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover:scale-100 translate-y-2 group-hover:translate-y-0"
            style={{ backgroundColor: "var(--mq-accent)", boxShadow: "0 4px 16px color-mix(in srgb, var(--mq-accent) 40%, transparent)" }}
          >
            <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-[13px] sm:text-sm font-semibold truncate leading-tight" style={{ color: "var(--mq-text)" }}>{pl.name}</p>
        <p className="text-[11px] sm:text-xs mt-0.5 truncate" style={{ color: "var(--mq-text-muted)" }}>{pl.subtitle}</p>
        <p className="text-[10px] mt-1.5 uppercase tracking-wider font-semibold" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
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
  onSkip,
  onDislike,
  onLike,
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
  onSkip: () => void;
  onDislike: () => void;
  onLike: () => void;
  topGenres: string[];
}) {
  return (
    <div
      className={isMobile ? "relative mb-8 rounded-[28px] overflow-hidden" : "mq-hero-card relative mb-8"}
      style={{
        background: isMobile
          ? (currentTrack?.cover
            ? `linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 20%, var(--mq-bg)), color-mix(in srgb, var(--mq-accent) 8%, var(--mq-bg)))`
            : getWaveGradient())
          : getWaveGradient(),
        minHeight: isMobile ? 140 : 160,
        boxShadow: "var(--mq-shadow-float)",
      }}
    >
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

      {/* Subtle noise texture overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{ opacity: isMobile ? 0.04 : 0.08, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", backgroundRepeat: "repeat", backgroundSize: "128px 128px" }} />

      {/* Animated wave background when playing */}
      {radioMode && currentTrack && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ opacity: isMobile ? 0.06 : 0.08 }}>
          <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1200 80" preserveAspectRatio="none" style={{ height: 55 }}>
            <motion.path
              d="M0,40 C150,15 300,65 450,40 C600,15 750,65 900,40 C1050,15 1200,65 1200,40 L1200,80 L0,80 Z"
              fill="white"
              animate={{ d: [
                "M0,40 C150,15 300,65 450,40 C600,15 750,65 900,40 C1050,15 1200,65 1200,40 L1200,80 L0,80 Z",
                "M0,50 C150,65 300,20 450,45 C600,65 750,20 900,50 C1050,65 1200,20 1200,45 L1200,80 L0,80 Z",
                "M0,40 C150,15 300,65 450,40 C600,15 750,65 900,40 C1050,15 1200,65 1200,40 L1200,80 L0,80 Z",
              ] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
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
              <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.06 }}
                onClick={onDislike}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
                <ThumbsDown className="w-4 h-4 sm:w-5 sm:h-5" />
              </motion.button>
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
                  <Waves className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.9)" }} />
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.85)" }}>Волна · Играет</span>
                </div>
                <p className="text-lg font-bold truncate" style={{ color: "#fff" }}>{currentTrack.title}</p>
                <p className="text-sm truncate" style={{ color: "rgba(255,255,255,0.7)" }}>{currentTrack.artist}</p>
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
                      animate={isPlaying ? { height: [3, 5 + (i % 3) * 2, 3] } : { height: 3 }}
                      transition={isPlaying ? { duration: 0.5 + i * 0.08, repeat: Infinity, ease: "easeInOut", delay: i * 0.06 } : { duration: 0.2 }} />
                  ))}
                </div>
                <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.08 }}
                  onClick={onPauseWave}
                  className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.95)", color: "#1a1a2e", boxShadow: "var(--mq-shadow-card-hover)" }}>
                  {isPlaying ? <Pause className="w-6 h-6" fill="currentColor" /> : <Play className="w-6 h-6 ml-0.5" fill="currentColor" />}
                </motion.button>
                <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.08 }}
                  onClick={onSkip}
                  className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)" }}>
                  <SkipForward className="w-5 h-5" fill="currentColor" />
                </motion.button>
                <motion.button whileTap={{ scale: 0.9 }} whileHover={{ scale: 1.08 }}
                  onClick={onDislike}
                  className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
                  <ThumbsDown className="w-5 h-5" />
                </motion.button>
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
                  <motion.div className="w-5 h-5 border-2 rounded-full" style={{ borderColor: "var(--mq-bg)", borderTopColor: "transparent" }} animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
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
                  <motion.div className="w-6 h-6 border-2 rounded-full" style={{ borderColor: "#1a1a2e", borderTopColor: "transparent" }} animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
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

// ═════════════════════════════════════════════════════════════════════════
// EQUALIZER ICON (for currently playing)
// ═════════════════════════════════════════════════════════════════════════

function EqualizerIcon() {
  return (
    <div className="w-3.5 h-3.5 flex items-end justify-center gap-[2px]">
      {[0, 1, 2, 3].map(i => (
        <motion.span
          key={i}
          className="w-[2px] rounded-full"
          style={{ backgroundColor: "var(--mq-accent)", height: "100%" }}
          animate={{ scaleY: [0.3, 1, 0.3] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
