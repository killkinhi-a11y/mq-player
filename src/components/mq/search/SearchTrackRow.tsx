"use client";

// Extracted from SearchView.tsx (Stage III decomposition) — moved verbatim.
import ContextMenu from "../ContextMenu";
import { Heart, MoreHorizontal, Music, Play } from "lucide-react";
import { NowPlayingEqualizer } from "../NowPlayingEqualizer";
import { ProviderBadge } from "../ui/ProviderBadge";
import { type Track, formatDuration } from "@/lib/musicApi";
import { memo, useCallback, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useLongPress } from "@/hooks/useLongPress";

// ═════════════════════════════════════════════════════════════════════════
// SEARCH TRACK ROW — clean visual row optimized for mobile
// Lightweight: no framer-motion per-row (uses CSS transitions), no context
// menu overhead (uses simple onClick + long-press), no next/image (plain img).
// ═════════════════════════════════════════════════════════════════════════

export const SearchTrackRow = memo(function SearchTrackRow({
  track,
  index,
  queue,
  onArtistClick,
}: {
  track: Track;
  index: number;
  queue: Track[];
  onArtistClick?: (artistName: string, coverUrl?: string, catalogArtistId?: string, catalogProvider?: "spotify" | "deezer") => void;
}) {
  const currentTrackId = useAppStore((s) => s.currentTrack?.id);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const playTrack = useAppStore((s) => s.playTrack);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const toggleLike = useAppStore((s) => s.toggleLike);

  const isActive = currentTrackId === track.id;
  const isCurrentlyPlaying = isActive && isPlaying;
  const isLiked = likedTrackIds.includes(track.id);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; show: boolean }>({ x: 0, y: 0, show: false });

  // Long-press for context menu (mobile)
  const handleLongPress = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const clientX = "touches" in e ? e.touches[0]?.clientX ?? 0 : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0]?.clientY ?? 0 : (e as React.MouseEvent).clientY;
    setContextMenu({ x: clientX, y: clientY, show: true });
  }, []);
  const { wasLongPress: longPressWasActive, ...longPressHandlers } = useLongPress(handleLongPress, { delay: 500, threshold: 10 });

  const handleClick = useCallback(() => {
    if (longPressWasActive()) return;
    if (isActive) togglePlay();
    else playTrack(track, queue);
  }, [longPressWasActive, isActive, togglePlay, playTrack, track, queue]);

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
        {...longPressHandlers}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
        aria-label={`Слушать ${track.title} — ${track.artist}${isActive ? " (играет сейчас)" : ""}`}
        className="mq-row group"
        data-active={isActive || undefined}
      >
        {/* Cover — artwork carries the color */}
        <div className="w-12 h-12 rounded-[var(--mq-r-art)] overflow-hidden flex-shrink-0 relative mq-art">
          {track.cover ? (
            <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} />
            </div>
          )}
          {/* Play/pause overlay on hover/active */}
          {isActive && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
              {isCurrentlyPlaying ? (
                <NowPlayingEqualizer size="sm" variant="overlay" />
              ) : (
                <Play className="w-4 h-4" fill="#fff" style={{ color: "#fff" }} />
              )}
            </div>
          )}
        </div>

        {/* Title + artist + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {isActive && (
              <NowPlayingEqualizer
                size="sm"
                variant="inline"
                paused={!isPlaying}
              />
            )}
            <p className="text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>
              {track.title}
            </p>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            {/* §E v69 duration contract: artist is the ONLY flexible element
                (flex-1 + min-w-0 → truncates); duration and genre tails are
                shrink-0 + nowrap — they can never be squeezed, wrapped, or
                clipped by a pathological title/artist. */}
            <button
              onClick={(e) => { e.stopPropagation(); onArtistClick?.(track.artist, track.cover, track.catalogArtistId, track.catalogProvider); }}
              className="text-xs flex-1 min-w-0 text-left truncate hover:underline"
              style={{ color: "var(--mq-text-muted)" }}
            >
              {track.artist}
            </button>
            {/* V2: provider attribution — catalog (Spotify/Deezer) / native source */}
            {(track.catalogProvider || track.playbackProvider) && (
              <span className="flex items-center gap-1 shrink-0">
                <ProviderBadge
                  provider={
                    track.catalogProvider === "deezer" ? "deezer"
                    : track.catalogProvider === "spotify" ? "spotify"
                    : track.source === "audius" ? "audius"
                    : "soundcloud"
                  }
                />
              </span>
            )}
            {track.versionTag && (
              <span className="mq-t-meta-2 px-1.5 py-0 rounded-md shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 6%, transparent)", color: "var(--mq-text-muted)" }}>
                {track.versionTag}
              </span>
            )}
            {track.duration > 0 && (
              <span className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                <span style={{ color: "var(--mq-text-muted)", opacity: 0.4 }}>·</span>
                <span className="mq-t-num shrink-0 whitespace-nowrap" style={{ color: "var(--mq-text-muted)", opacity: 0.7 }}>
                  {formatDuration(track.duration)}
                </span>
              </span>
            )}
            {track.genre && (
              <span className="flex items-center gap-1.5 shrink-0 min-w-0">
                <span style={{ color: "var(--mq-text-muted)", opacity: 0.4 }}>·</span>
                <span className="mq-t-meta-2 px-1.5 py-0 rounded-md max-w-[140px] truncate shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--mq-text) 6%, transparent)", color: "var(--mq-text-muted)" }}>
                  {track.genre}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Like button */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleLike(track.id, track); }}
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ color: isLiked ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
          aria-label={isLiked ? "Убрать из избранного" : "В избранное"}
        >
          <Heart className="w-4 h-4" fill={isLiked ? "currentColor" : "none"} />
        </button>

        {/* More button (3-dot) */}
        <button
          onClick={handleMoreClick}
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity"
          style={{ color: "var(--mq-text-muted)" }}
          aria-label="Меню"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Context menu */}
      {contextMenu.show && (
        <ContextMenu track={track} x={contextMenu.x} y={contextMenu.y} onClose={closeContextMenu} />
      )}
    </>
  );
});
