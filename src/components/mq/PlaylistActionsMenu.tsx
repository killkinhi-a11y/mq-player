"use client";

import { useCallback, useMemo } from "react";
import {
  Play, Shuffle, Pencil, Camera, Share2, Trash2, Pin, PinOff, ListPlus, ListMusic, Music2,
} from "lucide-react";
import { useAppStore, type UserPlaylist } from "@/store/useAppStore";
import { sharePlaylistUrl } from "@/lib/share-urls";
import MenuCore, { MenuHeader, type MenuElement } from "./ui/MenuCore";

/* ══════════════════════════════════════════════════════════════════════════
   PlaylistActionsMenu — unified playlist context menu (Home cards,
   PlaylistView headers/cards). Real actions only:

     • Play (queue = playlist tracks)
     • Shuffle play
     • Add to queue (appends all tracks)
     • Pin / Unpin (PlaylistView pins; Home hides pin by default)
     • Rename / Cover (PlaylistView only — callbacks optional)
     • Share
     • Delete (destructive, separated)

   Callbacks that are not passed simply don't render — contextual honesty.
   ══════════════════════════════════════════════════════════════════════════ */

interface PlaylistActionsMenuProps {
  playlist: UserPlaylist;
  x: number;
  y: number;
  onClose: () => void;
  side?: "below" | "above";
  pinned?: boolean;
  onTogglePin?: () => void;
  onRenameStart?: () => void;
  onCoverUpload?: () => void;
  /** Destructive delete — only where a confirm flow exists (PlaylistView). */
  onDelete?: () => void;
  /** Override share URL (deep links like /play?pl=id). */
  shareUrl?: string;
}

export default function PlaylistActionsMenu({
  playlist,
  x,
  y,
  onClose,
  side = "below",
  pinned,
  onTogglePin,
  onRenameStart,
  onCoverUpload,
  onDelete,
  shareUrl,
}: PlaylistActionsMenuProps) {
  const playTrack = useAppStore((s) => s.playTrack);
  const setView = useAppStore((s) => s.setView);
  const setSelectedPlaylistId = useAppStore((s) => s.setSelectedPlaylistId);

  const openPlaylist = useCallback(() => {
    setSelectedPlaylistId(playlist.id);
    setView("playlists");
    onClose();
  }, [setSelectedPlaylistId, playlist.id, setView, onClose]);

  const playPlaylist = useCallback(() => {
    if (playlist.tracks.length === 0) return;
    playTrack(playlist.tracks[0], [...playlist.tracks], playlist.id);
    onClose();
  }, [playTrack, playlist, onClose]);

  const shufflePlay = useCallback(() => {
    if (playlist.tracks.length === 0) return;
    const shuffled = [...playlist.tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    playTrack(shuffled[0], shuffled, playlist.id);
    onClose();
  }, [playTrack, playlist, onClose]);

  const addToQueue = useCallback(() => {
    const state = useAppStore.getState();
    useAppStore.setState({ queue: [...state.queue, ...playlist.tracks] });
    onClose();
  }, [playlist, onClose]);

  const share = useCallback(() => {
    // v78: canonical playlist URL (/play?pl=… — /playlist/{id} 404'd) via
    // the builder unless the caller passes an explicit shareUrl, opened in
    // the global QR share sheet.
    useAppStore.getState().openShareSheet({
      url: shareUrl ?? sharePlaylistUrl(playlist.id),
      title: playlist.name,
      subtitle: `Плейлист · ${playlist.tracks.length} треков`,
      cover: playlist.cover,
    });
    onClose();
  }, [playlist, onClose, shareUrl]);

  const elements: MenuElement[] = useMemo(() => {
    const els: MenuElement[] = [
      { type: "item", id: "open", icon: ListMusic, label: "Открыть плейлист", onSelect: openPlaylist },
      {
        type: "item",
        id: "play",
        icon: Play,
        label: "Воспроизвести",
        disabled: playlist.tracks.length === 0,
        hint: playlist.tracks.length > 0 ? String(playlist.tracks.length) : undefined,
        onSelect: playPlaylist,
      },
      {
        type: "item",
        id: "shuffle",
        icon: Shuffle,
        label: "Перемешать и играть",
        disabled: playlist.tracks.length === 0,
        onSelect: shufflePlay,
      },
      {
        type: "item",
        id: "queue",
        icon: ListPlus,
        label: "Добавить в очередь",
        disabled: playlist.tracks.length === 0,
        onSelect: addToQueue,
      },
    ];
    if (onTogglePin) {
      els.push({
        type: "item",
        id: "pin",
        icon: pinned ? PinOff : Pin,
        label: pinned ? "Открепить" : "Закрепить",
        onSelect: () => {
          onTogglePin();
          onClose();
        },
      });
    }
    if (onRenameStart) {
      els.push(
        { type: "separator" },
        {
          type: "item",
          id: "rename",
          icon: Pencil,
          label: "Переименовать",
          onSelect: () => {
            onRenameStart();
            onClose();
          },
        }
      );
    }
    if (onCoverUpload) {
      els.push({
        type: "item",
        id: "cover",
        icon: Camera,
        label: "Сменить обложку",
        onSelect: () => {
          onCoverUpload();
          onClose();
        },
      });
    }
    els.push(
      { type: "separator" },
      { type: "item", id: "share", icon: Share2, label: "Поделиться", onSelect: share }
    );
    if (onDelete) {
      els.push({
        type: "item",
        id: "delete",
        icon: Trash2,
        label: "Удалить плейлист",
        destructive: true,
        onSelect: () => {
          onDelete();
          onClose();
        },
      });
    }
    return els;
  }, [openPlaylist, playPlaylist, shufflePlay, addToQueue, onTogglePin, pinned, onRenameStart, onCoverUpload, onDelete, share, playlist.tracks.length, onClose]);

  return (
    <MenuCore
      anchor={{ x, y }}
      onClose={onClose}
      elements={elements}
      side={side}
      ariaLabel={`Действия: ${playlist.name}`}
      header={
        <MenuHeader
          cover={playlist.cover || undefined}
          title={playlist.name}
          subtitle={`${playlist.tracks.length} ${playlist.tracks.length === 1 ? "трек" : playlist.tracks.length < 5 ? "трека" : "треков"}`}
          fallbackIcon={Music2}
        />
      }
    />
  );
}
