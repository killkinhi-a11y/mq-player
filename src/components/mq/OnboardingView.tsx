"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { Music, ChevronRight, ChevronLeft, Check, Loader2, Sparkles, Waves } from "lucide-react";

/**
 * OnboardingView v3 — 2 шага: жанры → артисты.
 *
 * Task 6 improvements:
 * - Step progress bar (1/2, 2/2) — the user always knows where they are.
 * - Selected genres are PERSISTED into the store's tasteGenres (weight 60,
 *   above the "liked" threshold 20) — they genuinely drive /recommendations
 *   (genres param via extractTasteProfile) AND the Wave radio (tasteGenres
 *   param). Not decorative state.
 * - onboardingComplete is persisted SERVER-side (completeOnboarding flag) —
 *   a fresh device/login no longer re-shows the wizard for a finished user.
 * - Finish is await-protected (no double-tap double-submit).
 * - Mobile-first: 44px chips, 48px footer buttons, sticky footer with real
 *   background (content never shows through the buttons).
 * - Loading state: skeleton artist tiles (honest — no fake content).
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
  const setTasteGenre = useAppStore((s) => s.setTasteGenre);
  const setView = useAppStore((s) => s.setView);
  const favoriteArtists = useAppStore((s) => s.favoriteArtists);
  const userId = useAppStore((s) => s.userId);

  const [step, setStep] = useState<"genres" | "artists">("genres");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [artists, setArtists] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [finishing, setFinishing] = useState(false);

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
    // Task 6: persist genre preferences into tasteGenres (weight 60 — above
    // the "liked" threshold). extractTasteProfile picks these up as topGenres
    // for /api/music/recommendations, and the Wave engine passes them as the
    // tasteGenres param — the selection genuinely steers real recommendations.
    selectedGenres.forEach(g => setTasteGenre(g, 60));
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
    if (finishing) return;
    setFinishing(true);
    try {
      setOnboardingComplete(true);
      // Server-side completion flag + the artist picks (survives new devices).
      await saveFavoriteArtistsToServer({ completeOnboarding: !!userId });
      setView("main");
    } finally {
      setFinishing(false);
    }
  };

  const handleSkip = () => {
    setOnboardingComplete(true);
    // Skip also persists completion server-side — "skip" is a decision, not a
    // forgotten half-state. Genre/artist preferences are NOT saved (the user
    // explicitly chose not to share them).
    saveFavoriteArtistsToServer({ completeOnboarding: !!userId });
    setView("main");
  };

  const stepIndex = step === "genres" ? 0 : 1;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start sm:items-center justify-center overflow-y-auto"
      style={{ backgroundColor: "var(--mq-bg)" }}
    >
      <div className="w-full max-w-2xl mx-auto px-4 py-6 sm:py-12 pb-28">
        {/* ── Step progress (Task 6) — sticky: orientation survives scrolling ── */}
        <div
          className="sticky top-0 z-20 mb-6 pt-2 -mt-2"
          style={{ background: "linear-gradient(to bottom, var(--mq-bg) 78%, color-mix(in srgb, var(--mq-bg) 0%, transparent))" }}
          aria-label={`Шаг ${stepIndex + 1} из 2`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="mq-t-meta text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--mq-text-muted)" }}>
              Шаг {stepIndex + 1} из 2
            </span>
            <span className="mq-t-meta text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
              {step === "genres"
                ? selectedGenres.length > 0 ? `Выбрано: ${selectedGenres.length}` : "Жанры"
                : favoriteArtists.length > 0 ? `Выбрано: ${favoriteArtists.length}` : "Артисты"}
            </span>
          </div>
          <div className="flex gap-1.5">
            {[0, 1].map(i => (
              <div
                key={i}
                className="h-1 flex-1 rounded-full transition-colors"
                style={{ backgroundColor: i <= stepIndex ? "var(--mq-accent)" : "var(--mq-border-thin)" }}
              />
            ))}
          </div>
        </div>

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
              <div className="mb-7">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
                  style={{
                    background: "linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 25%, transparent), color-mix(in srgb, var(--mq-accent) 8%, transparent))",
                    border: "1px solid color-mix(in srgb, var(--mq-accent) 20%, transparent)",
                  }}>
                  <Music className="w-6 h-6" style={{ color: "var(--mq-accent)" }} />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: "var(--mq-text)", letterSpacing: "-0.02em", fontFamily: "var(--mq-font-serif)" }}>
                  Какую музыку слушаете?
                </h1>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Выберите жанры — Волна и рекомендации сразу подстроятся под них
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
                          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
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
                              aria-pressed={isSelected}
                              className="min-h-[44px] px-4 py-2.5 rounded-full text-sm font-medium"
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
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
                  style={{
                    background: "linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 25%, transparent), color-mix(in srgb, var(--mq-accent) 8%, transparent))",
                    border: "1px solid color-mix(in srgb, var(--mq-accent) 20%, transparent)",
                  }}>
                  <Sparkles className="w-6 h-6" style={{ color: "var(--mq-accent)" }} />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: "var(--mq-text)", letterSpacing: "-0.02em", fontFamily: "var(--mq-font-serif)" }}>
                  Любимые артисты
                </h1>
                <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                  Отметьте тех, кто вам нравится — или пропустите шаг
                </p>
              </div>

              {/* Artists grid / loading skeleton / empty */}
              {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8" aria-label="Загружаем артистов">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center p-3 rounded-2xl"
                      style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border-hairline)" }}>
                      <div className="w-16 h-16 rounded-full mb-2 mq-shimmer" style={{ backgroundColor: "var(--mq-border-thin)" }} />
                      <div className="h-3 w-3/4 rounded-full mq-shimmer" style={{ backgroundColor: "var(--mq-border-thin)" }} />
                    </div>
                  ))}
                </div>
              ) : artists.length === 0 ? (
                <div className="text-center py-12 rounded-2xl mb-8"
                  style={{ backgroundColor: "var(--mq-card)", border: "1px dashed var(--mq-border-thin)" }}>
                  <Waves className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--mq-accent)" }} />
                  <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
                    Не нашли артистов по выбранным жанрам — Волна всё равно учтёт жанры.
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
                        aria-pressed={isSelected}
                        className="relative flex flex-col items-center p-3 rounded-2xl min-h-[44px]"
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
                        <div
                          className="w-16 h-16 rounded-full overflow-hidden mb-2 flex-shrink-0 flex items-center justify-center"
                          style={{
                            boxShadow: "var(--mq-shadow-premium-sm)",
                            background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 60%, #000))",
                          }}
                        >
                          {artist.avatar ? (
                            <img
                              src={artist.avatar}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <Music className="w-6 h-6" style={{ color: "var(--mq-text-on-accent, rgba(255,255,255,0.7))" }} />
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Sticky footer: solid surface, 48px targets, safe-area aware ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-10"
        style={{
          background: "linear-gradient(to top, var(--mq-bg) 62%, color-mix(in srgb, var(--mq-bg) 0%, transparent))",
          padding: "16px 16px calc(16px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          {step === "genres" ? (
            <button onClick={handleSkip}
              className="text-sm font-medium px-4 min-h-[48px] rounded-xl"
              style={{ color: "var(--mq-text-muted)" }}>
              Пропустить
            </button>
          ) : (
            <button onClick={() => setStep("genres")}
              className="flex items-center gap-1 text-sm font-medium px-4 min-h-[48px] rounded-xl"
              style={{ color: "var(--mq-text-muted)" }}>
              <ChevronLeft className="w-4 h-4" />
              Назад
            </button>
          )}
          {step === "genres" ? (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleGenreContinue}
              disabled={selectedGenres.length < MIN_GENRES}
              className="flex items-center gap-2 px-6 min-h-[48px] rounded-xl text-sm font-semibold"
              style={{
                backgroundColor: selectedGenres.length >= MIN_GENRES ? "var(--mq-accent)" : "var(--mq-card)",
                color: selectedGenres.length >= MIN_GENRES ? "var(--mq-text-on-accent, #fff)" : "var(--mq-text-muted)",
                boxShadow: selectedGenres.length >= MIN_GENRES ? "var(--mq-shadow-accent)" : "none",
                transition: "all var(--mq-duration-fast) var(--mq-spring-smooth)",
              }}>
              Далее
              <ChevronRight className="w-4 h-4" />
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleFinish}
              disabled={finishing}
              className="flex items-center gap-2 px-6 min-h-[48px] rounded-xl text-sm font-semibold"
              style={{
                backgroundColor: "var(--mq-accent)",
                color: "var(--mq-text-on-accent, #fff)",
                boxShadow: "var(--mq-shadow-accent)",
                opacity: finishing ? 0.7 : 1,
              }}>
              {finishing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {favoriteArtists.length > 0 ? `Готово (${favoriteArtists.length})` : "Завершить"}
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
