"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, ListPlus, Heart, ThumbsDown, User, Copy, ListMusic, Plus, Download, Users } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { searchTracks, type Track } from "@/lib/musicApi";
import { getAudioElement } from "@/lib/audioEngine";

interface ContextMenuProps {
  track: Track;
  x: number;
  y: number;
  onClose: () => void;
}

export default function ContextMenu({ track, x, y, onClose }: ContextMenuProps) {
  const {
    playTrack, queue, toggleLike, toggleDislike,
    isTrackLiked, isTrackDisliked, setFullTrackViewOpen,
    playlists, addToPlaylist, createPlaylist, requestShowSimilar,
    setSelectedArtist, favoriteArtists, addFavoriteArtist, removeFavoriteArtist,
  } = useAppStore();

  const menuRef = useRef<HTMLDivElement>(null);
  const isLiked = isTrackLiked(track.id);
  const isDisliked = isTrackDisliked(track.id);
  const isSubscribed = favoriteArtists.some(
    (a) => a.username.toLowerCase() === track.artist.toLowerCase()
  );
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - 350);

  const handlePlay = () => {
    playTrack(track, [...queue, track]);
    onClose();
  };

  const handleAddToQueue = () => {
    const state = useAppStore.getState();
    const newQueue = [...state.queue];
    newQueue.splice(state.queueIndex + 1, 0, track);
    useAppStore.setState({ queue: newQueue });
    onClose();
  };

  const handleSimilar = async () => {
    // If this isn't the current track, play it first so FullTrackView has the right context
    const st = useAppStore.getState();
    if (!st.currentTrack || st.currentTrack.id !== track.id) {
      playTrack(track, [...st.queue, track]);
    }
    setFullTrackViewOpen(true);
    requestShowSimilar();
    onClose();
  };

  const handleToggleLike = () => {
    toggleLike(track.id, track);
    onClose();
  };

  const handleToggleDislike = () => {
    toggleDislike(track.id, track);
    onClose();
  };

  const handleCopyTitle = () => {
    navigator.clipboard.writeText(`${track.title} — ${track.artist}`).catch(() => {});
    onClose();
  };

  const handleAddToPlaylist = (playlistId: string) => {
    addToPlaylist(playlistId, track);
    onClose();
  };

  const handleQuickCreateAndAdd = () => {
    const name = track.artist;
    createPlaylist(name);
    // Get the newly created playlist id
    const state = useAppStore.getState();
    const newPl = state.playlists[state.playlists.length - 1];
    if (newPl) addToPlaylist(newPl.id, track);
    onClose();
  };

  const handleGoToArtist = () => {
    setSelectedArtist({
      name: track.artist,
      avatar: track.cover || undefined,
    });
    onClose();
  };

  const handleToggleSubscribe = () => {
    if (isSubscribed) {
      const fav = favoriteArtists.find((a) => a.username.toLowerCase() === track.artist.toLowerCase());
      if (fav) removeFavoriteArtist(fav.id);
    } else {
      addFavoriteArtist({
        id: Date.now(),
        username: track.artist,
        avatar: track.cover || "",
        genre: track.genre || "",
        followers: 0,
        trackCount: 0,
      });
    }
    onClose();
  };

  if (showPlaylistPicker) {
    return (
      <AnimatePresence>
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="fixed z-[200] rounded-xl py-1 shadow-2xl min-w-[200px] max-w-[260px] max-h-[300px] overflow-y-auto"
          style={{
            left: Math.min(x, window.innerWidth - 260),
            top: Math.min(y, window.innerHeight - 320),
            backgroundColor: "var(--mq-card)",
            border: "1px solid var(--mq-border)",
            boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
          }}
        >
          <div className="px-3 py-2 text-xs font-semibold" style={{ color: "var(--mq-text-muted)" }}>
            Добавить в плейлист
          </div>
          {playlists.map((pl) => (
            <button
              key={pl.id}
              onClick={() => handleAddToPlaylist(pl.id)}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:opacity-80 transition-colors text-left"
              style={{ color: "var(--mq-text)" }}
            >
              <ListMusic className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
              <span className="truncate">{pl.name}</span>
              <span className="ml-auto text-xs" style={{ color: "var(--mq-text-muted)" }}>{pl.tracks.length}</span>
            </button>
          ))}
          <div className="my-1" style={{ borderTop: "1px solid var(--mq-border)" }} />
          <button
            onClick={handleQuickCreateAndAdd}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:opacity-80 transition-colors text-left"
            style={{ color: "var(--mq-accent)" }}
          >
            <Plus className="w-4 h-4" />
            Новый плейлист
          </button>
          <button
            onClick={() => { setShowPlaylistPicker(false); }}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:opacity-80 transition-colors text-left"
            style={{ color: "var(--mq-text-muted)" }}
          >
            Назад
          </button>
        </motion.div>
      </AnimatePresence>
    );
  }

  const items = [
    { icon: Play, label: "Воспроизвести", action: handlePlay, accent: false },
    { icon: ListPlus, label: "Добавить в очередь", action: handleAddToQueue, accent: false },
    { icon: ListMusic, label: "Добавить в плейлист", action: () => setShowPlaylistPicker(true), accent: false },
    { icon: Heart, label: isLiked ? "Убрать лайк" : "❤ Лайк", action: handleToggleLike, accent: isLiked },
    { icon: ThumbsDown, label: isDisliked ? "Убрать дизлайк" : "👎 Дизлайк", action: handleToggleDislike, accent: isDisliked },
    { icon: User, label: "Перейти к артисту", action: handleGoToArtist, accent: false },
    { icon: Users, label: isSubscribed ? "Отписаться" : "Подписаться", action: handleToggleSubscribe, accent: isSubscribed },
    { icon: Copy, label: "Копировать название", action: handleCopyTitle, accent: false },
    { icon: Download, label: "Скачать", action: async () => {
      const audio = getAudioElement();
      if (audio && audio.src) {
        try {
          const res = await fetch(audio.src);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `${track.artist} - ${track.title}.mp3`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch {
          const a = document.createElement('a');
          a.href = audio.src; a.download = `${track.artist} - ${track.title}.mp3`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
      }
      onClose();
    }, accent: false },
  ];

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="fixed z-[200] rounded-xl py-1 shadow-2xl min-w-[200px] max-w-[260px]"
        style={{
          left: adjustedX,
          top: adjustedY,
          backgroundColor: "var(--mq-card)",
          border: "1px solid var(--mq-border)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
        }}
      >
        {items.map((item, i) => (
          <button
            key={i}
            onClick={item.action}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:opacity-80 transition-colors text-left"
            style={{
              color: item.accent ? "var(--mq-accent)" : "var(--mq-text)",
            }}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: item.accent ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
            {item.label}
          </button>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}
