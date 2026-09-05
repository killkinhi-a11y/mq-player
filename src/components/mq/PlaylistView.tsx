"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useAppStore, type UserPlaylist } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import { type Track, formatDuration } from "@/lib/musicApi";
import {
  Plus, Trash2, Play, ListMusic, ChevronLeft,
  Edit3, X, Check, Clock, Heart, Download, Loader2, AlertCircle,
  Camera, Shuffle, Pin, MoreVertical, Music, Share2, MoreHorizontal,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "./EmptyState";
import ContextMenu from "./ContextMenu";
import { NowPlayingEqualizer } from "./NowPlayingEqualizer";

// ─── helpers ──────────────────────────────────────────────────────────────

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}

// Premium gradient covers — 6 distinct palettes, deterministic by name
const COVER_PALETTES: { from: string; to: string; angle: number }[] = [
  { from: "#2d1b3d", to: "#0e0e0e", angle: 135 },
  { from: "#1b2d3a", to: "#0e0e0e", angle: 135 },
  { from: "#3d2b1b", to: "#0e0e0e", angle: 135 },
  { from: "#1b3a2d", to: "#0e0e0e", angle: 135 },
  { from: "#3a1b2d", to: "#0e0e0e", angle: 135 },
  { from: "#2d2d1b", to: "#0e0e0e", angle: 135 },
];

function gradientCover(name: string): string {
  const h = hashString(name);
  const p = COVER_PALETTES[h % COVER_PALETTES.length];
  return `linear-gradient(${p.angle}deg, ${p.from}, ${p.to})`;
}

function patternStyle(name: string): React.CSSProperties {
  const h = hashString(name);
  const kind = h % 3;
  if (kind === 0) {
    return { backgroundImage: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.06) 0%, transparent 50%)` };
  }
  if (kind === 1) {
    return { backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 12px, rgba(255,255,255,0.025) 12px, rgba(255,255,255,0.025) 24px)` };
  }
  return { backgroundImage: `radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.05) 0%, transparent 70%)` };
}

function formatTotalDuration(tracks: Track[]): string {
  const totalSec = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  if (totalSec <= 0) return "";
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `~${h} ч ${m} мин`;
  return `~${m} мин`;
}

// ─── main component ───────────────────────────────────────────────────────

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
  const setView = useAppStore((s) => s.setView);
  const compactMode = useAppStore((s) => s.compactMode);
  const setSelectedArtist = useAppStore((s) => s.setSelectedArtist);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const storeIsPlaying = useAppStore((s) => s.isPlaying);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const addToPlaylist = useAppStore((s) => s.addToPlaylist);
  const { toast } = useToast();

  // ── local state ──
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importHint, setImportHint] = useState("");
  const [importProgress, setImportProgress] = useState("");
  const [importMode, setImportMode] = useState<"url" | "text">("url");
  const [importText, setImportText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [coverUploadingId, setCoverUploadingId] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("mq-pinned-playlists");
      return new Set(stored ? JSON.parse(stored) : []);
    } catch {
      return new Set();
    }
  });
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Persist pinned set
  useEffect(() => {
    try {
      localStorage.setItem("mq-pinned-playlists", JSON.stringify([...pinnedIds]));
    } catch {}
  }, [pinnedIds]);

  // Close context menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = () => setMenuOpenId(null);
    const t = setTimeout(() => window.addEventListener("click", handler), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("click", handler);
    };
  }, [menuOpenId]);

  // Reset selected playlist on unmount (so re-entry shows grid)
  useEffect(() => {
    return () => {
      // Defer to avoid React #300 — don't update store during commit phase
      setTimeout(() => useAppStore.getState().setSelectedPlaylistId(null), 0);
    };
  }, []);

  const selectedPlaylist = useMemo(
    () => playlists.find((p) => p.id === selectedPlaylistId) || null,
    [playlists, selectedPlaylistId]
  );

  const sortedPlaylists = useMemo(() => {
    return [...playlists].sort((a, b) => {
      const ap = pinnedIds.has(a.id) ? 1 : 0;
      const bp = pinnedIds.has(b.id) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return b.createdAt - a.createdAt;
    });
  }, [playlists, pinnedIds]);

  // ── handlers ──

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;
    // P2-#300: defer store update to next macrotask
    setTimeout(() => {
      createPlaylist(newName.trim(), newDesc.trim());
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
    }, 0);
  }, [newName, newDesc, createPlaylist]);

  const handleStartRename = useCallback((pl: UserPlaylist) => {
    setEditingId(pl.id);
    setEditName(pl.name);
    setMenuOpenId(null);
  }, []);

  const handleConfirmRename = useCallback(() => {
    if (!editingId) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    setTimeout(() => renamePlaylist(editingId, trimmed), 0);
    setEditingId(null);
  }, [editingId, editName, renamePlaylist]);

  const handleDelete = useCallback((pl: UserPlaylist) => {
    setMenuOpenId(null);
    // Replace native confirm() with undo toast — premium UX, no blocking dialog
    setTimeout(() => deletePlaylist(pl.id), 0);
    toast({
      title: "Плейлист удалён",
      description: `${pl.name} · ${pl.tracks.length} треков`,
      action: {
        label: "Отменить",
        onClick: () => {
          // Re-add the playlist
          useAppStore.setState(s => ({ playlists: [...s.playlists, pl] }));
          toast({ title: "Плейлист восстановлен" });
        },
      },
    });
  }, [deletePlaylist, toast]);

  const handleTogglePin = useCallback((id: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setMenuOpenId(null);
  }, []);

  const handlePlayAll = useCallback((pl: UserPlaylist) => {
    if (pl.tracks.length === 0) {
      toast({ title: "Плейлист пуст", description: "Добавьте треки в плейлист" });
      return;
    }
    setTimeout(() => playTrack(pl.tracks[0], [...pl.tracks], pl.id), 0);
  }, [playTrack, toast]);

  const handleShufflePlay = useCallback((pl: UserPlaylist) => {
    if (pl.tracks.length === 0) return;
    const shuffled = [...pl.tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setTimeout(() => {
      const s = useAppStore.getState();
      if (!s.shuffle) s.toggleShuffle();
      playTrack(shuffled[0], shuffled, pl.id);
    }, 0);
  }, [playTrack]);

  const handleCoverUpload = useCallback(async (playlistId: string, file: File) => {
    setCoverUploadingId(playlistId);
    try {
      if (file.size > 8 * 1024 * 1024) {
        toast({ title: "Файл слишком большой", description: "Макс. 8 МБ" });
        return;
      }
      // Convert to base64 data URL — store locally (no server upload needed)
      // P0 fix: use functional setState to avoid race condition when multiple
      // uploads happen in quick succession. Was: snapshot getState() then
      // setState with stale data — second upload would overwrite first.
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        useAppStore.setState(s => ({
          playlists: s.playlists.map(p => p.id === playlistId ? { ...p, cover: dataUrl } : p),
        }));
        toast({ title: "Обложка установлена" });
      };
      reader.onerror = () => {
        toast({ title: "Не удалось загрузить", description: "Попробуйте другое изображение" });
      };
      reader.readAsDataURL(file);
    } catch {
      toast({ title: "Не удалось загрузить" });
    } finally {
      setCoverUploadingId(null);
    }
  }, [toast]);

  const handleRemoveCover = useCallback((playlistId: string) => {
    // P0 fix: functional setState to avoid race condition
    useAppStore.setState(s => ({
      playlists: s.playlists.map(p => p.id === playlistId ? { ...p, cover: "" } : p),
    }));
  }, []);

  // Parse text like "Artist - Title" (one per line) and search them on SoundCloud.
  // This is the fallback when direct playlist URL import fails (e.g. Yandex.Music
  // blocks server-side requests from outside Russia).
  const triggerTextImport = useCallback(async () => {
    const text = importText.trim();
    if (!text || importing) return;

    // Each non-empty line should look like "Artist - Title" or "Title - Artist"
    const lines = text.split("\n").map(l => l.trim()).filter(l => l && l.length > 2);
    if (lines.length === 0) {
      setImportError("Вставьте хотя бы один трек в формате «Исполнитель — Название».");
      return;
    }

    setImporting(true);
    setImportError("");
    setImportHint("");
    setImportProgress(`Поиск треков: 0/${lines.length}…`);

    try {
      const results: any[] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Split on " — " (em-dash), " - ", " – "
        const m = line.match(/^(.+?)\s*[—–-]\s*(.+)$/);
        const artist = m ? m[1].trim() : "";
        const title = m ? m[2].trim() : line;
        const query = artist ? `${artist} ${title}` : title;
        setImportProgress(`Поиск: ${i + 1}/${lines.length} — ${query.slice(0, 40)}…`);
        try {
          const res = await fetch(`/api/music/search?q=${encodeURIComponent(query)}`);
          if (res.ok) {
            const data = await res.json();
            const t = data.tracks?.[0];
            if (t) {
              results.push({
                title: t.title || title,
                artist: t.artist || artist,
                cover: t.cover || "",
                duration: t.duration || 0,
                scTrackId: t.scTrackId || null,
                scStreamPolicy: t.scStreamPolicy || "",
                scIsFull: t.scIsFull || false,
                audioUrl: t.audioUrl || "",
                album: t.album || "",
                genre: t.genre || "",
              });
            }
          }
        } catch {}
        // Tiny delay to not hammer the API
        await new Promise(r => setTimeout(r, 60));
      }

      if (results.length === 0) {
        setImportError("Ничего не найдено. Проверьте формат: «Исполнитель — Название» по строке.");
        return;
      }

      const tracks: Track[] = results.map((t, i) => ({
        id: t.scTrackId ? `sc_${t.scTrackId}` : `imp_${i}_${Date.now()}`,
        title: t.title,
        artist: t.artist,
        album: t.album,
        cover: t.cover,
        duration: t.duration,
        genre: t.genre,
        audioUrl: t.audioUrl,
        previewUrl: "",
        source: "soundcloud" as const,
        scTrackId: t.scTrackId,
        scStreamPolicy: t.scStreamPolicy,
        scIsFull: t.scIsFull,
      }));

      const playableCount = tracks.filter(t => !!t.scTrackId).length;

      const newPl: UserPlaylist = {
        id: `pl_url_${Date.now()}`,
        name: `Импорт ${new Date().toLocaleDateString("ru-RU")}`,
        description: `${tracks.length} треков · из текста${playableCount > 0 && playableCount < tracks.length ? ` · ${playableCount} воспроизводимы` : ""}`,
        cover: "",
        tracks,
        createdAt: Date.now(),
      };

      setTimeout(() => useAppStore.setState(s => ({ playlists: [...s.playlists, newPl] })), 0);
      setShowImport(false);
      setImportText("");
      setImportProgress("");
      toast({
        title: "Плейлист импортирован",
        description: `${tracks.length} треков${playableCount > 0 ? ` · ${playableCount} воспроизводимы` : ""}`,
      });
    } catch (e) {
      setImportError("Не удалось импортировать. Попробуйте ещё раз.");
    } finally {
      setImporting(false);
      setImportProgress("");
    }
  }, [importText, importing, toast]);

  const triggerUrlImport = useCallback(async () => {
    if (!importUrl.trim() || importing) return;
    setImporting(true);
    setImportError("");
    setImportHint("");
    setImportProgress("Импорт…");
    try {
      const res = await fetch("/api/music/import-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const data = await res.json();

      // Handle VK token requirement
      if (data.needVkToken) {
        setImportError("VK требует API-токен. Используйте «Импорт текстом» — вставьте список треков вручную.");
        setImportHint("Откройте плейлист в VK, скопируйте названия треков и вставьте их в режиме «Импорт текстом».");
        return;
      }

      if (data.error && (!data.tracks || data.tracks.length === 0)) {
        setImportError(data.error);
        // Backend returns a hint with a workaround — show it
        if (data.hint) setImportHint(data.hint);
        return;
      }

      const tracks: Track[] = (data.tracks || []).map((t: any, i: number) => ({
        id: t.id || (t.scTrackId ? `sc_${t.scTrackId}` : `imp_${i}_${Date.now()}`),
        title: t.title || t.name || "Unknown",
        artist: t.artist || t.artists?.[0]?.name || "Unknown Artist",
        album: t.album || "",
        cover: t.cover || t.image || "",
        duration: t.duration || 0,
        genre: t.genre || "",
        audioUrl: t.audioUrl || "",
        previewUrl: t.previewUrl || "",
        source: "soundcloud" as const,
        scTrackId: t.scTrackId || null,
        scStreamPolicy: t.scStreamPolicy || "",
        scIsFull: t.scIsFull || false,
      }));

      const playableCount = tracks.filter(t => !!t.scTrackId).length;
      const totalCount = tracks.length;

      if (totalCount === 0) {
        setImportError("Треки не найдены. Попробуйте другую ссылку или «Импорт текстом».");
        return;
      }

      const newPl: UserPlaylist = {
        id: `pl_url_${Date.now()}`,
        name: data.name || `Импорт ${new Date().toLocaleDateString("ru-RU")}`,
        description: `${totalCount} треков · ${data.source || "внешний сервис"}` +
          (playableCount > 0 && playableCount < totalCount ? ` · ${playableCount} воспроизводимы` : ""),
        cover: data.cover || "",
        tracks,
        createdAt: Date.now(),
      };

      setTimeout(() => useAppStore.setState(s => ({ playlists: [...s.playlists, newPl] })), 0);
      setShowImport(false);
      setImportUrl("");
      setImportProgress("");
      toast({
        title: "Плейлист импортирован",
        description: `${totalCount} треков${playableCount > 0 ? ` · ${playableCount} воспроизводимы` : ""}`,
      });
    } catch (e) {
      setImportError("Не удалось импортировать. Проверьте ссылку или используйте «Импорт текстом».");
    } finally {
      setImporting(false);
      setImportProgress("");
    }
  }, [importUrl, importing, toast]);

  // ── detail view ──
  if (selectedPlaylist) {
    const pl = selectedPlaylist;
    const totalDur = formatTotalDuration(pl.tracks);
    const isPlPlaying = currentTrack && pl.tracks.some(t => t.id === currentTrack.id) && storeIsPlaying;

    return (
      <div className={`${compactMode ? "p-3 lg:p-4" : "p-4 lg:p-6"} max-w-[var(--mq-container-narrow)] mx-auto pb-32 lg:pb-28`}>
        {/* Back */}
        <motion.button
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setSelectedPlaylistId(null)}
          className="flex items-center gap-1.5 text-sm mb-5"
          style={{ color: "var(--mq-text-muted)" }}
        >
          <ChevronLeft className="w-4 h-4" />
          Все плейлисты
        </motion.button>

        {/* Header — cinematic */}
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 16 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative rounded-3xl overflow-hidden mb-6"
          style={{
            background: pl.cover
              ? `linear-gradient(180deg, transparent 0%, var(--mq-bg) 100%), url(${pl.cover}) center/cover`
              : gradientCover(pl.name),
            border: "1px solid var(--mq-border-thin)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          }}
        >
          {/* Dark overlay for readability */}
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%)" }} />

          <div className="relative p-5 sm:p-7 flex flex-col sm:flex-row gap-5 sm:items-end">
            {/* Cover */}
            <div className="relative group/cover flex-shrink-0 self-start sm:self-end">
              <div
                className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl overflow-hidden flex items-center justify-center shadow-2xl"
                style={pl.cover ? { backgroundColor: "transparent" } : { background: gradientCover(pl.name) }}
              >
                {pl.cover ? (
                  <img src={pl.cover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center w-full h-full" style={patternStyle(pl.name)}>
                    <ListMusic className="w-12 h-12" style={{ color: "rgba(255,255,255,0.7)" }} />
                  </div>
                )}
              </div>
              {/* Cover upload */}
              <button
                className="absolute inset-0 rounded-2xl bg-black/60 sm:opacity-0 sm:group-hover/cover:opacity-100 transition-opacity flex items-center justify-center"
                onClick={() => coverInputRef.current?.click()}
              >
                {coverUploadingId === pl.id ? (
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                ) : (
                  <Camera className="w-5 h-5 text-white" />
                )}
              </button>
              {pl.cover && (
                <button
                  className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center"
                  onClick={(e) => { e.stopPropagation(); handleRemoveCover(pl.id); }}
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              )}
              <input
                ref={coverInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCoverUpload(pl.id, f);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Плейлист
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2 break-words">
                {pl.name}
              </h1>
              {pl.description && (
                <p className="text-sm mb-3" style={{ color: "rgba(255,255,255,0.6)" }}>
                  {pl.description}
                </p>
              )}
              <div className="flex items-center gap-3 text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                <span className="flex items-center gap-1">
                  <Music className="w-3 h-3" />
                  {pl.tracks.length} треков
                </span>
                {totalDur && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {totalDur}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action bar */}
          <div className="relative px-5 sm:px-7 pb-5 sm:pb-7 flex items-center gap-3">
            <motion.button
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.04 }}
              onClick={() => isPlPlaying ? togglePlay() : handlePlayAll(pl)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-sm shadow-lg"
              style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
            >
              <Play className="w-4 h-4" fill="currentColor" />
              {isPlPlaying ? "Пауза" : "Слушать"}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.04 }}
              onClick={() => handleShufflePlay(pl)}
              disabled={pl.tracks.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium"
              style={{
                backgroundColor: "rgba(255,255,255,0.1)",
                color: "#fff",
                backdropFilter: "blur(10px)",
                opacity: pl.tracks.length === 0 ? 0.4 : 1,
              }}
            >
              <Shuffle className="w-4 h-4" />
              Перемешать
            </motion.button>
          </div>
        </motion.div>

        {/* Track list */}
        {pl.tracks.length > 0 ? (
          <div className="space-y-1">
            <AnimatePresence>
              {pl.tracks.map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id;
                const isLiked = likedTrackIds.includes(track.id);
                return (
                  <motion.div
                    key={track.id + "_" + idx}
                    initial={animationsEnabled ? { opacity: 0, y: 6 } : undefined}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.4) }}
                  >
                    <TrackRow
                      track={track}
                      index={idx + 1}
                      isCurrent={isCurrent}
                      isPlaying={isCurrent && storeIsPlaying}
                      isLiked={isLiked}
                      onPlay={() => playTrack(track, pl.tracks, pl.id)}
                      onLike={() => toggleLike(track.id, track)}
                      onRemove={() => setTimeout(() => removeFromPlaylist(pl.id, track.id), 0)}
                      onArtistClick={() => {
                        if (track.artist) {
                          setSelectedArtist({ name: track.artist });
                          setView("main");
                        }
                      }}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        ) : (
          <EmptyState
            type="tracks"
            title="В плейлисте пусто"
            description="Найдите треки через поиск и добавьте их сюда"
            action={{ label: "Перейти к поиску", onClick: () => setView("search") }}
          />
        )}
      </div>
    );
  }

  // ── grid view ──
  return (
    <div className={`${compactMode ? "p-3 lg:p-4" : "p-4 lg:p-6"} max-w-[var(--mq-container-narrow)] mx-auto pb-32 lg:pb-24`}>
      {/* Header */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-5 flex items-end justify-between gap-3 flex-wrap"
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight" style={{ color: "var(--mq-text)", letterSpacing: "-0.02em" }}>
            Плейлисты
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>
            {playlists.length > 0 ? `${playlists.length} ${pluralRu(playlists.length, "плейлист", "плейлиста", "плейлистов")}` : "Создайте свою коллекцию"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.03 }}
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm"
            style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
          >
            <Plus className="w-3.5 h-3.5" />
            Создать
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.03 }}
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium"
            style={{ backgroundColor: "var(--mq-card)", color: "var(--mq-text-muted)", border: "1px solid var(--mq-border-thin)" }}
          >
            <Download className="w-3.5 h-3.5" />
            Импорт
          </motion.button>
        </div>
      </motion.div>

      {/* Create dialog */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="overflow-hidden mb-4"
          >
            <motion.div
              initial={{ y: -8 }}
              animate={{ y: 0 }}
              className="rounded-2xl p-5 space-y-3"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border-thin)", boxShadow: "var(--mq-shadow-card)" }}
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
                placeholder="Название"
                className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
                style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border-thin)", color: "var(--mq-text)" }}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Описание (необязательно)"
                className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
                style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border-thin)", color: "var(--mq-text)" }}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "var(--mq-text-muted)" }}
                >
                  Отмена
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                  style={{
                    backgroundColor: newName.trim() ? "var(--mq-accent)" : "rgba(255,255,255,0.06)",
                    color: newName.trim() ? "#fff" : "var(--mq-text-muted)",
                  }}
                >
                  Создать
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import dialog */}
      <AnimatePresence>
        {showImport && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="overflow-hidden mb-4"
          >
            <motion.div
              initial={{ y: -8 }}
              animate={{ y: 0 }}
              className="rounded-2xl p-5 space-y-3"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border-thin)", boxShadow: "var(--mq-shadow-card)" }}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold" style={{ color: "var(--mq-text)" }}>Импорт плейлиста</h3>
                <button onClick={() => setShowImport(false)} style={{ color: "var(--mq-text-muted)" }}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Mode switcher — URL vs Text */}
              <div
                className="flex gap-1 p-1 rounded-xl"
                style={{ backgroundColor: "var(--mq-input-bg)" }}
              >
                <button
                  onClick={() => { setImportMode("url"); setImportError(""); setImportHint(""); }}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    backgroundColor: importMode === "url" ? "var(--mq-accent)" : "transparent",
                    color: importMode === "url" ? "#fff" : "var(--mq-text-muted)",
                  }}
                >
                  По ссылке
                </button>
                <button
                  onClick={() => { setImportMode("text"); setImportError(""); setImportHint(""); }}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    backgroundColor: importMode === "text" ? "var(--mq-accent)" : "transparent",
                    color: importMode === "text" ? "#fff" : "var(--mq-text-muted)",
                  }}
                >
                  Из текста
                </button>
              </div>

              {importMode === "url" ? (
                <>
                  <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                    VK · Яндекс.Музыка · YouTube Music · Apple Music · SoundCloud
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={importUrl}
                      onChange={(e) => { setImportUrl(e.target.value); setImportError(""); setImportHint(""); }}
                      placeholder="https://music.yandex.ru/playlist/..."
                      className="flex-1 rounded-xl px-3.5 py-2.5 text-sm outline-none"
                      style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border-thin)", color: "var(--mq-text)" }}
                      onKeyDown={(e) => e.key === "Enter" && triggerUrlImport()}
                      autoFocus
                    />
                    <button
                      onClick={triggerUrlImport}
                      disabled={importing || !importUrl.trim()}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium"
                      style={{
                        backgroundColor: importUrl.trim() && !importing ? "var(--mq-accent)" : "rgba(255,255,255,0.06)",
                        color: importUrl.trim() && !importing ? "#fff" : "var(--mq-text-muted)",
                      }}
                    >
                      {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
                    Вставьте список треков — по одному в строке, в формате «Исполнитель — Название».
                    Каждый трек будет найден на SoundCloud.
                  </p>
                  <textarea
                    value={importText}
                    onChange={(e) => { setImportText(e.target.value); setImportError(""); setImportHint(""); }}
                    placeholder={"Queen — Bohemian Rhapsody\nMetallica — Nothing Else Matters\nNirvana — Smells Like Teen Spirit"}
                    rows={6}
                    className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none resize-none font-mono"
                    style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border-thin)", color: "var(--mq-text)" }}
                    autoFocus
                  />
                  <button
                    onClick={triggerTextImport}
                    disabled={importing || !importText.trim()}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold"
                    style={{
                      backgroundColor: importText.trim() && !importing ? "var(--mq-accent)" : "rgba(255,255,255,0.06)",
                      color: importText.trim() && !importing ? "#fff" : "var(--mq-text-muted)",
                    }}
                  >
                    {importing
                      ? (importProgress || "Поиск…")
                      : `Импортировать${importText.trim() ? ` (${importText.trim().split("\n").filter(l => l.trim()).length} треков)` : ""}`}
                  </button>
                </>
              )}

              {importing && importProgress && importMode === "url" && (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" style={{ color: "var(--mq-accent)" }} />
                  <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>{importProgress}</p>
                </div>
              )}
              {importError && (
                <div
                  className="rounded-xl p-3"
                  style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#ef4444" }} />
                    <p className="text-xs" style={{ color: "#ef4444" }}>{importError}</p>
                  </div>
                </div>
              )}
              {importHint && !importing && (
                <div
                  className="rounded-xl p-3"
                  style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border-thin)" }}
                >
                  <p className="text-[11px] leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
                    {importHint}
                  </p>
                  {/* Quick switch to text mode button */}
                  {importMode === "url" && (
                    <button
                      onClick={() => { setImportMode("text"); setImportError(""); setImportHint(""); }}
                      className="mt-2 text-[11px] font-semibold"
                      style={{ color: "var(--mq-accent)" }}
                    >
                      Перейти к «Импорт текстом» →
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid */}
      {playlists.length === 0 ? (
        <EmptyState
          type="playlists"
          title="Нет плейлистов"
          description="Создайте свой первый плейлист или импортируйте существующий"
          action={{ label: "Создать плейлист", onClick: () => setShowCreate(true) }}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {sortedPlaylists.map((pl, i) => (
            <PlaylistTile
              key={pl.id}
              playlist={pl}
              index={i}
              pinned={pinnedIds.has(pl.id)}
              isCurrentPlaying={!!currentTrack && pl.tracks.some(t => t.id === currentTrack.id) && storeIsPlaying}
              coverUploading={coverUploadingId === pl.id}
              editing={editingId === pl.id}
              editName={editName}
              menuOpen={menuOpenId === pl.id}
              animationsEnabled={animationsEnabled}
              onOpen={() => setSelectedPlaylistId(pl.id)}
              onPlay={(e) => { e.stopPropagation(); handlePlayAll(pl); }}
              onRenameStart={() => handleStartRename(pl)}
              onRenameChange={setEditName}
              onRenameConfirm={handleConfirmRename}
              onRenameCancel={() => setEditingId(null)}
              onDelete={() => handleDelete(pl)}
              onTogglePin={() => handleTogglePin(pl.id)}
              onToggleMenu={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === pl.id ? null : pl.id); }}
              onCoverUpload={(file) => handleCoverUpload(pl.id, file)}
              onCoverRemove={() => handleRemoveCover(pl.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Track row (premium) ─────────────────────────────────────────────────

interface TrackRowProps {
  track: Track;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  isLiked: boolean;
  onPlay: () => void;
  onLike: () => void;
  onRemove: () => void;
  onArtistClick: () => void;
}

function TrackRow({ track, index, isCurrent, isPlaying, isLiked, onPlay, onLike, onRemove, onArtistClick }: TrackRowProps) {
  const [hovering, setHovering] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; show: boolean }>({ x: 0, y: 0, show: false });

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
      <motion.div
        onHoverStart={() => setHovering(true)}
        onHoverEnd={() => setHovering(false)}
        onClick={onPlay}
        onContextMenu={handleContextMenu}
        className="group flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors"
        style={{
          backgroundColor: isCurrent ? "color-mix(in srgb, var(--mq-accent) 10%, transparent)" : "transparent",
        }}
        whileTap={{ scale: 0.99 }}
      >
      {/* Index / play icon */}
      <div className="w-7 flex-shrink-0 text-center">
        {isCurrent ? (
          <NowPlayingEqualizer size="sm" variant="inline" paused={!isPlaying} />
        ) : hovering ? (
          <Play className="w-3.5 h-3.5 mx-auto" style={{ color: "var(--mq-text)" }} fill="currentColor" />
        ) : (
          <span className="text-xs" style={{ color: "var(--mq-text-muted)" }}>{index}</span>
        )}
      </div>

      {/* Cover */}
      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: "var(--mq-card)" }}>
        {track.cover ? (
          <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{ color: isCurrent ? "var(--mq-accent)" : "var(--mq-text)" }}
        >
          {track.title}
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); onArtistClick(); }}
          className="text-xs truncate hover:underline"
          style={{ color: "var(--mq-text-muted)" }}
        >
          {track.artist}
        </button>
      </div>

      {/* Like */}
      <button
        onClick={(e) => { e.stopPropagation(); onLike(); }}
        className="p-1.5 rounded-full flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity"
        style={{ opacity: isLiked ? 1 : undefined }}
      >
        <Heart
          className="w-4 h-4"
          style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
          fill={isLiked ? "currentColor" : "none"}
        />
      </button>

      {/* Duration */}
      <div className="hidden sm:block text-xs flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>
        {formatDuration(track.duration)}
      </div>

      {/* Remove */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="p-1.5 rounded-full flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity"
      >
        <Trash2 className="w-3.5 h-3.5" style={{ color: "var(--mq-text-muted)" }} />
      </button>

      {/* More button (3-dot) — opens context menu */}
      <button
        onClick={handleMoreClick}
        className="p-1.5 rounded-full flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity"
        style={{ color: "var(--mq-text-muted)" }}
        aria-label="Меню"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
    </motion.div>

      {/* Context menu */}
      {contextMenu.show && (
        <ContextMenu track={track} x={contextMenu.x} y={contextMenu.y} onClose={closeContextMenu} />
      )}
    </>
  );
}

// ─── Tile (grid card) ────────────────────────────────────────────────────

interface PlaylistTileProps {
  playlist: UserPlaylist;
  index: number;
  pinned: boolean;
  isCurrentPlaying: boolean;
  coverUploading: boolean;
  editing: boolean;
  editName: string;
  menuOpen: boolean;
  animationsEnabled: boolean;
  onOpen: () => void;
  onPlay: (e: React.MouseEvent) => void;
  onRenameStart: () => void;
  onRenameChange: (v: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onToggleMenu: (e: React.MouseEvent) => void;
  onCoverUpload: (file: File) => void;
  onCoverRemove: () => void;
}

function PlaylistTile({
  playlist: pl, index, pinned, isCurrentPlaying, coverUploading, editing, editName, menuOpen,
  animationsEnabled,
  onOpen, onPlay, onRenameStart, onRenameChange, onRenameConfirm, onRenameCancel,
  onDelete, onTogglePin, onToggleMenu, onCoverUpload, onCoverRemove,
}: PlaylistTileProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const totalDur = formatTotalDuration(pl.tracks);

  const handleTileContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleMenu(e);
  }, [onToggleMenu]);

  return (
    <motion.div
      initial={animationsEnabled ? { opacity: 0, y: 16 } : undefined}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.3 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      onContextMenu={handleTileContextMenu}
      role="button"
      tabIndex={0}
      aria-label={`Открыть плейлист ${pl.name}, ${pl.tracks.length} треков`}
      className="group relative rounded-2xl p-3 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        backgroundColor: "var(--mq-card)",
        border: "1px solid var(--mq-border-hairline)",
        boxShadow: "var(--mq-shadow-premium-md)",
      }}
    >
      {/* Cover */}
      <div
        className="relative aspect-square rounded-xl overflow-hidden mb-3 flex items-center justify-center"
        style={pl.cover ? { backgroundColor: "transparent" } : { background: gradientCover(pl.name) }}
      >
        {pl.cover ? (
          <img
            src={pl.cover}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center justify-center w-full h-full" style={patternStyle(pl.name)}>
            <ListMusic className="w-9 h-9" style={{ color: "rgba(255,255,255,0.6)" }} />
            <span className="text-[11px] font-medium mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
              {pl.tracks.length}
            </span>
          </div>
        )}

        {/* Cover upload overlay */}
        <button
          className="absolute inset-0 bg-black/60 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity flex items-center justify-center"
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
        >
          {coverUploading ? (
            <Loader2 className="w-5 h-5 animate-spin text-white" />
          ) : (
            <Camera className="w-5 h-5 text-white" />
          )}
        </button>

        {/* Play button on hover */}
        {pl.tracks.length > 0 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            onClick={onPlay}
            className="absolute bottom-2 right-2 w-10 h-10 rounded-full flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity duration-300"
            style={{
              backgroundColor: "var(--mq-accent)",
              boxShadow: "0 4px 16px color-mix(in srgb, var(--mq-accent) 40%, transparent)",
            }}
          >
            {isCurrentPlaying ? (
              <NowPlayingEqualizer size="sm" variant="overlay" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" fill="#fff" style={{ color: "#fff" }} />
            )}
          </motion.button>
        )}

        {/* Pinned indicator */}
        {pinned && (
          <div
            className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
          >
            <Pin className="w-3 h-3" style={{ color: "var(--mq-accent)" }} fill="currentColor" />
          </div>
        )}

        {/* More menu trigger */}
        <button
          onClick={onToggleMenu}
          className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity z-10"
          style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
        >
          <MoreVertical className="w-3.5 h-3.5 text-white" />
        </button>

        {/* Context menu — uses fixed positioning + portal to avoid overflow clipping */}
        <AnimatePresence>
          {menuOpen && (
            <PlaylistContextMenu
              playlist={pl}
              pinned={pinned}
              onClose={() => onToggleMenu({ stopPropagation: () => {} } as React.MouseEvent)}
              onTogglePin={onTogglePin}
              onRenameStart={onRenameStart}
              onCoverUpload={() => fileInputRef.current?.click()}
              onShare={() => {
                navigator.clipboard?.writeText(`${window.location.origin}/play?pl=${pl.id}`).catch(() => {});
              }}
              onDelete={onDelete}
            />
          )}
        </AnimatePresence>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onCoverUpload(f);
            e.target.value = "";
          }}
        />
      </div>

      {/* Title / meta */}
      {editing ? (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <input
            value={editName}
            onChange={(e) => onRenameChange(e.target.value)}
            className="flex-1 text-sm rounded-lg px-1.5 py-0.5 min-w-0 outline-none"
            style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-accent)", color: "var(--mq-text)" }}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRenameConfirm();
              if (e.key === "Escape") onRenameCancel();
            }}
            autoFocus
          />
          <button onClick={onRenameConfirm} style={{ color: "var(--mq-accent)" }}>
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }} title={pl.name}>
            {pl.name}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
              {pl.tracks.length} треков
            </span>
            {totalDur && (
              <span className="text-[11px] flex items-center gap-0.5" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
                <Clock className="w-2.5 h-2.5" />
                {totalDur}
              </span>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}

// ─── small UI helpers ────────────────────────────────────────────────────

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-white/5"
      style={{ color: danger ? "#ef4444" : "var(--mq-text)" }}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

// ═════════════════════════════════════════════════════════════════════════
// PLAYLIST CONTEXT MENU — portal-based, fixed positioning, not clipped
// ═════════════════════════════════════════════════════════════════════════

import { createPortal } from "react-dom";

function PlaylistContextMenu({
  playlist: pl, pinned, onClose, onTogglePin, onRenameStart, onCoverUpload, onShare, onDelete,
}: {
  playlist: UserPlaylist;
  pinned: boolean;
  onClose: () => void;
  onTogglePin: () => void;
  onRenameStart: () => void;
  onCoverUpload: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  // Position menu near top-right of viewport, adjusted to fit screen
  useEffect(() => {
    const menuW = 200;
    const menuH = 240;
    const x = Math.min(window.innerWidth - menuW - 16, window.innerWidth - menuW - 16);
    const y = Math.max(80, Math.min(window.innerHeight - menuH - 16, 100));
    setPos({ x, y });
  }, []);

  // Close on outside click + Escape
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Delay to avoid immediate close from the trigger click
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const handle = (fn: () => void) => () => {
    fn();
    onClose();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[200]"
        onClick={onClose}
        style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
      />
      {/* Menu */}
      <div
        ref={menuRef}
        className="fixed z-[201] min-w-[200px] rounded-2xl overflow-hidden py-1.5"
        style={{
          left: pos.x,
          top: pos.y,
          backgroundColor: "var(--mq-surface, #1a1a1a)",
          border: "1px solid var(--mq-border-thin)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
        }}
      >
        <PlaylistMenuItem icon={Pin} label={pinned ? "Открепить" : "Закрепить"} onClick={handle(onTogglePin)} />
        <PlaylistMenuItem icon={Edit3} label="Переименовать" onClick={handle(onRenameStart)} />
        <PlaylistMenuItem icon={Camera} label="Сменить обложку" onClick={handle(onCoverUpload)} />
        <PlaylistMenuItem icon={Share2} label="Поделиться" onClick={handle(onShare)} />
        <div className="h-px my-1 mx-2" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
        <PlaylistMenuItem icon={Trash2} label="Удалить" onClick={handle(onDelete)} danger />
      </div>
    </>,
    document.body
  );
}

function PlaylistMenuItem({
  icon: Icon, label, onClick, danger,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/5"
      style={{ color: danger ? "#ef4444" : "var(--mq-text)" }}
    >
      <Icon className="w-4 h-4 flex-shrink-0" style={{ opacity: 0.8 }} />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
