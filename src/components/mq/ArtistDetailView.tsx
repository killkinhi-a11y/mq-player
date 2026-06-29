"use client";

import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft, Play, Pause, Shuffle, Heart, Share2,
  Music, Users, Disc3, Clock, Loader2,
} from "lucide-react";
import { useAppStore, type FavoriteArtist } from "@/store/useAppStore";
import { type Track, formatDuration } from "@/lib/musicApi";
import { useToast } from "@/hooks/use-toast";

export interface ArtistInfo {
  name: string;
  avatar?: string;
  followers?: number;
  genre?: string;
  trackCount?: number;
}

interface Props {
  artist: ArtistInfo;
  onBack: () => void;
  compactMode: boolean;
  animationsEnabled: boolean;
}

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
  const { toast } = useToast();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [info, setInfo] = useState<ArtistInfo>(artist);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const isFav = favoriteArtists.some(a => a.username === artist.name);

  // ── Fetch ──
  useEffect(() => {
    if (!artist.name) return;
    let cancelled = false;
    setLoading(true);
    setTracks([]);
    setShowAll(false);

    (async () => {
      try {
        // 1) Try artist-tracks API
        const res = await fetch(`/api/music/artist-tracks?q=${encodeURIComponent(artist.name)}&limit=50`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.tracks?.length > 0) {
            setTracks(data.tracks.map((t: any) => normalizeTrack(t, artist.name)));
            if (data.artist) {
              setInfo(prev => ({
                ...prev,
                avatar: data.artist.avatar || prev.avatar,
                followers: data.artist.followers ?? prev.followers,
                genre: data.artist.genre || prev.genre,
                trackCount: data.artist.trackCount ?? data.tracks.length,
              }));
            }
            setLoading(false);
            return;
          }
        }

        // 2) Fallback: search
        const sRes = await fetch(`/api/music/search?q=${encodeURIComponent(artist.name)}&limit=30`);
        if (sRes.ok && !cancelled) {
          const sData = await sRes.json();
          const aName = artist.name.toLowerCase();
          const filtered = (sData.tracks || [])
            .filter((t: any) => {
              const tA = (t.artist || "").toLowerCase();
              return tA === aName || tA.includes(aName) || aName.includes(tA);
            })
            .map((t: any) => normalizeTrack(t, artist.name));
          setTracks(filtered);
        }
      } catch {
        if (!cancelled) setTracks([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [artist.name]);

  // ── Actions ──
  const handlePlayAll = useCallback(() => {
    if (tracks.length > 0) playTrack(tracks[0], tracks);
  }, [tracks, playTrack]);

  const handleShuffle = useCallback(() => {
    if (tracks.length === 0) return;
    const s = [...tracks];
    for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; }
    const st = useAppStore.getState();
    if (!st.shuffle) st.toggleShuffle();
    playTrack(s[0], s);
  }, [tracks, playTrack]);

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
    else if (navigator.clipboard) { navigator.clipboard.writeText(url).then(() => toast({ title: "Скопировано" })); }
  }, [artist.name, toast]);

  const displayed = showAll ? tracks : tracks.slice(0, 5);

  return (
    <div className={`${compactMode ? "p-3 lg:p-4" : "p-4 lg:p-6"} max-w-[var(--mq-container-narrow)] mx-auto pb-32 lg:pb-28`}>
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm mb-4" style={{ color: "var(--mq-text-muted)" }}>
        <ChevronLeft className="w-4 h-4" /> Назад
      </button>

      {/* ════ HERO ════ */}
      <motion.div
        initial={animationsEnabled ? { opacity: 0, y: 12 } : undefined}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative rounded-3xl overflow-hidden mb-6"
        style={{
          background: info.avatar
            ? `linear-gradient(180deg, transparent 0%, var(--mq-bg) 100%), url(${info.avatar}) center/cover`
            : gradientFor(artist.name),
          boxShadow: "var(--mq-shadow-premium-lg)",
          minHeight: 240,
        }}
      >
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.8) 100%)" }} />

        <div className="relative p-5 sm:p-7 flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-6 text-center sm:text-left" style={{ minHeight: 240 }}>
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="absolute -inset-1.5 rounded-full opacity-40" style={{ background: "linear-gradient(135deg, var(--mq-accent), transparent)" }} />
            {info.avatar ? (
              <img src={info.avatar} alt={artist.name} className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover relative z-10" style={{ border: "2px solid rgba(255,255,255,0.1)" }} />
            ) : (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center relative z-10 font-bold"
                style={{ background: "linear-gradient(135deg, var(--mq-accent), color-mix(in srgb, var(--mq-accent) 50%, #000))", color: "#fff", fontSize: 36, border: "2px solid rgba(255,255,255,0.1)" }}>
                {artist.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Info + actions */}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Артист</p>
            <h1 className="font-extrabold text-white mb-1.5 break-words" style={{ fontSize: "clamp(1.25rem, 5vw, 1.75rem)", letterSpacing: "-0.03em", lineHeight: 1.1 }}>{artist.name}</h1>
            <div className="flex items-center gap-3 text-[11px] flex-wrap justify-center sm:justify-start mb-3" style={{ color: "rgba(255,255,255,0.5)" }}>
              {info.genre && <span className="flex items-center gap-1"><Disc3 className="w-3 h-3" />{info.genre}</span>}
              <span className="flex items-center gap-1"><Music className="w-3 h-3" />{tracks.length} треков</span>
              {info.followers ? <span className="flex items-center gap-1"><Users className="w-3 h-3" />{fmtNum(info.followers)}</span> : null}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <button onClick={handlePlayAll} disabled={tracks.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-opacity"
                style={{ background: "var(--mq-accent)", color: "#fff", opacity: tracks.length ? 1 : 0.4, boxShadow: "0 2px 12px color-mix(in srgb, var(--mq-accent) 30%, transparent)" }}>
                <Play className="w-3.5 h-3.5" fill="currentColor" /> Слушать
              </button>
              <button onClick={handleShuffle} disabled={tracks.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-opacity"
                style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.12)", opacity: tracks.length ? 1 : 0.4 }}>
                <Shuffle className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleFav}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: isFav ? "color-mix(in srgb, var(--mq-accent) 20%, transparent)" : "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <Heart className="w-3.5 h-3.5" style={{ color: isFav ? "var(--mq-accent)" : "#fff" }} fill={isFav ? "currentColor" : "none"} />
              </button>
              <button onClick={handleShare} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <Share2 className="w-3.5 h-3.5" style={{ color: "#fff" }} />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ════ TRACKS ════ */}
      {loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ backgroundColor: "var(--mq-card)" }}>
              <div className="w-10 h-10 rounded-lg mq-shimmer" />
              <div className="flex-1 space-y-1.5"><div className="h-3 w-2/3 rounded mq-shimmer" /><div className="h-2 w-1/3 rounded mq-shimmer" /></div>
            </div>
          ))}
        </div>
      ) : tracks.length === 0 ? (
        <div className="text-center py-10 rounded-2xl" style={{ backgroundColor: "var(--mq-card)" }}>
          <Music className="w-10 h-10 mx-auto mb-2" style={{ color: "var(--mq-text-muted)", opacity: 0.3 }} />
          <p className="text-sm font-medium mb-1" style={{ color: "var(--mq-text)" }}>Треки не найдены</p>
          <p className="text-xs mb-3" style={{ color: "var(--mq-text-muted)" }}>Попробуйте поискать вручную</p>
          <button onClick={() => setView("search")} className="px-4 py-2 rounded-xl text-xs font-semibold" style={{ background: "var(--mq-accent)", color: "#fff" }}>Поиск</button>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold" style={{ color: "var(--mq-text)" }}>{showAll ? "Все треки" : "Популярное"}</h2>
            <span className="text-[11px]" style={{ color: "var(--mq-text-muted)" }}>{tracks.length} {plural(tracks.length)}</span>
          </div>

          <div className="space-y-0.5">
            {displayed.map((track, i) => {
              const isCur = currentTrack?.id === track.id;
              const isCurPlaying = isCur && isPlaying;
              const liked = likedTrackIds.includes(track.id);
              return (
                <motion.div key={track.id + "_" + i} initial={animationsEnabled ? { opacity: 0 } : undefined} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}>
                  <div
                    onClick={() => isCur ? togglePlay() : playTrack(track, displayed)}
                    className="group flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors"
                    style={{ backgroundColor: isCur ? "color-mix(in srgb, var(--mq-accent) 8%, transparent)" : "transparent" }}
                  >
                    {/* Index / play */}
                    <div className="w-6 flex-shrink-0 text-center">
                      {isCurPlaying ? <EqIcon /> : <span className="text-[11px] group-hover:hidden" style={{ color: "var(--mq-text-muted)" }}>{i + 1}</span>}
                      {!isCurPlaying && <Play className="w-3 h-3 hidden group-hover:block mx-auto" style={{ color: "var(--mq-text)" }} fill="currentColor" />}
                    </div>
                    {/* Cover */}
                    <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0" style={{ backgroundColor: "var(--mq-card)" }}>
                      {track.cover ? <img src={track.cover} alt="" className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center"><Music className="w-3.5 h-3.5" style={{ color: "var(--mq-text-muted)" }} /></div>}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate" style={{ color: isCur ? "var(--mq-accent)" : "var(--mq-text)" }}>{track.title}</p>
                      <p className="text-[11px] truncate" style={{ color: "var(--mq-text-muted)" }}>{track.album || track.artist}</p>
                    </div>
                    {/* Like */}
                    <button onClick={e => { e.stopPropagation(); toggleLike(track.id, track); }} className="p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ opacity: liked ? 1 : undefined }}>
                      <Heart className="w-3.5 h-3.5" style={{ color: liked ? "var(--mq-accent)" : "var(--mq-text-muted)" }} fill={liked ? "currentColor" : "none"} />
                    </button>
                    {/* Duration */}
                    <span className="text-[10px] font-mono tabular-nums hidden sm:block flex-shrink-0" style={{ color: "var(--mq-text-muted)" }}>{formatDuration(track.duration)}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {!showAll && tracks.length > 5 && (
            <button onClick={() => setShowAll(true)} className="w-full mt-3 py-2.5 rounded-xl text-xs font-medium transition-colors" style={{ background: "var(--mq-card)", color: "var(--mq-accent)" }}>
              Показать все {tracks.length}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ════ Helpers ════

function normalizeTrack(t: any, fallbackArtist: string): Track {
  return {
    id: t.id || (t.scTrackId ? `sc_${t.scTrackId}` : `art_${Date.now()}_${Math.random()}`),
    title: t.title || t.name || "Unknown",
    artist: t.artist || fallbackArtist,
    album: t.album || "",
    cover: t.cover || t.image || "",
    duration: t.duration || 0,
    genre: t.genre || "",
    audioUrl: t.audioUrl || "",
    previewUrl: t.previewUrl || "",
    source: "soundcloud" as const,
    scTrackId: t.scTrackId || null,
    scStreamPolicy: t.scStreamPolicy || "",
    scIsFull: t.scIsFull || false,
  };
}

function gradientFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const hues = ["#2d1b3d", "#1b2d3a", "#3d2b1b", "#1b3a2d", "#3a1b2d", "#2d2d1b"];
  return `linear-gradient(135deg, ${hues[Math.abs(h) % hues.length]}, #0e0e0e)`;
}

function fmtNum(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function plural(n: number): string {
  const m = n % 10, m2 = n % 100;
  if (m === 1 && m2 !== 11) return "трек";
  if (m >= 2 && m <= 4 && (m2 < 10 || m2 >= 20)) return "трека";
  return "треков";
}

function EqIcon() {
  return (
    <div className="w-3 h-3 flex items-end justify-center gap-[1px]">
      {[0, 1, 2].map(i => (
        <motion.span key={i} className="w-[2px] rounded-full" style={{ backgroundColor: "var(--mq-accent)", height: "100%" }}
          animate={{ scaleY: [0.3, 1, 0.3] }} transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.1 }} />
      ))}
    </div>
  );
}

const ArtistDetailView = memo(ArtistDetailViewBase);
export default ArtistDetailView;
