"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import type { Track } from "@/lib/musicApi";
import {
  getSavedTracks,
  getUserPlaylists,
  getSavedAlbums,
  getFollowedArtists,
  getRecentlyPlayed,
  getTopTracks,
  getTopArtists,
  getPlaylistTracks,
  getAlbumTracks,
} from "@/lib/spotify";
import { useSpotifySession } from "@/hooks/useSpotifySession";
import TrackCard from "./TrackCard";
import { Skeleton } from "./Skeleton";
import {
  Heart,
  ListMusic,
  Disc3,
  User as UserIcon,
  History as HistoryIcon,
  TrendingUp,
  Play,
} from "lucide-react";

/**
 * SpotifyLibraryView — V2 §18: the user's REAL Spotify library.
 *
 * Every list is live Web API data (PKCE token): saved tracks, own playlists,
 * saved albums, followed artists, recently played, top tracks/artists.
 * No fake library, no demo content. Shown only while connected.
 */
type Section =
  | "liked"
  | "playlists"
  | "albums"
  | "artists"
  | "recent"
  | "top";

const SECTIONS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: "liked", label: "Любимые треки", icon: Heart },
  { id: "playlists", label: "Мои плейлисты", icon: ListMusic },
  { id: "albums", label: "Альбомы", icon: Disc3 },
  { id: "artists", label: "Исполнители", icon: UserIcon },
  { id: "recent", label: "Недавно играло", icon: HistoryIcon },
  { id: "top", label: "Топ", icon: TrendingUp },
];

export default function SpotifyLibraryView() {
  const { connect } = useSpotifySession();
  const connected = useAppStore((s) => s.spotifyConnected);
  const premium = useAppStore((s) => s.spotifyPremium);
  const playTrack = useAppStore((s) => s.playTrack);
  const setView = useAppStore((s) => s.setView);
  const [section, setSection] = useState<Section>("liked");

  const [liked, setLiked] = useState<Track[] | null>(null);
  const [playlists, setPlaylists] = useState<Awaited<ReturnType<typeof getUserPlaylists>> | null>(null);
  const [albums, setAlbums] = useState<Awaited<ReturnType<typeof getSavedAlbums>> | null>(null);
  const [artists, setArtists] = useState<Awaited<ReturnType<typeof getFollowedArtists>> | null>(null);
  const [recent, setRecent] = useState<Track[] | null>(null);
  const [topTracks, setTopTracks] = useState<Track[] | null>(null);
  const [topArtists, setTopArtists] = useState<Awaited<ReturnType<typeof getTopArtists>> | null>(null);

  useEffect(() => {
    if (!connected) return;
    if (section === "liked" && liked === null) getSavedTracks(50).then(setLiked);
    if (section === "playlists" && playlists === null) getUserPlaylists(50).then(setPlaylists);
    if (section === "albums" && albums === null) getSavedAlbums(30).then(setAlbums);
    if (section === "artists" && artists === null) getFollowedArtists(30).then(setArtists);
    if (section === "recent" && recent === null) getRecentlyPlayed(50).then(setRecent);
    if (section === "top" && topTracks === null) getTopTracks(30).then(setTopTracks);
    if (section === "top" && topArtists === null) getTopArtists(20).then(setTopArtists);
  }, [connected, section, liked, playlists, albums, artists, recent, topTracks, topArtists]);

  // ── Open a Spotify playlist/album: fetch its tracks, play the first ──
  const openCollection = useCallback(
    async (kind: "playlist" | "album", id: string, name: string) => {
      const tracks =
        kind === "playlist" ? await getPlaylistTracks(id, 100) : await getAlbumTracks(id);
      if (!tracks || tracks.length === 0) return;
      playTrack(tracks[0], tracks, null);
      setView("playlists");
      void name;
    },
    [playTrack, setView],
  );

  const sectionHeader = useMemo(
    () => SECTIONS.find((s) => s.id === section),
    [section],
  );

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
        <svg viewBox="0 0 24 24" className="w-10 h-10" fill="currentColor" aria-hidden style={{ color: "#1db954" }}>
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z" />
        </svg>
        <p className="text-sm font-semibold" style={{ color: "var(--mq-text)" }}>
          Библиотека Spotify
        </p>
        <p className="text-xs max-w-xs leading-relaxed" style={{ color: "var(--mq-text-muted)" }}>
          Подключите аккаунт — любимые треки, плейлисты, альбомы и исполнители
          появятся здесь. {premium ? "" : "Полное воспроизведение — с Premium."}
        </p>
        <button
          onClick={() => { connect().catch(() => {}); }}
          className="px-6 py-2.5 rounded-full text-sm font-bold"
          style={{ backgroundColor: "#1db954", color: "#000" }}
        >
          Подключить Spotify
        </button>
      </div>
    );
  }

  const Icon = sectionHeader?.icon || Heart;

  return (
    <div className="space-y-4" data-mq-spotify-library={section}>
      {/* Sub-section pills */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
        {SECTIONS.map((s) => {
          const SIcon = s.icon;
          const active = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 transition-colors"
              style={{
                backgroundColor: active ? "#1db954" : "var(--mq-surface-2)",
                color: active ? "#000" : "var(--mq-text-muted)",
                border: "1px solid var(--mq-edge)",
              }}
            >
              <SIcon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Section header */}
      <div className="flex items-center gap-2 px-1">
        <Icon className="w-4 h-4" style={{ color: "#1db954" }} aria-hidden />
        <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--mq-text)" }}>
          {sectionHeader?.label} · Spotify
        </h3>
      </div>

      {/* ── Liked / Recent / Top tracks: TrackCard rows ── */}
      {(section === "liked" || section === "recent" || section === "top") && (
        <>
          {(section === "liked" ? liked : section === "recent" ? recent : topTracks) === null && (
            <div className="space-y-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-[var(--mq-r-card)]" style={{ backgroundColor: "var(--mq-surface-1)" }}>
                  <Skeleton className="w-11 h-11 rounded-[var(--mq-r-art)] flex-shrink-0" />
                  <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
                </div>
              ))}
            </div>
          )}
          {(() => {
            const list = section === "liked" ? liked : section === "recent" ? recent : topTracks;
            if (list === null) return null;
            if (list.length === 0) return <EmptyNote text="Пока пусто" />;
            return (
              <div className="space-y-1.5">
                {list.map((t, i) => (
                  <TrackCard key={`${t.id}_${i}`} track={t} index={i} queue={list} />
                ))}
              </div>
            );
          })()}
        </>
      )}

      {/* ── Playlists ── */}
      {section === "playlists" && (
        <>
          {playlists === null && <GridSkeleton />}
          {playlists !== null && playlists.length === 0 && <EmptyNote text="Нет плейлистов" />}
          {playlists !== null && playlists.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {playlists.map((p) => (
                <button
                  key={p.id}
                  onClick={() => openCollection("playlist", p.id, p.name)}
                  className="group text-left rounded-[var(--mq-r-card)] overflow-hidden p-2 transition-colors"
                  style={{ backgroundColor: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)" }}
                >
                  <div className="relative aspect-square rounded-[var(--mq-r-art)] overflow-hidden mb-2" style={{ backgroundColor: "var(--mq-card)" }}>
                    {p.image ? (
                      <img src={p.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ListMusic className="w-6 h-6" style={{ color: "var(--mq-text-muted)" }} />
                      </div>
                    )}
                    <div
                      className="absolute bottom-2 right-2 w-9 h-9 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ backgroundColor: "#1db954", color: "#000" }}
                      aria-hidden
                    >
                      <Play className="w-4 h-4" fill="currentColor" />
                    </div>
                  </div>
                  <p className="text-xs font-semibold truncate" style={{ color: "var(--mq-text)" }}>{p.name}</p>
                  <p className="mq-t-meta-2 truncate" style={{ color: "var(--mq-text-muted)" }}>
                    {p.totalTracks ?? "—"} треков{p.owner ? ` · ${p.owner}` : ""}
                  </p>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Albums ── */}
      {section === "albums" && (
        <>
          {albums === null && <GridSkeleton />}
          {albums !== null && albums.length === 0 && <EmptyNote text="Нет сохранённых альбомов" />}
          {albums !== null && albums.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {albums.map((a) => (
                <button
                  key={a.id}
                  onClick={() => openCollection("album", a.id, a.name)}
                  className="group text-left rounded-[var(--mq-r-card)] overflow-hidden p-2 transition-colors"
                  style={{ backgroundColor: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)" }}
                >
                  <div className="relative aspect-square rounded-[var(--mq-r-art)] overflow-hidden mb-2" style={{ backgroundColor: "var(--mq-card)" }}>
                    {a.image ? (
                      <img src={a.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc3 className="w-6 h-6" style={{ color: "var(--mq-text-muted)" }} />
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-semibold truncate" style={{ color: "var(--mq-text)" }}>{a.name}</p>
                  <p className="mq-t-meta-2 truncate" style={{ color: "var(--mq-text-muted)" }}>
                    {a.artist || "—"}{a.year ? ` · ${a.year}` : ""}
                  </p>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Artists / Top artists ── */}
      {section === "artists" && <ArtistGrid list={artists} loading={artists === null} emptyText="Нет подписок" onOpen={(name, avatar) => {
        // setSelectedArtist routes to the artist view itself (store action).
        useAppStore.getState().setSelectedArtist({ name, avatar });
      }} />}
      {section === "top" && topArtists !== null && (
        <div className="mt-4">
          <div className="flex items-center gap-2 px-1 mb-2">
            <TrendingUp className="w-4 h-4" style={{ color: "#1db954" }} aria-hidden />
            <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--mq-text-muted)" }}>
              Топ исполнителей
            </h4>
          </div>
          <ArtistGrid list={topArtists} loading={false} emptyText="" onOpen={(name, avatar) => {
            useAppStore.getState().setSelectedArtist({ name, avatar });
          }} />
        </div>
      )}
    </div>
  );
}

function ArtistGrid({
  list,
  loading,
  emptyText,
  onOpen,
}: {
  list: { id: string; name: string; image?: string; followers?: number }[] | null;
  loading: boolean;
  emptyText: string;
  onOpen: (name: string, avatar?: string) => void;
}) {
  if (loading) return <GridSkeleton />;
  if (!list || list.length === 0) return emptyText ? <EmptyNote text={emptyText} /> : null;
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
      {list.map((a) => (
        <button
          key={a.id}
          onClick={() => onOpen(a.name, a.image)}
          className="text-left rounded-[var(--mq-r-card)] overflow-hidden p-2 transition-colors"
          style={{ backgroundColor: "var(--mq-surface-1)", border: "1px solid var(--mq-edge)" }}
        >
          <div className="aspect-square rounded-full overflow-hidden mb-2" style={{ backgroundColor: "var(--mq-card)" }}>
            {a.image ? (
              <img src={a.image} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <UserIcon className="w-6 h-6" style={{ color: "var(--mq-text-muted)" }} />
              </div>
            )}
          </div>
          <p className="text-xs font-semibold truncate text-center" style={{ color: "var(--mq-text)" }}>{a.name}</p>
          {a.followers != null && (
            <p className="mq-t-meta-2 truncate text-center" style={{ color: "var(--mq-text-muted)" }}>
              {a.followers.toLocaleString("ru-RU")}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-[var(--mq-r-card)] p-2" style={{ backgroundColor: "var(--mq-surface-1)" }}>
          <Skeleton className="aspect-square w-full rounded-[var(--mq-r-art)] mb-2" />
          <Skeleton className="h-3 w-3/4 mb-1.5" />
          <Skeleton className="h-2.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <p className="text-xs py-6 text-center" style={{ color: "var(--mq-text-muted)" }}>
      {text}
    </p>
  );
}
