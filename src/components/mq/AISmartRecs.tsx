"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { type Track } from "@/lib/musicApi";
import { extractTasteProfile, tasteProfileToSummary } from "@/lib/tasteProfile";
import {
  Sparkles, Play, Music, Brain, Heart, Zap, Coffee,
  Moon, Sun, Dumbbell, CloudRain, PartyPopper, TreePine,
  GraduationCap, Plane, RefreshCw, ChevronRight, Headphones,
  Flame, Waves, Radio, X, Plus,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

// ── Mood/activity presets for quick AI recs ──
const MOOD_PRESETS = [
  { id: "morning", label: "Утро", icon: Sun, prompt: "Подбери бодрящую утреннюю музыку, позитивную и энергичную", color: "#fbbf24" },
  { id: "work", label: "Работа", icon: Coffee, prompt: "Фоновая музыка для концентрации и продуктивной работы", color: "#3b82f6" },
  { id: "workout", label: "Тренировка", icon: Dumbbell, prompt: "Энергичная музыка для интенсивной тренировки с мощным битом", color: "#ef4444" },
  { id: "chill", label: "Чилл", icon: Waves, prompt: "Расслабляющая музыка для отдыха, спокойная и мягкая", color: "#06b6d4" },
  { id: "sad", label: "Грусть", icon: CloudRain, prompt: "Меланхоличная музыка для грустного настроения, эмоциональная", color: "#8b5cf6" },
  { id: "party", label: "Вечеринка", icon: PartyPopper, prompt: "Танцевальная музыка для вечеринки, ритмичная и драйвовая", color: "#f43f5e" },
  { id: "sleep", label: "Сон", icon: Moon, prompt: "Очень спокойная музыка для засыпания, эмбиент и минимализм", color: "#6366f1" },
  { id: "drive", label: "Дорога", icon: Plane, prompt: "Музыка для дороги, бодрящая и атмосферная", color: "#f97316" },
  { id: "study", label: "Учёба", icon: GraduationCap, prompt: "Музыка для учёбы, фокусировка без отвлечения, лоу-фай", color: "#10b981" },
  { id: "nature", label: "Природа", icon: TreePine, prompt: "Акустическая музыка на природе, органичная и тёплая", color: "#22c55e" },
  { id: "favorites", label: "Любимое", icon: Heart, prompt: "Найди музыку похожую на мои любимые треки и артистов", color: "#ec4899" },
  { id: "surprise", label: "Сюрприз", icon: Zap, prompt: "Удиви меня! Подбери что-то необычное и новое, что я ещё не слышал", color: "#a855f7" },
] as const;

interface AISmartRecsProps {
  playTrack: (track: Track, queue?: Track[]) => void;
  addToUpNext: (track: Track) => void;
  animationsEnabled: boolean;
}

export default function AISmartRecs({ playTrack, addToUpNext, animationsEnabled }: AISmartRecsProps) {
  const isMobile = useIsMobile();
  const history = useAppStore((s) => s.history);
  const likedTracksData = useAppStore((s) => s.likedTracksData);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const dislikedTrackIds = useAppStore((s) => s.dislikedTrackIds);
  const tasteGenres = useAppStore((s) => s.tasteGenres);
  const tasteArtists = useAppStore((s) => s.tasteArtists);
  const tasteMoods = useAppStore((s) => s.tasteMoods);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState("");
  const [tasteInsight, setTasteInsight] = useState("");
  const [showAll, setShowAll] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Build taste context for API calls (M3.4: uses shared extractTasteProfile)
  const buildTasteContext = useCallback(() => {
    const tp = extractTasteProfile({
      history,
      likedTracksData,
      tasteGenres,
      tasteArtists,
      tasteMoods,
      dislikedTrackIds,
    });
    return {
      allGenres: tp.allGenres,
      allArtists: tp.allArtists,
      language: tp.language,
      recentTitles: tp.recentTitles,
      topMoods: tp.topMoods,
    };
  }, [tasteGenres, tasteArtists, tasteMoods, history, likedTracksData, dislikedTrackIds]);

  // Generate taste insight text (M3.4: shared helper)
  useEffect(() => {
    const tp = extractTasteProfile({
      history, likedTracksData, tasteGenres, tasteArtists, tasteMoods, dislikedTrackIds,
    });
    setTasteInsight(tasteProfileToSummary(tp));
  }, [buildTasteContext, history, likedTracksData, tasteGenres, tasteArtists, tasteMoods, dislikedTrackIds]);

  // Fetch AI recommendations
  const fetchRecommendations = useCallback(async (presetId?: string, customPrompt?: string) => {
    // Abort previous request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setActivePreset(presetId || null);

    try {
      const { allGenres, allArtists, language, recentTitles } = buildTasteContext();

      // If user has no taste data, still allow mood presets to work
      // (AI will generate generic recommendations based on the mood prompt)

      // Determine the prompt to send
      const preset = MOOD_PRESETS.find(p => p.id === presetId);
      const userPrompt = customPrompt || preset?.prompt || "";

      // Call AI chat endpoint for smart queries
      const tasteProfile = {
        genres: allGenres,
        artists: allArtists,
        moods: Object.entries(tasteMoods || {}).filter(([, v]) => v >= 30).map(([m]) => m),
        language,
        recentTracks: recentTitles,
        topHistoryGenres: allGenres,
        topHistoryArtists: allArtists,
        skippedGenres: [],
        completedGenres: [],
        sessionMinutes: 0,
        likedCount: likedTrackIds.length,
        historyCount: history.length,
      };

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: userPrompt || "Подбери музыку на основе моих предпочтений" }],
          tasteProfile,
          sessionId: "smart-recs",
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // Fallback to direct recommendations API
        const params = new URLSearchParams();
        if (allGenres.length > 0) params.set("genres", allGenres.join(","));
        if (allArtists.length > 0) params.set("artists", allArtists.join(","));
        if (language !== "mixed") params.set("lang", language);
        params.set("limit", "50");

        const fallbackRes = await fetch(`/api/ai/recommendations?${params}`, { signal: controller.signal });
        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          setTracks((data.tracks || []).filter((t: Track) => !(dislikedTrackIds || []).includes(t.id)));
          setAiSummary(data._meta?.aiSummary || "Рекомендации на основе ваших предпочтений");
        }
        return;
      }

      const data = await res.json();
      if (controller.signal.aborted) return;

      const filteredTracks = (data.tracks || []).filter((t: Track) => !(dislikedTrackIds || []).includes(t.id));
      setTracks(filteredTracks);
      setAiSummary(data.reply || "Подобрали музыку специально для вас");
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.error("[AISmartRecs] fetch error:", err);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [buildTasteContext, tasteMoods, likedTrackIds, dislikedTrackIds, history.length]);

  // Auto-fetch initial recommendations on mount (always try, even for new users)
  useEffect(() => {
    fetchRecommendations();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePresetClick = useCallback((presetId: string) => {
    if (activePreset === presetId) {
      // Toggle off — reset to default
      fetchRecommendations();
    } else {
      fetchRecommendations(presetId);
    }
  }, [activePreset, fetchRecommendations]);

  const handlePlayAll = useCallback(() => {
    if (tracks.length > 0) playTrack(tracks[0], tracks);
  }, [tracks, playTrack]);

  const handleRefresh = useCallback(() => {
    if (activePreset) {
      fetchRecommendations(activePreset);
    } else {
      fetchRecommendations();
    }
  }, [activePreset, fetchRecommendations]);

  const displayTracks = showAll ? tracks : tracks.slice(0, 50);

  // Always render the widget — show mood presets + loading/results
  if (tracks.length === 0 && !loading) {
    return (
      <div className="mb-10">
        {/* Mood presets only — no track results */}
        <div className="flex items-center gap-2.5 mb-4 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 15%, transparent)" }}>
            <Brain className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
          </div>
          <div className="min-w-0">
            <h2 className="truncate" style={{ color: "var(--mq-text)", fontSize: "var(--mq-text-xl)", fontWeight: "var(--mq-font-bold)", letterSpacing: "var(--mq-tracking-tight)" }}>
              AI Подбор
            </h2>
            <p className="text-[11px] truncate" style={{ color: "var(--mq-text-muted)" }}>{tasteInsight}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {MOOD_PRESETS.slice(0, 8).map((preset) => {
            const Icon = preset.icon;
            return (
              <motion.button
                key={preset.id}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handlePresetClick(preset.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium cursor-pointer transition-all"
                style={{
                  backgroundColor: "var(--mq-card)",
                  border: "1px solid var(--mq-border)",
                  color: "var(--mq-text-muted)",
                }}
              >
                <Icon className="w-3.5 h-3.5" style={{ color: preset.color }} />
                {preset.label}
              </motion.button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 15%, transparent)" }}>
            <Brain className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
          </div>
          <div className="min-w-0">
            <h2 className="truncate" style={{ color: "var(--mq-text)", fontSize: "var(--mq-text-xl)", fontWeight: "var(--mq-font-bold)", letterSpacing: "var(--mq-tracking-tight)" }}>
              AI Подбор
            </h2>
            <p className="text-[11px] truncate" style={{ color: "var(--mq-text-muted)" }}>
              {tasteInsight}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {tracks.length > 0 && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handlePlayAll}
              className="text-xs px-3 py-1.5 rounded-full font-medium cursor-pointer flex items-center gap-1"
              style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
            >
              <Play className="w-3 h-3" fill="currentColor" />
              Все
            </motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleRefresh}
            disabled={loading}
            className="p-1.5 rounded-lg cursor-pointer"
            style={{ color: "var(--mq-text-muted)" }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </motion.button>
        </div>
      </div>

      {/* Mood/Activity presets — horizontal scroll */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none" style={{ scrollbarWidth: "none" }}>
        {MOOD_PRESETS.map((preset) => {
          const Icon = preset.icon;
          const isActive = activePreset === preset.id;
          return (
            <motion.button
              key={preset.id}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handlePresetClick(preset.id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer transition-all flex-shrink-0"
              style={{
                backgroundColor: isActive ? "var(--mq-accent)" : "var(--mq-card)",
                border: isActive ? "1px solid var(--mq-accent)" : "1px solid var(--mq-border)",
                color: isActive ? "var(--mq-text)" : "var(--mq-text-muted)",
                boxShadow: isActive ? `0 2px 12px color-mix(in srgb, var(--mq-accent) 30%, transparent)` : "none",
              }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: isActive ? "var(--mq-text)" : preset.color }} />
              {preset.label}
            </motion.button>
          );
        })}
      </div>

      {/* AI Summary */}
      {aiSummary && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 flex items-start gap-2 px-3 py-2 rounded-xl"
          style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--mq-accent) 12%, transparent)" }}
        >
          <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>{aiSummary}</p>
        </motion.div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-3 py-8 justify-center">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: "var(--mq-accent)" }}
                animate={{ y: [0, -8, 0], opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
              />
            ))}
          </div>
          <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>AI подбирает...</span>
        </div>
      )}

      {/* Track results — grid layout */}
      {!loading && tracks.length > 0 && (
        <motion.div layout>
          {/* Mobile: compact list, Desktop: grid */}
          <div className={`grid gap-2 ${isMobile ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-3"}`}>
            <AnimatePresence mode="popLayout">
              {displayTracks.map((track, i) => (
                <motion.div
                  key={track.id}
                  initial={animationsEnabled ? { opacity: 0, y: 10 } : undefined}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ delay: i * 0.03 }}
                  className="group cursor-pointer"
                  onClick={() => playTrack(track, tracks)}
                >
                  <div
                    className="flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200 hover:scale-[1.01]"
                    style={{
                      backgroundColor: "var(--mq-card)",
                      border: "1px solid var(--mq-border)",
                    }}
                  >
                    {/* Cover */}
                    <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 relative">
                      {track.cover ? (
                        <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)", opacity: 0.4 }}>
                          <Music className="w-4 h-4" style={{ color: "var(--mq-text)" }} />
                        </div>
                      )}
                      {/* Play overlay */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                        <Play className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity ml-0.5" fill="currentColor" />
                      </div>
                      {/* AI badge */}
                      <div className="absolute top-0.5 right-0.5">
                        <span className="text-[11px] px-1 py-[1px] rounded-full font-bold"
                          style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "var(--mq-accent)", backdropFilter: "blur(4px)" }}>
                          AI
                        </span>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate" style={{ color: "var(--mq-text)" }}>
                        {track.title}
                      </p>
                      <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
                        {track.artist}
                        {track.genre ? ` · ${track.genre}` : ""}
                      </p>
                    </div>

                    {/* Add to queue */}
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => { e.stopPropagation(); addToUpNext(track); }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
                    >
                      <Plus className="w-3 h-3" />
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Show more / less */}
          {tracks.length > 50 && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowAll(!showAll)}
              className="mt-3 w-full py-2 rounded-xl text-xs font-medium cursor-pointer flex items-center justify-center gap-1.5 transition-all"
              style={{
                backgroundColor: "var(--mq-card)",
                border: "1px solid var(--mq-border)",
                color: "var(--mq-text-muted)",
              }}
            >
              {showAll ? "Свернуть" : `Ещё ${tracks.length - 50} треков`}
              <ChevronRight className={`w-3 h-3 transition-transform ${showAll ? "rotate-90" : ""}`} />
            </motion.button>
          )}
        </motion.div>
      )}

      {/* Empty state with no tracks and not loading */}
      {!loading && tracks.length === 0 && (
        <div className="text-center py-8 rounded-2xl" style={{ backgroundColor: "var(--mq-card)" }}>
          <Brain className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--mq-accent)", opacity: 0.4 }} />
          <p className="text-xs mb-3" style={{ color: "var(--mq-text-muted)" }}>
            Выберите настроение или активность, и AI подберёт треки
          </p>
        </div>
      )}
    </div>
  );
}
