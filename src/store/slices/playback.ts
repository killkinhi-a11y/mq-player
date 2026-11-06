// Store slice: Current track lifecycle: play/pause/next/prev, volume, progress, source picking, A-B repeat, rate.
// Actions moved verbatim from useAppStore.ts (Stage III); see docs/ARCHITECTURE.md.
import { type CatalogTrackInput, buildPlayableTrack } from "@/lib/playback/client";
import type { StoreSlice } from "@/store/types";
import type { Track } from "@/lib/musicApi";
import { consumeUpNext, nextIndex, previousAction } from "@/lib/core/queue";
import { setAudioPlaybackRate as engineSetAudioPlaybackRate, getAudioElement, resumeAudioContext } from "@/lib/audioEngine";
import { estimateTrackEnergy, rememberLastVolume } from "@/store/internal/helpers";
import { pbStart } from "@/lib/playbackTimeline";
import { toast } from "@/hooks/use-toast";

export type PlaybackSliceKeys =
  | "playTrack"
  | "togglePlay"
  | "setVolume"
  | "setProgress"
  | "setDuration"
  | "nextTrack"
  | "prevTrack"
  | "dismissLowConfidencePick"
  | "confirmSourcePick"
  | "switchPlaybackSource"
  | "openSourceSwitcher"
  | "closeSourceSwitcher"
  | "syncWithPlaybackEngine"
  | "restorePlayback"
  | "setAbRepeatPoint"
  | "clearAbRepeat"
  | "setPlaybackRate";

/** Current track lifecycle: play/pause/next/prev, volume, progress, source picking, A-B repeat, rate. */
export const createPlaybackSlice: StoreSlice<PlaybackSliceKeys> = (set, get) => ({

      playTrack: (track, queue, playlistId) => {
        const state = get();

        // Same-track resume path (QA fix 2026-09-09, playlist hero/row dead click):
        // when the requested track IS the current one and it has finished loading
        // (not buffering), treat the call as a resume request — toggle isPlaying on
        // when paused, no-op when already playing. Previously this fell into the
        // _playLock guard below; on the WASM path no `canplay` ever fires, so the
        // lock never released and the click did NOTHING (hero «Слушать» and the
        // current row were dead after a pause). Restart semantics (progress 0,
        // history re-entry) stay reserved for a genuinely different track.
        if (
          state.currentTrack?.id === track.id &&
          !state.isBuffering &&
          state.playbackState !== "loading"
        ) {
          if (!state.isPlaying) get().togglePlay();
          return;
        }

        // Play lock — prevents race condition when playTrack is called
        // while previous track is still loading. Without this, rapid taps
        // cause currentTrack to flip back and forth.
        if (state._playLock && state.currentTrack?.id === track.id) return;

        // V3 §24: switching away from a mid-play track IS a skip signal —
        // record it for the track being left (unless near completion).
        if (
          state.currentTrack &&
          state.currentTrack.id !== track.id &&
          state.isPlaying &&
          state.progress > 1
        ) {
          const dur = state.duration || state.currentTrack.duration || 0;
          if (!(dur > 0 && state.progress / dur >= 0.9)) {
            try { get().recordListeningEvent("skip", state.progress); } catch {}
          }
        }
        // V3 §25: replay — the same track restarted right after finishing.
        if (
          state.currentTrack?.id === track.id &&
          !state.isPlaying &&
          state.duration > 0 &&
          state.progress >= state.duration * 0.99
        ) {
          try { get().recordListeningEvent("replay", 0); } catch {}
        }

        // T0 — real load attempt begins (instrumentation, see playbackTimeline)
        pbStart(track.id, track.title || track.id);

        const newQueue = queue || state.queue;
        const index = newQueue.findIndex((t) => t.id === track.id);

        set({
          currentTrack: track,
          currentPlaylistId: playlistId ?? (queue ? state.currentPlaylistId : null),
          queue: newQueue,
          queueIndex: index >= 0 ? index : 0,
          isPlaying: true,
          progress: 0,
          duration: track.duration,
          playbackState: "loading",
          isBuffering: true,
          _playLock: true,
          miniPlayerHidden: false,
          ...(queue ? { upNext: [] as Track[] } : {}),
          ...(state.sessionStartTime === null ? { sessionStartTime: Date.now() } : {}),
        });
        get().addToHistory(track);
      },

      togglePlay: () => {
        const state = get();
        if (!state.isPlaying) {
          resumeAudioContext();
        }
        // Only flip the isPlaying flag — the isPlaying effect in useAudioEngine
        // is the SINGLE source of truth for calling audio.play()/audio.pause().
        // This eliminates race conditions from double-calling play/pause.
        const willPlay = !state.isPlaying;
        set(s => ({
          isPlaying: willPlay,
          playbackState: willPlay ? 'loading' : 'paused',
          isBuffering: willPlay,
          ...(!s.isPlaying ? { miniPlayerHidden: false } : {}),
        }));
      },

      setVolume: (volume) => {
        // Only update the store — the volume useEffect in useAudioEngine is the
        // single source of truth for actually setting audio.volume.
        // Doing it here AND in the effect caused double-apply and occasional
        // volume flicker when both ran in the same frame.
        const v = Math.round(volume);
        // v10.3: remember the last audible level for mute/unmute restore.
        if (v > 0) rememberLastVolume(v);
        set({ volume: v });
      },

      setProgress: (progress) => {
        // IMPORTANT: Do NOT set audio.currentTime here.
        // Seeking is handled by useProgressDrag → seekToPosition (drag) or
        // playbackEngine.seek() (programmatic seek). Both already set
        // audio.currentTime directly.  Doing it again here causes a double-seek
        // race that makes the progress bar visually jump backward.
        set({ progress });
      },

      setDuration: (duration) => set({ duration }),

      nextTrack: () => {
        // V3 §24: user-initiated Next — record the skip signal for the track
        // being left (honest: only when mid-track, not near completion).
        try { get().recordSkipFromTransition(); } catch {}
        const { queue, queueIndex, shuffle, repeat, upNext, currentTrack, smartShuffle, radioMode, brokenTrackIds } = get();

        // ── UpNext priority: play from upNext first (FIFO) ──
        // Shared rule (consumeUpNext): the upNext item is inserted right after
        // the current one, the rest of upNext stays queued, and the main queue
        // then continues after the old current track. (Previously the whole
        // old queue was appended from index 0, so after upNext playback
        // restarted the queue from its first track.)
        if (upNext.length > 0) {
          const consumed = consumeUpNext(queue, queueIndex, upNext, (t) => brokenTrackIds.has(t.id));
          if (consumed) {
            const next = consumed.track;
            set({
              currentTrack: next,
              queue: consumed.queue,
              queueIndex: consumed.index,
              upNext: consumed.upNext,
              progress: 0,
              duration: next.duration,
              isPlaying: true,
            });
            get().addToHistory(next);
            return;
          }
        }

        let nextIdx: number;
        if (shuffle) {
          if (queue.length <= 1) { nextIdx = 0; }
          else if (smartShuffle && currentTrack) {
            // Smart Shuffle: score each candidate by transition smoothness + likes/dislikes
            const currentEnergy = estimateTrackEnergy(currentTrack);
            const currentGenre = (currentTrack.genre || "").toLowerCase();
            const st = get();

            let bestIdx = -1;
            let bestScore = -Infinity;

            const candidates = Array.from({ length: Math.min(queue.length, 20) }, () =>
              Math.floor(Math.random() * queue.length)
            ).filter(i => i !== queueIndex);

            // Pre-compute disliked/liked artists and genres for performance
            const dislikedArtistsSet = new Set(st.dislikedTracksData.map(t => t.artist.toLowerCase()));
            const dislikedGenresSet = new Set(st.dislikedTracksData.map(t => (t.genre || "").toLowerCase()).filter(Boolean));
            const likedArtistsSet = new Set(st.likedTracksData.map(t => t.artist.toLowerCase()));

            for (const candidateIdx of candidates) {
              const candidate = queue[candidateIdx];
              if (!candidate) continue;

              let score = Math.random() * 10; // base randomness

              // ── Likes/Dislikes signals (strongest factor) ──
              if (st.likedTrackIds.includes(candidate.id)) score += 25;
              if (st.dislikedTrackIds.includes(candidate.id)) score -= 50;
              if (dislikedArtistsSet.has((candidate.artist || "").toLowerCase())) score -= 30;
              if (candidate.genre && dislikedGenresSet.has(candidate.genre.toLowerCase())) score -= 20;
              if (likedArtistsSet.has((candidate.artist || "").toLowerCase())) score += 15;

              // Energy transition penalty (smooth transitions)
              const candidateEnergy = estimateTrackEnergy(candidate);
              const energyDiff = Math.abs(candidateEnergy - currentEnergy);
              score -= energyDiff * 20;

              // Same artist penalty — STRONG to prevent repetition in queues/playlists
              if (candidate.artist === currentTrack.artist) score -= 60;

              // Genre match bonus
              if (candidate.genre && currentGenre &&
                  candidate.genre.toLowerCase() === currentGenre) score += 5;

              if (score > bestScore) {
                bestScore = score;
                bestIdx = candidateIdx;
              }
            }

            nextIdx = bestIdx >= 0 ? bestIdx : Math.floor(Math.random() * queue.length);
          } else {
            // Original random shuffle as fallback
            const currentArtist = currentTrack?.artist;
            if (queue.length <= 1) { nextIdx = 0; }
            else {
              nextIdx = queueIndex;
              for (let attempt = 0; attempt < 10; attempt++) {
                const candidate = Math.floor(Math.random() * queue.length);
                if (candidate !== queueIndex) {
                  if (!currentArtist || queue[candidate]?.artist !== currentArtist) {
                    nextIdx = candidate; break;
                  }
                }
              }
              if (nextIdx === queueIndex) {
                do { nextIdx = Math.floor(Math.random() * queue.length); } while (nextIdx === queueIndex);
              }
            }
          }
        } else {
          nextIdx = queueIndex + 1;
          if (nextIdx >= queue.length) {
            if (repeat === "all") nextIdx = 0;
            // Radio mode — "Моя волна" (Яндекс Music style): auto-fill queue via radio API
            else if (radioMode) {
              const currentT = get().currentTrack;
              const st = get();
              if (currentT?.scTrackId) {
                // Build history of played SC IDs for the radio API — expanded to 80 tracks
                // to prevent repetition across multiple radio batches
                const playedScIds = [
                  ...st.history.map(h => h.track.scTrackId).filter((id): id is number => !!id),
                  ...st.queue.map(t => t.scTrackId).filter((id): id is number => !!id),
                ];
                const uniquePlayedScIds = [...new Set(playedScIds)].slice(0, 80).join(",");
                // Build skipped genres/artists from feedback data
                const fb = st.trackFeedback;
                const skippedIds = Object.entries(fb)
                  .filter(([, v]) => v.skips > v.completes && v.skips >= 2)
                  .map(([id]) => id);
                const skippedArtists = skippedIds.map(id => {
                  const entry = st.history.find(h => h.track.id === id);
                  return entry?.track.artist;
                }).filter(Boolean).slice(0, 5).join(",");

                // ── Include disliked artists from likes/dislikes (user's explicit preference) ──
                const dislikedArtistsFromLikes = st.dislikedTracksData
                  .map(t => t.artist)
                  .filter(Boolean)
                  .slice(0, 10);
                // Combine feedback-skipped + disliked into one list
                const allSkippedArtists = [...new Set([
                  ...skippedArtists.split(",").filter(Boolean),
                  ...dislikedArtistsFromLikes,
                ])].join(",");

                // ── Include disliked genres from likes/dislikes ──
                const dislikedGenresFromLikes = st.dislikedTracksData
                  .map(t => t.genre)
                  .filter(Boolean)
                  .slice(0, 5);
                const skippedGenresParam = st.feedbackBatch.skippedGenres.length > 0
                  ? [...new Set([...st.feedbackBatch.skippedGenres, ...dislikedGenresFromLikes])].join(",")
                  : dislikedGenresFromLikes.join(",");
                
                // ── Include liked artists as positive signals ──
                const likedArtistsFromLikes = st.likedTracksData
                  .map(t => t.artist)
                  .filter(Boolean)
                  .slice(0, 5);

                // ── Include liked genres as positive signals ──
                const likedGenresFromLikes = st.likedTracksData
                  .map(t => t.genre)
                  .filter(Boolean)
                  .slice(0, 5);
                // Also extract genres from history for better signal
                const historyGenres = st.history.slice(0, 30)
                  .map(h => h.track.genre)
                  .filter(Boolean);
                const genreCount: Record<string, number> = {};
                for (const g of historyGenres) genreCount[g] = (genreCount[g] || 0) + 1;
                const topHistoryGenres = Object.entries(genreCount)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([g]) => g);
                const allLikedGenres = [...new Set([...likedGenresFromLikes, ...topHistoryGenres])].join(",");
                
                const params = new URLSearchParams();
                params.set("scTrackId", String(currentT.scTrackId));
                if (uniquePlayedScIds) params.set("historyScIds", uniquePlayedScIds);
                if (allSkippedArtists) params.set("skippedArtists", allSkippedArtists);
                if (skippedGenresParam) params.set("skippedGenres", skippedGenresParam);
                if (likedArtistsFromLikes.length > 0) params.set("likedArtists", likedArtistsFromLikes.join(","));
                if (allLikedGenres) params.set("likedGenres", allLikedGenres);

                // ── Taste Profile: genre/artist/mood sliders from TasteProfileView ──
                const tasteG = st.tasteGenres;
                const tasteGenreEntries = Object.entries(tasteG).filter(([, v]) => v >= 20);
                if (tasteGenreEntries.length > 0) {
                  tasteGenreEntries.sort((a, b) => b[1] - a[1]);
                  const topTasteGenres = tasteGenreEntries.slice(0, 8);
                  params.set("tasteGenres", topTasteGenres.map(([g, v]) => `${g}:${v}`).join(","));
                }

                const tasteA = st.tasteArtists;
                const tasteArtistEntries = Object.entries(tasteA).filter(([, v]) => v >= 20);
                if (tasteArtistEntries.length > 0) {
                  tasteArtistEntries.sort((a, b) => b[1] - a[1]);
                  const topTasteArtists = tasteArtistEntries.slice(0, 5);
                  params.set("tasteArtists", topTasteArtists.map(([a, v]) => `${a}:${v}`).join(","));
                }

                // ── Taste Profile: mood preferences ──
                const tasteM = st.tasteMoods;
                const tasteMoodEntries = Object.entries(tasteM || {}).filter(([, v]) => v >= 30);
                if (tasteMoodEntries.length > 0) {
                  tasteMoodEntries.sort((a, b) => b[1] - a[1]);
                  params.set("tasteMoods", tasteMoodEntries.slice(0, 3).map(([m, v]) => `${m}:${v}`).join(","));
                }

                // ── Session context: listening duration for mood adaptation ──
                const sessionStart = st.sessionStartTime;
                if (sessionStart) {
                  const sessionMinutes = Math.floor((Date.now() - sessionStart) / 60000);
                  if (sessionMinutes > 0) params.set("sessionDuration", String(sessionMinutes));
                }

                // ── Pass disliked track SC IDs for hard exclusion on server ──
                const dislikedScIds = st.dislikedTracksData
                  .map(t => t.scTrackId)
                  .filter((id): id is number => !!id)
                  .slice(0, 50)
                  .join(",");
                if (dislikedScIds) params.set("dislikedScIds", dislikedScIds);

                // ── Include completed genres from feedback (genres user actually finishes) ──
                const completedGenresFromFeedback = st.feedbackBatch.completedGenres.length > 0
                  ? st.feedbackBatch.completedGenres : [];
                // Also derive from trackFeedback: tracks with more completes than skips
                const fbEntries = Object.entries(st.trackFeedback);
                if (fbEntries.length > 0) {
                  const completedFromFB = new Map<string, number>();
                  for (const [trackId, fb] of fbEntries) {
                    if (fb.completes > fb.skips && fb.completes >= 1) {
                      const historyEntry = st.history.find(h => h.track.id === trackId);
                      if (historyEntry?.track.genre) {
                        const g = historyEntry.track.genre.toLowerCase().trim();
                        completedFromFB.set(g, (completedFromFB.get(g) || 0) + 1);
                      }
                    }
                  }
                  for (const [g, count] of completedFromFB) {
                    if (count >= 1) completedGenresFromFeedback.push(g);
                  }
                }
                const uniqueCompletedGenres = [...new Set(completedGenresFromFeedback)].slice(0, 5);
                if (uniqueCompletedGenres.length > 0) params.set("completedGenres", uniqueCompletedGenres.join(","));

                // Detect language from history
                const langCounts: Record<string, number> = { russian: 0, english: 0 };
                for (const h of st.history.slice(0, 20)) {
                  const text = `${h.track.title || ""} ${h.track.artist || ""}`;
                  const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
                  const latin = (text.match(/[a-zA-Z]/g) || []).length;
                  if (cyrillic / (cyrillic + latin + 1) > 0.4) langCounts.russian++;
                  else if (latin / (cyrillic + latin + 1) > 0.6) langCounts.english++;
                }
                const topLang = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
                if (topLang[0]?.[1] > 5) params.set("lang", topLang[0][0]);

                fetch(`/api/music/radio?${params}`)
                  .then(res => res.ok ? res.json() : null)
                  .then(data => {
                    if (!data || !data.tracks || data.tracks.length === 0) return;
                    const newTracks = data.tracks.slice(0, 15);
                    const state = get();
                    const safeQueue = Array.isArray(state.queue) ? state.queue : [];
                    const existingIds = new Set(safeQueue.map(t => t.id));

                    // ── Cross-batch artist dedup ──
                    const recentArtists = new Map<string, number>();
                    for (const t of safeQueue) {
                      const a = (t.artist || "").toLowerCase().trim();
                      if (a) recentArtists.set(a, (recentArtists.get(a) || 0) + 1);
                    }
                    // Weight recent history artists (last 20 tracks)
                    for (const h of (Array.isArray(state.history) ? state.history : []).slice(0, 20)) {
                      const a = (h.track.artist || "").toLowerCase().trim();
                      if (a) recentArtists.set(a, (recentArtists.get(a) || 0) + 1);
                    }
                    // Also count current track's artist (already playing)
                    if (currentT?.artist) {
                      const curA = currentT.artist.toLowerCase().trim();
                      recentArtists.set(curA, (recentArtists.get(curA) || 0) + 3);
                    }

                    const MAX_ARTIST_FREQUENCY = 3; // Max times an artist can appear across queue+history
                    // Client-side dislike sets for double-filtering (safety net)
                    const dislikedIdsSet = new Set(st.dislikedTrackIds);
                    const dislikedArtistsSet = new Set(
                      st.dislikedTracksData.map(t => (t.artist || "").toLowerCase().trim()).filter(Boolean),
                    );
                    const dislikedGenresSet = new Set(
                      st.dislikedTracksData.map(t => (t.genre || "").toLowerCase().trim()).filter(Boolean),
                    );

                    const fresh = newTracks.filter(t => {
                      if (existingIds.has(t.id)) return false;
                      // Hard-exclude disliked tracks (by ID, artist, and genre)
                      if (dislikedIdsSet.has(t.id)) return false;
                      const ta = (t.artist || "").toLowerCase().trim();
                      if (ta && dislikedArtistsSet.has(ta)) return false;
                      const tg = (t.genre || "").toLowerCase().trim();
                      if (tg && dislikedGenresSet.has(tg)) return false;
                      // Artist frequency cap
                      if (ta && (recentArtists.get(ta) || 0) >= MAX_ARTIST_FREQUENCY) return false;
                      return true;
                    });

                    if (fresh.length === 0) return;
                    set({ queue: [...state.queue, ...fresh] });
                  })
                  .catch(() => {});
              }
              // Radio refill is async — we can't block here. Previously
              // this set nextIdx = 0 which caused "skip goes in circles"
              // bug: store played queue[0] (the first track of the
              // already-played queue) while the refill was in flight,
              // so the user heard the same first track again.
              //
              // Fix: DON'T wrap to 0. Instead, stop playback here and
              // let the radio refill (either from useWaveEngine auto-
              // refill effect or from skipTrack's fetchWaveTracksDedup)
              // append new tracks. The user will press play again, or
              // the auto-refill effect will resume playback once new
              // tracks arrive.
              //
              // This is a no-op return — nextIdx stays out of bounds,
              // the track = queue[nextIdx] check below will be undefined,
              // and we bail out without changing currentTrack.
              nextIdx = -1;
            } else {
              // V3 §27: smart queue — taste-aware continuation at queue end.
              // STOP now (honest, same as before) and fire the async refill;
              // when fresh tracks land, refillQueueSmart auto-advances and
              // resumes. If the refill cannot seed (no sc id / network) the
              // stop is final — never a frozen "playing" state.
              if (get().smartQueueAutoplay) {
                try { void get().refillQueueSmart(); } catch {}
              }
              set({ isPlaying: false });
              getAudioElement()?.pause();
              return;
            }
          }
        }

        // Skip broken tracks (shared rule nextIndex): shuffle may wrap; linear
        // order wraps only with repeat "all" — with repeat off the skip used to
        // wrap `% length` and restart the queue from the top.
        if (brokenTrackIds.has(queue[nextIdx]?.id)) {
          const isBroken = (i: number) => brokenTrackIds.has(queue[i]?.id);
          const skipped = nextIndex(queue.length, nextIdx, shuffle || repeat === "all" ? "all" : "off", isBroken);
          if (skipped === null) {
            set({ isPlaying: false });
            getAudioElement()?.pause();
            return;
          }
          nextIdx = skipped;
        }

        const track = queue[nextIdx];
        if (track) {
          set({
            currentTrack: track,
            queueIndex: nextIdx,
            progress: 0,
            duration: track.duration,
            isPlaying: true,
          });
          get().addToHistory(track);
        }
      },

      prevTrack: () => {
        // V3 §24: user-initiated Prev — mid-track restart is NOT a skip;
        // only an actual jump to the previous track carries the signal.
        const pre = get();
        if (!(pre.progress > 3)) {
          try { get().recordSkipFromTransition(); } catch {}
        }
        const { queue, queueIndex, progress } = get();
        if (progress > 3) {
          const audio = getAudioElement();
          if (audio) audio.currentTime = 0;
          set({ progress: 0 });
          return;
        }
        // Shared rule (previousAction): at the first item, wrap to the last
        // only with repeat "all"; otherwise restart (was: always wrapped).
        const action = previousAction(queue.length, queueIndex, get().repeat, progress);
        if (action.type === "restart") {
          const audio = getAudioElement();
          if (audio) audio.currentTime = 0;
          set({ progress: 0 });
          return;
        }
        const prevIdx = action.index;
        const track = queue[prevIdx];
        if (track) {
          set({
            currentTrack: track,
            queueIndex: prevIdx,
            progress: 0,
            duration: track.duration,
            isPlaying: true,
          });
          get().addToHistory(track);
        }
      },

      // ── V2 multi-provider engine actions ──
      dismissLowConfidencePick: () => set({ lowConfidencePick: null }),

      confirmSourcePick: (candidate) => {
        const pick = get().lowConfidencePick;
        if (!pick) return;
        set({ lowConfidencePick: null });
        // User explicitly chose this source — trust it (userPicked path).
        const track = buildPlayableTrack(pick.catalog, candidate);
        get().playTrack(track);
      },

      switchPlaybackSource: (candidate) => {
        const state = get();
        const cur = state.currentTrack;
        if (!cur || !cur.catalogId || !cur.catalogProvider) return;
        // Preserve position across the source switch (02:31 → 02:30).
        const position = state.progress > 1 ? state.progress : 0;
        const catalog: CatalogTrackInput = {
          provider: cur.catalogProvider,
          catalogId: cur.catalogId,
          title: cur.title,
          artist: cur.artist,
          album: cur.album || undefined,
          albumImage: cur.cover || undefined,
          durationSec: cur.duration,
        };
        const track = buildPlayableTrack(catalog, candidate);
        // Keep queue context: swap the current queue item in place.
        const qi = state.queue.findIndex((t) => t.id === cur.id);
        set({
          ...(qi >= 0 ? { queue: state.queue.map((t, i) => (i === qi ? track : t)) } : {}),
          ...(position > 1 ? { _seekOnLoad: { trackId: track.id, position } } : {}),
        });
        get().playTrack(track);
      },

      openSourceSwitcher: async () => {
        const st = get();
        const cur = st.currentTrack;
        if (!cur) return;
        // Same-source native tracks (plain SoundCloud search result, local file)
        // have no catalog identity to re-resolve — only catalog tracks can switch.
        if (!cur.catalogId || !cur.catalogProvider) {
          toast({ title: "Смена источника недоступна", description: "Трек воспроизводится из своего источника" });
          return;
        }
        set({ sourceSwitcher: { alternatives: [], currentId: cur.playbackId ? `${cur.playbackProvider}:${cur.playbackId}` : null } });
        const { fetchAlternatives } = await import("@/lib/playback/client");
        const alternatives = await fetchAlternatives(cur.catalogProvider, cur.catalogId, {
          title: cur.title,
          artist: cur.artist,
          album: cur.album || undefined,
          durationSec: cur.duration,
        });
        if (get().sourceSwitcher) {
          set({ sourceSwitcher: { alternatives, currentId: get().sourceSwitcher?.currentId ?? null } });
        }
      },

      closeSourceSwitcher: () => set({ sourceSwitcher: null }),

      // ── PlaybackEngine sync ──
      // DELETED in M3: PlaybackEngine + usePlaybackEngine were dead code.
      // useAudioEngine is the only playback engine. These no-op stubs are
      // kept for backwards-compat with any component that still destructures
      // them from the store; they will be removed once all call-sites are
      // audited.
      syncWithPlaybackEngine: () => {
        console.warn('[MQ Store] syncWithPlaybackEngine is a no-op (PlaybackEngine was deleted in M3)');
      },

      restorePlayback: async () => {
        console.warn('[MQ Store] restorePlayback is a no-op (PlaybackEngine was deleted in M3; useAudioEngine handles restore)');
        return false;
      },

      // ── A-B Repeat actions ──
      setAbRepeatPoint: (point) => {
        const st = get();
        const currentTime = st.progress;
        if (point === 'A') {
          // Set point A, clear point B
          set({ abRepeat: { pointA: currentTime, pointB: null, active: false } });
        } else {
          // Set point B — if pointA exists and currentTime > pointA, activate loop
          if (st.abRepeat.pointA !== null && currentTime > st.abRepeat.pointA) {
            set({ abRepeat: { pointA: st.abRepeat.pointA, pointB: currentTime, active: true } });
          }
        }
      },
      clearAbRepeat: () => {
        set({ abRepeat: { pointA: null, pointB: null, active: false } });
      },

      setPlaybackRate: (rate: number) => {
        const clamped = Math.max(0.25, Math.min(3.0, rate));
        set({ playbackRate: clamped });
        engineSetAudioPlaybackRate(clamped);
      },
});

