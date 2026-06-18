"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";

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

// ── P5.4: CSS-based animated equalizer bars (was canvas + RAF) ──
// 7 bars with CSS @keyframes — 0 JS, 0 RAF, GPU-accelerated.
function AnimatedEqualizer() {
  return (
    <div style={{ display: "flex", gap: "4px", justifyContent: "center", alignItems: "flex-end", height: "32px", margin: "0 auto 8px" }}>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <span
          key={i}
          style={{
            display: "block",
            width: "3px",
            height: "100%",
            borderRadius: "2px",
            backgroundColor: "var(--mq-accent)",
            transformOrigin: "bottom",
            animation: `mq-onboard-eq ${0.4 + i * 0.08}s ease-in-out ${i * 0.05}s infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}

export default function OnboardingView() {
  const favoriteArtists = useAppStore((s) => s.favoriteArtists);
  const addFavoriteArtist = useAppStore((s) => s.addFavoriteArtist);
  const removeFavoriteArtist = useAppStore((s) => s.removeFavoriteArtist);
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete);
  const saveFavoriteArtistsToServer = useAppStore((s) => s.saveFavoriteArtistsToServer);
  const setView = useAppStore((s) => s.setView);

  const [step, setStep] = useState<"genres" | "artists" | "discover">("genres");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [artistResults, setArtistResults] = useState<SCArtistData[]>([]);
  const [similarBranches, setSimilarBranches] = useState<SimilarBranch[]>([]);
  const [expandedArtist, setExpandedArtist] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingGenre, setLoadingGenre] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loadCounts, setLoadCounts] = useState<Record<string, number>>({});

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
    loadAllSimilarBranches();
    setStep("discover");
  };

  const loadAllSimilarBranches = async () => {
    const favs = favoriteArtists.slice(0, 5);
    const branches: SimilarBranch[] = favs.map(f => ({
      parentId: f.id,
      artists: [],
      loading: true,
    }));
    setSimilarBranches(branches);

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

  const toggleSimilarForArtist = async (artistId: number, artistName: string) => {
    if (expandedArtist === artistId) {
      setExpandedArtist(null);
      return;
    }
    setExpandedArtist(artistId);
    const existing = similarBranches.find(b => b.parentId === artistId);
    if (existing && existing.artists.length > 0) return;

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
      const count = (loadCounts[genreQuery] || 0) + 1;
      setLoadCounts(prev => ({ ...prev, [genreQuery]: count }));
      const limit = 15 + count * 20;
      const res = await fetch(`/api/music/artists?q=${encodeURIComponent(genreQuery)}&limit=${limit}`);
      const data = await res.json();
      const newArtists = (data.artists || []) as SCArtistData[];
      setArtistResults(prev => {
        const existingIds = new Set(prev.map(a => a.id));
        const unique = newArtists.filter(a => !existingIds.has(a.id));
        return [...prev, ...unique].slice(0, 60);
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

  // ── Artist card component ──
  const ArtistCard = ({ artist, size = "md" }: { artist: SCArtistData; size?: "sm" | "md" }) => {
    const isSelected = selectedIds.has(artist.id);
    const isSmall = size === "sm";

    return (
      <button
        onClick={() => toggleArtist(artist)}
        className="flex flex-col items-center gap-1.5 p-2 relative"
        style={{
          willChange: "transform, border-color",
          transform: "translateZ(0)",
          transition: "transform 0.15s ease, border-color 0.15s ease",
        }}
      >
        {isSelected && (
          <div
            className="absolute -top-0.5 -right-0.5 w-5 h-5 flex items-center justify-center z-10"
            style={{
              backgroundColor: "var(--mq-accent, #e03131)",
              borderRadius: "2px",
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}

        <div
          className={`${isSmall ? "w-12 h-12" : "w-16 h-16 sm:w-20 sm:h-20"} overflow-hidden flex-shrink-0`}
          style={{
            borderRadius: "6px",
            border: isSelected
              ? "2px solid var(--mq-accent, #e03131)"
              : "1px solid var(--mq-border, #2a2a2a)",
          }}
        >
          {artist.avatar ? (
            <img src={artist.avatar} alt={artist.username} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div
              className={`w-full h-full flex items-center justify-center ${isSmall ? "text-sm" : "text-lg"} font-bold`}
              style={{ backgroundColor: "var(--mq-card, #161616)", color: "var(--mq-text-muted, #555)" }}
            >
              {artist.username[0]?.toUpperCase()}
            </div>
          )}
        </div>
        <p
          className={`${isSmall ? "text-[11px]" : "text-xs"} font-medium text-center leading-tight w-full truncate px-1`}
          style={{ color: isSelected ? "var(--mq-text, #fff)" : "var(--mq-text-muted, #888)" }}
        >
          {artist.username}
        </p>
        {!isSmall && artist.genre && (
          <span
            className="text-[11px] px-1.5 py-0.5 truncate max-w-full"
            style={{
              borderRadius: "3px",
              backgroundColor: "rgba(255,255,255,0.04)",
              color: isSelected ? "var(--mq-accent, #e03131)" : "var(--mq-text-muted, #555)",
            }}
          >
            {artist.genre}
          </span>
        )}
        {!isSmall && (
          <p className="text-[11px]" style={{ color: "var(--mq-text-muted, #444)" }}>
            {formatFollowers(artist.followers)}
          </p>
        )}
      </button>
    );
  };

  // ── Step 1: Dark strict genre selection ──
  const renderGenresStep = () => (
    <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto px-4 pb-4">
      {/* Header */}
      <div className="text-center">
        <AnimatedEqualizer />
        <h1
          className="text-2xl sm:text-3xl font-bold mb-2 tracking-tight"
          style={{ color: "var(--mq-text, #fff)" }}
        >
          Какую музыку слушаете?
        </h1>
        <p className="text-sm max-w-sm mx-auto" style={{ color: "var(--mq-text-muted, #666)" }}>
          Выберите жанры, которые вам нравятся
        </p>
      </div>

      {/* Genre categories with pills */}
      <div className="w-full space-y-5">
        {GENRE_TREE.map((cat) => {
          const catSelected = cat.genres.filter(g => selectedGenres.includes(g.name)).length;
          return (
            <div key={cat.category}>
              {/* Category header */}
              <div className="flex items-center gap-3 mb-2.5">
                <span
                  className="text-xs font-semibold uppercase tracking-widest"
                  style={{ color: catSelected > 0 ? "var(--mq-accent, #e03131)" : "var(--mq-text-muted, #555)" }}
                >
                  {cat.category}
                </span>
                <div
                  className="flex-1 h-px"
                  style={{ backgroundColor: "var(--mq-border, #1f1f1f)" }}
                />
                {catSelected > 0 && (
                  <span
                    className="text-[11px] font-bold px-1.5 py-0.5"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--mq-accent, #e03131) 15%, transparent)",
                      color: "var(--mq-accent, #e03131)",
                      borderRadius: "3px",
                    }}
                  >
                    {catSelected}
                  </span>
                )}
              </div>

              {/* Genre pills */}
              <div className="flex flex-wrap gap-2">
                {cat.genres.map((g) => {
                  const isSelected = selectedGenres.includes(g.name);
                  return (
                    <button
                      key={g.name}
                      onClick={() => {
                        setSelectedGenres(prev =>
                          isSelected
                            ? prev.filter(n => n !== g.name)
                            : [...prev, g.name]
                        );
                        setError("");
                      }}
                      className="px-3.5 py-1.5 text-sm font-medium cursor-pointer"
                      style={{
                        borderRadius: "4px",
                        willChange: "transform, background-color, border-color, color",
                        transform: "translateZ(0)",
                        transition: "background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease",
                        backgroundColor: isSelected
                          ? "color-mix(in srgb, var(--mq-accent, #e03131) 12%, transparent)"
                          : "transparent",
                        border: isSelected
                          ? "1px solid color-mix(in srgb, var(--mq-accent, #e03131) 40%, transparent)"
                          : "1px solid var(--mq-border, #2a2a2a)",
                        color: isSelected
                          ? "var(--mq-accent, #e03131)"
                          : "var(--mq-text-muted, #999)",
                      }}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm font-medium" style={{ color: "#ff6b6b" }}>{error}</p>}
    </div>
  );

  // ── Step 2: Artist selection ──
  const renderArtistsStep = () => (
    <div className="flex flex-col items-center gap-5 w-full max-w-3xl mx-auto px-4 pb-4">
      <div className="text-center">
        <h1
          className="text-xl sm:text-2xl font-bold mb-1.5"
          style={{ color: "var(--mq-text, #fff)" }}
        >
          Выберите любимых артистов
        </h1>
        <p className="text-sm" style={{ color: "var(--mq-text-muted, #666)" }}>
          Минимум {MIN_ARTISTS} — нажмите чтобы выбрать
        </p>
        <span
          className="inline-block text-xs px-2.5 py-1 mt-3 font-semibold"
          style={{
            borderRadius: "3px",
            backgroundColor: favoriteArtists.length >= MIN_ARTISTS
              ? "rgba(74,222,128,0.08)"
              : "rgba(255,255,255,0.04)",
            color: favoriteArtists.length >= MIN_ARTISTS ? "#4ade80" : "var(--mq-text-muted, #666)",
            border: `1px solid ${favoriteArtists.length >= MIN_ARTISTS ? "rgba(74,222,128,0.15)" : "var(--mq-border, #2a2a2a)"}`,
          }}
        >
          {favoriteArtists.length} / {MIN_ARTISTS}
        </span>
      </div>

      {/* Selected genres pills */}
      <div className="flex flex-wrap gap-1.5 justify-center">
        {selectedGenres.map(g => (
          <span
            key={g}
            className="text-xs px-2.5 py-1 font-medium"
            style={{
              borderRadius: "3px",
              backgroundColor: "rgba(255,255,255,0.04)",
              color: "var(--mq-text-muted, #888)",
              border: "1px solid var(--mq-border, #2a2a2a)",
            }}
          >
            {g}
          </span>
        ))}
        <button
          onClick={() => setStep("genres")}
          className="text-xs px-2.5 py-1 font-medium"
          style={{
            borderRadius: "3px",
            color: "var(--mq-accent, #e03131)",
            border: "1px solid color-mix(in srgb, var(--mq-accent, #e03131) 25%, transparent)",
          }}
        >
          Изменить
        </button>
      </div>

      {/* Load more buttons */}
      <div className="flex flex-wrap gap-2 justify-center">
        {selectedGenres.slice(0, 5).map((g) => {
          const cat = GENRE_TREE.flatMap(c => c.genres).find(c => c.name === g);
          return cat ? (
            <button
              key={g}
              onClick={() => handleLoadMore(cat.query)}
              disabled={loadingGenre === cat.query}
              className="text-xs px-2.5 py-1 border cursor-pointer font-medium"
              style={{
                borderRadius: "3px",
                borderColor: loadingGenre === cat.query ? "var(--mq-accent, #e03131)" : "var(--mq-border, #2a2a2a)",
                color: loadingGenre === cat.query ? "var(--mq-accent, #e03131)" : "var(--mq-text-muted, #999)",
                backgroundColor: "transparent",
                transition: "border-color 0.12s ease, color 0.12s ease",
              }}
            >
              {loadingGenre === cat.query ? "..." : `+ ${g}`}
            </button>
          ) : null;
        })}
      </div>

      {/* Artist grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div
            className="w-6 h-6 border-2"
            style={{
              borderColor: "var(--mq-border, #2a2a2a)",
              borderTopColor: "var(--mq-accent, #e03131)",
              borderRadius: "2px",
              animation: "mqSpin 0.7s linear infinite",
            }}
          />
        </div>
      ) : artistResults.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 w-full">
          {artistResults.map((a) => <ArtistCard key={a.id} artist={a} />)}
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--mq-text-muted, #666)" }}>Артисты не найдены</p>
      )}

      {error && <p className="text-sm font-medium" style={{ color: "#ff6b6b" }}>{error}</p>}
    </div>
  );

  // ── Step 3: Discover ──
  const renderDiscoverStep = () => (
    <div className="flex flex-col items-center gap-5 w-full max-w-3xl mx-auto px-4 pb-4">
      <div className="text-center">
        <h1
          className="text-xl sm:text-2xl font-bold mb-1.5"
          style={{ color: "var(--mq-text, #fff)" }}
        >
          Похожие артисты
        </h1>
        <p className="text-sm" style={{ color: "var(--mq-text-muted, #666)" }}>
          Нажмите на артиста чтобы увидеть похожих
        </p>
      </div>

      <div className="w-full space-y-3">
        {favoriteArtists.map((fav) => {
          const branch = similarBranches.find(b => b.parentId === fav.id);
          const isExpanded = expandedArtist === fav.id;
          const branchArtists = branch?.artists || [];

          return (
            <div key={fav.id} className="w-full">
              <button
                onClick={() => toggleSimilarForArtist(fav.id, fav.username)}
                className="flex items-center gap-3 w-full p-3 cursor-pointer"
                style={{
                  backgroundColor: isExpanded ? "rgba(255,255,255,0.03)" : "transparent",
                  border: `1px solid ${isExpanded ? "var(--mq-border, #333)" : "var(--mq-border, #1f1f1f)"}`,
                  borderRadius: "4px",
                  transition: "background-color 0.12s ease, border-color 0.12s ease",
                }}
              >
                <div
                  className="w-10 h-10 overflow-hidden flex-shrink-0"
                  style={{ borderRadius: "4px", border: "1px solid var(--mq-border, #2a2a2a)" }}
                >
                  {fav.avatar ? (
                    <img src={fav.avatar} alt={fav.username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold text-sm"
                      style={{ backgroundColor: "var(--mq-card, #161616)", color: "var(--mq-text-muted, #555)" }}>
                      {fav.username[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text, #eee)" }}>
                    {fav.username}
                  </p>
                  {fav.genre && (
                    <p className="text-xs truncate" style={{ color: "var(--mq-text-muted, #555)" }}>
                      {fav.genre}
                    </p>
                  )}
                </div>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="var(--mq-text-muted, #555)" strokeWidth="2"
                  className="flex-shrink-0"
                  style={{
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.15s ease",
                    willChange: "transform",
                  }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <div
                    className="overflow-hidden"
                    style={{
                      maxHeight: isExpanded ? "500px" : "0",
                      opacity: isExpanded ? 1 : 0,
                      transition: "max-height 0.25s ease, opacity 0.2s ease",
                      willChange: "max-height, opacity",
                    }}
                  >
                    <div className="ml-4 pl-4 py-2" style={{ borderLeft: "1px solid var(--mq-border, #2a2a2a)" }}>
                      {branch?.loading ? (
                        <div className="flex items-center justify-center py-3">
                          <div
                            className="w-5 h-5 border-2"
                            style={{
                              borderColor: "var(--mq-border, #2a2a2a)",
                              borderTopColor: "var(--mq-accent, #e03131)",
                              borderRadius: "2px",
                              animation: "mqSpin 0.7s linear infinite",
                            }}
                          />
                        </div>
                      ) : branchArtists.length > 0 ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                          {branchArtists.map((a) => (
                            <ArtistCard key={a.id} artist={a} size="sm" />
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs py-2" style={{ color: "var(--mq-text-muted, #444)" }}>
                          Не найдены
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Step progress ──
  const steps = ["genres", "artists", "discover"] as const;
  const currentStepIdx = steps.indexOf(step);

  return (
    <div
      className="min-h-screen flex flex-col items-center py-8 px-4 overflow-y-auto relative"
      style={{ backgroundColor: "var(--mq-bg, #0a0a0a)" }}
    >
      <style>{`
        @keyframes mqSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="relative z-10 flex flex-col items-center w-full">
        {/* Logo — minimal dark */}
        <div className="mb-6">
          <div
            className="w-12 h-12 flex items-center justify-center"
            style={{
              backgroundColor: "var(--mq-accent, #e03131)",
              borderRadius: "6px",
            }}
          >
            <span className="text-lg font-black text-white tracking-tight">mq</span>
          </div>
        </div>

        {/* Step progress — minimal line */}
        <div className="flex items-center gap-0 mb-6 w-full max-w-xs">
          {steps.map((s, i) => {
            const isActive = step === s;
            const isCompleted = currentStepIdx > i;
            return (
              <div key={s} className="flex-1 flex items-center">
                <div
                  className="flex-1 h-[2px]"
                  style={{
                    backgroundColor: isCompleted || isActive
                      ? "var(--mq-accent, #e03131)"
                      : "var(--mq-border, #1f1f1f)",
                    transition: "background-color 0.2s ease",
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Step label */}
        <div className="flex items-center gap-2 mb-6">
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{
              color: "var(--mq-accent, #e03131)",
            }}
          >
            {step === "genres" ? "Шаг 1" : step === "artists" ? "Шаг 2" : "Шаг 3"}
          </span>
          <span className="text-xs" style={{ color: "var(--mq-text-muted, #444)" }}>
            из 3
          </span>
        </div>

        {/* Step content */}
        {step === "genres" && renderGenresStep()}
        {step === "artists" && renderArtistsStep()}
        {step === "discover" && renderDiscoverStep()}

        {/* Bottom action bar — clean minimal */}
        <div
          className="sticky bottom-0 left-0 right-0 w-full max-w-2xl mx-auto mt-4 pt-4 pb-4 flex items-center justify-between z-20"
          style={{
            background: "linear-gradient(to top, var(--mq-bg, #0a0a0a) 60%, transparent 100%)",
          }}
        >
          {step === "genres" && (
            <>
              <button
                onClick={handleSkip}
                className="px-4 py-2 text-sm font-medium"
                style={{
                  color: "var(--mq-text-muted, #555)",
                  transition: "color 0.12s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--mq-text-muted, #999)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--mq-text-muted, #555)"; }}
              >
                Пропустить
              </button>
              <div className="flex items-center gap-3">
                {selectedGenres.length > 0 && (
                  <span
                    className="text-xs font-bold px-2 py-1"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--mq-accent, #e03131) 10%, transparent)",
                      color: "var(--mq-accent, #e03131)",
                      borderRadius: "3px",
                    }}
                  >
                    {selectedGenres.length}
                  </span>
                )}
                <button
                  onClick={handleGenresNext}
                  className="px-6 py-2 text-sm font-bold text-white"
                  style={{
                    backgroundColor: selectedGenres.length > 0
                      ? "var(--mq-accent, #e03131)"
                      : "var(--mq-border, #2a2a2a)",
                    borderRadius: "4px",
                    opacity: selectedGenres.length > 0 ? 1 : 0.5,
                    transition: "background-color 0.12s ease, opacity 0.12s ease",
                    willChange: "transform",
                    transform: "translateZ(0)",
                  }}
                >
                  Далее
                </button>
              </div>
            </>
          )}

          {step === "artists" && (
            <>
              <button
                onClick={() => setStep("genres")}
                className="px-4 py-2 text-sm font-medium"
                style={{
                  color: "var(--mq-text-muted, #555)",
                  transition: "color 0.12s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--mq-text-muted, #999)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--mq-text-muted, #555)"; }}
              >
                Назад
              </button>
              <button
                onClick={handleArtistsNext}
                className="px-6 py-2 text-sm font-bold text-white"
                style={{
                  backgroundColor: favoriteArtists.length >= MIN_ARTISTS
                    ? "var(--mq-accent, #e03131)"
                    : "var(--mq-border, #2a2a2a)",
                  borderRadius: "4px",
                  opacity: favoriteArtists.length >= MIN_ARTISTS ? 1 : 0.5,
                  transition: "background-color 0.12s ease, opacity 0.12s ease",
                  willChange: "transform",
                  transform: "translateZ(0)",
                }}
              >
                Далее
              </button>
            </>
          )}

          {step === "discover" && (
            <>
              <button
                onClick={() => setStep("artists")}
                className="px-4 py-2 text-sm font-medium"
                style={{
                  color: "var(--mq-text-muted, #555)",
                  transition: "color 0.12s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--mq-text-muted, #999)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--mq-text-muted, #555)"; }}
              >
                Назад
              </button>
              <button
                onClick={handleFinish}
                className="px-6 py-2 text-sm font-bold text-white"
                style={{
                  backgroundColor: "var(--mq-accent, #e03131)",
                  borderRadius: "4px",
                  transition: "background-color 0.12s ease",
                  willChange: "transform",
                  transform: "translateZ(0)",
                }}
              >
                Готово
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
