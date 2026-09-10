"use client";

import { useCallback, useMemo, useState } from "react";
import {
  User, Heart, Share2, Copy, Music2, UserCheck,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
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
  const [copied, setCopied] = useState(false);

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

  const shareArtist = useCallback(async () => {
    const url = `${window.location.origin}/artist/${encodeURIComponent(artist.name)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: artist.name, url });
      } catch {
        /* dismissed */
      }
      onClose();
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
          onClose();
        }, 1400);
      } catch {
        onClose();
      }
    }
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
        label: copied ? "Ссылка скопирована" : "Поделиться артистом",
        active: copied,
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
    [openArtist, isFollowed, toggleFollow, copied, shareArtist, artist.name, onClose]
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
