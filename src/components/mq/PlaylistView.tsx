"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useAppStore, type UserPlaylist } from "@/store/useAppStore";
import { useTouchDrag } from "@/hooks/useTouchDrag";
import { motion, AnimatePresence } from "framer-motion";
import { type Track, formatDuration } from "@/lib/musicApi";
import {
  Plus, Trash2, Play, Music, ListMusic, ChevronRight, ChevronLeft,
  Edit3, X, Check, Disc3, Clock, Heart, Upload, Download, Link, Loader2, AlertCircle, Image, Camera, Sparkles, ImagePlus, Share2, Shuffle, Wand2, Pin, Users, MoveUp, MoveDown, MoreVertical
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import TrackCard from "./TrackCard";
import PlaylistExportView from "./PlaylistExportView";
import ScrollReveal from "./ScrollReveal";
import { PlaylistCardSkeleton } from "./Skeleton";
import { SmartPlaylistBuilder } from "./SmartPlaylistBuilder";
import { EmptyState } from "./EmptyState";

// ── Gradient cover generator (muted dark tones) ──
function generateGradientCover(name: string): string {
  // Deterministic hash from name for consistent dark tones
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Pick from dark tones with subtle accent border feel
  const tones = ["#0a0a0a", "#1f1f1f", "#2a2a2a", "#111111", "#1a1a1a", "#0f0f0f"];
  const t1 = tones[Math.abs(hash) % tones.length];
  const t2 = tones[Math.abs((hash >> 8)) % tones.length];
  const angle = Math.abs((hash >> 4) % 360);
  return `linear-gradient(${angle}deg, ${t1}, ${t2})`;
}

// ── Small pattern overlay for cover (subtle) ──
function generatePatternStyle(name: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const patternType = Math.abs(hash) % 3;
  if (patternType === 0) {
    return {
      backgroundImage: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.04) 0%, transparent 50%)`,
    };
  } else if (patternType === 1) {
    return {
      backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.02) 10px, rgba(255,255,255,0.02) 20px)`,
    };
  } else {
    return {
      backgroundImage: `radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.05) 0%, transparent 70%)`,
    };
  }
}

// ── Format total duration of tracks ──
function formatTotalDuration(tracks: Track[]): string {
  const totalSec = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  if (totalSec <= 0) return "";
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `~${h} ч ${m} мин`;
  return `~${m} мин`;
}

export default function PlaylistView() {
  const playlists = useAppStore((s) => s.playlists);
  const selectedPlaylistId = useAppStore((s) => s.selectedPlaylistId);
  const setSelectedPlaylistId = useAppStore((s) => s.setSelectedPlaylistId);
  const createPlaylist = useAppStore((s) => s.createPlaylist);
  const deletePlaylist = useAppStore((s) => s.deletePlaylist);
  const renamePlaylist = useAppStore((s) => s.renamePlaylist);
  const removeFromPlaylist = useAppStore((s) => s.removeFromPlaylist);
  const animationsEnabled = useAppStore((s) => s.animationsEnabled);
  const playTrack = useAppStore((s) => s.playTrack);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const addToPlaylist = useAppStore((s) => s.addToPlaylist);
  const setView = useAppStore((s) => s.setView);
  const compactMode = useAppStore((s) => s.compactMode);
  const setSelectedArtist = useAppStore((s) => s.setSelectedArtist);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const storeIsPlaying = useAppStore((s) => s.isPlaying);

  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("mq-pinned-playlists");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const togglePin = useCallback((id: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem("mq-pinned-playlists", JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  const [showCreate, setShowCreate] = useState(false);
  const [showSmartBuilder, setShowSmartBuilder] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<'text' | 'url'>('text');
  const [importText, setImportText] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const playlistScrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [importProgress, setImportProgress] = useState('');
  const [importHint, setImportHint] = useState('');
  const [vkToken, setVkToken] = useState('');
  const [showVkToken, setShowVkToken] = useState(false);
  const [coverUploadingId, setCoverUploadingId] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [aiGeneratingTags, setAiGeneratingTags] = useState(false);
  const [aiGeneratingCover, setAiGeneratingCover] = useState(false);
  const [aiAutoGenerating, setAiAutoGenerating] = useState(false);
  const [showExport, setShowExport] = useState(false);
  // P2: which track's action menu is open (track id or null)
  const [openMenuTrackId, setOpenMenuTrackId] = useState<string | null>(null);
  const [playlistRecs, setPlaylistRecs] = useState<Track[]>([]);
  const [playlistRecsLoading, setPlaylistRecsLoading] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);

  // ── Drag-and-drop reorder state ──
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [reorderPlaylistId, setReorderPlaylistId] = useState<string | null>(null);

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId);
  // Sort playlists: pinned first, then by creation date
  const sortedPlaylists = useMemo(() => {
    return [...playlists].sort((a, b) => {
      const aPinned = pinnedIds.has(a.id) ? 0 : 1;
      const bPinned = pinnedIds.has(b.id) ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;
      return b.createdAt - a.createdAt;
    });
  }, [playlists, pinnedIds]);
  const autoGenAttemptedRef = useRef<Set<string>>(new Set());
  const recsLoadedRef = useRef<Set<string>>(new Set());

  // ── Load similar tracks for playlist ──
  useEffect(() => {
    const playlist = playlists.find((p) => p.id === selectedPlaylistId);
    if (!playlist || playlist.tracks.length < 3) return;
    if (recsLoadedRef.current.has(playlist.id)) return;
    recsLoadedRef.current.add(playlist.id);

    const tracks = playlist.tracks;
    // Build genre + artist profile from playlist tracks
    const genreCounts: Record<string, number> = {};
    const artistCounts: Record<string, number> = {};
    for (const t of tracks) {
      const g = t.genre ? t.genre.trim() : null;
      if (g) genreCounts[g] = (genreCounts[g] || 0) + 1;
      if (t.artist) artistCounts[t.artist] = (artistCounts[t.artist] || 0) + 1;
    }
    const topGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g]) => g);
    const topArtists = Object.entries(artistCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a]) => a);
    const excludeIds = tracks.map(t => t.id).join(",");

    if (topGenres.length === 0 && topArtists.length === 0) return;

    // P2-#300: defer to macrotask — setTimeout(0) is safer than queueMicrotask
    // because microtasks run before the render commit completes
    setTimeout(() => setPlaylistRecsLoading(true), 0);
    const params = new URLSearchParams();
    if (topGenres.length > 0) params.set("genres", topGenres.join(","));
    if (topArtists.length > 0) params.set("artists", topArtists.join(","));
    if (excludeIds) params.set("excludeIds", excludeIds);

    fetch(`/api/music/recommendations?${params}`)
      .then(res => res.json())
      .then(data => {
        const recTracks = (data.tracks || []).filter(
          (t: Track) => !tracks.some(pt => pt.id === t.id)
        );
        setPlaylistRecs(recTracks.slice(0, 50));
      })
      .catch(() => setPlaylistRecs([]))
      .finally(() => setPlaylistRecsLoading(false));
  }, [playlists, selectedPlaylistId]);

  // Close track action menu on outside click / Escape
  useEffect(() => {
    if (!openMenuTrackId) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.group/menu')) setOpenMenuTrackId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenuTrackId(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenuTrackId]);

  // ── Auto-generate description & cover when playlist has tracks but no description ──
  useEffect(() => {
    const playlist = playlists.find((p) => p.id === selectedPlaylistId);
    if (!playlist) return;
    if (playlist.tracks.length < 2) return;
    if (autoGenAttemptedRef.current.has(playlist.id)) return;
    // Don't auto-gen if user already wrote a real description
    if (playlist.description?.trim() && !playlist.description.startsWith("треков")) return;

    autoGenAttemptedRef.current.add(playlist.id);
    const playlistId = playlist.id;
    const playlistName = playlist.name;
    const playlistTracks = playlist.tracks;
    // P2-#300: defer to macrotask — setTimeout(0) runs AFTER render commit
    setTimeout(() => setAiAutoGenerating(true), 0);

    fetch('/api/playlists/auto-generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playlistId, playlistName, tracks: playlistTracks }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.description) {
          const { playlists: currentPlaylists } = useAppStore.getState();
          useAppStore.setState({
            playlists: currentPlaylists.map(p =>
              p.id === playlistId ? { ...p, description: data.description } : p
            ),
          });
        }
        // Then auto-generate cover if none
        const updated = useAppStore.getState().playlists.find(p => p.id === playlistId);
        if (updated && !updated.cover) {
          return fetch('/api/playlists/generate-cover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playlistId, playlistName, tracks: playlistTracks }),
          }).then(r => r.json()).then(coverData => {
            if (coverData.cover) {
              const { playlists: pls } = useAppStore.getState();
              useAppStore.setState({
                playlists: pls.map(p =>
                  p.id === playlistId ? { ...p, cover: coverData.cover } : p
                ),
              });
            }
          }).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setAiAutoGenerating(false));
  }, [playlists, selectedPlaylistId]);

  // Upload playlist cover image
  const handleCoverUpload = useCallback(async (playlistId: string, file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: "Ошибка", description: "Выберите изображение (JPG, PNG, WebP)" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Ошибка", description: "Максимальный размер — 5 МБ" });
      return;
    }

    setCoverUploadingId(playlistId);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/music/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Upload failed');
      }

      const data = await res.json();
      const imageUrl = data.url || data.fileUrl || `/api/music/upload/file/${data.filename}`;

      // Update playlist cover in store
      const { playlists: currentPlaylists } = useAppStore.getState();
      useAppStore.setState({
        playlists: currentPlaylists.map(p =>
          p.id === playlistId ? { ...p, cover: imageUrl } : p
        ),
      });

      toast({ title: "Обложка обновлена", description: "Новая обложка плейлиста установлена" });
    } catch (err) {
      // Fallback: use data URL for local preview
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const { playlists: currentPlaylists } = useAppStore.getState();
        useAppStore.setState({
          playlists: currentPlaylists.map(p =>
            p.id === playlistId ? { ...p, cover: dataUrl } : p
          ),
        });
        toast({ title: "Обложка обновлена", description: "Локальное изображение установлено" });
      };
      reader.readAsDataURL(file);
    } finally {
      setCoverUploadingId(null);
    }
  }, [toast]);

  // Remove playlist cover
  const handleRemoveCover = useCallback((playlistId: string) => {
    const { playlists: currentPlaylists } = useAppStore.getState();
    useAppStore.setState({
      playlists: currentPlaylists.map(p =>
        p.id === playlistId ? { ...p, cover: '' } : p
      ),
    });
    toast({ title: "Обложка удалена", description: "Установлена обложка по умолчанию" });
  }, [toast]);

  // AI auto-generate tags and description
  const handleAiGenerateTags = useCallback(async (playlistId: string) => {
    if (aiGeneratingTags) return;
    setAiGeneratingTags(true);
    try {
      const pl = playlists.find(p => p.id === playlistId);
      const res = await fetch('/api/playlists/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistId, playlistName: pl?.name, tracks: pl?.tracks || [] }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[auto-generate] API error:", data);
        toast({ title: "Ошибка", description: data.debug || data.error || "Не удалось сгенерировать теги" });
        return;
      }
      // Update local store with new description and tags
      const { playlists: currentPlaylists } = useAppStore.getState();
      useAppStore.setState({
        playlists: currentPlaylists.map(p =>
          p.id === playlistId ? { ...p, description: data.description || p.description } : p
        ),
      });
      toast({
        title: "Теги сгенерированы",
        description: data.tags.length > 0 ? data.tags.join(', ') : "Теги созданы",
      });
    } catch {
      toast({ title: "Ошибка", description: "Не удалось связаться с сервером" });
    } finally {
      setAiGeneratingTags(false);
    }
  }, [aiGeneratingTags, toast]);

  // AI generate cover image
  const handleAiGenerateCover = useCallback(async (playlistId: string) => {
    if (aiGeneratingCover) return;
    setAiGeneratingCover(true);
    try {
      // Send playlist name and tracks inline so the API works for local playlists too
      const pl = playlists.find(p => p.id === playlistId);
      const res = await fetch('/api/playlists/generate-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlistId,
          playlistName: pl?.name,
          tracks: pl?.tracks || [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Ошибка", description: data.error || "Не удалось сгенерировать обложку" });
        return;
      }
      // Update local store with new cover
      const { playlists: currentPlaylists } = useAppStore.getState();
      useAppStore.setState({
        playlists: currentPlaylists.map(p =>
          p.id === playlistId ? { ...p, cover: data.cover } : p
        ),
      });
      toast({ title: "Обложка создана", description: "Обложка установлена" });
    } catch {
      toast({ title: "Ошибка", description: "Не удалось связаться с сервером" });
    } finally {
      setAiGeneratingCover(false);
    }
  }, [aiGeneratingCover, toast]);

  const handleCreate = useCallback(() => {
    if (newName.trim()) {
      createPlaylist(newName.trim(), newDesc.trim());
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
    }
  }, [newName, newDesc, createPlaylist]);

  const handleRename = useCallback((id: string) => {
    if (editName.trim()) {
      renamePlaylist(id, editName.trim());
    }
    setEditingId(null);
    setEditName("");
    setEditDesc("");
  }, [editName, renamePlaylist]);

  const handlePlayAll = useCallback((pl: UserPlaylist) => {
    if (pl.tracks.length > 0) playTrack(pl.tracks[0], pl.tracks);
  }, [playTrack]);

  // ── Drag reorder handlers ──
  const handleDragStart = useCallback((playlistId: string, index: number) => {
    setDragIndex(index);
    setReorderPlaylistId(playlistId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === targetIndex || !reorderPlaylistId) {
      setDragIndex(null);
      setDragOverIndex(null);
      setReorderPlaylistId(null);
      return;
    }
    // Reorder tracks in the playlist
    const pl = playlists.find(p => p.id === reorderPlaylistId);
    if (!pl) return;
    const newTracks = [...pl.tracks];
    const [moved] = newTracks.splice(dragIndex, 1);
    newTracks.splice(targetIndex, 0, moved);
    const { playlists: currentPlaylists } = useAppStore.getState();
    useAppStore.setState({
      playlists: currentPlaylists.map(p =>
        p.id === reorderPlaylistId ? { ...p, tracks: newTracks } : p
      ),
    });
    setDragIndex(null);
    setDragOverIndex(null);
    setReorderPlaylistId(null);
  }, [dragIndex, reorderPlaylistId, playlists]);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
    setReorderPlaylistId(null);
  }, []);

  // ── Move track up/down in playlist ──
  const handleMoveTrack = useCallback((playlistId: string, fromIndex: number, toIndex: number) => {
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;
    const newTracks = [...pl.tracks];
    const [moved] = newTracks.splice(fromIndex, 1);
    newTracks.splice(toIndex, 0, moved);
    const { playlists: currentPlaylists } = useAppStore.getState();
    useAppStore.setState({
      playlists: currentPlaylists.map(p =>
        p.id === playlistId ? { ...p, tracks: newTracks } : p
      ),
    });
  }, [playlists]);

  // ── Touch D&D — P2: touch-friendly reordering via long-press ──
  const touchDrag = useTouchDrag({
    onReorder: (from, to) => {
      if (selectedPlaylist) {
        handleMoveTrack(selectedPlaylist.id, from, to);
      }
    },
    itemCount: selectedPlaylist?.tracks.length || 0,
    itemHeight: 52,
  });

  const triggerUrlImport = useCallback(async () => {
    if (!importUrl.trim() || importing) return;
    setImporting(true);
    setImportError("");
    setImportHint("");
    setImportProgress('Подключение к сервису...');
    try {
      const res = await fetch('/api/music/import-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim(), vkToken: vkToken.trim() || undefined }),
      });
      const data = await res.json();

      if (data.error) {
        setImportError(data.error);
        if (data.hint) setImportHint(data.hint);
        if (data.needVkToken) setShowVkToken(true);
        return;
      }

      const rawTracks = data.tracks || [];
      if (rawTracks.length === 0) {
        setImportError('Не удалось найти треки по этой ссылке');
        return;
      }

      setImportProgress(`Найдено ${rawTracks.length} треков, создаём плейлист...`);

      const tracks: Track[] = rawTracks.map((t: any, i: number) => {
        const isPlayable = t._playable === true || !!t.scTrackId;
        return {
          id: isPlayable && t.scTrackId
            ? `sc_url_${t.scTrackId}_${Date.now()}`
            : `url_import_${i}_${Date.now()}`,
          title: t.title || t.name || 'Unknown',
          artist: t.artist || t.artists?.[0]?.name || 'Unknown Artist',
          album: t.album || '',
          cover: t.cover || t.image || '',
          duration: t.duration || 0,
          genre: t.genre || '',
          audioUrl: t.audioUrl || '',
          previewUrl: t.previewUrl || '',
          source: "soundcloud" as const,
          scTrackId: t.scTrackId || null,
          scStreamPolicy: t.scStreamPolicy || '',
          scIsFull: t.scIsFull || false,
        };
      });

      const playableCount = data.playableCount ?? tracks.filter(t => !!t.scTrackId).length;
      const totalCount = data.totalCount ?? tracks.length;

      let description: string;
      if (playableCount === totalCount) {
        description = `${totalCount} треков из ${data.source || 'внешнего сервиса'} · все воспроизводимы`;
      } else if (playableCount > 0) {
        description = `${totalCount} треков из ${data.source || 'внешнего сервиса'} · ${playableCount} воспроизводимы`;
      } else {
        description = `${totalCount} треков из ${data.source || 'внешнего сервиса'}`;
      }

      const newPl: UserPlaylist = {
        id: `pl_url_${Date.now()}`,
        name: data.name || `Импорт ${new Date().toLocaleDateString('ru-RU')}`,
        description,
        cover: '',
        tracks,
        createdAt: Date.now(),
      };

      useAppStore.setState(s => ({ playlists: [...s.playlists, newPl] }));
      setShowImport(false);
      setImportUrl('');
      setImportProgress('');
      setVkToken('');
      setShowVkToken(false);

      toast({
        title: `Плейлист импортирован`,
        description: `${totalCount} треков из ${data.source || 'внешнего сервиса'}` +
          (playableCount > 0 ? ` · ${playableCount} воспроизводимы` : ''),
      });
    } catch {
      setImportError('Ошибка при импорте. Проверьте ссылку и попробуйте снова.');
    } finally {
      setImporting(false);
      setImportProgress('');
    }
  }, [importUrl, importing, toast]);

  // ── Detail view for selected playlist ──
  if (selectedPlaylist) {
    const totalDur = formatTotalDuration(selectedPlaylist.tracks);
    // Check if playlist is collaborative (imported or shared)
    const isCollaborative = selectedPlaylist.id.startsWith('pl_url_') || selectedPlaylist.description?.includes('воспроизводимы');

    return (
      <div className={`${compactMode ? "p-3 lg:p-4 pb-[var(--mq-player-clearance)] sm:pb-24 lg:pb-24 space-y-4" : "p-4 lg:p-6 pb-[var(--mq-player-clearance)] sm:pb-24 lg:pb-28 space-y-6"} max-w-[var(--mq-container-narrow)] mx-auto`} style={{ scrollBehavior: "smooth" }}>
        {/* Back button */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setSelectedPlaylistId(null)}
          className="flex items-center gap-2 text-sm"
          style={{ color: "var(--mq-accent)" }}
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Все плейлисты
        </motion.button>

        {/* Playlist header — enhanced with larger cover, better info */}
        <ScrollReveal direction="up" delay={0.05}>
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4 sm:p-5"
          style={{ backgroundColor: "var(--mq-card)", boxShadow: "var(--mq-shadow-card)" }}
        >
          <div className="flex items-start gap-3 sm:gap-4">
            {/* Cover with upload overlay — larger for detail view */}
            <div className="relative group/cover flex-shrink-0 self-center">
              <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-2xl overflow-hidden flex items-center justify-center"
                style={selectedPlaylist.cover
                  ? { backgroundColor: "transparent" }
                  : { background: generateGradientCover(selectedPlaylist.name) }
                }>
                {selectedPlaylist.cover ? (
                  <img src={selectedPlaylist.cover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-1" style={generatePatternStyle(selectedPlaylist.name)}>
                    <ListMusic className="w-10 h-10" style={{ color: "rgba(255,255,255,0.7)" }} />
                  </div>
                )}
              </div>
              {/* Upload overlay */}
              <div className="absolute inset-0 rounded-2xl bg-black/60 opacity-0 group-hover/cover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                onClick={() => coverInputRef.current?.click()}>
                {coverUploadingId === selectedPlaylist.id ? (
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--mq-text)" }} />
                ) : (
                  <>
                    <Camera className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
                    {selectedPlaylist.cover && (
                      <button
                        className="absolute top-1 right-1 p-0.5 rounded-full"
                        style={{ backgroundColor: "rgba(239,68,68,0.8)" }}
                        onClick={(e) => { e.stopPropagation(); handleRemoveCover(selectedPlaylist.id); }}>
                        <X className="w-3 h-3" style={{ color: "#fff" }} />
                      </button>
                    )}
                  </>
                )}
              </div>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCoverUpload(selectedPlaylist.id, file);
                  e.target.value = '';
                }}
              />
            </div>

            <div className="flex-1 min-w-0">
              {editingId === selectedPlaylist.id ? (
                <div className="space-y-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full text-xl font-bold rounded-2xl px-2 py-1 outline-none focus:ring-1 focus:ring-[var(--mq-accent)]"
                    style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--mq-text)" }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRename(selectedPlaylist.id); if (e.key === "Escape") setEditingId(null); }}
                    autoFocus
                  />
                  <input
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Описание плейлиста"
                    className="w-full text-sm rounded-2xl px-2 py-1 outline-none focus:ring-1 focus:ring-[var(--mq-accent)]"
                    style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--mq-text)" }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRename(selectedPlaylist.id); if (e.key === "Escape") setEditingId(null); }}
                  />
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleRename(selectedPlaylist.id)} className="p-1.5 rounded-lg" style={{ color: "#4ade80", backgroundColor: "var(--mq-input-bg)" }}>
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg" style={{ color: "var(--mq-text-muted)", backgroundColor: "var(--mq-input-bg)" }}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <h1 className="text-xl sm:text-2xl font-bold truncate flex-1 min-w-0" style={{ color: "var(--mq-text)" }} title={selectedPlaylist.name}>
                      {selectedPlaylist.name}
                    </h1>
                    {isCollaborative && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                        <Users className="w-3 h-3" style={{ color: "var(--mq-accent)" }} />
                        <span className="text-[11px] font-medium" style={{ color: "var(--mq-accent)" }}>Shared</span>
                      </div>
                    )}
                  </div>
                  {aiAutoGenerating ? (
                    <p className="text-sm mt-1 flex items-center gap-2" style={{ color: "var(--mq-accent)" }}>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Генерируем описание...
                    </p>
                  ) : selectedPlaylist.description ? (
                    <p className="text-sm mt-1" style={{ color: "var(--mq-text-muted)", minHeight: 20 }}>
                      {selectedPlaylist.description}
                    </p>
                  ) : null}
                </>
              )}
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs flex items-center gap-1" style={{ color: "var(--mq-text-muted)" }}>
                  <Music className="w-3 h-3" />
                  {selectedPlaylist.tracks.length} треков
                </span>
                {totalDur && (
                  <span className="text-xs flex items-center gap-1" style={{ color: "var(--mq-text-muted)" }}>
                    <Clock className="w-3 h-3" />
                    {totalDur}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              {editingId !== selectedPlaylist.id && (
                <>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => { setEditingId(selectedPlaylist.id); setEditName(selectedPlaylist.name); setEditDesc(selectedPlaylist.description); }}
                    className="p-1.5 sm:p-2 rounded-full hover:bg-white/5 transition-colors"
                    style={{ color: "var(--mq-text-muted)" }}
                    title="Редактировать"
                    aria-label="Редактировать"
                  >
                    <Edit3 className="w-4 h-4" />
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowExport(true)}
                    className="p-1.5 sm:p-2 rounded-full hover:bg-white/5 transition-colors"
                    style={{ color: "var(--mq-text-muted)" }}
                    title="Экспорт"
                    aria-label="Экспорт"
                  >
                    <Share2 className="w-4 h-4" />
                  </motion.button>
                </>
              )}
              {selectedPlaylist.tracks.length > 0 && (
                <motion.button
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => handlePlayAll(selectedPlaylist)}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)", boxShadow: "var(--mq-shadow-accent)" }}
                  aria-label="Воспроизвести всё"
                >
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5" fill="currentColor" />
                </motion.button>
              )}
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => deletePlaylist(selectedPlaylist.id)}
                className="p-1.5 sm:p-2 rounded-full hover:bg-white/5 transition-colors"
                style={{ color: "var(--mq-text-muted)" }}
                aria-label="Удалить плейлист"
              >
                <Trash2 className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        </motion.div>
        </ScrollReveal>

        {/* Автоматические действия — show when playlist has tracks */}
        {selectedPlaylist.tracks.length >= 2 && !aiAutoGenerating && (
          <ScrollReveal direction="up" delay={0.15}>
          <motion.div
            initial={animationsEnabled ? { opacity: 0, y: 10 } : undefined}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-4"
            style={{ backgroundColor: "var(--mq-card)", boxShadow: "var(--mq-shadow-card)" }}
          >
            <p className="text-xs font-medium mb-2" style={{ color: "var(--mq-text-muted)" }}>
              Перегенерировать ИИ
            </p>
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleAiGenerateTags(selectedPlaylist.id)}
                disabled={aiGeneratingTags || aiGeneratingCover}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium flex-1"
                style={{
                  backgroundColor: aiGeneratingTags
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(255,255,255,0.06)",
                  color: aiGeneratingTags
                    ? "var(--mq-text-muted)"
                    : "var(--mq-text)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {aiGeneratingTags ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--mq-accent)" }} />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                )}
                {aiGeneratingTags ? "Генерация..." : "Новые теги"}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleAiGenerateCover(selectedPlaylist.id)}
                disabled={aiGeneratingTags || aiGeneratingCover}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium flex-1"
                style={{
                  backgroundColor: aiGeneratingCover
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(255,255,255,0.06)",
                  color: aiGeneratingCover
                    ? "var(--mq-text-muted)"
                    : "var(--mq-text)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {aiGeneratingCover ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--mq-accent)" }} />
                ) : (
                  <ImagePlus className="w-3.5 h-3.5" style={{ color: "var(--mq-accent)" }} />
                )}
                {aiGeneratingCover ? "Генерация..." : "Сгенерировать обложку"}
              </motion.button>
            </div>
          </motion.div>
          </ScrollReveal>
        )}

        {/* Tracks list — redesigned P2: clean rows with cover thumbnail, clear hierarchy */}
        <ScrollReveal direction="up" delay={0.2}>
        {selectedPlaylist.tracks.length > 0 ? (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--mq-card)" }}>
            {/* Column header — desktop only */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wider font-semibold border-b"
              style={{ color: "var(--mq-text-muted)", borderColor: "var(--mq-border)", opacity: 0.7 }}>
              <span className="w-10 text-center">#</span>
              <span className="flex-1">Название</span>
              <span className="w-14 text-right pr-1"><Clock className="w-3 h-3 inline" /></span>
              <span className="w-10"></span>
              <span className="w-10"></span>
            </div>
            {selectedPlaylist.tracks.map((track, i) => {
              const isCurrentlyPlaying = currentTrack?.id === track.id;
              const isLiked = likedTrackIds.includes(track.id);
              const isDragTarget = dragOverIndex === i && dragIndex !== i;

              return (
                <div
                  key={track.id}
                  draggable
                  onDragStart={() => handleDragStart(selectedPlaylist.id, i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDrop={(e) => handleDrop(e, i)}
                  onDragEnd={handleDragEnd}
                  onTouchStart={touchDrag.handleTouchStart(i)}
                  onTouchMove={touchDrag.handleTouchMove}
                  onTouchEnd={touchDrag.handleTouchEnd}
                  className="group/track flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 transition-colors relative select-none"
                  style={{
                    backgroundColor: touchDrag.hoverIndex === i && touchDrag.isDragging
                      ? "color-mix(in srgb, var(--mq-accent) 12%, transparent)"
                      : isDragTarget
                        ? "rgba(255,255,255,0.06)"
                        : isCurrentlyPlaying
                          ? "color-mix(in srgb, var(--mq-accent) 8%, transparent)"
                          : "transparent",
                    borderTop: (touchDrag.hoverIndex === i && touchDrag.isDragging) || isDragTarget ? "2px solid var(--mq-accent)" : "1px solid transparent",
                    borderBottom: "1px solid color-mix(in srgb, var(--mq-border) 50%, transparent)",
                    opacity: touchDrag.dragIndex === i && touchDrag.isDragging ? 0.5 : 1,
                    transform: touchDrag.dragIndex === i && touchDrag.isDragging ? "scale(0.98)" : "scale(1)",
                  }}
                >
                  {/* Track number + play-on-hover + drag grip */}
                  <div className="flex items-center justify-center relative w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 cursor-pointer"
                    onClick={() => {
                      if (isCurrentlyPlaying) {
                        useAppStore.getState().togglePlay();
                      } else {
                        playTrack(track, selectedPlaylist.tracks);
                      }
                    }}
                  >
                    {isCurrentlyPlaying ? (
                      <motion.span
                        className="flex items-end gap-[2px] h-3.5"
                        style={{ color: "var(--mq-accent)" }}
                        aria-hidden
                      >
                        <motion.span
                          className="w-[2px] rounded-full"
                          style={{ backgroundColor: "var(--mq-accent)", height: "100%", transformOrigin: "bottom" }}
                          animate={{ scaleY: [0.4, 1, 0.6, 0.8, 0.4] }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                        />
                        <motion.span
                          className="w-[2px] rounded-full"
                          style={{ backgroundColor: "var(--mq-accent)", height: "100%", transformOrigin: "bottom" }}
                          animate={{ scaleY: [0.7, 0.4, 0.9, 0.5, 0.7] }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", delay: 0.15 }}
                        />
                        <motion.span
                          className="w-[2px] rounded-full"
                          style={{ backgroundColor: "var(--mq-accent)", height: "100%", transformOrigin: "bottom" }}
                          animate={{ scaleY: [0.5, 0.8, 0.4, 1, 0.5] }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                        />
                      </motion.span>
                    ) : (
                      <>
                        <span
                          className="text-xs tabular-nums group-hover/track:hidden"
                          style={{
                            color: "var(--mq-text-muted)",
                            opacity: 0.6,
                            fontWeight: 500,
                          }}
                        >
                          {i + 1}
                        </span>
                        <Play
                          className="absolute inset-0 m-auto w-4 h-4 opacity-0 group-hover/track:opacity-100 transition-opacity"
                          style={{ color: "var(--mq-text)" }}
                          fill="currentColor"
                        />
                      </>
                    )}
                  </div>

                  {/* Cover thumbnail (mobile-only) — fixed width */}
                  <div className="sm:hidden flex-shrink-0 w-10 h-10 rounded-md overflow-hidden"
                    style={{ backgroundColor: "var(--mq-input-bg)" }}>
                    {track.cover ? (
                      <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
                      </div>
                    )}
                  </div>

                  {/* Duration (desktop-only) — fixed width */}
                  <span className="hidden sm:block flex-shrink-0 w-14 text-[11px] tabular-nums text-right pr-1"
                    style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
                    {formatDuration(track.duration)}
                  </span>

                  {/* Title + artist — takes remaining space */}
                  <div className="min-w-0 flex-1 cursor-pointer"
                    onClick={() => {
                      if (!isCurrentlyPlaying) {
                        playTrack(track, selectedPlaylist.tracks);
                      }
                    }}>
                    <div
                      className="text-sm font-medium truncate leading-tight"
                      style={{
                        color: isCurrentlyPlaying ? "var(--mq-accent)" : "var(--mq-text)",
                        fontWeight: isCurrentlyPlaying ? 600 : 500,
                      }}
                      title={track.title}
                    >
                      {track.title}
                    </div>
                    <button
                      className="text-xs truncate leading-tight block max-w-full text-left hover:underline underline-offset-2"
                      style={{ color: "var(--mq-text-muted)", background: "none", border: "none", padding: 0, font: "inherit" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedArtist({ name: track.artist, avatar: track.cover });
                      }}
                      title={track.artist}
                    >
                      {track.artist}
                    </button>
                  </div>

                  {/* Like button */}
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => { e.stopPropagation(); useAppStore.getState().toggleLike(track.id, track); }}
                    className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors"
                    style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
                    aria-label={isLiked ? "Убрать из любимых" : "В любимые"}
                  >
                    <Heart className="w-4 h-4" fill={isLiked ? "currentColor" : "none"} />
                  </motion.button>

                  {/* More menu — remove / move up / move down */}
                  <div className="relative group/menu flex-shrink-0">
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuTrackId(openMenuTrackId === track.id ? null : track.id);
                      }}
                      className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors"
                      style={{ color: "var(--mq-text-muted)" }}
                      aria-label="Действия с треком"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </motion.button>
                    {openMenuTrackId === track.id && (
                      <div className="absolute right-0 top-full mt-1 z-30 rounded-xl py-1 min-w-[180px] shadow-2xl"
                        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}>
                        {i > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMoveTrack(selectedPlaylist.id, i, i - 1); setOpenMenuTrackId(null); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-colors"
                            style={{ color: "var(--mq-text)" }}
                          >
                            <MoveUp className="w-3.5 h-3.5" /> Вверх
                          </button>
                        )}
                        {i < selectedPlaylist.tracks.length - 1 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMoveTrack(selectedPlaylist.id, i, i + 1); setOpenMenuTrackId(null); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-colors"
                            style={{ color: "var(--mq-text)" }}
                          >
                            <MoveDown className="w-3.5 h-3.5" /> Вниз
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFromPlaylist(selectedPlaylist.id, track.id); setOpenMenuTrackId(null); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/5 transition-colors"
                          style={{ color: "#ef4444" }}
                        >
                          <X className="w-3.5 h-3.5" /> Удалить
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 rounded-2xl" style={{ backgroundColor: "var(--mq-card)" }}>
            <div className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
              <Music className="w-10 h-10" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--mq-text-muted)" }}>
              Плейлист пуст
            </p>
            <p className="text-xs mt-2 max-w-[240px] mx-auto" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
              Нажмите правой кнопкой на трек и выберите «Добавить в плейлист», или перетащите трек сюда
            </p>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setView("search")}
              className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 rounded-xl text-sm font-medium"
              style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
            >
              <Music className="w-4 h-4" />
              Найти треки
            </motion.button>
          </div>
        )}
        </ScrollReveal>

        {/* Smart recommendations for this playlist */}
        <ScrollReveal direction="up" delay={0.3}>
        {selectedPlaylist.tracks.length >= 3 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Shuffle className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
                <h3 className="text-sm font-bold" style={{ color: "var(--mq-text)" }}>
                  Похожие треки
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                {playlistRecs.length > 0 && (
                  <>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      whileHover={{ scale: 1.05 }}
                      onClick={async () => {
                        if (!selectedPlaylist || autoFilling) return;
                        setAutoFilling(true);
                        // Add top 5 recommended tracks to playlist
                        const topRecs = playlistRecs.slice(0, 5);
                        const { playlists: currentPlaylists } = useAppStore.getState();
                        const updatedTracks = [...selectedPlaylist.tracks, ...topRecs];
                        useAppStore.setState({
                          playlists: currentPlaylists.map(p =>
                            p.id === selectedPlaylist.id ? { ...p, tracks: updatedTracks } : p
                          ),
                        });
                        // Remove added tracks from recs
                        const addedIds = new Set(topRecs.map(t => t.id));
                        setPlaylistRecs(prev => prev.filter(t => !addedIds.has(t.id)));
                        toast({ title: "Добавлено", description: `${topRecs.length} треков добавлено в плейлист` });
                        setTimeout(() => setAutoFilling(false), 500);
                      }}
                      disabled={autoFilling || playlistRecs.length === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer"
                      style={{
                        backgroundColor: autoFilling ? "rgba(255,255,255,0.06)" : "var(--mq-accent)",
                        color: "var(--mq-text)",
                      }}
                    >
                      {autoFilling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                      {autoFilling ? "Добавление..." : "Автозаполнить"}
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        if (playlistRecs.length > 0) playTrack(playlistRecs[0], [...selectedPlaylist.tracks, ...playlistRecs]);
                      }}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-[11px] font-medium"
                      style={{ backgroundColor: "var(--mq-card-hover)", color: "var(--mq-text)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <Play className="w-2.5 h-2.5" style={{ marginLeft: 1 }} />
                      Все
                    </motion.button>
                  </>
                )}
              </div>
            </div>
            {playlistRecsLoading && (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--mq-card)" }}>
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--mq-text-muted)" }} />
                    <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>Поиск похожих треков...</span>
                  </div>
                ))}
              </div>
            )}
            {!playlistRecsLoading && playlistRecs.length > 0 && (
              <div className="space-y-2">
                {playlistRecs.slice(0, 50).map((track, i) => (
                  <div key={track.id} className="relative group">
                    <TrackCard track={track} index={i} queue={[...selectedPlaylist.tracks, ...playlistRecs]} onArtistClick={(name, cover) => setSelectedArtist({ name, avatar: cover })} />
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => {
                        const { playlists: currentPlaylists } = useAppStore.getState();
                        useAppStore.setState({
                          playlists: currentPlaylists.map(p =>
                            p.id === selectedPlaylist.id
                              ? { ...p, tracks: [...p.tracks, track] }
                              : p
                          ),
                        });
                        setPlaylistRecs(prev => prev.filter(t => t.id !== track.id));
                        toast({ title: "Добавлено", description: `${track.artist} — ${track.title}` });
                      }}
                      className="absolute top-3 right-3 p-1.5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                      style={{ color: "var(--mq-accent)", backgroundColor: "var(--mq-card)", boxShadow: "var(--mq-shadow-card)" }}
                      title="Добавить в плейлист"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </motion.button>
                  </div>
                ))}
              </div>
            )}
            {!playlistRecsLoading && playlistRecs.length === 0 && selectedPlaylist.tracks.length >= 3 && (
              <p className="text-xs text-center py-4" style={{ color: "var(--mq-text-muted)", opacity: 0.5 }}>
                Не удалось найти похожие треки
              </p>
            )}
          </div>
        )}
        </ScrollReveal>

        {/* Export modal */}
        <PlaylistExportView
          isOpen={showExport}
          onClose={() => setShowExport(false)}
          playlistName={selectedPlaylist.name}
          tracks={selectedPlaylist.tracks}
          cover={selectedPlaylist.cover}
        />
      </div>
    );
  }

  // ── All playlists grid ──
  return (
    <div className={`${compactMode ? "p-3 lg:p-4 pb-[var(--mq-player-clearance)] sm:pb-24 lg:pb-24 space-y-4" : "p-4 lg:p-6 pb-[var(--mq-player-clearance)] sm:pb-24 lg:pb-28 space-y-6"} max-w-[var(--mq-container-narrow)] mx-auto`} style={{ scrollBehavior: "smooth" }}>
      <ScrollReveal direction="up" delay={0.05}>
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <h1 className="text-xl font-bold truncate min-w-0" style={{ color: "var(--mq-text)", letterSpacing: "-0.02em" }}>
            Плейлисты
          </h1>
          <div className="flex items-center gap-2 flex-shrink-0">
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold"
              style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
            >
              <Plus className="w-3.5 h-3.5" />
              Создать
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium"
              style={{ backgroundColor: "var(--mq-card)", color: "var(--mq-text-muted)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <Download className="w-3.5 h-3.5" />
              Импорт
            </motion.button>
          </div>
        </div>
        <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
          {playlists.length} плейлистов
        </p>
      </motion.div>
      </ScrollReveal>

      {/* Create playlist dialog */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl p-5 space-y-3"
            style={{ backgroundColor: "var(--mq-card)", boxShadow: "var(--mq-shadow-card-hover)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold" style={{ color: "var(--mq-text)" }}>Новый плейлист</h3>
              <button onClick={() => setShowCreate(false)} style={{ color: "var(--mq-text-muted)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Название плейлиста"
              className="w-full rounded-2xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--mq-accent)]"
              style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--mq-text)" }}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Описание (необязательно)"
              className="w-full rounded-2xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--mq-accent)]"
              style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--mq-text)" }}
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="w-full py-2.5 rounded-2xl text-sm font-medium"
              style={{
                backgroundColor: newName.trim() ? "var(--mq-accent)" : "rgba(255,255,255,0.06)",
                color: newName.trim() ? "var(--mq-text)" : "var(--mq-text-muted)",
              }}
            >
              Создать
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import playlist dialog */}
      <AnimatePresence>
        {showImport && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl p-5 space-y-3"
            style={{ backgroundColor: "var(--mq-card)", boxShadow: "var(--mq-shadow-card-hover)" }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold" style={{ color: "var(--mq-text)" }}>Импорт плейлиста</h3>
              <button onClick={() => { setShowImport(false); setImportError(""); setImportHint(""); setVkToken(""); setShowVkToken(false); }} style={{ color: "var(--mq-text-muted)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setImportMode('text')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: importMode === 'text' ? "var(--mq-accent)" : "rgba(255,255,255,0.04)",
                  color: importMode === 'text' ? "var(--mq-text)" : "var(--mq-text-muted)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <ListMusic className="w-3 h-3" /> Текстом
              </button>
              <button
                onClick={() => setImportMode('url')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: importMode === 'url' ? "var(--mq-accent)" : "rgba(255,255,255,0.04)",
                  color: importMode === 'url' ? "var(--mq-text)" : "var(--mq-text-muted)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <Link className="w-3 h-3" /> По ссылке
              </button>
            </div>

            {importMode === 'text' ? (
              <>
                <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                  Вставьте названия треков (каждый на новой строке в формате «Исполнитель - Название»):
                </p>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={"Artist - Track Name\nArtist2 - Track Name 2"}
                  rows={6}
                  className="w-full rounded-2xl px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-[var(--mq-accent)]"
                  style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--mq-text)" }}
                />
                <button
                  onClick={async () => {
                    if (!importText.trim()) return;
                    setImporting(true);
                    const id = `pl_import_${Date.now()}`;
                    const lines = importText.trim().split("\n").filter(l => l.trim());
                    const tracks: Track[] = [];
                    for (let i = 0; i < lines.length; i++) {
                      setImportProgress(`Поиск трека ${i + 1} из ${lines.length}...`);
                      const line = lines[i];
                      const parts = line.split(" - ");
                      const title = (parts[1] || parts[0] || "").trim();
                      const artist = (parts[1] ? parts[0] : "Unknown Artist").trim();
                      try {
                        const query = `${artist} ${title}`;
                        const res = await fetch(`/api/music/search?q=${encodeURIComponent(query)}`);
                        if (res.ok) {
                          const data = await res.json();
                          if (data.tracks && data.tracks.length > 0) {
                            tracks.push(data.tracks[0]);
                            continue;
                          }
                        }
                      } catch {}
                      tracks.push({
                        id: `import_${i}_${Date.now()}`,
                        title, artist, album: "", cover: "", duration: 0, genre: "",
                        source: "soundcloud" as const, audioUrl: "", scTrackId: undefined, scIsFull: false,
                      } as Track);
                    }
                    const newPl: UserPlaylist = {
                      id, name: `Импорт ${new Date().toLocaleDateString("ru-RU")}`,
                      description: `${tracks.length} треков`, cover: "", tracks, createdAt: Date.now(),
                    };
                    useAppStore.setState(s => ({ playlists: [...s.playlists, newPl] }));
                    setShowImport(false); setImportText(""); setImporting(false); setImportProgress("");
                    toast({ title: "Плейлист импортирован", description: `${tracks.length} треков добавлено` });
                  }}
                  disabled={!importText.trim() || importing}
                  className="w-full py-2.5 rounded-2xl text-sm font-medium flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: importText.trim() && !importing ? "var(--mq-accent)" : "rgba(255,255,255,0.06)",
                    color: importText.trim() && !importing ? "var(--mq-text)" : "var(--mq-text-muted)",
                  }}
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {importing
                    ? (importProgress || "Импортирование...")
                    : `Импортировать (${importText.trim().split("\n").filter(l => l.trim()).length} треков)`}
                </button>
              </>
            ) : (
              <>
                <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                  Вставьте ссылку на плейлист (VK, Яндекс.Музыка, YouTube, Apple Music, SoundCloud):
                </p>
                <div className="flex gap-2">
                  <input
                    ref={importInputRef}
                    type="url"
                    value={importUrl}
                    onChange={(e) => { setImportUrl(e.target.value); setImportError(""); setImportHint(""); }}
                    placeholder="https://music.youtube.com/playlist/..."
                    className="flex-1 rounded-2xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--mq-accent)]"
                    style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--mq-text)" }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !importing && importUrl.trim()) triggerUrlImport(); }}
                  />
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={triggerUrlImport}
                    disabled={importing || !importUrl.trim()}
                    className="px-4 py-2 rounded-2xl text-sm font-medium"
                    style={{
                      backgroundColor: importUrl.trim() && !importing ? "var(--mq-accent)" : "rgba(255,255,255,0.06)",
                      color: importUrl.trim() && !importing ? "var(--mq-text)" : "var(--mq-text-muted)",
                    }}
                  >
                    {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </motion.button>
                </div>
                {(showVkToken || /vk\.com/i.test(importUrl)) && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium" style={{ color: "var(--mq-text)" }}>VK API-токен</label>
                      <a href="https://vk.com/dev/audio.getPlaylistById" target="_blank" rel="noopener noreferrer"
                        className="text-[11px] underline" style={{ color: "var(--mq-accent)" }}>Как получить?</a>
                    </div>
                    <input
                      type={showVkToken ? "text" : "password"}
                      value={vkToken}
                      onChange={(e) => { setVkToken(e.target.value); setImportError(""); setImportHint(""); }}
                      placeholder="vk1.a.abc..."
                      className="w-full rounded-2xl px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-[var(--mq-accent)]"
                      style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--mq-text)" }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !importing && importUrl.trim()) triggerUrlImport(); }}
                    />
                  </div>
                )}
                {importing && importProgress && (
                  <div className="flex items-center gap-2 py-1">
                    <Loader2 className="w-3 h-3 animate-spin" style={{ color: "var(--mq-accent)" }} />
                    <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>{importProgress}</p>
                  </div>
                )}
                {importError && (
                  <div className="space-y-1">
                    <div className="flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#ef4444" }} />
                      <p className="text-xs" style={{ color: "#ef4444" }}>{importError}</p>
                    </div>
                  </div>
                )}
                {importHint && !importing && (
                  <div className="rounded-2xl p-2.5" style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-[11px] leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
                      {importHint}
                    </p>
                  </div>
                )}
                <p className="text-[11px]" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
                  Поддержка: VK, Яндекс.Музыка, YouTube Music, Apple Music, SoundCloud
                </p>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Playlist grid — horizontal scroll with proper card sizes */}
      <ScrollReveal direction="up" delay={0.1}>
      {playlists.length > 0 ? (
        <div className="relative group/playlistRow">
          <div ref={playlistScrollRef} className="flex gap-3 overflow-x-auto scrollbar-none mq-scroll-row pb-2"
            style={{ scrollSnapType: 'x proximity' }}>
          {sortedPlaylists.map((pl, i) => {
            const plDur = formatTotalDuration(pl.tracks);
            const isPlCollaborative = pl.id.startsWith('pl_url_') || pl.description?.includes('воспроизводимы');

            return (
              <motion.div
                key={pl.id}
                initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setSelectedPlaylistId(pl.id)}
                className="rounded-2xl p-3 cursor-pointer relative group flex-shrink-0 w-[140px]"
                style={{ backgroundColor: "var(--mq-card)", boxShadow: "var(--mq-shadow-card)" }}
              >
                {/* Cover with upload hover + zoom on hover — larger now */}
                <div className="relative group/cover w-full aspect-square rounded-2xl overflow-hidden mb-3 flex items-center justify-center"
                  style={pl.cover
                    ? { backgroundColor: "transparent" }
                    : { background: generateGradientCover(pl.name) }
                  }>
                  {pl.cover ? (
                    <img src={pl.cover} alt="" className="w-full h-full object-cover group-hover/cover:scale-110 transition-transform duration-300" />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 w-full h-full" style={generatePatternStyle(pl.name)}>
                      <ListMusic className="w-8 h-8" style={{ color: "rgba(255,255,255,0.6)" }} />
                      <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>{pl.tracks.length}</span>
                    </div>
                  )}
                  {/* Hover overlay for changing cover */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/cover:opacity-100 transition-opacity flex items-center justify-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/jpeg,image/png,image/webp';
                      input.onchange = (ev) => {
                        const file = (ev.target as HTMLInputElement).files?.[0];
                        if (file) handleCoverUpload(pl.id, file);
                      };
                      input.click();
                    }}
                  >
                    {coverUploadingId === pl.id ? (
                      <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#fff" }} />
                    ) : (
                      <Camera className="w-5 h-5" style={{ color: "#fff" }} />
                    )}
                  </div>
                  {/* Play button overlay */}
                  {pl.tracks.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      whileHover={{ scale: 1.05 }}
                      className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); handlePlayAll(pl); }}
                    >
                      <div className="w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md"
                        style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "var(--mq-text)" }}>
                        <Play className="w-4 h-4 ml-0.5" />
                      </div>
                    </motion.div>
                  )}
                </div>
                {editingId === pl.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 text-sm rounded-lg px-1 py-0.5 min-w-0"
                      style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--mq-text)" }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(pl.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                    />
                    <button onClick={() => handleRename(pl.id)} style={{ color: "var(--mq-accent)" }}>
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }} title={pl.name}>
                        {pl.name}
                      </p>
                      {pinnedIds.has(pl.id) && (
                        <Pin className="w-3 h-3 flex-shrink-0" style={{ color: "var(--mq-accent)", fill: "currentColor" }} />
                      )}
                      {isPlCollaborative && (
                        <Users className="w-3 h-3 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] px-1.5 py-0.5 rounded-full" style={{ color: "var(--mq-text-muted)", backgroundColor: "rgba(255,255,255,0.06)" }}>
                        {pl.tracks.length} треков
                      </span>
                      {plDur && (
                        <span className="text-[11px] flex items-center gap-0.5" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
                          <Clock className="w-2.5 h-2.5" />
                          {plDur}
                        </span>
                      )}
                    </div>
                  </>
                )}
                {/* Hover actions — pin, edit, delete */}
                <div
                  className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => togglePin(pl.id)}
                    className="p-1 rounded transition-all duration-200"
                    style={{ color: pinnedIds.has(pl.id) ? "var(--mq-accent)" : "var(--mq-text-muted)", backgroundColor: "var(--mq-bg)" }}
                    title={pinnedIds.has(pl.id) ? "Открепить" : "Закрепить"}
                  >
                    <Pin className="w-3 h-3" style={pinnedIds.has(pl.id) ? { fill: "currentColor" } : {}} />
                  </button>
                  {editingId !== pl.id && (
                    <button
                      onClick={() => { setEditingId(pl.id); setEditName(pl.name); setEditDesc(pl.description); }}
                      className="p-1 rounded transition-all duration-200"
                      style={{ color: "var(--mq-text-muted)", backgroundColor: "var(--mq-bg)" }}
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => deletePlaylist(pl.id)}
                    className="p-1 rounded transition-all duration-200"
                    style={{ color: "#ef4444", backgroundColor: "var(--mq-bg)" }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </motion.div>
            );
          })}
          </div>
          {/* PC scroll buttons — hidden on mobile */}
          <button
            onClick={() => {
              if (playlistScrollRef.current) {
                playlistScrollRef.current.scrollBy({ left: -300, behavior: 'smooth' });
              }
            }}
            className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center opacity-0 group-hover/playlistRow:opacity-100 transition-opacity z-10"
            style={{ background: 'var(--mq-card)', border: '1px solid var(--mq-border)', color: 'var(--mq-text)' }}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (playlistScrollRef.current) {
                playlistScrollRef.current.scrollBy({ left: 300, behavior: 'smooth' });
              }
            }}
            className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full items-center justify-center opacity-0 group-hover/playlistRow:opacity-100 transition-opacity z-10"
            style={{ background: 'var(--mq-card)', border: '1px solid var(--mq-border)', color: 'var(--mq-text)' }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        /* Empty state using unified EmptyState component */
        <div className="rounded-2xl" style={{ backgroundColor: "var(--mq-card)" }}>
          <EmptyState
            type="playlists"
            action={{ label: "Создать плейлист", onClick: () => setShowCreate(true) }}
          />
          <div className="flex items-center justify-center gap-3 pb-6 -mt-2">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--mq-text-muted)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <Download className="w-4 h-4" />
              Импорт
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowSmartBuilder(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
              style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 10%, transparent)", color: "var(--mq-accent)", border: "1px solid color-mix(in srgb, var(--mq-accent) 20%, transparent)" }}
            >
              <Sparkles className="w-4 h-4" />
              Smart Playlist
            </motion.button>
          </div>
        </div>
      )}

      {/* Smart Playlist Builder modal */}
      <AnimatePresence>
        {showSmartBuilder && (
          <SmartPlaylistBuilder
            onClose={() => setShowSmartBuilder(false)}
            onPlayTracks={(tracks) => {
              if (tracks.length > 0) {
                playTrack(tracks[0], tracks);
                setShowSmartBuilder(false);
              }
            }}
          />
        )}
      </AnimatePresence>
      </ScrollReveal>
    </div>
  );
}
