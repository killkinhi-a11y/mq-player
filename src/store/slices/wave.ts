// Store slice: MQ Wave / radio mode engine state.
// Actions moved verbatim from useAppStore.ts (Stage III); see docs/ARCHITECTURE.md.
import type { StoreSlice } from "@/store/types";

export type WaveSliceKeys =
  | "toggleRadioMode"
  | "startWaveSession"
  | "enqueueWaveTracks"
  | "consumeWaveItem"
  | "removeWaveItems"
  | "clearWave"
  | "pushWaveEvent"
  | "markWaveTracksServed"
  | "waveMoreLikeThis"
  | "waveLessLikeThis"
  | "setWaveLoading"
  | "setWaveError";

/** MQ Wave / radio mode engine state. */
export const createWaveSlice: StoreSlice<WaveSliceKeys> = (set, get) => ({

      // ── Radio mode actions ──
      toggleRadioMode: () => {
        const { currentTrack, radioMode } = get();
        if (radioMode) {
          // Stop radio
          set({ radioMode: false, radioSeedTrack: null, radioSkipCount: 0 });
        } else if (currentTrack) {
          // Start radio from current track
          set({ radioMode: true, radioSeedTrack: currentTrack, radioSkipCount: 0 });
        }
      },

      // ── MQ Wave actions (lib/wave engine, §12–§18) ──
      startWaveSession: (seed) => {
        const id = `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        const prev = get().waveSession;
        set({
          waveSession: {
            id,
            seed,
            startedAt: Date.now(),
            stats: {
              started: (prev?.stats.started || 0) + 1,
              skipped: 0,
              completed: 0,
              liked: 0,
              refills: 0,
              moreLikeThis: 0,
              lessLikeThis: 0,
            },
          },
          waveError: null,
        });
        return id;
      },

      enqueueWaveTracks: (batch) => {
        if (!Array.isArray(batch) || batch.length === 0) return;
        const { waveQueue } = get();
        const MAX_WAVE_QUEUE = 40;
        const VALID_REASONS = new Set([
          "similar_track", "similar_artist", "favorite_artist", "favorite_genre",
          "recent_listening", "taste_profile", "exploration",
        ]);
        const existing = new Set(waveQueue.map((q) => q.track.id));
        const additions = batch
          .filter((b) => b?.track && !existing.has(b.track.id))
          .map((b) => ({
            track: b.track,
            reason: (VALID_REASONS.has(b.reason) ? b.reason : "taste_profile") as import("@/lib/wave").WaveReason,
            seedRef: b.seedRef,
            debug: b.debug,
            enqueuedAt: Date.now(),
          }));
        set({ waveQueue: [...waveQueue, ...additions].slice(0, MAX_WAVE_QUEUE) });
      },

      consumeWaveItem: () => {
        const { waveQueue, waveMemory, waveSession } = get();
        if (waveQueue.length === 0) return null;
        const [item, ...rest] = waveQueue;
        // Remember in wave memory (fatigue input, §21) — bounded via lib.
        const artistKey = (item.track.artist || "").toLowerCase().trim();
        const genreKey = (item.track.genre || "").toLowerCase().trim();
        const nextMemory = {
          ...waveMemory,
          tracks: [{ value: item.track.id, at: Date.now() }, ...waveMemory.tracks].slice(0, 150),
          artists: artistKey
            ? [{ value: artistKey, at: Date.now() }, ...waveMemory.artists.filter((e) => e.value !== artistKey)].slice(0, 60)
            : waveMemory.artists,
          genres: genreKey
            ? [{ value: genreKey, at: Date.now() }, ...waveMemory.genres.filter((e) => e.value !== genreKey)].slice(0, 40)
            : waveMemory.genres,
          playedCount: waveMemory.playedCount + 1,
        };
        set({
          waveQueue: rest,
          waveMemory: nextMemory,
          waveSession: waveSession
            ? { ...waveSession, stats: { ...waveSession.stats, started: waveSession.stats.started + 1 } }
            : waveSession,
        });
        return item;
      },

      removeWaveItems: (ids) => {
        if (!Array.isArray(ids) || ids.length === 0) return;
        const drop = new Set(ids);
        set((s) => ({ waveQueue: s.waveQueue.filter((q) => !drop.has(q.track.id)) }));
      },

      clearWave: () => {
        set({
          waveSession: null,
          waveQueue: [],
          waveSessionEvents: [],
          waveMemory: { tracks: [], artists: [], genres: [], seeds: [], playedCount: 0 },
          waveLoading: false,
          waveError: null,
        });
      },

      pushWaveEvent: (event) => {
        set((s) => {
          const MAX_EVENTS = 120;
          const events = [...s.waveSessionEvents, event].slice(-MAX_EVENTS);
          // Session stats keep in sync with real events only.
          const stats = s.waveSession ? { ...s.waveSession.stats } : null;
          if (stats) {
            if (event.type === "track_skipped") stats.skipped += 1;
            if (event.type === "play_completed") stats.completed += 1;
            if (event.type === "track_liked") stats.liked += 1;
            if (event.type === "more_like_this") stats.moreLikeThis += 1;
            if (event.type === "less_like_this") stats.lessLikeThis += 1;
          }
          return {
            waveSessionEvents: events,
            waveSession: s.waveSession ? { ...s.waveSession, stats: stats! } : s.waveSession,
          };
        });
      },

      markWaveTracksServed: (tracks) => {
        if (!Array.isArray(tracks) || tracks.length === 0) return;
        const { waveMemory } = get();
        const now = Date.now();
        const newIds = tracks
          .map((t) => t?.id)
          .filter((id) => id && !waveMemory.tracks.some((e) => e.value === id));
        if (newIds.length === 0) return;
        set({
          waveMemory: {
            ...waveMemory,
            tracks: [...newIds.map((id) => ({ value: id as string, at: now })), ...waveMemory.tracks].slice(0, 150),
          },
        });
      },

      waveMoreLikeThis: (track) => {
        get().pushWaveEvent({
          type: "more_like_this",
          trackId: track.id,
          scTrackId: track.scTrackId,
          title: track.title,
          artist: track.artist,
          genre: track.genre,
          album: track.album,
          at: Date.now(),
        });
      },

      waveLessLikeThis: (track) => {
        get().pushWaveEvent({
          type: "less_like_this",
          trackId: track.id,
          scTrackId: track.scTrackId,
          title: track.title,
          artist: track.artist,
          genre: track.genre,
          album: track.album,
          at: Date.now(),
        });
      },

      setWaveLoading: (loading) => set({ waveLoading: loading }),
      setWaveError: (error) => set({ waveError: error }),
});

