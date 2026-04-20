"use client";

import { useState, useCallback } from "react";
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

interface SimilarBranch {
  parentId: number;
  artists: SCArtistData[];
  loading: boolean;
}

// ── Genre tree with sub-genres ──
const GENRE_TREE: { category: string; genres: { name: string; query: string }[] }[] = [
  {
    category: "Hip-Hop & R&B",
    genres: [
      { name: "Hip-Hop", query: "hip-hop" },
      { name: "Rap", query: "rap" },
      { name: "Trap", query: "trap music" },
      { name: "R&B", query: "r&b soul" },
      { name: "Drill", query: "drill rap" },
      { name: "Boom Bap", query: "boom bap hip hop" },
    ],
  },
  {
    category: "Electronic",
    genres: [
      { name: "House", query: "house music" },
      { name: "Techno", query: "techno minimal" },
      { name: "Trance", query: "trance progressive" },
      { name: "Drum & Bass", query: "drum and bass" },
      { name: "Dubstep", query: "dubstep edm" },
      { name: "Hardstyle", query: "hardstyle" },
      { name: "Ambient", query: "ambient electronic" },
    ],
  },
  {
    category: "Pop",
    genres: [
      { name: "Pop", query: "pop music" },
      { name: "K-Pop", query: "k-pop" },
      { name: "Dance Pop", query: "dance pop" },
      { name: "Indie Pop", query: "indie pop" },
      { name: "Synthpop", query: "synthpop" },
      { name: "Electropop", query: "electropop" },
    ],
  },
  {
    category: "Rock & Metal",
    genres: [
      { name: "Rock", query: "rock music" },
      { name: "Indie Rock", query: "indie rock" },
      { name: "Alternative", query: "alternative rock" },
      { name: "Metal", query: "metal rock" },
      { name: "Punk", query: "punk rock" },
      { name: "Post-Punk", query: "post-punk" },
      { name: "Grunge", query: "grunge" },
    ],
  },
  {
    category: "Jazz, Soul & Blues",
    genres: [
      { name: "Jazz", query: "jazz" },
      { name: "Lo-Fi Jazz", query: "lofi jazz" },
      { name: "Soul", query: "soul music" },
      { name: "Blues", query: "blues" },
      { name: "Bossa Nova", query: "bossa nova" },
      { name: "Funk", query: "funk" },
    ],
  },
  {
    category: "Chill & Lounge",
    genres: [
      { name: "Lo-Fi", query: "lofi chillhop" },
      { name: "Chill", query: "chill music" },
      { name: "Downtempo", query: "downtempo" },
      { name: "Synthwave", query: "synthwave retrowave" },
      { name: "Acoustic", query: "acoustic" },
      { name: "Piano", query: "piano music" },
    ],
  },
  {
    category: "Latin & World",
    genres: [
      { name: "Reggaeton", query: "reggaeton latin" },
      { name: "Afrobeats", query: "afrobeats" },
      { name: "Latin Pop", query: "latin pop" },
      { name: "Salsa", query: "salsa" },
      { name: "Bachata", query: "bachata" },
      { name: "Arabic", query: "arabic music" },
    ],
  },
  {
    category: "Classical & Orchestral",
    genres: [
      { name: "Classical", query: "classical piano" },
      { name: "Neo-Classical", query: "neo classical" },
      { name: "Orchestral", query: "orchestral cinematic" },
      { name: "Soundtrack", query: "movie soundtrack" },
    ],
  },
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
    addFavoriteArtist,
    removeFavoriteArtist,
    setOnboardingComplete,
    saveFavoriteArtistsToServer,
    setView,
  } = useAppStore();

  const [step, setStep] = useState<"genres" | "artists" | "discover">("genres");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [artistResults, setArtistResults] = useState<SCArtistData[]>([]);
  const [similarBranches, setSimilarBranches] = useState<SimilarBranch[]>([]);
  const [expandedArtist, setExpandedArtist] = useState<number | null>(null);
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

      const genresToFetch = genres.slice(0, 5);
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

      allArtists.sort((a, b) => b.followers - a.followers);
      setArtistResults(allArtists.slice(0, 30));
    } catch {
      setError("Не удалось загрузить артистов");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleGenresNext = () => {
    if (selectedGenres.length === 0) {
      setError("Выберите хотя бы один жанр");
      return;
    }
    setError("");
    setStep("artists");
    loadArtistsForGenres(selectedGenres);
  };

  const handleArtistsNext = () => {
    if (favoriteArtists.length < MIN_ARTISTS) {
      setError(`Выберите хотя бы ${MIN_ARTISTS} артистов`);
      return;
    }
    setError("");
    // Pre-load similar artists for all selected favorites
    loadAllSimilarBranches();
    setStep("discover");
  };

  // Load similar artists for all selected favorite artists
  const loadAllSimilarBranches = async () => {
    const favs = favoriteArtists.slice(0, 5); // max 5 branches
    const branches: SimilarBranch[] = favs.map(f => ({
      parentId: f.id,
      artists: [],
      loading: true,
    }));
    setSimilarBranches(branches);

    // Load similar for each in parallel
    await Promise.allSettled(
      favs.map(async (fav, idx) => {
        try {
          const res = await fetch(
            `/api/music/artists?similar=${encodeURIComponent(fav.username)}&limit=6`
          );
          const data = await res.json();
          const artists = (data.artists || []) as SCArtistData[];
          setSimilarBranches(prev =>
            prev.map((b, i) =>
              i === idx ? { ...b, artists, loading: false } : b
            )
          );
        } catch {
          setSimilarBranches(prev =>
            prev.map((b, i) =>
              i === idx ? { ...b, loading: false } : b
            )
          );
        }
      })
    );
  };

  // Load similar artists for a single artist (expand/collapse)
  const toggleSimilarForArtist = async (artistId: number, artistName: string) => {
    if (expandedArtist === artistId) {
      setExpandedArtist(null);
      return;
    }

    setExpandedArtist(artistId);

    // Check if we already have similar for this artist
    const existing = similarBranches.find(b => b.parentId === artistId);
    if (existing && existing.artists.length > 0) return;

    // Add loading state
    setSimilarBranches(prev => [
      ...prev.filter(b => b.parentId !== artistId),
      { parentId: artistId, artists: [], loading: true },
    ]);

    try {
      const res = await fetch(
        `/api/music/artists?similar=${encodeURIComponent(artistName)}&limit=6`
      );
      const data = await res.json();
      const artists = (data.artists || []) as SCArtistData[];
      setSimilarBranches(prev =>
        prev.map(b =>
          b.parentId === artistId ? { ...b, artists, loading: false } : b
        )
      );
    } catch {
      setSimilarBranches(prev =>
        prev.map(b =>
          b.parentId === artistId ? { ...b, loading: false } : b
        )
      );
    }
  };

  const handleLoadMore = async (genreQuery: string) => {
    setLoadingGenre(genreQuery);
    try {
      const res = await fetch(`/api/music/artists?q=${encodeURIComponent(genreQuery)}&limit=15`);
      const data = await res.json();
      const newArtists = (data.artists || []) as SCArtistData[];
      setArtistResults(prev => {
        const existingIds = new Set(prev.map(a => a.id));
        const unique = newArtists.filter(a => !existingIds.has(a.id));
        return [...prev, ...unique].slice(0, 40);
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
    setOnboardingComplete(true);
    await saveFavoriteArtistsToServer();
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

  // ── Artist card component (reused across steps) ──
  const ArtistCard = ({ artist, size = "md" }: { artist: SCArtistData; size?: "sm" | "md" }) => {
    const isSelected = selectedIds.has(artist.id);
    const isSmall = size === "sm";
    return (
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => toggleArtist(artist)}
        className="flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all relative"
        style={{
          backgroundColor: isSelected ? "rgba(224, 49, 49, 0.1)" : "transparent",
        }}
      >
        {isSelected && (
          <div
            className="absolute top-0 right-0 w-5 h-5 rounded-full flex items-center justify-center z-10"
            style={{ backgroundColor: "var(--mq-accent, #e03131)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}

        <div
          className={`${isSmall ? "w-12 h-12" : "w-16 h-16 sm:w-20 sm:h-20"} rounded-full overflow-hidden flex-shrink-0`}
          style={{
            border: isSelected
              ? "3px solid var(--mq-accent, #e03131)"
              : "3px solid var(--mq-border, #2a2a2a)",
          }}
        >
          {artist.avatar ? (
            <img src={artist.avatar} alt={artist.username} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div
              className={`w-full h-full flex items-center justify-center ${isSmall ? "text-sm" : "text-lg"} font-bold`}
              style={{ backgroundColor: "var(--mq-surface, #1a1a1a)", color: "var(--mq-text-secondary, #555)" }}
            >
              {artist.username[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <p
          className={`${isSmall ? "text-[10px]" : "text-xs"} font-medium text-center leading-tight w-full truncate px-1`}
          style={{ color: isSelected ? "var(--mq-text, #fff)" : "var(--mq-text-secondary, #999)" }}
        >
          {artist.username}
        </p>
        {artist.genre && (
          <p className={`${isSmall ? "text-[8px]" : "text-[10px]"} w-full truncate px-1`} style={{ color: "var(--mq-text-secondary, #666)" }}>
            {artist.genre}
          </p>
        )}
        {!isSmall && (
          <p className="text-[10px]" style={{ color: "#555" }}>
            {formatFollowers(artist.followers)}
          </p>
        )}
      </motion.button>
    );
  };

  // ── Step 1: Genre tree selection ──
  const renderGenresStep = () => (
    <div className="flex flex-col items-center gap-6 w-full max-w-3xl mx-auto px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--mq-text, #fff)" }}>
          Какую музыку вы слушаете?
        </h1>
        <p className="text-sm" style={{ color: "var(--mq-text-secondary, #888)" }}>
          Выберите жанры и поджанры
        </p>
      </div>

      <div className="w-full space-y-5">
        {GENRE_TREE.map(cat => (
          <div key={cat.category}>
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-2 px-1"
              style={{ color: "var(--mq-text-secondary, #666)" }}
            >
              {cat.category}
            </p>
            <div className="flex flex-wrap gap-2">
              {cat.genres.map(g => {
                const isSelected = selectedGenres.includes(g.name);
                return (
                  <motion.button
                    key={g.name}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => {
                      setSelectedGenres(prev =>
                        isSelected
                          ? prev.filter(n => n !== g.name)
                          : [...prev, g.name]
                      );
                      setError("");
                    }}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border"
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
                    {g.name}
                  </motion.button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm" style={{ color: "#ff6b6b" }}>{error}</p>}

      <div className="flex gap-3 mt-2">
        <button
          onClick={handleSkip}
          className="px-6 py-2.5 rounded-xl text-sm font-medium"
          style={{ color: "var(--mq-text-secondary, #888)" }}
        >
          Пропустить
        </button>
        <button
          onClick={handleGenresNext}
          className="px-8 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
          style={{ backgroundColor: "var(--mq-accent, #e03131)", opacity: selectedGenres.length > 0 ? 1 : 0.5 }}
        >
          Далее ({selectedGenres.length})
        </button>
      </div>
    </div>
  );

  // ── Step 2: Artist selection ──
  const renderArtistsStep = () => (
    <div className="flex flex-col items-center gap-5 w-full max-w-3xl mx-auto px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--mq-text, #fff)" }}>
          Выберите любимых артистов
        </h1>
        <p className="text-sm" style={{ color: "var(--mq-text-secondary, #888)" }}>
          Минимум {MIN_ARTISTS} — нажмите на артиста чтобы выбрать
        </p>
        <span
          className="inline-block text-xs px-3 py-1 rounded-full mt-2"
          style={{
            backgroundColor: "var(--mq-surface, #1a1a1a)",
            color: favoriteArtists.length >= MIN_ARTISTS ? "#4ade80" : "var(--mq-accent, #e03131)",
          }}
        >
          {favoriteArtists.length} / {MIN_ARTISTS} выбрано
        </span>
      </div>

      {/* Selected genres */}
      <div className="flex flex-wrap gap-1.5 justify-center">
        {selectedGenres.map(g => (
          <span key={g} className="text-xs px-3 py-1 rounded-full" style={{ backgroundColor: "var(--mq-surface, #1a1a1a)", color: "var(--mq-text-secondary, #888)" }}>
            {g}
          </span>
        ))}
        <button onClick={() => setStep("genres")} className="text-xs px-3 py-1 rounded-full" style={{ color: "var(--mq-accent, #e03131)" }}>
          Изменить
        </button>
      </div>

      {/* Load more */}
      <div className="flex flex-wrap gap-2 justify-center">
        {selectedGenres.slice(0, 5).map((g) => {
          const cat = GENRE_TREE.flatMap(c => c.genres).find(c => c.name === g);
          return cat ? (
            <button
              key={g}
              onClick={() => handleLoadMore(cat.query)}
              disabled={loadingGenre === cat.query}
              className="text-xs px-3 py-1.5 rounded-lg border"
              style={{
                borderColor: "var(--mq-border, #2a2a2a)",
                color: loadingGenre === cat.query ? "#555" : "var(--mq-text, #aaa)",
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
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: "var(--mq-accent, #e03131)", borderTopColor: "transparent" }} />
        </div>
      ) : artistResults.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4 w-full">
          {artistResults.map(a => <ArtistCard key={a.id} artist={a} />)}
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--mq-text-secondary, #888)" }}>Артисты не найдены. Попробуйте другие жанры.</p>
      )}

      {error && <p className="text-sm" style={{ color: "#ff6b6b" }}>{error}</p>}

      <div className="flex gap-3 mt-2">
        <button onClick={() => setStep("genres")} className="px-6 py-2.5 rounded-xl text-sm font-medium" style={{ color: "var(--mq-text-secondary, #888)" }}>
          Назад
        </button>
        <button
          onClick={handleArtistsNext}
          className="px-8 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
          style={{ backgroundColor: "var(--mq-accent, #e03131)", opacity: favoriteArtists.length >= MIN_ARTISTS ? 1 : 0.5 }}
        >
          Далее
        </button>
      </div>
    </div>
  );

  // ── Step 3: Discover — tree of similar artists from selected ──
  const renderDiscoverStep = () => (
    <div className="flex flex-col items-center gap-6 w-full max-w-4xl mx-auto px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--mq-text, #fff)" }}>
          Откройте похожих артистов
        </h1>
        <p className="text-sm" style={{ color: "var(--mq-text-secondary, #888)" }}>
          Нажмите на выбранного артиста чтобы увидеть похожих. Добавьте тех что нравятся.
        </p>
        <span
          className="inline-block text-xs px-3 py-1 rounded-full mt-2"
          style={{
            backgroundColor: "var(--mq-surface, #1a1a1a)",
            color: "var(--mq-text-secondary, #888)",
          }}
        >
          {favoriteArtists.length} артистов выбрано
        </span>
      </div>

      {/* Tree: selected artists as roots, similar artists as branches */}
      <div className="w-full space-y-6">
        {favoriteArtists.map(fav => {
          const branch = similarBranches.find(b => b.parentId === fav.id);
          const isExpanded = expandedArtist === fav.id;
          const branchArtists = branch?.artists || [];

          return (
            <div key={fav.id} className="w-full">
              {/* Root artist — clickable to expand */}
              <button
                onClick={() => toggleSimilarForArtist(fav.id, fav.username)}
                className="flex items-center gap-3 w-full p-3 rounded-xl transition-all"
                style={{
                  backgroundColor: isExpanded ? "rgba(224, 49, 49, 0.08)" : "var(--mq-card, #1a1a1a)",
                  border: `1px solid ${isExpanded ? "var(--mq-accent, #e03131)" : "var(--mq-border, #2a2a2a)"}`,
                }}
              >
                {/* Avatar */}
                <div
                  className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0"
                  style={{ border: "2px solid var(--mq-accent, #e03131)" }}
                >
                  {fav.avatar ? (
                    <img src={fav.avatar} alt={fav.username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold" style={{ backgroundColor: "var(--mq-surface, #1a1a1a)", color: "var(--mq-text-secondary, #555)" }}>
                      {fav.username[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text, #fff)" }}>
                    {fav.username}
                  </p>
                  {fav.genre && (
                    <p className="text-xs truncate" style={{ color: "var(--mq-text-secondary, #666)" }}>
                      {fav.genre}
                    </p>
                  )}
                </div>
                {/* Expand arrow */}
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="var(--mq-text-secondary, #888)" strokeWidth="2"
                  className={`flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {/* Branch: similar artists */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    {/* Connecting line */}
                    <div className="ml-6 pl-6 border-l-2 py-3" style={{ borderColor: "var(--mq-accent, #e03131)" }}>
                      {branch?.loading ? (
                        <div className="flex items-center justify-center py-4">
                          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "var(--mq-accent, #e03131)", borderTopColor: "transparent" }} />
                        </div>
                      ) : branchArtists.length > 0 ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                          {branchArtists.map(a => (
                            <ArtistCard key={a.id} artist={a} size="sm" />
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs py-2" style={{ color: "var(--mq-text-secondary, #555)" }}>
                          Похожие артисты не найдены
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3 mt-2">
        <button onClick={() => setStep("artists")} className="px-6 py-2.5 rounded-xl text-sm font-medium" style={{ color: "var(--mq-text-secondary, #888)" }}>
          Назад
        </button>
        <button
          onClick={handleFinish}
          className="px-8 py-2.5 rounded-xl text-sm font-bold text-white"
          style={{ backgroundColor: "var(--mq-accent, #e03131)" }}
        >
          Начать слушать
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen flex flex-col items-center py-10 px-4 overflow-y-auto"
      style={{ backgroundColor: "var(--mq-bg, #0e0e0e)" }}
    >
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-2 mb-6"
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: "var(--mq-accent, #e03131)", boxShadow: "0 0 30px rgba(224,49,49,0.3)" }}
        >
          <span className="text-2xl font-black text-white">mq</span>
        </div>
      </motion.div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-6">
        {["genres", "artists", "discover"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
              style={{
                backgroundColor: step === s ? "var(--mq-accent, #e03131)" : ["genres","artists","discover"].indexOf(step) > i ? "rgba(224,49,49,0.3)" : "var(--mq-surface, #1a1a1a)",
                color: step === s ? "#fff" : ["genres","artists","discover"].indexOf(step) > i ? "var(--mq-accent, #e03131)" : "var(--mq-text-secondary, #555)",
                border: step !== s ? "1px solid var(--mq-border, #2a2a2a)" : "1px solid transparent",
              }}
            >
              {["genres","artists","discover"].indexOf(step) > i ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>
              ) : (i + 1)}
            </div>
            {i < 2 && (
              <div className="w-8 h-0.5 rounded-full transition-all" style={{ backgroundColor: ["genres","artists","discover"].indexOf(step) > i ? "var(--mq-accent, #e03131)" : "var(--mq-border, #2a2a2a)" }} />
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

      {step !== "discover" && (
        <button onClick={handleSkip} className="mt-6 text-xs" style={{ color: "var(--mq-text-secondary, #555)" }}>
          Пропустить настройку
        </button>
      )}
    </div>
  );
}
