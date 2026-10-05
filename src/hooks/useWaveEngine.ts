"use client";

import { useState, useCallback, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { extractTasteProfile } from "@/lib/tasteProfile";
import {
  isReplay,
  needsRefill,
  WAVE_CONFIG,
  type WaveSeed,
  type WaveEvent,
  type WaveSignals,
  type WaveQueueItem,
} from "@/lib/wave";
import type { Track as MQTrack } from "@/lib/musicApi";

// ═════════════════════════════════════════════════════════════════════════
// useWaveEngine v2 — MQ Wave (lib/wave engine) client orchestration.
//
// Public API is a superset of v1 (startWave / startWaveFromCurrentTrack /
// stopWave / pauseWave / skipTrack / likeTrack / dislikeTrack all kept) so
// existing consumers (MainView, PlayerBar) upgrade transparently. New:
//   • startWaveFromArtist / startWaveWithSeed — seed support (§6)
//   • moreLikeThis / lessLikeThis — live steering (§17, §18)
//   • nextUpPreview — the Wave UI "следующие треки" with honest reasons
//
// Wave queue (logical, store) is kept stocked by the refill effect; its
// items are appended to the playback queue so the existing player pipeline
// (single audio clock, upNext priority, store nextTrack) stays THE player.
// If /api/wave is unreachable, the engine degrades to the legacy
// radio/recommendations endpoints — playback never stalls (§35).
// ═════════════════════════════════════════════════════════════════════════

/** Local anon id — same storage key the feedback sync already uses. */
function getAnonId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem("mq_anon_id") || "";
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("mq_anon_id", id);
    }
    return id;
  } catch {
    return "";
  }
}

/** V2 (PART 11): wave debug mode — set localStorage 'mq_wave_debug' = '1'
 * to ship per-track relevance metadata and render debug chips in WaveHome. */
function isWaveDebugMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("mq_wave_debug") === "1";
  } catch {
    return false;
  }
}

/** API response shape (§29). */
interface WaveApiResponse {
  sessionId: string;
  seed: WaveSeed | null;
  tracks: MQTrack[];
  reasons: string[];
  meta: Record<string, unknown>;
  cached?: boolean;
}

/* ────────────────────────────────────────────────────────────────────────
 * SHARED ENGINE RUNTIME (module scope).
 *
 * useWaveEngine is mounted by SEVERAL components at once (MainView,
 * WaveHome, HeroWaveCTA, ContextMenu…). Per-instance refs would mean
 * duplicated play_started events, duplicated feedback flushes and racing
 * refills (observed live: 12 feedback POSTs after a single start). All
 * mutable engine state therefore lives HERE — one runtime per browser tab,
 * shared by every hook instance.
 * ──────────────────────────────────────────────────────────────────────── */
const waveRuntime = {
  lastFetch: 0,
  inflight: null as Promise<MQTrack[]> | null,
  sentEvents: 0,
  flushTimer: null as ReturnType<typeof setTimeout> | null,
  lastTrack: null as { trackId: string; startedAt: number } | null,
  /** Session generation — resets counters when a NEW wave session starts. */
  sessionGen: "" as string,
};

function resetRuntimeForSession(sessionId: string): void {
  if (waveRuntime.sessionGen === sessionId) return;
  waveRuntime.sessionGen = sessionId;
  waveRuntime.sentEvents = 0;
  if (waveRuntime.flushTimer) {
    clearTimeout(waveRuntime.flushTimer);
    waveRuntime.flushTimer = null;
  }
}

/** Map an API track (+_reason/_seedArtist/_debug fields) to a queue item. */
function toQueueItem(t: MQTrack, fallbackReason: string): {
  track: MQTrack;
  reason: string;
  seedRef?: string;
  debug?: import("@/lib/wave").WaveRelevanceDebug;
} {
  const x = t as MQTrack & { _reason?: string; _seedArtist?: string; _debug?: import("@/lib/wave").WaveRelevanceDebug };
  return {
    track: t,
    reason: x._reason || fallbackReason,
    seedRef: x._seedArtist,
    debug: x._debug,
  };
}

export function useWaveEngine() {
  const playTrack = useAppStore((s) => s.playTrack);
  const nextTrack = useAppStore((s) => s.nextTrack);
  const radioMode = useAppStore((s) => s.radioMode);
  const currentTrack = useAppStore((s) => s.currentTrack);
  const queue = useAppStore((s) => s.queue);
  const queueIndex = useAppStore((s) => s.queueIndex);
  const waveSession = useAppStore((s) => s.waveSession);
  const waveQueue = useAppStore((s) => s.waveQueue);
  const waveSessionEvents = useAppStore((s) => s.waveSessionEvents);
  const waveLoading = useAppStore((s) => s.waveLoading);
  const waveError = useAppStore((s) => s.waveError);

  const [legacyLoading, setLegacyLoading] = useState(false);
  const loading = waveLoading || legacyLoading;

  /* ────────────────────────────────────────────────────────────────────
   * Signals — build the WaveSignals payload from live store state (§29).
   * V2: likedTexts/historyTexts feed the personalized cultural-cluster
   * map (PART 8) and history slices are wider for recent-context (PART 9).
   * ──────────────────────────────────────────────────────────────────── */
  const buildSignals = useCallback((seed: WaveSeed | null): WaveSignals => {
    const s = useAppStore.getState();
    const tp = extractTasteProfile({
      history: Array.isArray(s.history) ? s.history : [],
      likedTracksData: Array.isArray(s.likedTracksData) ? s.likedTracksData : [],
      dislikedTrackIds: Array.isArray(s.dislikedTrackIds) ? s.dislikedTrackIds : [],
    });
    const excludeIds = [
      ...(s.queue || []).map((t) => t.id),
      ...(s.history || []).slice(0, 100).map((h) => h.track?.id),
      ...(s.waveQueue || []).map((q) => q.track.id),
      ...(s.dislikedTrackIds || []),
    ];
    // V2 (PART 8): compact "title artist" texts — the server computes the
    // cultural-cluster affinity map from these (never a global blacklist).
    const likedTexts = (s.likedTracksData || [])
      .slice(0, 12)
      .map((t) => `${t.title || ""} ${t.artist || ""}`.trim().slice(0, 120))
      .filter(Boolean);
    const historyTexts = (s.history || [])
      .slice(0, 16)
      .map((h) => `${h.track?.title || ""} ${h.track?.artist || ""}`.trim().slice(0, 120))
      .filter(Boolean);
    return {
      likedArtists: [...new Set((s.likedTracksData || []).map((t) => t.artist).filter(Boolean))].slice(0, 10),
      likedGenres: [...new Set((s.likedTracksData || []).map((t) => t.genre).filter(Boolean))].slice(0, 10),
      dislikedArtists: [...new Set((s.dislikedTracksData || []).map((t) => t.artist).filter(Boolean))].slice(0, 10),
      likedScIds: (s.likedTracksData || []).map((t) => t.scTrackId).filter((id): id is number => !!id).slice(0, 5),
      historyScIds: (s.history || []).map((h) => h.track?.scTrackId).filter((id): id is number => !!id).slice(0, 12),
      historyArtists: (s.history || []).slice(0, 20).map((h) => h.track?.artist).filter(Boolean).slice(0, 12),
      historyGenres: (s.history || []).slice(0, 30).map((h) => h.track?.genre).filter(Boolean).slice(0, 12),
      tasteGenres: tp.topGenres.slice(0, 6),
      tasteArtists: [
        ...new Set([
          ...(s.favoriteArtists || []).map((a) => a.username),
          ...tp.topArtists,
        ]),
      ].slice(0, 5),
      language: tp.language,
      sessionEvents: (s.waveSessionEvents || []).slice(-WAVE_CONFIG.feedback.maxSessionEvents),
      excludeIds: [...new Set(excludeIds)].slice(0, 150),
      excludeScIds: (s.dislikedTracksData || []).map((t) => t.scTrackId).filter((id): id is number => !!id).slice(0, 50),
      recentWaveArtists: (s.waveMemory?.artists || []).map((e) => e.value).slice(0, 25),
      recentWaveGenres: (s.waveMemory?.genres || []).map((e) => e.value).slice(0, 15),
      recentWaveTrackIds: (s.waveMemory?.tracks || []).map((e) => e.value).slice(0, 60),
      seed: seed || undefined,
      likedTexts,
      historyTexts,
      debug: isWaveDebugMode() || undefined,
    };
  }, []);

  /* ────────────────────────────────────────────────────────────────────
   * Wave API calls
   * ──────────────────────────────────────────────────────────────────── */
  const callWaveApi = useCallback(async (endpoint: string, seed: WaveSeed | null): Promise<WaveApiResponse | null> => {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anonId: getAnonId(),
          sessionId: useAppStore.getState().waveSession?.id,
          ...buildSignals(seed),
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as WaveApiResponse;
      if (!data || !Array.isArray(data.tracks)) return null;
      return data;
    } catch {
      return null;
    }
  }, [buildSignals]);

  /* ────────────────────────────────────────────────────────────────────
   * LEGACY fallback (production-tested v1 path): /api/music/radio seeded
   * by the current track, then /api/music/recommendations. Used only when
   * the wave API is unavailable — playback must never stall (§35).
   * ──────────────────────────────────────────────────────────────────── */
  const fetchLegacyTracks = useCallback(async (count: number): Promise<MQTrack[]> => {
    const state = useAppStore.getState();
    const cur = state.currentTrack;
    const disliked = state.dislikedTrackIds || [];
    const excludeSet = new Set<string>([
      ...((state.history || []).slice(0, 200).map((h) => h.track?.id).filter(Boolean) as string[]),
      ...((state.queue || []).map((t) => t?.id).filter(Boolean) as string[]),
      ...disliked,
    ]);

    if (cur?.scTrackId && cur.scTrackId > 0) {
      try {
        const params = new URLSearchParams();
        params.set("scTrackId", String(cur.scTrackId));
        if (cur.artist) params.set("seedArtist", cur.artist);
        if (cur.genre) params.set("seedGenre", cur.genre);
        const playedScIds = [
          ...state.history.map((h) => h.track?.scTrackId).filter((id): id is number => !!id),
          ...state.queue.map((t) => t?.scTrackId).filter((id): id is number => !!id),
        ];
        const uniquePlayed = [...new Set(playedScIds)].slice(0, 80).join(",");
        if (uniquePlayed) params.set("historyScIds", uniquePlayed);
        const res = await fetch(`/api/music/radio?${params}`);
        if (res.ok) {
          const data = await res.json();
          let tracks: MQTrack[] = (data.tracks || []).filter(
            (t: MQTrack) => !disliked.includes(t.id) && !excludeSet.has(t.id),
          );
          const artistCount = new Map<string, number>();
          tracks = tracks.filter((t) => {
            const a = (t.artist || "").toLowerCase().trim();
            if (!a) return true;
            const c = artistCount.get(a) || 0;
            if (c >= 1) return false;
            artistCount.set(a, c + 1);
            return true;
          });
          if (tracks.length > 0) return tracks.slice(0, count);
        }
      } catch {
        // fall through
      }
    }

    const s = useAppStore.getState();
    const recParams = new URLSearchParams();
    const tp = extractTasteProfile({
      history: Array.isArray(s.history) ? s.history : [],
      likedTracksData: Array.isArray(s.likedTracksData) ? s.likedTracksData : [],
    });
    if (tp.topGenres.length > 0) recParams.set("genres", tp.topGenres.join(","));
    const favArtists = (s.favoriteArtists || []).map((a) => a.username);
    const allArtists = [...new Set([...favArtists, ...tp.topArtists])];
    if (allArtists.length > 0) recParams.set("artists", allArtists.slice(0, 5).join(","));
    if (disliked.length > 0) recParams.set("dislikedIds", disliked.join(","));
    recParams.set("wave", "1");
    recParams.set("count", String(count));
    const excludeArr = [...excludeSet];
    if (excludeArr.length > 0) recParams.set("excludeIds", excludeArr.join(","));
    try {
      const res = await fetch(`/api/music/recommendations?${recParams}`);
      if (res.ok) {
        const data = await res.json();
        return (data.tracks || []).filter(
          (t: MQTrack) => !disliked.includes(t.id) && !excludeSet.has(t.id),
        ).slice(0, count);
      }
    } catch {}
    return [];
  }, []);

  /** Fetch tracks: wave API first, legacy fallback second (never stalls). */
  const fetchWaveTracks = useCallback(async (count: number, seed: WaveSeed | null): Promise<MQTrack[]> => {
    if (waveRuntime.inflight) return waveRuntime.inflight;
    const p = (async () => {
      const data = await callWaveApi("/api/wave/next", seed);
      if (data && data.tracks.length > 0) {
        return data.tracks.slice(0, count);
      }
      return fetchLegacyTracks(count);
    })().finally(() => {
      waveRuntime.inflight = null;
    });
    waveRuntime.inflight = p;
    return p;
  }, [callWaveApi, fetchLegacyTracks]);

  /* ────────────────────────────────────────────────────────────────────
   * Start / stop / seeds
   * ──────────────────────────────────────────────────────────────────── */
  const startWaveWithSeed = useCallback(async (seed: WaveSeed, seedTrack?: MQTrack) => {
    if (loading) return;
    useAppStore.getState().setWaveLoading(true);
    useAppStore.getState().setWaveError(null);
    waveRuntime.lastFetch = Date.now();

    try {
      const data = await callWaveApi("/api/wave", seed);
      const st = useAppStore.getState();
      const sessionId = st.startWaveSession(seed);
      resetRuntimeForSession(sessionId);
      waveRuntime.lastTrack = null; // new session — next play_started is fresh
      st.pushWaveEvent({
        type: "wave_started",
        trackId: seed.trackId || seedTrack?.id || "seed",
        scTrackId: seed.scTrackId,
        title: seed.label,
        artist: seed.artist,
        genre: seed.genre,
        at: Date.now(),
      });

      let tracks: MQTrack[] = data?.tracks || [];
      if (tracks.length === 0) {
        tracks = await fetchLegacyTracks(20);
      }

      if (tracks.length === 0 && !seedTrack) {
        useAppStore.getState().setWaveError("Не удалось загрузить треки. Попробуйте позже.");
        useAppStore.getState().clearWave();
        return;
      }

      const state = useAppStore.getState();
      const cur = state.currentTrack;
      const seedIsCurrent = !!seedTrack && cur?.id === seedTrack.id;

      if (seedTrack && seedIsCurrent) {
        // Seed = the track that's ALREADY playing → preserve position and
        // the listened-so-far part of the queue; wave continues after it.
        const q = Array.isArray(state.queue) ? state.queue : [];
        const idx = typeof state.queueIndex === "number" ? state.queueIndex : 0;
        const fresh = tracks.filter((t) => !q.some((x) => x.id === t.id));
        useAppStore.setState({
          radioMode: true,
          radioSeedTrack: cur,
          radioSkipCount: 0,
          upNext: [],
          queue: [...q.slice(0, idx + 1), ...fresh],
          queueIndex: idx,
        });
        useAppStore.getState().enqueueWaveTracks(
          [seedTrack, ...tracks].map((t) => toQueueItem(t, "similar_track")),
        );
        useAppStore.getState().markWaveTracksServed([seedTrack]);
      } else if (seedTrack) {
        // Seed track not playing → start from it, wave follows.
        const queueTracks = [seedTrack, ...tracks.filter((t) => t.id !== seedTrack.id)];
        useAppStore.setState({
          radioMode: true,
          radioSeedTrack: seedTrack,
          radioSkipCount: 0,
        });
        useAppStore.getState().enqueueWaveTracks(
          queueTracks.map((t) => toQueueItem(t, "similar_track")),
        );
        useAppStore.getState().markWaveTracksServed([seedTrack]);
        playTrack(seedTrack, queueTracks);
      } else {
        // Taste/artist/genre seed → start from the first recommendation.
        const first = tracks[0];
        useAppStore.setState({
          radioMode: true,
          radioSeedTrack: first,
          radioSkipCount: 0,
        });
        useAppStore.getState().enqueueWaveTracks(
          tracks.map((t) => toQueueItem(t, "taste_profile")),
        );
        useAppStore.getState().markWaveTracksServed([first]);
        playTrack(first, tracks);
      }
    } catch {
      useAppStore.getState().setWaveError("Ошибка загрузки Волны");
    } finally {
      useAppStore.getState().setWaveLoading(false);
    }
  }, [loading, callWaveApi, fetchLegacyTracks, playTrack]);

  const startWave = useCallback(async () => {
    return startWaveWithSeed({ kind: "taste", label: "Ваш вкус" });
  }, [startWaveWithSeed]);

  const startWaveFromCurrentTrack = useCallback(async () => {
    const cur = useAppStore.getState().currentTrack;
    if (!cur) return startWave();
    // Preserve current playback: seed = current track, queue continues.
    return startWaveWithSeed(
      {
        kind: "track",
        trackId: cur.id,
        scTrackId: cur.scTrackId,
        artist: cur.artist,
        genre: cur.genre,
        label: cur.title,
      },
      cur,
    );
  }, [startWave, startWaveWithSeed]);

  const startWaveFromArtist = useCallback(async (artist: string, genre?: string) => {
    if (!artist) return startWave();
    return startWaveWithSeed({ kind: "artist", artist, genre, label: artist });
  }, [startWave, startWaveWithSeed]);

  const stopWave = useCallback(() => {
    useAppStore.getState().clearWave();
    useAppStore.setState({ radioMode: false, radioSeedTrack: null, radioSkipCount: 0 });
  }, []);

  const pauseWave = useCallback(() => {
    useAppStore.getState().togglePlay();
  }, []);

  /* ────────────────────────────────────────────────────────────────────
   * Steering (§17, §18) — live, immediate influence
   * ──────────────────────────────────────────────────────────────────── */
  const moreLikeThis = useCallback((track?: MQTrack) => {
    const t = track || useAppStore.getState().currentTrack;
    if (!t) return;
    useAppStore.getState().waveMoreLikeThis(t);
    // Refill soon with the boost context so the next picks lean closer.
    waveRuntime.lastFetch = Math.min(waveRuntime.lastFetch, Date.now() - WAVE_CONFIG.queue.refillThrottleMs + 2000);
  }, []);

  const lessLikeThis = useCallback((track?: MQTrack) => {
    const t = track || useAppStore.getState().currentTrack;
    if (!t) return;
    useAppStore.getState().waveLessLikeThis(t);
    waveRuntime.lastFetch = Math.min(waveRuntime.lastFetch, Date.now() - WAVE_CONFIG.queue.refillThrottleMs + 2000);
  }, []);

  /* ────────────────────────────────────────────────────────────────────
   * Skip / like / dislike
   * ──────────────────────────────────────────────────────────────────── */
  const skipTrack = useCallback(async () => {
    const s = useAppStore.getState();
    if (s.currentTrack) {
      // recordSkip (store) also emits the wave session event (§4 depth-aware).
      s.recordSkip(s.currentTrack.id, s.progress);
    }

    const state = useAppStore.getState();
    const remainingInQueue = state.queue.length - state.queueIndex - 1;

    if (remainingInQueue > 0) {
      nextTrack();
      return;
    }

    // Playback queue exhausted — pull the next wave item directly.
    useAppStore.getState().setWaveLoading(true);
    try {
      let tracks = await fetchWaveTracks(WAVE_CONFIG.queue.batchSize, state.waveSession?.seed || null);
      if (tracks.length === 0) {
        useAppStore.getState().setWaveError("Не удалось найти новые треки. Попробуйте позже.");
        return;
      }
      const existing = new Set(useAppStore.getState().queue.map((t) => t.id));
      const fresh = tracks.filter((t) => !existing.has(t.id));
      if (fresh.length === 0) {
        useAppStore.getState().setWaveError("Не удалось найти новые треки. Попробуйте позже.");
        return;
      }
      useAppStore.getState().enqueueWaveTracks(
        fresh.map((t) => toQueueItem(t, "taste_profile")),
      );
      useAppStore.setState({ queue: [...useAppStore.getState().queue, ...fresh] });
      nextTrack();
    } catch {
      useAppStore.getState().setWaveError("Ошибка загрузки следующих треков.");
    } finally {
      useAppStore.getState().setWaveLoading(false);
    }
  }, [nextTrack, fetchWaveTracks]);

  const likeTrack = useCallback(() => {
    const s = useAppStore.getState();
    const t = s.currentTrack;
    if (!t) return;
    s.toggleLike(t.id, t);
    // Wave likes are positive session signals (§4).
    const liked = useAppStore.getState().isTrackLiked(t.id);
    if (liked) {
      s.pushWaveEvent({
        type: "track_liked",
        trackId: t.id,
        scTrackId: t.scTrackId,
        title: t.title,
        artist: t.artist,
        genre: t.genre,
        at: Date.now(),
      });
    }
  }, []);

  const dislikeTrack = useCallback(() => {
    const s = useAppStore.getState();
    const t = s.currentTrack;
    if (!t) return;
    s.toggleDislike(t.id, t);
    s.pushWaveEvent({
      type: "not_interested",
      trackId: t.id,
      scTrackId: t.scTrackId,
      title: t.title,
      artist: t.artist,
      genre: t.genre,
      at: Date.now(),
    });
  }, []);

  /* ────────────────────────────────────────────────────────────────────
   * Auto-refill (§12): keep the logical wave queue stocked; append the
   * delta to the playback queue so the store pipeline flows.
   * ──────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!radioMode || !waveSession || !currentTrack) return;
    if (!needsRefill(waveQueue, WAVE_CONFIG)) return;

    const now = Date.now();
    if (now - waveRuntime.lastFetch < WAVE_CONFIG.queue.refillThrottleMs) return;
    if (waveRuntime.inflight) return;
    waveRuntime.lastFetch = now;

    fetchWaveTracks(WAVE_CONFIG.queue.batchSize, waveSession.seed)
      .then((tracks) => {
        if (tracks.length === 0) return;
        const s = useAppStore.getState();
        const existing = new Set(s.queue.map((t) => t.id));
        const fresh = tracks.filter((t) => !existing.has(t.id));
        if (fresh.length === 0) return;
        s.enqueueWaveTracks(
          fresh.map((t) => toQueueItem(t, "taste_profile")),
        );
        useAppStore.setState({ queue: [...useAppStore.getState().queue, ...fresh] });
        const st = useAppStore.getState();
        if (st.waveSession) {
          useAppStore.setState({
            waveSession: { ...st.waveSession, stats: { ...st.waveSession.stats, refills: st.waveSession.stats.refills + 1 } },
          });
        }
      })
      .catch(() => {
        // Silent — auto-refill is best-effort.
      });
  }, [radioMode, waveSession, currentTrack, waveQueue, fetchWaveTracks]);

  /* ────────────────────────────────────────────────────────────────────
   * Wave queue ↔ playback sync: when the current track is the logical
   * head, consume it (records memory); if it appears deeper in the wave
   * queue (user jumped), drop it from the preview.
   * ──────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!waveSession || !currentTrack) return;
    const head = waveQueue[0];
    if (!head) return;
    if (head.track.id === currentTrack.id) {
      useAppStore.getState().consumeWaveItem();
    } else {
      const deeper = waveQueue.findIndex((q) => q.track.id === currentTrack.id);
      if (deeper > 0) {
        useAppStore.getState().removeWaveItems([currentTrack.id]);
      }
    }
  }, [waveSession, currentTrack, waveQueue]);

  /* ────────────────────────────────────────────────────────────────────
   * play_started / track_replayed events (§4) — single source: track change.
   * ──────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!waveSession || !currentTrack) return;
    const prev = waveRuntime.lastTrack;
    if (prev?.trackId === currentTrack.id) return;

    const replay = isReplay(
      currentTrack.id,
      prev ? { trackId: prev.trackId, endedAt: prev.startedAt, completed: false } : null,
      Date.now(),
    );
    useAppStore.getState().pushWaveEvent({
      type: replay ? "track_replayed" : "play_started",
      trackId: currentTrack.id,
      scTrackId: currentTrack.scTrackId,
      title: currentTrack.title,
      artist: currentTrack.artist,
      genre: currentTrack.genre,
      at: Date.now(),
    });
    waveRuntime.lastTrack = { trackId: currentTrack.id, startedAt: Date.now() };
  }, [waveSession, currentTrack]);

  /* ────────────────────────────────────────────────────────────────────
   * Feedback shipper (§29): flush unsent session events to the server,
   * throttled. Failures are silent — the client profile still works.
   * ──────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!waveSession) return;
    const unsent = waveSessionEvents.length - waveRuntime.sentEvents;
    if (unsent <= 0) return;
    if (waveRuntime.flushTimer) return;

    waveRuntime.flushTimer = setTimeout(async () => {
      waveRuntime.flushTimer = null;
      const events = useAppStore.getState().waveSessionEvents;
      const batch = events.slice(waveRuntime.sentEvents);
      waveRuntime.sentEvents = events.length;
      const anonId = getAnonId();
      for (const ev of batch.slice(-10)) {
        try {
          await fetch("/api/wave/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              anonId,
              sessionId: useAppStore.getState().waveSession?.id,
              event: ev.type,
              trackId: ev.trackId,
              scTrackId: ev.scTrackId,
              title: ev.title,
              artist: ev.artist,
              genre: ev.genre,
              position: ev.position,
              duration: ev.duration,
              at: ev.at,
            }),
          });
        } catch {
          // best-effort
        }
      }
    }, 3500);
  }, [waveSession, waveSessionEvents]);

  /* ────────────────────────────────────────────────────────────────────
   * Auto-stop when everything is empty (kept from v1).
   * ──────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (radioMode && !currentTrack && queue.length === 0 && waveQueue.length === 0) {
      const timer = setTimeout(() => {
        const s = useAppStore.getState();
        if (s.radioMode && !s.currentTrack && s.queue.length === 0) {
          useAppStore.setState({ radioMode: false, radioSeedTrack: null, radioSkipCount: 0 });
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [radioMode, currentTrack, queue, waveQueue]);

  /* ── Public preview of the next wave items (Wave UI source, §14) ── */
  const nextUpPreview: WaveQueueItem<MQTrack>[] = waveQueue.slice(0, 5);
  const currentReason: string | null = currentTrack
    ? (currentTrack as MQTrack & { _reason?: string })._reason || null
    : null;

  return {
    // v1-compatible surface
    waveLoading: loading,
    waveError,
    radioMode,
    startWave,
    startWaveFromCurrentTrack,
    stopWave,
    pauseWave,
    skipTrack,
    dislikeTrack,
    likeTrack,
    // v2 additions
    startWaveWithSeed,
    startWaveFromArtist,
    moreLikeThis,
    lessLikeThis,
    waveSession,
    nextUpPreview,
    currentReason,
    waveQueueLength: waveQueue.length,
  };
}

// Re-export for typing convenience of consumers.
export type { WaveSeed, WaveQueueItem, WaveEvent };
