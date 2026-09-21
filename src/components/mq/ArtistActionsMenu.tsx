"use client";

import { useCallback, useMemo } from "react";
import {
  User, Heart, Share2, Copy, Music2, UserCheck,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { shareArtistUrl } from "@/lib/share-urls";
import MenuCore, { MenuHeader, type MenuElement } from "./ui/MenuCore";

/* ══════════════════════════════════════════════════════════════════════════
   ArtistActionsMenu — context menu for artist cards / chips (Phase 4).

   Only REAL actions (backend-backed):
     • Open artist — setSelectedArtist → ArtistDetailView
     • Follow / Unfollow — favoriteArtists store
     • Share artist — navigator.share / clipboard
     • Copy name — clipboard
   No fake "start radio" / "popular tracks" — those would be dead buttons.
   ══════════════════════════════════════════════════════════════════════════ */

export interface ArtistMenuTarget {
  name: string;
  avatar?: string;
  followers?: number;
  genre?: string;
  trackCount?: number;
}

interface ArtistActionsMenuProps {
  artist: ArtistMenuTarget;
  x: number;
  y: number;
  onClose: () => void;
  side?: "below" | "above";
}

export default function ArtistActionsMenu({ artist, x, y, onClose, side = "below" }: ArtistActionsMenuProps) {
  const setSelectedArtist = useAppStore((s) => s.setSelectedArtist);
  const favoriteArtists = useAppStore((s) => s.favoriteArtists);
  const addFavoriteArtist = useAppStore((s) => s.addFavoriteArtist);
  const removeFavoriteArtist = useAppStore((s) => s.removeFavoriteArtist);

  const isFollowed = useMemo(
    () => favoriteArtists.some((a) => a.username.toLowerCase() === artist.name.toLowerCase()),
    [favoriteArtists, artist.name]
  );

  const openArtist = useCallback(() => {
    setSelectedArtist({
      name: artist.name,
      avatar: artist.avatar,
      followers: artist.followers,
      genre: artist.genre,
      trackCount: artist.trackCount,
    });
    onClose();
  }, [setSelectedArtist, artist, onClose]);

  const toggleFollow = useCallback(() => {
    const existing = favoriteArtists.find(
      (a) => a.username.toLowerCase() === artist.name.toLowerCase()
    );
    if (existing) {
      removeFavoriteArtist(existing.id);
    } else {
      addFavoriteArtist({
        id: Date.now(),
        username: artist.name,
        avatar: artist.avatar || "",
        genre: artist.genre || "",
        followers: artist.followers ?? 0,
        trackCount: artist.trackCount ?? 0,
      });
    }
    onClose();
  }, [favoriteArtists, artist, addFavoriteArtist, removeFavoriteArtist, onClose]);

  const shareArtist = useCallback(() => {
    // v78: canonical artist URL (/play?artist=… — the route that actually
    // resolves on web AND as an Android App Link; /artist/{name} 404'd)
    // + global QR share sheet.
    useAppStore.getState().openShareSheet({
      url: shareArtistUrl(artist.name),
      title: artist.name,
      subtitle: "Артист в MQ",
      cover: artist.avatar,
    });
    onClose();
  }, [artist, onClose]);

  const elements: MenuElement[] = useMemo(
    () => [
      { type: "item", id: "open", icon: User, label: "Открыть артиста", onSelect: openArtist },
      {
        type: "item",
        id: "follow",
        icon: isFollowed ? UserCheck : Heart,
        label: isFollowed ? "Отписаться" : "Подписаться",
        active: isFollowed,
        onSelect: toggleFollow,
      },
      { type: "separator" },
      {
        type: "item",
        id: "share",
        icon: Share2,
        label: "Поделиться артистом",
        onSelect: shareArtist,
      },
      {
        type: "item",
        id: "copy",
        icon: Copy,
        label: "Копировать имя",
        onSelect: () => {
          navigator.clipboard.writeText(artist.name).catch(() => {});
          onClose();
        },
      },
    ],
    [openArtist, isFollowed, toggleFollow, shareArtist, artist.name, onClose]
  );

  return (
    <MenuCore
      anchor={{ x, y }}
      onClose={onClose}
      elements={elements}
      side={side}
      ariaLabel={`Действия: ${artist.name}`}
      header={
        <MenuHeader
          cover={artist.avatar}
          title={artist.name}
          subtitle={
            artist.trackCount
              ? `${artist.trackCount} треков${artist.followers ? ` · ${artist.followers} подписчиков` : ""}`
              : artist.followers
                ? `${artist.followers} подписчиков`
                : undefined
          }
          fallbackIcon={Music2}
        />
      }
    />
  );
}
