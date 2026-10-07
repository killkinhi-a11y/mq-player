"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft, Play, Pause, Shuffle, Heart, MoreHorizontal,
  BadgeCheck, Music2, Disc3, Users, Loader2, ArrowLeftRight,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import type { Track } from "@/lib/musicApi";
import { formatDuration } from "@/lib/musicApi";
import { catalogToTrack } from "@/lib/playback/client";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { extractColors, type DominantColors } from "@/hooks/useDominantColor";
import { ProviderBadge } from "./ui/ProviderBadge";
import ContextMenu from "./ContextMenu";
import type {
  CatalogAlbumDTO,
  CatalogArtistDTO,
  CatalogTrackDTO,
} from "@/lib/spotify/types";

/* ══════════════════════════════════════════════════════════════════════════
   SPOTIFY ARTIST PAGE (V2 multi-provider engine).

   Full catalog context from Spotify: hero, popular tracks, albums, singles,
   EPs, appears-on, related artists. Tracks are CATALOG tracks — playback is
   resolved per-track by the PlaybackResolver (SoundCloud / Audius) when they
   become current; attribution is always visible.

   Design: MQ design system (solid content cards, mq-row track rows,
   section headers, real dominant-color hero). Mobile is an adapted
   composition, not a shrunken desktop.
   ══════════════════════════════════════════════════════════════════════════ */

interface ArtistPageData {
  artist: CatalogArtistDTO | null;
  topTracks: CatalogTrackDTO[];
  albums: CatalogAlbumDTO[];
  singles: CatalogAlbumDTO[];
  eps: CatalogAlbumDTO[];
  appearsOn: CatalogAlbumDTO[];
  related: CatalogArtistDTO[];
}

const EMPTY: ArtistPageData = {
  artist: null, topTracks: [], albums: [], singles: [], eps: [], appearsOn: [], related: [],
};

const FALLBACK_COLORS: DominantColors = {
  primary: "#8a5cf6", secondary: "#141420", muted: "#20202e",
  vibrant: "#a887ff", dark: "#0a0a12", rgb: { r: 138, g: 92, b: 246 },
};

function fmtFollowers(n?: number): string {
  if (!n || n <= 0) return "";
  return `${Intl.NumberFormat("ru-RU").format(n)} слушателей`;
}

/* ── Track row (catalog) ───────────────────────────────────────────── */

const CatalogTrackRow = memo(function CatalogTrackRow({
  track, index, queue, animationsEnabled,
}: {
  track: Track; index: number; queue: Track[]; animationsEnabled: boolean;
}) {
  const currentTrackId = useAppStore((s) => s.currentTrack?.id);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const playTrack = useAppStore((s) => s.playTrack);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const likedTrackIds = useAppStore((s) => s.likedTrackIds);
  const toggleLike = useAppStore((s) => s.toggleLike);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const isActive = currentTrackId === track.id;

  return (
    <>
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 6 } : undefined}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.18, delay: Math.min(index * 0.012, 0.12) }}
        onClick={() => (isActive ? togglePlay() : playTrack(track, queue))}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); isActive ? togglePlay() : playTrack(track, queue); } }}
        aria-label={`Слушать ${track.title} — ${track.artist}`}
        className="mq-row group"
        data-active={isActive || undefined}
        data-mq-artist-track={track.id}
      >
        <span className="mq-t-num w-6 text-left shrink-0" style={{ color: "var(--mq-text-muted)", opacity: 0.8 }}>
          {index + 1}
        </span>
        <span className="w-11 h-11 rounded-[var(--mq-r-art)] overflow-hidden flex-shrink-0 mq-art relative" style={{ backgroundColor: "var(--mq-surface-2)" }}>
          {track.cover ? (
            <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
          ) : (
            <span className="w-full h-full grid place-items-center"><Music2 className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} /></span>
          )}
          <span
            className="absolute inset-0 hidden group-hover:grid place-items-center"
            style={{ background: "rgba(0,0,0,0.45)" }}
          >
            {isActive && isPlaying
              ? <Pause className="w-4 h-4" fill="#fff" />
              : <Play className="w-4 h-4" fill="#fff" />}
          </span>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold truncate" style={{ color: isActive ? "var(--mq-accent)" : "var(--mq-text)" }}>
            {track.title}
          </span>
          <span className="flex items-center gap-1.5 mt-0.5 min-w-0">
            <span className="text-xs truncate" style={{ color: "var(--mq-text-muted)" }}>{track.artist}</span>
            <ProviderBadge provider="spotify" />
          </span>
        </span>
        <span className="mq-t-num text-xs shrink-0" style={{ color: "var(--mq-text-muted)" }}>
          {track.duration > 0 ? formatDuration(track.duration) : "—"}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); toggleLike(track.id, track); }}
          className="w-8 h-8 rounded-full grid place-items-center shrink-0"
          style={{ color: likedTrackIds.includes(track.id) ? "var(--mq-accent)" : "var(--mq-text-muted)" }}
          aria-label="В избранное"
        >
          <Heart className="w-4 h-4" fill={likedTrackIds.includes(track.id) ? "currentColor" : "none"} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMenu({ x: r.left, y: r.bottom + 4 });
          }}
          className="w-8 h-8 rounded-full grid place-items-center shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          style={{ color: "var(--mq-text-muted)" }}
          aria-label="Меню"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </motion.div>
      {menu && <ContextMenu track={track} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </>
  );
});

/* ── Release tile ──────────────────────────────────────────────────── */

function ReleaseTile({ album, index, animationsEnabled, onOpen }: {
  album: CatalogAlbumDTO; index: number; animationsEnabled: boolean;
  onOpen: (album: CatalogAlbumDTO) => void;
}) {
  return (
    <motion.button
      initial={animationsEnabled ? { opacity: 0, y: 8 } : undefined}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.12) }}
      onClick={() => onOpen(album)}
      className="text-left group"
      data-mq-artist-release={album.spotifyId}
    >
      <span className="block aspect-square rounded-[var(--mq-r-card)] overflow-hidden mb-2 mq-art" style={{ backgroundColor: "var(--mq-surface-2)", boxShadow: "var(--mq-mat-2-shadow)" }}>
        {album.image ? (
          <img src={album.image} alt="" className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" loading="lazy" draggable={false} />
        ) : (
          <span className="w-full h-full grid place-items-center"><Disc3 className="w-6 h-6" style={{ color: "var(--mq-text-muted)" }} /></span>
        )}
      </span>
      <span className="block text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{album.name}</span>
      <span className="block mq-t-meta-2 truncate" style={{ color: "var(--mq-text-muted)" }}>
        {[album.year, album.albumType === "single" ? "Сингл" : album.albumType === "appears_on" ? "Сборник" : "Альбом"].filter(Boolean).join(" · ")}
      </span>
    </motion.button>
  );
}

/* ── Main view ─────────────────────────────────────────────────────── */

interface Props {
  spotifyArtistId: string;
  artistName: string;
  onBack: () => void;
  compactMode: boolean;
  animationsEnabled: boolean;
}

function SpotifyArtistViewBase({ spotifyArtistId, artistName, onBack, animationsEnabled }: Props) {
  const playTrack = useAppStore((s) => s.playTrack);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const favoriteArtists = useAppStore((s) => s.favoriteArtists);
  const addFavoriteArtist = useAppStore((s) => s.addFavoriteArtist);
  const removeFavoriteArtist = useAppStore((s) => s.removeFavoriteArtist);
  const setSelectedArtist = useAppStore((s) => s.setSelectedArtist);
  const openSpotifyAlbum = useAppStore((s) => s.openSpotifyAlbum);
  const catalogResolving = useAppStore((s) => s.catalogResolving);
  const openSourceSwitcher = useAppStore((s) => s.openSourceSwitcher);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [data, setData] = useState<ArtistPageData>(EMPTY);
  const [state, setState] = useState<"loading" | "ok" | "unavailable">("loading");
  const [heroColors, setHeroColors] = useState<DominantColors>(FALLBACK_COLORS);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    // Deferred setState — avoids cascading renders (P2-#300 pattern).
    setTimeout(() => { if (!cancelled) { setState("loading"); setData(EMPTY); } }, 0);
    (async () => {
      try {
        const res = await fetch(`/api/spotify/artist/${spotifyArtistId}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error("http");
        const d = (await res.json()) as { configured: boolean; unavailable?: boolean } & ArtistPageData;
        if (cancelled) return;
        if (!d.configured || d.unavailable || !d.artist) {
          setState("unavailable");
          return;
        }
        setData({
          artist: d.artist,
          topTracks: d.topTracks || [],
          albums: d.albums || [],
          singles: d.singles || [],
          eps: d.eps || [],
          appearsOn: d.appearsOn || [],
          related: d.related || [],
        });
        setState("ok");
      } catch {
        if (!cancelled) setState("unavailable");
      }
    })();
    return () => { cancelled = true; ctrl.abort(); };
  }, [spotifyArtistId]);

  /* Hero gradient from the real artwork */
  useEffect(() => {
    let cancelled = false;
    const src = data.artist?.image;
    if (!src) { setTimeout(() => { if (!cancelled) setHeroColors(FALLBACK_COLORS); }, 0); return; }
    extractColors(src).then((c) => { if (!cancelled) setHeroColors(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [data.artist?.image]);

  const topTrackQueue = useMemo<Track[]>(
    () => data.topTracks.map(catalogToTrack),
    [data.topTracks],
  );

  const heroPlaying = !!currentTrack && topTrackQueue.some((t) => t.id === currentTrack.id || currentTrack.spotifyId === t.spotifyId);

  const isFav = favoriteArtists.some((a) => a.username === (data.artist?.name || artistName));

  const playPopular = useCallback(() => {
    if (topTrackQueue.length === 0) return;
    if (heroPlaying) { togglePlay(); return; }
    playTrack(topTrackQueue[0], topTrackQueue);
  }, [topTrackQueue, heroPlaying, playTrack, togglePlay]);

  const shufflePopular = useCallback(() => {
    if (topTrackQueue.length === 0) return;
    const shuffled = [...topTrackQueue];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const st = useAppStore.getState();
    useAppStore.setState({ shuffle: true, queue: shuffled, queueIndex: 0 });
    playTrack(shuffled[0], shuffled);
    setTimeout(() => useAppStore.setState({ shuffle: st.shuffle }), 100);
  }, [topTrackQueue, playTrack]);

  const toggleFollow = useCallback(() => {
    const name = data.artist?.name || artistName;
    if (!name) return;
    if (isFav) {
      const fav = favoriteArtists.find((a) => a.username === name);
      if (fav) removeFavoriteArtist(fav.id);
      toast({ title: "Исполнитель удалён из избранного" });
    } else {
      addFavoriteArtist({
        id: Date.now(),
        username: name,
        avatar: data.artist?.image || "",
        followers: data.artist?.followers || 0,
        genre: (data.artist?.genres || [])[0] || "",
        trackCount: 0,
      });
      toast({ title: "Исполнитель добавлен в избранное" });
    }
  }, [data.artist, artistName, isFav, favoriteArtists, addFavoriteArtist, removeFavoriteArtist, toast]);

  const hero = (
    <div
      ref={heroRef}
      className="relative overflow-hidden"
      style={{
        borderRadius: "var(--mq-r-card, 16px)",
        background: `linear-gradient(135deg, ${heroColors.dark} 0%, ${heroColors.primary}22 55%, ${heroColors.dark} 100%)`,
        border: "1px solid var(--mq-edge)",
      }}
    >
      <div
        style={{
          position: "absolute", inset: 0,
          background: `radial-gradient(80% 120% at 20% 0%, ${heroColors.rgb.r},${heroColors.rgb.g},${heroColors.rgb.b} 0%, transparent 60%)`,
          opacity: 0.25, pointerEvents: "none",
        }}
      />
      <div className={`relative flex gap-5 ${isMobile ? "flex-col p-5" : "items-end p-7"}`}>
        <div
          className={`${isMobile ? "w-full max-w-[220px] mx-auto" : "w-44 lg:w-52"} aspect-square rounded-full overflow-hidden mq-art shrink-0`}
          style={{ boxShadow: `0 18px 48px ${heroColors.rgb.r},${heroColors.rgb.g},${heroColors.rgb.b}33`, backgroundColor: "var(--mq-surface-2)" }}
        >
          {data.artist?.image ? (
            <img src={data.artist.image} alt={data.artist.name} className="w-full h-full object-cover" draggable={false} />
          ) : (
            <span className="w-full h-full grid place-items-center"><Users className="w-10 h-10" style={{ color: "var(--mq-text-muted)" }} /></span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <ProviderBadge provider="spotify" title="Каталог: Spotify" />
            <BadgeCheck className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />
            <span className="mq-t-meta-2" style={{ color: "var(--mq-text-muted)" }}>Исполнитель</span>
          </div>
          <h1
            className="font-bold tracking-tight"
            style={{
              fontSize: isMobile ? "clamp(28px, 8vw, 40px)" : "clamp(36px, 4.5vw, 56px)",
              lineHeight: 1.05,
              color: "var(--mq-text)",
              overflowWrap: "anywhere",
            }}
          >
            {data.artist?.name || artistName}
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--mq-text-muted)" }}>
            {fmtFollowers(data.artist?.followers)}
            {data.artist?.genres?.length ? ` · ${data.artist.genres.slice(0, 3).join(", ")}` : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2.5 mt-4">
            <button
              onClick={playPopular}
              disabled={state !== "ok" || topTrackQueue.length === 0}
              className="mq-platinum-btn inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-transform active:scale-[0.97] disabled:opacity-40"
              aria-label={heroPlaying && isPlaying ? "Пауза" : "Слушать"}
              data-mq-artist-play
            >
              {heroPlaying && isPlaying ? <Pause className="w-4 h-4" fill="currentColor" /> : <Play className="w-4 h-4" fill="currentColor" />}
              {heroPlaying && isPlaying ? "Пауза" : "Слушать"}
            </button>
            <button
              onClick={shufflePopular}
              disabled={state !== "ok" || topTrackQueue.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-transform active:scale-[0.97] disabled:opacity-40"
              style={{ background: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)", color: "var(--mq-text)" }}
              aria-label="Перемешать"
            >
              <Shuffle className="w-4 h-4" />
            </button>
            <button
              onClick={toggleFollow}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-transform active:scale-[0.97]"
              style={{
                background: isFav ? "color-mix(in srgb, var(--mq-accent) 14%, transparent)" : "var(--mq-surface-1)",
                border: `1px solid ${isFav ? "var(--mq-accent)" : "var(--mq-edge)"}`,
                color: isFav ? "var(--mq-accent)" : "var(--mq-text)",
              }}
              aria-label={isFav ? "Убрать из избранного" : "В избранное"}
              data-mq-artist-follow
            >
              <Heart className="w-4 h-4" fill={isFav ? "currentColor" : "none"} />
              {isFav ? "В избранном" : "В избранное"}
            </button>
            {heroPlaying && (
              <button
                onClick={() => openSourceSwitcher()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-transform active:scale-[0.97]"
                style={{ background: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)", color: "var(--mq-text)" }}
                aria-label="Сменить источник"
                title="Сменить источник воспроизведения"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const sectionHead = (title: string, count: number) => (
    <div className="flex items-baseline justify-between mb-2.5 px-1">
      <h3 className="mq-t-shelf">{title}</h3>
      <span className="mq-t-meta-2 mq-t-num" style={{ color: "var(--mq-text-muted)" }}>{count}</span>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-5 pb-10" data-mq-spotify-artist={spotifyArtistId}>
      {/* Back */}
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
          <div className={`flex ${isMobile ? "flex-col" : "items-end"} gap-5 animate-pulse`}>
            <div className="rounded-full bg-[var(--mq-surface-1)] w-44 aspect-square" />
            <div className="flex-1 space-y-3 py-3">
              <div className="h-4 w-24 rounded bg-[var(--mq-surface-1)]" />
              <div className="h-10 w-2/3 rounded bg-[var(--mq-surface-1)]" />
              <div className="h-3 w-40 rounded bg-[var(--mq-surface-1)]" />
              <div className="h-10 w-56 rounded-full bg-[var(--mq-surface-1)]" />
            </div>
          </div>
          <div className="space-y-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-[var(--mq-r-card)]" style={{ background: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)" }}>
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
          <Music2 className="w-7 h-7" style={{ color: "var(--mq-text-muted)" }} />
          <p className="mq-empty-title">Каталог Spotify недоступен</p>
          <p className="mq-empty-hint">
            Не удалось загрузить страницу исполнителя. Проверьте подключение или
            попробуйте позже — поиск SoundCloud по-прежнему работает.
          </p>
        </div>
      )}

      {state === "ok" && (
        <div className="space-y-8">
          {hero}

          {/* Popular tracks */}
          {topTrackQueue.length > 0 && (
            <section>
              {sectionHead("Популярные треки", topTrackQueue.length)}
              <div className="space-y-0.5">
                {topTrackQueue.slice(0, 10).map((t, i) => (
                  <CatalogTrackRow
                    key={t.id}
                    track={t}
                    index={i}
                    queue={topTrackQueue}
                    animationsEnabled={animationsEnabled}
                  />
                ))}
              </div>
              {catalogResolving && (
                <p className="flex items-center gap-2 mt-2 px-1 text-xs" style={{ color: "var(--mq-text-muted)" }}>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Подбираем источник воспроизведения…
                </p>
              )}
            </section>
          )}

          {/* Albums */}
          {data.albums.length > 0 && (
            <section>
              {sectionHead("Альбомы", data.albums.length)}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {data.albums.map((al, i) => (
                  <ReleaseTile key={al.spotifyId} album={al} index={i} animationsEnabled={animationsEnabled} onOpen={openSpotifyAlbum} />
                ))}
              </div>
            </section>
          )}

          {/* Singles + EPs */}
          {(data.singles.length > 0 || data.eps.length > 0) && (
            <section>
              {sectionHead("Синглы и EP", data.singles.length + data.eps.length)}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[...data.eps, ...data.singles].map((al, i) => (
                  <ReleaseTile key={al.spotifyId} album={al} index={i} animationsEnabled={animationsEnabled} onOpen={openSpotifyAlbum} />
                ))}
              </div>
            </section>
          )}

          {/* Appears on */}
          {data.appearsOn.length > 0 && (
            <section>
              {sectionHead("Участвует", data.appearsOn.length)}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {data.appearsOn.map((al, i) => (
                  <ReleaseTile key={al.spotifyId} album={al} index={i} animationsEnabled={animationsEnabled} onOpen={openSpotifyAlbum} />
                ))}
              </div>
            </section>
          )}

          {/* Related artists */}
          {data.related.length > 0 && (
            <section>
              {sectionHead("Похожие исполнители", data.related.length)}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {data.related.map((ra, i) => (
                  <motion.button
                    key={ra.spotifyId}
                    initial={animationsEnabled ? { opacity: 0, y: 8 } : undefined}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.12) }}
                    onClick={() => setSelectedArtist({ name: ra.name, avatar: ra.image, spotifyArtistId: ra.spotifyId })}
                    className="text-left group"
                    data-mq-related-artist={ra.spotifyId}
                  >
                    <span className="block aspect-square rounded-full overflow-hidden mb-2 mq-art" style={{ backgroundColor: "var(--mq-surface-2)" }}>
                      {ra.image ? (
                        <img src={ra.image} alt="" className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.04]" loading="lazy" draggable={false} />
                      ) : (
                        <span className="w-full h-full grid place-items-center"><Users className="w-6 h-6" style={{ color: "var(--mq-text-muted)" }} /></span>
                      )}
                    </span>
                    <span className="block text-sm font-semibold truncate" style={{ color: "var(--mq-text)" }}>{ra.name}</span>
                    <span className="block mq-t-meta-2 truncate" style={{ color: "var(--mq-text-muted)" }}>{fmtFollowers(ra.followers)}</span>
                  </motion.button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export const SpotifyArtistView = memo(SpotifyArtistViewBase);
export default SpotifyArtistView;
