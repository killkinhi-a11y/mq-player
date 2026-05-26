"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import { genresList, type Track } from "@/lib/musicApi";
import TrackCard from "./TrackCard";
import ScrollReveal from "./ScrollReveal";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, X, SlidersHorizontal, Play, Upload, Clock, Trash2, CheckCircle2,
  AlertCircle, Loader2, Headphones, TrendingUp, ChevronRight, Music, Sparkles,
  RefreshCw, Flame, Zap, Mic, Disc, Heart, Piano, Radio, RotateCcw, ListMusic,
  Hash, ArrowRight
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

// ── Unique opacity per genre (dark monochrome badges) ──
const genreOpacities: Record<string, number> = {
  "Pop": 0.10,
  "Rock": 0.15,
  "Electronic": 0.12,
  "Hip-Hop": 0.20,
  "Jazz": 0.10,
  "Classical": 0.08,
  "R&B": 0.15,
  "Indie": 0.12,
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
  const { searchQuery, setSearchQuery, selectedGenre, setSelectedGenre, animationsEnabled, playTrack, toggleLike, currentView, compactMode, setSelectedArtist, setView, likedTrackIds, likedTracksData } = useAppStore();
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

  // Auto-clear search when leaving search view
  useEffect(() => {
    if (currentView !== "search") {
      setSearchQuery("");
      setSearchResults([]);
      setHasSearched(false);
    }
  }, [currentView, setSearchQuery]);



  // Debounced search
  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    if (!searchQuery.trim() || selectedGenre) {
      setIsDebouncing(false);
      if (!selectedGenre) {
        setSearchResults([]);
        setHasSearched(false);
      }
      return;
    }

    setIsDebouncing(true);
    const timer = setTimeout(async () => {
      setIsDebouncing(false);
      const controller = new AbortController();
      abortRef.current = controller;
      setIsLoading(true);
      setHasSearched(true);

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

  // ── Main Search View ──
  return (
    <div className={`${compactMode ? "p-3 sm:p-4 lg:p-5 pb-32 lg:pb-32 space-y-4" : "p-4 sm:p-5 lg:p-6 pb-36 lg:pb-36 space-y-5"} max-w-3xl mx-auto relative`} style={{ scrollBehavior: "smooth" }}>
      {/* Upload progress toast */}
      {uploadProgress && (
        <motion.div initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[90vw] max-w-md">
          <div className="rounded-2xl p-4 shadow-2xl" style={{ backgroundColor: "rgba(24,24,27,0.97)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--mq-text)" }}>
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
              <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: "100%", transform: `scaleX(${(uploadProgress.fileProgress || 0) / 100})`, transformOrigin: "left", willChange: "transform", backgroundColor: "var(--mq-accent)" }} />
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Quick Picks — 4 random liked tracks ── */}
      {!searchQuery.trim() && !selectedGenre && quickPicks.length > 0 && (
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 8 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
            <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>Быстрый доступ</h2>
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => setQuickPicksSeed(s => s + 1)}
              className="ml-auto p-1 rounded-lg transition-colors hover:bg-white/5"
              style={{ color: "var(--mq-text-muted)" }}
              title="Обновить"
            >
              <RefreshCw className="w-3 h-3" />
            </motion.button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {quickPicks.map((track, i) => (
              <motion.button
                key={track.id}
                initial={animationsEnabled ? { opacity: 0, y: 6 } : undefined}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.04, duration: 0.3 }}
                whileHover={{ scale: 1.02, backgroundColor: "var(--mq-card-hover)" }}
                whileTap={{ scale: 0.97 }}
                onClick={() => playTrack(track, quickPicks)}
                className="flex items-center gap-2.5 p-2.5 rounded-2xl text-left cursor-pointer group transition-all duration-200"
                style={{ backgroundColor: "var(--mq-card)", border: "1px solid rgba(255,255,255,0.04)" }}
              >
                <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}>
                  {track.cover ? (
                    <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 15%, transparent)" }}>
                      <Music className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold truncate" style={{ color: "var(--mq-text)", letterSpacing: "-0.01em" }}>{track.title}</p>
                  <p className="text-[10px] truncate" style={{ color: "var(--mq-text-muted)" }}>{track.artist}</p>
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
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className="pl-11 pr-11 min-h-[48px] text-[15px] rounded-2xl font-medium"
            style={{
              backgroundColor: "var(--mq-card)",
              border: isFocused ? "1.5px solid var(--mq-accent)" : "1px solid rgba(255,255,255,0.06)",
              color: "var(--mq-text)",
              boxShadow: isFocused
                ? "0 0 0 3px rgba(var(--mq-accent-rgb, 224,49,49), 0.12), 0 0 20px rgba(var(--mq-accent-rgb, 224,49,49), 0.06), 0 4px 16px rgba(0,0,0,0.12)"
                : "0 2px 8px rgba(0,0,0,0.06)",
              transition: "border-color 0.25s ease, box-shadow 0.25s ease",
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
              whileTap={{ scale: 0.85 }}
              onClick={handleClearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "var(--mq-text-muted)" }}
            >
              <X className="w-3.5 h-3.5" />
            </motion.button>
          )}
        </div>

        {/* Filter toggle */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => setShowFilters(!showFilters)}
          className="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 mt-[1px]"
          style={{
            backgroundColor: showFilters || selectedGenre ? "var(--mq-accent)" : "var(--mq-card)",
            color: showFilters || selectedGenre ? "var(--mq-text)" : "var(--mq-text-muted)",
            border: showFilters || selectedGenre ? "none" : "1px solid rgba(255,255,255,0.06)",
            boxShadow: showFilters || selectedGenre ? "0 2px 12px rgba(var(--mq-accent-rgb, 224,49,49), 0.25)" : "none",
          }}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </motion.button>

        {/* Upload button */}
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => fileInputRef.current?.click()}
          className="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 mt-[1px]"
          style={{
            backgroundColor: "var(--mq-card)",
            color: isUploading ? "var(--mq-accent)" : "var(--mq-text-muted)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <Upload className={`w-4 h-4 ${isUploading ? "animate-pulse" : ""}`} />
        </motion.button>
        <input ref={fileInputRef} type="file" accept="audio/*" multiple onChange={handleFileUpload} className="hidden" />
      </motion.div>

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
                className="flex gap-2.5 overflow-x-auto pb-2 px-2"
                style={{
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                  scrollBehavior: "smooth",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {/* All genres button */}
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  whileHover={{ scale: 1.04 }}
                  onClick={() => setSelectedGenre("")}
                  className="px-4 py-2.5 rounded-2xl text-xs font-semibold transition-all duration-200 flex-shrink-0 flex items-center gap-2"
                  style={{
                    backgroundColor: !selectedGenre ? "var(--mq-accent)" : "var(--mq-card)",
                    color: !selectedGenre ? "var(--mq-text)" : "var(--mq-text-muted)",
                    border: !selectedGenre ? "1.5px solid var(--mq-accent)" : "1px solid rgba(255,255,255,0.06)",
                    boxShadow: !selectedGenre ? "0 4px 16px rgba(var(--mq-accent-rgb, 224,49,49), 0.2)" : "none",
                  }}
                >
                  <ListMusic className="w-3.5 h-3.5" />
                  Все
                </motion.button>
                {genresList.map((g, i) => {
                  const isSelected = selectedGenre === g;
                  const opacity = genreOpacities[g] || 0.10;
                  return (
                    <motion.button
                      key={g}
                      whileTap={{ scale: 0.93 }}
                      whileHover={{ scale: 1.04 }}
                      onClick={() => setSelectedGenre(isSelected ? "" : g)}
                      className="px-4 py-2.5 rounded-lg text-xs font-semibold transition-all duration-250 flex-shrink-0 flex items-center gap-2"
                      style={{
                        backgroundColor: isSelected ? "var(--mq-accent)" : `color-mix(in srgb, var(--mq-accent) ${opacity * 100}%, transparent)`,
                        color: isSelected ? "var(--mq-text)" : "var(--mq-text-muted)",
                        border: isSelected ? "1.5px solid var(--mq-accent)" : "1px solid rgba(255,255,255,0.06)",
                        boxShadow: isSelected ? "0 2px 8px rgba(var(--mq-accent-rgb, 224,49,49), 0.15)" : "none",
                      }}
                    >
                      <span style={{ color: isSelected ? "var(--mq-text)" : "var(--mq-accent)", opacity: isSelected ? 1 : 0.7 }}>
                        {genreIcons[g] || <Music className="w-3.5 h-3.5" />}
                      </span>
                      {genreLabels[g] || g}
                    </motion.button>
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
                whileTap={{ scale: 0.9 }}
                onClick={handleClearHistory}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors hover:bg-white/5"
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
                className="flex gap-2 overflow-x-auto pb-1"
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
                      whileTap={{ scale: 0.93 }}
                      whileHover={{ scale: 1.03, backgroundColor: "var(--mq-card-hover)" }}
                      onClick={() => handleHistoryClick(query)}
                      className="flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 cursor-pointer"
                      style={{
                        backgroundColor: "var(--mq-card)",
                        color: "var(--mq-text-muted)",
                        border: "1px solid rgba(255,255,255,0.06)",
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
                        className="w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity ml-0.5"
                        style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
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

      {/* ── Results header ── */}
      <AnimatePresence>
        {activeHasSearched && !activeLoading && activeTracks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <h3 className="text-xs font-semibold" style={{ color: "var(--mq-text-muted)" }}>
                {activeTracks.length} {activeTracks.length === 1 ? "трек" : activeTracks.length < 5 ? "трека" : "треков"}
              </h3>
              {selectedGenre && (
                <motion.span
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1"
                  style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 15%, transparent)", color: "var(--mq-accent)" }}
                >
                  {genreIcons[selectedGenre] && <span className="inline-flex" style={{ opacity: 0.7 }}>{genreIcons[selectedGenre]}</span>}
                  {genreLabels[selectedGenre] || selectedGenre}
                </motion.span>
              )}
            </div>
            <motion.button
              whileTap={{ scale: 0.93 }}
              whileHover={{ scale: 1.04 }}
              onClick={handlePlayAll}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200"
              style={{
                backgroundColor: "var(--mq-accent)",
                color: "var(--mq-text)",
                boxShadow: "0 2px 12px rgba(var(--mq-accent-rgb, 224,49,49), 0.25)",
              }}
            >
              <Play className="w-3 h-3" fill="currentColor" />
              Играть все
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading skeletons ── */}
      {activeLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-1.5"
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <motion.div
              key={i}
              initial={animationsEnabled ? { opacity: 0, x: -8 } : undefined}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.25 }}
              className="flex items-center gap-3 p-3 rounded-2xl"
              style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
            >
              <Skeleton className="w-11 h-11 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
              <Skeleton className="h-3 w-10" />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* ── Empty state: no results ── */}
      {!activeLoading && activeHasSearched && activeTracks.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex flex-col items-center justify-center py-16"
        >
          <motion.div
            initial={animationsEnabled ? { scale: 0.8, rotate: -5 } : undefined}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 18, delay: 0.05 }}
            className="mb-5 relative"
            style={{
              width: 88,
              height: 88,
              borderRadius: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, color-mix(in srgb, var(--mq-accent) 15%, transparent), color-mix(in srgb, var(--mq-accent) 6%, transparent))",
              border: "1px solid color-mix(in srgb, var(--mq-accent) 10%, transparent)",
              boxShadow: "0 4px 20px color-mix(in srgb, var(--mq-accent) 8%, transparent)",
            }}
          >
            <Search className="w-9 h-9" style={{ color: "var(--mq-accent)", opacity: 0.45 }} />
            {/* Floating dots around the icon */}
            <motion.div
              animate={animationsEnabled ? { y: [-2, 2, -2], opacity: [0.3, 0.6, 0.3] } : {}}
              transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
              className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full"
              style={{ backgroundColor: "var(--mq-accent)" }}
            />
            <motion.div
              animate={animationsEnabled ? { y: [2, -2, 2], opacity: [0.4, 0.7, 0.4] } : {}}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut", delay: 0.5 }}
              className="absolute -bottom-1 -left-2 w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: "var(--mq-accent)" }}
            />
          </motion.div>
          <p className="text-lg font-bold mb-1.5" style={{ color: "var(--mq-text)", letterSpacing: "-0.01em" }}>Ничего не найдено</p>
          <p className="text-sm text-center max-w-[280px] leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
            Попробуйте изменить запрос или выбрать другой жанр
          </p>
          {/* Quick retry suggestions */}
          <div className="flex flex-wrap gap-2 mt-6 justify-center">
            {TRENDING_SEARCHES.slice(0, 4).map((term, i) => (
              <motion.button
                key={term}
                initial={animationsEnabled ? { opacity: 0, y: 6 } : undefined}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.05, duration: 0.25 }}
                whileTap={{ scale: 0.93 }}
                whileHover={{ scale: 1.03, backgroundColor: "var(--mq-card-hover)" }}
                onClick={() => handleTrendingClick(term)}
                className="px-4 py-2 rounded-2xl text-xs font-medium transition-all duration-200 cursor-pointer"
                style={{
                  backgroundColor: "var(--mq-card)",
                  color: "var(--mq-text-muted)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {term}
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Track results with staggered animation ── */}
      {!activeLoading && activeTracks.length > 0 && (
        <div>
          <div className="space-y-0.5">
            <AnimatePresence mode="popLayout">
              {activeTracks.map((track, i) => (
                <motion.div
                  key={track.id}
                  initial={animationsEnabled ? { opacity: 0, y: 8 } : undefined}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
                  transition={{ delay: Math.min(i * 0.03, 0.5), duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <TrackCard
                    track={track}
                    index={i}
                    queue={activeTracks}
                    onArtistClick={(name, cover) => setSelectedArtist({ name, avatar: cover })}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
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
              boxShadow: "0 4px 20px color-mix(in srgb, var(--mq-accent) 8%, transparent)",
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
            <p className="text-lg font-bold mb-1.5" style={{ color: "var(--mq-text)", letterSpacing: "-0.01em" }}>Найдите свою музыку</p>
            <p className="text-sm leading-relaxed max-w-[280px]" style={{ color: "var(--mq-text-muted)" }}>
              Введите запрос или выберите жанр для начала
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
                  whileTap={{ scale: 0.93 }}
                  whileHover={{ scale: 1.05, backgroundColor: "var(--mq-card-hover)" }}
                  onClick={() => handleTrendingClick(term)}
                  className="px-4 py-2 rounded-xl text-xs font-medium transition-all duration-200 cursor-pointer"
                  style={{
                    backgroundColor: "var(--mq-card)",
                    color: "var(--mq-text-muted)",
                    border: "1px solid rgba(255,255,255,0.06)",
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
                whileTap={{ scale: 0.93 }}
                whileHover={{ scale: 1.05, backgroundColor: "var(--mq-card-hover)" }}
                onClick={() => handleTrendingClick(term)}
                className="px-4 py-2 rounded-xl text-xs font-medium transition-all duration-200 cursor-pointer"
                style={{
                  backgroundColor: "var(--mq-card)",
                  color: "var(--mq-text-muted)",
                  border: "1px solid rgba(255,255,255,0.06)",
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
