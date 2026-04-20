"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, type FavoriteArtist } from "@/store/useAppStore";

interface SCArtistData {
  id: number;
  username: string;
  avatar: string;
  followers: number;
  genre: string;
  trackCount: number;
}

const GENRE_CATEGORIES = [
  { name: "Hip-Hop", query: "hip-hop" },
  { name: "R&B", query: "r&b soul" },
  { name: "Electronic", query: "electronic music" },
  { name: "Rock", query: "rock music" },
  { name: "Pop", query: "pop music" },
  { name: "Indie", query: "indie alternative" },
  { name: "Jazz", query: "jazz" },
  { name: "Lo-Fi", query: "lofi chillhop" },
  { name: "Latin", query: "reggaeton latin" },
  { name: "K-Pop", query: "k-pop" },
  { name: "Techno", query: "techno minimal" },
  { name: "Afrobeats", query: "afrobeats" },
  { name: "Drum & Bass", query: "drum and bass" },
  { name: "Synthwave", query: "synthwave retrowave" },
  { name: "Classical", query: "classical piano" },
  { name: "Metal", query: "metal rock" },
];

const MIN_ARTISTS = 3;

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export default function OnboardingView() {
  const {
    favoriteArtists,
    setFavoriteArtists,
    addFavoriteArtist,
    removeFavoriteArtist,
    setOnboardingComplete,
    saveFavoriteArtistsToServer,
    setView,
  } = useAppStore();

  const [step, setStep] = useState<"genres" | "artists" | "discover">("genres");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [artistResults, setArtistResults] = useState<SCArtistData[]>([]);
  const [discoverResults, setDiscoverResults] = useState<SCArtistData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingGenre, setLoadingGenre] = useState<string | null>(null);
  const [error, setError] = useState("");

  const selectedIds = new Set(favoriteArtists.map(a => a.id));

  // Load artists for selected genres
  const loadArtistsForGenres = useCallback(async (genres: string[]) => {
    if (genres.length === 0) {
      setArtistResults([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const allArtists: SCArtistData[] = [];
      const seenIds = new Set<number>();

      // Load artists for up to 3 selected genres in parallel
      const genresToFetch = genres.slice(0, 3);
      const results = await Promise.allSettled(
        genresToFetch.map(g =>
          fetch(`/api/music/artists?q=${encodeURIComponent(g)}&limit=15`)
            .then(r => r.json())
            .then(d => d.artists || [])
        )
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          for (const a of result.value) {
            if (!seenIds.has(a.id)) {
              seenIds.add(a.id);
              allArtists.push(a);
            }
          }
        }
      }

      // Sort by followers
      allArtists.sort((a, b) => b.followers - a.followers);
      setArtistResults(allArtists.slice(0, 24));
    } catch {
      setError("Не удалось загрузить артистов");
    } finally {
      setLoading(false);
    }
  }, []);

  // When user proceeds from genres to artists step
  const handleGenresNext = () => {
    if (selectedGenres.length === 0) {
      setError("Выберите хотя бы один жанр");
      return;
    }
    setError("");
    setStep("artists");
    loadArtistsForGenres(selectedGenres);
  };

  // Load similar artists for discovery step
  const handleArtistsNext = () => {
    if (favoriteArtists.length < MIN_ARTISTS) {
      setError(`Выберите хотя бы ${MIN_ARTISTS} артистов`);
      return;
    }
    setError("");
    loadDiscoverArtists();
    setStep("discover");
  };

  const loadDiscoverArtists = async () => {
    setLoading(true);
    try {
      // Get similar artists for each favorite
      const topFavs = favoriteArtists.slice(0, 3);
      const allArtists: SCArtistData[] = [];
      const seenIds = new Set<number>(favoriteArtists.map(a => a.id));

      const results = await Promise.allSettled(
        topFavs.map(a =>
          fetch(`/api/music/artists?similar=${encodeURIComponent(a.username)}&limit=10`)
            .then(r => r.json())
            .then(d => d.artists || [])
        )
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          for (const a of result.value) {
            if (!seenIds.has(a.id)) {
              seenIds.add(a.id);
              allArtists.push(a);
            }
          }
        }
      }

      allArtists.sort((a, b) => b.followers - a.followers);
      setDiscoverResults(allArtists.slice(0, 18));
    } catch {
      // Discovery is optional, no error needed
    } finally {
      setLoading(false);
    }
  };

  // Load more artists for a specific genre on the artists step
  const handleLoadMore = async (genreQuery: string) => {
    setLoadingGenre(genreQuery);
    try {
      const res = await fetch(`/api/music/artists?q=${encodeURIComponent(genreQuery)}&limit=15`);
      const data = await res.json();
      const newArtists = (data.artists || []) as SCArtistData[];
      setArtistResults(prev => {
        const existingIds = new Set(prev.map(a => a.id));
        const unique = newArtists.filter(a => !existingIds.has(a.id));
        return [...prev, ...unique].slice(0, 30);
      });
    } catch {} finally {
      setLoadingGenre(null);
    }
  };

  const toggleArtist = (artist: SCArtistData) => {
    if (selectedIds.has(artist.id)) {
      removeFavoriteArtist(artist.id);
    } else {
      addFavoriteArtist(artist);
    }
  };

  const handleFinish = async () => {
    // Save to server
    setOnboardingComplete(true);
    await saveFavoriteArtistsToServer();

    // Also call the API to mark onboarding complete in DB
    try {
      await fetch("/api/user/favorite-artists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artists: favoriteArtists,
          completeOnboarding: true,
        }),
      });
    } catch {}

    setView("main");
  };

  const handleSkip = async () => {
    setOnboardingComplete(true);
    try {
      await fetch("/api/user/favorite-artists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completeOnboarding: true }),
      });
    } catch {}
    setView("main");
  };

  // Step 1: Genre selection
  const renderGenresStep = () => (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto px-4">
      <div className="text-center">
        <h1
          className="text-2xl font-bold mb-2"
          style={{ color: "var(--mq-text, #fff)" }}
        >
          Какую музыку вы слушаете?
        </h1>
        <p className="text-sm" style={{ color: "var(--mq-text-secondary, #888)" }}>
          Выберите жанры, которые вам нравятся
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full">
        {GENRE_CATEGORIES.map(cat => {
          const isSelected = selectedGenres.includes(cat.name);
          return (
            <motion.button
              key={cat.name}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                setSelectedGenres(prev =>
                  isSelected
                    ? prev.filter(g => g !== cat.name)
                    : [...prev, cat.name]
                );
                setError("");
              }}
              className="px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 border text-left"
              style={{
                backgroundColor: isSelected
                  ? "var(--mq-accent, #e03131)"
                  : "var(--mq-surface, #1a1a1a)",
                borderColor: isSelected
                  ? "var(--mq-accent, #e03131)"
                  : "var(--mq-border, #2a2a2a)",
                color: isSelected ? "#fff" : "var(--mq-text, #ccc)",
              }}
            >
              {cat.name}
            </motion.button>
          );
        })}
      </div>

      {error && (
        <p className="text-sm" style={{ color: "#ff6b6b" }}>{error}</p>
      )}

      <div className="flex gap-3 mt-2">
        <button
          onClick={handleSkip}
          className="px-6 py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{
            color: "var(--mq-text-secondary, #888)",
            backgroundColor: "transparent",
          }}
        >
          Пропустить
        </button>
        <button
          onClick={handleGenresNext}
          className="px-8 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
          style={{
            backgroundColor: "var(--mq-accent, #e03131)",
            opacity: selectedGenres.length > 0 ? 1 : 0.5,
          }}
        >
          Далее
        </button>
      </div>
    </div>
  );

  // Step 2: Artist selection from genres
  const renderArtistsStep = () => (
    <div className="flex flex-col items-center gap-6 w-full max-w-3xl mx-auto px-4">
      <div className="text-center">
        <h1
          className="text-2xl font-bold mb-2"
          style={{ color: "var(--mq-text, #fff)" }}
        >
          Выберите любимых артистов
        </h1>
        <p className="text-sm" style={{ color: "var(--mq-text-secondary, #888)" }}>
          Минимум {MIN_ARTISTS}, чтобы мы могли подобрать рекомендации
        </p>
        <div className="flex items-center justify-center gap-2 mt-3">
          <span
            className="text-xs px-3 py-1 rounded-full"
            style={{
              backgroundColor: "var(--mq-surface, #1a1a1a)",
              color: favoriteArtists.length >= MIN_ARTISTS
                ? "#4ade80"
                : "var(--mq-accent, #e03131)",
            }}
          >
            {favoriteArtists.length} / {MIN_ARTISTS} выбрано
          </span>
        </div>
      </div>

      {/* Selected genres tags */}
      <div className="flex flex-wrap gap-2 justify-center">
        {selectedGenres.map(g => (
          <span
            key={g}
            className="text-xs px-3 py-1 rounded-full"
            style={{
              backgroundColor: "var(--mq-surface, #1a1a1a)",
              color: "var(--mq-text-secondary, #888)",
            }}
          >
            {g}
          </span>
        ))}
        <button
          onClick={() => setStep("genres")}
          className="text-xs px-3 py-1 rounded-full transition-colors"
          style={{ color: "var(--mq-accent, #e03131)" }}
        >
          Изменить
        </button>
      </div>

      {/* Load more buttons for each genre */}
      <div className="flex flex-wrap gap-2 justify-center">
        {selectedGenres.slice(0, 3).map((g) => {
          const cat = GENRE_CATEGORIES.find(c => c.name === g);
          return cat ? (
            <button
              key={g}
              onClick={() => handleLoadMore(cat.query)}
              disabled={loadingGenre === cat.query}
              className="text-xs px-3 py-1.5 rounded-lg transition-all border"
              style={{
                borderColor: "var(--mq-border, #2a2a2a)",
                color: loadingGenre === cat.query
                  ? "var(--mq-text-secondary, #555)"
                  : "var(--mq-text, #aaa)",
                backgroundColor: "var(--mq-surface, #1a1a1a)",
              }}
            >
              {loadingGenre === cat.query ? "..." : `+ Ещё ${g}`}
            </button>
          ) : null;
        })}
      </div>

      {/* Artist grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div
            className="w-8 h-8 border-2 rounded-full animate-spin"
            style={{
              borderColor: "var(--mq-accent, #e03131)",
              borderTopColor: "transparent",
            }}
          />
        </div>
      ) : artistResults.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 w-full">
          {artistResults.map((artist) => {
            const isSelected = selectedIds.has(artist.id);
            return (
              <motion.button
                key={artist.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => toggleArtist(artist)}
                className="flex flex-col items-center gap-2 p-2 rounded-xl transition-all relative"
                style={{
                  backgroundColor: isSelected
                    ? "rgba(224, 49, 49, 0.1)"
                    : "transparent",
                }}
              >
                {/* Checkmark overlay */}
                {isSelected && (
                  <div
                    className="absolute top-0 right-0 w-5 h-5 rounded-full flex items-center justify-center z-10"
                    style={{ backgroundColor: "var(--mq-accent, #e03131)" }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}

                <div
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden flex-shrink-0"
                  style={{
                    border: isSelected
                      ? "3px solid var(--mq-accent, #e03131)"
                      : "3px solid var(--mq-border, #2a2a2a)",
                  }}
                >
                  {artist.avatar ? (
                    <img
                      src={artist.avatar}
                      alt={artist.username}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-lg font-bold"
                      style={{
                        backgroundColor: "var(--mq-surface, #1a1a1a)",
                        color: "var(--mq-text-secondary, #555)",
                      }}
                    >
                      {artist.username[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <p
                  className="text-xs font-medium text-center leading-tight w-full truncate px-1"
                  style={{
                    color: isSelected
                      ? "var(--mq-text, #fff)"
                      : "var(--mq-text-secondary, #999)",
                  }}
                >
                  {artist.username}
                </p>
                {artist.genre && (
                  <p
                    className="text-[10px] w-full truncate px-1"
                    style={{ color: "var(--mq-text-secondary, #666)" }}
                  >
                    {artist.genre}
                  </p>
                )}
                <p className="text-[10px]" style={{ color: "#555" }}>
                  {formatFollowers(artist.followers)}
                </p>
              </motion.button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--mq-text-secondary, #888)" }}>
          Артисты не найдены. Попробуйте другие жанры.
        </p>
      )}

      {error && (
        <p className="text-sm" style={{ color: "#ff6b6b" }}>{error}</p>
      )}

      <div className="flex gap-3 mt-2">
        <button
          onClick={() => setStep("genres")}
          className="px-6 py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{ color: "var(--mq-text-secondary, #888)" }}
        >
          Назад
        </button>
        <button
          onClick={handleArtistsNext}
          className="px-8 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
          style={{
            backgroundColor: "var(--mq-accent, #e03131)",
            opacity: favoriteArtists.length >= MIN_ARTISTS ? 1 : 0.5,
          }}
        >
          Далее
        </button>
      </div>
    </div>
  );

  // Step 3: Discover similar artists
  const renderDiscoverStep = () => (
    <div className="flex flex-col items-center gap-6 w-full max-w-3xl mx-auto px-4">
      <div className="text-center">
        <h1
          className="text-2xl font-bold mb-2"
          style={{ color: "var(--mq-text, #fff)" }}
        >
          Вам также может понравиться
        </h1>
        <p className="text-sm" style={{ color: "var(--mq-text-secondary, #888)" }}>
          Похожие артисты на основе ваших выборов. Выберите дополнительных.
        </p>
      </div>

      {/* Already selected artists */}
      <div className="flex gap-2 overflow-x-auto max-w-full pb-1 px-2">
        {favoriteArtists.map(a => (
          <div
            key={a.id}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor: "rgba(224, 49, 49, 0.15)",
              border: "1px solid var(--mq-accent, #e03131)",
            }}
          >
            {a.avatar ? (
              <img
                src={a.avatar}
                alt={a.username}
                className="w-5 h-5 rounded-full object-cover"
              />
            ) : null}
            <span
              className="text-xs font-medium"
              style={{ color: "var(--mq-text, #ddd)" }}
            >
              {a.username}
            </span>
            <button
              onClick={() => removeFavoriteArtist(a.id)}
              className="text-xs ml-1 opacity-60 hover:opacity-100"
              style={{ color: "var(--mq-text, #fff)" }}
            >
              x
            </button>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div
            className="w-8 h-8 border-2 rounded-full animate-spin"
            style={{
              borderColor: "var(--mq-accent, #e03131)",
              borderTopColor: "transparent",
            }}
          />
        </div>
      ) : discoverResults.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 w-full">
          {discoverResults.map((artist) => {
            const isSelected = selectedIds.has(artist.id);
            return (
              <motion.button
                key={artist.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => toggleArtist(artist)}
                className="flex flex-col items-center gap-2 p-2 rounded-xl transition-all relative"
                style={{
                  backgroundColor: isSelected
                    ? "rgba(224, 49, 49, 0.1)"
                    : "transparent",
                }}
              >
                {isSelected && (
                  <div
                    className="absolute top-0 right-0 w-5 h-5 rounded-full flex items-center justify-center z-10"
                    style={{ backgroundColor: "var(--mq-accent, #e03131)" }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}

                <div
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden flex-shrink-0"
                  style={{
                    border: isSelected
                      ? "3px solid var(--mq-accent, #e03131)"
                      : "3px solid var(--mq-border, #2a2a2a)",
                  }}
                >
                  {artist.avatar ? (
                    <img
                      src={artist.avatar}
                      alt={artist.username}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-lg font-bold"
                      style={{
                        backgroundColor: "var(--mq-surface, #1a1a1a)",
                        color: "var(--mq-text-secondary, #555)",
                      }}
                    >
                      {artist.username[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <p
                  className="text-xs font-medium text-center leading-tight w-full truncate px-1"
                  style={{
                    color: isSelected
                      ? "var(--mq-text, #fff)"
                      : "var(--mq-text-secondary, #999)",
                  }}
                >
                  {artist.username}
                </p>
                {artist.genre && (
                  <p
                    className="text-[10px] w-full truncate px-1"
                    style={{ color: "var(--mq-text-secondary, #666)" }}
                  >
                    {artist.genre}
                  </p>
                )}
              </motion.button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--mq-text-secondary, #888)" }}>
          Не удалось найти похожих артистов. Это нормально — можно продолжить.
        </p>
      )}

      <div className="flex gap-3 mt-2">
        <button
          onClick={() => setStep("artists")}
          className="px-6 py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{ color: "var(--mq-text-secondary, #888)" }}
        >
          Назад
        </button>
        <button
          onClick={handleFinish}
          className="px-8 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
          style={{ backgroundColor: "var(--mq-accent, #e03131)" }}
        >
          Начать слушать
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center py-12 px-4"
      style={{ backgroundColor: "var(--mq-bg, #0e0e0e)" }}
    >
      {/* MQ Logo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center gap-2 mb-8"
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{
            backgroundColor: "var(--mq-accent, #e03131)",
            boxShadow: "0 0 30px rgba(224, 49, 49, 0.3)",
          }}
        >
          <span className="text-2xl font-black text-white">mq</span>
        </div>
        <p className="text-xs" style={{ color: "var(--mq-text-secondary, #555)" }}>
          MQ Player
        </p>
      </motion.div>

      {/* Progress indicator */}
      <div className="flex items-center gap-2 mb-8">
        {["genres", "artists", "discover"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300"
              style={{
                backgroundColor:
                  step === s
                    ? "var(--mq-accent, #e03131)"
                    : ["genres", "artists", "discover"].indexOf(step) > i
                      ? "rgba(224, 49, 49, 0.3)"
                      : "var(--mq-surface, #1a1a1a)",
                color:
                  step === s
                    ? "#fff"
                    : ["genres", "artists", "discover"].indexOf(step) > i
                      ? "var(--mq-accent, #e03131)"
                      : "var(--mq-text-secondary, #555)",
                border:
                  step !== s
                    ? "1px solid var(--mq-border, #2a2a2a)"
                    : "1px solid transparent",
              }}
            >
              {["genres", "artists", "discover"].indexOf(step) > i ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            {i < 2 && (
              <div
                className="w-8 h-0.5 rounded-full transition-all duration-300"
                style={{
                  backgroundColor:
                    ["genres", "artists", "discover"].indexOf(step) > i
                      ? "var(--mq-accent, #e03131)"
                      : "var(--mq-border, #2a2a2a)",
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
          className="w-full flex justify-center"
        >
          {step === "genres" && renderGenresStep()}
          {step === "artists" && renderArtistsStep()}
          {step === "discover" && renderDiscoverStep()}
        </motion.div>
      </AnimatePresence>

      {/* Skip all */}
      {step !== "discover" && (
        <button
          onClick={handleSkip}
          className="mt-6 text-xs transition-colors"
          style={{ color: "var(--mq-text-secondary, #555)" }}
        >
          Пропустить настройку
        </button>
      )}
    </div>
  );
}
