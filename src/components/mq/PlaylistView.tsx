"use client";

import { useState, useCallback, useRef } from "react";
import { useAppStore, type UserPlaylist } from "@/store/useAppStore";
import { motion, AnimatePresence } from "framer-motion";
import { type Track } from "@/lib/musicApi";
import {
  Plus, Trash2, Play, Music, ListMusic, ChevronRight,
  Edit3, X, Check, Disc3, Clock, Heart, Upload, Download, Link, Loader2, AlertCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import TrackCard from "./TrackCard";

export default function PlaylistView() {
  const {
    playlists, selectedPlaylistId, setSelectedPlaylistId,
    createPlaylist, deletePlaylist, renamePlaylist,
    removeFromPlaylist, animationsEnabled, playTrack, likedTrackIds,
    addToPlaylist, setView,
  } = useAppStore();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<'text' | 'url'>('text');
  const [importText, setImportText] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [importProgress, setImportProgress] = useState('');
  const [importHint, setImportHint] = useState('');
  const [vkToken, setVkToken] = useState('');
  const [showVkToken, setShowVkToken] = useState(false);

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId);

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
  }, [editName, renamePlaylist]);

  const handlePlayAll = useCallback((pl: UserPlaylist) => {
    if (pl.tracks.length > 0) playTrack(pl.tracks[0], pl.tracks);
  }, [playTrack]);

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
        if (data.hint) {
          setImportHint(data.hint);
        }
        if (data.needVkToken) {
          setShowVkToken(true);
        }
        return;
      }

      const rawTracks = data.tracks || [];
      if (rawTracks.length === 0) {
        setImportError('Не удалось найти треки по этой ссылке');
        return;
      }

      setImportProgress(`Найдено ${rawTracks.length} треков, создаём плейлист...`);

      // Map tracks — use source: "soundcloud" when scTrackId is present
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
          source: isPlayable ? ("soundcloud" as const) : ("soundcloud" as const),
          scTrackId: t.scTrackId || null,
          scStreamPolicy: t.scStreamPolicy || '',
          scIsFull: t.scIsFull || false,
        };
      });

      const playableCount = data.playableCount ?? tracks.filter(t => !!t.scTrackId).length;
      const totalCount = data.totalCount ?? tracks.length;

      // Build description with playable info
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

      // Show toast with result
      toast({
        title: `Плейлист импортирован`,
        description: `${totalCount} треков из ${data.source || 'внешнего сервиса'}` +
          (playableCount > 0 ? ` · ${playableCount} воспроизводимы` : ''),
      });
    } catch (err: any) {
      setImportError('Ошибка при импорте. Проверьте ссылку и попробуйте снова.');
    } finally {
      setImporting(false);
      setImportProgress('');
    }
  }, [importUrl, importing, toast]);

  // ── Detail view for selected playlist ──
  if (selectedPlaylist) {
    return (
      <div className="p-4 lg:p-6 pb-40 lg:pb-28 space-y-4 max-w-2xl mx-auto">
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

        {/* Playlist header */}
        <motion.div
          initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5"
          style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
        >
          <div className="flex items-start gap-4">
            <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center"
              style={{ backgroundColor: "var(--mq-accent)", opacity: 0.8 }}>
              {selectedPlaylist.cover ? (
                <img src={selectedPlaylist.cover} alt="" className="w-full h-full object-cover" />
              ) : (
                <ListMusic className="w-8 h-8" style={{ color: "var(--mq-text)" }} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold truncate" style={{ color: "var(--mq-text)" }}>
                {selectedPlaylist.name}
              </h1>
              {selectedPlaylist.description && (
                <p className="text-sm mt-1" style={{ color: "var(--mq-text-muted)" }}>
                  {selectedPlaylist.description}
                </p>
              )}
              <p className="text-xs mt-2" style={{ color: "var(--mq-text-muted)" }}>
                {selectedPlaylist.tracks.length} треков
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedPlaylist.tracks.length > 0 && (
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handlePlayAll(selectedPlaylist)}
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
                >
                  <Play className="w-5 h-5 ml-0.5" />
                </motion.button>
              )}
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => deletePlaylist(selectedPlaylist.id)}
                className="p-2 rounded-lg"
                style={{ color: "var(--mq-text-muted)", border: "1px solid var(--mq-border)" }}
              >
                <Trash2 className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        </motion.div>

        {/* Tracks list */}
        {selectedPlaylist.tracks.length > 0 ? (
          <div className="space-y-2">
            {selectedPlaylist.tracks.map((track, i) => (
              <div key={track.id} className="relative">
                <TrackCard track={track} index={i} queue={selectedPlaylist.tracks} />
                <button
                  onClick={() => removeFromPlaylist(selectedPlaylist.id, track.id)}
                  className="absolute top-3 right-3 p-1 rounded opacity-0 hover:opacity-100 transition-opacity group-hover:opacity-100"
                  style={{ color: "var(--mq-text-muted)", backgroundColor: "var(--mq-card)" }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Music className="w-12 h-12 mx-auto mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
            <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
              Плейлист пуст. Добавьте треки из поиска.
            </p>
            <p className="text-xs mt-2" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
              Нажмите правой кнопкой на трек и выберите &quot;Добавить в плейлист&quot;
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── All playlists grid ──
  return (
    <div className="p-4 lg:p-6 pb-40 lg:pb-28 space-y-6 max-w-2xl mx-auto">
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold" style={{ color: "var(--mq-text)" }}>
            Плейлисты
          </h1>
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm"
              style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}
            >
              <Plus className="w-4 h-4" />
              Создать
            </motion.button>
          </div>
        </div>
        <p className="text-sm" style={{ color: "var(--mq-text-muted)" }}>
          {playlists.length} плейлистов
        </p>
      </motion.div>

      {/* Create playlist dialog */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl p-4 space-y-3"
            style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
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
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Описание (необязательно)"
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }}
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="w-full py-2 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: newName.trim() ? "var(--mq-accent)" : "var(--mq-border)",
                color: newName.trim() ? "var(--mq-text)" : "var(--mq-text-muted)",
              }}
            >
              Создать
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Text Import — always visible ── */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl p-4 space-y-3"
        style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListMusic className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
            <h3 className="font-semibold text-sm" style={{ color: "var(--mq-text)" }}>Импорт треков текстом</h3>
          </div>
          {importing && (
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--mq-accent)" }} />
              <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>
                {importProgress || `Обработка...`}
              </span>
            </div>
          )}
        </div>
        <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
          Вставьте названия треков — каждый на новой строке в формате &quot;Исполнитель - Название&quot;:
        </p>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder={"Eminem - Lose Yourself\nImagine Dragons - Believer\nThe Weeknd - Blinding Lights"}
          rows={5}
          disabled={importing}
          className="w-full rounded-lg px-3 py-2 text-sm resize-none"
          style={{
            backgroundColor: "var(--mq-input-bg)",
            border: "1px solid var(--mq-border)",
            color: importing ? "var(--mq-text-muted)" : "var(--mq-text)",
            opacity: importing ? 0.6 : 1,
          }}
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
              // Try to find on SoundCloud
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
                title,
                artist,
                album: "",
                cover: "",
                duration: 0,
                genre: "",
                source: "soundcloud" as const,
                audioUrl: "",
                scTrackId: null,
                scIsFull: false,
              } as Track);
            }
            const newPl: UserPlaylist = {
              id,
              name: `Импорт ${new Date().toLocaleDateString("ru-RU")}`,
              description: `${tracks.length} треков`,
              cover: "",
              tracks,
              createdAt: Date.now(),
            };
            useAppStore.setState(s => ({ playlists: [...s.playlists, newPl] }));
            setImportText("");
            setImporting(false);
            setImportProgress("");
            toast({
              title: "Плейлист импортирован",
              description: `${tracks.length} треков добавлено`,
            });
          }}
          disabled={!importText.trim() || importing}
          className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
          style={{
            backgroundColor: importText.trim() && !importing ? "var(--mq-accent)" : "var(--mq-border)",
            color: importText.trim() && !importing ? "var(--mq-text)" : "var(--mq-text-muted)",
          }}
        >
          {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {importing
            ? `Импортирование... ${importProgress || ""}`
            : `Импортировать (${importText.trim().split("\n").filter(l => l.trim()).length} треков)`
          }
        </button>
      </motion.div>

      {/* ── URL Import — collapsible ── */}
      <AnimatePresence>
        {showImport && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl p-4 space-y-3"
            style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
                <h3 className="font-semibold text-sm" style={{ color: "var(--mq-text)" }}>Импорт по ссылке</h3>
              </div>
              <button onClick={() => { setShowImport(false); setImportError(""); setImportHint(""); setVkToken(""); setShowVkToken(false); }} style={{ color: "var(--mq-text-muted)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs" style={{ color: "var(--mq-text-muted)" }}>
              Вставьте ссылку на плейлист (VK, Яндекс.Музыка, Spotify, YouTube, Apple Music, SoundCloud):
            </p>
            <div className="flex gap-2">
              <input
                ref={importInputRef}
                type="url"
                value={importUrl}
                onChange={(e) => { setImportUrl(e.target.value); setImportError(""); setImportHint(""); }}
                placeholder="https://open.spotify.com/playlist/..."
                className="flex-1 rounded-lg px-3 py-2 text-sm"
                style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !importing && importUrl.trim()) triggerUrlImport(); }}
              />
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={triggerUrlImport}
                disabled={importing || !importUrl.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{
                  backgroundColor: importUrl.trim() && !importing ? "var(--mq-accent)" : "var(--mq-border)",
                  color: importUrl.trim() && !importing ? "var(--mq-text)" : "var(--mq-text-muted)",
                }}
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              </motion.button>
            </div>
            {/* VK Token input (shown when needed or when URL is VK) */}
            {(showVkToken || /vk\.com/i.test(importUrl)) && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium" style={{ color: "var(--mq-text)" }}>VK API-токен</label>
                  <a
                    href="https://vk.com/dev/audio.getPlaylistById"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] underline"
                    style={{ color: "var(--mq-accent)" }}
                  >
                    Как получить?
                  </a>
                </div>
                <input
                  type={showVkToken ? "text" : "password"}
                  value={vkToken}
                  onChange={(e) => { setVkToken(e.target.value); setImportError(""); setImportHint(""); }}
                  placeholder="vk1.a.abc..."
                  className="w-full rounded-lg px-3 py-2 text-xs font-mono"
                  style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !importing && importUrl.trim()) triggerUrlImport(); }}
                />
                <p className="text-[10px] leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
                  Откройте ссылку «Как получить?» → нажмите «Попробовать» → скопируйте access_token из адресной строки (параметр after /access_token=)
                </p>
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
              <div className="rounded-lg p-2.5" style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)" }}>
                <p className="text-[11px] leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
                  💡 {importHint}
                </p>
              </div>
            )}
            <p className="text-[10px]" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
              Поддержка: VK, Яндекс.Музыка, Spotify, YouTube Music, Apple Music, SoundCloud
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* URL import toggle button */}
      {!showImport && (
        <motion.button
          initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowImport(true)}
          className="w-full p-3 rounded-xl text-left text-sm flex items-center gap-3"
          style={{
            background: "linear-gradient(135deg, var(--mq-card), var(--mq-input-bg))",
            border: "1px dashed var(--mq-border)",
            color: "var(--mq-text-muted)",
          }}
        >
          <Link className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
          <span>Импорт по ссылке (VK, Spotify, YouTube...)</span>
        </motion.button>
      )}

      {/* Playlist grid */}
      {playlists.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {playlists.map((pl, i) => (
            <motion.div
              key={pl.id}
              initial={animationsEnabled ? { opacity: 0, y: 20 } : undefined}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSelectedPlaylistId(pl.id)}
              className="rounded-xl p-4 cursor-pointer relative group"
              style={{ backgroundColor: "var(--mq-card)", border: "1px solid var(--mq-border)" }}
            >
              <div className="w-14 h-14 rounded-lg overflow-hidden mb-3 flex items-center justify-center"
                style={{ backgroundColor: "var(--mq-accent)", opacity: 0.7 }}>
                {pl.cover ? (
                  <img src={pl.cover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <ListMusic className="w-6 h-6" style={{ color: "var(--mq-text)" }} />
                )}
              </div>
              {editingId === pl.id ? (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 text-sm rounded px-1 py-0.5 min-w-0"
                    style={{ backgroundColor: "var(--mq-input-bg)", border: "1px solid var(--mq-border)", color: "var(--mq-text)" }}
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
                  <p className="text-sm font-medium truncate" style={{ color: "var(--mq-text)" }}>
                    {pl.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--mq-text-muted)" }}>
                    {pl.tracks.length} треков
                  </p>
                </>
              )}
              {/* Hover actions */}
              <div
                className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                {editingId !== pl.id && (
                  <button
                    onClick={() => { setEditingId(pl.id); setEditName(pl.name); }}
                    className="p-1 rounded"
                    style={{ color: "var(--mq-text-muted)", backgroundColor: "var(--mq-bg)" }}
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={() => deletePlaylist(pl.id)}
                  className="p-1 rounded"
                  style={{ color: "#ef4444", backgroundColor: "var(--mq-bg)" }}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              {/* Play overlay */}
              {pl.tracks.length > 0 && (
                <div
                  className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); handlePlayAll(pl); }}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: "var(--mq-accent)", color: "var(--mq-text)" }}>
                    <Play className="w-3.5 h-3.5 ml-0.5" />
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <Disc3 className="w-16 h-16 mx-auto mb-4" style={{ color: "var(--mq-text-muted)", opacity: 0.2 }} />
          <p className="text-sm font-medium" style={{ color: "var(--mq-text-muted)" }}>
            У вас пока нет плейлистов
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--mq-text-muted)", opacity: 0.6 }}>
            Создайте первый плейлист и добавьте любимые треки
          </p>
        </div>
      )}
    </div>
  );
}
