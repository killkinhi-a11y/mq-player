"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { Music, ChevronRight, Check, Loader2, Sparkles } from "lucide-react";

/**
 * OnboardingView v2 — полная переработка с нуля.
 *
 * Принципы дизайна:
 * - Чистый, минималистичный, в стиле проекта (glassmorphic, accent)
 * - 2 шага: жанры → артисты
 * - Большие тач-зоны для мобильных
 * - Плавные анимации (Framer Motion, custom easing)
 * - Нет перегруженности — один шаг за раз
 */

const GENRE_CATEGORIES: { category: string; emoji: string; genres: { name: string; query: string }[] }[] = [
  {
    category: "Хип-хоп и R&B",
    emoji: "🎤",
    genres: [
      { name: "Hip-Hop", query: "hip-hop" },
      { name: "Rap", query: "rap" },
      { name: "Trap", query: "trap music" },
      { name: "R&B", query: "r&b soul" },
      { name: "Drill", query: "drill rap" },
    ],
  },
  {
    category: "Электроника",
    emoji: "🎧",
    genres: [
      { name: "House", query: "house music" },
      { name: "Techno", query: "techno minimal" },
      { name: "Trance", query: "trance progressive" },
      { name: "Drum & Bass", query: "drum and bass" },
      { name: "Dubstep", query: "dubstep edm" },
      { name: "Ambient", query: "ambient electronic" },
    ],
  },
  {
    category: "Поп",
    emoji: "✨",
    genres: [
      { name: "Pop", query: "pop music" },
      { name: "K-Pop", query: "k-pop" },
      { name: "Indie Pop", query: "indie pop" },
      { name: "Synthpop", query: "synthpop" },
    ],
  },
  {
    category: "Рок и Метал",
    emoji: "🎸",
    genres: [
      { name: "Rock", query: "rock music" },
      { name: "Indie Rock", query: "indie rock" },
      { name: "Alternative", query: "alternative rock" },
      { name: "Metal", query: "metal rock" },
      { name: "Punk", query: "punk rock" },
    ],
  },
  {
    category: "Джаз, Соул и Блюз",
    emoji: "🎷",
    genres: [
      { name: "Jazz", query: "jazz" },
      { name: "Lo-Fi Jazz", query: "lofi jazz" },
      { name: "Soul", query: "soul music" },
      { name: "Blues", query: "blues" },
      { name: "Funk", query: "funk" },
    ],
  },
  {
    category: "Чилл и Лаунж",
    emoji: "🌙",
    genres: [
      { name: "Lo-Fi", query: "lofi chillhop" },
      { name: "Chill", query: "chill music" },
      { name: "Synthwave", query: "synthwave retrowave" },
      { name: "Acoustic", query: "acoustic" },
      { name: "Piano", query: "piano music" },
    ],
  },
  {
    category: "Латино и Мир",
    emoji: "🌍",
    genres: [
      { name: "Reggaeton", query: "reggaeton latin" },
      { name: "Afrobeats", query: "afrobeats" },
      { name: "Latin Pop", query: "latin pop" },
    ],
  },
  {
    category: "Классика",
    emoji: "🎻",
    genres: [
      { name: "Classical", query: "classical piano" },
      { name: "Neo-Classical", query: "neo classical" },
      { name: "Orchestral", query: "orchestral cinematic" },
    ],
  },
];

const MIN_GENRES = 1;

export default function OnboardingView() {
  const addFavoriteArtist = useAppStore((s) => s.addFavoriteArtist);
  const removeFavoriteArtist = useAppStore((s) => s.removeFavoriteArtist);
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete);
  const saveFavoriteArtistsToServer = useAppStore((s) => s.saveFavoriteArtistsToServer);
  const setView = useAppStore((s) => s.setView);
  const favoriteArtists = useAppStore((s) => s.favoriteArtists);

  const [step, setStep] = useState<"genres" | "artists">("genres");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [artists, setArtists] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadArtists = useCallback(async (genreItems: { name: string; query: string }[]) => {
    if (genreItems.length === 0) return;
    setLoading(true);
    try {
      const topGenres = genreItems.slice(0, 5);
      const results = await Promise.allSettled(
        topGenres.map(g =>
          fetch(`/api/music/search?q=${encodeURIComponent(g.query)}&limit=8`).then(r => r.ok ? r.json() : { tracks: [] })
        )
      );
      const allArtists: any[] = [];
      const seen = new Set<string>();
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        for (const track of (result.value.tracks || [])) {
          const artistName = (track.artist || "").trim();
          if (!artistName || seen.has(artistName.toLowerCase())) continue;
          seen.add(artistName.toLowerCase());
          allArtists.push({
            id: artistName.toLowerCase().replace(/\s+/g, "_"),
            username: artistName,
            avatar: track.cover || "",
            genre: track.genre || "",
            trackCount: 0,
          });
        }
      }
      setArtists(allArtists.slice(0, 30));
    } catch {
      setArtists([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleGenreToggle = (genreName: string) => {
    setSelectedGenres(prev =>
      prev.includes(genreName) ? prev.filter(g => g !== genreName) : [...prev, genreName]
    );
  };

  const handleGenreContinue = () => {
    if (selectedGenres.length < MIN_GENRES) return;
    setStep("artists");
    const selectedQueries = GENRE_CATEGORIES
      .flatMap(c => c.genres)
      .filter(g => selectedGenres.includes(g.name));
    loadArtists(selectedQueries);
  };

  const handleArtistToggle = (artist: any) => {
    const exists = favoriteArtists.some(a => a.id === artist.id);
    if (exists) {
      removeFavoriteArtist(artist.id);
    } else {
      addFavoriteArtist(artist);
    }
  };

  const handleFinish = async () => {
    setOnboardingComplete(true);
    await saveFavoriteArtistsToServer();
    setView("main");
  };

  const handleSkip = () => {
    setOnboardingComplete(true);
    setView("main");
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto"
      style={{ backgroundColor: "var(--mq-bg)" }}
    >
      <div className="w-full max-w-2xl mx-auto px-4 py-8 sm:py-12">
        <AnimatePresence mode="wait">
          {step === "genres" && (
            <motion.div
              key="genres"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            >
              {/* Header */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                  style={{
                    background: "linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 25%, transparent), color-mix(in srgb, var(--mq-accent) 8%, transparent))",
                    border: "1px solid color-mix(in srgb, var(--mq-accent) 20%, transparent)",
                  }}>
                  <Music className="w-7 h-7" style={{ color: "var(--mq-accent)" }} />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: "var(--mq-text)", letterSpacing: "-0.02em", fontFamily: "var(--mq-font-serif)" }}>
                  Какую музыку слушаете?
                </h1>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Выберите жанры — подберём треки для вас
                </p>
              </div>

              {/* Genre categories */}
              <div className="space-y-5 mb-8">
                {GENRE_CATEGORIES.map((cat) => {
                  const catSelected = cat.genres.filter(g => selectedGenres.includes(g.name)).length;
                  return (
                    <div key={cat.category}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-base">{cat.emoji}</span>
                        <span className="text-xs font-bold uppercase tracking-wider"
                          style={{ color: catSelected > 0 ? "var(--mq-accent)" : "var(--mq-text-muted)" }}>
                          {cat.category}
                        </span>
                        <div className="flex-1 h-px" style={{ backgroundColor: "var(--mq-border-hairline)" }} />
                        {catSelected > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{
                              backgroundColor: "color-mix(in srgb, var(--mq-accent) 18%, transparent)",
                              color: "var(--mq-accent)",
                            }}>
                            {catSelected}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {cat.genres.map((g) => {
                          const isSelected = selectedGenres.includes(g.name);
                          return (
                            <motion.button
                              key={g.name}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleGenreToggle(g.name)}
                              className="px-4 py-2 rounded-full text-sm font-medium"
                              style={{
                                backgroundColor: isSelected
                                  ? "color-mix(in srgb, var(--mq-accent) 15%, transparent)"
                                  : "var(--mq-card)",
                                border: isSelected
                                  ? "1px solid color-mix(in srgb, var(--mq-accent) 40%, transparent)"
                                  : "1px solid var(--mq-border-thin)",
                                color: isSelected ? "var(--mq-accent)" : "var(--mq-text-muted)",
                                transition: "all var(--mq-duration-fast) var(--mq-spring-smooth)",
                              }}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 inline mr-1.5" />}
                              {g.name}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-3 sticky bottom-4">
                <button onClick={handleSkip}
                  className="text-sm font-medium px-4 py-2.5 rounded-xl"
                  style={{ color: "var(--mq-text-muted)" }}>
                  Пропустить
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleGenreContinue}
                  disabled={selectedGenres.length < MIN_GENRES}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold"
                  style={{
                    backgroundColor: selectedGenres.length >= MIN_GENRES ? "var(--mq-accent)" : "var(--mq-card)",
                    color: selectedGenres.length >= MIN_GENRES ? "#fff" : "var(--mq-text-muted)",
                    boxShadow: selectedGenres.length >= MIN_GENRES ? "var(--mq-shadow-accent)" : "none",
                    transition: "all var(--mq-duration-fast) var(--mq-spring-smooth)",
                  }}>
                  Далее
                  <ChevronRight className="w-4 h-4" />
                </motion.button>
              </div>
            </motion.div>
          )}

          {step === "artists" && (
            <motion.div
              key="artists"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            >
              {/* Header */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                  style={{
                    background: "linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 25%, transparent), color-mix(in srgb, var(--mq-accent) 8%, transparent))",
                    border: "1px solid color-mix(in srgb, var(--mq-accent) 20%, transparent)",
                  }}>
                  <Sparkles className="w-7 h-7" style={{ color: "var(--mq-accent)" }} />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: "var(--mq-text)", letterSpacing: "-0.02em", fontFamily: "var(--mq-font-serif)" }}>
                  Любимые артисты
                </h1>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Выберите тех, кто вам нравится
                </p>
              </div>

              {/* Artists grid */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin mb-3" style={{ color: "var(--mq-accent)" }} />
                  <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>Ищем артистов...</p>
                </div>
              ) : artists.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                    Не нашли артистов по выбранным жанрам. Попробуйте продолжить.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
                  {artists.map((artist, i) => {
                    const isSelected = favoriteArtists.some(a => a.id === artist.id);
                    return (
                      <motion.button
                        key={artist.id + "_" + i}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.25 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => handleArtistToggle(artist)}
                        className="flex flex-col items-center p-3 rounded-2xl"
                        style={{
                          backgroundColor: isSelected
                            ? "color-mix(in srgb, var(--mq-accent) 12%, transparent)"
                            : "var(--mq-card)",
                          border: isSelected
                            ? "1px solid color-mix(in srgb, var(--mq-accent) 35%, transparent)"
                            : "1px solid var(--mq-border-hairline)",
                          transition: "all var(--mq-duration-fast) var(--mq-spring-smooth)",
                        }}
                      >
                        <div className="w-16 h-16 rounded-full overflow-hidden mb-2 flex-shrink-0"
                          style={{ boxShadow: "var(--mq-shadow-premium-sm)" }}>
                          {artist.avatar ? (
                            <img src={artist.avatar} alt="" className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"
                              style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))" }}>
                              <Music className="w-6 h-6" style={{ color: "var(--mq-text-on-accent, rgba(255,255,255,0.7))" }} />
                            </div>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-center truncate w-full"
                          style={{ color: isSelected ? "var(--mq-accent)" : "var(--mq-text)" }}>
                          {artist.username}
                        </p>
                        {isSelected && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: "var(--mq-accent)" }}>
                            <Check className="w-3 h-3" style={{ color: "#fff" }} />
                          </div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between gap-3 sticky bottom-4">
                <button onClick={() => setStep("genres")}
                  className="text-sm font-medium px-4 py-2.5 rounded-xl"
                  style={{ color: "var(--mq-text-muted)" }}>
                  Назад
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleFinish}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold"
                  style={{
                    backgroundColor: "var(--mq-accent)",
                    color: "#fff",
                    boxShadow: "var(--mq-shadow-accent)",
                  }}>
                  {favoriteArtists.length > 0
                    ? `Готово (${favoriteArtists.length})`
                    : "Завершить"}
                  <Check className="w-4 h-4" />
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
