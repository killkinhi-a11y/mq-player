"use client";

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import { genresList, type Track, formatDuration } from "@/lib/musicApi";
import TrackCard from "./TrackCard";
import ScrollReveal from "./ScrollReveal";
import ContextMenu from "./ContextMenu";
import { NowPlayingEqualizer } from "./NowPlayingEqualizer";
import { useLongPress } from "@/hooks/useLongPress";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, X, SlidersHorizontal, Play, Upload, Clock, Trash2, CheckCircle2,
  AlertCircle, Loader2, Headphones, TrendingUp, ChevronRight, Music, Sparkles,
  RefreshCw, Flame, Zap, Mic, Disc, Heart, Piano, Radio, RotateCcw, ListMusic,
  Hash, ArrowRight, MoreHorizontal
} from "lucide-react";

const SEARCH_HISTORY_KEY = "mq-search-history";
const MAX_HISTORY = 15;

// ── Trending search terms ──
const TRENDING_SEARCHES = [
  "Поп", "Рок", "Хип-хоп", "Электроника", "Инди", "R&B", "Джаз",
];

// ── Genre to Russian label mapping ──
const genreLabels: Record<string, string> = {
  "Pop": "Поп",
  "Rock": "Рок",
  "Electronic": "Электроника",
  "Hip-Hop": "Хип-хоп",
  "Jazz": "Джаз",
  "Classical": "Классика",
  "R&B": "R&B",
  "Indie": "Инди",
};

// ── Genre icons mapping ──
const genreIcons: Record<string, React.ReactNode> = {
  "Pop": <Music className="w-3.5 h-3.5" />,
  "Rock": <Flame className="w-3.5 h-3.5" />,
  "Electronic": <Zap className="w-3.5 h-3.5" />,
  "Hip-Hop": <Mic className="w-3.5 h-3.5" />,
  "Jazz": <Disc className="w-3.5 h-3.5" />,
  "Classical": <Piano className="w-3.5 h-3.5" />,
  "R&B": <Heart className="w-3.5 h-3.5" />,
  "Indie": <Radio className="w-3.5 h-3.5" />,
};

// ── Genre accent text colors (muted via accent var) ──
const genreAccentColors: Record<string, string> = {
  "Pop": "var(--mq-accent)",
  "Rock": "var(--mq-accent)",
  "Electronic": "var(--mq-accent)",
  "Hip-Hop": "var(--mq-accent)",
  "Jazz": "var(--mq-accent)",
  "Classical": "var(--mq-accent)",
  "R&B": "var(--mq-accent)",
  "Indie": "var(--mq-accent)",
};

// ── Global blob URL registry for local tracks ──
const localBlobUrls = new Map<string, string>();

export function registerLocalBlobUrl(trackId: string, blobUrl: string) {
  localBlobUrls.set(trackId, blobUrl);
}

export function getLocalBlobUrl(trackId: string): string | null {
  return localBlobUrls.get(trackId) || null;
}

function getSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSearchHistory(items: string[]) {
  try { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY))); } catch {}
}


export default function SearchView() {
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const selectedGenre = useAppStore((s) => s.selectedGenre);
  const setSelectedGenre = useAppStore((s) => s.setSelectedGenre);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const playTrack = useAppStore((s) => s.playTrack);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const currentView = useAppStore((s) => s.currentView);
  const compactMode = useAppStore((s) => s.compactMode);
  const setSelectedArtist = useAppStore((s) => s.setSelectedArtist);
  const setView = useAppStore((s) => s.setView);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const likedTracksData = useAppStore((s) => s.likedTracksData);
  const [showFilters, setShowFilters] = useState(false);
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number; total: number; fileName: string;
    status: "uploading" | "done" | "error";
    successCount: number; failCount: number; fileProgress: number;
  } | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sortBy, setSortBy] = useState<"relevance" | "duration" | "title">("relevance");
  const [filterDuration, setFilterDuration] = useState<"all" | "short" | "medium" | "long">("all");
  const [quickPicksSeed, setQuickPicksSeed] = useState(0);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const genreScrollRef = useRef<HTMLDivElement>(null);
  const historyScrollRef = useRef<HTMLDivElement>(null);

  // Genre filter search
  const [genreTracks, setGenreTracks] = useState<Track[]>([]);
  const [isGenreLoading, setIsGenreLoading] = useState(false);

  // Stable hash for deterministic Quick Picks ordering
  const hashId = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  };

  // Quick Picks — 4 liked tracks in stable order (reshuffle only on explicit refresh)
  const quickPicks = useMemo(() => {
    if (!likedTracksData || likedTracksData.length === 0) return [];
    const seed = quickPicksSeed;
    const sorted = [...likedTracksData].sort((a, b) => {
      return hashId(a.id + seed) - hashId(b.id + seed);
    });
    return sorted.slice(0, 4);
  }, [likedTrackIds, quickPicksSeed, likedTracksData]);

  // Load search history on mount
  useEffect(() => {
    setSearchHistory(getSearchHistory());
  }, []);

  // Cleanup suggestions hide timer on unmount
  useEffect(() => {
    return () => {
      if (suggestionsHideTimer.current) clearTimeout(suggestionsHideTimer.current);
    };
  }, []);

  // Auto-focus search input when navigating to search view (desktop only — mobile keyboard is intrusive)
  useEffect(() => {
    if (currentView === "search" && window.innerWidth >= 768) {
      const timer = setTimeout(() => {
        if (searchInputRef.current) searchInputRef.current.focus({ preventScroll: true });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [currentView]);

  // Clear local search state when leaving search view
  // (SearchQuery is cleared by AppShell, we only clear local results here)
  useEffect(() => {
    if (currentView !== "search") {
      // P2-#300: defer to avoid React error #300 when leaving search view
      setTimeout(() => {
        setSearchResults([]);
        setHasSearched(false);
      }, 0);
    }
  }, [currentView]);


  // Debounced search
  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    if (!searchQuery.trim() || selectedGenre) {
      // P2-#300: defer to avoid React error #300
      setTimeout(() => {
        setIsDebouncing(false);
        if (!selectedGenre) {
          setSearchResults([]);
          setHasSearched(false);
        }
      }, 0);
      return;
    }

    // P2-#300: defer to avoid React error #300
    setTimeout(() => setIsDebouncing(true), 0);
    const timer = setTimeout(async () => {
      setIsDebouncing(false);
      const controller = new AbortController();
      abortRef.current = controller;
      setIsLoading(true);
      setHasSearched(true);
      // Results for THIS query are about to render — the suggestions
      // dropdown (query echo + Enter hint) is redundant noise above them.
      // Typing again re-opens it (onChange resets hasSearched).
      setShowSuggestions(false);

      try {
        const params = new URLSearchParams({ q: searchQuery.trim() });
        const res = await fetch(`/api/music/search?${params}`, { signal: controller.signal });
        if (!controller.signal.aborted) {
          const data = await res.json();
          setSearchResults(data.tracks || []);
          const query = searchQuery.trim();
          if (query) {
            const updated = [query, ...getSearchHistory().filter(h => h.toLowerCase() !== query.toLowerCase())].slice(0, MAX_HISTORY);
            saveSearchHistory(updated);
            setSearchHistory(updated);
          }
        }
      } catch {
        if (!controller.signal.aborted) {
          setSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 300);

    return () => { clearTimeout(timer); if (abortRef.current) abortRef.current.abort(); };
  }, [searchQuery, selectedGenre]);

  // Genre filter
  useEffect(() => {
    if (!selectedGenre) { setGenreTracks([]); return; }
    const controller = new AbortController();
    const loadGenre = async () => {
      setIsGenreLoading(true);
      try {
        const res = await fetch(`/api/music/genre?genre=${encodeURIComponent(selectedGenre)}`, { signal: controller.signal });
        if (!controller.signal.aborted) { const data = await res.json(); setGenreTracks(data.tracks || []); }
      } catch { if (!controller.signal.aborted) setGenreTracks([]); }
      finally { if (!controller.signal.aborted) setIsGenreLoading(false); }
    };
    loadGenre();
    return () => controller.abort();
  }, [selectedGenre]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setHasSearched(false);
  }, [setSearchQuery]);

  const handleHistoryClick = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchInputRef.current) searchInputRef.current.focus();
  }, [setSearchQuery]);

  const handleTrendingClick = useCallback((term: string) => {
    setSearchQuery(term);
    if (searchInputRef.current) searchInputRef.current.focus();
  }, [setSearchQuery]);

  const handleClearHistory = useCallback(() => {
    saveSearchHistory([]);
    setSearchHistory([]);
  }, []);

  const handleRemoveHistoryItem = useCallback((query: string) => {
    const updated = getSearchHistory().filter(h => h.toLowerCase() !== query.toLowerCase());
    saveSearchHistory(updated);
    setSearchHistory(updated);
  }, []);

  const handlePlayAll = useCallback(() => {
    const tracksToPlay = searchResults.length > 0 ? searchResults : genreTracks;
    if (tracksToPlay.length > 0) playTrack(tracksToPlay[0], tracksToPlay);
  }, [searchResults, genreTracks, playTrack]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);
    let successCount = 0;
    let failCount = 0;
    const total = files.length;
    const fileArray = Array.from(files);
    let idx = 0;
    const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|flac|aac|m4a|webm|opus|wma|aiff|alac)$/i;
    const MAX_SIZE = 200 * 1024 * 1024;

    const processNext = () => {
      if (idx >= fileArray.length) {
        const finalStatus = failCount === 0 ? "done" : (successCount > 0 ? "done" : "error");
        setUploadProgress({ current: total, total, fileName: fileArray[fileArray.length - 1].name, status: finalStatus, successCount, failCount, fileProgress: 100 });
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setTimeout(() => setUploadProgress(null), 4000);
        return;
      }
      const file = fileArray[idx];
      setUploadProgress({ current: idx + 1, total, fileName: file.name, status: "uploading", successCount, failCount, fileProgress: 0 });
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress = Math.min(progress + Math.random() * 30 + 10, 90);
        setUploadProgress(prev => prev ? { ...prev, fileProgress: Math.round(progress) } : null);
      }, 100);

      setTimeout(() => {
        clearInterval(progressInterval);
        if (!AUDIO_EXTENSIONS.test(file.name) || file.size > MAX_SIZE || file.size === 0) { failCount++; idx++; processNext(); return; }
        try {
          const uniqueId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const title = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
          const blobUrl = URL.createObjectURL(file);
          registerLocalBlobUrl(uniqueId, blobUrl);
          const track: Track = { id: uniqueId, title, artist: "Локальный файл", album: "", cover: "", genre: "", duration: 0, audioUrl: blobUrl, source: "local", scIsFull: true };
          const tempAudio = new Audio();
          tempAudio.addEventListener("loadedmetadata", () => { if (isFinite(tempAudio.duration)) track.duration = Math.round(tempAudio.duration); setSearchResults(prev => prev.map(t => t.id === track.id ? { ...t, duration: track.duration } : t)); });
          tempAudio.src = blobUrl;
          setSearchResults(prev => [track, ...prev]);
          setHasSearched(true);
          try { toggleLike(track.id, track); } catch {}
          setUploadProgress(prev => prev ? { ...prev, fileProgress: 100 } : null);
          successCount++;
        } catch { failCount++; }
        idx++; processNext();
      }, 200);
    };
    processNext();
  }, [toggleLike]);

  const activeTracks = selectedGenre ? genreTracks : searchResults;
  const activeLoading = selectedGenre ? isGenreLoading : isLoading;
  const activeHasSearched = selectedGenre || hasSearched;

  // ── Filter + sort tracks (functional, not cosmetic) ──
  // filterDuration: short (<2min), medium (2-5min), long (>5min)
  // sortBy: relevance (API order), duration (asc), title (alphabetical)
  const processedTracks = useMemo(() => {
    let result = [...activeTracks];
    // Duration filter
    if (filterDuration !== "all") {
      result = result.filter(t => {
        const d = t.duration || 0;
        if (filterDuration === "short") return d > 0 && d < 120;
        if (filterDuration === "medium") return d >= 120 && d <= 300;
        if (filterDuration === "long") return d > 300;
        return true;
      });
    }
    // Sort
    if (sortBy === "duration") {
      result.sort((a, b) => (a.duration || 0) - (b.duration || 0));
    } else if (sortBy === "title") {
      result.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }
    // relevance = API order, no sort
    return result;
  }, [activeTracks, filterDuration, sortBy]);

  // ── Main Search View ──
  return (
    <div className={`${compactMode ? "p-3 sm:p-4 lg:p-5 pb-[var(--mq-player-clearance)] sm:pb-32 lg:pb-32 space-y-4" : "p-4 sm:p-5 lg:p-6 pb-[var(--mq-player-clearance)] sm:pb-36 lg:pb-36 space-y-5"} max-w-[var(--mq-container-base)] lg:max-w-[var(--mq-container-wide)] mx-auto relative mq-anim-fade-in`} style={{ scrollBehavior: "smooth" }}>
      {/* Upload progress toast */}
      {uploadProgress && (
        <motion.div initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[90vw] max-w-md">
          <div className="rounded-[var(--mq-r-card)] p-4" style={{ backgroundColor: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)", boxShadow: "var(--mq-elev-dialog)", color: "var(--mq-text)" }}>
            <div className="flex items-center gap-3 mb-2">
              {uploadProgress.status === "uploading" && <Loader2 className="w-5 h-5 flex-shrink-0 animate-spin" style={{ color: "var(--mq-accent)" }} />}
              {uploadProgress.status === "done" && <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: "#4ade80" }} />}
              {uploadProgress.status === "error" && uploadProgress.failCount > 0 && <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: "#fb923c" }} />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{uploadProgress.status === "uploading" ? `Загрузка ${uploadProgress.current}/${uploadProgress.total}...` : `${uploadProgress.successCount} загружено`}</p>
                <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{uploadProgress.fileName}</p>
              </div>
            </div>
            {uploadProgress.status === "uploading" && (
              <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 6%, transparent)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: "100%", transform: `scaleX(${(uploadProgress.fileProgress || 0) / 100})`, transformOrigin: "left", willChange: "transform", backgroundColor: "var(--mq-accent)" }} />
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Page header — editorial voice: display serif + meta hint ── */}
      <div className="flex items-baseline justify-between mb-1">
        <h1 className="mq-t-display text-[26px] sm:text-[30px]" style={{ color: "var(--mq-text)" }}>Поиск</h1>
        <p className="mq-t-meta text-xs hidden sm:block">Треки · артисты · жанры · свои файлы</p>
      </div>

      {/* ── Quick Picks — 4 random liked tracks ── */}
      {!searchQuery.trim() && !selectedGenre && quickPicks.length > 0 && (
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 8 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div className="flex items-center gap-2.5 mb-3">
            <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
            <h2 className="mq-t-title text-[15px]" style={{ color: "var(--mq-text)" }}>Быстрый доступ</h2>
            <button
              onClick={() => setQuickPicksSeed(s => s + 1)}
              className="ml-auto p-2.5 rounded-lg transition-colors hover:bg-[var(--mq-overlay-hover)] flex-shrink-0"
              style={{ color: "var(--mq-text-muted)" }}
              title="Обновить"
              aria-label="Обновить"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {quickPicks.map((track, i) => (
              <motion.button
                key={track.id}
                initial={animationsEnabled ? { opacity: 0, y: 6 } : undefined}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + i * 0.03, duration: 0.3 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => playTrack(track, quickPicks)}
                className="flex items-center gap-2.5 p-2.5 rounded-[var(--mq-r-card)] text-left cursor-pointer group transition-colors duration-150"
                style={{ backgroundColor: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)" }}
              >
                <div className="w-10 h-10 rounded-[var(--mq-r-art)] overflow-hidden flex-shrink-0 mq-art">
                  {track.cover ? (
                    <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "var(--mq-surface-2)" }}>
                      <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate" style={{ color: "var(--mq-text)" }}>{track.title}</p>
                  <p className="text-[11px] truncate mq-t-meta">{track.artist}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Search bar ── */}
      <motion.div initial={animationsEnabled ? { opacity: 0, y: -8 } : undefined} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="flex gap-2 sticky top-0 z-20 -mx-3 sm:-mx-4 lg:-mx-5 px-3 sm:px-4 lg:px-5 py-2.5"
        style={{ backgroundColor: "var(--mq-bg)" }}>
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px]" style={{ color: isFocused ? "var(--mq-accent)" : "var(--mq-text-muted)", transition: "color 0.25s ease" }} />
          <Input
            ref={searchInputRef}
            data-search-input
            placeholder="Искать треки, артисты, альбомы..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              // Reset hasSearched so suggestions show again while typing
              setHasSearched(false);
              // Show suggestions immediately when there's a query
              if (e.target.value.trim()) setShowSuggestions(true);
            }}
            onFocus={() => {
              setIsFocused(true);
              // Cancel any pending hide timer, show suggestions if there's a query
              if (suggestionsHideTimer.current) {
                clearTimeout(suggestionsHideTimer.current);
                suggestionsHideTimer.current = null;
              }
              if (searchQuery.trim()) setShowSuggestions(true);
            }}
            onBlur={() => {
              setIsFocused(false);
              // Delay hiding suggestions so clicking on a suggestion works
              // (click fires after blur). 200ms is enough for click to register.
              suggestionsHideTimer.current = setTimeout(() => {
                setShowSuggestions(false);
              }, 200);
            }}
            className="pl-11 pr-11 min-h-[48px] text-[15px] font-medium"
            style={{
              backgroundColor: "var(--mq-surface-1)",
              borderRadius: 14,
              border: isFocused ? "1.5px solid var(--mq-accent)" : "1px solid var(--mq-edge)",
              color: "var(--mq-text)",
              boxShadow: isFocused ? "0 0 0 3px color-mix(in srgb, var(--mq-accent) 12%, transparent)" : "none",
              transition: "border-color 0.2s ease, box-shadow 0.2s ease",
              outline: "none",
            }}
          />
          {/* Loading indicator — pulsing dot */}
          {(isDebouncing || (isLoading && !activeLoading)) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="absolute right-11 top-1/2 -translate-y-1/2"
            >
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
                transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: "var(--mq-accent)" }}
              />
            </motion.div>
          )}
          {searchQuery && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleClearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-overlay-hover)]"
              style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 8%, transparent)", color: "var(--mq-text-muted)" }}
            >
              <X className="w-3.5 h-3.5" />
            </motion.button>
          )}
        </div>

        {/* Filter toggle — quiet icon button, accent when active */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-11 h-11 rounded-[14px] flex items-center justify-center transition-colors duration-150 mt-[1px]"
          style={{
            backgroundColor: showFilters || selectedGenre ? "color-mix(in srgb, var(--mq-accent) 14%, transparent)" : "var(--mq-surface-1)",
            color: showFilters || selectedGenre ? "var(--mq-accent)" : "var(--mq-text-muted)",
            border: "1px solid " + (showFilters || selectedGenre ? "color-mix(in srgb, var(--mq-accent) 30%, transparent)" : "var(--mq-edge)"),
          }}
          aria-label="Фильтры"
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        {/* Upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-11 h-11 rounded-[14px] flex items-center justify-center transition-colors duration-150 mt-[1px]"
          style={{
            backgroundColor: "var(--mq-surface-1)",
            color: isUploading ? "var(--mq-accent)" : "var(--mq-text-muted)",
            border: "1px solid var(--mq-edge)",
          }}
          aria-label="Загрузить файлы"
        >
          <Upload className={`w-4 h-4 ${isUploading ? "animate-pulse" : ""}`} />
        </button>
        <input ref={fileInputRef} type="file" accept="audio/*" multiple onChange={handleFileUpload} className="hidden" />
      </motion.div>

      {/* ── Search suggestions — autocomplete-style dropdown ──
          Показывается когда есть query и showSuggestions=true.
          showSuggestions управляется onFocus/onBlur с задержкой скрытия
          чтобы клик по suggestion успел сработать. Раньше использовалось
          !hasSearched — но после 300ms debounce hasSearched становилось
          true и suggestions пропадали (мигание). */}
      <AnimatePresence>
        {searchQuery.trim() && showSuggestions && !hasSearched && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="relative z-30 -mx-3 sm:-mx-4 lg:-mx-5 px-3 sm:px-4 lg:px-5"
          >
            <SearchSuggestions
              query={searchQuery.trim()}
              searchHistory={searchHistory}
              onSelect={(term) => {
                // Cancel hide timer, set query, keep suggestions visible
                if (suggestionsHideTimer.current) {
                  clearTimeout(suggestionsHideTimer.current);
                  suggestionsHideTimer.current = null;
                }
                setSearchQuery(term);
                setShowSuggestions(false);
                searchInputRef.current?.focus();
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Genre filters — enhanced with icons and smooth scroll ── */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 120 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="relative -mx-1 px-1">
              {/* Gradient fade edges */}
              <div className="absolute left-0 top-0 bottom-0 w-6 z-10 pointer-events-none" style={{ background: "linear-gradient(to right, var(--mq-bg), transparent)" }} />
              <div className="absolute right-0 top-0 bottom-0 w-6 z-10 pointer-events-none" style={{ background: "linear-gradient(to left, var(--mq-bg), transparent)" }} />
              <div
                ref={genreScrollRef}
                className="flex gap-2.5 overflow-x-auto pb-2 px-2 scrollbar-none"
                style={{
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                  scrollBehavior: "smooth",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {/* All genres button */}
                <button
                  onClick={() => setSelectedGenre("")}
                  className="px-4 py-2.5 rounded-full text-xs font-semibold transition-colors duration-150 flex-shrink-0 flex items-center gap-2"
                  style={{
                    backgroundColor: !selectedGenre ? "var(--mq-accent)" : "var(--mq-surface-1)",
                    color: !selectedGenre ? "#fff" : "var(--mq-text-muted)",
                    border: "1px solid " + (!selectedGenre ? "var(--mq-accent)" : "var(--mq-edge)"),
                  }}
                >
                  <ListMusic className="w-3.5 h-3.5" />
                  Все
                </button>
                {genresList.map((g) => {
                  const isSelected = selectedGenre === g;
                  return (
                    <button
                      key={g}
                      onClick={() => setSelectedGenre(isSelected ? "" : g)}
                      className="px-4 py-2.5 rounded-full text-xs font-semibold transition-colors duration-150 flex-shrink-0 flex items-center gap-2"
                      style={{
                        backgroundColor: isSelected ? "var(--mq-accent)" : "var(--mq-surface-1)",
                        color: isSelected ? "#fff" : "var(--mq-text-muted)",
                        border: "1px solid " + (isSelected ? "var(--mq-accent)" : "var(--mq-edge)"),
                      }}
                    >
                      <span style={{ color: isSelected ? "#fff" : "var(--mq-accent)", opacity: isSelected ? 1 : 0.75 }}>
                        {genreIcons[g] || <Music className="w-3.5 h-3.5" />}
                      </span>
                      {genreLabels[g] || g}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Recent searches — horizontal tag chips ── */}
      {!searchQuery.trim() && !selectedGenre && searchHistory.length > 0 && !hasSearched && (
        <ScrollReveal direction="up" delay={0.1}>
          <div>
            {/* Section header */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: "var(--mq-text-muted)" }}>
                <Clock className="w-3.5 h-3.5" />
                Недавние запросы
              </h3>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={handleClearHistory}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors hover:bg-[var(--mq-overlay-hover)]"
                style={{ color: "var(--mq-text-muted)" }}
              >
                <Trash2 className="w-3 h-3" />
                Очистить
              </motion.button>
            </div>
            {/* Tag chips with horizontal scroll */}
            <div className="relative -mx-1 px-1">
              <div
                ref={historyScrollRef}
                className="flex gap-2 overflow-x-auto pb-1 scrollbar-none"
                style={{
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                  scrollBehavior: "smooth",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {searchHistory.slice(0, 12).map((query, i) => (
                  <motion.div
                    key={query}
                    initial={animationsEnabled ? { opacity: 0, scale: 0.85 } : undefined}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.03, duration: 0.2 }}
                    className="flex-shrink-0 group relative"
                  >
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      whileHover={{ scale: 1.03, backgroundColor: "var(--mq-card-hover)" }}
                      onClick={() => handleHistoryClick(query)}
                      className="flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 cursor-pointer"
                      style={{
                        backgroundColor: "var(--mq-card)",
                        color: "var(--mq-text-muted)",
                        border: "1px solid var(--mq-border-thin)",
                      }}
                    >
                      <Clock className="w-3 h-3 opacity-40" />
                      <span className="whitespace-nowrap">{query}</span>
                      {/* Remove individual item button */}
                      <motion.button
                        whileTap={{ scale: 0.8 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveHistoryItem(query);
                        }}
                        className="w-4 h-4 rounded-full flex items-center justify-center transition-opacity ml-0.5 sm:opacity-0 sm:group-hover:opacity-60 sm:group-hover:pointer-events-auto hover:!opacity-100"
                        style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 8%, transparent)" }}
                      >
                        <X className="w-2.5 h-2.5" />
                      </motion.button>
                    </motion.button>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </ScrollReveal>
      )}

      {/* ── Results header — real section head: serif title, count meta, one action ── */}
      <AnimatePresence>
        {activeHasSearched && !activeLoading && activeTracks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="mq-section-head"
          >
            <div className="flex items-baseline gap-2.5 min-w-0">
              <h3 className="mq-section-title" style={{ fontFamily: "var(--mq-font-serif)" }}>
                {selectedGenre ? (genreLabels[selectedGenre] || selectedGenre) : "Результаты"}
              </h3>
              <span className="mq-t-num text-[13px]" style={{ color: "var(--mq-text-muted)" }}>
                {activeTracks.length} {activeTracks.length === 1 ? "трек" : activeTracks.length < 5 ? "трека" : "треков"}
              </span>
            </div>
            <button
              onClick={handlePlayAll}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors duration-150"
              style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
            >
              <Play className="w-3 h-3" fill="currentColor" />
              Играть все
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading skeletons — unified row geometry ── */}
      {activeLoading && (
        <div className="space-y-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-[var(--mq-r-card)]"
              style={{ backgroundColor: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)" }}
            >
              <Skeleton className="w-11 h-11 rounded-[var(--mq-r-art)] flex-shrink-0" />
              <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state: no results — quiet editorial pattern ── */}
      {!activeLoading && activeHasSearched && activeTracks.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className="mq-empty"
        >
          <Search className="w-7 h-7" style={{ color: "var(--mq-text-muted)" }} />
          <p className="mq-empty-title">Ничего не найдено</p>
          <p className="mq-empty-hint">Попробуйте изменить запрос или выбрать другой жанр</p>
          {/* Quick retry suggestions */}
          <div className="flex flex-wrap gap-2 mt-2 justify-center">
            {TRENDING_SEARCHES.slice(0, 4).map((term) => (
              <button
                key={term}
                onClick={() => handleTrendingClick(term)}
                className="px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors duration-150 cursor-pointer"
                style={{
                  backgroundColor: "var(--mq-surface-2)",
                  color: "var(--mq-text-muted)",
                  border: "1px solid var(--mq-edge)",
                }}
              >
                {term}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Track results with filter/sort toolbar ── */}
      {!activeLoading && processedTracks.length > 0 && (
        <div>
          {/* Section header with filter + sort controls */}
          <div className="flex items-center justify-between mb-3 px-1 flex-wrap gap-2">
            <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
              Треки · {processedTracks.length}
            </h3>
            <div className="flex items-center gap-1.5">
              {/* Duration filter dropdown */}
              <select
                value={filterDuration}
                onChange={(e) => setFilterDuration(e.target.value as "all" | "short" | "medium" | "long")}
                className="text-[11px] font-medium px-2 py-1 rounded-lg cursor-pointer outline-none"
                style={{
                  backgroundColor: "var(--mq-card)",
                  color: "var(--mq-text)",
                  border: "1px solid var(--mq-border-thin)",
                }}
              >
                <option value="all">Любая длительность</option>
                <option value="short">До 2 мин</option>
                <option value="medium">2–5 мин</option>
                <option value="long">5+ мин</option>
              </select>
              {/* Sort dropdown */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "relevance" | "duration" | "title")}
                className="text-[11px] font-medium px-2 py-1 rounded-lg cursor-pointer outline-none"
                style={{
                  backgroundColor: "var(--mq-card)",
                  color: "var(--mq-text)",
                  border: "1px solid var(--mq-border-thin)",
                }}
              >
                <option value="relevance">По релевантности</option>
                <option value="duration">По длительности</option>
                <option value="title">По названию</option>
              </select>
            </div>
          </div>

          {/* Track list with 3D scroll-reveal stagger */}
          <div className="space-y-1" style={{ perspective: "1000px" }}>
            {processedTracks.map((track, i) => (
              <motion.div
                key={track.id + "_" + i}
                initial={{ opacity: 0, z: -30, rotateX: 5 }}
                whileInView={{ opacity: 1, z: 0, rotateX: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.3), ease: [0.16, 1, 0.3, 1] }}
                style={{ transformStyle: "preserve-3d" }}
              >
                <SearchTrackRow
                  track={track}
                  index={i}
                  queue={processedTracks}
                  onArtistClick={(name, cover) => setSelectedArtist({ name, avatar: cover })}
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ── Default empty state — hero with trending searches ── */}
      {!activeHasSearched && !activeLoading && searchHistory.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <motion.div
            initial={animationsEnabled ? { opacity: 0, scale: 0.9 } : undefined}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.05 }}
            className="mb-5"
          >
            <div style={{
              width: 88,
              height: 88,
              borderRadius: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 15%, transparent), color-mix(in srgb, var(--mq-accent) 6%, transparent))",
              border: "1px solid color-mix(in srgb, var(--mq-accent) 10%, transparent)",
              boxShadow: "var(--mq-shadow-accent)",
            }}>
              <Headphones className="w-9 h-9" style={{ color: "var(--mq-accent)", opacity: 0.6 }} />
            </div>
          </motion.div>

          <motion.div
            initial={animationsEnabled ? { opacity: 0, y: 8 } : undefined}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="text-center mb-8"
          >
            <p className="text-lg font-bold mb-1.5" style={{ color: "var(--mq-text)", letterSpacing: "-0.01em" }}>Что послушаем?</p>
            <p className="text-sm leading-relaxed max-w-[280px]" style={{ color: "var(--mq-text-muted)" }}>
              Введите название, артиста или жанр — или выберите подсказку ниже
            </p>
          </motion.div>

          <motion.div
            initial={animationsEnabled ? { opacity: 0, y: 8 } : undefined}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="w-full max-w-md"
          >
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)", opacity: 0.7 }} />
              <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
                Популярные запросы
              </h4>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {TRENDING_SEARCHES.map((term, i) => (
                <motion.button
                  key={term}
                  initial={animationsEnabled ? { opacity: 0, scale: 0.9 } : undefined}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.25 + i * 0.03, duration: 0.25 }}
                  whileTap={{ scale: 0.96 }}
                  whileHover={{ scale: 1.05, backgroundColor: "var(--mq-card-hover)" }}
                  onClick={() => handleTrendingClick(term)}
                  className="px-4 py-2 rounded-xl text-xs font-medium transition-all duration-200 cursor-pointer"
                  style={{
                    backgroundColor: "var(--mq-card)",
                    color: "var(--mq-text-muted)",
                    border: "1px solid var(--mq-border-thin)",
                  }}
                >
                  {term}
                </motion.button>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Trending searches — shown when there IS search history ── */}
      {!searchQuery.trim() && !selectedGenre && searchHistory.length > 0 && !hasSearched && (
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 6 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="mt-2"
        >
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)", opacity: 0.7 }} />
            <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
              Популярные запросы
            </h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {TRENDING_SEARCHES.map((term, i) => (
              <motion.button
                key={term}
                initial={animationsEnabled ? { opacity: 0, scale: 0.9 } : undefined}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03, duration: 0.2 }}
                whileTap={{ scale: 0.96 }}
                whileHover={{ scale: 1.05, backgroundColor: "var(--mq-card-hover)" }}
                onClick={() => handleTrendingClick(term)}
                className="px-4 py-2 rounded-xl text-xs font-medium transition-all duration-200 cursor-pointer"
                style={{
                  backgroundColor: "var(--mq-card)",
                  color: "var(--mq-text-muted)",
                  border: "1px solid var(--mq-border-thin)",
                }}
              >
                {term}
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}


    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// SEARCH TRACK ROW — clean visual row optimized for mobile
// Lightweight: no framer-motion per-row (uses CSS transitions), no context
// menu overhead (uses simple onClick + long-press), no next/image (plain img).
// ═════════════════════════════════════════════════════════════════════════

const SearchTrackRow = memo(function SearchTrackRow({
  track,
  index,
  queue,
  onArtistClick,
}: {
  track: Track;
  index: number;
  queue: Track[];
  onArtistClick?: (artistName: string, coverUrl?: string) => void;
}) {
  const currentTrackId = useAppStore((s) => s.currentTrack?.id);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const playTrack = useAppStore((s) => s.playTrack);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const toggleLike = useAppStore((s) => s.toggleLike);

  const isActive = currentTrackId === track.id;
  const isCurrentlyPlaying = isActive && isPlaying;
  const isLiked = likedTrackIds.includes(track.id);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; show: boolean }>({ x: 0, y: 0, show: false });

  // Long-press for context menu (mobile)
  const handleLongPress = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const clientX = "touches" in e ? e.touches[0]?.clientX ?? 0 : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0]?.clientY ?? 0 : (e as React.MouseEvent).clientY;
    setContextMenu({ x: clientX, y: clientY, show: true });
  }, []);
  const { wasLongPress: longPressWasActive, ...longPressHandlers } = useLongPress(handleLongPress, { delay: 500, threshold: 10 });

  const handleClick = useCallback(() => {
    if (longPressWasActive()) return;
    if (isActive) togglePlay();
    else playTrack(track, queue);
  }, [longPressWasActive, isActive, togglePlay, playTrack, track, queue]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, show: true });
  }, []);

  const handleMoreClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenu({ x: rect.left, y: rect.bottom + 4, show: true });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu((p) => ({ ...p, show: false })), []);

  return (
    <>
      <div
        {...longPressHandlers}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        aria-label={`Слушать ${track.title} — ${track.artist}${isActive ? " (играет сейчас)" : ""}`}
        className="mq-row group"
        data-active={isActive || undefined}
      >
        {/* Cover — artwork carries the color */}
        <div className="w-12 h-12 rounded-[var(--mq-r-art)] overflow-hidden flex-shrink-0 relative mq-art">
          {track.cover ? (
            <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
            </div>
          )}
          {/* Play/pause overlay on hover/active */}
          {isActive && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
              {isCurrentlyPlaying ? (
                <NowPlayingEqualizer size="sm" variant="overlay" />
              ) : (
                <Play className="w-4 h-4" fill="#fff" style={{ color: "#fff" }} />
              )}
            </div>
          )}
        </div>

        {/* Title + artist + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {isActive && (
              <NowPlayingEqualizer
                size="sm"
                variant="inline"
                paused={!isPlaying}
              />
            )}
            <p className="text-sm font-semibold truncate" style={{ color: isActive ? "var(--mq-accent)" : "var(--mq-text)" }}>
              {track.title}
            </p>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); onArtistClick?.(track.artist, track.cover); }}
              className="text-xs block max-w-full text-left truncate hover:underline"
              style={{ color: "var(--mq-text-muted)" }}
            >
              {track.artist}
            </button>
            {track.duration > 0 && (
              <>
                <span style={{ color: "var(--mq-text-muted)", opacity: 0.4 }}>·</span>
                <span className="mq-t-num text-[11px]" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
                  {formatDuration(track.duration)}
                </span>
              </>
            )}
            {track.genre && (
              <>
                <span style={{ color: "var(--mq-text-muted)", opacity: 0.4 }}>·</span>
                <span className="text-[11px] px-1.5 py-0 rounded-md min-w-0 max-w-[140px] truncate" style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 6%, transparent)", color: "var(--mq-text-muted)" }}>
                  {track.genre}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Like button */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleLike(track.id, track); }}
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
          aria-label={isLiked ? "Убрать из избранного" : "В избранное"}
        >
          <Heart className="w-4 h-4" fill={isLiked ? "currentColor" : "none"} />
        </button>

        {/* More button (3-dot) */}
        <button
          onClick={handleMoreClick}
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity"
          style={{ color: "var(--mq-text-muted)" }}
          aria-label="Меню"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Context menu */}
      {contextMenu.show && (
        <ContextMenu track={track} x={contextMenu.x} y={contextMenu.y} onClose={closeContextMenu} />
      )}
    </>
  );
});

// ═════════════════════════════════════════════════════════════════════════
// SEARCH SUGGESTIONS — autocomplete-style dropdown
// Показывает подсказки пока пользователь печатает:
// 1. Match из recent searches (если query частично совпадает)
// 2. Trending searches (если query частично совпадает)
// 3. Popular artists/genres (всегда как подсказки)
// UX Core #6 (Забывание без подсказок): подсказки помогают пользователю
// вспомнить что он искал, и снижают когнитивную нагрузку.
// ═════════════════════════════════════════════════════════════════════════

const POPULAR_ARTISTS = [
  "Mac DeMarco", "Tame Impala", "Arctic Monkeys", "The Weeknd",
  "Billie Eilish", "Kendrick Lamar", "Frank Ocean", "Tyler, The Creator",
];

function SearchSuggestions({
  query,
  searchHistory,
  onSelect,
}: {
  query: string;
  searchHistory: string[];
  onSelect: (term: string) => void;
}) {
  const queryLower = query.toLowerCase();

  // 1. Match из recent searches
  const historyMatches = searchHistory
    .filter(h => h.toLowerCase().includes(queryLower) && h.toLowerCase() !== queryLower)
    .slice(0, 3);

  // 2. Match из trending
  const trendingMatches = TRENDING_SEARCHES
    .filter(t => t.toLowerCase().includes(queryLower) && t.toLowerCase() !== queryLower)
    .slice(0, 3);

  // 3. Match из popular artists
  const artistMatches = POPULAR_ARTISTS
    .filter(a => a.toLowerCase().includes(queryLower) && a.toLowerCase() !== queryLower)
    .slice(0, 3);

  // 4. "Search for X" — прямой поиск текущего query
  const hasSuggestions = historyMatches.length > 0 || trendingMatches.length > 0 || artistMatches.length > 0;

  return (
    <div
      className="mt-1 rounded-[var(--mq-r-card)] overflow-hidden"
      style={{
        backgroundColor: "var(--mq-surface-1)",
        border: "1px solid var(--mq-edge-strong)",
        boxShadow: "var(--mq-elev-dialog)",
      }}
    >
      {/* Direct search for current query */}
      <button
        onClick={() => onSelect(query)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--mq-overlay-hover)]"
      >
        <Search className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
        <span className="text-sm" style={{ color: "var(--mq-text)" }}>
          Искать <span className="font-semibold" style={{ color: "var(--mq-accent)" }}>«{query}»</span>
        </span>
      </button>

      {/* History matches */}
      {historyMatches.length > 0 && (
        <div className="border-t" style={{ borderColor: "var(--mq-border-hairline)" }}>
          <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
            Недавно искали
          </p>
          {historyMatches.map((term) => (
            <button
              key={`hist-${term}`}
              onClick={() => onSelect(term)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--mq-overlay-hover)]"
            >
              <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
              <span className="text-sm truncate" style={{ color: "var(--mq-text)" }}>{term}</span>
            </button>
          ))}
        </div>
      )}

      {/* Trending matches */}
      {trendingMatches.length > 0 && (
        <div className="border-t" style={{ borderColor: "var(--mq-border-hairline)" }}>
          <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
            Популярное
          </p>
          {trendingMatches.map((term) => (
            <button
              key={`trend-${term}`}
              onClick={() => onSelect(term)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--mq-overlay-hover)]"
            >
              <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
              <span className="text-sm truncate" style={{ color: "var(--mq-text)" }}>{term}</span>
            </button>
          ))}
        </div>
      )}

      {/* Artist matches */}
      {artistMatches.length > 0 && (
        <div className="border-t" style={{ borderColor: "var(--mq-border-hairline)" }}>
          <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
            Артисты
          </p>
          {artistMatches.map((artist) => (
            <button
              key={`art-${artist}`}
              onClick={() => onSelect(artist)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--mq-overlay-hover)]"
            >
              <Mic className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
              <span className="text-sm truncate" style={{ color: "var(--mq-text)" }}>{artist}</span>
            </button>
          ))}
        </div>
      )}

      {/* If no suggestions — show hint */}
      {!hasSuggestions && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--mq-border-hairline)" }}>
          <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
            Нажмите Enter для поиска «{query}»
          </p>
        </div>
      )}
    </div>
  );
}
