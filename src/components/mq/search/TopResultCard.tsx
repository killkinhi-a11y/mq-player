"use client";

// Extracted from SearchView.tsx (Stage III decomposition) — moved verbatim.
import ArtistActionsMenu, { type ArtistMenuTarget } from "../ArtistActionsMenu";
import ContextMenu from "../ContextMenu";
import { DEFAULT_COLORS, type DominantColors, extractColors } from "@/hooks/useDominantColor";
import { Disc, MoreHorizontal, Music, Pause, Play, User } from "lucide-react";
import { ProviderBadge } from "../ui/ProviderBadge";
import { type Track, formatDuration } from "@/lib/musicApi";
import { useAppStore } from "@/store/useAppStore";
import { useCallback, useEffect, useState } from "react";

// ═════════════════════════════════════════════════════════════════════════
// TOP RESULT HERO (V4.1) — the editorial hero of the search results.
// Entity-aware (track / artist / album — the type is never substituted),
// artwork-dominant, solid featured surface. Full honest metadata ladder:
// eyebrow → display title → artist/album/year/duration → provider badge.
// Primary Play CTA + real secondary actions in the context menu. Mobile
// is its own narrow composition (not a squeezed desktop card). No fake
// Playing status: the button reflects the real playback state only.
// ═════════════════════════════════════════════════════════════════════════

export type TopHeroAlbum = {
  album: string; artist: string; cover?: string; count: number;
  catalogAlbumId?: string; catalogProvider?: "spotify" | "deezer"; year?: string;
};

export function TopResultCard({
  result,
  queue,
  onArtistClick,
  onPlay,
  onAlbumOpen,
}: {
  result:
    | { kind: "artist"; artist: { name: string; cover?: string; count: number; topTrack: Track; catalogArtistId?: string; catalogProvider?: "spotify" | "deezer"; followers?: number } }
    | { kind: "album"; album: TopHeroAlbum }
    | { kind: "track"; track: Track };
  queue: Track[];
  onArtistClick: (name: string, cover?: string, catalogArtistId?: string, catalogProvider?: "spotify" | "deezer") => void;
  onPlay: (track: Track, queue: Track[]) => void;
  onAlbumOpen: (album: TopHeroAlbum) => void;
}) {
  const currentTrackId = useAppStore((s) => s.currentTrack?.id);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const [trackMenu, setTrackMenu] = useState<{ x: number; y: number } | null>(null);
  const [artistMenu, setArtistMenu] = useState<{ x: number; y: number } | null>(null);

  const isArtist = result.kind === "artist";
  const isAlbum = result.kind === "album";
  // The playable track for artist heroes = the artist's top result track;
  // album heroes open the album page instead (no tracks are loaded here —
  // an album "Play" without tracks would be a fake button).
  const track: Track | null = isArtist ? result.artist.topTrack : isAlbum ? null : result.track;
  const title = isArtist ? result.artist.name : isAlbum ? result.album.album : result.track.title;
  const cover = isArtist ? result.artist.cover : isAlbum ? result.album.cover : result.track.cover;

  // V4.2 §2.1 — dominant-color ambient under the CIRCULAR artist artwork.
  // The same treatment as the artist page hero (SpotifyArtistView):
  // extractColors runs on the already-displayed cover (browser cache, no
  // extra request), falls back to DEFAULT_COLORS on error/timeout.
  const [heroColors, setHeroColors] = useState<DominantColors>(DEFAULT_COLORS);
  useEffect(() => {
    let cancelled = false;
    if (isArtist && cover) {
      extractColors(cover).then((c) => { if (!cancelled) setHeroColors(c); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [isArtist, cover]);

  // Honest now-playing state: only when THIS track is really current.
  const isCurrent = !!track && track.id === currentTrackId;
  const playLabel = isCurrent ? (isPlaying ? "Пауза" : "Продолжить") : "Слушать";

  const openEntity = useCallback(() => {
    if (isArtist) onArtistClick(result.artist.name, result.artist.cover, result.artist.catalogArtistId, result.artist.catalogProvider);
    else if (isAlbum) onAlbumOpen(result.album);
    else if (track) onPlay(track, [track]);
  }, [isArtist, isAlbum, result, track, onArtistClick, onAlbumOpen, onPlay]);

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAlbum) { onAlbumOpen(result.album); return; }
    if (!track) return;
    if (isCurrent) { togglePlay(); return; }
    // Queue context = the artist's own tracks from the live results (real
    // data, no refetch); fallback to the results list, else the track.
    if (isArtist) {
      const artistTracks = queue.filter((t) => t.artist && t.artist.toLowerCase() === result.artist.name.toLowerCase());
      onPlay(track, artistTracks.length > 0 ? artistTracks : [track]);
      return;
    }
    onPlay(track, queue.length > 0 ? queue : [track]);
  };

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (isArtist) setArtistMenu({ x: r.left, y: r.bottom + 4 });
    else if (track) setTrackMenu({ x: r.left, y: r.bottom + 4 });
  };

  const typeLabel = isArtist ? "Артист" : isAlbum ? "Альбом" : "Трек";
  // Metadata: real fields only — each line renders ONLY when the data
  // exists (no invented years, albums or durations).
  const artistLine = isArtist
    ? result.artist.followers && result.artist.followers > 0
      ? `${Intl.NumberFormat("ru-RU").format(result.artist.followers)} слушателей`
      : result.artist.count > 0
        ? `${result.artist.count} ${result.artist.count === 1 ? "трек" : result.artist.count < 5 ? "трека" : "треков"} в результатах`
        : "Артист"
    : isAlbum
      ? result.album.artist || "Альбом"
      : result.track.artist;
  const albumLine = !isArtist && !isAlbum && result.track.album ? result.track.album : null;
  const tailLine = isAlbum
    ? [
        result.album.year || null,
        result.album.count > 0 ? `${result.album.count} ${result.album.count === 1 ? "трек" : result.album.count < 5 ? "трека" : "треков"}` : null,
      ].filter(Boolean).join(" · ") || null
    : !isArtist && !isAlbum && result.track.duration > 0
      ? formatDuration(result.track.duration)
      : null;
  const provider = isArtist
    ? result.artist.catalogProvider === "deezer" ? "deezer" : result.artist.catalogProvider === "spotify" ? "spotify" : null
    : isAlbum
      ? result.album.catalogProvider === "deezer" ? "deezer" : result.album.catalogProvider === "spotify" ? "spotify" : null
      : result.track.catalogProvider === "deezer" || result.track.catalogProvider === "spotify"
        ? result.track.catalogProvider
        : result.track.playbackProvider || (result.track.source === "audius" || result.track.source === "soundcloud" ? result.track.source : null);

  const artRadius = isArtist ? "50%" : "var(--mq-mat-radius-float, 18px)";
  const artClass = "mq-art flex-shrink-0";
  // V4.2 §2.1: circles get the dominant-color ambient (the established
  // artist-hero treatment) — a soft colored halo that lifts the circle off
  // the card; rectangular artwork keeps the standard material shadow.
  // rgba() syntax is required — the legacy `${r},${g},${b}33` template on
  // SpotifyArtistView produced invalid CSS and never rendered.
  const artShadow = isArtist
    ? `0 18px 48px rgba(${heroColors.rgb.r}, ${heroColors.rgb.g}, ${heroColors.rgb.b}, 0.33)`
    : "var(--mq-mat-2-shadow)";
  const artStyle: React.CSSProperties = {
    width: 152, height: 152,
    borderRadius: artRadius,
    overflow: "hidden",
    backgroundColor: "var(--mq-surface-2)",
    boxShadow: artShadow,
    display: "flex", alignItems: "center", justifyContent: "center",
  };
  const FallbackIcon = isArtist ? User : isAlbum ? Disc : Music;

  const titleBlock = (
    <h3
      className="mq-t-display text-[22px] sm:text-[26px] leading-[1.08] break-words"
      style={{
        color: "var(--mq-text)",
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}
    >
      {title}
    </h3>
  );

  const metaBlock = (
    <div className="mt-1.5 min-w-0">
      <p className="mq-t-artist truncate" style={{ color: "var(--mq-text-muted)" }}>
        {typeLabel}
        {artistLine && artistLine !== typeLabel ? ` · ${artistLine}` : ""}
      </p>
      {albumLine && (
        <p className="mq-t-meta truncate mt-0.5" style={{ color: "var(--mq-text-muted)" }}>{albumLine}</p>
      )}
      <div className="flex items-center gap-2 mt-1.5 min-w-0">
        {provider && <ProviderBadge provider={provider as "deezer" | "spotify" | "soundcloud" | "audius"} size="sm" />}
        {tailLine && (
          <span className="mq-t-meta mq-t-num truncate" style={{ color: "var(--mq-text-muted)" }}>{tailLine}</span>
        )}
      </div>
    </div>
  );

  const playBlock = (
    <div className="flex items-center gap-2 mt-4">
      <button
        onClick={handlePlay}
        className="mq-platinum-btn mq-platinum-btn--hero flex-1 min-w-0 flex items-center justify-center gap-2 h-11 px-5 rounded-full text-sm font-semibold transition-transform active:scale-[0.97]"
        aria-label={isAlbum ? `Открыть альбом ${title}` : `${playLabel} ${title}`}
        data-mq-topresult-play
      >
        {isAlbum ? (
          <><Disc className="w-4 h-4" />Открыть альбом</>
        ) : (
          <>
            {isCurrent && isPlaying
              ? <Pause className="w-4 h-4" fill="currentColor" />
              : <Play className="w-4 h-4" fill="currentColor" />}
            {playLabel}
          </>
        )}
      </button>
      {!isAlbum && (
        <button
          onClick={openMenu}
          className="mq-hit44 w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors"
          style={{
            background: "color-mix(in srgb, var(--mq-text) 7%, transparent)",
            border: "1px solid var(--mq-edge)",
            color: "var(--mq-text)",
          }}
          aria-label={`Действия: ${title}`}
          aria-haspopup="menu"
        >
          <MoreHorizontal className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
        </button>
      )}
    </div>
  );

  return (
    <div
      className="mq-search-topresult group"
      role="button"
      tabIndex={0}
      onClick={openEntity}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openEntity();
        }
      }}
      aria-label={
        isArtist ? `Открыть артиста ${title}`
        : isAlbum ? `Открыть альбом ${title}`
        : `Слушать ${title}`
      }
      data-mq-topresult-kind={result.kind}
    >
      {/* Desktop (lg+): vertical editorial ladder — eyebrow, dominant
          artwork, title, metadata, actions */}
      <div className="hidden lg:block">
        <div className="flex items-center justify-between gap-2">
          <p className="mq-t-meta text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--mq-text-muted)" }}>
            Топ-результат
          </p>
          <span
            className="mq-t-meta-2 text-[11px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full"
            style={{
              color: "color-mix(in srgb, var(--mq-text) 72%, transparent)",
              background: "color-mix(in srgb, var(--mq-text) 6%, transparent)",
            }}
          >
            {typeLabel}
          </span>
        </div>
        <div className={artClass} style={{ ...artStyle, width: 168, height: 168, marginTop: 14 }}>
          {cover ? (
            <img src={cover} alt="" className="w-full h-full object-cover" loading="eager" draggable={false} />
          ) : (
            <FallbackIcon className="w-10 h-10" style={{ color: "var(--mq-text-muted)" }} />
          )}
        </div>
        <div className="mt-3.5 min-w-0">{titleBlock}</div>
        {metaBlock}
        {playBlock}
      </div>

      {/* Mobile (<lg): horizontal composition — art 112px + text column,
          full-width play row. Independent rhythm, no squeezed desktop. */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <p className="mq-t-meta text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--mq-text-muted)" }}>
            Топ-результат
          </p>
          <span
            className="mq-t-meta-2 text-[11px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full"
            style={{
              color: "color-mix(in srgb, var(--mq-text) 72%, transparent)",
              background: "color-mix(in srgb, var(--mq-text) 6%, transparent)",
            }}
          >
            {typeLabel}
          </span>
        </div>
        <div className="flex items-start gap-3.5">
          <div className={artClass} style={{ ...artStyle, width: 112, height: 112 }}>
            {cover ? (
              <img src={cover} alt="" className="w-full h-full object-cover" loading="eager" draggable={false} />
            ) : (
              <FallbackIcon className="w-8 h-8" style={{ color: "var(--mq-text-muted)" }} />
            )}
          </div>
          <div className="min-w-0 flex-1">{titleBlock}{metaBlock}</div>
        </div>
        {playBlock}
      </div>

      {/* Secondary actions — real menus only (track: full ContextMenu,
          artist: ArtistActionsMenu; album hero opens the album page —
          no fake album actions). */}
      {trackMenu && track && (
        <ContextMenu track={track} x={trackMenu.x} y={trackMenu.y} onClose={() => setTrackMenu(null)} />
      )}
      {artistMenu && isArtist && (
        <ArtistActionsMenu
          artist={{
            name: result.artist.name,
            avatar: result.artist.cover,
            followers: result.artist.followers,
            trackCount: result.artist.count,
          } satisfies ArtistMenuTarget}
          x={artistMenu.x}
          y={artistMenu.y}
          onClose={() => setArtistMenu(null)}
        />
      )}
    </div>
  );
}
