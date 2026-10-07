"use client";

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { useAppStore } from "@/store/useAppStore";
import { isDesktopApp } from "@/lib/desktop-mode";
import { motion, AnimatePresence } from "framer-motion";
import { genresList, type Track, formatDuration } from "@/lib/musicApi";
import { searchAll } from "@/lib/spotify";
import TrackCard from "./TrackCard";
import ScrollReveal from "./ScrollReveal";
import { mergeSearchResults } from "@/lib/playback/merge";
import type { CatalogAlbumDTO, CatalogArtistDTO, CatalogTrackDTO } from "@/lib/spotify/types";
import { ProviderBadge } from "./ui/ProviderBadge";
import ContextMenu from "./ContextMenu";
import { NowPlayingEqualizer } from "./NowPlayingEqualizer";
import { useLongPress } from "@/hooks/useLongPress";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildSuggestions,
  type SuggestionItem,
  type SuggestionSourceTrack,
} from "@/lib/search-suggestions";
import {
  Search, X, SlidersHorizontal, Play, Upload, Clock, CheckCircle2,
  AlertCircle, Loader2, TrendingUp, ChevronRight, Music, Sparkles,
  RefreshCw, Flame, Zap, Mic, Disc, Heart, Piano, Radio, ListMusic,
  MoreHorizontal, User
} from "lucide-react";

const SEARCH_HISTORY_KEY = "mq-search-history";
const MAX_HISTORY = 15;

// ── Trending search terms ──
const TRENDING_SEARCHES = [
  "Поп", "Рок", "Хип-хоп", "Электроника", "Инди", "R&B", "Джаз",
];

// ── Cold-start catalog rotation (V2 §1.3): which genre feeds the
//    "Популярная музыка" discovery block on a fresh profile. Real catalog
//    data only — the rotation just gives it a curated feel per day. ──
const COLD_START_GENRES = ["Pop", "Rock", "Electronic", "Hip-Hop", "Jazz", "Classical", "R&B"];

// How many recent-search rows show before "Показать ещё" (§1.4)
const RECENT_ROWS_VISIBLE = 6;

// ── Genre to Russian label mapping ── (moved to lib/search-suggestions —
// GENRE_LABELS is the single source; re-exported here for the genre chips)
import { GENRE_LABELS as genreLabels } from "@/lib/search-suggestions";

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

// ── Genre accent text colors (DESIGN COMPLETION: muted neutral — genre
//    tags are metadata, not alerts; red stays reserved for rare accents) ──
const genreAccentColors: Record<string, string> = {
  "Pop": "var(--mq-text-muted)",
  "Rock": "var(--mq-text-muted)",
  "Electronic": "var(--mq-text-muted)",
  "Hip-Hop": "var(--mq-text-muted)",
  "Jazz": "var(--mq-text-muted)",
  "Classical": "var(--mq-text-muted)",
  "R&B": "var(--mq-text-muted)",
  "Indie": "var(--mq-text-muted)",
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
  const openSpotifyAlbum = useAppStore((s) => s.openSpotifyAlbum);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const likedTracksData = useAppStore((s) => s.likedTracksData);
  const [showFilters, setShowFilters] = useState(false);
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  /** V2: Spotify section above the alternative results (§16 — official
   *  catalog first when connected). */
  const [spotifyResults, setSpotifyResults] = useState<Track[]>([]);
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

  // Genre filter search
  const [genreTracks, setGenreTracks] = useState<Track[]>([]);
  const [isGenreLoading, setIsGenreLoading] = useState(false);

  // ── V2 multi-provider search state (Spotify catalog in parallel) ──
  const [spotifyTracks, setSpotifyTracks] = useState<CatalogTrackDTO[]>([]);
  const [spotifyArtists, setSpotifyArtists] = useState<CatalogArtistDTO[]>([]);
  const [spotifyAlbums, setSpotifyAlbums] = useState<CatalogAlbumDTO[]>([]);
  const [spotifyState, setSpotifyState] = useState<"idle" | "loading" | "ok" | "unavailable">("idle");

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
        setSpotifyResults([]);
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
          setSpotifyTracks([]);
          setSpotifyArtists([]);
          setSpotifyAlbums([]);
          setSpotifyState("idle");
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

      // ── V2 §17: catalog search in parallel. TWO layers, priority order:
      //  1. USER Spotify (PKCE, direct api.spotify.com) when connected —
      //     the official catalog with personal context; results carry
      //     spotifyUri for Spotify Official Playback (§16 priority).
      //  2. Server catalog (/api/catalog/search — Spotify client-credentials
      //     preferred, Deezer open fallback) for anonymous sessions.
      // Honest states: provider "none" → the server section simply doesn't
      // render and SoundCloud/Audius results remain fully functional.
      const spotifyConnected = useAppStore.getState().spotifyConnected;
      const trimmedQuery = searchQuery.trim();
      const userCatalogPromise: Promise<Track[]> = spotifyConnected
        ? searchAll(trimmedQuery, 20).then((r) => (r ? r.tracks : [])).catch(() => [] as Track[])
        : Promise.resolve([] as Track[]);

      setSpotifyState("loading");
      const spFetch = spotifyConnected
        ? userCatalogPromise.then((tracks) => {
            if (controller.signal.aborted) return;
            // User-connected search already returned Tracks — feed the
            // server-DTO section empty so the USER section renders alone
            // (avoid double-listing the same catalog).
            setSpotifyTracks([]);
            setSpotifyArtists([]);
            setSpotifyAlbums([]);
            setSpotifyState("idle");
            setSpotifyResults(tracks);
          })
        : fetch(`/api/catalog/search?q=${encodeURIComponent(searchQuery.trim())}&limit=8`, {
            signal: controller.signal,
          })
            .then(async (r) => {
              if (!r.ok) throw new Error("http");
              return (await r.json()) as {
                provider: "spotify" | "deezer" | "none";
                tracks: CatalogTrackDTO[];
                artists: CatalogArtistDTO[];
                albums: CatalogAlbumDTO[];
              };
            })
            .then((d) => {
              if (controller.signal.aborted) return;
              setSpotifyResults([]);
              if (d.provider === "none") {
                setSpotifyTracks([]);
                setSpotifyArtists([]);
                setSpotifyAlbums([]);
                setSpotifyState("unavailable");
                return;
              }
              setSpotifyTracks(d.tracks || []);
              setSpotifyArtists(d.artists || []);
              setSpotifyAlbums(d.albums || []);
              setSpotifyState("ok");
            })
            .catch(() => {
              if (controller.signal.aborted) return;
              setSpotifyTracks([]);
              setSpotifyArtists([]);
              setSpotifyAlbums([]);
              setSpotifyState("unavailable");
            });

      try {
        const params = new URLSearchParams({ q: searchQuery.trim() });
        const [res] = await Promise.all([
          fetch(`/api/music/search?${params}`, { signal: controller.signal }),
          spFetch,
        ]);
        if (!controller.signal.aborted && res.ok) {
          const data = await res.json();
          setSearchResults(data.tracks || []);
        }
        const query = searchQuery.trim();
        if (query) {
          const updated = [query, ...getSearchHistory().filter(h => h.toLowerCase() !== query.toLowerCase())].slice(0, MAX_HISTORY);
          saveSearchHistory(updated);
          setSearchHistory(updated);
        }
      } catch {
        if (!controller.signal.aborted) {
          setSearchResults([]);
          setSpotifyResults([]);
          setSpotifyTracks([]);
          setSpotifyArtists([]);
          setSpotifyAlbums([]);
          setSpotifyState("unavailable");
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

  const activeTracks = useMemo<Track[]>(() => {
    if (selectedGenre) return genreTracks;
    // ── V2 multi-provider merge: Spotify catalog tracks first, then
    // SoundCloud/Audius results deduped against them (pure, tested helper —
    // same canonical work across sources = one row; catalog identity wins,
    // playback still resolves to the best available audio source).
    return mergeSearchResults(spotifyTracks, searchResults);
  }, [selectedGenre, genreTracks, searchResults, spotifyTracks]);
  const activeLoading = selectedGenre ? isGenreLoading : isLoading;
  const activeHasSearched = selectedGenre || hasSearched;

  // ── W02: REAL suggestion sources (local data — instant, no API per keypress).
  // Everything shown in the dropdown comes from the user's actual state:
  // search history, listening history, favorite/recent artists, playlists,
  // the genre catalog. No invented "popular" lists. The list itself is
  // built by the pure, tested builder in lib/search-suggestions.ts.
  const storeHistory = useAppStore((s) => s.history);
  const favoriteArtists = useAppStore((s) => s.favoriteArtists);
  const userPlaylists = useAppStore((s) => s.playlists);
  const storePlayTrack = useAppStore((s) => s.playTrack);
  const storeSetSelectedArtist = useAppStore((s) => s.setSelectedArtist);
  const storeSetSelectedPlaylistId = useAppStore((s) => s.setSelectedPlaylistId);

  const suggestionTracks = useMemo<Track[]>(
    () => (Array.isArray(storeHistory) ? storeHistory : []).slice(0, 12).map((h) => h?.track).filter(Boolean),
    [storeHistory]
  );
  const suggestionArtists = useMemo(() => {
    const map = new Map<string, { name: string; avatar?: string; count: number }>();
    for (const a of favoriteArtists || []) {
      if (a?.username) map.set(a.username.toLowerCase(), { name: a.username, avatar: a.avatar, count: 99 });
    }
    for (const h of (Array.isArray(storeHistory) ? storeHistory : []).slice(0, 50)) {
      const name = h?.track?.artist;
      if (!name) continue;
      const key = name.toLowerCase();
      const entry = map.get(key);
      if (entry) { if (entry.count < 99) entry.count += 1; }
      else map.set(key, { name, avatar: h.track.cover, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  }, [storeHistory, favoriteArtists]);

  const suggestionItems = useMemo<SuggestionItem[]>(() => {
    return buildSuggestions({
      query: searchQuery,
      searchHistory,
      recentTracks: suggestionTracks.map((t) => ({
        id: t.id, title: t.title, artist: t.artist, cover: t.cover,
      })),
      artists: suggestionArtists,
      playlists: (userPlaylists || []).map((p) => ({
        id: p.id, name: p.name, trackCount: p.tracks?.length ?? 0,
      })),
    });
  }, [searchQuery, searchHistory, suggestionTracks, suggestionArtists, userPlaylists]);

  // Keyboard navigation over the suggestion list (-1 = none active; the
  // direct-search row for a non-empty query is index 0 when no matches).
  // Reset happens in the input onChange (no cascading-render effect); the
  // index is CLAMPED against the current list length at use time so a
  // stale selection can never go out of bounds.
  const [suggestionActive, setSuggestionActive] = useState(-1);
  const activeSuggestionIdx = Math.min(suggestionActive, suggestionItems.length - 1);

  const executeSuggestion = useCallback((item: SuggestionItem) => {
    setShowSuggestions(false);
    switch (item.kind) {
      case "search":
        setSearchQuery(item.label);
        searchInputRef.current?.focus();
        break;
      case "track":
        if (item.track) {
          // Play the FULL track object from the listening history (the
          // suggestion carries the slim source; the queue needs real
          // playback fields — match by id).
          const full = suggestionTracks.find((t) => t.id === item.track!.id);
          if (full) {
            const queue = (suggestionTracks.length ? suggestionTracks : [full]) as Track[];
            storePlayTrack(full, queue);
          }
        }
        break;
      case "artist":
        storeSetSelectedArtist({ name: item.label, avatar: item.cover });
        break;
      case "playlist":
        if (item.playlistId) {
          storeSetSelectedPlaylistId(item.playlistId);
          setView("playlists");
        }
        break;
      case "genre":
        if (item.genre) {
          setSelectedGenre(item.genre);
          setSearchQuery("");
        }
        break;
    }
  }, [suggestionTracks, storePlayTrack, storeSetSelectedArtist, storeSetSelectedPlaylistId, setSearchQuery, setSelectedGenre, setView]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestionItems.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSuggestionActive((i) => (i + 1) % suggestionItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSuggestionActive((i) => (i <= 0 ? suggestionItems.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (activeSuggestionIdx >= 0 && suggestionItems[activeSuggestionIdx]) {
        e.preventDefault();
        executeSuggestion(suggestionItems[activeSuggestionIdx]);
      }
      // -1 → default: let the debounced search handle the raw query
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setSuggestionActive(-1);
    }
  }, [showSuggestions, suggestionItems, activeSuggestionIdx, executeSuggestion]);

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

  // ═══ SEARCH REDESIGN (§3–§6): EDITORIAL DISCOVERY COMPOSITION ═══
  // Results are grouped client-side from the flat track list into
  // ARTISTS / ALBUMS / TOP RESULT / PLAYLIST MATCHES — each content type
  // gets its OWN visual density instead of an endless run of identical
  // cards. Pure derivation: no extra fetches, memoized, works for any
  // query and any source (SoundCloud / Audius / local files).

  interface ArtistGroup { name: string; cover?: string; count: number; topTrack: Track; catalogArtistId?: string; catalogProvider?: "spotify" | "deezer"; followers?: number }
  const artistGroups = useMemo<ArtistGroup[]>(() => {
    if (activeTracks.length === 0 && spotifyArtists.length === 0) return [];
    const map = new Map<string, ArtistGroup>();
    for (const t of activeTracks) {
      if (!t.artist?.trim()) continue;
      const key = t.artist.trim().toLowerCase();
      const g = map.get(key);
      if (g) { g.count += 1; if (!g.cover && t.cover) g.cover = t.cover; }
      else map.set(key, { name: t.artist.trim(), cover: t.cover, count: 1, topTrack: t });
    }
    // V2: enrich/insert REAL catalog artists (verified images, follower
    // counts, deep-linkable artist pages) — matched by name, else appended.
    // Follower-sorted: catalog search often returns duplicate/secondary
    // artist entries (e.g. regional duplicates) — the main profile wins.
    const catalogArtists = [...spotifyArtists]
      .sort((a, b) => (b.followers || 0) - (a.followers || 0))
      .slice(0, 6);
    for (const sp of catalogArtists) {
      const key = sp.name.trim().toLowerCase();
      const g = map.get(key);
      if (g) {
        g.catalogArtistId = sp.catalogId;
        g.catalogProvider = sp.provider;
        g.followers = sp.followers;
        if (sp.image) g.cover = sp.image;
      } else {
        map.set(key, {
          name: sp.name,
          cover: sp.image || undefined,
          count: 0,
          topTrack: activeTracks[0] ?? ({} as Track),
          catalogArtistId: sp.catalogId,
          catalogProvider: sp.provider,
          followers: sp.followers,
        });
      }
    }
    const all = [...map.values()];
    // Catalog-linked artists first (they open the full V2 artist page),
    // then by result dominance.
    return all
      .sort((a, b) => (b.catalogArtistId ? 1 : 0) - (a.catalogArtistId ? 1 : 0) || b.count - a.count)
      .slice(0, 8);
  }, [activeTracks, spotifyArtists]);

  const albumGroups = useMemo<{ album: string; artist: string; cover?: string; count: number; catalogAlbumId?: string; catalogProvider?: "spotify" | "deezer"; year?: string }[]>(() => {
    // V2: REAL catalog albums first — full cover art, year, clickable into
    // the full album page. SC-derived groups (album names on SC tracks)
    // remain as a fallback when the catalog is unavailable.
    const spAlbums = spotifyAlbums.slice(0, 5).map((al) => ({
      album: al.name,
      artist: al.artist,
      cover: al.image || undefined,
      count: al.totalTracks,
      catalogAlbumId: al.catalogId,
      catalogProvider: al.provider,
      year: al.year,
    }));
    if (spAlbums.length > 0) return spAlbums;
    if (activeTracks.length === 0) return [];
    const map = new Map<string, { album: string; artist: string; cover?: string; count: number }>();
    for (const t of activeTracks) {
      if (!t.album?.trim()) continue;
      const key = `${t.album.trim().toLowerCase()}|${(t.artist || "").toLowerCase()}`;
      const g = map.get(key);
      if (g) { g.count += 1; if (!g.cover && t.cover) g.cover = t.cover; }
      else map.set(key, { album: t.album.trim(), artist: t.artist || "", cover: t.cover, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [activeTracks, spotifyAlbums]);

  const playlistMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return (userPlaylists || [])
      .filter((p) => p?.name?.toLowerCase().includes(q))
      .slice(0, 4);
  }, [userPlaylists, searchQuery]);

  // TOP RESULT: the artist dominating the results (≥2 tracks) wins —
  // otherwise the first (most relevant) track.
  const topResult = useMemo<{
    kind: "artist"; artist: ArtistGroup;
  } | {
    kind: "track"; track: Track;
  } | null>(() => {
    if (activeTracks.length === 0 && artistGroups.length === 0) return null;
    // V2: a Spotify-linked artist (verified page) wins the hero slot;
    // otherwise the artist dominating the results (≥2 tracks), else the
    // first (most relevant) track.
    const catalogArtist = artistGroups.find((a) => a.catalogArtistId);
    if (catalogArtist) return { kind: "artist", artist: catalogArtist };
    const best = artistGroups[0];
    if (best && best.count >= 2) return { kind: "artist", artist: best };
    if (activeTracks.length === 0) return null;
    return { kind: "track", track: activeTracks[0] };
  }, [artistGroups, activeTracks]);

  // Top tracks preview — the 4 most relevant rows next to the top card
  const previewTracks = useMemo(() => processedTracks.slice(0, 4), [processedTracks]);

  // Discovery rows (empty state §9): real listening history, no invention
  const discoveryTracks = useMemo<Track[]>(
    () => (Array.isArray(storeHistory) ? storeHistory : []).slice(0, 20).map((h) => h?.track).filter(Boolean).slice(0, 6),
    [storeHistory]
  );

  // ═══ SEARCH HOME (V2 §1) — the BEFORE-QUERY discovery composition ═══
  // The featured anchor + compact rows + light strips. Everything derives
  // from REAL user state; the cold start (no history/likes/searches)
  // pulls real tracks from the genre catalog (rotates by day — a curated
  // feel without inventing data).
  const isColdStart =
    searchHistory.length === 0 &&
    quickPicks.length === 0 &&
    discoveryTracks.length === 0 &&
    suggestionArtists.length === 0;

  const [coldTracks, setColdTracks] = useState<Track[]>([]);
  // default TRUE: the cold start begins fetching immediately — no sync
  // setState in the effect body (react-compiler cascading-render rule);
  // the flag only ever turns false (after load/retry/give-up) or stays
  // unused once the profile turns out to be warm (isColdStart false).
  const [coldLoading, setColdLoading] = useState(true);
  useEffect(() => {
    if (!isColdStart) return;
    let cancelled = false;
    const genre = COLD_START_GENRES[new Date().getDate() % COLD_START_GENRES.length];
    const load = async (retry: boolean) => {
      let willRetry = false;
      try {
        const res = await fetch(`/api/music/genre?genre=${encodeURIComponent(genre)}`);
        if (!cancelled) {
          if (res.ok) {
            const data = await res.json();
            const tracks = ((data.tracks || []) as Track[]).slice(0, 6);
            setColdTracks(tracks);
            // Transient failure (e.g. rate-limit hiccup): one quiet retry so
            // the cold start keeps its anchor instead of degrading silently.
            willRetry = tracks.length === 0 && retry;
          } else {
            willRetry = retry;
          }
        }
      } catch {
        willRetry = !cancelled && retry;
      }
      if (cancelled) return;
      if (willRetry) {
        setTimeout(() => { if (!cancelled) load(false); }, 2500);
      } else {
        setColdLoading(false);
      }
    };
    load(true);
    return () => { cancelled = true; };
  }, [isColdStart]);

  // Featured discovery item (§1.2): the last played track (warm state) or
  // the catalog pick (cold start). The editorial anchor of Search Home.
  const featuredTrack = discoveryTracks[0] || coldTracks[0] || null;
  // Rows beside the featured card — history (warm) or catalog (cold)
  const featuredRows = useMemo(
    () => (discoveryTracks.length > 0 ? discoveryTracks.slice(1, 5) : coldTracks.slice(1, 6)),
    [discoveryTracks, coldTracks]
  );
  const featuredEyebrow = discoveryTracks.length > 0 ? "Продолжить слушать" : "Из популярного";
  const featuredSectionTitle = discoveryTracks.length > 0 ? "Слушали недавно" : "Популярная музыка";

  // Recent searches — compact rows (§1.4), expandable past the visible cut
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Full tracks section visible only when there are more than the preview
  const fullTracks = processedTracks;
  const hasEditorialTop = !activeLoading && !!topResult && (searchQuery.trim().length > 0 || !!selectedGenre);

  // ── Main Search View ──
  return (
    <div className={`${compactMode ? "p-3 sm:p-4 lg:p-5 pb-[var(--mq-player-clearance)] sm:pb-32 lg:pb-32 space-y-4" : "p-4 sm:p-5 lg:p-6 pb-[var(--mq-player-clearance)] sm:pb-36 lg:pb-36 space-y-5"} max-w-[var(--mq-container-base)] lg:max-w-[var(--mq-container-wide)] mx-auto relative mq-anim-fade-in`} style={{ scrollBehavior: "smooth" }}>
      {/* Upload progress toast */}
      {uploadProgress && (
        <motion.div initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[90vw] max-w-md">
          <div className="rounded-[var(--mq-r-card)] p-4" style={{ backgroundColor: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)", boxShadow: "var(--mq-elev-dialog)", color: "var(--mq-text)" }}>
            <div className="flex items-center gap-3 mb-2">
              {uploadProgress.status === "uploading" && <Loader2 className="w-5 h-5 flex-shrink-0 animate-spin" style={{ color: "var(--mq-text-muted)" }} />}
              {uploadProgress.status === "done" && <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: "var(--mq-success)" }} />}
              {uploadProgress.status === "error" && uploadProgress.failCount > 0 && <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: "var(--mq-warning)" }} />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{uploadProgress.status === "uploading" ? `Загрузка ${uploadProgress.current}/${uploadProgress.total}...` : `${uploadProgress.successCount} загружено`}</p>
                <p className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{uploadProgress.fileName}</p>
              </div>
            </div>
            {uploadProgress.status === "uploading" && (
              <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 6%, transparent)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: "100%", transform: `scaleX(${(uploadProgress.fileProgress || 0) / 100})`, transformOrigin: "left", willChange: "transform", background: "var(--mq-platinum-progress)" }} />
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Page header — editorial voice: display serif + meta hint ── */}
      <div className="flex items-baseline justify-between mb-1">
        <h1 className="mq-t-display text-[26px] sm:text-[30px]" style={{ color: "var(--mq-text)" }}>Поиск</h1>
        <p className="mq-t-meta text-xs hidden sm:block">Треки · артисты · альбомы · свои файлы</p>
      </div>

      {/* ── Search bar ── */}
      {/* v72 mobile: field takes the FULL width; Фильтры/Загрузить move to
          a compact 40px action row underneath (lg+ keeps the one-row layout).
          Focus = neutral elevation (accent border read as an error state).
          WEB/DESKTOP SPLIT: only the desktop shell (TopBar inside the content
          area) needs the --mq-topbar-h sticky offset; web sticks at top-0
          right under the NavBar card, as before the v72 desktop redesign. */}
      <motion.div initial={animationsEnabled ? { opacity: 0, y: -8 } : undefined} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className={"sticky top-0 z-20 -mx-3 sm:-mx-4 lg:-mx-5 px-3 sm:px-4 lg:px-5 py-2.5" + (isDesktopApp() ? " lg:top-[var(--mq-topbar-h)]" : "")}
        /* V2 §20: the sticky strip is a FLOATING surface — translucent glass
           (inline blur: Lightning strips it from stylesheets) so the
           theme-aware ambient shows through it in EVERY search state. */
        style={{
          backgroundColor: "color-mix(in srgb, var(--mq-bg) 86%, transparent)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}>
        <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px]" style={{ color: isFocused ? "var(--mq-text)" : "var(--mq-text-muted)", transition: "color 0.25s ease" }} />
          <Input
            ref={searchInputRef}
            data-search-input
            placeholder="Треки, артисты, альбомы…"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              // Reset hasSearched so suggestions show again while typing;
              // fresh query → fresh keyboard cursor (no cascading effect).
              setHasSearched(false);
              setSuggestionActive(-1);
              // Show suggestions immediately when there's a query
              if (e.target.value.trim()) setShowSuggestions(true);
            }}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => {
              setIsFocused(true);
              // Cancel any pending hide timer, show suggestions if there's a query
              if (suggestionsHideTimer.current) {
                clearTimeout(suggestionsHideTimer.current);
                suggestionsHideTimer.current = null;
              }
              // W02: show REAL recents on focus even with an empty query
              setShowSuggestions(true);
            }}
            onBlur={() => {
              setIsFocused(false);
              // Delay hiding suggestions so clicking on a suggestion works
              // (click fires after blur). 200ms is enough for click to register.
              suggestionsHideTimer.current = setTimeout(() => {
                setShowSuggestions(false);
              }, 200);
            }}
            className="pl-11 pr-11 h-[48px] lg:h-[46px] text-[15px] mq-t-section font-medium"
            style={{
              backgroundColor: "var(--mq-surface-1)",
              borderRadius: "var(--mq-mat-radius, 14px)",
              border: isFocused ? "1.5px solid color-mix(in srgb, var(--mq-text) 30%, transparent)" : "1px solid var(--mq-edge)",
              color: "var(--mq-text)",
              boxShadow: isFocused ? "0 1px 8px color-mix(in srgb, var(--mq-text) 8%, transparent)" : "none",
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
                style={{ backgroundColor: "var(--mq-platinum-hi)" }}
              />
            </motion.div>
          )}
          {searchQuery && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}

              onClick={handleClearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center mq-icon-btn"
              style={{ ["--mq-rest-bg" as string]: "color-mix(in srgb, var(--mq-text) 8%, transparent)", color: "var(--mq-text-muted)" }}
            >
              <X className="w-3.5 h-3.5" />
            </motion.button>
          )}
        </div>

        {/* Filter toggle — quiet icon button, accent when active.
            v72: hidden on mobile in this row (moved to the action row below). */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="hidden lg:flex w-11 h-11 rounded-[var(--mq-r-card-lg)] items-center justify-center transition-colors duration-150 mt-[1px]"
          style={{
            backgroundColor: showFilters || selectedGenre ? "color-mix(in srgb, var(--mq-text) 9%, transparent)" : "var(--mq-surface-1)",
            color: showFilters || selectedGenre ? "var(--mq-text)" : "var(--mq-text-muted)",
            border: "1px solid " + (showFilters || selectedGenre ? "color-mix(in srgb, var(--mq-platinum-hi) 26%, transparent)" : "var(--mq-edge)"),
          }}
          aria-label="Фильтры"
          aria-expanded={showFilters}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        {/* Upload button — v72: hidden on mobile in this row (moved below) */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="hidden lg:flex w-11 h-11 rounded-[var(--mq-r-card-lg)] items-center justify-center transition-colors duration-150 mt-[1px]"
          style={{
            backgroundColor: "var(--mq-surface-1)",
            color: isUploading ? "var(--mq-text)" : "var(--mq-text-muted)",
            border: "1px solid var(--mq-edge)",
          }}
          aria-label="Загрузить файлы"
        >
          <Upload className={`w-4 h-4 ${isUploading ? "animate-pulse" : ""}`} />
        </button>
        <input ref={fileInputRef} type="file" accept="audio/*" multiple onChange={handleFileUpload} className="hidden" />
        </div>

        {/* v72 mobile action row — Фильтры + Загрузить файлы (40px targets,
            right-aligned, same quiet styling). lg:hidden. */}
        <div className="flex lg:hidden items-center justify-end gap-2 mt-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="h-11 px-4 rounded-[var(--mq-r-card)] flex items-center gap-1.5 transition-colors duration-150"
            style={{
              backgroundColor: showFilters || selectedGenre ? "color-mix(in srgb, var(--mq-text) 9%, transparent)" : "var(--mq-surface-1)",
              color: showFilters || selectedGenre ? "var(--mq-text)" : "var(--mq-text-muted)",
              border: "1px solid " + (showFilters || selectedGenre ? "color-mix(in srgb, var(--mq-platinum-hi) 26%, transparent)" : "var(--mq-edge)"),
            }}
            aria-label="Фильтры"
            aria-expanded={showFilters}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="mq-t-label text-[11px] font-semibold">Фильтры</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="h-11 px-4 rounded-[var(--mq-r-card)] flex items-center gap-1.5 transition-colors duration-150"
            style={{
              backgroundColor: "var(--mq-surface-1)",
              color: isUploading ? "var(--mq-text)" : "var(--mq-text-muted)",
              border: "1px solid var(--mq-edge)",
            }}
            aria-label="Загрузить файлы"
          >
            <Upload className={`w-4 h-4 ${isUploading ? "animate-pulse" : ""}`} />
            <span className="mq-t-label text-[11px] font-semibold">Файлы</span>
          </button>
        </div>
      </motion.div>

      {/* ── Search suggestions — autocomplete-style dropdown (W02) ──
          REAL sources only: search history, listening history tracks,
          favorite/recent artists, user playlists, genre catalog, plus the
          direct-search row for the current query. Shown on focus (useful
          recents even with an empty query) and while typing (matches).
          Keyboard: ↓/↑ move, Enter selects, Esc closes (input handler). */}
      <AnimatePresence>
        {showSuggestions && !selectedGenre && suggestionItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="relative z-30 -mx-3 sm:-mx-4 lg:-mx-5 px-3 sm:px-4 lg:px-5"
          >
            <SearchSuggestions
              query={searchQuery.trim()}
              items={suggestionItems}
              activeIndex={activeSuggestionIdx}
              onHover={setSuggestionActive}
              onSelect={(item) => {
                if (suggestionsHideTimer.current) {
                  clearTimeout(suggestionsHideTimer.current);
                  suggestionsHideTimer.current = null;
                }
                executeSuggestion(item);
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
                    backgroundColor: !selectedGenre ? "color-mix(in srgb, var(--mq-text) 11%, var(--mq-bg))" : "var(--mq-surface-1)",
                    color: !selectedGenre ? "var(--mq-text)" : "var(--mq-text-muted)",
                    border: "1px solid " + (!selectedGenre ? "color-mix(in srgb, var(--mq-platinum-hi) 30%, transparent)" : "var(--mq-edge)"),
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
                        backgroundColor: isSelected ? "color-mix(in srgb, var(--mq-text) 11%, var(--mq-bg))" : "var(--mq-surface-1)",
                        color: isSelected ? "var(--mq-text)" : "var(--mq-text-muted)",
                        border: "1px solid " + (isSelected ? "color-mix(in srgb, var(--mq-platinum-hi) 30%, transparent)" : "var(--mq-edge)"),
                      }}
                    >
                      <span style={{ color: isSelected ? "var(--mq-text)" : "var(--mq-text-muted)", opacity: isSelected ? 1 : 0.75 }}>
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
              <h3 className="mq-section-title">
                {selectedGenre ? (genreLabels[selectedGenre] || selectedGenre) : "Результаты"}
              </h3>
              <span className="mq-t-num mq-t-body" style={{ color: "var(--mq-text-muted)" }}>
                {activeTracks.length} {activeTracks.length === 1 ? "трек" : activeTracks.length < 5 ? "трека" : "треков"}
              </span>
            </div>
            <button
              onClick={handlePlayAll}
              className="mq-platinum-btn flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors duration-150"
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
      {!activeLoading && activeHasSearched && activeTracks.length === 0 && spotifyResults.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          className="mq-empty mq-empty-anim mq-empty-anim"
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


      {/* ── V2 SPOTIFY SECTION — official catalog first when connected (§16) ── */}
      {!activeLoading && !selectedGenre && spotifyResults.length > 0 && (
        <ScrollReveal>
          <div className="flex items-center gap-2 mb-2 px-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: "#1db954" }} aria-hidden />
            <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--mq-text)" }}>
              Spotify · {spotifyResults.length}
            </h3>
            <span className="mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>
              официальный каталог
            </span>
          </div>
          <div className="space-y-1.5">
            {spotifyResults.slice(0, 12).map((track, i) => (
              <TrackCard key={track.id} track={track} index={i} queue={spotifyResults} />
            ))}
          </div>
        </ScrollReveal>
      )}

      {/* ── Track results with filter/sort toolbar ── */}

      {/* ═══ RESULTS — EDITORIAL DISCOVERY COMPOSITION (§4–§6) ═══
          Mixed density, NOT card-card-card: a hero TOP RESULT, clean track
          rows, artist rows, compact album tiles and playlist matches —
          each content type with its OWN visual weight. */}
      {!activeLoading && hasEditorialTop && topResult && (
        <div className="space-y-7">
          {/* ── Top block: hero result + track preview rows ── */}
          <div className="grid lg:grid-cols-12 gap-5 lg:gap-6 items-start">
            <div className="lg:col-span-5">
              <TopResultCard
                result={topResult}
                onArtistClick={(name, cover, catId, catProv) => setSelectedArtist({ name, avatar: cover, catalogArtistId: catId, catalogProvider: catProv })}
                onPlay={playTrack}
              />
            </div>
            <div className="lg:col-span-7 min-w-0">
              <div className="flex items-baseline justify-between mb-1.5 px-1">
                <h3 className="mq-t-shelf">Треки</h3>
                <span className="mq-t-meta-2 mq-t-num" style={{ color: "var(--mq-text-muted)" }}>{fullTracks.length}</span>
              </div>
              <div className="space-y-0.5">
                {previewTracks.map((track, i) => (
                  <motion.div
                    key={track.id + "_" + i}
                    initial={{ opacity: 0, y: 6 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.1 }}
                    transition={{ duration: 0.2, delay: Math.min(i * 0.015, 0.15), ease: "easeOut" }}
                  >
                    <SearchTrackRow
                      track={track}
                      index={i}
                      queue={fullTracks}
                      onArtistClick={(name, cover, catId, catProv) => setSelectedArtist({ name, avatar: cover, catalogArtistId: catId, catalogProvider: catProv })}
                    />
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          {/* ── АРТИСТЫ — clean rows ── */}
          {artistGroups.length >= 2 && (
            <section>
              <div className="flex items-baseline justify-between mb-1.5 px-1">
                <h3 className="mq-t-shelf">Артисты</h3>
                <span className="mq-t-meta-2 mq-t-num" style={{ color: "var(--mq-text-muted)" }}>{artistGroups.length}</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1">
                {artistGroups.map((a, i) => (
                  <motion.button
                    key={a.name}
                    initial={animationsEnabled ? { opacity: 0, y: 6 } : undefined}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.1 }}
                    transition={{ duration: 0.2, delay: Math.min(i * 0.015, 0.12), ease: "easeOut" }}
                    onClick={() => setSelectedArtist({ name: a.name, avatar: a.cover, catalogArtistId: a.catalogArtistId, catalogProvider: a.catalogProvider })}
                    className="mq-row group"
                  >
                    <span className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 mq-art flex items-center justify-center" style={{ backgroundColor: "var(--mq-surface-2)" }}>
                      {a.cover ? (
                        <img src={a.cover} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                      ) : (
                        <User className="w-[18px] h-[18px]" style={{ color: "var(--mq-text-muted)" }} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{a.name}</span>
                      <span className="block mq-t-meta-2 truncate" style={{ color: "var(--mq-text-muted)" }}>
                        Артист ·{" "}
                        {a.followers != null && a.followers > 0
                          ? `${Intl.NumberFormat("ru-RU").format(a.followers)} слушателей`
                          : `${a.count} ${a.count === 1 ? "трек" : a.count < 5 ? "трека" : "треков"}`}
                      </span>
                    </span>
                    <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: "var(--mq-text-muted)" }} />
                  </motion.button>
                ))}
              </div>
            </section>
          )}

          {/* ── АЛЬБОМЫ — compact tiles ── */}
          {albumGroups.length >= 2 && (
            <section>
              <div className="flex items-baseline justify-between mb-2.5 px-1">
                <h3 className="mq-t-shelf">Альбомы</h3>
                <span className="mq-t-meta-2 mq-t-num" style={{ color: "var(--mq-text-muted)" }}>{albumGroups.length}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {albumGroups.map((al, i) => (
                  <motion.button
                    key={al.album + "|" + al.artist}
                    initial={animationsEnabled ? { opacity: 0, y: 6 } : undefined}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.1 }}
                    transition={{ duration: 0.2, delay: Math.min(i * 0.015, 0.12), ease: "easeOut" }}
                    onClick={() => {
                      // V2: real catalog album → full album page context.
                      if (al.catalogAlbumId && al.catalogProvider) {
                        openSpotifyAlbum({
                          provider: al.catalogProvider,
                          id: `${al.catalogProvider === "deezer" ? "dzl" : "spl"}_${al.catalogAlbumId}`,
                          catalogId: al.catalogAlbumId,
                          name: al.album,
                          artist: al.artist,
                          image: al.cover || "",
                          year: al.year,
                          albumType: "album",
                          totalTracks: al.count,
                          totalDurationSec: 0,
                        });
                        return;
                      }
                      handleTrendingClick(al.artist || al.album);
                    }}
                    className="text-left group"
                  >
                    <span className="block aspect-square rounded-[var(--mq-r-card)] overflow-hidden mb-2 mq-art" style={{ backgroundColor: "var(--mq-surface-2)", boxShadow: "var(--mq-mat-2-shadow)" }}>
                      {al.cover ? (
                        <img src={al.cover} alt="" className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" loading="lazy" draggable={false} />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center">
                          <Disc className="w-6 h-6" style={{ color: "var(--mq-text-muted)" }} />
                        </span>
                      )}
                    </span>
                    <span className="block text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{al.album}</span>
                    <span className="block mq-t-meta-2 truncate" style={{ color: "var(--mq-text-muted)" }}>
                      {al.artist || "Альбом"}
                      {al.year ? ` · ${al.year}` : ""}
                      {al.catalogAlbumId ? " · Альбом" : ` · ${al.count} ${al.count === 1 ? "трек" : al.count < 5 ? "трека" : "треков"}`}
                    </span>
                  </motion.button>
                ))}
              </div>
            </section>
          )}

          {/* ── ВАШИ ПЛЕЙЛИСТЫ — compact match cards ── */}
          {playlistMatches.length > 0 && (
            <section>
              <div className="flex items-baseline justify-between mb-1.5 px-1">
                <h3 className="mq-t-shelf">Ваши плейлисты</h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-1">
                {playlistMatches.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { storeSetSelectedPlaylistId(p.id); setView("playlists"); }}
                    className="mq-row group"
                  >
                    <span className="w-11 h-11 rounded-[var(--mq-r-art)] overflow-hidden flex-shrink-0 mq-art flex items-center justify-center" style={{ backgroundColor: "var(--mq-surface-2)" }}>
                      {p.cover ? (
                        <img src={p.cover} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                      ) : (
                        <ListMusic className="w-[18px] h-[18px]" style={{ color: "var(--mq-text-muted)" }} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{p.name}</span>
                      <span className="block mq-t-meta-2 truncate" style={{ color: "var(--mq-text-muted)" }}>
                        Плейлист · {p.tracks?.length ?? 0} {p.tracks?.length === 1 ? "трек" : "треков"}
                      </span>
                    </span>
                    <ChevronRight className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: "var(--mq-text-muted)" }} />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Все треки — the deep list with filter/sort toolbar ── */}      {!activeLoading && processedTracks.length > 0 && (
        <div>
          {/* Section header with filter + sort controls */}
          <div className="flex items-center justify-between mb-3 px-1 flex-wrap gap-2">
            <h3 className="mq-t-shelf">
              Все треки · {processedTracks.length}
            </h3>
            <div className="flex items-center gap-1.5">
              {/* Duration filter dropdown */}
              <select
                value={filterDuration}
                onChange={(e) => setFilterDuration(e.target.value as "all" | "short" | "medium" | "long")}
                className="mq-t-meta-2 font-medium px-2 py-1 rounded-lg cursor-pointer outline-none"
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
                className="mq-t-meta-2 font-medium px-2 py-1 rounded-lg cursor-pointer outline-none"
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

          {/* Track list — calm 200ms rise-in (§19: 150–250ms, no 3D) */}
          <div className="space-y-0.5">
            {processedTracks.map((track, i) => (
              <motion.div
                key={track.id + "_" + i}
                initial={{ opacity: 0, y: 6 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.012, 0.18), ease: "easeOut" }}
              >
                <SearchTrackRow
                  track={track}
                  index={i}
                  queue={processedTracks}
                  onArtistClick={(name, cover, catId, catProv) => setSelectedArtist({ name, avatar: cover, catalogArtistId: catId, catalogProvider: catProv })}
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}


      {/* ═══ SEARCH HOME (V2 §1) — BEFORE QUERY: MUSIC DISCOVERY ═══
          Not an empty page: an editorial composition with ONE featured
          anchor + compact rows + light horizontal strips — different
          densities, real data only (history / likes / artists / catalog).
          Cold start (fresh profile) = real catalog tracks + genre
          shortcuts + popular queries — a finished product from minute one.
          Exits with a 180ms rise-out so BEFORE → typing → RESULTS reads as
          ONE search experience (no jump to a different site). */}
      <AnimatePresence>
        {!activeHasSearched && !activeLoading && !searchQuery.trim() && !selectedGenre && (
          <motion.div
            key="mq-search-home"
            initial={animationsEnabled ? { opacity: 0, y: 8 } : undefined}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
            className="space-y-8"
          >
            {/* ── 1. THE ANCHOR — featured item + compact rows (mixed density) ── */}
            {(featuredTrack || (isColdStart && coldLoading)) && (
              <section>
                <div className="grid lg:grid-cols-12 gap-5 lg:gap-6 items-start">
                  {/* Featured card — the main discovery item */}
                  <div className="lg:col-span-5 order-1">
                    {featuredTrack ? (
                      <DiscoveryFeaturedCard
                        track={featuredTrack}
                        eyebrow={featuredEyebrow}
                        onPlay={() => playTrack(featuredTrack, featuredRows.length > 0 ? [featuredTrack, ...featuredRows] : [featuredTrack])}
                      />
                    ) : (
                      <div className="mq-card-feature p-5" aria-hidden="true">
                        <div className="flex items-center gap-4">
                          <Skeleton className="w-[104px] h-[104px] rounded-[var(--mq-r-card)] flex-shrink-0" />
                          <div className="flex-1 space-y-3">
                            <Skeleton className="h-3 w-20" />
                            <Skeleton className="h-5 w-4/5" />
                            <Skeleton className="h-3 w-1/2" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Compact rows beside the anchor */}
                  {(featuredRows.length > 0 || (isColdStart && coldLoading && discoveryTracks.length === 0)) && (
                  <div className="lg:col-span-7 min-w-0 order-2">
                    <div className="flex items-baseline justify-between mb-1.5 px-1">
                      <h2 className="mq-t-shelf" style={{ color: "var(--mq-text)" }}>{featuredSectionTitle}</h2>
                      {(isColdStart && coldLoading && discoveryTracks.length === 0) && <span className="mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>загружаем…</span>}
                    </div>
                    <div className="space-y-0.5">
                      {((isColdStart && coldLoading && discoveryTracks.length === 0)
                        ? Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-[var(--mq-r-card)]" style={{ backgroundColor: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)" }}>
                              <Skeleton className="w-12 h-12 rounded-[var(--mq-r-art)] flex-shrink-0" />
                              <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-2/5" /></div>
                            </div>
                          ))
                        : featuredRows.map((track, i) => (
                            <SearchTrackRow
                              key={track.id + "_" + i}
                              track={track}
                              index={i}
                              queue={featuredRows}
                              onArtistClick={(name, cover, catId, catProv) => setSelectedArtist({ name, avatar: cover, catalogArtistId: catId, catalogProvider: catProv })}
                            />
                          ))
                      )}
                    </div>
                  </div>
                  )}
                </div>
              </section>
            )}

            {/* ── 2. НЕДАВНИЕ ЗАПРОСЫ — compact rows, not pills (§1.4) ── */}
            {searchHistory.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-1 px-1">
                  <h2 className="mq-t-shelf" style={{ color: "var(--mq-text)" }}>Недавние запросы</h2>
                  <button
                    onClick={handleClearHistory}
                    className="mq-hit44 mq-t-meta-2 font-medium px-2.5 py-1.5 rounded-lg transition-colors hover:bg-[var(--mq-overlay-hover)]"
                    style={{ color: "var(--mq-text-muted)" }}
                    aria-label="Очистить историю запросов"
                  >
                    Очистить
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 sm:gap-x-8">
                  {(historyExpanded ? searchHistory : searchHistory.slice(0, RECENT_ROWS_VISIBLE)).map((query) => (
                    <div
                      key={query}
                      className="flex items-center gap-1 recent-search-row group"
                      style={{ borderBottom: "1px solid var(--mq-border-hairline, color-mix(in srgb, var(--mq-text) 6%, transparent))" }}
                    >
                      <Clock className="w-3.5 h-3.5 flex-shrink-0 ml-1 pointer-events-none" style={{ color: "var(--mq-text-muted)", opacity: 0.55 }} />
                      <button
                        onClick={() => handleHistoryClick(query)}
                        className="flex-1 min-w-0 text-left py-3 pr-2 text-sm font-medium truncate transition-colors"
                        style={{ color: "var(--mq-text)" }}
                      >
                        {query}
                      </button>
                      <button
                        onClick={() => handleRemoveHistoryItem(query)}
                        className="mq-hit44 w-9 h-9 my-1 mr-1 rounded-full flex items-center justify-center flex-shrink-0 transition-colors sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
                        style={{ color: "var(--mq-text-muted)" }}
                        aria-label={`Удалить запрос «${query}» из истории`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                {searchHistory.length > RECENT_ROWS_VISIBLE && (
                  <button
                    onClick={() => setHistoryExpanded((v) => !v)}
                    className="mq-hit44 mt-2.5 px-2 py-1.5 -ml-2 rounded-lg mq-t-meta font-semibold transition-colors hover:bg-[var(--mq-overlay-hover)]"
                    style={{ color: "var(--mq-text-muted)" }}
                  >
                    {historyExpanded ? "Свернуть" : `Показать ещё (${searchHistory.length - RECENT_ROWS_VISIBLE})`}
                  </button>
                )}
              </section>
            )}

            {/* ── 3. БЫСТРЫЙ ДОСТУП — light liked tiles (§1.5: lighter than results) ── */}
            {quickPicks.length > 0 && (
              <section>
                <div className="flex items-center gap-2.5 mb-2.5 px-1">
                  <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
                  <h2 className="mq-t-shelf" style={{ color: "var(--mq-text)" }}>Быстрый доступ</h2>
                  <button
                    onClick={() => setQuickPicksSeed(s => s + 1)}
                    className="mq-hit44 ml-auto p-2.5 rounded-lg transition-colors hover:bg-[var(--mq-overlay-hover)] flex-shrink-0"
                    style={{ color: "var(--mq-text-muted)" }}
                    title="Обновить"
                    aria-label="Обновить"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {quickPicks.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => playTrack(track, quickPicks)}
                      className="flex items-center gap-2.5 p-2 rounded-[var(--mq-r-card)] text-left cursor-pointer group transition-colors duration-150"
                      style={{ backgroundColor: "var(--mq-mat-1-bg)", border: "1px solid var(--mq-card-sm-edge)" }}
                    >
                      <div className="w-9 h-9 rounded-[var(--mq-r-art)] overflow-hidden flex-shrink-0 mq-art">
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
                        <p className="mq-t-meta-2 truncate mq-t-meta">{track.artist}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* ── 4. АРТИСТЫ РЯДОМ — light horizontal strip (tiny artwork, §1.5) ── */}
            {suggestionArtists.length >= 3 && (
              <section>
                <div className="flex items-baseline justify-between mb-3 px-1">
                  <h2 className="mq-t-shelf" style={{ color: "var(--mq-text)" }}>Артисты рядом</h2>
                  <span className="mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>из твоей музыки</span>
                </div>
                <div
                  className="flex gap-4 sm:gap-5 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
                >
                  {suggestionArtists.slice(0, 10).map((a) => (
                    <button
                      key={a.name}
                      onClick={() => setSelectedArtist({ name: a.name, avatar: a.avatar })}
                      className="flex flex-col items-center gap-2 flex-shrink-0 w-[76px] pt-1 pb-1 rounded-[var(--mq-r-card)] transition-colors hover:bg-[var(--mq-overlay-hover)]"
                      style={{ minHeight: 44 }}
                    >
                      <span className="w-14 h-14 rounded-full overflow-hidden mq-art flex items-center justify-center" style={{ backgroundColor: "var(--mq-surface-2)", boxShadow: "var(--mq-art-edge)" }}>
                        {a.avatar ? (
                          <img src={a.avatar} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                        ) : (
                          <User className="w-5 h-5" style={{ color: "var(--mq-text-muted)" }} />
                        )}
                      </span>
                      <span className="w-full text-center">
                        <span className="block text-xs font-semibold truncate" style={{ color: "var(--mq-text)" }}>{a.name}</span>
                        <span className="block mq-t-meta-2 truncate" style={{ color: "var(--mq-text-muted)" }}>
                          {a.count >= 99 ? "в избранном" : `${a.count} в истории`}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* ── 5. ОБЗОР ЖАНРОВ — catalog shortcuts (cold start §1.3) ── */}
            {isColdStart && (
              <section>
                <div className="flex items-baseline justify-between mb-2.5 px-1">
                  <h2 className="mq-t-shelf" style={{ color: "var(--mq-text)" }}>Обзор жанров</h2>
                  <span className="mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>каталог MQ</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {genresList.map((g) => (
                    <button
                      key={g}
                      onClick={() => { setSelectedGenre(g); setSearchQuery(""); if (searchInputRef.current) searchInputRef.current.blur(); }}
                      className="flex items-center gap-3 p-3 rounded-[var(--mq-r-card)] text-left transition-colors duration-150"
                      style={{ backgroundColor: "var(--mq-mat-1-bg)", border: "1px solid var(--mq-card-sm-edge)", minHeight: 44 }}
                    >
                      <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 6%, transparent)", color: "var(--mq-text-muted)" }}>
                        {genreIcons[g] || <Music className="w-4 h-4" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{genreLabels[g] || g}</span>
                        <span className="block mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>жанр</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* ── 6. ПОПУЛЯРНЫЕ ЗАПРОСЫ — the lightest layer, editorial chips ── */}
            <section>
              <div className="flex items-center gap-2 mb-2.5 px-1">
                <TrendingUp className="w-4 h-4" style={{ color: "var(--mq-text-muted)", opacity: 0.8 }} />
                <h2 className="mq-t-shelf" style={{ color: "var(--mq-text)" }}>Популярные запросы</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {TRENDING_SEARCHES.map((term) => (
                  <button
                    key={term}
                    onClick={() => handleTrendingClick(term)}
                    className="mq-hit44 px-4 py-2 rounded-full text-xs font-medium bg-[var(--mq-card)] hover:bg-[var(--mq-card-hover)] transition-colors duration-150 cursor-pointer"
                    style={{ color: "var(--mq-text-muted)", border: "1px solid var(--mq-border-thin)" }}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

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
  onArtistClick?: (artistName: string, coverUrl?: string, catalogArtistId?: string, catalogProvider?: "spotify" | "deezer") => void;
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
            <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>
              {track.title}
            </p>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            {/* §E v69 duration contract: artist is the ONLY flexible element
                (flex-1 + min-w-0 → truncates); duration and genre tails are
                shrink-0 + nowrap — they can never be squeezed, wrapped, or
                clipped by a pathological title/artist. */}
            <button
              onClick={(e) => { e.stopPropagation(); onArtistClick?.(track.artist, track.cover, track.catalogArtistId, track.catalogProvider); }}
              className="text-xs flex-1 min-w-0 text-left truncate hover:underline"
              style={{ color: "var(--mq-text-muted)" }}
            >
              {track.artist}
            </button>
            {/* V2: provider attribution — catalog (Spotify/Deezer) / native source */}
            {(track.catalogProvider || track.playbackProvider) && (
              <span className="flex items-center gap-1 shrink-0">
                <ProviderBadge
                  provider={
                    track.catalogProvider === "deezer" ? "deezer"
                    : track.catalogProvider === "spotify" ? "spotify"
                    : track.source === "audius" ? "audius"
                    : "soundcloud"
                  }
                />
              </span>
            )}
            {track.versionTag && (
              <span className="mq-t-meta-2 px-1.5 py-0 rounded-md shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 6%, transparent)", color: "var(--mq-text-muted)" }}>
                {track.versionTag}
              </span>
            )}
            {track.duration > 0 && (
              <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                <span style={{ color: "var(--mq-text-muted)", opacity: 0.4 }}>·</span>
                <span className="mq-t-num shrink-0 whitespace-nowrap" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
                  {formatDuration(track.duration)}
                </span>
              </span>
            )}
            {track.genre && (
              <span className="flex items-center gap-1.5 shrink-0 min-w-0">
                <span style={{ color: "var(--mq-text-muted)", opacity: 0.4 }}>·</span>
                <span className="mq-t-meta-2 px-1.5 py-0 rounded-md max-w-[140px] truncate shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 6%, transparent)", color: "var(--mq-text-muted)" }}>
                  {track.genre}
                </span>
              </span>
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
// SEARCH SUGGESTIONS — autocomplete-style dropdown (W02, real data)
//
// The list is computed by the PARENT from real user state (search history,
// listening history, favorite artists, playlists, genres) — this component
// only RENDERS it. Rows are grouped visually by kind, keyboard-active row
// is highlighted (aria-activedescendant), mouse hover syncs the keyboard
// cursor. No invented "popular" entries, no fake numbers.
// ═════════════════════════════════════════════════════════════════════════

const SUGGESTION_ICONS: Record<SuggestionItem["icon"], React.ReactNode> = {
  search: <Clock className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />,
  track: <Play className="w-3.5 h-3.5 flex-shrink-0 ml-0.5" style={{ color: "var(--mq-text-muted)" }} fill="currentColor" />,
  artist: <User className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />,
  playlist: <ListMusic className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />,
  genre: <Radio className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />,
};

const SUGGESTION_GROUP_LABEL: Partial<Record<SuggestionItem["kind"], string>> = {
  search: "Недавние запросы",
  track: "Треки",
  artist: "Артисты",
  playlist: "Плейлисты",
  genre: "Жанры",
};

function SearchSuggestions({
  query,
  items,
  activeIndex,
  onHover,
  onSelect,
}: {
  query: string;
  items: SuggestionItem[];
  activeIndex: number;
  onHover: (index: number) => void;
  onSelect: (item: SuggestionItem) => void;
}) {
  // Group-boundary flags computed immutably BEFORE the render loop (the
  // react-compiler rule forbids reassigning a let across map iterations).
  const showGroupFlags = items.map(
    (item, i) => i === 0 || items[i - 1].kind !== item.kind
  );
  return (
    <div
      className="mt-1 rounded-[var(--mq-r-card)] overflow-hidden"
      style={{
        backgroundColor: "var(--mq-surface-1)",
        border: "1px solid var(--mq-edge-strong)",
        boxShadow: "var(--mq-elev-dialog)",
      }}
    >
      {/* Direct search for the current query — always first when typing */}
      {query && (
        <button
          id="mq-suggest-direct"
          role="option"
          aria-selected={activeIndex === -1}
          onMouseEnter={() => onHover(-1)}
          onClick={() => onSelect({ kind: "search", label: query, icon: "search" })}
          className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--mq-overlay-hover)]"
        >
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
          <span className="text-sm" style={{ color: "var(--mq-text)" }}>
            {/* FINAL §19: the query is emphasis — weight, not red */}
            Искать <span className="font-semibold">«{query}»</span>
          </span>
          <kbd className="ml-auto mq-t-meta-2 px-1.5 py-0.5 rounded border" style={{ borderColor: "var(--mq-border-thin)", color: "var(--mq-text-muted)" }}>Enter</kbd>
        </button>
      )}

      {/* Real suggestion rows grouped by kind */}
      <div role="listbox" aria-label="Поисковые подсказки">
        {items.map((item, i) => {
          const showGroup = showGroupFlags[i];
          const isActive = i === activeIndex;
          return (
            <div key={item.kind + ":" + item.label}>
              {showGroup && (
                <p
                  className="px-4 pt-2 pb-1 mq-t-meta-2 font-semibold uppercase tracking-wider border-t"
                  style={{ color: "var(--mq-text-muted)", borderColor: "var(--mq-border-hairline)" }}
                >
                  {SUGGESTION_GROUP_LABEL[item.kind]}
                </p>
              )}
              <button
                id={`mq-suggest-${i}`}
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => onHover(i)}
                onClick={() => onSelect(item)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--mq-overlay-hover)]"
                style={isActive ? { backgroundColor: "var(--mq-overlay-hover)" } : undefined}
              >
                {item.cover ? (
                  <img src={item.cover} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" loading="lazy" />
                ) : (
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 6%, transparent)" }}>
                    {SUGGESTION_ICONS[item.icon]}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate" style={{ color: "var(--mq-text)" }}>{item.label}</span>
                  {item.sub && (
                    <span className="block mq-t-meta-2 truncate" style={{ color: "var(--mq-text-muted)" }}>{item.sub}</span>
                  )}
                </span>
                {item.kind === "track" && (
                  <span className="mq-t-meta-2 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>Слушать</span>
                )}
                {item.kind === "artist" && (
                  <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-text-muted)" }} />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Empty state — no real matches: honest hint, no fake suggestions */}
      {items.length === 0 && !query && (
        <div className="px-4 py-3">
          <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
            Начните вводить запрос — подсказки появятся из вашей истории
          </p>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// TOP RESULT CARD (§4) — the hero of the search results.
// A solid surface (CONTENT CARD = SOLID, §18) with the dominant match:
// the artist that owns the results, or the most relevant track.
// Typography ladder: eyebrow (meta) → title (display) → meta → actions.
// ═════════════════════════════════════════════════════════════════════════

function TopResultCard({
  result,
  onArtistClick,
  onPlay,
}: {
  result:
    | { kind: "artist"; artist: { name: string; cover?: string; count: number; topTrack: Track; catalogArtistId?: string; catalogProvider?: "spotify" | "deezer"; followers?: number } }
    | { kind: "track"; track: Track };
  onArtistClick: (name: string, cover?: string, catalogArtistId?: string, catalogProvider?: "spotify" | "deezer") => void;
  onPlay: (track: Track, queue: Track[]) => void;
}) {
  const isArtist = result.kind === "artist";
  const track: Track = isArtist ? result.artist.topTrack : result.track;
  const title = isArtist ? result.artist.name : result.track.title;
  const cover = isArtist ? result.artist.cover : result.track.cover;
  const meta = isArtist
    ? `Артист · ${result.artist.count} ${result.artist.count === 1 ? "трек" : result.artist.count < 5 ? "трека" : "треков"}`
    : `Трек · ${result.track.artist}${result.track.duration > 0 ? ` · ${formatDuration(result.track.duration)}` : ""}`;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPlay(track, [track]);
  };

  return (
    <div
      className="mq-search-topresult group"
      role="button"
      tabIndex={0}
      onClick={() => { if (isArtist) onArtistClick(result.artist.name, result.artist.cover, result.artist.catalogArtistId, result.artist.catalogProvider); }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (isArtist) onArtistClick(result.artist.name, result.artist.cover, result.artist.catalogArtistId, result.artist.catalogProvider);
        }
      }}
      aria-label={isArtist ? `Открыть артиста ${title}` : `Слушать ${title}`}
    >
      <p className="mq-t-meta text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--mq-text-muted)" }}>
        Топ-результат
      </p>
      <div className="flex items-center gap-4 mt-2.5">
        <div
          className={isArtist ? "mq-art flex-shrink-0" : "mq-art flex-shrink-0"}
          style={{
            width: 104,
            height: 104,
            borderRadius: isArtist ? "50%" : "var(--mq-mat-radius-float, 18px)",
            overflow: "hidden",
            backgroundColor: "var(--mq-surface-2)",
            boxShadow: "var(--mq-mat-2-shadow)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {cover ? (
            <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
          ) : (
            isArtist
              ? <User className="w-8 h-8" style={{ color: "var(--mq-text-muted)" }} />
              : <Music className="w-8 h-8" style={{ color: "var(--mq-text-muted)" }} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="mq-t-display text-[20px] sm:text-[24px] leading-tight break-words" style={{
            color: "var(--mq-text)",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {title}
          </h3>
          <p className="mq-t-meta mt-1 truncate" style={{ color: "var(--mq-text-muted)" }}>{meta}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4">
        <button
          onClick={handlePlay}
          className="mq-platinum-btn flex items-center gap-1.5 h-10 px-4 rounded-full text-[13px] font-semibold transition-colors duration-150"
        >
          <Play className="w-3.5 h-3.5" fill="currentColor" />
          Слушать
        </button>
        {!isArtist && track.artist && (
          <button
            onClick={(e) => { e.stopPropagation(); onArtistClick(track.artist, track.cover, track.catalogArtistId, track.catalogProvider); }}
            className="flex items-center h-10 px-4 rounded-full text-[13px] font-semibold transition-colors duration-150"
            style={{
              backgroundColor: "color-mix(in srgb, var(--mq-text) 7%, transparent)",
              color: "var(--mq-text)",
              border: "1px solid var(--mq-edge)",
            }}
          >
            К артисту
          </button>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// DISCOVERY FEATURED CARD (V2 §1.2) — the anchor of Search Home.
// The ONE dominant discovery item (last played / catalog pick): a solid
// featured card (CONTENT CARD = SOLID, same family as the Top Result —
// one design language before and after the query). Compact on mobile
// (horizontal), vertical on desktop.
// ═════════════════════════════════════════════════════════════════════════

function DiscoveryFeaturedCard({
  track,
  eyebrow,
  onPlay,
}: {
  track: Track;
  eyebrow: string;
  onPlay: () => void;
}) {
  return (
    <div className="mq-card-feature group" data-mq-search-featured>
      {/* Desktop (lg+): vertical composition — eyebrow, art, title, meta, play */}
      <div className="hidden lg:block">
        <p className="mq-t-meta text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--mq-text-muted)" }}>
          {eyebrow}
        </p>
        <div
          className="mq-art mt-3 w-full aspect-square"
          style={{ borderRadius: "var(--mq-r-card)", backgroundColor: "var(--mq-surface-2)" }}
          aria-hidden="true"
        >
          {track.cover ? (
            <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
          ) : (
            <span className="w-full h-full flex items-center justify-center">
              <Music className="w-8 h-8" style={{ color: "var(--mq-text-muted)" }} />
            </span>
          )}
        </div>
        <h3
          className="mq-t-display text-[19px] leading-tight mt-3 break-words"
          style={{ color: "var(--mq-text)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        >
          {track.title}
        </h3>
        <p className="mq-t-meta mt-1 truncate" style={{ color: "var(--mq-text-muted)" }}>{track.artist}</p>
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={onPlay}
            className="mq-platinum-btn flex items-center gap-1.5 h-10 px-4 rounded-full text-[13px] font-semibold"
            aria-label={`Слушать ${track.title}`}
          >
            <Play className="w-3.5 h-3.5" fill="currentColor" />
            Слушать
          </button>
        </div>
      </div>

      {/* Mobile (<lg): compact horizontal composition — art 96px + text + play */}
      <div className="lg:hidden flex items-center gap-3.5">
        <div
          className="mq-art flex-shrink-0"
          style={{ width: 96, height: 96, borderRadius: "var(--mq-r-card)", backgroundColor: "var(--mq-surface-2)" }}
          aria-hidden="true"
        >
          {track.cover ? (
            <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
          ) : (
            <span className="w-full h-full flex items-center justify-center">
              <Music className="w-6 h-6" style={{ color: "var(--mq-text-muted)" }} />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="mq-t-meta text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--mq-text-muted)" }}>
            {eyebrow}
          </p>
          <h3 className="mq-t-display text-[17px] leading-tight mt-1 break-words" style={{ color: "var(--mq-text)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {track.title}
          </h3>
          <p className="mq-t-meta mt-0.5 truncate" style={{ color: "var(--mq-text-muted)" }}>{track.artist}</p>
        </div>
        <button
          onClick={onPlay}
          className="mq-platinum-btn w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ padding: 0 }}
          aria-label={`Слушать ${track.title}`}
        >
          <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
        </button>
      </div>
    </div>
  );
}
