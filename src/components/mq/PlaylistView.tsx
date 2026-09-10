"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useAppStore, type UserPlaylist } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import { type Track, formatDuration } from "@/lib/musicApi";
import {
  Plus, Trash2, Play, ListMusic, ChevronLeft,
  Edit3, X, Check, Clock, Heart, Download, Loader2, AlertCircle,
  Camera, Shuffle, Pin, MoreVertical, Music, Share2, Pause,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "./EmptyState";
import ContextMenu from "./ContextMenu";
import PlaylistActionsMenu from "./PlaylistActionsMenu";
import { TrackMoreButton } from "./ui/TrackMoreButton";
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
  /* §CONTEXT-AUDIT: menu anchors to the trigger click position (was
     top-right viewport corner — "wrong position" bug). */
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(null);
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
    const isPinned = pinnedIds.has(pl.id);
    const createdLabel = pl.createdAt
      ? new Date(pl.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
      : null;

    return (
      <div className={`${compactMode ? "p-3 lg:p-4" : "p-4 lg:p-6"} max-w-[var(--mq-container-base)] lg:max-w-[var(--mq-container-wide)] mx-auto pb-32 lg:pb-28`}>
        {/* Back */}
        <motion.button
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          whileTap={{ scale: 0.95, transition: { duration: 0.08 }} }
          onClick={() => setSelectedPlaylistId(null)}
          className="flex items-center gap-1.5 text-sm mb-5 -ml-1.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-[var(--mq-overlay-hover)]"
          style={{ color: "var(--mq-text-muted)" }}
        >
          <ChevronLeft className="w-4 h-4" />
          Все плейлисты
        </motion.button>

        {/* ═══ §J HERO — playlist as an independent entity (album-page
            composition). Flat MQ language: hairline surface + accent tint
            band (no photo background, no blur, no gradient glow).
            ARTWORK → IDENTITY → PRIMARY ACTIONS. ═══ */}
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 16 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative rounded-[var(--mq-r-card-lg)] overflow-hidden mb-5"
          style={{
            backgroundColor: "var(--mq-surface-1)",
            border: "1px solid var(--mq-edge)",
            boxShadow: "var(--mq-shadow-xs)",
          }}
        >
          {/* Ambient: flat accent tint band behind the artwork zone */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-48 sm:h-56"
            style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 8%, transparent)" }}
          />

          <div className="relative p-4 sm:p-6 lg:p-8 flex flex-col sm:flex-row gap-5 sm:gap-7">
            {/* ── ARTWORK ── */}
            <div className="group/cover relative flex-shrink-0 self-center sm:self-start">
              <div
                className="w-40 h-40 sm:w-44 sm:h-44 lg:w-52 lg:h-52 rounded-[var(--mq-r-card)] overflow-hidden flex items-center justify-center"
                style={{
                  backgroundColor: pl.cover ? "var(--mq-surface-2)" : "transparent",
                  background: pl.cover ? undefined : gradientCover(pl.name),
                  border: "1px solid var(--mq-edge)",
                  boxShadow: "var(--mq-shadow-premium-md)",
                }}
              >
                {pl.cover ? (
                  <img src={pl.cover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center w-full h-full" style={patternStyle(pl.name)}>
                    <ListMusic className="w-12 h-12" style={{ color: "rgba(255,255,255,0.7)" }} />
                  </div>
                )}
              </div>
              {/* Cover upload — hover reveal */}
              <button
                className="absolute inset-0 rounded-[var(--mq-r-card)] bg-black/60 sm:opacity-0 sm:group-hover/cover:opacity-100 transition-opacity flex items-center justify-center"
                onClick={() => coverInputRef.current?.click()}
                aria-label="Сменить обложку"
              >
                {coverUploadingId === pl.id ? (
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                ) : (
                  <Camera className="w-5 h-5 text-white" />
                )}
              </button>
              {pl.cover && (
                <button
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center"
                  onClick={(e) => { e.stopPropagation(); handleRemoveCover(pl.id); }}
                  aria-label="Убрать обложку"
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

            {/* ── IDENTITY + PRIMARY ACTIONS ── */}
            <div className="flex-1 min-w-0 flex flex-col sm:justify-end">
              {/* Eyebrow */}
              <div className="flex items-center gap-2 mb-2">
                <span className="mq-t-label" style={{ color: "var(--mq-accent)" }}>
                  Плейлист
                </span>
                {isPinned && (
                  <span
                    className="mq-t-badge inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: "color-mix(in srgb, var(--mq-accent) 12%, transparent)", color: "var(--mq-accent)" }}
                  >
                    <Pin className="w-3 h-3" />
                    Закреплён
                  </span>
                )}
              </div>

              {/* Title (inline rename preserved) */}
              {editingId === pl.id ? (
                <div className="flex items-center gap-2 mb-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 min-w-0 text-2xl sm:text-4xl font-extrabold tracking-tight rounded-xl px-3 py-2 outline-none"
                    style={{ backgroundColor: "var(--mq-surface-2)", border: "1px solid var(--mq-accent)", color: "var(--mq-text)" }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleConfirmRename();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                    maxLength={300}
                    aria-label="Новое название плейлиста"
                  />
                  <button onClick={handleConfirmRename} className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: "var(--mq-accent)" }} aria-label="Сохранить название">
                    <Check className="w-4 h-4 text-white" />
                  </button>
                  <button onClick={() => setEditingId(null)} className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: "var(--mq-surface-2)", border: "1px solid var(--mq-edge)" }} aria-label="Отменить переименование">
                    <X className="w-4 h-4" style={{ color: "var(--mq-text)" }} />
                  </button>
                </div>
              ) : (
                <h1
                  className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight mb-2 break-words"
                  style={{ color: "var(--mq-text)", letterSpacing: "-0.02em" }}
                  title={pl.name}
                >
                  <span className="line-clamp-4">{pl.name}</span>
                </h1>
              )}

              {/* Description */}
              {pl.description && (
                <p
                  className="text-sm mb-3 break-words line-clamp-2 max-w-[60ch]"
                  style={{ color: "var(--mq-text-muted)" }}
                  title={pl.description}
                >
                  {pl.description}
                </p>
              )}

              {/* Meta line */}
              <div className="mq-t-meta flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-5">
                <span className="flex items-center gap-1.5 font-medium">
                  <Music className="w-3.5 h-3.5" />
                  {pl.tracks.length} {pluralRu(pl.tracks.length, "трек", "трека", "треков")}
                </span>
                {totalDur && (
                  <>
                    <span aria-hidden style={{ opacity: 0.4 }}>·</span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {totalDur}
                    </span>
                  </>
                )}
                {createdLabel && (
                  <>
                    <span aria-hidden style={{ opacity: 0.4 }}>·</span>
                    <span>создан {createdLabel}</span>
                  </>
                )}
              </div>

              {/* PRIMARY ACTIONS — one row, predictable order: play → shuffle → pin → menu */}
              <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
                <motion.button
                  whileTap={{ scale: 0.96, transition: { duration: 0.1 } }}
                  whileHover={{ scale: 1.03, transition: { duration: 0.15, ease: "easeOut" } }}
                  onClick={() => isPlPlaying ? togglePlay() : handlePlayAll(pl)}
                  disabled={pl.tracks.length === 0}
                  className="flex items-center justify-center gap-2 flex-1 sm:flex-none sm:min-w-[150px] px-5 sm:px-6 py-3 rounded-full font-bold text-sm"
                  style={{
                    backgroundColor: "var(--mq-accent)",
                    color: "var(--mq-text-on-accent, #fff)",
                    opacity: pl.tracks.length === 0 ? 0.45 : 1,
                    cursor: pl.tracks.length === 0 ? "default" : "pointer",
                  }}
                  aria-label={isPlPlaying ? "Поставить на паузу" : "Слушать плейлист"}
                >
                  {isPlPlaying ? <Pause className="w-4.5 h-4.5" fill="currentColor" /> : <Play className="w-4.5 h-4.5" fill="currentColor" />}
                  {isPlPlaying ? "Пауза" : "Слушать"}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96, transition: { duration: 0.1 } }}
                  whileHover={{ scale: 1.03, transition: { duration: 0.15, ease: "easeOut" } }}
                  onClick={() => handleShufflePlay(pl)}
                  disabled={pl.tracks.length === 0}
                  className="flex items-center justify-center gap-2 flex-1 sm:flex-none px-4 sm:px-5 py-3 rounded-full font-semibold text-sm"
                  style={{
                    backgroundColor: "var(--mq-surface-2)",
                    color: "var(--mq-text)",
                    border: "1px solid var(--mq-edge)",
                    opacity: pl.tracks.length === 0 ? 0.45 : 1,
                    cursor: pl.tracks.length === 0 ? "default" : "pointer",
                  }}
                  aria-label="Перемешать и слушать"
                >
                  <Shuffle className="w-4 h-4" />
                  Перемешать
                </motion.button>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleTogglePin(pl.id)}
                    className="w-11 h-11 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-overlay-hover)]"
                    style={{
                      color: isPinned ? "var(--mq-accent)" : "var(--mq-text-muted)",
                      border: "1px solid var(--mq-edge)",
                      backgroundColor: "var(--mq-surface-1)",
                    }}
                    aria-label={isPinned ? "Открепить плейлист" : "Закрепить плейлист"}
                    aria-pressed={isPinned}
                    title={isPinned ? "Открепить" : "Закрепить"}
                  >
                    <Pin className="w-4.5 h-4.5" fill={isPinned ? "currentColor" : "none"} />
                  </button>
                  <button
                    onClick={(e) => {
                      setMenuAnchor({ x: e.clientX, y: e.clientY });
                      setMenuOpenId(menuOpenId === pl.id ? null : pl.id);
                    }}
                    className="w-11 h-11 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-overlay-hover)]"
                    style={{ color: "var(--mq-text-muted)", border: "1px solid var(--mq-edge)", backgroundColor: "var(--mq-surface-1)" }}
                    aria-label="Меню плейлиста"
                    aria-haspopup="menu"
                    aria-expanded={menuOpenId === pl.id}
                  >
                    <MoreVertical className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Portal context menu (fixed position, unaffected by trigger) */}
          <AnimatePresence>
            {menuOpenId === pl.id && (
              <PlaylistContextMenu
                playlist={pl}
                pinned={pinnedIds.has(pl.id)}
                anchor={menuAnchor}
                onClose={() => setMenuOpenId(null)}
                onTogglePin={() => handleTogglePin(pl.id)}
                onRenameStart={() => handleStartRename(pl)}
                onCoverUpload={() => coverInputRef.current?.click()}
                onShare={() => {
                  navigator.clipboard?.writeText(`${window.location.origin}/play?pl=${pl.id}`).catch(() => {});
                  toast({ title: "Ссылка скопирована", description: "Ссылка на плейлист в буфере обмена" });
                }}
                onDelete={() => handleDelete(pl)}
              />
            )}
          </AnimatePresence>
        </motion.div>

        {/* ═══ TRACKLIST — unified .mq-row system (same rows as Queue /
            Search / History: 56px, hover surface, accent bar + eq when
            playing, actions revealed on row hover). ═══ */}
        {pl.tracks.length > 0 ? (
          <div
            className="rounded-[var(--mq-r-card-lg)] overflow-hidden"
            style={{ border: "1px solid var(--mq-edge)", backgroundColor: "var(--mq-surface-1)" }}
          >
            {/* Column header */}
            <div
              className="mq-t-label flex items-center gap-3 px-4 py-2.5 select-none"
              style={{ borderBottom: "1px solid var(--mq-edge)" }}
            >
              <span className="w-7 flex-shrink-0 text-center mq-t-num">#</span>
              <span className="flex-1">Название</span>
              <span className="hidden sm:block w-[86px] text-right pr-3 mq-t-num">Длит.</span>
              <span className="w-[92px] sm:w-[108px] flex-shrink-0" aria-hidden />
            </div>
            <div>
              <AnimatePresence>
                {pl.tracks.map((track, idx) => {
                  const isCurrent = currentTrack?.id === track.id;
                  const isLiked = likedTrackIds.includes(track.id);
                  return (
                    <motion.div
                      key={track.id + "_" + idx}
                      initial={animationsEnabled ? { opacity: 0, y: 6 } : undefined}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.02, 0.4), duration: 0.25 }}
                    >
                      <TrackRow
                        track={track}
                        index={idx + 1}
                        isCurrent={isCurrent}
                        isPlaying={isCurrent && storeIsPlaying}
                        isLiked={isLiked}
                        playlistId={pl.id}
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
            whileTap={{ scale: 0.95, transition: { duration: 0.08 }} }
            whileHover={{ scale: 1.03, transition: { duration: 0.12, ease: "easeOut" }} }
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm"
            style={{ backgroundColor: "var(--mq-accent)", color: "#fff" }}
          >
            <Plus className="w-3.5 h-3.5" />
            Создать
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95, transition: { duration: 0.08 }} }
            whileHover={{ scale: 1.03, transition: { duration: 0.12, ease: "easeOut" }} }
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
                  <p className="mq-t-meta-2 leading-relaxed">
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
              menuAnchor={menuAnchor}
              animationsEnabled={animationsEnabled}
              onOpen={() => setSelectedPlaylistId(pl.id)}
              onPlay={(e) => { e.stopPropagation(); handlePlayAll(pl); }}
              onRenameStart={() => handleStartRename(pl)}
              onRenameChange={setEditName}
              onRenameConfirm={handleConfirmRename}
              onRenameCancel={() => setEditingId(null)}
              onDelete={() => handleDelete(pl)}
              onTogglePin={() => handleTogglePin(pl.id)}
              onToggleMenu={(e) => { e.stopPropagation(); setMenuAnchor({ x: e.clientX, y: e.clientY }); setMenuOpenId(menuOpenId === pl.id ? null : pl.id); }}
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
  playlistId: string;
  onPlay: () => void;
  onLike: () => void;
  onRemove: () => void;
  onArtistClick: () => void;
}

function TrackRow({ track, index, isCurrent, isPlaying, isLiked, playlistId, onPlay, onLike, onRemove, onArtistClick }: TrackRowProps) {
  // §F/§J: CSS-only hover (.mq-row) — no per-row hover state, no framer
  // gestures on the row itself (press feedback via CSS :active).
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
      <div
        onClick={onPlay}
        onContextMenu={handleContextMenu}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPlay();
          }
        }}
        aria-label={`Слушать ${track.title} — ${track.artist}${isCurrent ? " (играет сейчас)" : ""}`}
        className="mq-row group"
        data-active={isCurrent || undefined}
      >
        {/* Index → play affordance on hover (CSS swap, no state) */}
        <div className="w-7 flex-shrink-0 flex items-center justify-center">
          {isCurrent ? (
            <NowPlayingEqualizer size="sm" variant="inline" paused={!isPlaying} />
          ) : (
            <>
              <span className="mq-t-num text-xs group-hover:hidden" style={{ color: "var(--mq-text-muted)", opacity: 0.65 }}>
                {index}
              </span>
              <Play className="w-3.5 h-3.5 hidden group-hover:block" style={{ color: "var(--mq-text)" }} fill="currentColor" />
            </>
          )}
        </div>

        {/* Cover — 44px unified art */}
        <div className="w-11 h-11 rounded-[var(--mq-r-art)] overflow-hidden flex-shrink-0 mq-art" style={{ backgroundColor: "var(--mq-surface-2)" }}>
          {track.cover ? (
            <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)", opacity: 0.45 }} />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold truncate"
            style={{ color: isCurrent ? "var(--mq-accent)" : "var(--mq-text)", letterSpacing: "-0.01em" }}
            title={`${track.title} — ${track.artist}`}
          >
            {track.title}
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); onArtistClick(); }}
            className="text-[13px] block max-w-full text-left truncate hover:underline transition-colors"
            style={{ color: "var(--mq-text-muted)" }}
            title={track.artist}
          >
            {track.artist}
          </button>
        </div>

        {/* Duration */}
        {track.duration > 0 && (
          <span className="mq-t-num text-[11px] flex-shrink-0 hidden sm:block text-right w-[68px]" style={{ color: "var(--mq-text-muted)", opacity: 0.75 }}>
            {formatDuration(track.duration)}
          </span>
        )}

        {/* Actions — revealed on row hover (CSS) */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onLike(); }}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-[background-color,color,opacity] duration-150 hover:bg-[var(--mq-overlay-hover)] sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100"
            style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
            aria-label={isLiked ? "Убрать из избранного" : "В избранное"}
            aria-pressed={isLiked}
          >
            <Heart className="w-4 h-4" fill={isLiked ? "currentColor" : "none"} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-[background-color,color,opacity] duration-150 hover:bg-[var(--mq-overlay-hover)] sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100"
            style={{ color: "var(--mq-text-muted)" }}
            aria-label="Убрать из плейлиста"
            title="Убрать из плейлиста"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {/* More — unified trigger (v68) */}
          <TrackMoreButton
            onOpen={handleMoreClick}
            label={`Действия: ${track.title}`}
          />
        </div>
      </div>

      {/* Context menu — v68 unified engine + playlist context (adds
          "Убрать из плейлиста" as separated destructive action) */}
      {contextMenu.show && (
        <ContextMenu
          track={track}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          context={{ kind: "playlist", playlistId, onRemove }}
          bottomInset={96}
        />
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
  menuAnchor?: { x: number; y: number } | null;
  onCoverUpload: (file: File) => void;
  onCoverRemove: () => void;
}

function PlaylistTile({
  playlist: pl, index, pinned, isCurrentPlaying, coverUploading, editing, editName, menuOpen,
  menuAnchor, animationsEnabled,
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
      /* §HOVER one-owner + no-delay: the gesture carries its OWN transition
         so the entrance stagger delay (index*0.04, up to 0.4s) can NEVER
         leak into the hover/tap response (the "second effect appears with
         delay" bug). Framer owns transform; CSS owns colors. */
      whileHover={{ y: -3, transition: { duration: 0.15, ease: "easeOut" } }}
      whileTap={{ scale: 0.98, transition: { duration: 0.1 } }}
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
            whileHover={{ scale: 1.05, transition: { duration: 0.12, ease: "easeOut" }} }
            whileTap={{ scale: 0.92, transition: { duration: 0.08 }} }
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
              anchor={menuAnchor}
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
// PLAYLIST CONTEXT MENU — v68: thin wrapper over the unified engine
// (PlaylistActionsMenu). Same call-site API (anchor / pin / rename / cover /
// share / delete), new premium internals: portal, keyboard nav, Escape,
// click-outside, auto-flip, mobile bottom-sheet, destructive separation.
// ═════════════════════════════════════════════════════════════════════════

function PlaylistContextMenu({
  playlist: pl, pinned, anchor, onClose, onTogglePin, onRenameStart, onCoverUpload, onShare, onDelete,
}: {
  playlist: UserPlaylist;
  pinned: boolean;
  anchor?: { x: number; y: number } | null;
  onClose: () => void;
  onTogglePin: () => void;
  onRenameStart: () => void;
  onCoverUpload: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  return (
    <PlaylistActionsMenu
      playlist={pl}
      x={anchor?.x ?? window.innerWidth - 240}
      y={anchor?.y ?? 100}
      onClose={onClose}
      side="below"
      pinned={pinned}
      onTogglePin={onTogglePin}
      onRenameStart={onRenameStart}
      onCoverUpload={onCoverUpload}
      onDelete={onDelete}
      shareUrl={`${window.location.origin}/play?pl=${pl.id}`}
    />
  );
}

