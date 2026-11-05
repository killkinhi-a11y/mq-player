// Store slice: User queue + UpNext, shuffle/repeat modes, smart queue refill.
// Actions moved verbatim from useAppStore.ts (Stage III); see docs/ARCHITECTURE.md.
import type { StoreSlice } from "@/store/types";
import type { Track } from "@/lib/musicApi";
import { skipScoreAdjustment } from "@/lib/listening/skipIntelligence";

export type QueueSliceKeys =
  | "addToUpNext"
  | "addToUpNextMultiple"
  | "removeFromUpNext"
  | "moveInUpNext"
  | "clearUpNext"
  | "moveInQueue"
  | "toggleShuffle"
  | "toggleRepeat"
  | "setPlaybackMode"
  | "peekNextTrack"
  | "toggleSmartShuffle"
  | "refillQueueSmart"
  | "toggleSmartQueueAutoplay";

/** User queue + UpNext, shuffle/repeat modes, smart queue refill. */
export const createQueueSlice: StoreSlice<QueueSliceKeys> = (set, get) => ({

      // ── UpNext actions ──
      addToUpNext: (track) => set((s) => ({ upNext: [...s.upNext, track] })),

      addToUpNextMultiple: (tracks) => set((s) => ({ upNext: [...s.upNext, ...tracks] })),

      removeFromUpNext: (index) => set((s) => ({
        upNext: s.upNext.filter((_, i) => i !== index),
      })),

      moveInUpNext: (fromIndex, toIndex) => set((s) => {
        const updated = [...s.upNext];
        const [moved] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, moved);
        return { upNext: updated };
      }),

      clearUpNext: () => set({ upNext: [] as Track[] }),

      moveInQueue: (fromIndex, toIndex) => set((s) => {
        const updated = [...s.queue];
        const [moved] = updated.splice(fromIndex, 1);
        updated.splice(toIndex, 0, moved);
        // Adjust queueIndex if it was affected by the move
        let newIndex = s.queueIndex;
        if (fromIndex === s.queueIndex) {
          newIndex = toIndex;
        } else if (fromIndex < s.queueIndex && toIndex >= s.queueIndex) {
          newIndex = s.queueIndex - 1;
        } else if (fromIndex > s.queueIndex && toIndex <= s.queueIndex) {
          newIndex = s.queueIndex + 1;
        }
        return { queue: updated, queueIndex: newIndex };
      }),

      toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),

      toggleRepeat: () =>
        set((s) => ({
          repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off",
        })),

      setPlaybackMode: (mode) => set({ playbackMode: mode }),

      /**
       * Peek at what the next track would be without changing any state.
       * Used by the gapless preloader to know which track to preload.
       * Returns null if there is no next track or if repeat is "one".
       */
      peekNextTrack: () => {
        const { queue, queueIndex, shuffle, repeat, upNext, currentTrack } = get();

        // Don't preload if repeat is "one" — same track will loop
        if (repeat === "one") return null;

        // UpNext priority: first item in upNext
        if (upNext.length > 0) {
          return upNext[0];
        }

        // No next track if queue is empty or only has one track
        if (queue.length <= 1 && repeat === "off") return null;

        if (shuffle) {
          // For shuffle mode, we can't reliably determine the next track
          // (it's random), so we don't preload in shuffle mode.
          return null;
        }

        // Normal order: next index
        let nextIdx = queueIndex + 1;
        if (nextIdx >= queue.length) {
          if (repeat === "all") {
            nextIdx = 0;
          } else {
            return null; // End of queue, no repeat
          }
        }

        return queue[nextIdx] || null;
      },

      // ── Smart Shuffle actions ──
      toggleSmartShuffle: () => set((s) => ({ smartShuffle: !s.smartShuffle })),

      // ── V3 §27: smart queue — taste-aware continuation at queue end ──
      refillQueueSmart: async () => {
        const st = get();
        const currentT = st.currentTrack;
        if (!currentT) return;
        // Seed: the current track when it has an SC id, else the most
        // recent history entry that does (radio seeds on soundcloud ids).
        const seed = currentT.scTrackId
          ? currentT
          : [...(Array.isArray(st.history) ? st.history : [])].map((h) => h.track).find((t) => t?.scTrackId);
        if (!seed?.scTrackId) return; // no seed — honest stop (e.g. Spotify Official session)

        const params = new URLSearchParams({ scTrackId: String(seed.scTrackId) });
        const playedScIds = [
          ...st.history.map((h) => h.track.scTrackId).filter((id): id is number => !!id),
          ...st.queue.map((t) => t.scTrackId).filter((id): id is number => !!id),
        ];
        const uniquePlayed = [...new Set(playedScIds)].slice(0, 80).join(",");
        if (uniquePlayed) params.set("historyScIds", uniquePlayed);

        // §26: skip signals from the NEW event model (decayed, channelled).
        const profile = st.skipProfile;
        const skippedArtists = Object.entries(profile.artists)
          .filter(([, v]) => v < -0.25).map(([a]) => a).slice(0, 8);
        if (skippedArtists.length) params.set("skippedArtists", skippedArtists.join(","));
        const skippedGenres = Object.entries(profile.genres)
          .filter(([, v]) => v < -0.25).map(([g]) => g).slice(0, 5);
        if (skippedGenres.length) params.set("skippedGenres", skippedGenres.join(","));
        const likedArtists = Object.entries(profile.artists)
          .filter(([, v]) => v > 0.2).map(([a]) => a).slice(0, 5);
        if (likedArtists.length) params.set("likedArtists", likedArtists.join(","));
        const likedGenres = Object.entries(profile.genres)
          .filter(([, v]) => v > 0.2).map(([g]) => g).slice(0, 5);
        if (likedGenres.length) params.set("likedGenres", likedGenres.join(","));

        try {
          const res = await fetch(`/api/music/radio?${params}`);
          if (!res.ok) return;
          const data = await res.json();
          if (!data?.tracks?.length) return;
          const state = get();
          const safeQueue = Array.isArray(state.queue) ? state.queue : [];
          const existingIds = new Set(safeQueue.map((t) => t.id));
          const dislikedIdsSet = new Set(state.dislikedTrackIds);
          const dislikedArtistsSet = new Set(state.dislikedTracksData.map((t) => (t.artist || "").toLowerCase().trim()).filter(Boolean));

          // Recent-artist frequency map (queue + history) for diversity.
          const recentArtists = new Map<string, number>();
          for (const t of safeQueue) {
            const a = (t.artist || "").toLowerCase().trim();
            if (a) recentArtists.set(a, (recentArtists.get(a) || 0) + 1);
          }
          for (const h of (Array.isArray(state.history) ? state.history : []).slice(0, 20)) {
            const a = (h.track.artist || "").toLowerCase().trim();
            if (a) recentArtists.set(a, (recentArtists.get(a) || 0) + 1);
          }

          // §27 ranking: radio candidates × skip-profile adjustment
          // (familiarity + discovery + diversity). A/B/C skipped → a
          // near-identical D ranks LOW even if the radio offered it.
          const ranked = (data.tracks as Track[])
            .filter((t) => t && !existingIds.has(t.id) && !dislikedIdsSet.has(t.id)
              && !(t.artist && dislikedArtistsSet.has(t.artist.toLowerCase().trim())))
            .map((t) => {
              const a = (t.artist || "").toLowerCase().trim();
              const diversityPenalty = a ? Math.min(6, (recentArtists.get(a) || 0) * 2) : 0;
              const adj = skipScoreAdjustment(t, profile, { discovery: 0.35 });
              return { t, score: adj - diversityPenalty + Math.random() * 0.5 };
            })
            .sort((x, y) => y.score - x.score)
            .slice(0, 12)
            .map((x) => x.t);

          if (ranked.length === 0) return;
          const after = get();
          const nextQueue = [...(Array.isArray(after.queue) ? after.queue : []), ...ranked];
          // Auto-resume: if we stopped at the queue end, advance into the fresh tail.
          const atEnd = after.queueIndex >= after.queue.length - 1 && !after.isPlaying;
          set({ queue: nextQueue });
          if (atEnd) {
            const first = nextQueue[after.queueIndex + 1];
            if (first) {
              set({
                currentTrack: first,
                queueIndex: after.queueIndex + 1,
                progress: 0,
                duration: first.duration,
                isPlaying: true,
              });
              get().addToHistory(first);
            }
          }
        } catch { /* honest stop — network unavailable */ }
      },

      toggleSmartQueueAutoplay: () => set((s) => ({ smartQueueAutoplay: !s.smartQueueAutoplay })),
});

