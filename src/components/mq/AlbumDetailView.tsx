"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft, Play, Pause, Shuffle, Heart, MoreHorizontal,
  Music2, Disc3, Clock3, ListPlus, Loader2, ArrowLeftRight, ExternalLink,
  ListMusic, Plus,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import type { Track } from "@/lib/musicApi";
import { formatDuration } from "@/lib/musicApi";
import { catalogToTrack } from "@/lib/playback/client";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { extractColors, type DominantColors } from "@/hooks/useDominantColor";
import { ProviderBadge } from "./ui/ProviderBadge";
import MenuCore, { backLabelSpec, type MenuElement } from "./ui/MenuCore";
import { NowPlayingEqualizer } from "./NowPlayingEqualizer";
import ContextMenu from "./ContextMenu";
import type { CatalogAlbumDTO, CatalogTrackDTO } from "@/lib/spotify/types";

/* ══════════════════════════════════════════════════════════════════════════
   ALBUM PAGE (V2) — full album context from the Spotify catalog.

   Hero: cover · title · artist (→ artist page) · year · track count · total
   duration. Track list: # | track | duration | provider | actions. Tracks are
   CATALOG tracks — the PlaybackResolver picks the audio source per track
   (SoundCloud / Audius) with visible attribution.
   ══════════════════════════════════════════════════════════════════════════ */

const FALLBACK_COLORS: DominantColors = {
  primary: "#8a5cf6", secondary: "#141420", muted: "#20202e",
  vibrant: "#a887ff", dark: "#0a0a12", rgb: { r: 138, g: 92, b: 246 },
};

interface Props {
  album: CatalogAlbumDTO;
  onBack: () => void;
  compactMode: boolean;
  animationsEnabled: boolean;
}

function AlbumDetailViewBase({ album, onBack, animationsEnabled }: Props) {
  const playTrack = useAppStore((s) => s.playTrack);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const addToQueue = useAppStore((s) => s.addToUpNext);
  const setSelectedArtist = useAppStore((s) => s.setSelectedArtist);
  const catalogResolving = useAppStore((s) => s.catalogResolving);
  const openSourceSwitcher = useAppStore((s) => s.openSourceSwitcher);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [detail, setDetail] = useState<{ album: CatalogAlbumDTO; tracks: CatalogTrackDTO[] } | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "unavailable">("loading");
  const [heroColors, setHeroColors] = useState<DominantColors>(FALLBACK_COLORS);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    // Deferred setState — avoids cascading renders (P2-#300 pattern).
    setTimeout(() => { if (!cancelled) { setState("loading"); setDetail(null); } }, 0);
    (async () => {
      try {
        const res = await fetch(
          `/api/catalog/album/${album.catalogId}?p=${album.provider === "deezer" ? "deezer" : "spotify"}`,
          { signal: ctrl.signal },
        );
        if (!res.ok) throw new Error("http");
        const d = (await res.json()) as {
          album: CatalogAlbumDTO | null; tracks: CatalogTrackDTO[];
        };
        if (cancelled) return;
        if (!d.album) {
          setState("unavailable");
          return;
        }
        setDetail({ album: d.album, tracks: d.tracks || [] });
        setState("ok");
      } catch {
        if (!cancelled) setState("unavailable");
      }
    })();
    return () => { cancelled = true; ctrl.abort(); };
  }, [album.catalogId, album.provider]);

  useEffect(() => {
    let cancelled = false;
    const src = detail?.album.image || album.image;
    if (!src) { setTimeout(() => { if (!cancelled) setHeroColors(FALLBACK_COLORS); }, 0); return; }
    extractColors(src).then((c) => { if (!cancelled) setHeroColors(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [detail?.album.image, album.image]);

  const albumTracks = useMemo<Track[]>(
    () => (detail?.tracks || []).map(catalogToTrack),
    [detail?.tracks],
  );

  const heroPlaying = !!currentTrack && albumTracks.some((t) => t.id === currentTrack.id || (currentTrack.catalogId && t.catalogId === currentTrack.catalogId));

  const playAlbum = useCallback(() => {
    if (albumTracks.length === 0) return;
    if (heroPlaying) { togglePlay(); return; }
    playTrack(albumTracks[0], albumTracks);
  }, [albumTracks, heroPlaying, playTrack, togglePlay]);

  const shuffleAlbum = useCallback(() => {
    if (albumTracks.length === 0) return;
    const shuffled = [...albumTracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    playTrack(shuffled[0], shuffled);
  }, [albumTracks, playTrack]);

  const shown = detail?.album || album;
  const year = detail?.album.year || album.year || (shown.releaseDate || "").slice(0, 4);
  const totalDuration = detail?.album.totalDurationSec || 0;

  const queueAlbum = useCallback(() => {
    if (albumTracks.length === 0) return;
    albumTracks.forEach((t) => addToQueue(t));
    toast({ title: "Альбом в очереди", description: `${albumTracks.length} треков добавлено` });
  }, [albumTracks, addToQueue, toast]);

  // ── V4.1 hero menus: Add-to-Playlist (picker page) + More (queue /
  //    provider). Real actions only — built on the same MenuCore engine
  //    every other MQ menu uses. ──
  const playlists = useAppStore((s) => s.playlists);
  const addToPlaylist = useAppStore((s) => s.addToPlaylist);
  const createPlaylist = useAppStore((s) => s.createPlaylist);
  const [heroMenu, setHeroMenu] = useState<{ x: number; y: number } | null>(null);
  const [heroMenuPage, setHeroMenuPage] = useState<"root" | "playlists">("root");

  const openHeroMenu = useCallback((e: React.MouseEvent, page: "root" | "playlists") => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHeroMenuPage(page);
    setHeroMenu({ x: r.left, y: r.bottom + 4 });
  }, []);

  const addAlbumToPlaylist = useCallback((playlistId: string, playlistName: string) => {
    if (albumTracks.length === 0) return;
    albumTracks.forEach((t) => addToPlaylist(playlistId, t));
    toast({
      title: "Альбом добавлен в плейлист",
      description: `${playlistName} · ${albumTracks.length} треков`,
    });
    setHeroMenu(null);
  }, [albumTracks, addToPlaylist, toast]);

  const quickCreateAndAddAlbum = useCallback(() => {
    const name = shown.artist || shown.name;
    createPlaylist(name);
    const state = useAppStore.getState();
    const newPl = [...state.playlists].reverse().find((p) => p.name === name);
    if (newPl) addAlbumToPlaylist(newPl.id, newPl.name);
    else setHeroMenu(null);
  }, [shown.artist, shown.name, createPlaylist, addAlbumToPlaylist]);

  const heroMenuElements = useMemo<MenuElement[]>(() => {
    if (heroMenuPage === "playlists") {
      return [
        backLabelSpec("Назад", () => setHeroMenuPage("root")),
        { type: "separator" },
        ...playlists.map<MenuElement>((pl) => ({
          type: "item",
          id: `pl-${pl.id}`,
          icon: ListMusic,
          label: pl.name,
          hint: String(pl.tracks?.length ?? 0),
          disabled: albumTracks.length === 0,
          onSelect: () => addAlbumToPlaylist(pl.id, pl.name),
        })),
        { type: "separator" },
        {
          type: "item",
          id: "pl-new",
          icon: Plus,
          label: "Новый плейлист",
          disabled: albumTracks.length === 0,
          onSelect: quickCreateAndAddAlbum,
        },
      ];
    }
    return [
      {
        type: "item",
        id: "queue",
        icon: ListPlus,
        label: "Добавить в очередь",
        hint: albumTracks.length ? String(albumTracks.length) : undefined,
        disabled: albumTracks.length === 0,
        onSelect: () => { queueAlbum(); setHeroMenu(null); },
      },
      ...(shown.externalUrl
        ? [{
            type: "item" as const,
            id: "provider",
            icon: ExternalLink,
            label: "Открыть у провайдера",
            onSelect: () => { window.open(shown.externalUrl, "_blank", "noopener,noreferrer"); setHeroMenu(null); },
          }]
        : []),
    ];
  }, [heroMenuPage, playlists, albumTracks.length, addAlbumToPlaylist, quickCreateAndAddAlbum, queueAlbum, shown.externalUrl]);

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-5 pb-10" data-mq-spotify-album={album.catalogId}>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium mt-3 mb-4 hover:opacity-80 transition-opacity"
        style={{ color: "var(--mq-text)" }}
        aria-label="Назад"
      >
        <ChevronLeft className="w-4 h-4" />
        Назад
      </button>

      {state === "loading" && (
        <div className="space-y-4">
          <div className={`flex ${isMobile ? "flex-col items-center text-center" : "items-end"} gap-6 animate-pulse`}>
            <div className="w-44 lg:w-52 aspect-square rounded-[var(--mq-r-card)] bg-[var(--mq-surface-1)]" />
            <div className="flex-1 w-full space-y-3 py-3">
              <div className="h-3.5 w-20 rounded bg-[var(--mq-surface-1)]" />
              <div className="h-10 w-2/3 rounded bg-[var(--mq-surface-1)]" />
              <div className="h-3.5 w-40 rounded bg-[var(--mq-surface-1)]" />
            </div>
          </div>
          <div className="space-y-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-[var(--mq-r-card)]" style={{ background: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)" }}>
                <div className="w-4 h-3 rounded bg-[var(--mq-surface-2)] animate-pulse" />
                <div className="w-11 h-11 rounded-[var(--mq-r-art)] bg-[var(--mq-surface-2)] animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/2 rounded bg-[var(--mq-surface-2)] animate-pulse" />
                  <div className="h-3 w-1/3 rounded bg-[var(--mq-surface-2)] animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {state === "unavailable" && (
        <div className="mq-empty">
          <Disc3 className="w-7 h-7" style={{ color: "var(--mq-text-muted)" }} />
          <p className="mq-empty-title">Альбом недоступен</p>
          <p className="mq-empty-hint">Не удалось загрузить альбом из каталога. Попробуйте позже.</p>
        </div>
      )}

      {state === "ok" && (
        <div className="space-y-8">
          {/* Hero */}
          <div
            className="relative overflow-hidden"
            style={{
              borderRadius: "var(--mq-r-card, 16px)",
              background: `linear-gradient(135deg, ${heroColors.dark} 0%, ${heroColors.primary}1f 55%, ${heroColors.dark} 100%)`,
              border: "1px solid var(--mq-edge)",
            }}
          >
            <div className={`relative flex ${isMobile ? "flex-col items-center text-center p-5" : "items-end gap-6 px-7 py-6"}`}>
              <div
                className={`${isMobile ? "w-40" : "w-44 lg:w-48"} aspect-square rounded-[var(--mq-r-card)] overflow-hidden mq-art shrink-0`}
                style={{ boxShadow: "0 18px 48px rgba(0,0,0,0.45)", backgroundColor: "var(--mq-surface-2)" }}
              >
                {shown.image ? (
                  <img src={shown.image} alt={shown.name} className="w-full h-full object-cover" draggable={false} loading="eager" fetchPriority="high" decoding="async" />
                ) : (
                  <span className="w-full h-full grid place-items-center"><Disc3 className="w-10 h-10" style={{ color: "var(--mq-text-muted)" }} /></span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <ProviderBadge
                    provider={shown.provider === "deezer" ? "deezer" : "spotify"}
                    title={`Каталог: ${shown.provider === "deezer" ? "Deezer" : "Spotify"}`}
                  />
                  <span className="mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>Альбом</span>
                </div>
                {/* V4.1: long titles clamp to two lines — the hero keeps its
                    height budget and never pushes the tracklist away. */}
                <h1
                  className="font-bold tracking-tight"
                  style={{
                    fontSize: isMobile ? "clamp(24px, 7vw, 34px)" : "clamp(30px, 3.5vw, 44px)",
                    lineHeight: 1.08,
                    color: "var(--mq-text)",
                    overflowWrap: "anywhere",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {shown.name}
                </h1>
                <div className={`flex flex-wrap ${isMobile ? "justify-center" : ""} items-center gap-x-2 gap-y-1 mt-2.5 text-sm`}>
                  <button
                    onClick={() => {
                      const t0 = (detail?.tracks || [])[0];
                      setSelectedArtist({
                        name: shown.artist,
                        catalogArtistId: t0?.artistId,
                        catalogProvider: shown.provider === "deezer" ? "deezer" : "spotify",
                      });
                    }}
                    className="font-semibold hover:underline"
                    style={{ color: "var(--mq-text)" }}
                  >
                    {shown.artist}
                  </button>
                  {year && <><span style={{ color: "var(--mq-text-muted)" }}>·</span><span style={{ color: "var(--mq-text-muted)" }}>{year}</span></>}
                  <><span style={{ color: "var(--mq-text-muted)" }}>·</span><span className="mq-t-num" style={{ color: "var(--mq-text-muted)" }}>{shown.totalTracks} треков</span></>
                  {totalDuration > 0 && (
                    <><span style={{ color: "var(--mq-text-muted)" }}>·</span><span className="mq-t-num" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(totalDuration)}</span></>
                  )}
                </div>
                {/* V4.1 action row: Play (primary, honest state) · Shuffle ·
                    Add to Playlist · More. Queue / provider moved into the
                    More menu — four clear affordances instead of a row of
                    equal grey buttons. */}
                <div className={`flex flex-wrap ${isMobile ? "justify-center" : ""} items-center gap-2.5 mt-4`}>
                  <button
                    onClick={playAlbum}
                    disabled={albumTracks.length === 0}
                    className="mq-platinum-btn inline-flex items-center gap-2 px-5 h-11 rounded-full text-sm font-semibold transition-transform active:scale-[0.97] disabled:opacity-40"
                    aria-label={heroPlaying && isPlaying ? "Пауза" : heroPlaying ? "Продолжить" : "Слушать"}
                    data-mq-album-play
                  >
                    {heroPlaying && isPlaying
                      ? <Pause className="w-4 h-4" fill="currentColor" />
                      : <Play className="w-4 h-4" fill="currentColor" />}
                    {heroPlaying && isPlaying ? "Пауза" : heroPlaying ? "Продолжить" : "Слушать"}
                  </button>
                  <button
                    onClick={shuffleAlbum}
                    disabled={albumTracks.length === 0}
                    className="mq-hit44 inline-flex items-center justify-center w-11 h-11 rounded-full text-sm font-semibold transition-colors hover:bg-[var(--mq-surface-2)] disabled:opacity-40"
                    style={{ background: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)", color: "var(--mq-text)" }}
                    aria-label="Перемешать"
                    title="Перемешать"
                  >
                    <Shuffle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => openHeroMenu(e, "playlists")}
                    disabled={albumTracks.length === 0}
                    className="mq-hit44 inline-flex items-center justify-center gap-2 w-11 h-11 rounded-full text-sm font-semibold transition-colors hover:bg-[var(--mq-surface-2)] disabled:opacity-40"
                    style={{ background: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)", color: "var(--mq-text)" }}
                    aria-label="Добавить альбом в плейлист"
                    title="Добавить в плейлист"
                    data-mq-album-addplaylist
                  >
                    <ListMusic className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => openHeroMenu(e, "root")}
                    className="mq-hit44 inline-flex items-center justify-center w-11 h-11 rounded-full text-sm font-semibold transition-colors hover:bg-[var(--mq-surface-2)]"
                    style={{ background: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)", color: "var(--mq-text)" }}
                    aria-label="Ещё действия"
                    aria-haspopup="menu"
                    data-mq-album-more
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Track list — V4.1: no column-header row (the section head +
              self-evident row anatomy carry the structure; the old header
              duplicated «Треки»/«Трек» and read as noise). */}
          {albumTracks.length > 0 ? (
            <section>
              <div className="flex items-baseline justify-between mb-2 px-1">
                <h3 className="mq-t-shelf">Треки</h3>
                <span className="mq-t-meta-2 mq-t-num" style={{ color: "var(--mq-text-muted)" }}>{albumTracks.length}</span>
              </div>
              <AlbumTrackList tracks={albumTracks} animationsEnabled={animationsEnabled} />
              {catalogResolving && (
                <p className="flex items-center gap-2 mt-2 px-1 text-xs" style={{ color: "var(--mq-text-muted)" }}>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Подбираем источник воспроизведения…
                </p>
              )}
            </section>
          ) : (
            <div className="mq-empty">
              <Music2 className="w-7 h-7" style={{ color: "var(--mq-text-muted)" }} />
              <p className="mq-empty-title">В альбоме нет треков</p>
            </div>
          )}
        </div>
      )}

      {/* V4.1 hero menu (portal) — Add-to-Playlist picker + More */}
      {heroMenu && (
        <MenuCore
          anchor={heroMenu}
          onClose={() => setHeroMenu(null)}
          elements={heroMenuElements}
          ariaLabel={`Действия: альбом ${shown.name}`}
          header={
            heroMenuPage === "playlists" ? (
              <div className="mq-menu-label">Добавить альбом в плейлист</div>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

/* ── Album track list: # | Track | Duration | Provider | Actions ── */

const AlbumTrackList = memo(function AlbumTrackList({
  tracks, animationsEnabled,
}: {
  tracks: Track[]; animationsEnabled: boolean;
}) {
  const currentTrackId = useAppStore((s) => s.currentTrack?.id);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const playTrack = useAppStore((s) => s.playTrack);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const addToQueue = useAppStore((s) => s.addToUpNext);
  const [menu, setMenu] = useState<{ track: Track; x: number; y: number } | null>(null);

  return (
    <>
      <div className="space-y-0.5">
        {tracks.map((track, i) => {
          const isActive = currentTrackId === track.id;
          return (
            <motion.div
              key={track.id}
              initial={animationsEnabled ? { opacity: 0, y: 6 } : undefined}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.18, delay: Math.min(i * 0.012, 0.12) }}
              onClick={() => (isActive ? togglePlay() : playTrack(track, tracks))}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); isActive ? togglePlay() : playTrack(track, tracks); } }}
              aria-label={`Слушать ${track.title}`}
              className="mq-row group"
              data-active={isActive || undefined}
              data-mq-album-track={track.id}
            >
              <span className="w-6 shrink-0 flex items-center justify-center">
                {isActive ? (
                  <NowPlayingEqualizer size="xs" variant="inline" paused={!isPlaying} />
                ) : (
                  <>
                    <span className="mq-t-num text-xs group-hover:hidden" style={{ color: "var(--mq-text-muted)" }}>{i + 1}</span>
                    <Play className="w-3.5 h-3.5 hidden group-hover:block" fill="currentColor" style={{ color: "var(--mq-text)" }} />
                  </>
                )}
              </span>
              <span className="w-11 h-11 rounded-[var(--mq-r-art)] overflow-hidden flex-shrink-0 mq-art relative" style={{ backgroundColor: "var(--mq-surface-2)" }}>
                {track.cover ? (
                  <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                ) : (
                  <span className="w-full h-full grid place-items-center"><Music2 className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} /></span>
                )}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold truncate" style={{ color: isActive ? "var(--mq-accent)" : "var(--mq-text)" }}>
                  {track.title}
                </span>
                <span className="block text-xs truncate mt-0.5" style={{ color: "var(--mq-text-muted)" }}>{track.artist}</span>
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); toggleLike(track.id, track); }}
                className="mq-hit44 w-10 h-10 sm:w-8 sm:h-8 rounded-full grid place-items-center shrink-0"
                style={{ color: likedTrackIds.includes(track.id) ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
                aria-label="В избранное"
              >
                <Heart className="w-4 h-4" fill={likedTrackIds.includes(track.id) ? "currentColor" : "none"} />
              </button>
              <span className="w-14 hidden sm:flex items-center shrink-0">
                <ProviderBadge provider={track.catalogProvider === "deezer" ? "deezer" : "spotify"} />
              </span>
              <span className="mq-t-num text-xs w-14 text-right shrink-0" style={{ color: "var(--mq-text-muted)" }}>
                {track.duration > 0 ? formatDuration(track.duration) : "—"}
              </span>
              <span className="w-[76px] sm:w-16 flex items-center justify-end gap-0.5 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); addToQueue(track); }}
                  className="mq-hit44 w-10 h-10 sm:w-8 sm:h-8 rounded-full grid place-items-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  style={{ color: "var(--mq-text-muted)" }}
                  aria-label="В очередь"
                  title="Добавить в очередь"
                >
                  <ListPlus className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setMenu({ track, x: r.left, y: r.bottom + 4 });
                  }}
                  className="mq-hit44 w-10 h-10 sm:w-8 sm:h-8 rounded-full grid place-items-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  style={{ color: "var(--mq-text-muted)" }}
                  aria-label="Меню"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </span>
            </motion.div>
          );
        })}
      </div>
      {menu && <ContextMenu track={menu.track} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </>
  );
});

export const AlbumDetailView = memo(AlbumDetailViewBase);
export default AlbumDetailView;
