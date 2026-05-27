"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, ListPlus, Heart, ThumbsDown, User, Copy, ListMusic, Plus, Download, Users, Share2, Radio
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { type Track } from "@/lib/musicApi";
import { getAudioElement } from "@/lib/audioEngine";

interface ContextMenuProps {
  track: Track;
  x: number;
  y: number;
  onClose: () => void;
}

export default function ContextMenu({ track, x, y, onClose }: ContextMenuProps) {
  const playTrack = useAppStore((s) => s.playTrack);
  const queue = useAppStore((s) => s.queue);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const toggleDislike = useAppStore((s) => s.toggleDislike);
  const isTrackLiked = useAppStore((s) => s.isTrackLiked);
  const isTrackDisliked = useAppStore((s) => s.isTrackDisliked);
  const setFullTrackViewOpen = useAppStore((s) => s.setFullTrackViewOpen);
  const playlists = useAppStore((s) => s.playlists);
  const addToPlaylist = useAppStore((s) => s.addToPlaylist);
  const createPlaylist = useAppStore((s) => s.createPlaylist);
  const requestShowSimilar = useAppStore((s) => s.requestShowSimilar);
  const setSelectedArtist = useAppStore((s) => s.setSelectedArtist);
  const favoriteArtists = useAppStore((s) => s.favoriteArtists);
  const addFavoriteArtist = useAppStore((s) => s.addFavoriteArtist);
  const removeFavoriteArtist = useAppStore((s) => s.removeFavoriteArtist);

  const menuRef = useRef<HTMLDivElement>(null);
  const isLiked = isTrackLiked(track.id);
  const isDisliked = isTrackDisliked(track.id);
  const isSubscribed = favoriteArtists.some(
    (a) => a.username.toLowerCase() === track.artist.toLowerCase()
  );
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [shareFeedback, setShareFeedback] = useState(false);

  // Use actual menu dimensions for viewport clamping
  const [menuPos, setMenuPos] = useState({ left: x, top: y });

  // Measure menu after mount and adjust position to stay within viewport.
  // Account for the bottom player bar (~80px) so the menu doesn't overlap it.
  useLayoutEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const PLAYER_BAR_HEIGHT = 80; // approximate bottom player height
      let left = x;
      let top = y;

      // Clamp horizontally
      if (left + rect.width > vw - 8) {
        left = Math.max(8, vw - rect.width - 8);
      }
      // Clamp vertically — leave space for the bottom player bar
      if (top + rect.height > vh - PLAYER_BAR_HEIGHT - 8) {
        top = Math.max(8, vh - rect.height - PLAYER_BAR_HEIGHT - 8);
      }

      setMenuPos({ left, top });
    }
  }, [x, y, showPlaylistPicker]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Close on scroll (user scrolled away from context)
  useEffect(() => {
    const handleScroll = () => onClose();
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [onClose]);

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

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/track/${track.scTrackId}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${track.title} — ${track.artist}`, url: shareUrl });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareFeedback(true);
        setTimeout(() => setShareFeedback(false), 1500);
      } catch {}
    }
    onClose();
  };

  const handleAddToPlaylist = (playlistId: string) => {
    addToPlaylist(playlistId, track);
    onClose();
  };

  const handleQuickCreateAndAdd = () => {
    const name = track.artist;
    createPlaylist(name);
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

  // Shared menu item style for better hover effect
  const menuItemClass = "w-full flex items-center gap-3 px-3 py-2.5 text-[13px] transition-all duration-100 text-left";

  const menuContent = showPlaylistPicker ? (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 4 }}
      transition={{ duration: 0.12, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="fixed rounded-2xl py-1.5 shadow-2xl min-w-[220px] max-w-[280px] max-h-[320px] overflow-y-auto"
      style={{
        left: menuPos.left,
        top: menuPos.top,
        backgroundColor: "var(--mq-card)",
        border: "1px solid var(--mq-border)",
        boxShadow: "0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
        backdropFilter: "blur(40px) saturate(180%)",
        WebkitBackdropFilter: "blur(40px) saturate(180%)",
        zIndex: 10001,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
        Добавить в плейлист
      </div>
      {playlists.map((pl) => (
        <button
          key={pl.id}
          onClick={() => handleAddToPlaylist(pl.id)}
          className={menuItemClass}
          style={{ color: "var(--mq-text)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.06)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
        >
          <ListMusic className="w-4 h-4 flex-shrink-0" style={{ color: "var(--mq-accent)" }} />
          <span className="truncate">{pl.name}</span>
          <span className="ml-auto text-[11px]" style={{ color: "var(--mq-text-muted)" }}>{pl.tracks.length}</span>
        </button>
      ))}
      <div className="my-1.5 mx-2" style={{ height: 1, backgroundColor: "rgba(255,255,255,0.06)" }} />
      <button
        onClick={handleQuickCreateAndAdd}
        className={menuItemClass}
        style={{ color: "var(--mq-accent)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.06)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
      >
        <Plus className="w-4 h-4" />
        Новый плейлист
      </button>
      <button
        onClick={() => setShowPlaylistPicker(false)}
        className={menuItemClass}
        style={{ color: "var(--mq-text-muted)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.06)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
      >
        Назад
      </button>
    </motion.div>
  ) : (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.95, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 4 }}
      transition={{ duration: 0.12, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="fixed rounded-2xl py-1.5 shadow-2xl min-w-[220px] max-w-[280px]"
      style={{
        left: menuPos.left,
        top: menuPos.top,
        backgroundColor: "var(--mq-card)",
        border: "1px solid var(--mq-border)",
        boxShadow: "0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
        backdropFilter: "blur(40px) saturate(180%)",
        WebkitBackdropFilter: "blur(40px) saturate(180%)",
        zIndex: 10001,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Track header in context menu */}
      <div className="px-3 py-2.5 flex items-center gap-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
          {track.cover ? (
            <img src={track.cover} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium truncate leading-tight" style={{ color: "var(--mq-text)" }}>
            {track.title}
          </p>
          <p className="text-[11px] truncate leading-snug" style={{ color: "var(--mq-text-muted)" }}>
            {track.artist}
          </p>
        </div>
      </div>

      <div className="py-0.5">
        {[
          { icon: Play, label: "Воспроизвести", action: handlePlay, accent: false },
          { icon: ListPlus, label: "Добавить в очередь", action: handleAddToQueue, accent: false },
          { icon: ListMusic, label: "Добавить в плейлист", action: () => setShowPlaylistPicker(true), accent: false },
          { icon: Radio, label: "Похожие треки", action: handleSimilar, accent: false },
          null, // separator
          { icon: Heart, label: isLiked ? "Убрать лайк" : "Лайк", action: handleToggleLike, accent: isLiked },
          { icon: ThumbsDown, label: isDisliked ? "Убрать дизлайк" : "Дизлайк", action: handleToggleDislike, accent: isDisliked },
          null, // separator
          { icon: User, label: "Перейти к артисту", action: handleGoToArtist, accent: false },
          { icon: Users, label: isSubscribed ? "Отписаться" : "Подписаться", action: handleToggleSubscribe, accent: isSubscribed },
          { icon: Copy, label: "Копировать название", action: handleCopyTitle, accent: false },
          ...(track.scTrackId ? [{ icon: Share2, label: shareFeedback ? "Ссылка скопирована!" : "Поделиться", action: handleShare, accent: shareFeedback }] : []),
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
        ].map((item, i) => {
          if (item === null) {
            return <div key={`sep-${i}`} className="my-1 mx-2" style={{ height: 1, backgroundColor: "rgba(255,255,255,0.06)" }} />;
          }
          return (
            <button
              key={i}
              onClick={item.action}
              className={menuItemClass}
              style={{
                color: item.accent ? "var(--mq-accent)" : "var(--mq-text)",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.backgroundColor = "rgba(255,255,255,0.06)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.backgroundColor = "transparent";
              }}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: item.accent ? "var(--mq-accent)" : "var(--mq-text-muted)" }} />
              {item.label}
            </button>
          );
        })}
      </div>
    </motion.div>
  );

  return createPortal(
    <AnimatePresence>
      {/* Transparent backdrop — captures clicks to close, doesn't block other UI */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1 }}
        className="fixed inset-0"
        style={{ zIndex: 10000 }}
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      {menuContent}
    </AnimatePresence>,
    document.body
  );
}

// ── Utility: Music icon for context menu header when no cover ──
function Music({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
  );
}
