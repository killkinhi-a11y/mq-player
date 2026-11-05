// Store slice: Listening feedback, skip intelligence, taste profile.
// Actions moved verbatim from useAppStore.ts (Stage III); see docs/ARCHITECTURE.md.
import type { StoreSlice } from "@/store/types";
import { appendSkipEvent, buildSkipEvent, buildSkipProfile } from "@/lib/listening/skipIntelligence";
import { canPollProtected } from "@/lib/authGate";

export type TasteSliceKeys =
  | "recordListeningEvent"
  | "recordSkipFromTransition"
  | "recordSkip"
  | "recordComplete"
  | "syncFeedbackToServer"
  | "setTasteGenre"
  | "setTasteArtist"
  | "setTasteMood"
  | "toggleExcludedArtist"
  | "resetTasteProfile";

/** Listening feedback, skip intelligence, taste profile. */
export const createTasteSlice: StoreSlice<TasteSliceKeys> = (set, get) => ({

      // ── V3 §24: listening events for ALL plays (not just wave sessions) ──
      recordListeningEvent: (kind, playedSeconds) => {
        const st = get();
        const t = st.currentTrack;
        if (!t) return;
        const played = typeof playedSeconds === "number"
          ? playedSeconds
          : st.progress || 0;
        // §25: honest signal floors — <1s taps are noise, not taste.
        if (kind === "skip" && played < 1) return;
        const event = buildSkipEvent({
          track: t,
          playedSeconds: played,
          duration: st.duration || t.duration || 0,
          kind,
        });
        const events = appendSkipEvent(event);
        set({ listeningEvents: events, skipProfile: buildSkipProfile(events) });
      },

      // ── V3 §24: user-initiated Next/Prev/new-track — the skip signal ──
      recordSkipFromTransition: () => {
        const st = get();
        const t = st.currentTrack;
        if (!t || !st.isPlaying) return;
        const dur = st.duration || t.duration || 0;
        const pos = st.progress || 0;
        // Near-natural completion (≥90%): the engine records `complete`
        // separately — double-counting a skip here would poison the profile.
        if (dur > 0 && pos / dur >= 0.9) return;
        if (pos < 1) return; // instant tap-through — no measurable signal
        get().recordListeningEvent("skip", pos);
      },

      // ── Feedback actions ──
      recordSkip: (trackId: string, progressAtSkip?: number) => {
        set((s) => {
          const fb = { ...s.trackFeedback };
          const existing = fb[trackId] || { skips: 0, completes: 0, listenTime: 0, totalListenTime: 0, lastPlayedAt: 0, skipPositions: [] };
          const skipPos = typeof progressAtSkip === "number" ? progressAtSkip : 0;
          const skipPositions = [...(existing.skipPositions || []), skipPos].slice(-10);
          fb[trackId] = { ...existing, skips: existing.skips + 1, lastPlayedAt: Date.now(), skipPositions };

          // Accumulate for server sync
          const batch = { ...s.feedbackBatch };
          const historyEntry = (Array.isArray(s.history) ? s.history : []).find(h => h.track.id === trackId);
          const likedEntry = (Array.isArray(s.likedTracksData) ? s.likedTracksData : []).find(t => t.id === trackId);
          const trackData = historyEntry?.track || likedEntry;
          const skipGenre = (trackData?.genre || "").toLowerCase().trim();
          const skipArtist = (trackData?.artist || "").toLowerCase().trim();
          if (skipGenre) {
            batch.skippedGenres = [...batch.skippedGenres, skipGenre];
          }
          if (skipArtist) {
            batch.skippedArtists = [...batch.skippedArtists, skipArtist];
          }
          batch.pendingCount++;

          return { trackFeedback: fb, radioSkipCount: s.radioMode ? s.radioSkipCount + 1 : 0, feedbackBatch: batch };
        });

        // MQ Wave (§11): emit a normalized wave event when a wave session is
        // active — real-time session-taste reaction to skips.
        const st = get();
        // V3 §24: the same skip flows into the GLOBAL event log — skip
        // intelligence works for ALL plays, not just wave sessions.
        if (st.currentTrack?.id === trackId && typeof progressAtSkip === "number" && progressAtSkip >= 1) {
          try { get().recordListeningEvent("skip", progressAtSkip); } catch {}
        }
        if (st.waveSession) {
          const trackData = st.currentTrack?.id === trackId ? st.currentTrack : undefined;
          st.pushWaveEvent({
            type: "track_skipped",
            trackId,
            scTrackId: trackData?.scTrackId,
            title: trackData?.title,
            artist: trackData?.artist,
            genre: trackData?.genre,
            position: typeof progressAtSkip === "number" ? progressAtSkip : undefined,
            duration: trackData?.duration || st.duration || undefined,
            at: Date.now(),
          });
        }

        // Auto-sync when batch reaches 10 pending items
        const st2 = get();
        if (st2.feedbackBatch.pendingCount >= 10) {
          get().syncFeedbackToServer();
        }
      },

      recordComplete: (trackId: string, listenTime: number) => {
        set((s) => {
          const fb = { ...s.trackFeedback };
          const existing = fb[trackId] || { skips: 0, completes: 0, listenTime: 0, totalListenTime: 0, lastPlayedAt: 0, skipPositions: [] };
          fb[trackId] = {
            ...existing,
            completes: existing.completes + 1,
            listenTime,
            totalListenTime: (existing.totalListenTime || 0) + listenTime,
            lastPlayedAt: Date.now(),
          };

          // Accumulate for server sync
          const batch = { ...s.feedbackBatch };
          const historyEntry = (Array.isArray(s.history) ? s.history : []).find(h => h.track.id === trackId);
          const likedEntry = (Array.isArray(s.likedTracksData) ? s.likedTracksData : []).find(t => t.id === trackId);
          const trackData = historyEntry?.track || likedEntry;
          const completeGenre = (trackData?.genre || "").toLowerCase().trim();
          const completeArtist = (trackData?.artist || "").toLowerCase().trim();
          if (completeGenre) {
            batch.completedGenres = [...batch.completedGenres, completeGenre];
            batch.genreListenTimes = { ...batch.genreListenTimes, [completeGenre]: (batch.genreListenTimes[completeGenre] || 0) + listenTime };
          }
          if (completeArtist) {
            batch.completedArtists = [...batch.completedArtists, completeArtist];
            batch.artistListenTimes = { ...batch.artistListenTimes, [completeArtist]: (batch.artistListenTimes[completeArtist] || 0) + listenTime };
          }
          batch.pendingCount++;

          return { trackFeedback: fb, feedbackBatch: batch };
        });

        // MQ Wave (§11): emit play_completed into the wave session log.
        const stW = get();
        // V3 §24: completion is a GLOBAL positive event (§25: +0.5).
        if (stW.currentTrack?.id === trackId) {
          try { get().recordListeningEvent("complete", listenTime); } catch {}
        }
        if (stW.waveSession) {
          const trackData = stW.currentTrack?.id === trackId ? stW.currentTrack : undefined;
          stW.pushWaveEvent({
            type: "play_completed",
            trackId,
            scTrackId: trackData?.scTrackId,
            title: trackData?.title,
            artist: trackData?.artist,
            genre: trackData?.genre,
            position: listenTime,
            duration: trackData?.duration || undefined,
            at: Date.now(),
          });
        }

        // Auto-sync when batch reaches 10 pending items
        const st2 = get();
        if (st2.feedbackBatch.pendingCount >= 10) {
          get().syncFeedbackToServer();
        }
      },

      syncFeedbackToServer: async () => {
        const st = get();
        if (st.feedbackBatch.pendingCount === 0) return;
        if (Date.now() - st.feedbackBatch.lastSync < 30000) return; // 30s debounce
        // Phase 2C: only real authenticated sessions sync feedback.
        if (!canPollProtected(st.userId, st.isAuthenticated)) return;

        try {
          let anonId = '';
          if (typeof window !== 'undefined') {
            anonId = localStorage.getItem('mq_anon_id') || '';
            if (!anonId) {
              anonId = crypto.randomUUID();
              localStorage.setItem('mq_anon_id', anonId);
            }
          }

          const res = await fetch('/api/music/recommendations/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              anonId,
              ...st.feedbackBatch,
            }),
          });

          if (res.ok) {
            set({
              feedbackBatch: {
                completedGenres: [],
                skippedGenres: [],
                completedArtists: [],
                skippedArtists: [],
                genreListenTimes: {},
                artistListenTimes: {},
                lastSync: Date.now(),
                pendingCount: 0,
              },
            });
          }
        } catch (e) {
          console.error('[feedback] Sync failed:', e);
        }
      },

      // ── Taste Profile actions ──
      setTasteGenre: (genre, level) => set((s) => {
        const newGenres = { ...s.tasteGenres, [genre]: level };
        // Sync with dislikedTags
        const currentDisliked = s.dislikedTags.filter(g => g.toLowerCase() !== genre.toLowerCase());
        if (level < 10 && !currentDisliked.includes(genre)) {
          currentDisliked.push(genre);
        }
        if (level > 70) {
          const idx = currentDisliked.findIndex(g => g.toLowerCase() === genre.toLowerCase());
          if (idx >= 0) currentDisliked.splice(idx, 1);
        }
        return { tasteGenres: newGenres, dislikedTags: currentDisliked };
      }),
      setTasteArtist: (artist, level) => set((s) => ({ tasteArtists: { ...s.tasteArtists, [artist]: level } })),
      setTasteMood: (mood, level) => set((s) => ({ tasteMoods: { ...s.tasteMoods, [mood]: level } })),
      toggleExcludedArtist: (artist) => set((s) => {
        const isExcluded = s.excludedArtists.includes(artist);
        return {
          excludedArtists: isExcluded
            ? s.excludedArtists.filter(a => a !== artist)
            : [...s.excludedArtists, artist],
          tasteArtists: { ...s.tasteArtists, [artist]: isExcluded ? 50 : 0 },
        };
      }),
      resetTasteProfile: () => set({ tasteGenres: {}, tasteArtists: {}, tasteMoods: {}, excludedArtists: [] }),
});

