"use client";

import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import dynamic from "next/dynamic";
import {
  ensureTelegramSDK,
  getTelegramInitData,
  applyTelegramTheme,
  haptic,
  type TelegramWebAppUser,
} from "@/lib/tg-webapp/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  cover?: string;
  genre?: string;
  scTrackId?: number | null;
  source?: string;
  audioUrl?: string;
  telegramFileId?: string;
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

interface Toast {
  id: number;
  text: string;
  type: "success" | "error" | "info";
}

/* ------------------------------------------------------------------ */
/*  Audio player hook — single shared Audio element                   */
/* ------------------------------------------------------------------ */

function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [queue, setQueue] = useState<Track[]>([]);
  const queueIndexRef = useRef(-1);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const audio = new Audio();
    audioRef.current = audio;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onDuration = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsLoadingAudio(true);
    const onPlaying = () => setIsLoadingAudio(false);
    const onEnded = () => {
      // Play next in queue
      const idx = queueIndexRef.current;
      setQueue((q) => {
        if (idx >= 0 && idx < q.length - 1) {
          const next = q[idx + 1];
          queueIndexRef.current = idx + 1;
          setCurrentTrack(next);
          setIsLoadingAudio(true);
          resolveAndPlay(audio, next);
        } else {
          setIsPlaying(false);
        }
        return q;
      });
    };
    const onError = () => {
      setIsLoadingAudio(false);
      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onDuration);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, []);

  const playTrack = useCallback(async (track: Track, newQueue?: Track[]) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (currentTrack?.id === track.id) {
      if (isPlaying) audio.pause();
      else audio.play().catch(() => {});
      return;
    }

    setCurrentTrack(track);
    setIsLoadingAudio(true);
    setCurrentTime(0);
    setDuration(track.duration || 0);

    if (newQueue) {
      const idx = newQueue.findIndex((t) => t.id === track.id);
      setQueue(newQueue);
      queueIndexRef.current = idx >= 0 ? idx : -1;
    }

    await resolveAndPlay(audio, track);
  }, [currentTrack, isPlaying]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (isPlaying) audio.pause();
    else audio.play().catch(() => {});
    haptic("light");
  }, [isPlaying, currentTrack]);

  const playNext = useCallback(() => {
    const idx = queueIndexRef.current;
    if (idx < 0 || idx >= queue.length - 1) return;
    const next = queue[idx + 1];
    queueIndexRef.current = idx + 1;
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTrack(next);
    setIsLoadingAudio(true);
    resolveAndPlay(audio, next);
  }, [queue]);

  const playPrev = useCallback(() => {
    const idx = queueIndexRef.current;
    if (idx <= 0) return;
    const prev = queue[idx - 1];
    queueIndexRef.current = idx - 1;
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTrack(prev);
    setIsLoadingAudio(true);
    resolveAndPlay(audio, prev);
  }, [queue]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  return {
    currentTrack, isPlaying, currentTime, duration, isLoadingAudio,
    playTrack, playNext, playPrev, togglePlay, seek, queue,
  };
}

/** Resolve the stream URL for a track and start playback */
async function resolveAndPlay(audio: HTMLAudioElement, track: Track) {
  let url = "";
  if (track.audioUrl && track.audioUrl.startsWith("http")) {
    url = track.audioUrl;
  } else if (track.scTrackId) {
    try {
      const res = await fetch(`/api/music/soundcloud/stream?id=${track.scTrackId}`);
      const data = await res.json();
      url = data.url || "";
    } catch {}
  } else if (track.audioUrl) {
    const origin = window.location.origin;
    url = track.audioUrl.startsWith("/") ? `${origin}${track.audioUrl}` : track.audioUrl;
  }

  if (!url) {
    haptic("error");
    return;
  }

  audio.src = url;
  audio.currentTime = 0;
  try {
    await audio.play();
    haptic("medium");
  } catch {
    // Autoplay blocked or network error
  }
}

/* ------------------------------------------------------------------ */
/*  Player context                                                     */
/* ------------------------------------------------------------------ */

type PlayerCtx = ReturnType<typeof useAudioPlayer>;
const PlayerContext = createContext<PlayerCtx | null>(null);
const usePlayer = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) return null;
  return ctx;
};

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

function TgWebAppPageInner() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [tab, setTab] = useState<"recs" | "search" | "likes" | "playlists">("recs");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [playlistSheet, setPlaylistSheet] = useState<{ track: Track } | null>(null);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const player = useAudioPlayer();

  const showToast = useCallback((text: string, type: Toast["type"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  }, []);

  const addDebug = useCallback((msg: string) => {
    console.log("[tg-mini-app]", msg);
    setDebugInfo((prev) => [...prev, `${new Date().toLocaleTimeString()} — ${msg}`]);
  }, []);

  // Read pre-React diagnostic data captured by the inline script in layout
  useEffect(() => {
    const diag = (window as any).__TG_DIAG__;
    if (diag) {
      addDebug(`[pre-React] UA: ${diag.ua?.slice(0, 80)}`);
      addDebug(`[pre-React] URL: ${diag.url}`);
      addDebug(`[pre-React] window.Telegram: ${diag.hasTelegram}`);
      addDebug(`[pre-React] window.Telegram.WebApp: ${diag.hasWebApp}`);
      addDebug(`[pre-React] initData: ${diag.initData ? `${diag.initData.length} chars` : "empty"}`);
      if (diag.errors && diag.errors.length > 0) {
        addDebug(`[pre-React] ⚠️ ${diag.errors.length} early errors:`);
        for (const e of diag.errors.slice(0, 5)) {
          addDebug(`  +${e.time}ms ${e.type}: ${e.message}`);
        }
      }
    } else {
      addDebug("[pre-React] ❌ window.__TG_DIAG__ not found — inline script failed");
      const fallback = (window as any).__TG_DIAG_FALLBACK__;
      if (fallback) addDebug(`[pre-React] fallback error: ${fallback}`);
    }
  }, [addDebug]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      addDebug("Start auth flow");
      addDebug(`User agent: ${navigator.userAgent.slice(0, 80)}`);
      addDebug(`Location: ${window.location.href}`);

      // ── Step 1: Check existing session cookie ────────────────────────
      addDebug("Step 1: Checking /api/auth/me...");
      try {
        const meRes = await fetch("/api/auth/me");
        addDebug(`  /api/auth/me → ${meRes.status}`);
        if (meRes.ok) {
          const meData = await meRes.json();
          addDebug(`  response: userId=${meData.userId}, username=${meData.username}`);
          if (meData.userId && !cancelled) {
            setAuth({ status: "authed", user: { userId: meData.userId, username: meData.username, avatar: meData.avatar } });
            addDebug("✓ Authed via existing session");
            return;
          }
        }
      } catch (e: any) {
        addDebug(`  /api/auth/me error: ${e?.message}`);
      }

      if (cancelled) return;

      // ── Step 2: Check if we're in Telegram at all ───────────────────
      addDebug("Step 2: Checking window.Telegram...");
      addDebug(`  window.Telegram exists: ${!!window.Telegram}`);
      addDebug(`  window.Telegram.WebApp exists: ${!!window.Telegram?.WebApp}`);

      // Try immediate read (mobile injects SDK before page scripts)
      let initData = getTelegramInitData();
      addDebug(`  initData (immediate): ${initData ? `${initData.length} chars` : "empty"}`);

      if (!initData) {
        // Try loading SDK dynamically
        addDebug("Step 3: Loading SDK via ensureTelegramSDK()...");
        const wa = await ensureTelegramSDK(10000);
        addDebug(`  ensureTelegramSDK returned: ${wa ? "WebApp instance" : "null"}`);
        if (cancelled) return;

        initData = getTelegramInitData();
        addDebug(`  initData (after SDK): ${initData ? `${initData.length} chars` : "empty"}`);
      }

      if (cancelled) return;

      // ── Step 3: If we have initData, validate it ────────────────────
      if (initData) {
        addDebug("Step 4: Validating initData via /api/telegram/webapp-auth...");

        // First, run a debug check (no session creation)
        try {
          const debugRes = await fetch("/api/telegram/webapp-debug", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData }),
          });
          const debugData = await debugRes.json();
          addDebug(`  debug: ok=${debugData.ok}, step=${debugData.step}`);
          if (debugData.details) {
            addDebug(`    hashMatch=${debugData.details.hashMatch}, fresh=${debugData.details.fresh}, age=${debugData.details.ageSeconds}s`);
            if (debugData.details.user) {
              addDebug(`    user: id=${debugData.details.user.id}, username=${debugData.details.user.username}`);
            }
          }
          if (debugData.error) {
            addDebug(`    error: ${debugData.error}`);
          }
        } catch (e: any) {
          addDebug(`  debug endpoint error: ${e?.message}`);
        }

        // Now the real auth
        try {
          const res = await fetch("/api/telegram/webapp-auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData }),
          });
          addDebug(`  /api/telegram/webapp-auth → ${res.status}`);
          const data = await res.json();
          addDebug(`  response: ${JSON.stringify({ ok: data.ok, userId: data.userId, isNewUser: data.isNewUser, error: data.error })}`);

          if (cancelled) return;

          if (data.userId || data.ok) {
            setAuth({ status: "authed", user: { userId: data.userId, username: data.username, avatar: data.avatar } });
            addDebug("✓ Authed via initData");
          } else if (data.isNewUser && data.telegramUser) {
            setAuth({ status: "new_user", telegramUser: data.telegramUser });
            addDebug("✓ New user registration needed");
          } else {
            setAuth({ status: "error", error: data.error || "Auth failed" });
            addDebug(`✗ Auth failed: ${data.error}`);
          }
        } catch (e: any) {
          if (!cancelled) {
            setAuth({ status: "error", error: `Network error: ${e?.message}` });
            addDebug(`✗ Network error: ${e?.message}`);
          }
        }
      } else {
        // No initData anywhere
        const inTelegram = !!window.Telegram?.WebApp;
        const msg = inTelegram
          ? "Telegram SDK загрузился, но initData пустой. Возможно, вы открыли Mini App не через кнопку в боте."
          : "Не удалось загрузить Telegram SDK. Откройте Mini App через кнопку «🎧 Открыть плеер» в боте.";
        setAuth({ status: "error", error: msg });
        addDebug(`✗ No initData. window.Telegram.WebApp=${inTelegram}`);
      }
    })();

    return () => { cancelled = true; };
  }, [addDebug]);

  useEffect(() => {
    if (auth.status === "authed") applyTelegramTheme();
  }, [auth.status]);

  if (auth.status === "loading") {
    return (
      <div className="tg-loading" data-tg-app="true">
        <div className="tg-loading-logo">mq</div>
        <div className="tg-spinner" />
        <p>Загрузка...</p>
        {/* Show debug progress even during loading */}
        {debugInfo.length > 0 && (
          <details className="tg-debug" style={{ marginTop: 16, maxWidth: 400, width: "100%" }}>
            <summary>Ход загрузки ({debugInfo.length})</summary>
            <pre className="tg-debug-log">
              {debugInfo.join("\n")}
            </pre>
          </details>
        )}
      </div>
    );
  }

  if (auth.status === "error") {
    return (
      <div className="tg-error" data-tg-app="true">
        <div className="tg-error-icon">😕</div>
        <p className="tg-error-text">{auth.error}</p>
        <a href="/" className="tg-btn-primary" style={{ maxWidth: 280, marginTop: 16 }}>
          Открыть обычную версию
        </a>
        {/* Debug info — always visible on error so user can report */}
        {debugInfo.length > 0 && (
          <details className="tg-debug" style={{ marginTop: 16, maxWidth: 400, width: "100%" }}>
            <summary>Отладка ({debugInfo.length} событий)</summary>
            <pre className="tg-debug-log">
              {debugInfo.join("\n")}
            </pre>
          </details>
        )}
        <button
          className="tg-btn-primary"
          style={{ maxWidth: 280, marginTop: 8, background: "transparent", color: "var(--mq-text-muted)", fontSize: 14 }}
          onClick={() => {
            // Copy debug to clipboard
            navigator.clipboard?.writeText(debugInfo.join("\n")).then(() => {
              showToast("Скопировано в буфер", "success");
            }).catch(() => {});
          }}
        >
          📋 Скопировать лог
        </button>
      </div>
    );
  }

  if (auth.status === "new_user") {
    return <div data-tg-app="true"><RegistrationView telegramUser={auth.telegramUser!} onAuthed={(u) => setAuth({ status: "authed", user: u })} showToast={showToast} /></div>;
  }

  return (
    <PlayerContext.Provider value={player}>
      <div className="tg-app" data-tg-app="true">
        <header className="tg-header">
          <div className="tg-header-logo">mq</div>
          <div className="tg-header-user">{auth.user?.username}</div>
        </header>

        <main className="tg-main">
          {tab === "recs" && <RecsView onAddToPlaylist={(t) => setPlaylistSheet({ track: t })} showToast={showToast} />}
          {tab === "search" && <SearchView onAddToPlaylist={(t) => setPlaylistSheet({ track: t })} showToast={showToast} />}
          {tab === "likes" && <LikesView showToast={showToast} />}
          {tab === "playlists" && <PlaylistsView showToast={showToast} />}
        </main>

        {player.currentTrack && <PlayerBar />}

        <nav className="tg-nav">
          <NavBtn icon="✨" label="Реки" active={tab === "recs"} onClick={() => { setTab("recs"); haptic("select"); }} />
          <NavBtn icon="🔍" label="Поиск" active={tab === "search"} onClick={() => { setTab("search"); haptic("select"); }} />
          <NavBtn icon="❤️" label="Лайки" active={tab === "likes"} onClick={() => { setTab("likes"); haptic("select"); }} />
          <NavBtn icon="📂" label="Плейлисты" active={tab === "playlists"} onClick={() => { setTab("playlists"); haptic("select"); }} />
        </nav>

        <div className="tg-toasts">
          {toasts.map((t) => (
            <div key={t.id} className={`tg-toast tg-toast-${t.type}`}>
              {t.type === "success" ? "✅" : t.type === "error" ? "❌" : "ℹ️"} {t.text}
            </div>
          ))}
        </div>

        {playlistSheet && (
          <PlaylistSheet track={playlistSheet.track} onClose={() => setPlaylistSheet(null)} showToast={showToast} />
        )}
      </div>
    </PlayerContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Nav button                                                         */
/* ------------------------------------------------------------------ */

function NavBtn({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`tg-nav-btn ${active ? "active" : ""}`} onClick={onClick}>
      <span className="tg-nav-icon">{icon}</span>
      <span className="tg-nav-label">{label}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

function RegistrationView({ telegramUser, onAuthed, showToast }: { telegramUser: TelegramWebAppUser; onAuthed: (u: { userId: string; username: string; avatar?: string | null }) => void; showToast: (text: string, type?: Toast["type"]) => void }) {
  const [username, setUsername] = useState(telegramUser.username || "");
  const [loading, setLoading] = useState(false);

  const submit = useCallback(async () => {
    if (!username.trim()) { showToast("Введите имя", "error"); return; }
    setLoading(true);
    try {
      const initData = getTelegramInitData();
      const res = await fetch("/api/telegram/webapp-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData, username: username.trim() }) });
      const data = await res.json();
      if (data.ok || data.userId) { onAuthed({ userId: data.userId, username: data.username, avatar: data.avatar }); showToast("Добро пожаловать!", "success"); }
      else showToast(data.error || "Ошибка", "error");
    } catch { showToast("Network error", "error"); }
    finally { setLoading(false); }
  }, [username, onAuthed, showToast]);

  return (
    <div className="tg-register">
      <div className="tg-register-avatar">
        {telegramUser.photo_url ? <img src={telegramUser.photo_url} alt="" /> : <div className="tg-register-avatar-placeholder">{(telegramUser.first_name || "?")[0]}</div>}
      </div>
      <h1>Привет, {telegramUser.first_name || telegramUser.username || "друг"}!</h1>
      <p>Придумайте имя пользователя</p>
      <input type="text" className="tg-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" maxLength={20} autoFocus onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
      <button className="tg-btn-primary" onClick={submit} disabled={loading || !username.trim()}>{loading ? "Создаём..." : "Создать аккаунт"}</button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Track card                                                         */
/* ------------------------------------------------------------------ */

function TrackCard({ track, onPlay, onLike, onAdd }: { track: Track; onPlay: () => void; onLike: () => void; onAdd?: () => void }) {
  const player = usePlayer();
  const isCurrent = player?.currentTrack?.id === track.id;
  const isPlaying = isCurrent && player.isPlaying;
  const [liked, setLiked] = useState(false);

  return (
    <div className={`tg-card ${isPlaying ? "tg-card-playing" : ""}`} onClick={onPlay}>
      <div className="tg-card-cover">
        {track.cover ? <img src={track.cover} alt="" loading="lazy" /> : <div className="tg-card-cover-placeholder">{isPlaying ? "🎵" : "♪"}</div>}
        {isPlaying && <div className="tg-card-bars"><span></span><span></span><span></span></div>}
      </div>
      <div className="tg-card-info">
        <div className="tg-card-title">{track.title}</div>
        <div className="tg-card-artist">{track.artist}</div>
      </div>
      <div className="tg-card-actions">
        <button className={`tg-card-btn ${liked ? "liked" : ""}`} onClick={(e) => { e.stopPropagation(); setLiked(!liked); onLike(); }}>{liked ? "❤️" : "🤍"}</button>
        {onAdd && <button className="tg-card-btn" onClick={(e) => { e.stopPropagation(); onAdd(); }}>+</button>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Search                                                             */
/* ------------------------------------------------------------------ */

function SearchView({ onAddToPlaylist, showToast }: { onAddToPlaylist: (t: Track) => void; showToast: (text: string, type?: Toast["type"]) => void }) {
  const player = usePlayer();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true); setSearched(true);
    try {
      const res = await fetch(`/api/music/search?q=${encodeURIComponent(query)}&source=soundcloud`);
      const data = await res.json();
      setResults(Array.isArray(data.tracks) ? data.tracks : []);
    } catch { setResults([]); showToast("Ошибка поиска", "error"); }
    finally { setLoading(false); }
  }, [query, showToast]);

  return (
    <div className="tg-view">
      <div className="tg-search-box">
        <input type="text" className="tg-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Трек или исполнитель..." onKeyDown={(e) => { if (e.key === "Enter") search(); }} />
        <button className="tg-search-btn" onClick={search} disabled={loading || !query.trim()}>{loading ? <Spinner /> : "🔍"}</button>
      </div>
      {loading && <SkeletonList />}
      {!loading && searched && results.length === 0 && <Empty icon="🔍" title="Ничего не найдено" text="Попробуйте другой запрос" />}
      {!loading && !searched && <Empty icon="🎵" title="Поиск музыки" text="Введите название трека или имя артиста" />}
      <div className="tg-card-list">
        {results.map((track, idx) => (
          <TrackCard key={track.id || idx} track={track} onPlay={() => player?.playTrack(track, results)} onLike={async () => { await likeTrack(track); showToast("Добавлено в лайки", "success"); }} onAdd={() => onAddToPlaylist(track)} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Recommendations                                                    */
/* ------------------------------------------------------------------ */

function RecsView({ onAddToPlaylist, showToast }: { onAddToPlaylist: (t: Track) => void; showToast: (text: string, type?: Toast["type"]) => void }) {
  const player = usePlayer();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/music/recommendations");
      const data = await res.json();
      const flat: Track[] = Array.isArray(data.tracks) ? data.tracks : [];
      const cats = Array.isArray(data.categories) ? data.categories : [];
      const forYou = cats.find((c: any) => c.id === "for_you");
      setTracks(forYou?.tracks?.length ? forYou.tracks : flat);
    } catch { setTracks([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="tg-view">
      <div className="tg-view-header">
        <h2>✨ Для вас</h2>
        <button className="tg-icon-btn" onClick={load} disabled={loading}>{loading ? <Spinner /> : "🔄"}</button>
      </div>
      {loading && <SkeletonList />}
      {!loading && tracks.length === 0 && <Empty icon="✨" title="Пока нечего рекомендовать" text="Лайкните пару треков или послушайте — и рекомендации появятся" />}
      <div className="tg-card-list">
        {tracks.map((track, idx) => (
          <TrackCard key={track.id || idx} track={track} onPlay={() => player?.playTrack(track, tracks)} onLike={async () => { await likeTrack(track); showToast("Добавлено в лайки", "success"); }} onAdd={() => onAddToPlaylist(track)} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Likes                                                              */
/* ------------------------------------------------------------------ */

function LikesView({ showToast }: { showToast: (text: string, type?: Toast["type"]) => void }) {
  const player = usePlayer();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sync");
      const data = await res.json();
      setTracks(Array.isArray(data.data?.likedTracksData) ? data.data.likedTracksData : []);
    } catch { setTracks([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="tg-view">
      <div className="tg-view-header">
        <h2>❤️ Лайки</h2>
        <button className="tg-icon-btn" onClick={load} disabled={loading}>{loading ? <Spinner /> : "🔄"}</button>
      </div>
      {loading && <SkeletonList />}
      {!loading && tracks.length === 0 && <Empty icon="❤️" title="Нет лайкнутых треков" text="Нажимайте 🤍 в поиске или рекомендациях" />}
      <div className="tg-card-list">
        {tracks.map((track, idx) => (
          <TrackCard key={track.id || idx} track={track} onPlay={() => player?.playTrack(track, tracks)} onLike={async () => { await unlikeTrack(track.id); setTracks((prev) => prev.filter((t) => t.id !== track.id)); showToast("Убрано из лайков", "info"); }} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Playlists                                                          */
/* ------------------------------------------------------------------ */

function PlaylistsView({ showToast }: { showToast: (text: string, type?: Toast["type"]) => void }) {
  const player = usePlayer();
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/playlists");
      const data = await res.json();
      setPlaylists(Array.isArray(data.playlists) ? data.playlists.map((p: any) => ({ id: p.id, name: p.name, trackCount: p.tracks?.length || 0 })) : []);
    } catch { setPlaylists([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openPlaylist = useCallback(async (id: string) => {
    setLoading(true); setSelectedId(id);
    try {
      const res = await fetch(`/api/playlists/${id}`);
      const data = await res.json();
      setTracks(Array.isArray(data.tracks) ? data.tracks : []);
    } catch { setTracks([]); }
    finally { setLoading(false); }
  }, []);

  if (selectedId) {
    const pl = playlists.find((p) => p.id === selectedId);
    return (
      <div className="tg-view">
        <div className="tg-view-header">
          <button className="tg-icon-btn" onClick={() => setSelectedId(null)}>←</button>
          <h2>{pl?.name || "Плейлист"}</h2>
        </div>
        {loading && <SkeletonList />}
        {!loading && tracks.length === 0 && <Empty icon="📂" title="Плейлист пуст" text="Добавьте треки из поиска" />}
        <div className="tg-card-list">
          {tracks.map((track, idx) => (
            <TrackCard key={track.id || idx} track={track} onPlay={() => player?.playTrack(track, tracks)} onLike={async () => { await likeTrack(track); showToast("Добавлено в лайки", "success"); }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="tg-view">
      <div className="tg-view-header"><h2>📂 Плейлисты</h2></div>
      {loading && <SkeletonList />}
      {!loading && playlists.length === 0 && <Empty icon="📂" title="Нет плейлистов" text="Создайте плейлист через бота" />}
      <div className="tg-playlist-grid">
        {playlists.map((pl) => (
          <button key={pl.id} className="tg-playlist-card" onClick={() => openPlaylist(pl.id)}>
            <div className="tg-playlist-cover">📂</div>
            <div className="tg-playlist-name">{pl.name}</div>
            <div className="tg-playlist-count">{pl.trackCount} треков</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Playlist sheet                                                     */
/* ------------------------------------------------------------------ */

function PlaylistSheet({ track, onClose, showToast }: { track: Track; onClose: () => void; showToast: (text: string, type?: Toast["type"]) => void }) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/playlists");
        const data = await res.json();
        setPlaylists(Array.isArray(data.playlists) ? data.playlists.map((p: any) => ({ id: p.id, name: p.name, trackCount: p.tracks?.length || 0 })) : []);
      } catch { setPlaylists([]); }
      finally { setLoading(false); }
    })();
  }, []);

  const addToPlaylist = useCallback(async (playlistId: string, playlistName: string) => {
    setAdding(playlistId);
    try {
      const res = await fetch(`/api/playlists/${playlistId}`);
      const data = await res.json();
      const existing: Track[] = Array.isArray(data.tracks) ? data.tracks : [];
      const exists = existing.some((t) => t.scTrackId === track.scTrackId && t.scTrackId != null);
      if (exists) { showToast("Уже в этом плейлисте", "info"); onClose(); return; }
      existing.push(track);
      await fetch(`/api/playlists/${playlistId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tracksJson: JSON.stringify(existing) }) });
      showToast(`Добавлено в «${playlistName}»`, "success");
      haptic("success");
      onClose();
    } catch { showToast("Ошибка", "error"); }
    finally { setAdding(null); }
  }, [track, showToast, onClose]);

  return (
    <div className="tg-sheet-overlay" onClick={onClose}>
      <div className="tg-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tg-sheet-handle" />
        <div className="tg-sheet-header">
          <h3>Добавить в плейлист</h3>
          <div className="tg-sheet-track">{track.title} — {track.artist}</div>
        </div>
        {loading ? <div style={{ padding: 24, textAlign: "center" }}><Spinner /></div> : (
          <div className="tg-sheet-list">
            {playlists.map((pl) => (
              <button key={pl.id} className="tg-sheet-item" onClick={() => addToPlaylist(pl.id, pl.name)} disabled={adding !== null}>
                <span className="tg-sheet-item-icon">📂</span>
                <span className="tg-sheet-item-name">{pl.name}</span>
                <span className="tg-sheet-item-count">{pl.trackCount}</span>
                {adding === pl.id && <Spinner />}
              </button>
            ))}
            {playlists.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "var(--mq-text-muted)" }}>У вас пока нет плейлистов</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Player bar                                                         */
/* ------------------------------------------------------------------ */

function PlayerBar() {
  const player = usePlayer()!;
  const { currentTrack, isPlaying, currentTime, duration, isLoadingAudio, togglePlay, playNext, playPrev, seek } = player;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    seek(pct * duration);
  }, [duration, seek]);

  if (!currentTrack) return null;

  return (
    <div className="tg-player-bar">
      <div className="tg-player-progress" onClick={handleSeek}>
        <div className="tg-player-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="tg-player-content">
        <div className="tg-player-cover">
          {currentTrack.cover ? <img src={currentTrack.cover} alt="" /> : <div className="tg-player-cover-placeholder">♪</div>}
        </div>
        <div className="tg-player-info">
          <div className="tg-player-title">{currentTrack.title}</div>
          <div className="tg-player-artist">{currentTrack.artist}</div>
        </div>
        <div className="tg-player-controls">
          <button className="tg-player-btn" onClick={playPrev} disabled={!player.queue.length}>⏮</button>
          <button className="tg-player-btn tg-player-btn-main" onClick={togglePlay}>
            {isLoadingAudio ? <Spinner /> : isPlaying ? "⏸" : "▶"}
          </button>
          <button className="tg-player-btn" onClick={playNext} disabled={!player.queue.length}>⏭</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  UI helpers                                                         */
/* ------------------------------------------------------------------ */

function Spinner() { return <div className="tg-spinner-sm" />; }

function SkeletonList() {
  return (
    <div className="tg-skeleton-list">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="tg-skeleton-card">
          <div className="tg-skeleton-cover" />
          <div className="tg-skeleton-lines">
            <div className="tg-skeleton-line tg-skeleton-title" />
            <div className="tg-skeleton-line tg-skeleton-artist" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="tg-empty">
      <div className="tg-empty-icon">{icon}</div>
      <div className="tg-empty-title">{title}</div>
      <div className="tg-empty-text">{text}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  API helpers                                                        */
/* ------------------------------------------------------------------ */

async function likeTrack(track: Track): Promise<void> {
  try {
    const trackId = String(track.id || (track.scTrackId ? `sc_${track.scTrackId}` : ""));
    const res = await fetch("/api/sync");
    const data = await res.json();
    const ids: string[] = data.data?.likedTracks || [];
    const tracks: Track[] = data.data?.likedTracksData || [];
    if (ids.includes(trackId)) return;
    ids.push(trackId);
    tracks.push(track);
    await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { likedTracks: ids, likedTracksData: tracks } }) });
  } catch {}
}

async function unlikeTrack(trackId: string): Promise<void> {
  try {
    const res = await fetch("/api/sync");
    const data = await res.json();
    const ids: string[] = data.data?.likedTracks || [];
    const tracks: Track[] = data.data?.likedTracksData || [];
    await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { likedTracks: ids.filter((id) => id !== trackId), likedTracksData: tracks.filter((t) => t.id !== trackId) } }) });
  } catch {}
}

/* ------------------------------------------------------------------ */
/*  Default export — dynamic import with ssr: false                   */
/*                                                                     */
/*  The Mini App is a pure client-side app. Rendering it on the server */
/*  causes hydration mismatches because window.Telegram is undefined   */
/*  on server but defined on client. By wrapping the inner component   */
/*  in next/dynamic with ssr: false, the server sends a minimal        */
/*  loading shell and the client renders the full app after mount.     */
/* ------------------------------------------------------------------ */

const TgWebAppPage = dynamic(() => Promise.resolve(TgWebAppPageInner), {
  ssr: false,
  loading: () => (
    <div className="tg-loading">
      <div className="tg-loading-logo">mq</div>
      <div className="tg-spinner" />
      <p>Загрузка...</p>
    </div>
  ),
});

export default TgWebAppPage;
