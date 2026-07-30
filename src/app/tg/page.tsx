"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getTelegramWebApp,
  getTelegramInitData,
  applyTelegramTheme,
  haptic,
  isTelegramWebApp,
  type TelegramWebAppUser,
} from "@/lib/tg-webapp/types";
import { haptic as hapticFeedback } from "@/lib/tg-webapp/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Track {
  id: string;
  title: string;
  artist: string;
  duration?: number;
  cover?: string;
  scTrackId?: number | null;
  source?: string;
  audioUrl?: string;
}

interface PlaylistSummary {
  id: string;
  name: string;
  trackCount: number;
}

interface AuthState {
  status: "loading" | "authed" | "new_user" | "error";
  user?: { userId: string; username: string; avatar?: string | null };
  telegramUser?: TelegramWebAppUser;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 20;

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function TgWebAppPage() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [tab, setTab] = useState<"search" | "playlists" | "likes" | "recs">("recs");
  const [bottomPlayer, setBottomPlayer] = useState<{
    track: Track | null;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
  }>({ track: null, isPlaying: false, currentTime: 0, duration: 0 });

  // Apply Telegram theme on mount
  useEffect(() => {
    applyTelegramTheme();
  }, []);

  // Authenticate via initData OR existing session cookie.
  //
  // Strategy (in order):
  //   1. Check /api/auth/me — if session cookie is valid (user already logged
  //      in via website or previous Telegram auth), use it immediately.
  //      This handles the case where Telegram's initData is empty (e.g. user
  //      opened /tg via URL, or Telegram desktop didn't inject it).
  //   2. If no existing session, poll for window.Telegram.WebApp.initData
  //      for up to 5 seconds (SDK may load late on slow connections).
  //   3. If initData found → call /api/telegram/webapp-auth to validate it
  //      and create/link a session.
  //   4. If neither works → show error with option to open regular site.
  useEffect(() => {
    let cancelled = false;

    const finishAuth = (data: any) => {
      if (cancelled) return;
      if (data.userId || data.ok) {
        setAuth({
          status: "authed",
          user: {
            userId: data.userId,
            username: data.username,
            avatar: data.avatar,
          },
        });
      } else if (data.isNewUser && data.telegramUser) {
        setAuth({
          status: "new_user",
          telegramUser: data.telegramUser,
        });
      } else {
        setAuth({ status: "error", error: data.error || "Auth failed" });
      }
    };

    const tryInitDataAuth = async (initData: string) => {
      try {
        const res = await fetch("/api/telegram/webapp-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
        });
        const data = await res.json();
        finishAuth(data);
      } catch (err: any) {
        if (!cancelled) {
          setAuth({ status: "error", error: err?.message || "Network error" });
        }
      }
    };

    const giveUp = () => {
      if (cancelled) return;
      const wa = getTelegramWebApp();
      const sdkLoaded = !!wa;
      const msg = sdkLoaded
        ? "Telegram SDK загрузился, но initData пустой. Возможно, страница открыта не через кнопку «🎧 Открыть плеер». Закройте это окно и нажмите кнопку в боте."
        : "Не удалось загрузить Telegram SDK. Если вы открыли эту страницу в браузере — она работает только внутри Telegram. Откройте бота и нажмите «🎧 Открыть плеер».";
      setAuth({ status: "error", error: msg });
    };

    (async () => {
      // ── Step 1: try existing session cookie ──────────────────────────
      try {
        const meRes = await fetch("/api/auth/me");
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData.userId) {
            finishAuth(meData);
            return;
          }
        }
      } catch {}

      if (cancelled) return;

      // ── Step 2: poll for Telegram initData ───────────────────────────
      const MAX_ATTEMPTS = 50; // 50 × 100ms = 5s
      let attempts = 0;

      // Try immediately
      const immediate = getTelegramInitData();
      if (immediate) {
        tryInitDataAuth(immediate);
        return;
      }

      // Poll every 100ms
      const interval = setInterval(() => {
        attempts++;
        if (cancelled) {
          clearInterval(interval);
          return;
        }
        const initData = getTelegramInitData();
        if (initData) {
          clearInterval(interval);
          tryInitDataAuth(initData);
          return;
        }
        if (attempts >= MAX_ATTEMPTS) {
          clearInterval(interval);
          giveUp();
        }
      }, 100);
    })();

    return () => { cancelled = true; };
  }, []);

  // ── Loading ────────────────────────────────────────────────────────
  if (auth.status === "loading") {
    return (
      <div className="tg-loading">
        <div className="tg-spinner" />
        <p>Авторизация...</p>
      </div>
    );
  }

  // ── Error / standalone ─────────────────────────────────────────────
  if (auth.status === "error") {
    return (
      <div className="tg-error">
        <div className="tg-error-icon">⚠️</div>
        <p>{auth.error}</p>
        <a href="/" className="tg-link">Открыть обычную версию</a>
      </div>
    );
  }

  // ── New user → registration ────────────────────────────────────────
  if (auth.status === "new_user") {
    return <RegistrationView telegramUser={auth.telegramUser!} onAuthed={(u) => setAuth({ status: "authed", user: u })} />;
  }

  // ── Authed → main app ──────────────────────────────────────────────
  const playTrack = (t: Track) => {
    setBottomPlayer({ track: t, isPlaying: true, currentTime: 0, duration: t.duration || 0 });
  };

  return (
    <div className="tg-app">
      <header className="tg-header">
        <div className="tg-header-title">mq</div>
        <div className="tg-header-user">{auth.user?.username}</div>
      </header>

      <main className="tg-main">
        {tab === "search" && <SearchView onPlay={playTrack} />}
        {tab === "playlists" && <PlaylistsView onPlay={playTrack} />}
        {tab === "likes" && <LikesView onPlay={playTrack} />}
        {tab === "recs" && <RecsView onPlay={playTrack} />}
      </main>

      {bottomPlayer.track && (
        <BottomPlayer
          track={bottomPlayer.track}
          isPlaying={bottomPlayer.isPlaying}
          currentTime={bottomPlayer.currentTime}
          duration={bottomPlayer.duration}
          onTogglePlay={() => {
            setBottomPlayer((s) => ({ ...s, isPlaying: !s.isPlaying }));
            haptic("light");
          }}
        />
      )}

      <nav className="tg-nav">
        <button
          className={`tg-nav-btn ${tab === "recs" ? "active" : ""}`}
          onClick={() => { setTab("recs"); haptic("select"); }}
        >
          ✨<span>Реки</span>
        </button>
        <button
          className={`tg-nav-btn ${tab === "search" ? "active" : ""}`}
          onClick={() => { setTab("search"); haptic("select"); }}
        >
          🔍<span>Поиск</span>
        </button>
        <button
          className={`tg-nav-btn ${tab === "likes" ? "active" : ""}`}
          onClick={() => { setTab("likes"); haptic("select"); }}
        >
          ❤️<span>Лайки</span>
        </button>
        <button
          className={`tg-nav-btn ${tab === "playlists" ? "active" : ""}`}
          onClick={() => { setTab("playlists"); haptic("select"); }}
        >
          📂<span>Плейлисты</span>
        </button>
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Registration view                                                  */
/* ------------------------------------------------------------------ */

function RegistrationView({
  telegramUser,
  onAuthed,
}: {
  telegramUser: TelegramWebAppUser;
  onAuthed: (u: { userId: string; username: string; avatar?: string | null }) => void;
}) {
  const [username, setUsername] = useState(telegramUser.username || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (!username.trim()) {
      setError("Введите имя");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const initData = getTelegramInitData();
      const res = await fetch("/api/telegram/webapp-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData, username: username.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        onAuthed({ userId: data.userId, username: data.username, avatar: data.avatar });
      } else {
        setError(data.error || "Ошибка");
      }
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }, [username, onAuthed]);

  return (
    <div className="tg-register">
      <div className="tg-register-avatar">
        {telegramUser.photo_url ? (
          <img src={telegramUser.photo_url} alt="" />
        ) : (
          <div className="tg-register-avatar-placeholder">
            {(telegramUser.first_name || "?")[0]}
          </div>
        )}
      </div>
      <h1>Привет, {telegramUser.first_name || telegramUser.username || "друг"}!</h1>
      <p>Придумайте имя для аккаунта mq</p>
      <input
        type="text"
        className="tg-input"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="username"
        maxLength={20}
        autoFocus
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
      />
      {error && <div className="tg-error-msg">{error}</div>}
      <button
        className="tg-btn-primary"
        onClick={submit}
        disabled={loading || !username.trim()}
      >
        {loading ? "Создаём..." : "Создать аккаунт"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Search view                                                        */
/* ------------------------------------------------------------------ */

function SearchView({ onPlay }: { onPlay: (t: Track) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/music/search?q=${encodeURIComponent(query)}&source=soundcloud`);
      const data = await res.json();
      setResults(Array.isArray(data.tracks) ? data.tracks : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  return (
    <div className="tg-view">
      <div className="tg-search-box">
        <input
          type="text"
          className="tg-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Трек или исполнитель"
          onKeyDown={(e) => { if (e.key === "Enter") search(); }}
        />
        <button
          className="tg-btn-icon"
          onClick={search}
          disabled={loading || !query.trim()}
        >
          {loading ? "..." : "🔍"}
        </button>
      </div>

      {loading && <div className="tg-list-skeleton" />}

      {!loading && searched && results.length === 0 && (
        <div className="tg-empty">Ничего не найдено</div>
      )}

      <div className="tg-track-list">
        {results.map((track, idx) => (
          <TrackRow
            key={track.id || `${track.scTrackId}_${idx}`}
            track={track}
            onPlay={() => {
              onPlay(track);
              haptic("medium");
            }}
            onLike={() => likeTrack(track)}
            onAdd={() => addTrackToPlaylist(track)}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Recommendations view                                               */
/* ------------------------------------------------------------------ */

function RecsView({ onPlay }: { onPlay: (t: Track) => void }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/music/recommendations");
      const data = await res.json();
      const flat: Track[] = Array.isArray(data.tracks) ? data.tracks : [];
      // Prefer "Для вас" category if present
      const cats = Array.isArray(data.categories) ? data.categories : [];
      const forYou = cats.find((c: any) => c.id === "for_you");
      setTracks(forYou?.tracks?.length ? forYou.tracks : flat);
    } catch {
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="tg-view">
      <div className="tg-view-header">
        <h2>✨ Для вас</h2>
        <button className="tg-btn-icon" onClick={load} disabled={loading}>
          {loading ? "..." : "🔄"}
        </button>
      </div>

      {loading && <div className="tg-list-skeleton" />}

      {!loading && tracks.length === 0 && (
        <div className="tg-empty">
          Пока нечего рекомендовать.
          <br />Лайкните пару треков или послушайте — и рекомендации появятся.
        </div>
      )}

      <div className="tg-track-list">
        {tracks.map((track, idx) => (
          <TrackRow
            key={track.id || `${track.scTrackId}_${idx}`}
            track={track}
            onPlay={() => {
              onPlay(track);
              haptic("medium");
            }}
            onLike={() => likeTrack(track)}
            onAdd={() => addTrackToPlaylist(track)}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Playlists view                                                     */
/* ------------------------------------------------------------------ */

function PlaylistsView({ onPlay }: { onPlay: (t: Track) => void }) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sync");
      const data = await res.json();
      // Playlists may be in UserSync data OR fetched separately
      // For Mini App we use the dedicated /api/playlists endpoint
      const plRes = await fetch("/api/playlists");
      const plData = await plRes.json();
      const pls: PlaylistSummary[] = Array.isArray(plData.playlists)
        ? plData.playlists.map((p: any) => ({
            id: p.id,
            name: p.name,
            trackCount: p.tracks?.length || 0,
          }))
        : [];
      setPlaylists(pls);
    } catch {
      setPlaylists([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openPlaylist = useCallback(async (id: string) => {
    setLoading(true);
    setSelectedId(id);
    try {
      const res = await fetch(`/api/playlists/${id}`);
      const data = await res.json();
      setSelectedTracks(Array.isArray(data.tracks) ? data.tracks : []);
    } catch {
      setSelectedTracks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  if (selectedId) {
    const pl = playlists.find((p) => p.id === selectedId);
    return (
      <div className="tg-view">
        <div className="tg-view-header">
          <button className="tg-btn-icon" onClick={() => setSelectedId(null)}>←</button>
          <h2>{pl?.name || "Плейлист"}</h2>
        </div>
        {loading && <div className="tg-list-skeleton" />}
        {!loading && selectedTracks.length === 0 && (
          <div className="tg-empty">В плейлисте нет треков</div>
        )}
        <div className="tg-track-list">
          {selectedTracks.map((track, idx) => (
            <TrackRow
              key={track.id || idx}
              track={track}
              onPlay={() => {
                onPlay(track);
                haptic("medium");
              }}
              onLike={() => likeTrack(track)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="tg-view">
      <div className="tg-view-header">
        <h2>📂 Плейлисты</h2>
      </div>
      {loading && <div className="tg-list-skeleton" />}
      {!loading && playlists.length === 0 && (
        <div className="tg-empty">У вас пока нет плейлистов</div>
      )}
      <div className="tg-playlist-list">
        {playlists.map((pl) => (
          <button key={pl.id} className="tg-playlist-row" onClick={() => openPlaylist(pl.id)}>
            <div className="tg-playlist-icon">📂</div>
            <div className="tg-playlist-info">
              <div className="tg-playlist-name">{pl.name}</div>
              <div className="tg-playlist-meta">{pl.trackCount} треков</div>
            </div>
            <div className="tg-chevron">›</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Likes view                                                         */
/* ------------------------------------------------------------------ */

function LikesView({ onPlay }: { onPlay: (t: Track) => void }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sync");
      const data = await res.json();
      const liked = data.data?.likedTracksData || [];
      setTracks(Array.isArray(liked) ? liked : []);
    } catch {
      setTracks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="tg-view">
      <div className="tg-view-header">
        <h2>❤️ Лайки</h2>
        <button className="tg-btn-icon" onClick={load} disabled={loading}>
          {loading ? "..." : "🔄"}
        </button>
      </div>
      {loading && <div className="tg-list-skeleton" />}
      {!loading && tracks.length === 0 && (
        <div className="tg-empty">
          Пока нет лайкнутых треков.
          <br />Нажимайте 🤍 в поиске или рекомендациях.
        </div>
      )}
      <div className="tg-track-list">
        {tracks.map((track, idx) => (
          <TrackRow
            key={track.id || idx}
            track={track}
            onPlay={() => {
              onPlay(track);
              haptic("medium");
            }}
            onLike={() => unlikeTrack(track.id)}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Track row                                                          */
/* ------------------------------------------------------------------ */

function TrackRow({
  track,
  onPlay,
  onLike,
  onAdd,
}: {
  track: Track;
  onPlay: () => void;
  onLike: () => void;
  onAdd?: () => void;
}) {
  return (
    <div className="tg-track-row">
      <button className="tg-track-cover" onClick={onPlay}>
        {track.cover ? (
          <img src={track.cover} alt="" loading="lazy" />
        ) : (
          <div className="tg-track-cover-placeholder">▶</div>
        )}
      </button>
      <div className="tg-track-info" onClick={onPlay}>
        <div className="tg-track-title">{track.title}</div>
        <div className="tg-track-artist">{track.artist}</div>
      </div>
      <button className="tg-track-action" onClick={onLike} title="Лайк">
        🤍
      </button>
      {onAdd && (
        <button className="tg-track-action" onClick={onAdd} title="В плейлист">
          +
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bottom player (compact)                                            */
/* ------------------------------------------------------------------ */

function BottomPlayer({
  track,
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
}: {
  track: Track;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
}) {
  // Resolve audio URL — try audioUrl, then SC stream for SC tracks
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  // For SoundCloud tracks, resolve stream URL on mount
  const [audioUrl, setAudioUrl] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (track.audioUrl) {
        if (!cancelled) setAudioUrl(track.audioUrl);
        return;
      }
      if (track.scTrackId) {
        try {
          const res = await fetch(`/api/music/soundcloud/stream?id=${track.scTrackId}`);
          const data = await res.json();
          if (!cancelled && data.url) setAudioUrl(data.url);
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [track]);

  return (
    <div className="tg-player">
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          // Update parent via callback passed through
          // (simplified — full state lift would be more correct)
        }}
      />
      <div className="tg-player-info">
        <div className="tg-player-title">{track.title}</div>
        <div className="tg-player-artist">{track.artist}</div>
      </div>
      <button className="tg-player-play" onClick={onTogglePlay}>
        {isPlaying ? "⏸" : "▶"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers — like / unlike / add to playlist                          */
/* ------------------------------------------------------------------ */

async function likeTrack(track: Track): Promise<void> {
  haptic("success");
  try {
    const trackId = String(track.id || (track.scTrackId ? `sc_${track.scTrackId}` : ""));
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: { likedTrackIds_add: [trackId] },
      }),
    });
    // Note: full like implementation would also update likedTracksData
    // For simplicity in Mini App, we use a simpler sync approach
  } catch {}
}

async function unlikeTrack(trackId: string): Promise<void> {
  haptic("warning");
  try {
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: { likedTrackIds_remove: [trackId] },
      }),
    });
  } catch {}
}

async function addTrackToPlaylist(track: Track): Promise<void> {
  haptic("medium");
  // Use Telegram WebApp's showPopup for a native-feeling dialog
  const wa = getTelegramWebApp();
  if (wa?.showPopup) {
    wa.showPopup({
      title: "Добавить в плейлист",
      message: `Трек: ${track.title} — ${track.artist}\n\nЧтобы выбрать плейлист, используйте команду /playlists в боте или откройте полный плеер.`,
      buttons: [{ type: "ok" }],
    });
  } else {
    alert(`Добавить "${track.title}" — используйте /playlists в боте`);
  }
}
