"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Play, ListPlus, Heart, ThumbsDown, User, Copy, ListMusic, Plus, Download,
  Users, Share2, Radio, Trash2, Ban, Music2,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { type Track, formatDuration } from "@/lib/musicApi";
import { getAudioElement } from "@/lib/audioEngine";
import { shareTrackUrl, openInAppTrackUrl } from "@/lib/share";
import MenuCore, { backLabelSpec, MenuHeader, type MenuElement } from "./ui/MenuCore";

/* ══════════════════════════════════════════════════════════════════════════
   ContextMenu — THE unified track actions menu (v68).

   Public API is unchanged (track / x / y / onClose) so every existing
   surface (TrackCard, Favorites, History, Search, Queue, …) upgrades
   instantly. Internals now run on the MenuCore engine: portal, keyboard
   navigation, Escape / click-outside / scroll close, focus restore,
   auto-flip positioning, mobile bottom sheet, CSS-only instant hover.

   Action set is CONTEXTUAL — only physically applicable actions render:
     • queue context        → "Remove from queue" (destructive)
     • playlist context     → "Remove from playlist" (destructive)
     • wave context         → "Not interested" (destructive)
     • no scTrackId         → no Share
     • everything else      → the standard set below

   Standard set: Play · Queue · Playlist (picker page) · Like/Dislike ·
   Artist · Subscribe · Similar · Copy title · Share · Download.
   ══════════════════════════════════════════════════════════════════════════ */

export type TrackMenuContext =
  | { kind: "default" }
  | { kind: "queue"; onRemove?: () => void }
  | { kind: "playlist"; playlistId: string; onRemove?: () => void }
  | { kind: "wave"; onNotInterested?: () => void };

interface ContextMenuProps {
  track: Track;
  x: number;
  y: number;
  onClose: () => void;
  /** Extra context — switches in contextual actions. */
  context?: TrackMenuContext;
  /** Preferred side (bottom-of-screen triggers use "above"). */
  side?: "below" | "above";
  /** Bottom allowance for viewport clamping (player bar etc.). */
  bottomInset?: number;
}

export default function ContextMenu({
  track,
  x,
  y,
  onClose,
  context = { kind: "default" },
  side = "below",
  bottomInset = 0,
}: ContextMenuProps) {
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

  const [page, setPage] = useState<"root" | "playlists">("root");
  const [shareFeedback, setShareFeedback] = useState(false);

  const isLiked = isTrackLiked(track.id);
  const isDisliked = isTrackDisliked(track.id);
  const isSubscribed = favoriteArtists.some(
    (a) => a.username.toLowerCase() === track.artist.toLowerCase()
  );

  // ── Actions ──────────────────────────────────────────────────────────
  const handlePlay = useCallback(() => {
    playTrack(track, [...queue, track]);
    onClose();
  }, [playTrack, track, queue, onClose]);

  const handleAddToQueue = useCallback(() => {
    const state = useAppStore.getState();
    const newQueue = [...state.queue];
    newQueue.splice(state.queueIndex + 1, 0, track);
    useAppStore.setState({ queue: newQueue });
    onClose();
  }, [track, onClose]);

  const handleSimilar = useCallback(() => {
    const st = useAppStore.getState();
    if (!st.currentTrack || st.currentTrack.id !== track.id) {
      playTrack(track, [...st.queue, track]);
    }
    setFullTrackViewOpen(true);
    requestShowSimilar();
    onClose();
  }, [playTrack, track, setFullTrackViewOpen, requestShowSimilar, onClose]);

  const handleGoToArtist = useCallback(() => {
    setSelectedArtist({ name: track.artist, avatar: track.cover || undefined });
    onClose();
  }, [setSelectedArtist, track, onClose]);

  const handleToggleSubscribe = useCallback(() => {
    if (isSubscribed) {
      const fav = favoriteArtists.find(
        (a) => a.username.toLowerCase() === track.artist.toLowerCase()
      );
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
  }, [isSubscribed, favoriteArtists, track, addFavoriteArtist, removeFavoriteArtist, onClose]);

  // v72: share opens the ShareSheet — REAL QR (decoder-verified), copy,
  // native share, PNG export and the in-app deep-link hand-off. The old
  // inline navigator.share is kept as the sheet's own mechanism.
  // v72: share routes to the GLOBAL share sheet (AppShell) — the menu can
  // close itself safely; no nested sheet, no keepOpen stacking conflicts.
  const openShareSheet = useAppStore((s) => s.openShareSheet);
  const handleShare = useCallback(() => {
    openShareSheet({
      url: shareTrackUrl(track),
      title: track.title,
      subtitle: track.artist,
      cover: track.cover,
      openInAppUrl: track.scTrackId ? openInAppTrackUrl(track) : undefined,
    });
    onClose();
  }, [openShareSheet, track, onClose]);

  const handleDownload = useCallback(async () => {
    const audio = getAudioElement();
    if (audio && audio.src) {
      const name = `${track.artist} - ${track.title}.mp3`;
      try {
        const res = await fetch(audio.src);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        const a = document.createElement("a");
        a.href = audio.src;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    }
    onClose();
  }, [track, onClose]);

  const handleQuickCreateAndAdd = useCallback(() => {
    const name = track.artist;
    createPlaylist(name);
    // Zustand set() is synchronous — read the most recent state.
    const state = useAppStore.getState();
    const newPl = [...state.playlists].reverse().find((p) => p.name === name);
    if (newPl) addToPlaylist(newPl.id, track);
    onClose();
  }, [createPlaylist, track, addToPlaylist, onClose]);

  // ── Element tree ─────────────────────────────────────────────────────
  const elements: MenuElement[] = useMemo(() => {
    if (page === "playlists") {
      return [
        backLabelSpec("Назад", () => setPage("root")),
        { type: "separator" },
        ...playlists.map<MenuElement>((pl) => ({
          type: "item",
          id: `pl-${pl.id}`,
          icon: ListMusic,
          label: pl.name,
          hint: String(pl.tracks.length),
          onSelect: () => {
            addToPlaylist(pl.id, track);
            onClose();
          },
        })),
        { type: "separator" },
        {
          type: "item",
          id: "pl-new",
          icon: Plus,
          label: "Новый плейлист",
          onSelect: handleQuickCreateAndAdd,
        },
      ];
    }

    const els: MenuElement[] = [
      { type: "item", id: "play", icon: Play, label: "Воспроизвести", onSelect: handlePlay },
      { type: "item", id: "queue", icon: ListPlus, label: "Добавить в очередь", onSelect: handleAddToQueue },
      {
        type: "item",
        id: "playlist",
        icon: ListMusic,
        label: "Добавить в плейлист",
        keepOpen: true,
        onSelect: () => setPage("playlists"),
      },
      { type: "item", id: "similar", icon: Radio, label: "Похожие треки", onSelect: handleSimilar },
      { type: "separator" },
      {
        type: "item",
        id: "like",
        icon: Heart,
        label: isLiked ? "Убрать лайк" : "Лайк",
        active: isLiked,
        onSelect: () => {
          toggleLike(track.id, track);
          onClose();
        },
      },
      {
        type: "item",
        id: "dislike",
        icon: ThumbsDown,
        label: isDisliked ? "Убрать дизлайк" : "Не нравится",
        active: isDisliked,
        onSelect: () => {
          toggleDislike(track.id, track);
          onClose();
        },
      },
      { type: "separator" },
      { type: "item", id: "artist", icon: User, label: "Перейти к артисту", onSelect: handleGoToArtist },
      {
        type: "item",
        id: "subscribe",
        icon: Users,
        label: isSubscribed ? "Отписаться от артиста" : "Подписаться на артиста",
        active: isSubscribed,
        onSelect: handleToggleSubscribe,
      },
      ...(track.scTrackId
        ? [
            {
              type: "item" as const,
              id: "share",
              icon: Share2,
              label: shareFeedback ? "Ссылка скопирована" : "Поделиться",
              active: shareFeedback,
              onSelect: handleShare,
            },
          ]
        : []),
      {
        type: "item",
        id: "copy",
        icon: Copy,
        label: "Копировать название",
        onSelect: () => {
          navigator.clipboard.writeText(`${track.title} — ${track.artist}`).catch(() => {});
          onClose();
        },
      },
      {
        type: "item",
        id: "download",
        icon: Download,
        label: "Скачать",
        onSelect: handleDownload,
      },
    ];

    // Contextual destructive tail — separated at the very end.
    if (context.kind === "queue") {
      els.push(
        { type: "separator" },
        {
          type: "item",
          id: "rm-queue",
          icon: Trash2,
          label: "Убрать из очереди",
          destructive: true,
          onSelect: () => {
            context.kind === "queue" && context.onRemove?.();
            onClose();
          },
        }
      );
    } else if (context.kind === "playlist") {
      els.push(
        { type: "separator" },
        {
          type: "item",
          id: "rm-playlist",
          icon: Trash2,
          label: "Убрать из плейлиста",
          destructive: true,
          onSelect: () => {
            if (context.kind === "playlist") {
              useAppStore.getState().removeFromPlaylist(context.playlistId, track.id);
              context.onRemove?.();
            }
            onClose();
          },
        }
      );
    } else if (context.kind === "wave") {
      els.push(
        { type: "separator" },
        {
          type: "item",
          id: "not-interested",
          icon: Ban,
          label: "Не интересно",
          destructive: true,
          onSelect: () => {
            const st = useAppStore.getState();
            if (!st.dislikedTrackIds?.includes(track.id)) st.toggleDislike(track.id, track);
            context.kind === "wave" && context.onNotInterested?.();
            onClose();
          },
        }
      );
    }
    return els;
  }, [
    page, playlists, track, isLiked, isDisliked, isSubscribed, shareFeedback,
    handlePlay, handleAddToQueue, handleSimilar, handleGoToArtist,
    handleToggleSubscribe, handleShare, handleDownload, handleQuickCreateAndAdd,
    toggleLike, toggleDislike, context, onClose,
  ]);

  return (
    <MenuCore
      anchor={{ x, y }}
      onClose={onClose}
      elements={elements}
      side={side}
      bottomInset={bottomInset}
      ariaLabel={`Действия: ${track.title}`}
      header={
        page === "root" ? (
          // v69 duration in context menu: duration rides the subtitle line
          // (artist · m:ss) — correct value, never duplicated, truncation
          // stays on the artist part via the flex header contract.
          <MenuHeader
            cover={track.cover}
            title={track.title}
            subtitle={track.duration > 0 ? `${track.artist} · ${formatDuration(track.duration)}` : track.artist}
            fallbackIcon={Music2}
          />
        ) : (
          <div className="mq-menu-label">Добавить в плейлист</div>
        )
      }
    />
  );
}
