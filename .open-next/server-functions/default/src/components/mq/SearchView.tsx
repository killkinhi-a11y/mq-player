"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore } from "@/store/useAppStore";
import { motion } from "framer-motion";
import { genresList, type Track } from "@/lib/musicApi";
import TrackCard from "./TrackCard";
import ScrollReveal from "./ScrollReveal";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, X, SlidersHorizontal, Music, Play, Upload, Clock, Trash2, CheckCircle2, AlertCircle, Loader2, Headphones } from "lucide-react";

const SEARCH_HISTORY_KEY = "mq-search-history";
const MAX_HISTORY = 15;

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
  const { searchQuery, setSearchQuery, selectedGenre, setSelectedGenre, animationsEnabled, playTrack, toggleLike, currentView, compactMode, setSelectedArtist, setView } = useAppStore();
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

  // Genre filter search
  const [genreTracks, setGenreTracks] = useState<Track[]>([]);
  const [isGenreLoading, setIsGenreLoading] = useState(false);

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
      if (!selectedGenre) {
        setSearchResults([]);
        setHasSearched(false);
      }
      return;
    }

    const timer = setTimeout(async () => {
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

  const handleClearHistory = useCallback(() => {
    saveSearchHistory([]);
    setSearchHistory([]);
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
    <div className={`${compactMode ? "p-2 sm:p-3 lg:p-4 pb-32 lg:pb-24 space-y-4" : "p-3 sm:p-4 lg:p-6 pb-36 lg:pb-28 space-y-6"} max-w-4xl mx-auto relative`}>
      {/* Upload progress */}
      {uploadProgress && (
        <motion.div initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[90vw] max-w-md">
          <div className="rounded-2xl p-4 shadow-2xl border" style={{ backgroundColor: "rgba(24,24,27,0.97)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--mq-text)" }}>
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
              <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${(uploadProgress.fileProgress || 0)}%`, backgroundColor: "var(--mq-accent)" }} />
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Search bar */}
      <motion.div initial={animationsEnabled ? { opacity: 0, y: -10 } : undefined} animate={{ opacity: 1, y: 0 }}
        className="flex gap-2 sticky top-0 z-20 -mx-2 sm:-mx-3 lg:-mx-4 px-2 sm:px-3 lg:px-4 py-2 sm:py-3"
        style={{ backgroundColor: "var(--mq-bg)" }}>
        <motion.div animate={isFocused ? { boxShadow: "0 0 20px rgba(var(--mq-accent-rgb, 224,49,49), 0.2)" } : { boxShadow: "0 0 0px transparent" }}
          transition={{ duration: 0.3 }} className="rounded-xl flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
            <Input ref={searchInputRef} placeholder="Искать треки, артистов, альбомы..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)} onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)}
              className="pl-10 pr-10 min-h-[44px]"
              style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }} />
            {searchQuery && (
              <button onClick={handleClearSearch} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--mq-text-muted)" }}>
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </motion.div>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowFilters(!showFilters)}
          className="p-3 rounded-xl min-w-[44px] min-h-[44px] flex items-center justify-center"
          style={{ backgroundColor: showFilters ? "var(--mq-accent)" : "var(--mq-card)", border: "1px solid var(--mq-border)", color: showFilters ? "var(--mq-text)" : "var(--mq-text-muted)" }}>
          <SlidersHorizontal className="w-4 h-4" />
        </motion.button>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => fileInputRef.current?.click()}
          className="p-3 rounded-xl min-w-[44px] min-h-[44px] flex items-center justify-center"
          style={{ backgroundColor: isUploading ? "var(--mq-accent)" : "var(--mq-card)", border: "1px solid var(--mq-border)", color: isUploading ? "var(--mq-text)" : "var(--mq-text-muted)" }}
          title="Загрузить свои треки">
          <Upload className={`w-4 h-4 ${isUploading ? "animate-pulse" : ""}`} />
        </motion.button>
        <input ref={fileInputRef} type="file" accept="audio/*" multiple onChange={handleFileUpload} className="hidden" />
      </motion.div>

      {/* Genre filters */}
      {showFilters && (
        <ScrollReveal direction="up" delay={0.05}>
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-3">
            {/* Genre pills */}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setSelectedGenre("")} className="px-3 py-1.5 rounded-full text-xs font-medium min-h-[32px]"
                style={{ backgroundColor: !selectedGenre ? "var(--mq-accent)" : "var(--mq-card)", color: "var(--mq-text)", border: "1px solid var(--mq-border)" }}>Все</button>
              {genresList.map(g => (
                <button key={g} onClick={() => setSelectedGenre(selectedGenre === g ? "" : g)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium min-h-[32px]"
                  style={{ backgroundColor: selectedGenre === g ? "var(--mq-accent)" : "var(--mq-card)", color: "var(--mq-text)", border: "1px solid var(--mq-border)" }}>{g}</button>
              ))}
            </div>
          </motion.div>
        </ScrollReveal>
      )}

      {/* Source indicator */}
      {activeHasSearched && !activeLoading && (
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--mq-text-muted)" }}>
          <span>SoundCloud</span>
        </div>
      )}

      {/* Search history */}
      {!searchQuery.trim() && !selectedGenre && searchHistory.length > 0 && !hasSearched && (
        <ScrollReveal direction="up" delay={0.15}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--mq-text-muted)" }}>
                <Clock className="w-4 h-4" /> Недавние запросы
              </h3>
              <button onClick={handleClearHistory} className="p-1 rounded-lg" style={{ color: "var(--mq-text-muted)" }}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex flex-wrap gap-2">
              {searchHistory.map(query => (
                <motion.button key={query} whileTap={{ scale: 0.95 }} onClick={() => handleHistoryClick(query)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: "var(--mq-card)", color: "var(--mq-text)", border: "1px solid var(--mq-border)" }}>{query}</motion.button>
              ))}
            </div>
          </div>
        </ScrollReveal>
      )}

      {/* Results info */}
      {activeHasSearched && !activeLoading && activeTracks.length > 0 && (
        <ScrollReveal direction="up" delay={0.08}>
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
              {selectedGenre ? `Жанр: ${selectedGenre} — ${activeTracks.length} треков` : `${activeTracks.length} треков найдено`}
            </p>
            <motion.button whileTap={{ scale: 0.95 }} onClick={handlePlayAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>
              <Play className="w-3 h-3" style={{ marginLeft: 1 }} /> Воспроизвести все
            </motion.button>
          </div>
        </ScrollReveal>
      )}

      {/* Loading skeletons */}
      {activeLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--mq-card)" }}>
              <Skeleton className="w-12 h-12 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!activeLoading && activeHasSearched && activeTracks.length === 0 && (
        <div className="text-center py-12">
          <Search className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
          <p style={{ color: "var(--mq-text-muted)" }}>Ничего не найдено</p>
          <p className="text-xs mt-1" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
            Попробуйте изменить запрос
          </p>
        </div>
      )}

      {/* Track results */}
      {!activeLoading && activeTracks.length > 0 && (
        <ScrollReveal direction="up" delay={0.1}>
          <div>
            <h2 className="text-lg font-bold mb-3" style={{ color: "var(--mq-text)" }}>
              {selectedGenre ? `Жанр: ${selectedGenre}` : "Треки"}
            </h2>
            <div className="space-y-1.5 sm:space-y-2">
              {activeTracks.map((track, i) => (
                <TrackCard key={track.id} track={track} index={i} queue={activeTracks}
                  onArtistClick={(name, cover) => setSelectedArtist({ name, avatar: cover })} />
              ))}
            </div>
          </div>
        </ScrollReveal>
      )}

      {/* Default state */}
      {!activeHasSearched && !activeLoading && searchHistory.length === 0 && (
        <div className="text-center py-12">
          <Music className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
          <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>Начните вводить для поиска музыки</p>
          <p className="text-xs mt-1" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
            Или выберите жанр в фильтрах
          </p>
        </div>
      )}
    </div>
  );
}
