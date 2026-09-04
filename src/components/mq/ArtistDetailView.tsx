"use client";

import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft, Play, Pause, Shuffle, Heart, Share2, Music, Users,
  BadgeCheck, Loader2, Disc3,
} from "lucide-react";
import { useAppStore, type FavoriteArtist } from "@/store/useAppStore";
import { type Track, formatDuration } from "@/lib/musicApi";
import { useToast } from "@/hooks/use-toast";
import { extractColors, type DominantColors } from "@/hooks/useDominantColor";
import { NowPlayingEqualizer } from "./NowPlayingEqualizer";

/* ══════════════════════════════════════════════════════════════════════════
   ARTIST PAGE — premium music-product composition (Phase B redesign).

   Sections: immersive hero (artwork-dominant, color-derived gradient)
   → popular tracks (ranked) → releases grid → similar artists.
   Mobile is a SEPARATE composition (full-bleed art hero, thumb actions,
   snap-scroll rails) — not a shrunken desktop. All data is real
   (artist-tracks + similar APIs); empty states are honest.
   ══════════════════════════════════════════════════════════════════════════ */

export interface ArtistInfo {
  name: string;
  avatar?: string;
  followers?: number;
  genre?: string;
  trackCount?: number;
  verified?: boolean;
}

interface SimilarArtist {
  username: string;
  avatar: string;
  followers: number;
  genre: string;
  trackCount: number;
}

interface Props {
  artist: ArtistInfo;
  onBack: () => void;
  compactMode: boolean;
  animationsEnabled: boolean;
}

const FALLBACK_COLORS: DominantColors = {
  primary: "#8a5cf6", secondary: "#141420", muted: "#20202e",
  vibrant: "#a887ff", dark: "#0a0a12", rgb: { r: 138, g: 92, b: 246 },
};

function ArtistDetailViewBase({ artist, onBack, compactMode, animationsEnabled }: Props) {
  const playTrack = useAppStore(s => s.playTrack);
  const togglePlay = useAppStore(s => s.togglePlay);
  const currentTrack = useAppStore(s => s.currentTrack);
  const isPlaying = useAppStore(s => s.isPlaying);
  const likedTrackIds = useAppStore(s => s.likedTrackIds);
  const toggleLike = useAppStore(s => s.toggleLike);
  const favoriteArtists = useAppStore(s => s.favoriteArtists);
  const addFavoriteArtist = useAppStore(s => s.addFavoriteArtist);
  const removeFavoriteArtist = useAppStore(s => s.removeFavoriteArtist);
  const setView = useAppStore(s => s.setView);
  const setSelectedArtist = useAppStore(s => s.setSelectedArtist);
  const { toast } = useToast();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [info, setInfo] = useState<ArtistInfo>(artist);
  const [loading, setLoading] = useState(true);
  const [similar, setSimilar] = useState<SimilarArtist[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [heroColors, setHeroColors] = useState<DominantColors>(FALLBACK_COLORS);
  const [heroGone, setHeroGone] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef<HTMLDivElement>(null);

  const isFav = favoriteArtists.some(a => a.username === artist.name);

  /* ── Data: artist tracks + similar artists (parallel, abortable) ── */
  useEffect(() => {
    if (!artist.name) return;
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setTracks([]);
    setSimilar([]);
    setShowAll(false);

    (async () => {
      const [tracksRes, similarRes] = await Promise.allSettled([
        fetch(`/api/music/artist-tracks?q=${encodeURIComponent(artist.name)}&limit=200`, { signal: ctrl.signal }),
        fetch(`/api/music/artists?similar=${encodeURIComponent(artist.name)}&limit=12`, { signal: ctrl.signal }),
      ]);

      if (tracksRes.status === "fulfilled" && tracksRes.value.ok && !cancelled) {
        try {
          const data = await tracksRes.value.json();
          if (data.artist) {
            setInfo(prev => ({
              ...prev,
              avatar: data.artist.avatar || prev.avatar,
              followers: data.artist.followers !== undefined ? data.artist.followers : prev.followers,
              genre: data.artist.genre || prev.genre,
              trackCount: data.artist.trackCount !== undefined ? data.artist.trackCount : (data.tracks?.length || prev.trackCount),
              verified: data.artist.verified || prev.verified,
            }));
          }
          if (Array.isArray(data.tracks) && data.tracks.length > 0) {
            setTracks(data.tracks.map((t: Record<string, unknown>, i: number) => normalizeTrack(t, artist.name, i)));
          }
        } catch { /* body parse race with abort — ignore */ }
      }

      if (similarRes.status === "fulfilled" && similarRes.value.ok && !cancelled) {
        try {
          const sd = await similarRes.value.json();
          if (Array.isArray(sd.artists)) {
            setSimilar(
              sd.artists
                .filter((a: SimilarArtist) => a.username && a.username.toLowerCase() !== artist.name.toLowerCase())
                .slice(0, 12)
            );
          }
        } catch { /* ignore */ }
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; ctrl.abort(); };
  }, [artist.name]);

  /* ── Hero gradient from the artwork's dominant colour (real data) ── */
  useEffect(() => {
    let cancelled = false;
    const src = info.avatar;
    if (!src) { setHeroColors(FALLBACK_COLORS); return; }
    extractColors(src).then(c => { if (!cancelled) setHeroColors(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [info.avatar]);

  /* ── Sticky mini-header appears once the hero scrolls out ── */
  useEffect(() => {
    const el = heroRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setHeroGone(!e.isIntersecting), {
      rootMargin: "-56px 0px 0px 0px", threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [loading]);

  /* ── Ranking: real playback_count when present, else API order ── */
  const popular = useMemo(() => {
    const hasPlays = tracks.some(t => (t as Track & { playbackCount?: number }).playbackCount);
    if (!hasPlays) return tracks;
    return [...tracks].sort(
      (a, b) => ((b as Track & { playbackCount?: number }).playbackCount || 0) - ((a as Track & { playbackCount?: number }).playbackCount || 0)
    );
  }, [tracks]);

  /* ── Releases: newest first (real createdAt), tracks as singles ── */
  const releases = useMemo(() => {
    const dated = tracks.filter(t => (t as Track & { createdAt?: string }).createdAt);
    const sorted = dated.length >= 4
      ? [...dated].sort((a, b) => ((b as Track & { createdAt?: string }).createdAt || "").localeCompare((a as Track & { createdAt?: string }).createdAt || ""))
      : tracks.filter(t => t.cover);
    return sorted.slice(0, 12);
  }, [tracks]);

  const heroPlay = useCallback(() => {
    if (popular.length > 0) playTrack(popular[0], popular);
  }, [popular, playTrack]);

  const heroShuffle = useCallback(() => {
    if (popular.length === 0) return;
    const s = [...popular];
    for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; }
    const st = useAppStore.getState();
    if (!st.shuffle) st.toggleShuffle();
    playTrack(s[0], s);
  }, [popular, playTrack]);

  const handleFav = useCallback(() => {
    if (isFav) {
      const f = favoriteArtists.find(a => a.username === artist.name);
      if (f) { removeFavoriteArtist(f.id); toast({ title: "Удалён из избранного" }); }
    } else {
      addFavoriteArtist({ id: Date.now(), username: artist.name, avatar: info.avatar || "", genre: info.genre || "", followers: info.followers || 0, trackCount: tracks.length });
      toast({ title: "Добавлен в избранное" });
    }
  }, [isFav, favoriteArtists, artist.name, info, tracks.length, removeFavoriteArtist, addFavoriteArtist, toast]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/play?artist=${encodeURIComponent(artist.name)}`;
    if (navigator.share) { try { await navigator.share({ title: artist.name, url }); } catch {} }
    else if (navigator.clipboard) { navigator.clipboard.writeText(url).then(() => toast({ title: "Ссылка скопирована" })); }
  }, [artist.name, toast]);

  const openSimilar = useCallback((a: SimilarArtist) => {
    scrollTopRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    setSelectedArtist({ name: a.username, avatar: a.avatar, followers: a.followers, genre: a.genre, trackCount: a.trackCount });
  }, [setSelectedArtist]);

  const displayed = showAll ? popular : popular.slice(0, 5);
  const heroGradient = `linear-gradient(180deg,
    color-mix(in srgb, ${heroColors.primary} 34%, var(--mq-bg)) 0%,
    color-mix(in srgb, ${heroColors.primary} 12%, var(--mq-bg)) 46%,
    var(--mq-bg) 100%)`;

  return (
    <div ref={scrollTopRef} className={`${compactMode ? "p-3 lg:p-4" : "p-4 lg:p-6"} max-w-[var(--mq-container-narrow)] lg:max-w-[var(--mq-container-wide)] mx-auto pb-32 lg:pb-28`}>

      {/* ════ Sticky mini-header (appears after hero; below the floating navbar on desktop) ════ */}
      <div
        className="fixed left-0 right-0 z-40 top-0 lg:top-[72px] transition-all duration-300 border-b"
        style={{
          background: heroGone ? "color-mix(in srgb, var(--mq-bg) 88%, transparent)" : "transparent",
          borderColor: heroGone ? "var(--mq-edge)" : "transparent",
          backdropFilter: heroGone ? "blur(14px)" : "none",
          WebkitBackdropFilter: heroGone ? "blur(14px)" : "none",
          pointerEvents: heroGone ? "auto" : "none",
          opacity: heroGone ? 1 : 0,
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="max-w-[var(--mq-container-narrow)] lg:max-w-[var(--mq-container-wide)] mx-auto flex items-center gap-3 px-4 h-14">
          <button onClick={onBack} aria-label="Назад" className="w-9 h-9 -ml-1.5 rounded-full flex items-center justify-center hover:bg-[var(--mq-surface-1)] transition-colors">
            <ChevronLeft className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
          </button>
          <p className="mq-t-title flex-1 min-w-0 truncate text-[15px]" style={{ color: "var(--mq-text)" }}>{artist.name}</p>
          <button
            onClick={heroPlay}
            disabled={popular.length === 0}
            aria-label="Слушать"
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-opacity"
            style={{ background: "var(--mq-accent)", color: "#fff", opacity: popular.length ? 1 : 0.4 }}
          >
            <Play className="w-4 h-4" fill="currentColor" />
          </button>
        </div>
      </div>

      {/* ════ HERO ════ */}
      <motion.div
        ref={heroRef}
        initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className={`relative overflow-hidden mb-6 lg:mb-8 ${compactMode ? "-mx-3" : "-mx-4"} lg:mx-0 lg:rounded-3xl`}
        style={{ background: heroGradient }}
      >
        {/* depth layer: blurred artwork under the gradient (real image) */}
        {info.avatar && (
          <div aria-hidden className="absolute inset-0 overflow-hidden">
            <img src={info.avatar} alt="" className="w-full h-full object-cover scale-125 blur-3xl opacity-30" />
          </div>
        )}

        {/* ── Mobile hero: artwork-dominant full-bleed ── */}
        <div className="lg:hidden relative">
          <div className="relative w-full" style={{ aspectRatio: "1 / 0.92" }}>
            {info.avatar ? (
              <img src={info.avatar} alt={artist.name} className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center" style={{ background: gradientFor(artist.name) }}>
                <span className="mq-t-display text-white" style={{ fontSize: "min(28vw, 130px)" }}>{artist.name.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.16) 0%, rgba(0,0,0,0.0) 40%, rgba(0,0,0,0.62) 100%)" }} />
            <div className="absolute left-4 right-4 bottom-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] uppercase tracking-[0.14em] font-bold" style={{ color: "rgba(255,255,255,0.75)" }}>Артист</span>
                {info.verified && <BadgeCheck className="w-3.5 h-3.5" style={{ color: "#fff" }} />}
              </div>
              <h1 className="mq-t-title text-white break-words" style={{ fontSize: "clamp(1.9rem, 8.5vw, 2.6rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, textShadow: "0 2px 18px rgba(0,0,0,0.45)" }}>{artist.name}</h1>
            </div>
          </div>
          {/* stats + actions under the art */}
          <div className="px-4 pt-3 pb-4">
            <ArtistStats info={info} tracks={tracks.length} compact />
            <div className="flex items-center gap-2 mt-3.5">
              <button onClick={heroPlay} disabled={popular.length === 0}
                className="flex-1 flex items-center justify-center gap-2 h-12 rounded-full text-[15px] font-bold transition-all active:scale-[0.98]"
                style={{ background: "var(--mq-accent)", color: "#fff", opacity: popular.length ? 1 : 0.4, boxShadow: "0 6px 22px color-mix(in srgb, var(--mq-accent) 32%, transparent)" }}>
                <Play className="w-5 h-5" fill="currentColor" /> Слушать
              </button>
              <button onClick={heroShuffle} disabled={popular.length === 0} aria-label="Перемешать"
                className="w-12 h-12 rounded-full flex items-center justify-center transition-colors active:scale-[0.96]"
                style={{ background: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)", opacity: popular.length ? 1 : 0.4 }}>
                <Shuffle className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
              </button>
              <button onClick={handleFav} aria-label={isFav ? "Удалить из избранного" : "В избранное"}
                className="w-12 h-12 rounded-full flex items-center justify-center transition-colors active:scale-[0.96]"
                style={{ background: isFav ? "color-mix(in srgb, var(--mq-accent) 16%, transparent)" : "var(--mq-surface-1)", border: `1px solid ${isFav ? "color-mix(in srgb, var(--mq-accent) 36%, transparent)" : "var(--mq-edge)"}` }}>
                <Heart className="w-5 h-5" style={{ color: isFav ? "var(--mq-accent)" : "var(--mq-text)" }} fill={isFav ? "currentColor" : "none"} />
              </button>
              <button onClick={handleShare} aria-label="Поделиться"
                className="w-12 h-12 rounded-full flex items-center justify-center transition-colors active:scale-[0.96]"
                style={{ background: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)" }}>
                <Share2 className="w-5 h-5" style={{ color: "var(--mq-text)" }} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Desktop hero: wide editorial composition ── */}
        <div className="hidden lg:flex relative items-end gap-8 px-10 pb-8 pt-24" style={{ minHeight: 380 }}>
          <div className="mq-art shrink-0" style={{ width: 288, height: 288, borderRadius: 22, boxShadow: "0 24px 60px rgba(0,0,0,0.55)" }}>
            {info.avatar ? (
              <img src={info.avatar} alt={artist.name} />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: gradientFor(artist.name) }}>
                <span className="mq-t-display text-white" style={{ fontSize: 104 }}>{artist.name.charAt(0).toUpperCase()}</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 pb-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] uppercase tracking-[0.16em] font-bold" style={{ color: "var(--mq-text-muted)" }}>Артист</span>
              {info.verified && <BadgeCheck className="w-4 h-4" style={{ color: "var(--mq-accent)" }} />}
            </div>
            <h1 className="mq-t-title text-white break-words" style={{ fontSize: "clamp(2.6rem, 5vw, 4.2rem)", fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.02, textShadow: "0 4px 30px rgba(0,0,0,0.4)" }}>{artist.name}</h1>
            <ArtistStats info={info} tracks={tracks.length} />
            <div className="flex items-center gap-2.5 mt-6">
              <button onClick={heroPlay} disabled={popular.length === 0}
                className="flex items-center gap-2 h-12 px-7 rounded-full text-[15px] font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: "var(--mq-accent)", color: "#fff", opacity: popular.length ? 1 : 0.4, boxShadow: "0 8px 28px color-mix(in srgb, var(--mq-accent) 34%, transparent)" }}>
                <Play className="w-5 h-5" fill="currentColor" /> Слушать
              </button>
              <button onClick={heroShuffle} disabled={popular.length === 0} aria-label="Перемешать"
                className="h-12 w-12 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--mq-surface-2)]"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", opacity: popular.length ? 1 : 0.4 }}>
                <Shuffle className="w-5 h-5 text-white" />
              </button>
              <button onClick={handleFav} aria-label={isFav ? "Удалить из избранного" : "В избранное"}
                className="h-12 w-12 rounded-full flex items-center justify-center transition-colors"
                style={{ background: isFav ? "color-mix(in srgb, var(--mq-accent) 22%, transparent)" : "rgba(255,255,255,0.08)", border: `1px solid ${isFav ? "color-mix(in srgb, var(--mq-accent) 40%, transparent)" : "rgba(255,255,255,0.16)"}` }}>
                <Heart className="w-5 h-5" style={{ color: isFav ? "var(--mq-accent)" : "#fff" }} fill={isFav ? "currentColor" : "none"} />
              </button>
              <button onClick={handleShare} aria-label="Поделиться"
                className="h-12 w-12 rounded-full flex items-center justify-center transition-colors hover:bg-[rgba(255,255,255,0.14)]"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)" }}>
                <Share2 className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ════ CONTENT ════ */}
      {loading ? (
        <ArtistSkeleton />
      ) : tracks.length === 0 ? (
        <div className="text-center py-12 rounded-2xl mq-surface">
          <Music className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--mq-text-muted)", opacity: 0.4 }} />
          <p className="mq-t-title text-[15px] mb-1" style={{ color: "var(--mq-text)" }}>Треки не найдены</p>
          <p className="mq-t-meta text-[13px] mb-4">Попробуйте поискать вручную</p>
          <button onClick={() => setView("search")} className="px-5 h-10 rounded-full text-[13px] font-bold" style={{ background: "var(--mq-accent)", color: "#fff" }}>Поиск</button>
        </div>
      ) : (
        <>
          {/* ── POPULAR ── */}
          <section className="mb-8 lg:mb-10">
            <div className="mq-section-head">
              <h2 className="mq-section-title">Популярное</h2>
              {!showAll && popular.length > 5 && (
                <button onClick={() => setShowAll(true)} className="mq-section-action">Показать все {popular.length}</button>
              )}
            </div>
            <div className="space-y-0.5">
              {displayed.map((track, i) => {
                const isCur = currentTrack?.id === track.id;
                const isCurPlaying = isCur && isPlaying;
                const liked = likedTrackIds.includes(track.id);
                const plays = (track as Track & { playbackCount?: number }).playbackCount;
                return (
                  <div
                    key={track.id + "_" + i}
                    onClick={() => isCur ? togglePlay() : playTrack(track, displayed)}
                    className="mq-card-track group"
                    data-active={isCur}
                    role="button"
                    aria-label={`Слушать ${track.title}`}
                  >
                    <div className="w-6 shrink-0 text-center">
                      {isCurPlaying ? <NowPlayingEqualizer size="xs" variant="inline" /> : (
                        <>
                          <span className="mq-t-num text-[12px] group-hover:hidden" style={{ color: "var(--mq-text-muted)" }}>{i + 1}</span>
                          <Play className="w-3.5 h-3.5 hidden group-hover:block mx-auto" style={{ color: "var(--mq-text)" }} fill="currentColor" />
                        </>
                      )}
                    </div>
                    <div className="mq-art shrink-0" style={{ width: 48, height: 48, borderRadius: 8 }}>
                      {track.cover ? <img src={track.cover} alt="" loading="lazy" /> : (
                        <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4" style={{ color: "var(--mq-text-muted)" }} /></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="mq-t-title text-[14px] truncate" style={{ color: isCur ? "var(--mq-accent)" : "var(--mq-text)" }}>{track.title}</p>
                      <p className="mq-t-meta text-[12px] truncate">
                        {plays ? <>{fmtPlays(plays)} прослушиваний</> : (track.album || track.artist)}
                      </p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); toggleLike(track.id, track); }} aria-label="В любимые"
                      className="p-2 rounded-full sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0" style={{ opacity: liked ? 1 : undefined }}>
                      <Heart className="w-4 h-4" style={{ color: liked ? "var(--mq-accent)" : "var(--mq-text-muted)" }} fill={liked ? "currentColor" : "none"} />
                    </button>
                    <span className="mq-t-num text-[12px] hidden sm:block shrink-0" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(track.duration)}</span>
                  </div>
                );
              })}
            </div>
            {showAll && popular.length > 10 && (
              <button onClick={() => setShowAll(false)} className="mq-section-action mt-3 block mx-auto text-[13px]">Свернуть</button>
            )}
          </section>

          {/* ── RELEASES ── */}
          {releases.length >= 4 && (
            <section className="mb-8 lg:mb-10">
              <div className="mq-section-head">
                <h2 className="mq-section-title">Релизы</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
                {releases.map((track, i) => {
                  const isCur = currentTrack?.id === track.id;
                  const created = (track as Track & { createdAt?: string }).createdAt;
                  const year = created ? new Date(created).getFullYear() : null;
                  return (
                    <div key={"rel_" + track.id} onClick={() => isCur ? togglePlay() : playTrack(track, popular)}
                      className="group cursor-pointer" role="button" aria-label={track.title}>
                      <div className="mq-art mb-2.5 relative" style={{ aspectRatio: "1 / 1" }}>
                        {track.cover ? <img src={track.cover} alt={track.title} loading="lazy" /> : (
                          <div className="w-full h-full flex items-center justify-center"><Disc3 className="w-8 h-8" style={{ color: "var(--mq-text-muted)" }} /></div>
                        )}
                        {isCur && isPlaying ? (
                          <div className="mq-play-overlay" data-visible="true" aria-hidden><NowPlayingEqualizer size="xs" variant="inline" /></div>
                        ) : (
                          <div className="mq-play-overlay" aria-hidden><Play className="w-4.5 h-4.5 w-[18px] h-[18px]" fill="currentColor" /></div>
                        )}
                      </div>
                      <p className="mq-t-title text-[13.5px] leading-snug line-clamp-2 mb-0.5" style={{ color: isCur ? "var(--mq-accent)" : "var(--mq-text)" }}>{track.title}</p>
                      <p className="mq-t-meta text-[12px]">{year ? `Сингл · ${year}` : "Сингл"}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── SIMILAR ARTISTS ── */}
          {similar.length > 0 && (
            <section className="mb-4">
              <div className="mq-section-head">
                <h2 className="mq-section-title">Похожие артисты</h2>
              </div>
              {/* mobile: snap rail · desktop: grid */}
              <div className="flex gap-4 overflow-x-auto pb-1 -mx-1 px-1 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-3 xl:grid-cols-6 lg:overflow-visible"
                style={{ scrollbarWidth: "none", scrollSnapType: "x mandatory" }}>
                {similar.map(a => (
                  <button key={"sim_" + a.username} onClick={() => openSimilar(a)}
                    className="shrink-0 lg:shrink w-[104px] lg:w-auto flex flex-col items-center text-center gap-2.5 py-2 rounded-2xl hover:bg-[var(--mq-surface-1)] transition-colors px-1"
                    style={{ scrollSnapAlign: "start" }}
                    aria-label={a.username}>
                    <div className="mq-art" style={{ width: 104, height: 104, borderRadius: 999 }}>
                      {a.avatar ? <img src={a.avatar} alt={a.username} loading="lazy" /> : (
                        <div className="w-full h-full flex items-center justify-center"><Music className="w-8 h-8" style={{ color: "var(--mq-text-muted)" }} /></div>
                      )}
                    </div>
                    <div className="min-w-0 w-full">
                      <p className="mq-t-title text-[13px] truncate" style={{ color: "var(--mq-text)" }}>{a.username}</p>
                      <p className="mq-t-meta text-[11.5px] truncate">{a.followers > 0 ? `${fmtNum(a.followers)} слушателей` : (a.genre || "Артист")}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ════ Stats line (real data only — hides what isn't known) ════ */
function ArtistStats({ info, tracks, compact }: { info: ArtistInfo; tracks: number; compact?: boolean }) {
  const items: string[] = [];
  if (info.followers && info.followers > 0) items.push(`${fmtNum(info.followers)} подписчиков`);
  if (tracks > 0) items.push(`${tracks} ${pluralTracks(tracks)}`);
  if (info.genre) items.push(info.genre);
  if (items.length === 0) return null;
  return (
    <div className={`flex items-center gap-2 flex-wrap ${compact ? "text-[12.5px]" : "text-[13px]"} mq-t-meta`}>
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span style={{ opacity: 0.4 }}>·</span>}
          <span>{it}</span>
        </span>
      ))}
    </div>
  );
}

/* ════ Loading skeleton (same shapes as the content) ════ */
function ArtistSkeleton() {
  return (
    <div aria-busy="true" aria-label="Загрузка артиста">
      <div className="mq-surface mb-8 h-[210px] mq-shimmer" />
      <div className="space-y-1.5 mb-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl">
            <div className="w-5 h-3 rounded mq-shimmer" />
            <div className="w-12 h-12 rounded-lg mq-shimmer" />
            <div className="flex-1 space-y-1.5"><div className="h-3.5 w-2/3 rounded mq-shimmer" /><div className="h-2.5 w-1/3 rounded mq-shimmer" /></div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-square rounded-xl mq-shimmer" />)}
      </div>
    </div>
  );
}

/* ════ Helpers ════ */

function normalizeTrack(t: Record<string, unknown>, fallbackArtist: string, idx: number): Track {
  const rec = t as Record<string, unknown> & {
    playbackCount?: number; createdAt?: string;
  };
  return {
    id: (t.id as string) || (t.scTrackId ? `sc_${t.scTrackId}` : `art_${Date.now()}_${idx}_${Math.random()}`),
    title: (t.title as string) || (t.name as string) || "Unknown",
    artist: (t.artist as string) || fallbackArtist,
    album: (t.album as string) || "",
    cover: (t.cover as string) || (t.image as string) || "",
    duration: (t.duration as number) || 0,
    genre: (t.genre as string) || "",
    audioUrl: (t.audioUrl as string) || "",
    previewUrl: (t.previewUrl as string) || "",
    source: ((t.source as Track["source"]) || "soundcloud"),
    scTrackId: (t.scTrackId as number) || null,
    scStreamPolicy: (t.scStreamPolicy as string) || "",
    scIsFull: (t.scIsFull as boolean) || false,
    playbackCount: rec.playbackCount,
    createdAt: rec.createdAt,
  } as Track;
}

function gradientFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const hues = ["#2d1b3d", "#1b2d3a", "#3d2b1b", "#1b3a2d", "#3a1b2d", "#2d2d1b"];
  return `linear-gradient(135deg, ${hues[Math.abs(h) % hues.length]}, #0e0e0e)`;
}

function fmtNum(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} млн`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(".", ",")} тыс.`;
  return String(n);
}

function fmtPlays(n: number): string {
  return fmtNum(n);
}

function pluralTracks(n: number): string {
  const m = n % 10, m2 = n % 100;
  if (m === 1 && m2 !== 11) return "трек";
  if (m >= 2 && m <= 4 && (m2 < 10 || m2 >= 20)) return "трека";
  return "треков";
}

const ArtistDetailView = memo(ArtistDetailViewBase);
export default ArtistDetailView;
